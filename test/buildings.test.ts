import { describe, it, expect } from 'vitest';
import {
  plotsForLevel,
  slotUnlockLevel,
  buildingUpgradeCost,
  canUpgradeBuilding,
  buildingScales,
  buildingProdPerHour,
  buildingStorageCap,
  buildingAccrued,
  nextCollectedAt,
  collectable,
  buildingType,
  buildingUnlockLevel,
  canBuildType,
  storageMult,
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

const H = 3_600_000;
const mk = (typeId: string, level: number, collectedAt = 0, slot = 0): Building => ({
  typeId,
  level,
  slot,
  collectedAt,
});

describe('buildings — emplacements & coûts', () => {
  it('plotsForLevel : UN emplacement par niveau (le joueur priorise), plafonné', () => {
    expect(plotsForLevel(1)).toBe(1);
    expect(plotsForLevel(2)).toBe(2);
    expect(plotsForLevel(5)).toBe(5);
    expect(plotsForLevel(BUILD.plotCap)).toBe(BUILD.plotCap);
    expect(plotsForLevel(40)).toBe(BUILD.plotCap); // plafonné
  });
  it('slotUnlockLevel : inverse cohérent de plotsForLevel', () => {
    for (const slot of [0, 1, 2, 3, 4, 5]) {
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
    expect(canUpgradeBuilding(mk('energy_font', 4), 10)).toBe(true);
    expect(canUpgradeBuilding(mk('energy_font', 10), 10)).toBe(false);
  });
});

describe('buildings — production', () => {
  it('prod/h et stockage croissent avec le niveau', () => {
    expect(buildingProdPerHour(mk('energy_font', 10))).toBeGreaterThan(
      buildingProdPerHour(mk('energy_font', 3)),
    );
    expect(buildingStorageCap(mk('energy_font', 5))).toBe(
      buildingProdPerHour(mk('energy_font', 5)) * BUILD.storageHours,
    );
  });
  it('accumulation dans le temps, PLAFONNÉE au stockage', () => {
    const b = mk('energy_font', 10, 0);
    const perHr = buildingProdPerHour(b);
    // Après 5 h : ~5×perHr.
    expect(buildingAccrued(b, 5 * H)).toBe(Math.floor(perHr * 5));
    // Après 1000 h : saturé au stockage (pas de perte punitive au-delà).
    expect(buildingAccrued(b, 1000 * H)).toBe(Math.floor(buildingStorageCap(b)));
  });
  it('déterministe (même building + même now → même accumulation)', () => {
    const b = mk('energy_font', 7, 123);
    expect(buildingAccrued(b, 123 + 3 * H)).toBe(buildingAccrued(b, 123 + 3 * H));
  });
  it('collectable : agrège la production par ressource', () => {
    const now = 20 * H;
    const bs = [mk('energy_font', 8, 0)];
    const c = collectable(bs, now);
    expect(c.energy).toBe(buildingAccrued(bs[0]!, now));
    expect(c.dust).toBe(0); // ressource retirée du jeu → jamais produite
  });
  it('type inconnu → prod 0 (robustesse)', () => {
    expect(buildingProdPerHour(mk('inexistant', 5))).toBe(0);
    expect(collectable([mk('inexistant', 5)], 100 * H)).toEqual({
      dust: 0,
      stone: 0,
      energy: 0,
      parchemins: 0,
      fragments: 0,
      ink_dust: 0,
    });
  });
});

describe('buildings — registre extensible', () => {
  it('filons de base : producteurs, débloqués dès le début', () => {
    expect(buildingType('energy_font')?.resource).toBe('energy');
    expect(buildingUnlockLevel('energy_font')).toBe(1);
  });
});

describe('buildings — déblocage & unicité (utilitaires)', () => {
  it('canBuildType : gate par niveau (Autel des boss niv.4)', () => {
    expect(buildingUnlockLevel('boss_altar')).toBe(4);
    expect(canBuildType('boss_altar', 3, [])).toBe(false);
    expect(canBuildType('boss_altar', 4, [])).toBe(true);
    // Production de base dispo dès le niv.1 (nouvel ordre des emplacements).
    expect(buildingUnlockLevel('warehouse')).toBe(1);
    expect(buildingUnlockLevel('energy_font')).toBe(1);
  });
  it('canBuildType : bâtiment UNIQUE non re-constructible', () => {
    const wh: Building = mk('warehouse', 1, 0, 3);
    expect(canBuildType('warehouse', 10, [])).toBe(true);
    expect(canBuildType('warehouse', 10, [wh])).toBe(false); // déjà posé
  });
  it('filons UNIQUES : 1 de chaque type sur la carte', () => {
    expect(canBuildType('energy_font', 5, [])).toBe(true);
    expect(canBuildType('energy_font', 5, [mk('energy_font', 3, 0, 0)])).toBe(false); // déjà posé
    // Un autre type reste constructible.
    expect(canBuildType('warehouse', 5, [mk('energy_font', 3, 0, 0)])).toBe(true);
  });
});

describe('buildings — Entrepôt : effet stockage global', () => {
  it("l'entrepôt augmente le stockage des filons (+15%/niveau), pas la prod", () => {
    const wh = mk('warehouse', 4, 0, 5); // +60 % stockage
    expect(storageMult([wh])).toBeCloseTo(1.6, 5);
    expect(buildingProdPerHour(wh)).toBe(0); // un utilitaire ne produit rien
    const dust = mk('energy_font', 10, 0, 0);
    expect(buildingStorageCap(dust, storageMult([wh]))).toBeCloseTo(
      buildingStorageCap(dust) * 1.6,
      3,
    );
  });
  it("collectable applique le bonus d'entrepôt et ignore les utilitaires", () => {
    const now = 1000 * H; // saturé
    const dust = mk('energy_font', 10, 0, 0);
    const wh = mk('warehouse', 4, 0, 1);
    const base = collectable([dust], now).energy;
    const boosted = collectable([dust, wh], now).energy;
    expect(boosted).toBeGreaterThan(base); // stockage plus grand → plus récolté à saturation
    expect(collectable([wh], now)).toEqual({
      dust: 0,
      stone: 0,
      energy: 0,
      parchemins: 0,
      fragments: 0,
      ink_dust: 0,
    }); // l'entrepôt ne produit rien
  });
});

describe('buildings — Avant-poste : gate + vitesse des expéditions', () => {
  it('expeditionsUnlocked = true seulement avec un avant-poste', () => {
    expect(expeditionsUnlocked([])).toBe(false);
    expect(expeditionsUnlocked([mk('energy_font', 5)])).toBe(false);
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

describe('filons — report du reliquat à la récolte', () => {
  it('la fraction non récoltée est conservée (pas remise à zéro)', () => {
    const b = mk('energy_font', 6, 0); // prod fractionnaire à l'heure → teste le report du reliquat
    const perHr = buildingProdPerHour(b);
    const whole = Math.floor(perHr);
    const now = H;
    expect(buildingAccrued(b, now, 1)).toBe(whole);
    const nca = nextCollectedAt(b, now, 1);
    // Le reliquat reporté = la fraction non entière (et non 0) : le stock ne repart pas de zéro.
    const carriedUnits = (perHr * (now - nca)) / H;
    expect(carriedUnits).toBeCloseTo(perHr - whole, 6);
    // Re-récolte immédiate = 0 (moins d’une unité entière en stock).
    expect(buildingAccrued({ ...b, collectedAt: nca }, now, 1)).toBe(0);
  });

  it('un filon lent n’est pas affamé par des récoltes fréquentes', () => {
    let b = mk('energy_font', 1, 0);
    let total = 0;
    const step = 0.5 * H; // récolte toutes les 30 min (< 1 unité/récolte → test du report)
    // Fenêtre sous le plafond de stockage (18 h) → la récolte unique n'est pas saturée.
    for (let now = step; now <= 12 * H; now += step) {
      total += buildingAccrued(b, now, 1);
      b = { ...b, collectedAt: nextCollectedAt(b, now, 1) };
    }
    // Le report du reliquat → on récupère le même total qu'une récolte unique sur 12 h
    // (et non 0 comme avec l’ancien reset à `now`).
    expect(total).toBe(buildingAccrued(mk('energy_font', 1, 0), 12 * H, 1));
    expect(total).toBeGreaterThan(0);
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
