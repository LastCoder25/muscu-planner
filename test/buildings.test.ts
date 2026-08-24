import { describe, it, expect } from 'vitest';
import {
  plotsForLevel,
  slotUnlockLevel,
  buildingUpgradeCost,
  canUpgradeBuilding,
  buildingProdPerHour,
  nextCollectedAt,
  buildingType,
  buildingUnlockLevel,
  canBuildType,
  expeditionsUnlocked,
  travelTimeMult,
  outpostLevel,
  bossSummonDiscount,
  summonCostWith,
  BUILDING_TYPES,
  BUILD,
  type Building,
} from '@/lib/buildings';
import { bossSummonCost } from '@/data/bosses';

const mk = (typeId: string, level: number, collectedAt = 0, slot = 0): Building => ({
  typeId,
  level,
  slot,
  collectedAt,
});

describe('buildings — emplacements & coûts', () => {
  it('plotsForLevel : UN emplacement par niveau (le joueur priorise), plafonné à plotCap', () => {
    expect(plotsForLevel(1)).toBe(1);
    expect(plotsForLevel(2)).toBe(2);
    expect(plotsForLevel(BUILD.plotCap)).toBe(BUILD.plotCap);
    expect(plotsForLevel(40)).toBe(BUILD.plotCap); // plafonné
  });
  it('plotCap = minimum : un emplacement par type de bâtiment restant (aucun spot vide)', () => {
    expect(BUILD.plotCap).toBe(BUILDING_TYPES.length);
    expect(BUILDING_TYPES.length).toBe(3); // Avant-poste, Porte du Labyrinthe, Autel des boss
  });
  it('slotUnlockLevel : inverse cohérent de plotsForLevel (dans la limite de plotCap)', () => {
    for (let slot = 0; slot < BUILD.plotCap; slot++) {
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
    expect(canUpgradeBuilding(mk('boss_altar', 4), 10)).toBe(true);
    expect(canUpgradeBuilding(mk('boss_altar', 10), 10)).toBe(false);
  });
});

describe('buildings — registre (3 utilitaires, plus de producteurs)', () => {
  it('les 3 types restants sont des utilitaires (aucun producteur)', () => {
    expect(BUILDING_TYPES.map((t) => t.id).sort()).toEqual(
      ['boss_altar', 'labyrinth_gate', 'outpost'].sort(),
    );
    for (const t of BUILDING_TYPES) expect(t.category).toBe('utility');
  });
  it('un utilitaire ne produit rien (prod 0) et un type inconnu aussi (robustesse)', () => {
    for (const t of BUILDING_TYPES) expect(buildingProdPerHour(mk(t.id, 10))).toBe(0);
    expect(buildingProdPerHour(mk('inexistant', 5))).toBe(0);
  });
});

describe('buildings — déblocage & unicité (utilitaires)', () => {
  it('canBuildType : gate par niveau (Autel des boss niv.4)', () => {
    expect(buildingUnlockLevel('boss_altar')).toBe(4);
    expect(canBuildType('boss_altar', 3, [])).toBe(false);
    expect(canBuildType('boss_altar', 4, [])).toBe(true);
    expect(buildingUnlockLevel('labyrinth_gate')).toBe(2);
    expect(buildingUnlockLevel('outpost')).toBe(3);
  });
  it('canBuildType : bâtiment UNIQUE non re-constructible', () => {
    const gate: Building = mk('labyrinth_gate', 1, 0, 0);
    expect(canBuildType('labyrinth_gate', 10, [])).toBe(true);
    expect(canBuildType('labyrinth_gate', 10, [gate])).toBe(false); // déjà posé
    // Un autre type reste constructible.
    expect(canBuildType('boss_altar', 10, [gate])).toBe(true);
  });
});

describe('buildings — Avant-poste : gate + vitesse des expéditions', () => {
  it('expeditionsUnlocked = true seulement avec un avant-poste', () => {
    expect(expeditionsUnlocked([])).toBe(false);
    expect(expeditionsUnlocked([mk('boss_altar', 5)])).toBe(false);
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
  it('un utilitaire (perHr = 0) garde son collectedAt', () => {
    expect(nextCollectedAt(mk('boss_altar', 5, 123), 999_999)).toBe(123);
  });
});

describe('boss — pierres d’invocation 🔮', () => {
  it('bossSummonCost croît avec le palier', () => {
    expect(bossSummonCost(5)).toBe(2);
    expect(bossSummonCost(15)).toBe(4);
    expect(bossSummonCost(25)).toBe(6);
    expect(bossSummonCost(100)).toBe(21);
  });
  it('bossSummonDiscount : −4 %/niveau d’Autel, plafond −50 %', () => {
    expect(bossSummonDiscount([])).toBe(0);
    expect(bossSummonDiscount([mk('boss_altar', 1)])).toBeCloseTo(0.04, 5);
    expect(bossSummonDiscount([mk('boss_altar', 5)])).toBeCloseTo(0.2, 5);
    expect(bossSummonDiscount([mk('boss_altar', 30)])).toBe(0.5); // plafonné
  });
  it('summonCostWith applique la remise (arrondi haut, plancher 1)', () => {
    expect(summonCostWith(6, [])).toBe(6); // sans Autel
    expect(summonCostWith(6, [mk('boss_altar', 5)])).toBe(5); // 6×0,8 = 4,8 → 5
    expect(summonCostWith(2, [mk('boss_altar', 30)])).toBe(1); // 2×0,5 = 1
    expect(summonCostWith(1, [mk('boss_altar', 30)])).toBe(1); // plancher 1
  });
});
