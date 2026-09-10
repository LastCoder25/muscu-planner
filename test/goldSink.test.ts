import { describe, it, expect } from 'vitest';
import { buildingUpgradeCost, BUILDING_TYPES, BUILD, plotsForLevel } from '@/lib/buildings';
import { goldCost, travelOneWayMin, travelFactor } from '@/lib/expedition';
import { DUNGEONS, dungeonGold } from '@/data/dungeons';
import { DEFENSE_TYPES } from '@/lib/raid';

/** LE PUITS D'OR, mesuré contre le REVENU RÉEL.
 *
 *  ⚠️ ERREUR D'UNITÉ CORRIGÉE ICI (v0.684). Ce fichier comparait le coût d'un niveau de
 *  bâtiment à UNE expédition de mine. Or, mesuré sur un an, **79 % de l'or vient des
 *  donjons** — qu'on enchaîne ~8 fois par séance — et 14 % seulement des mines. Le
 *  dénominateur était donc ~13× trop petit : le test déclarait l'équilibre sain pendant
 *  que le joueur finissait l'année avec **149 M d'or en banque** et tout au plafond de
 *  son niveau dès le 2e mois. Un puits qui déborde n'est pas un puits.
 *
 *  ⚠️ DEUX INVARIANTS OPPOSÉS, et il faut les deux :
 *   • le coût doit DÉPASSER le revenu (sinon on est au plafond, l'or n'a plus d'emploi) ;
 *   • sans DÉRIVER avec le niveau (sinon c'est le MUR de la v0.657 : coût en L^2.6 contre
 *     revenus en L^1.6, 115 expéditions pour un niveau à 100, bâtiments gelés).
 *  D'où la règle : on déplace la courbe par son COEFFICIENT, jamais par son exposant. */

const LEVELS = [5, 10, 15, 20, 26, 35, 50, 70, 100];
/** ~4 séances de sport par semaine : le jeu est annexe. */
const SPORT_PER_DAY = 4 / 7;
/** Énergie d'une séance → ~8 descentes (coût plafonné à 40 ⚡). */
const RUNS_PER_SESSION = 8;

const bestDungeon = (L: number) =>
  [...DUNGEONS].filter((d) => d.recoLevel <= L).sort((a, b) => b.recoLevel - a.recoLevel)[0] ??
  DUNGEONS[0]!;

/** Net d'une expédition de mine à distance moyenne. */
function mineNet(level: number): number {
  const rth = (2 * travelOneWayMin(level, 0.5)) / 60;
  const cost = goldCost('mine', level);
  return Math.round(cost * (1.3 + travelFactor(rth))) - cost;
}
/** Production passive d'une Mine d'or au niveau du joueur, par jour. */
function goldMinePerDay(L: number): number {
  const t = BUILDING_TYPES.find((b) => b.id === 'gold_mine')!;
  return (t.prodPerHrPerLvl ?? 0) * L * BUILD.storageHours;
}
/** Revenu d'une JOURNÉE type : la séance de donjons au prorata, 2 mines, le passif. */
function goldPerDay(L: number): number {
  return (
    dungeonGold(bestDungeon(L)) * RUNS_PER_SESSION * SPORT_PER_DAY +
    2 * mineNet(L) +
    goldMinePerDay(L)
  );
}
/** Monter d'un cran tous les bâtiments DÉBLOQUÉS à ce niveau : le rythme de croisière.
 *  (L'enceinte a sa courbe dédiée, testée dans `raid.test` et `scrapEconomy.test`.) */
const cranTotal = (L: number) =>
  buildingUpgradeCost(L) * Math.min(plotsForLevel(L), BUILDING_TYPES.length);

