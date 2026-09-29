import { describe, expect, it } from 'vitest';
import type { ActiveExpedition } from '@/lib/expedition';
import { settleParties, tripCrew, type ActiveParty } from '@/lib/party';
import { attackWingVoyages, planWings, type CombinedAttack } from '@/lib/combinedAttack';

const MIN = 60_000;

/** Un groupe d'attaque combinée déjà lancé : il rentre chez lui, sans rapport. */
function wing(win: boolean, legs: { won: number; lost: number }, wingOf = 'atk'): ActiveParty {
  return {
    id: 'party_atk_p1',
    poi: { id: 'ctl', type: 'control', level: 5 } as ActiveExpedition['poi'],
    sentAt: 0,
    midAt: 60 * MIN,
    returnAt: (60 + legs.lost) * MIN,
    goldCost: 0,
    seed: 1,
    outcome: { win, party: { escort: ['a', 'b', 'c'] } } as unknown as ActiveExpedition['outcome'],
    wingOf,
    crew: ['b'],
    returnLegs: legs,
  };
}

describe('tripCrew — l’équipe d’UN voyage', () => {
  it('un groupe d’attaque combinée : SON équipe, pas tout le rapport', () => {
    expect(tripCrew(wing(true, { won: 10, lost: 40 }))).toEqual(['b']);
  });
  it('une équipe ordinaire : l’escorte du rapport', () => {
    const { crew: _crew, ...plain } = wing(true, { won: 10, lost: 40 });
    expect(tripCrew(plain)).toEqual(['a', 'b', 'c']);
  });
});

describe('settleParties — chaque groupe d’une attaque combinée rentre à son temps', () => {
  it('point pris : le retour du groupe raccourci à celui de ses membres qui rentrent', () => {
    const t = settleParties([wing(true, { won: 10, lost: 40 })], [], 61 * MIN, 30);
    expect(t.parties[0]!.returnAt).toBe(70 * MIN);
    expect(t.fresh).toEqual([]); // un compagnon ne dépose aucun rapport
  });
  it('point pris et tout le groupe en garnison : plus de voyage de retour', () => {
    const t = settleParties([wing(true, { won: 0, lost: 40 })], [], 61 * MIN, 30);
    expect(t.parties).toEqual([]);
  });
  it('assaut raté : le groupe rentre avec tout son monde, à son pas', () => {
    const t = settleParties([wing(false, { won: 10, lost: 40 })], [], 61 * MIN, 30);
    expect(t.parties[0]!.returnAt).toBe(100 * MIN);
  });
  it('avant l’arrivée, rien ne bouge (l’issue n’est pas trahie)', () => {
    const w = wing(true, { won: 10, lost: 40 });
    expect(settleParties([w], [], 59 * MIN, 30).changed).toBe(false);
  });
});

describe('attackWingVoyages — en attente, chaque groupe porte son retour pris/raté', () => {
  it('le retour estimé du groupe voyage avec lui', () => {
    const plan = planWings(
      [
        { originId: null, members: ['a'], hero: true, legMin: 30 },
        { originId: 'p1', members: ['b'], hero: false, legMin: 50 },
      ],
      0,
      0,
    );
    plan.wings[0]!.wonLegMin = 20;
    const a = {
      id: 'atk',
      poi: { id: 'ctl', type: 'control' },
      seed: 1,
      createdAt: 0,
      ...plan,
      playerLevel: 5,
      supplies: [],
    } as unknown as CombinedAttack;
    const v = attackWingVoyages([a], null);
    expect(v[0]!.voyage.returnLegs).toEqual({ won: 20, lost: 30 });
    expect(v[1]!.voyage.returnLegs).toBeUndefined();
    // chacun son retour : arrivée commune + SON trajet
    expect(v[0]!.voyage.returnAt).toBe(plan.midAt + 30 * MIN);
    expect(v[1]!.voyage.returnAt).toBe(plan.midAt + 50 * MIN);
  });
});
