import { describe, it, expect } from 'vitest';
import {
  plotsForLevel,
  buildingUpgradeCost,
  canUpgradeBuilding,
  buildingProdPerHour,
  buildingStorageCap,
  buildingAccrued,
  collectable,
  buildingType,
  BUILDING_TYPES,
  BUILD,
  type Building,
} from '@/lib/buildings';

const H = 3_600_000;
const mk = (typeId: string, level: number, collectedAt = 0, slot = 0): Building => ({ typeId, level, slot, collectedAt });

describe('buildings — emplacements & coûts', () => {
  it('plotsForLevel : +1 tous les 4 niveaux, plafonné', () => {
    expect(plotsForLevel(1)).toBe(2);
    expect(plotsForLevel(4)).toBe(3);
    expect(plotsForLevel(8)).toBe(4);
    expect(plotsForLevel(16)).toBe(6);
    expect(plotsForLevel(40)).toBe(BUILD.plotCap); // plafonné
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
    expect(collectable([mk('inexistant', 5)], 100 * H)).toEqual({ dust: 0, stone: 0 });
  });
});

describe('buildings — registre extensible', () => {
  it('les 2 filons de base existent et produisent leur ressource', () => {
    expect(buildingType('dust_vein')?.resource).toBe('dust');
    expect(buildingType('stone_vein')?.resource).toBe('stone');
    for (const t of BUILDING_TYPES) expect(t.category).toBe('producer');
  });
});
