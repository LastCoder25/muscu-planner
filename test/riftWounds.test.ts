import { describe, it, expect } from 'vitest';
import {
  incursionBodies,
  incursionMana,
  incursionPaidShare,
  resolveIncursion,
  riftClearMana,
  riftClearManaLeft,
  riftPopulation,
  riftSlainOf,
  simulateIncursion,
} from '@/lib/rift';
import { EXPE, markRiftWounds, restoreUnvanquished, type Poi, type ExpeditionMap } from '@/lib/expedition';
import { refAdvGear, refChampionAdv, partyAllies, type EscortKit } from '@/lib/caravan';
import { fuseUnits } from '@/lib/skirmish';
import { buildRiftStage, riftStageInputOf } from '@/lib/riftStage';
import { type Adventurer } from '@/lib/adventurers';

/**
 * ⚔️ CE QU'ON A TUÉ DANS UNE FAILLE RESTE MORT (v1.65.9). Sans ça, perdre en boucle sur la
 * même faille repayait les mêmes monstres à chaque fois : une mine de mana sans fond.
 */

const RIFT_MS = EXPE.lifespanMs.rift;
const at = (days: number) => Math.round((days / 7) * RIFT_MS);
const rift = (over: Partial<Poi> = {}): Poi => ({
  id: 'rift_w',
  type: 'rift',
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: RIFT_MS,
  ...over,
});
const team = (n: number, level: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(level, i),
    id: `adv_${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = (level: number, n: number): EscortKit => ({ talents: [], advGear: refAdvGear(level, n) });
const mapOf = (p: Poi): ExpeditionMap => ({ pois: [p] }) as unknown as ExpeditionMap;

function incursion(poi: Poi, n: number, seed: number, now: number) {
  const escort = team(n, poi.level);
  return resolveIncursion({
    poi,
    escort,
    road: road(poi.level, n),
    hero: null,
    seed,
    now,
    pantheonLevel: poi.level,
  });
}

/** Rejoue des incursions sur la MÊME faille en inscrivant chaque rapport, comme le store. */
function loop(n: number, tries: number, now: number) {
  let poi = rift();
  let total = 0;
  let closed = false;
  for (let s = 0; s < tries && !closed; s++) {
    const out = incursion(poi, n, 1000 + s * 17, now);
    total += out.mana ?? 0;
    closed = out.win;
    const map = markRiftWounds(mapOf(poi), [{ poi, midAt: now, returnAt: now, outcome: out }], now);
    poi = map.pois[0]!;
  }
  return { total, closed, poi };
}

describe('⚔️ une faille entamée', () => {
  it('ne rend jamais plus que sa fermeture, même en perdant en boucle', () => {
    // Un champion seul ne ferme pas une faille mûre (0 % mesuré) : il ne fait que perdre.
    const r = loop(1, 40, at(7));
    expect(r.closed).toBe(false);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThanOrEqual(riftClearMana(rift()));
  });

  it('paie la différence : un second échec identique ne rapporte plus rien', () => {
    const poi = rift();
    const out1 = incursion(poi, 1, 77, at(7));
    expect(out1.mana).toBeGreaterThan(0);
    const after = markRiftWounds(
      mapOf(poi),
      [{ poi, midAt: at(7), returnAt: at(7), outcome: out1 }],
      at(7),
    ).pois[0]!;
    expect(after.riftSlain).toBe(out1.party!.slain);
    // Un groupe trop faible pour tuer qui que ce soit de plus : il ne touche rien.
    const run = simulateIncursion(
      fuseUnits(partyAllies(team(1, 1), road(1, 1), null), 'G'),
      after,
      at(7),
      5,
    );
    expect(run.killed).toBe(0);
    expect(incursionMana(run, after.level, after.riftPaid ?? 0)).toBe(0);
  });

  it('reprend après les morts : les premiers monstres ne reviennent pas', () => {
    const pop = riftPopulation(rift(), at(7));
    const p = rift({ riftSlain: 5 });
    expect(riftSlainOf(p, pop)).toBe(5);
    expect(incursionBodies(p, at(7)).length).toBe(pop - 5 + 1); // + le gardien
    const run = simulateIncursion(fuseUnits(partyAllies(team(3, 26), road(26, 3), null), 'G'), p, at(7), 9);
    expect(run.start).toBe(5);
    expect(run.killed).toBeLessThanOrEqual(pop - 5);
    expect(run.foeTrail.length).toBeLessThanOrEqual(pop - 5);
  });

  it('la fermeture ne paie que le reste, et la somme vaut une fermeture', () => {
    const full = riftClearMana(rift());
    const half = rift({ riftSlain: 6, riftPaid: 0.5 });
    const left = riftClearManaLeft(half);
    expect(left).toBeLessThan(full);
    expect(left).toBeGreaterThan(0);
    const paidSoFar = full - left;
    expect(paidSoFar).toBeGreaterThan(0);
    expect(riftClearManaLeft(rift())).toBe(full);
  });

  it('la part versée ne recule jamais, même quand la faille engendre', () => {
    const run = { cleared: false, killed: 0, start: 3, population: 12 } as Parameters<
      typeof incursionPaidShare
    >[0];
    // 3 morts sur 12 = 25 %, mais on avait déjà touché 40 % sur une faille plus jeune.
    expect(incursionPaidShare(run, 0.4)).toBe(0.4);
    expect(incursionPaidShare({ ...run, killed: 6 }, 0.4)).toBe(0.75);
  });

  it("s'inscrit au rapport, idempotent, et jamais sur une victoire ni avant l'arrivée", () => {
    const poi = rift();
    const out = incursion(poi, 1, 77, at(7));
    const v = { poi, midAt: at(7), returnAt: at(7) + 1000, outcome: out };
    const m1 = markRiftWounds(mapOf(poi), [v], at(7));
    const m2 = markRiftWounds(m1, [v], at(7));
    expect(m2.pois[0]!.riftSlain).toBe(m1.pois[0]!.riftSlain);
    expect(m2).toBe(m1);
    expect(markRiftWounds(mapOf(poi), [v], at(7) - 1)).toEqual(mapOf(poi));
    const won = { ...v, outcome: { ...out, win: true } };
    expect(markRiftWounds(mapOf(poi), [won], at(7)).pois[0]!.riftSlain).toBeUndefined();
    // Passe par le chemin du store.
    expect(restoreUnvanquished(mapOf(poi), [v], at(7))!.pois[0]!.riftSlain).toBe(out.party!.slain);
  });

  it('le rejeu montre les monstres affrontés sous leur vraie identité', () => {
    const p = rift({ riftSlain: 4 });
    const out = incursion(p, 3, 31, at(7));
    const input = riftStageInputOf(out.party!)!;
    expect(input.start).toBe(4);
    const stage = buildRiftStage(input, 1);
    const fresh = buildRiftStage({ ...input, start: 0, population: input.population + 4 }, 1);
    // Le premier affronté est le 5ᵉ de la faille.
    expect(stage.foes[0]!.name).toBe(fresh.foes[4]!.name);
    expect(stage.foes[0]!.depth).toBe(fresh.foes[4]!.depth);
  });
});