describe("puits d'or : on court toujours après les derniers niveaux", () => {
  it('⚠️ LA RÈGLE : un cran sur tous les bâtiments coûte PLUS qu’une journée de revenu', () => {
    // Sinon le joueur est en permanence au plafond de son niveau et son or n'a plus de
    // destination — c'est très exactement ce que la simulation a constaté à 220.
    for (const L of LEVELS) {
      const jours = cranTotal(L) / goldPerDay(L);
      // Mesuré : ~25 jours au niveau 5, puis PLAT autour de 46-50 de 15 à 100. On ne
      // rattrape donc jamais tout à fait le plafond — c'est le but. Simulation sur un an :
      // le joueur passe de 55 % à 90 % du plafond et dépense ~100 % de son or.
      expect(jours, `niveau ${L} : ${jours.toFixed(2)} jour(s) de revenu`).toBeGreaterThan(15);
      // …sans devenir un mur : au-delà, on ne progresse plus, on attend.
      // ⚠️ BORNE RELEVÉE 70 → 80 en v0.727, et c’est une conséquence ARITHMÉTIQUE assumée :
      // le roster est passé de 7 à 10 bâtiments (Comptoir, Guilde, Centre de formation),
      // donc « un cran sur TOUS » coûte mécaniquement 10/7 de plus. Mesuré : ~49 → ~68-71
      // jours, uniformément. Ce qui compte est intact — le ratio reste PLAT (61,8 → 71,6,
      // test suivant) et l’AMORÇAGE ne bouge pas (test dédié ci-dessous). Ne pas relever
      // cette borne pour une autre raison qu’un roster qui grandit.
      expect(jours, `niveau ${L} : ${jours.toFixed(2)} jour(s) de revenu`).toBeLessThan(80);
    }
  });

  it('⚠️ le ratio ne DÉRIVE pas avec le niveau — c’est le MUR de la v0.657 qu’on interdit', () => {
    // Le coût et le revenu doivent garder la même forme. Un exposant plus raide que celui
    // des revenus (L^1.6) creuse un écart qui grandit sans fin : à L^2.6 il fallait 13
    // expéditions pour un niveau au niveau 5, et 115 au niveau 100.
    // ⚠️ ON MESURE UN SEUL BÂTIMENT, pas « un cran sur tous ». Cette assertion portait sur
    // le total, qui mélange DEUX phénomènes : la forme de la courbe (ce qu’on veut tester)
    // et la montée de `plotsForLevel` (1 emplacement par niveau, jusqu’au roster). Passer
    // le roster de 7 à 10 a fait bondir l’écart de 1,96 à 2,80 — sans que l’exposant ait
    // bougé d’un iota. Le test accusait donc la courbe d’un défaut qui n’était pas le sien.
    const ratios = LEVELS.map((L) => buildingUpgradeCost(L) / goldPerDay(L));
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    expect(max / min, `écart ${min.toFixed(2)} → ${max.toFixed(2)}`).toBeLessThan(2.5);

    // …et une fois TOUS les emplacements ouverts, le total ne dérive pas non plus.
    const pleins = LEVELS.filter((L) => plotsForLevel(L) >= BUILDING_TYPES.length).map(
      (L) => cranTotal(L) / goldPerDay(L),
    );
    expect(Math.max(...pleins) / Math.min(...pleins)).toBeLessThan(2.5);
  });

  it('⚠️ POSER le Comptoir et la Guilde reste à portée d’un DÉBUTANT', () => {
    // C’est le seul chiffre qui décide si la feature caravanes existe pour le joueur
    // qu’elle vise. Le puits d’or s’est approfondi avec le roster ; l’ENTRÉE, elle, ne
    // doit pas bouger. Mesuré : 1 200 or, soit ~0,5 jour de revenu au niveau 3.
    const entree = ['caravanserail', 'guild'].reduce(
      (s, id) => s + (BUILDING_TYPES.find((t) => t.id === id)?.buildGold ?? 0),
      0,
    );
    for (const L of [3, 5, 8]) {
      expect(entree / goldPerDay(L), `niveau ${L}`).toBeLessThan(1);
    }
  });
  it('l’AMORÇAGE reste doux : construire ses premiers bâtiments ne demande pas une semaine', () => {
    // On durcit la MONTÉE, pas l'entrée. Poser un bâtiment doit rester à portée immédiate.
    for (const t of BUILDING_TYPES) expect(t.buildGold).toBeLessThan(goldPerDay(10));
    for (const t of DEFENSE_TYPES) expect(t.buildGold).toBeLessThan(goldPerDay(12));
  });

  it('le coût reste strictement croissant avec le niveau', () => {
    for (let L = 2; L <= 100; L++) {
      expect(buildingUpgradeCost(L)).toBeGreaterThan(buildingUpgradeCost(L - 1));
    }
  });

  it('⚠️ le puits tient MÊME pour un joueur qui optimise tout : revenu doublé', () => {
    // Garde-fou contre la régression qui a motivé cette réécriture : sous-estimer le
    // revenu fait déclarer sain un puits qui déborde. On refait donc la mesure avec un
    // revenu DEUX FOIS supérieur au modèle — un joueur plus assidu, mieux équipé, qui
    // enchaîne mines et donjons. Le coût d'un cran doit encore dépasser sa journée.
    for (const L of LEVELS) {
      const jours = cranTotal(L) / (goldPerDay(L) * 2);
      expect(
        jours,
        `niveau ${L} : ${jours.toFixed(2)} jour(s) même à revenu doublé`,
      ).toBeGreaterThan(5);
    }
  });
});
