import { describe, it, expect } from 'vitest';
import { defenseUpgradeScrap, defenseUpgradeCost, repairCost, DEFENSE_TYPES } from '@/lib/raid';
import { HARVEST, travelOneWayMin } from '@/lib/expedition';
import { BUILDING_TYPES } from '@/lib/buildings';
import { DUNGEONS, dungeonFoes, dungeonGold } from '@/data/dungeons';
import { scrapValue, rollDrop, type Item } from '@/lib/items';
import { mulberry32 } from '@/lib/combat';

/** L'économie de la FERRAILLE, mesurée de bout en bout, en JOURS RÉELS.
 *
 *  ⚠️ RÈGLE DE CONCEPTION (décidée avec l'utilisateur) : **la ferraille doit être PLUS
 *  DURE à obtenir que l'or.** L'or mesure le volume de jeu — il tombe des donjons qu'on
 *  fait de toute façon ; la ferraille mesure qu'on est allé la CHERCHER. Si les deux
 *  avancent au même rythme, l'enceinte n'a qu'un seul verrou et le second est décoratif.
 *
 *  ⚠️ PIÈGE D'UNITÉ, qui a fait conclure l'inverse une première fois : comparer « N séances
 *  de sport » à « N jours » n'a aucun sens. Une séance n'arrive pas tous les jours — on
 *  ramène donc TOUT en jours, avec un rythme sportif réaliste. Sous cette lecture, la
 *  ferraille était en réalité ~1,7× plus RAPIDE que l'or (compte réel : 1 327 🔩 en banque
 *  pour 6 634 🪙, avec un sac vidé à 5 objets). */

const N_STRUCT = DEFENSE_TYPES.length;
/** ~4 séances de sport par semaine : le jeu est annexe, il ne se joue pas tous les jours. */
const SPORT_PER_DAY = 4 / 7;
/** Niveaux où la règle s'applique. ⚠️ Le niveau 12 (déblocage de la défense) en est
 *  EXCLU volontairement : l'amorçage doit rester doux, même politique que le premier
 *  niveau de chaque structure, qui ne coûte déjà aucune ferraille. */
const LEVELS = [20, 26, 40, 60, 100];

const bestDungeon = (L: number) =>
  [...DUNGEONS].filter((d) => d.recoLevel <= L).sort((a, b) => b.recoLevel - a.recoLevel)[0]!;

/** Une visite d'épave — la source qu'on va CHERCHER (une expédition entière y passe). */
function wreckYield(L: number): number {
  const rthH = (2 * travelOneWayMin(L, 0.5)) / 60;
  return Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * Math.min(0.5 + rthH, 6));
}
/** Fonderie : la production PASSIVE, par jour. */
function foundryPerDay(L: number): number {
  const t = BUILDING_TYPES.find((b) => b.id === 'foundry')!;
  return (t.prodPerHrPerLvl ?? 0) * L * 24;
}
/** Ferraille tirée du butin RÉEL d'une séance de 8 descentes, tout recyclé. */
function sessionRecycled(L: number): number {
  const d = bestDungeon(L);
  const foes = dungeonFoes(d).length;
  let sc = 0;
  const T = 300;
  for (let t = 0; t < T; t++) {
    const rng = mulberry32((t * 7919 + 13) >>> 0);
    for (let r = 0; r < 8; r++)
      for (let i = 0; i < foes; i++) {
        const it = rollDrop(rng, {
          cleared: true,
          defeated: 1,
          level: d.dropLevel,
          spread: 1,
          luck: d.dropLuck,
          playerLevel: L,
        });
        if (it) sc += scrapValue({ ...it, id: 'x' } as Item);
      }
  }
  return sc / T;
}
/** Journée type : le butin recyclé de la séance (au prorata), UNE épave, la Fonderie. */
const scrapPerDay = (L: number) =>
  sessionRecycled(L) * SPORT_PER_DAY + wreckYield(L) + foundryPerDay(L);
const goldPerDay = (L: number) => dungeonGold(bestDungeon(L)) * 8 * SPORT_PER_DAY;
/** Monter TOUTES les structures d'un cran : le rythme de croisière. */
const cranScrap = (L: number) => defenseUpgradeScrap(L) * N_STRUCT;
const cranGold = (L: number) => defenseUpgradeCost(L) * N_STRUCT;

describe('ferraille : plus dure à obtenir que l’or', () => {
  it('⚠️ LA RÈGLE : à niveau égal, un cran d’enceinte prend PLUS de jours en ferraille qu’en or', () => {
    for (const L of LEVELS) {
      const daysScrap = cranScrap(L) / scrapPerDay(L);
      const daysGold = cranGold(L) / goldPerDay(L);
      const ratio = daysScrap / daysGold;
      expect(
        ratio,
        `niveau ${L} : ${daysScrap.toFixed(2)} j de ferraille contre ${daysGold.toFixed(2)} j d’or`,
      ).toBeGreaterThan(1.1);
      // …sans virer au mur : au-delà, l'enceinte n'attendrait plus que le métal.
      expect(ratio, `niveau ${L} : ratio ${ratio.toFixed(2)}`).toBeLessThan(2.2);
    }
  });

  it('la source qu’on va CHERCHER domine le débit — pas les sources passives', () => {
    // C'est ce qui donne son sens au geste : l'épave doit peser plus que le recyclage du
    // butin (qui tombe de toute façon) et que la Fonderie (qui tourne seule) réunis.
    for (const L of LEVELS) {
      const part = wreckYield(L) / scrapPerDay(L);
      expect(
        part,
        `niveau ${L} : l’épave ne pèse que ${(part * 100).toFixed(0)} %`,
      ).toBeGreaterThan(0.45);
    }
  });

  it('⚠️ la Fonderie COMPLÈTE, elle ne remplace pas : jamais un cran en moins de 5 jours', () => {
    // Défaut d'origine : 2,2 à 2,8 jours de production passive suffisaient à payer un cran
    // complet — la source qui ne demande RIEN couvrait à elle seule le besoin.
    for (const L of LEVELS) {
      const days = cranScrap(L) / foundryPerDay(L);
      expect(days, `niveau ${L} : ${days.toFixed(1)} jours`).toBeGreaterThan(5);
    }
  });

  it('RÉPARER reste bon marché : un siège perdu ne se paie pas en corvée', () => {
    // Améliorer et réparer sont deux dépenses de natures différentes. Remettre l'enceinte
    // en état après une défaite doit rester à portée d'un jour de Fonderie, sinon l'échec
    // devient une punition — la spirale que tout le système de siège s'attache à éviter.
    for (const L of LEVELS) {
      expect(repairCost(L)).toBeLessThan(foundryPerDay(L) * 1.5);
      expect(repairCost(L) * N_STRUCT).toBeLessThan(cranScrap(L)); // tout réparer < progresser
    }
  });

  it('le coût reste strictement croissant', () => {
    for (let L = 2; L <= 100; L++)
      expect(defenseUpgradeScrap(L)).toBeGreaterThan(defenseUpgradeScrap(L - 1));
  });
});
