import { describe, expect, it } from 'vitest';
import {
  ISLANDS,
  ISLAND_OUTPOST_LEVEL,
  ISLAND_REACH,
  activeIsland,
  archipelOn,
  mapOutpostLevel,
  mapPlayerLevel,
} from '@/lib/archipelago';
import {
  advanceWorld,
  createMap,
  poiDifficultyLevel,
  poiTravelLevel,
  revealRadius,
  travelHourRings,
  travelOneWayMin,
  type ExpeditionMap,
} from '@/lib/expedition';
import { CITADEL, ensureControls } from '@/lib/controlPoints';
import { syncFieldArmies } from '@/lib/fieldArmy';
import { rollRaid } from '@/lib/raid';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;

const islandMap = (seed: number, level: number): ExpeditionMap =>
  createMap(seed, NOW, level, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1));

describe('🏝️ archipel — les îles', () => {
  it('cinq îles, une par tranche de 20 niveaux, sans trou ni chevauchement', () => {
    expect(ISLANDS).toHaveLength(5);
    ISLANDS.forEach((i, k) => {
      expect(i.id).toBe(k + 1);
      expect(i.minLevel).toBe(k * 20 + 1);
      expect(i.maxLevel).toBe((k + 1) * 20);
    });
  });

  it("l'île 1 plafonne au niveau 20 (rang Argent)", () => {
    expect(archipelOn(1)).toEqual({ island: 1, levelCap: 20 });
    expect(activeIsland({ archipel: archipelOn(1) })?.name).toBe('Île des Brigands');
    expect(activeIsland({})).toBeNull();
  });

  it('le niveau vu par la carte est plafonné en mode archipel, intact sinon', () => {
    expect(mapPlayerLevel({ archipel: archipelOn(1) }, 47)).toBe(20);
    expect(mapPlayerLevel({ archipel: archipelOn(1) }, 9)).toBe(9);
    expect(mapPlayerLevel({}, 47)).toBe(47);
    expect(mapPlayerLevel(null, 47)).toBe(47);
  });

  it("la taille de la carte est celle de l'île, quel que soit l'Avant-poste", () => {
    expect(mapOutpostLevel({ archipel: archipelOn(1) }, 40)).toBe(ISLAND_OUTPOST_LEVEL);
    expect(mapOutpostLevel({}, 40)).toBe(40);
    const r = revealRadius(ISLAND_OUTPOST_LEVEL);
    expect(r).toBeLessThanOrEqual(ISLAND_REACH);
    // Le plus GRAND niveau qui tient : un cran de plus dépasserait l'île.
    expect(revealRadius(ISLAND_OUTPOST_LEVEL + 1)).toBeGreaterThan(ISLAND_REACH);
    // ⚠️ La première citadelle appartient à l'île 3 : l'île 1 ne la découvre pas.
    expect(r).toBeLessThan(CITADEL.sites[0]!.dist);
  });
});

describe('🏝️ archipel — la carte', () => {
  it("aucun lieu ne dépasse le rang de l'île, même pour un joueur de niveau 60", () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const m = islandMap(seed, 60);
      expect(m.archipel).toEqual(archipelOn(1));
      for (const p of m.pois) expect(poiDifficultyLevel(p)).toBeLessThanOrEqual(20);
    }
  });

  it('les trajets ne lisent plus aucun niveau : 2 h d’aller au plus sur l’île', () => {
    const m = islandMap(5, 60);
    for (const p of m.pois) {
      expect(poiTravelLevel(p)).toBe(0);
      expect(travelOneWayMin(poiTravelLevel(p), p.distNorm)).toBeLessThanOrEqual(120);
    }
  });

  it('hors du mode, rien ne change : les lieux gardent leur niveau de trajet', () => {
    const m = createMap(5, NOW, 60, ISLAND_OUTPOST_LEVEL);
    expect(m.archipel).toBeUndefined();
    expect(m.pois.some((p) => poiTravelLevel(p) > 0)).toBe(true);
  });

  it('basculer une carte dans le mode retire les lieux trop forts et pose la règle des trajets', () => {
    const before = createMap(11, NOW, 60, ISLAND_OUTPOST_LEVEL);
    expect(before.pois.some((p) => poiDifficultyLevel(p) > 20)).toBe(true);
    const after = advanceWorld(
      { ...before, archipel: archipelOn(1) },
      NOW + 1000,
      20,
      ISLAND_OUTPOST_LEVEL,
    );
    expect(after.archipel).toEqual(archipelOn(1));
    for (const p of after.pois) {
      expect(poiDifficultyLevel(p)).toBeLessThanOrEqual(20);
      expect(poiTravelLevel(p)).toBe(0);
    }
  });

  it('le mode survit aux ticks et la carte se stabilise (pas d’écriture à chaque seconde)', () => {
    const tick = (m: ExpeditionMap, t: number) =>
      syncFieldArmies(
        ensureControls(advanceWorld(m, t, 20, ISLAND_OUTPOST_LEVEL), t, 20, ISLAND_OUTPOST_LEVEL),
        {
          raid: null,
          detectR: 30,
          reach: revealRadius(ISLAND_OUTPOST_LEVEL),
          now: t,
          playerLevel: 20,
        },
      );
    const a = tick(islandMap(3, 20), NOW + 1000);
    const b = tick(a, NOW + 2000);
    const c = tick(b, NOW + 3000);
    expect(c.archipel).toEqual(archipelOn(1));
    expect(JSON.stringify(c)).toBe(JSON.stringify(b));
    for (const p of c.pois) expect(poiTravelLevel(p)).toBe(0);
  });

  it('une armée qui marche sur la base suit la même règle de trajet (sinon la carte se réécrit à chaque tick)', () => {
    const arrive = NOW + 6 * H;
    const raid = rollRaid(7, 20, arrive, 4 * H);
    const tick = (m: ExpeditionMap, t: number) =>
      syncFieldArmies(advanceWorld(m, t, 20, ISLAND_OUTPOST_LEVEL), {
        raid,
        detectR: 50,
        reach: revealRadius(ISLAND_OUTPOST_LEVEL),
        now: t,
        playerLevel: 20,
      });
    const a = tick(islandMap(4, 20), arrive - 2 * H);
    expect(a.pois.some((p) => p.army)).toBe(true);
    const b = tick(a, arrive - 2 * H + 1000);
    expect(b).toEqual(a);
    for (const p of b.pois) expect(poiTravelLevel(p)).toBe(0);
  });

  it('les cercles d’heures suivent la règle de l’île : plus larges qu’avec le facteur de niveau', () => {
    const flat = travelHourRings(60, 1, 120, true);
    const lvl = travelHourRings(60, 1, 120, false);
    expect(flat[0]!.r).toBeGreaterThan(lvl[0]!.r);
    // 2 h d'aller tombent vers le bord de l'île (étape 0 : 54 unités).
    expect(Math.abs(flat[1]!.r - ISLAND_REACH)).toBeLessThan(3);
  });

  it('un lieu tenu sur l’île reste à la taille de l’île après une semaine', () => {
    let m = islandMap(8, 20);
    for (let t = 1; t <= 7 * 24; t += 6) m = advanceWorld(m, NOW + t * H, 20, ISLAND_OUTPOST_LEVEL);
    const r = revealRadius(ISLAND_OUTPOST_LEVEL);
    for (const p of m.pois)
      if (p.type !== 'warband')
        expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThanOrEqual(r + 0.5);
  });
});
