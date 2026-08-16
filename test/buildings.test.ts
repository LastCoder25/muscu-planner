import { describe, it, expect } from 'vitest';
import {
  plotsForLevel,
  slotUnlockLevel,
  buildingUpgradeCost,
  canUpgradeBuilding,
  buildingProdPerHour,
  buildingStorageCap,
  buildingAccrued,
  collectable,
  buildingType,
  buildingUnlockLevel,
  canBuildType,
  storageMult,
  expeditionsUnlocked,
  travelTimeMult,
  outpostLevel,
  BUILDING_TYPES,
  BUILD,
  type Building,
} from '@/lib/buildings';

const H = 3_600_000;
const mk = (typeId: string, level: number, collectedAt = 0, slot = 0): Building => ({ typeId, level, slot, collectedAt });

describe('buildings — emplacements & coûts', () => {
  it('plotsForLevel : 1 au départ, +1/niveau jusqu’à 4, puis +1/4 niveaux', () => {
    expect(plotsForLevel(1)).toBe(1);
    expect(plotsForLevel(2)).toBe(2);
    expect(plotsForLevel(3)).toBe(3);
    expect(plotsForLevel(4)).toBe(4);
    expect(plotsForLevel(5)).toBe(4); // ensuite cadence douce
    expect(plotsForLevel(8)).toBe(5);
    expect(plotsForLevel(16)).toBe(7);
    expect(plotsForLevel(40)).toBe(BUILD.plotCap); // plafonné
  });
  it('slotUnlockLevel : inverse cohérent de plotsForLevel', () => {
    for (const slot of [0, 1, 2, 3, 4, 5, 8]) {
      const lvl = slotUnlockLevel(slot);
      expect(plotsForLevel(lvl)).toBeGreaterThanOrEqual(slot + 1); // débloqué à ce niveau
      if (lvl > 1) expect(plotsForLevel(lvl - 1)).toBeLessThanOrEqual(slot); // pas avant
    }
  });
  it('buildingUpgradeCost : steep et croissant', () => {
    expect(buildingUpgradeCost(1)).toBeLessThan(buildingUpgradeCost(5));
    expect(buildingUpgradeCost(10)).toBeGreaterThan(buildingUpgradeCost(5) * 2);
  });
  it('canUpgradeBuilding : plafonné au niveau joueur', () => {
    expect(canUpgradeBuilding(mk('dust_vein', 4), 10)).toBe(true);
    expect(canUpgradeBuilding(mk('dust_vein', 10), 10)).toBe(false);
  });
});

describe('buildings — production', () => {
  it('prod/h et stockage croissent avec le niveau', () => {
    expect(buildingProdPerHour(mk('dust_vein', 10))).toBeGreaterThan(buildingProdPerHour(mk('dust_vein', 3)));
    expect(buildingStorageCap(mk('dust_vein', 5))).toBe(buildingProdPerHour(mk('dust_vein', 5)) * BUILD.storageHours);
  });
  it('accumulation dans le temps, PLAFONNÉE au stockage', () => {
    const b = mk('dust_vein', 10, 0);
    const perHr = buildingProdPerHour(b);
    // Après 5 h : ~5×perHr.
    expect(buildingAccrued(b, 5 * H)).toBe(Math.floor(perHr * 5));
    // Après 1000 h : saturé au stockage (pas de perte punitive au-delà).
    expect(buildingAccrued(b, 1000 * H)).toBe(Math.floor(buildingStorageCap(b)));
  });
  it('déterministe (même building + même now → même accumulation)', () => {
    const b = mk('stone_vein', 7, 123);
    expect(buildingAccrued(b, 123 + 3 * H)).toBe(buildingAccrued(b, 123 + 3 * H));
  });
  it('collectable : agrège par ressource', () => {
    const now = 20 * H;
    const bs = [mk('dust_vein', 8, 0), mk('dust_vein', 4, 0), mk('stone_vein', 6, 0)];
    const c = collectable(bs, now);
    expect(c.dust).toBe(buildingAccrued(bs[0]!, now) + buildingAccrued(bs[1]!, now));
    expect(c.stone).toBe(buildingAccrued(bs[2]!, now));
  });
  it('type inconnu → prod 0 (robustesse)', () => {
    expect(buildingProdPerHour(mk('inexistant', 5))).toBe(0);
    expect(collectable([mk('inexistant', 5)], 100 * H)).toEqual({ dust: 0, stone: 0, energy: 0 });
  });
});

