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
  CONSUMABLE_IDS,
  SUPPLY_IDS,
  pickSupply,
  rollSupplyDrop,
  SUPPLIES,
  SUPPLY_WEIGHT,
  supplyUselessWhy,
} from '@/lib/supplies';
import {
  planWings,
  wingDeparture,
  wingReturnLegs,
  type CombinedAttack,
} from '@/lib/combinedAttack';
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
  it('le tirage de consommable suit les poids, et ne rend jamais un boost', () => {
    const n: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const id = pickSupply((i + 0.5) / N);
      n[id] = (n[id] ?? 0) + 1;
    }
    for (const id of BOOST_IDS) expect(n[id]).toBeUndefined();
    const total = CONSUMABLE_IDS.reduce((t, id) => t + SUPPLY_WEIGHT[id], 0);
    for (const id of CONSUMABLE_IDS) expect(n[id]! / N).toBeCloseTo(SUPPLY_WEIGHT[id] / total, 2);
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
    expect(p).toEqual({ phase: 'go', gainMs: 10 * M, goMs: 10 * M, backMs: 0, lostMs: 0 });
    const b = boostVoyage(v, p as never);
    expect(b.midAt).toBe(50 * M);
    expect(b.returnAt).toBe(110 * M);
  });
  it('ce que l’aller n’absorbe pas raccourcit le retour (« aller de 3 min, boost de 5 »)', () => {
    const v = trip();
    const p = voyageBoostPlan(v, 60, 50 * M);
    expect(p).toEqual({ phase: 'go', gainMs: 60 * M, goMs: 10 * M, backMs: 50 * M, lostMs: 0 });
    const b = boostVoyage(v, p as never);
    expect(b.midAt).toBe(50 * M); // arrivée tout de suite
    expect(b.returnAt).toBe(60 * M); // retour de 60 min réduit à 10
  });
  it('minutes perdues : seulement au-delà de l’aller ET du retour', () => {
    const p = voyageBoostPlan(trip(), 90, 50 * M);
    expect(p).toEqual({
      phase: 'go',
      gainMs: 70 * M,
      goMs: 10 * M,
      backMs: 60 * M,
      lostMs: 20 * M,
    });
    const b = boostVoyage(trip(), p as never);
    expect(b.returnAt).toBe(b.midAt); // jamais un retour plus court que zéro
  });
  it('les retours d’un assaut (recalculés à l’arrivée) gardent le raccourci', () => {
    const v = { ...trip(), returnLegs: { won: 20, lost: 60 } };
    const b = boostVoyage(v, voyageBoostPlan(v, 30, 50 * M) as never);
    expect(b.returnLegs).toEqual({ won: 0, lost: 40 });
  });
  it('un groupe lié au retour plus court n’est raccourci que de son retour', () => {
    const v = trip({ returnAt: 70 * M }); // retour de 10 min
    const b = boostVoyage(v, { phase: 'go', goMs: 10 * M, backMs: 50 * M });
    expect(b.returnAt).toBe(b.midAt);
  });
  it('la fouille sur place compte : l’aller finit à l’arrivée, pas au rapport', () => {
    const v = trip({ midAt: 60 * M, dwellMs: 10 * M });
    expect(voyageBoostPlan(v, 30, 40 * M)).toEqual({
      phase: 'go',
      gainMs: 30 * M,
      goMs: 10 * M,
      backMs: 20 * M,
      lostMs: 0,
    });
    expect(voyageBoostPlan(v, 30, 55 * M)).toBe('onSite');
  });
  it('au retour, seul le retour avance, jamais avant maintenant', () => {
    const v = trip();
    const p = voyageBoostPlan(v, 60, 100 * M);
    expect(p).toEqual({ phase: 'back', gainMs: 20 * M, goMs: 0, backMs: 20 * M, lostMs: 40 * M });
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
    expect(p).toEqual({ phase: 'go', gainMs: 10 * M, goMs: 10 * M, backMs: 0, lostMs: 0 });
    const { attack: a, moved } = boostAttack(a0, p as never, 0);
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
    const { attack: a } = boostAttack(attack(0), { goMs: 10 * M, backMs: 0 }, 0);
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
  it('un groupe dont l’heure de départ est passée ne part jamais PLUS TARD', () => {
    const a0 = attack(0);
    // Le fort devait partir à 5 min ; à 7 min le tick n'est pas encore passé.
    const { attack: a } = boostAttack(a0, { goMs: 1 * M, backMs: 0 }, 7 * M);
    expect(a.wings[1]!.departAt).toBe(5 * M);
    expect(a.wings[1]!.returnAt).toBe(a0.wings[1]!.returnAt - 1 * M);
  });
  it('le reste d’un boost raccourcit le retour de chaque groupe, et le relaunch le garde', () => {
    const a0 = attack(0);
    const p = attackBoostPlan(a0, 70, 0);
    expect(p).toEqual({ phase: 'go', gainMs: 70 * M, goMs: 60 * M, backMs: 10 * M, lostMs: 0 });
    const { attack: a } = boostAttack(a0, p as never, 0);
    expect(a.arriveAt).toBe(0);
    for (const w of a.wings) {
      expect(w.returnAt).toBe(a.midAt + (w.legMin - 10) * M);
      expect(w.backCutMs).toBe(10 * M);
    }
    expect(wingReturnLegs(a.wings[0]!, 30)).toEqual({ won: 20, lost: 50 });
    expect(wingReturnLegs({ legMin: 60 }, 30)).toEqual({ won: 30, lost: 60 });
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
        { id: 'boost60', count: 1, minutes: 60, gainMs: 60 * M, lostMs: 0 },
      ],
    });
    expect(boostChoices({ boost5: 1 }, (m) => voyageBoostPlan(v, m, 130 * M))).toEqual({
      block: 'done',
    });
  });
});
