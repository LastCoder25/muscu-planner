import { describe, it, expect } from 'vitest';
import {
  perLevelLabel,
  plotsForLevel,
  slotUnlockLevel,
  buildingUpgradeCost,
  canUpgradeBuilding,
  buildingProdPerHour,
  buildingStorageCap,
  collectable,
  storageMult,
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

const H = 3_600_000;
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
  it('AUCUN emplacement mort : autant d’emplacements que de types (tous uniques)', () => {
    // ⚠️ Tous les types sont `unique` → un emplacement au-delà de leur nombre ne peut
    // JAMAIS être rempli : ce n'est pas de la réserve, c'est un trou permanent dans la
    // cour. C'est ce que donnaient les 10 emplacements pour 7 bâtiments.
    expect(BUILDING_TYPES.every((t) => t.unique)).toBe(true);
    expect(BUILD.plotCap).toBe(BUILDING_TYPES.length);
    // 10 types depuis les caravanes (v0.727) : les 7 d’origine + Comptoir, Guilde,
    // Centre de formation. ⚠️ Le littéral est là pour qu’ajouter un type soit une
    // DÉCISION (il ouvre un emplacement et approfondit le puits d’or de 1/N), pas un effet de bord.
    expect(BUILDING_TYPES.length).toBe(10);
  });
  it('le CHOIX vit dans plotsForLevel, pas dans le mou : moins d’emplacements que de types déblocables', () => {
    // À bas niveau on a moins d'emplacements que de bâtiments déjà déblocables → on
    // décide de l'ORDRE. C'est là (et seulement là) que construire est une décision.
    const buildableAt = (lvl) => BUILDING_TYPES.filter((t) => (t.unlockLevel ?? 1) <= lvl).length;
    expect(plotsForLevel(3)).toBeLessThan(buildableAt(3));
    expect(plotsForLevel(4)).toBeLessThan(buildableAt(4));
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

describe('buildings — registre (production passive)', () => {
  it('roster complet : les 7 d’origine + comptoir, guilde, centre de formation', () => {
    expect(BUILDING_TYPES.map((t) => t.id).sort()).toEqual(
      [
        'boss_altar',
        'energy_font',
        'foundry',
        'gold_mine',
        'labyrinth_gate',
        'outpost',
        'warehouse',
        'caravanserail',
        'guild',
        'training',
      ].sort(),
    );
  });

  it('la Fonderie produit la FERRAILLE, sans détrôner les épaves de la carte', () => {
    // Elle est le filet régulier ; les épaves restent la source de pointe (une visite
    // vaut 2 à 3 récoltes) — même relation que la Mine d'or avec les expéditions.
    expect(buildingProdPerHour(mk('foundry', 25))).toBeGreaterThan(0);
    const parRecolte = buildingProdPerHour(mk('foundry', 25)) * BUILD.storageHours;
    expect(parRecolte, 'une récolte doit couvrir une remise en état').toBeGreaterThan(40);
    expect(parRecolte, 'sans rendre les épaves inutiles').toBeLessThan(120);
  });
  it('producteurs & hybrides produisent une ressource ; outpost/entrepôt non', () => {
    expect(buildingProdPerHour(mk('gold_mine', 10))).toBeGreaterThan(0); // or
    expect(buildingProdPerHour(mk('energy_font', 10))).toBeGreaterThan(0); // énergie
    expect(buildingProdPerHour(mk('boss_altar', 10))).toBeGreaterThan(0); // hybride → pierres
    expect(buildingProdPerHour(mk('labyrinth_gate', 10))).toBeGreaterThan(0); // hybride → clés
    expect(buildingProdPerHour(mk('outpost', 10))).toBe(0); // utilitaire pur
    expect(buildingProdPerHour(mk('warehouse', 10))).toBe(0); // utilitaire pur
    expect(buildingProdPerHour(mk('inexistant', 5))).toBe(0); // robustesse
  });
  it('collectable agrège par ressource (or / énergie / pierres / clés)', () => {
    const now = 100 * H;
    const c = collectable(
      [
        mk('gold_mine', 10, 0),
        mk('energy_font', 10, 0),
        mk('boss_altar', 10, 0),
        mk('labyrinth_gate', 10, 0),
      ],
      now,
    );
    expect(c.gold).toBeGreaterThan(0);
    expect(c.energy).toBeGreaterThan(0);
    expect(c.summon).toBeGreaterThan(0);
    expect(c.keys).toBeGreaterThan(0);
  });
  it('Entrepôt augmente le stockage des producteurs (+15 %/niveau)', () => {
    expect(storageMult([mk('warehouse', 4)])).toBeCloseTo(1.6, 5); // +60 %
    const mine = mk('gold_mine', 10, 0);
    expect(buildingStorageCap(mine, storageMult([mk('warehouse', 4)]))).toBeCloseTo(
      buildingStorageCap(mine) * 1.6,
      3,
    );
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
  it('un utilitaire pur (perHr = 0) garde son collectedAt', () => {
    expect(nextCollectedAt(mk('outpost', 5, 123), 999_999)).toBe(123);
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

describe('ce qu’un NIVEAU change, dit explicitement', () => {
  it('⚠️ AUCUN bâtiment muet : chaque type dit ce qu’un niveau lui apporte', () => {
    // Les descriptions disaient ce que le bâtiment FAIT, jamais ce que le niveau CHANGE —
    // or c'est exactement la question qu'on se pose devant le bouton « Améliorer ».
    // Ajouter un type sans le renseigner est une régression, pas un oubli anodin.
    for (const t of BUILDING_TYPES) {
      const label = perLevelLabel(t);
      expect(label, `${t.label} ne dit pas ce qu’un niveau apporte`).not.toBe('');
    }
  });

  it('la part PRODUCTION est dérivée des données, jamais recopiée', () => {
    // Un producteur doit annoncer exactement son débit par niveau : si `prodPerHrPerLvl`
    // change, l'étiquette suit toute seule.
    for (const t of BUILDING_TYPES.filter((x) => x.resource && x.prodPerHrPerLvl)) {
      expect(perLevelLabel(t)).toContain(String(t.prodPerHrPerLvl));
    }
  });
});

describe('⚠️ la cour suit le roster — la porte reste dégagée', () => {
  /** La formule de BasePage, reproduite pour être testable (le composant n'est pas
   *  importable ici). Elle doit rester d'accord avec lui. */
  const gateOffset = (n: number) => {
    const step = (2 * Math.PI) / n;
    return (Math.PI * (n + 1)) / n - Math.round((n + 1) / 2) * step;
  };
  const ring = (n: number, r: number, off: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2 + off;
      return { x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r };
    });
  /** Écart angulaire au BAS de l'anneau (la porte est au sud). */
  const toGate = (p: { x: number; y: number }) => {
    const a = (Math.atan2(p.y - 100, p.x - 100) * 180) / Math.PI;
    return Math.abs(((a - 90 + 540) % 360) - 180);
  };

  it('aucun atelier ne se pose devant la porte, quel que soit le nombre', () => {
    // Le décalage valait 0, calé à la main sur SEPT emplacements. À dix, une tuile
    // tombait pile au sud et bouchait le couloir d'entrée.
    for (let n = 3; n <= 16; n++) {
      const clair = Math.min(...ring(n, 43, gateOffset(n)).map(toGate));
      expect(clair, `${n} emplacements`).toBeGreaterThan(360 / n / 2 - 1);
    }
  });
  it('elle redonne EXACTEMENT la disposition d’avant pour 7', () => {
    expect(gateOffset(7)).toBeCloseTo(0, 9);
  });
  it('les tuiles ne se chevauchent jamais et tiennent dans l’enceinte', () => {
    const HIT = 10; // demi-cible tactile
    const CORNER = Math.SQRT2 * 9; // du centre au coin de la tuile dessinée
    const APOTHEM = 62 * Math.cos(Math.PI / 8);
    const pos = ring(BUILD.plotCap, 43, gateOffset(BUILD.plotCap));
    for (let i = 0; i < pos.length; i++) {
      expect(Math.hypot(pos[i]!.x - 100, pos[i]!.y - 100) + CORNER).toBeLessThan(APOTHEM);
      for (let j = i + 1; j < pos.length; j++) {
        expect(Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y)).toBeGreaterThanOrEqual(
          2 * HIT,
        );
      }
    }
  });
});