describe('buildings — registre extensible', () => {
  it('les 2 filons de base : producteurs, débloqués dès le début', () => {
    expect(buildingType('dust_vein')?.resource).toBe('dust');
    expect(buildingType('stone_vein')?.resource).toBe('stone');
    expect(buildingUnlockLevel('dust_vein')).toBe(1);
  });
});

describe('buildings — déblocage & unicité (utilitaires)', () => {
  it('canBuildType : gate par niveau (Entrepôt niv.7)', () => {
    expect(buildingUnlockLevel('warehouse')).toBe(7);
    expect(canBuildType('warehouse', 6, [])).toBe(false);
    expect(canBuildType('warehouse', 7, [])).toBe(true);
  });
  it('canBuildType : bâtiment UNIQUE non re-constructible', () => {
    const wh: Building = mk('warehouse', 1, 0, 3);
    expect(canBuildType('warehouse', 10, [])).toBe(true);
    expect(canBuildType('warehouse', 10, [wh])).toBe(false); // déjà posé
  });
  it('filons UNIQUES : 1 de chaque type sur la carte', () => {
    expect(canBuildType('dust_vein', 5, [])).toBe(true);
    expect(canBuildType('dust_vein', 5, [mk('dust_vein', 3, 0, 0)])).toBe(false); // déjà posé
    // Un autre type reste constructible.
    expect(canBuildType('stone_vein', 5, [mk('dust_vein', 3, 0, 0)])).toBe(true);
  });
});

describe('buildings — Entrepôt : effet stockage global', () => {
  it("l'entrepôt augmente le stockage des filons (+15%/niveau), pas la prod", () => {
    const wh = mk('warehouse', 4, 0, 5); // +60 % stockage
    expect(storageMult([wh])).toBeCloseTo(1.6, 5);
    expect(buildingProdPerHour(wh)).toBe(0); // un utilitaire ne produit rien
    const dust = mk('dust_vein', 10, 0, 0);
    expect(buildingStorageCap(dust, storageMult([wh]))).toBeCloseTo(buildingStorageCap(dust) * 1.6, 3);
  });
  it("collectable applique le bonus d'entrepôt et ignore les utilitaires", () => {
    const now = 1000 * H; // saturé
    const dust = mk('dust_vein', 10, 0, 0);
    const wh = mk('warehouse', 4, 0, 1);
    const base = collectable([dust], now).dust;
    const boosted = collectable([dust, wh], now).dust;
    expect(boosted).toBeGreaterThan(base); // stockage plus grand → plus récolté à saturation
    expect(collectable([wh], now)).toEqual({ dust: 0, stone: 0, energy: 0 }); // l'entrepôt ne produit rien
  });
});

describe('buildings — Avant-poste : gate + vitesse des expéditions', () => {
  it('expeditionsUnlocked = true seulement avec un avant-poste', () => {
    expect(expeditionsUnlocked([])).toBe(false);
    expect(expeditionsUnlocked([mk('dust_vein', 5)])).toBe(false);
    expect(expeditionsUnlocked([mk('outpost', 1)])).toBe(true);
  });
  it('travelTimeMult < 1 et décroît avec le niveau (−1,5 %/niv, plancher −60 % au niv.40)', () => {
    expect(travelTimeMult([])).toBe(1);
    expect(travelTimeMult([mk('outpost', 1)])).toBeCloseTo(0.985, 5); // −1,5 %
    expect(travelTimeMult([mk('outpost', 13)])).toBeCloseTo(0.805, 5); // −19,5 %
    expect(travelTimeMult([mk('outpost', 40)])).toBeCloseTo(0.4, 5); // plafonné −60 % au niv.40
    expect(travelTimeMult([mk('outpost', 60)])).toBeCloseTo(0.4, 5); // reste plafonné
    expect(outpostLevel([mk('outpost', 3)])).toBe(3);
  });
});
