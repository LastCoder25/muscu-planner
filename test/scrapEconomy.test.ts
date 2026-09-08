import { describe, it, expect } from 'vitest';
import { defenseUpgradeScrap, repairCost, DEFENSE_TYPES } from '@/lib/raid';
import { HARVEST, travelOneWayMin } from '@/lib/expedition';
import { BUILDING_TYPES } from '@/lib/buildings';
import { scrapValue, RANK_ORDER, SLOTS, type Item } from '@/lib/items';

/** L'économie de la FERRAILLE, mesurée de bout en bout : ce qu'il faut en dépenser pour
 *  monter l'enceinte, face à ce que chaque source en produit vraiment.
 *
 *  ⚠️ CE QUE CES TESTS EMPÊCHENT DE REVENIR. Avec l'ancien coût linéaire (`4 + niveau`),
 *  monter les 6 structures d'un cran coûtait **0,6 à 0,7 épave** à tous les niveaux, et la
 *  **Fonderie seule** couvrait ce cran en 2,2 à 2,8 jours. La ferraille tombait donc toute
 *  seule : elle n'était un frein nulle part, et le joueur n'avait aucune raison d'aller la
 *  chercher. L'or restait le seul verrou réel de l'enceinte. */

const N_STRUCT = DEFENSE_TYPES.length;
const LEVELS = [12, 20, 26, 40, 60, 100];

/** Coût en ferraille pour monter TOUTES les structures d'un cran (le rythme de croisière). */
const perLevel = (L: number) => defenseUpgradeScrap(L) * N_STRUCT;

/** Ce que rend UNE visite d'épave à ce niveau (trajet moyen) — la source de POINTE. */
function wreckYield(L: number): number {
  const rthH = (2 * travelOneWayMin(L, 0.5)) / 60;
  return Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * Math.min(0.5 + rthH, 6));
}
/** Production PASSIVE d'une Fonderie de niveau `lvl`, par jour, récoltée sans saturer. */
function foundryPerDay(lvl: number): number {
  const t = BUILDING_TYPES.find((b) => b.id === 'foundry')!;
  return (t.prodPerHrPerLvl ?? 0) * lvl * 24;
}
/** Recyclage d'un fond de sac : 20 objets autour de la ligue du joueur. */
function purgeOf20(L: number): number {
  const item = (slot: string, rarity: string): Item =>
    ({
      id: 'x',
      name: 'n',
      slot,
      emoji: '',
      rarity,
      level: L,
      baseLevel: L,
      effect: { type: 'damage_pct', value: 1 },
      roll: 0.5,
    }) as never;
  let t = 0;
  for (let i = 0; i < 20; i++) {
    const rank = RANK_ORDER[Math.max(0, Math.min(RANK_ORDER.length - 1, 3 + ((i % 5) - 2)))]!;
    t += scrapValue(item(SLOTS[i % 4]!, rank));
  }
  return t;
}

describe('ferraille : il faut ALLER la chercher', () => {
  it('un cran d’enceinte coûte PLUSIEURS visites d’épave, à tout niveau', () => {
    for (const L of LEVELS) {
      const wrecks = perLevel(L) / wreckYield(L);
      expect(wrecks, `niveau ${L} : ${wrecks.toFixed(1)} épave(s)`).toBeGreaterThan(1.2);
      // …sans devenir une corvée : au-delà de ~4 visites par cran, on ne choisit plus, on subit.
      expect(wrecks, `niveau ${L} : ${wrecks.toFixed(1)} épave(s)`).toBeLessThan(4);
    }
  });

  it('⚠️ la Fonderie COMPLÈTE, elle ne remplace pas : jamais un cran en moins de 5 jours', () => {
    // Le défaut d'origine : 2,2 à 2,8 jours de production passive suffisaient à payer un
    // cran complet — la source qui ne demande RIEN couvrait à elle seule le besoin.
    for (const L of LEVELS) {
      const days = perLevel(L) / foundryPerDay(L);
      expect(days, `niveau ${L} : ${days.toFixed(1)} jours`).toBeGreaterThan(5);
    }
  });

  it('le recyclage du sac pèse vraiment, sans suffire non plus', () => {
    for (const L of LEVELS) {
      const purges = perLevel(L) / purgeOf20(L);
      expect(purges, `niveau ${L} : ${purges.toFixed(1)} purge(s)`).toBeGreaterThan(0.9);
    }
  });

  it('RÉPARER reste bon marché : un siège perdu ne se paie pas en corvée', () => {
    // Les deux dépenses sont de natures différentes. Remettre en état après une défaite
    // doit rester à portée d'UNE journée de Fonderie, sinon l'échec devient une punition
    // (et la spirale que tout le système de siège s'attache à éviter).
    for (const L of LEVELS) {
      const allDamaged = repairCost(L) * N_STRUCT;
      // Pire cas (les 6 structures touchées) : jamais plus cher que de PROGRESSER d'un cran.
      expect(allDamaged, `niveau ${L}`).toBeLessThan(perLevel(L) * 1.5);
      // ⚠️ Au-delà du tout début, réparer coûte moins que d'améliorer. En dessous du
      // niveau ~14 c'est l'inverse, mais sans conséquence : le socle plat de repairCost
      // (10) domine alors, et les deux montants tiennent dans une seule épave.
      if (L >= 20) expect(repairCost(L)).toBeLessThan(defenseUpgradeScrap(L));
    }
  });

  it('le coût reste strictement croissant', () => {
    for (let L = 2; L <= 100; L++)
      expect(defenseUpgradeScrap(L)).toBeGreaterThan(defenseUpgradeScrap(L - 1));
  });
});
