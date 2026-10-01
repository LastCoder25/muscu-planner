import { describe, expect, it } from 'vitest';
import {
  attackBoostPlan,
  boostAttack,
  boostChoices,
  boostVoyage,
  combinedSiblings,
  voyageBoostPlan,
} from '@/lib/speedBoost';
import {
  BOOST_IDS,
  BOOST_MIN,
  pickSupply,
  rollSupplyDrop,
  SUPPLIES,
  SUPPLY_IDS,
  SUPPLY_WEIGHT,
  supplyUselessWhy,
} from '@/lib/supplies';
import { planWings, wingDeparture, type CombinedAttack } from '@/lib/combinedAttack';
import type { Poi } from '@/lib/expedition';

const M = 60_000;
const poi = (type: Poi['type'] = 'camp', id = 'p1') => ({ id, type }) as Poi;
const trip = (
  o: Partial<{ midAt: number; returnAt: number; dwellMs: number; type: Poi['type'] }> = {},
) => ({
  poi: poi(o.type),
  sentAt: 0,
  midAt: o.midAt ?? 60 * M,
  returnAt: o.returnAt ?? 120 * M,
  ...(o.dwellMs ? { dwellMs: o.dwellMs } : {}),
});

describe('⚡ consommables de vitesse', () => {
  it('les cinq boosts existent, ne partent pas avec un voyage et valent 5/10/15/30/60 min', () => {
    expect(BOOST_IDS.map((id) => BOOST_MIN[id])).toEqual([5, 10, 15, 30, 60]);
    for (const id of BOOST_IDS) {
      expect(SUPPLY_IDS).toContain(id);
      expect(SUPPLIES[id].voyage).toBe(false);
      expect(
        supplyUselessWhy(id, { type: 'camp', fights: true, harvest: false, hero: true, escort: 2 }),
      ).not.toBeNull();
    }
  });
  it('plus un boost est long, plus il est rare ; les autres consommables restent équiprobables', () => {
    const w = BOOST_IDS.map((id) => SUPPLY_WEIGHT[id]);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1]!);
    expect(SUPPLY_WEIGHT.rations).toBe(SUPPLY_WEIGHT.sceau);
  });
  it('le tirage suit les poids (un seul tirage uniforme)', () => {
    const n: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const id = pickSupply((i + 0.5) / N);
      n[id] = (n[id] ?? 0) + 1;
    }
    const total = SUPPLY_IDS.reduce((t, id) => t + SUPPLY_WEIGHT[id], 0);
    for (const id of SUPPLY_IDS) expect(n[id]! / N).toBeCloseTo(SUPPLY_WEIGHT[id] / total, 2);
  });
  it('le butin d’un voyage peut rendre un boost', () => {
    let seen = false;
    for (let s = 1; s < 4000 && !seen; s++)
      seen = Object.keys(rollSupplyDrop(s)).some((k) => (BOOST_IDS as string[]).includes(k));
    expect(seen).toBe(true);
  });
});

describe('⚡ voyage', () => {
  it('à l’aller, l’arrivée et le retour avancent du même gain', () => {
    const v = trip();
    const p = voyageBoostPlan(v, 10, 30 * M);
    expect(p).toEqual({ phase: 'go', gainMs: 10 * M, lostMs: 0 });
    const b = boostVoyage(v, p as never);
    expect(b.midAt).toBe(50 * M);
    expect(b.returnAt).toBe(110 * M);
  });
  it('minutes perdues : un boost plus long que l’étape n’en rend que le reste', () => {
    const p = voyageBoostPlan(trip(), 60, 50 * M);
    expect(p).toEqual({ phase: 'go', gainMs: 10 * M, lostMs: 50 * M });
  });
  it('la fouille sur place compte : l’aller finit à l’arrivée, pas au rapport', () => {
    const v = trip({ midAt: 60 * M, dwellMs: 10 * M });
    expect(voyageBoostPlan(v, 30, 40 * M)).toEqual({ phase: 'go', gainMs: 10 * M, lostMs: 20 * M });
    expect(voyageBoostPlan(v, 30, 55 * M)).toBe('onSite');
  });
  it('au retour, seul le retour avance, jamais avant maintenant', () => {
    const v = trip();
    const p = voyageBoostPlan(v, 60, 100 * M);
    expect(p).toEqual({ phase: 'back', gainMs: 20 * M, lostMs: 40 * M });
    const b = boostVoyage(v, p as never);
    expect(b.midAt).toBe(60 * M);
    expect(b.returnAt).toBe(100 * M);
  });
  it('un voyage fini ou une interception ne se pressent pas', () => {
    expect(voyageBoostPlan(trip(), 5, 130 * M)).toBe('done');
    expect(voyageBoostPlan(trip({ type: 'warband' }), 5, 10 * M)).toBe('intercept');
  });
  it('plusieurs boosts s’enchaînent', () => {
    let v = trip();
    for (const min of [15, 15]) v = boostVoyage(v, voyageBoostPlan(v, min, 10 * M) as never);
    expect(v.midAt).toBe(30 * M);
  });
});

