import { describe, expect, it } from 'vitest';
import { controlReturnNote, controlReturnValue } from '@/lib/poiFacts';
import { formatDurationMin } from '@/lib/duration';
import { tripLegs, type ActiveExpedition } from '@/lib/expedition';
import {
  assaultStayers,
  rescheduleReturners,
  settleParties,
  shortenWonReturn,
  type ActiveParty,
} from '@/lib/party';
import type { Adventurer } from '@/lib/adventurers';

const MIN = 60_000;

describe('controlReturnNote — qui rentre d’un assaut sur un point fixe', () => {
  it('après une défaite, tout le monde rentre en la durée de l’aller', () => {
    expect(controlReturnNote(95, 40, false, 1, 3)).toContain(
      `tout le monde en ${formatDurationMin(95)} si l'assaut échoue`,
    );
  });
  it('pris sans surplus ni héros : tous restent', () => {
    expect(controlReturnNote(60, 0, false, 3, 3)).toMatch(/pris, tous y restent$/);
  });
  it('le héros rentre après une prise, à SON pas', () => {
    expect(controlReturnNote(60, 25, true, 1, 3)).toMatch(
      new RegExp(`pris, le héros rentre en ${formatDurationMin(25)}$`),
    );
  });
  it('les champions au-delà des places rentrent', () => {
    expect(controlReturnNote(60, 60, false, 5, 3)).toContain('pris, 2 champions en trop rentrent');
    expect(controlReturnNote(60, 60, false, 4, 3)).toContain('pris, 1 champion en trop rentre en');
  });
  it('héros et surplus ensemble', () => {
    expect(controlReturnNote(60, 50, true, 4, 3)).toContain(
      'le héros et 1 champion en trop rentrent',
    );
  });
  it('🏯 un lieu sans place (citadelle) : personne n’y reste, ni « pris » ni « en trop »', () => {
    const n = controlReturnNote(60, 60, true, 3, 0);
    expect(n).toContain('tout le monde');
    expect(n).not.toMatch(/pris|en trop|restent/);
  });
});

describe('controlReturnValue — la pastille « Retour »', () => {
  it('une seule durée quand les deux retours sont égaux', () => {
    expect(controlReturnValue(60, 60)).toBe(formatDurationMin(60));
  });
  it('pris / raté quand le retour après une prise est plus court', () => {
    expect(controlReturnValue(60, 25)).toBe(`${formatDurationMin(25)} / ${formatDurationMin(60)}`);
  });
  it('« — » quand personne ne rentre après une prise', () => {
    expect(controlReturnValue(60, 0)).toBe(`— / ${formatDurationMin(60)}`);
  });
});

describe('assaultStayers — qui reste en garnison', () => {
  it('les choisis d’abord, coupés aux places', () => {
    expect(assaultStayers(['a', 'b', 'c'], ['c', 'a'], 1)).toEqual(['c']);
  });
  it('sans choix, l’escorte dans l’ordre', () => {
    expect(assaultStayers(['a', 'b', 'c'], undefined, 2)).toEqual(['a', 'b']);
  });
  it('un choisi hors de l’escorte est ignoré', () => {
    expect(assaultStayers(['a', 'b'], ['z'], 1)).toEqual(['a']);
  });
});

function voyage(win: boolean, legs?: { won: number; lost: number }): ActiveExpedition {
  return {
    poi: { id: 'p' } as ActiveExpedition['poi'],
    sentAt: 0,
    midAt: 60 * MIN,
    returnAt: 120 * MIN,
    goldCost: 0,
    seed: 1,
    outcome: { win } as ActiveExpedition['outcome'],
    ...(legs ? { returnLegs: legs } : {}),
  };
}

describe('shortenWonReturn — le retour raccourci à la prise', () => {
  it('pris : le retour suit ceux qui rentrent', () => {
    expect(shortenWonReturn(voyage(true, { won: 20, lost: 60 })).returnAt).toBe(80 * MIN);
  });
  it('pris sans personne qui rentre : le voyage finit à l’arrivée', () => {
    expect(shortenWonReturn(voyage(true, { won: 0, lost: 60 })).returnAt).toBe(60 * MIN);
  });
  it('raté : le retour de toute l’équipe reste', () => {
    const v = voyage(false, { won: 20, lost: 60 });
    expect(shortenWonReturn(v)).toBe(v);
  });
  it('pas un assaut : inchangé', () => {
    const v = voyage(true);
    expect(shortenWonReturn(v)).toBe(v);
  });
});

describe('rescheduleReturners — les champions qui rentrent suivent', () => {
  const advs = [
    { id: 'a', busyUntil: 120 * MIN },
    { id: 'b', busyUntil: 0 },
    { id: 'c', busyUntil: 120 * MIN },
  ] as Adventurer[];
  it('seuls ceux encore en route sur CE voyage changent', () => {
    const out = rescheduleReturners(advs, ['a', 'b'], 120 * MIN, 80 * MIN);
    expect(out.map((a) => a.busyUntil)).toEqual([80 * MIN, 0, 120 * MIN]);
  });
  it('même référence quand rien ne change', () => {
    expect(rescheduleReturners(advs, ['a'], 120 * MIN, 120 * MIN)).toBe(advs);
  });
});

describe('settleParties — un groupe qui prend le point rentre plus tôt', () => {
  const party = (win: boolean): ActiveParty => ({
    ...voyage(win, { won: 20, lost: 60 }),
    id: 'g',
    poi: { id: 'p', type: 'control', level: 5 } as ActiveExpedition['poi'],
    outcome: {
      win,
      gold: 0,
      party: { escort: ['a'] },
    } as unknown as ActiveExpedition['outcome'],
  });
  it('pris : raccourci au dépôt du rapport', () => {
    const t = settleParties([party(true)], [], 61 * MIN, 30);
    expect(t.parties[0]!.returnAt).toBe(80 * MIN);
  });
  it('raté : inchangé', () => {
    const t = settleParties([party(false)], [], 61 * MIN, 30);
    expect(t.parties[0]!.returnAt).toBe(120 * MIN);
  });
});

describe('tripLegs — l’aller et le retour sur la tuile', () => {
  it('à l’aller : le temps restant jusqu’au lieu et le retour', () => {
    const l = tripLegs(voyage(true), 30 * MIN)!;
    expect(l.go).toBe(formatDurationMin(30));
    expect(l.back).toBe(formatDurationMin(60));
  });
  it('un assaut à l’aller montre LES DEUX retours (l’issue n’est pas trahie)', () => {
    const l = tripLegs(voyage(true, { won: 20, lost: 60 }), 30 * MIN)!;
    expect(l.back).toBe(`${formatDurationMin(20)}/${formatDurationMin(60)}`);
    expect(tripLegs(voyage(false, { won: 20, lost: 60 }), 30 * MIN)!.back).toBe(l.back);
  });
  it('« — » quand personne ne rentrera après une prise', () => {
    expect(tripLegs(voyage(true, { won: 0, lost: 60 }), 30 * MIN)!.back).toBe(
      `—/${formatDurationMin(60)}`,
    );
  });
  it('sur le retour : plus d’aller, le temps restant', () => {
    const l = tripLegs(voyage(true), 90 * MIN)!;
    expect(l.go).toBeNull();
    expect(l.back).toBe(formatDurationMin(30));
  });
  it('rentré : rien', () => {
    expect(tripLegs(voyage(true), 120 * MIN)).toBeNull();
  });
});
