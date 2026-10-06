// 🔙⚔️🧭 Demi-tour d'une attaque combinée (demandé : « ça renvoie toutes les troupes chez elles »).
import { describe, expect, it } from 'vitest';
import { recallAttack, recallCombinedGroup } from '@/lib/combinedRecall';
import { recallBlocker, settleParties, type ActiveParty } from '@/lib/party';
import type { CombinedAttack, AttackWing } from '@/lib/combinedAttack';
import type { Poi } from '@/lib/expedition';

const M = 60_000;
const poi: Poi = {
  id: 'p1',
  type: 'camp',
  level: 20,
  x: 100,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
};
const point: Poi = { ...poi, id: 'ctl', type: 'control', x: 150, y: 120 };
const outcome = {
  win: true,
  gold: 100,
  party: { escort: ['a', 'b', 'c'], hurt: ['a'], lightHurt: [], xp: { a: 5 } },
} as never;

/** Une attaque lancée : groupe principal (base, a) + compagnon (point, b c). Arrivée à 60 min. */
const launched = (): ActiveParty[] => [
  {
    poi,
    sentAt: 0,
    midAt: 60 * M,
    returnAt: 120 * M,
    goldCost: 0,
    seed: 7,
    outcome,
    crew: ['a'],
    id: 'g_base',
  },
  {
    poi,
    sentAt: 20 * M,
    midAt: 60 * M,
    returnAt: 100 * M,
    goldCost: 0,
    seed: 7,
    outcome,
    crew: ['b', 'c'],
    wingOf: 'atk',
    homeId: 'ctl',
    id: 'g_ctl',
  },
];

describe('🔙 une attaque combinée lancée fait demi-tour en entier', () => {
  it('un groupe seul reste refusé, mais le groupe entier passe', () => {
    const [main] = launched();
    expect(recallBlocker(main!, 30 * M)).toBe('combined');
    expect(recallBlocker(main!, 30 * M, { group: true })).toBeNull();
  });
  it('tous ses voyages rebroussent chemin, chacun selon le chemin qu’il a fait', () => {
    const all = launched();
    const pairs = recallCombinedGroup(all[1]!, all, 30 * M);
    expect(Array.isArray(pairs)).toBe(true);
    const backs = (pairs as [ActiveParty, ActiveParty][]).map(([, b]) => b);
    expect(backs).toHaveLength(2);
    expect(backs.every((b) => b.recalled && b.reported)).toBe(true);
    const byId = new Map(backs.map((b) => [b.id, b]));
    expect(byId.get('g_base')!.returnAt).toBe(60 * M); // 30 min marchées
    expect(byId.get('g_ctl')!.returnAt).toBe(40 * M); // 10 min marchées
    expect(byId.get('g_ctl')!.homeId).toBe('ctl'); // il rentre sur son point
    // Rien gagné, rien perdu : aucun rapport, aucun blessé.
    expect(settleParties(backs, [], 200 * M, 30).fresh).toEqual([]);
    expect(backs.every((b) => b.outcome.party!.hurt.length === 0)).toBe(true);
  });
  it('trop tard une fois le rendez-vous atteint', () => {
    const all = launched();
    expect(recallCombinedGroup(all[0]!, all, 60 * M)).toBe('arrived');
  });
});

const wing = (over: Partial<AttackWing>): AttackWing => ({
  originId: null,
  members: [],
  hero: false,
  legMin: 60,
  departAt: 0,
  returnAt: 120 * M,
  state: 'waiting',
  ...over,
});
const pending = (wings: AttackWing[]): CombinedAttack => ({
  id: 'atk',
  poi,
  seed: 7,
  createdAt: 0,
  arriveAt: 60 * M,
  midAt: 60 * M,
  playerLevel: 20,
  supplies: [],
  wings,
});

describe('🔙 une attaque combinée en préparation fait demi-tour', () => {
  const a = pending([
    wing({
      originId: null,
      members: ['a'],
      hero: true,
      state: 'gone',
      gone: ['a'],
      heroGone: true,
    }),
    wing({ originId: 'ctl', members: ['b', 'c'], departAt: 40 * M, returnAt: 80 * M }),
  ]);
  it('ceux qui attendent restent chez eux, les partis rentrent', () => {
    const r = recallAttack(a, { pois: [point] }, 30 * M);
    if (r === 'arrived') throw new Error('attendu');
    expect(r.release).toEqual([{ ids: ['b', 'c'], from: 80 * M }]);
    expect(r.trips).toEqual([]);
    expect(r.heroTrip!.returnAt).toBe(60 * M);
    expect(r.heroTrip!.recalled).toBe(true);
    expect(r.moved).toEqual([{ ids: ['a'], from: 120 * M, to: 60 * M }]);
    expect(r.refund).toBe(false);
  });
  it('un groupe parti d’un point y retourne (homeId), sans le héros', () => {
    const b = pending([
      wing({ originId: 'ctl', members: ['b'], state: 'gone', gone: ['b'], departAt: 10 * M }),
      wing({ originId: null, members: ['a'], departAt: 50 * M }),
    ]);
    const r = recallAttack(b, { pois: [point] }, 30 * M);
    if (r === 'arrived') throw new Error('attendu');
    expect(r.heroTrip).toBeNull();
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0]!.homeId).toBe('ctl');
    expect(r.trips[0]!.returnAt).toBe(50 * M);
    expect(r.trips[0]!.outcome.party!.escort).toEqual(['b']);
    expect(settleParties(r.trips, [], 200 * M, 30).fresh).toEqual([]);
  });
  it('personne encore parti : les consommables reviennent', () => {
    const c = pending([
      wing({ members: ['a'], departAt: 40 * M }),
      wing({ originId: 'ctl', members: ['b'] }),
    ]);
    const r = recallAttack(c, null, 5 * M);
    if (r === 'arrived') throw new Error('attendu');
    expect(r.refund).toBe(true);
    expect(r.release).toHaveLength(2);
  });
  it('les groupes abandonnés ne comptent pas, et le rendez-vous passé est refusé', () => {
    const d = pending([wing({ state: 'dropped', members: ['z'] }), wing({ members: ['a'] })]);
    const r = recallAttack(d, null, 5 * M);
    if (r === 'arrived') throw new Error('attendu');
    expect(r.release).toEqual([{ ids: ['a'], from: 120 * M }]);
    expect(recallAttack(d, null, 60 * M)).toBe('arrived');
  });
});