describe('⚔️🧭 attaque combinée (option B)', () => {
  function attack(now: number): CombinedAttack {
    const plan = planWings(
      [
        { originId: null, members: ['a1'], hero: false, legMin: 60 },
        { originId: 'fort', members: ['a2'], hero: false, legMin: 55 },
      ],
      now,
      0,
    );
    return { id: 'x', poi: poi(), seed: 1, createdAt: now, playerLevel: 10, supplies: [], ...plan };
  }
  it('toute l’attaque arrive plus tôt ; le groupe proche part tout de suite, personne ne double personne', () => {
    const a0 = attack(0);
    // Le groupe du fort part à 5 min ; boost de 10 min à t = 0.
    const p = attackBoostPlan(a0, 10, 0);
    expect(p).toEqual({ phase: 'go', gainMs: 10 * M, lostMs: 0 });
    const { attack: a, moved } = boostAttack(a0, 10 * M, 0);
    expect(a.arriveAt).toBe(50 * M);
    expect(a.wings[0]!.departAt).toBe(0);
    expect(a.wings[1]!.departAt).toBe(0); // partait à 5 min : part maintenant
    // Tous arrivent ENSEMBLE, et le retour garde la durée de chaque trajet.
    for (const w of a.wings) expect(w.returnAt).toBe(a.midAt + w.legMin * M);
    expect(moved).toEqual([
      { members: ['a1'], from: 120 * M, to: 110 * M },
      { members: ['a2'], from: 115 * M, to: 105 * M },
    ]);
  });
  it('les réservations suivent : le groupe part encore au départ avancé', () => {
    const { attack: a } = boostAttack(attack(0), 10 * M, 0);
    const w = a.wings[0]!;
    const d = wingDeparture(w, {
      now: 0,
      map: null,
      advs: [{ id: 'a1', busyUntil: w.returnAt } as never],
      raidAt: null,
      heroWoundedAt: () => false,
    });
    expect(d).toEqual({ members: ['a1'], hero: false });
  });
  it('une fois arrivée, plus rien à presser', () => {
    expect(attackBoostPlan(attack(0), 5, 60 * M)).toBe('onSite');
  });
  it('les groupes partis sont liés par lieu, graine et rapport', () => {
    const base = { poi: poi(), seed: 7, midAt: 60 * M, crew: ['a'] };
    const b = { ...base, crew: ['b'] };
    const other = { ...base, seed: 8, crew: ['c'] };
    const plain = { ...base, crew: undefined };
    expect(combinedSiblings(base, [base, b, other, plain])).toEqual([b]);
    expect(combinedSiblings(plain, [base, b, plain])).toEqual([]);
  });
});

describe('⚡ choix proposés', () => {
  it('seulement les boosts possédés, chiffrés ; un voyage bloqué le dit', () => {
    const v = trip();
    const r = boostChoices({ boost5: 2, boost60: 1, rations: 3 }, (m) =>
      voyageBoostPlan(v, m, 50 * M),
    );
    expect(r).toEqual({
      choices: [
        { id: 'boost5', count: 2, minutes: 5, gainMs: 5 * M, lostMs: 0 },
        { id: 'boost60', count: 1, minutes: 60, gainMs: 10 * M, lostMs: 50 * M },
      ],
    });
    expect(boostChoices({ boost5: 1 }, (m) => voyageBoostPlan(v, m, 130 * M))).toEqual({
      block: 'done',
    });
  });
});
