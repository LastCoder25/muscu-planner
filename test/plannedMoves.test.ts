import { describe, expect, it } from 'vitest';
import {
  PLAN_MAX_DELAY_MS,
  makePlannedMove,
  makePlannedRecall,
  normalizePlanned,
  planDue,
  plannedCount,
  plannedMilitia,
  plannedOutings,
  plannedSeatsTo,
  plannedTransferIds,
  type PlannedMove,
} from '@/lib/plannedMoves';

const H = 3_600_000;
const sel = {
  champs: ['a', 'b'],
  militia: 2,
  transfers: [
    { fromId: 'forge', id: 'c' },
    { fromId: 'forge', id: 'mil:3' },
  ],
};

describe('⏳ renforts programmés', () => {
  it('un départ part à « maintenant + délai » et copie la sélection', () => {
    const m = makePlannedMove(sel, 'mine', 1000, 85 * 60_000);
    expect(m.departAt).toBe(1000 + 85 * 60_000);
    expect(m.toId).toBe('mine');
    expect(m.champs).toEqual(['a', 'b']);
    expect(m.champs).not.toBe(sel.champs);
    expect(m.transfers[0]).not.toBe(sel.transfers[0]);
    expect(plannedCount(m)).toBe(6);
  });

  it('le délai est borné : jamais dans le passé, jamais au-delà du maximum', () => {
    expect(makePlannedMove(sel, 'm', 0, -5).departAt).toBe(0);
    expect(makePlannedMove(sel, 'm', 0, 500 * H).departAt).toBe(PLAN_MAX_DELAY_MS);
  });

  it('seuls les départs échus partent, le plus ancien d’abord', () => {
    const list = [
      makePlannedMove(sel, 'x', 0, 3 * H),
      makePlannedMove(sel, 'y', 0, 1 * H),
      makePlannedMove(sel, 'z', 0, 5 * H),
    ];
    const { due, rest } = planDue(list, 3 * H);
    expect(due.map((m) => m.toId)).toEqual(['y', 'x']);
    expect(rest.map((m) => m.toId)).toEqual(['z']);
  });

  it('les réservations : miliciens, champions, membres d’autres lieux', () => {
    const list = [
      makePlannedMove(sel, 'mine', 0, H),
      makePlannedMove({ ...sel, militia: 1 }, 'x', 0, H),
    ];
    expect(plannedMilitia(list)).toBe(3);
    expect(plannedTransferIds(list)).toEqual(new Set(['c', 'mil:3']));
  });

  it('les places occupées sur le lieu visé : un milicien transféré n’est pas un champion', () => {
    const list = [makePlannedMove(sel, 'mine', 0, H), makePlannedMove(sel, 'autre', 0, H)];
    expect(plannedSeatsTo(list, 'mine')).toEqual({ champ: 3, total: 6 });
    expect(plannedSeatsTo(list, 'rien')).toEqual({ champ: 0, total: 0 });
  });

  it('les champions de la base sont « sortis » à l’heure du départ seulement', () => {
    const m = makePlannedMove(sel, 'mine', 0, 2 * H);
    const noChamp = makePlannedMove({ ...sel, champs: [] }, 'x', 0, H);
    expect(plannedOutings([m, noChamp])).toEqual([
      { sentAt: 2 * H, returnAt: 2 * H, escort: ['a', 'b'], hero: false },
    ]);
  });

  it('la relecture écarte le malformé et répare le partiel', () => {
    expect(normalizePlanned(null)).toEqual([]);
    const got = normalizePlanned([
      {
        id: 'ok',
        toId: 't',
        departAt: 9,
        militia: '2',
        champs: ['a', 3],
        transfers: [{ fromId: 'f' }],
      },
      { id: 'x', toId: 't' },
      { toId: 't', departAt: 1 },
      'rien',
    ]);
    expect(got).toEqual<PlannedMove[]>([
      { id: 'ok', toId: 't', createdAt: 9, departAt: 9, champs: ['a'], militia: 2, transfers: [] },
    ]);
  });
});

describe('🏠⏳ retour programmé (rappel d’une garnison)', () => {
  const r = makePlannedRecall('ctl_mine', ['a', 'mil:1'], false, 1000, 2 * H);
  it('part à l’heure dite, borné à 48 h', () => {
    expect(r.departAt).toBe(1000 + 2 * H);
    expect(makePlannedRecall('ctl_mine', ['a'], true, 0, 99 * H).departAt).toBe(PLAN_MAX_DELAY_MS);
  });
  it('réserve les membres ramenés, sans prendre de place ni sortir de la base', () => {
    expect(plannedTransferIds([r])).toEqual(new Set(['a', 'mil:1']));
    expect(plannedSeatsTo([r], 'ctl_mine')).toEqual({ champ: 0, total: 0 });
    expect(plannedMilitia([r])).toBe(0);
    expect(plannedOutings([r])).toEqual([]);
    expect(plannedCount(r)).toBe(2);
  });
  it('survit à la relecture (JSONB), le rappel complet compris', () => {
    const w = makePlannedRecall('ctl_mine', ['a'], true, 0, H);
    expect(normalizePlanned(JSON.parse(JSON.stringify([r, w])))).toEqual([r, w]);
    expect(normalizePlanned([{ ...r, recall: [3, 'a'] }])[0]!.recall).toEqual(['a']);
  });
});

describe('🦸 le héros dans un renfort programmé (2026-10-08)', () => {
  const withHero = { champs: ['a'], militia: 1, transfers: [], hero: true };
  it('le départ programmé emporte le héros, qui prend 2 places de champion', () => {
    const m = makePlannedMove(withHero, 'mine', 0, H);
    expect(m.hero).toBe(true);
    expect(plannedSeatsTo([m], 'mine')).toEqual({ champ: 3, total: 4 });
    expect(plannedCount(m)).toBe(3);
  });
  it('relu depuis la base, le héros reste ; sans lui, aucun champ', () => {
    const m = makePlannedMove(withHero, 'mine', 0, H);
    expect(normalizePlanned([m])[0]!.hero).toBe(true);
    const sans = makePlannedMove({ ...withHero, hero: false }, 'mine', 0, H);
    expect('hero' in normalizePlanned([sans])[0]!).toBe(false);
  });
});
