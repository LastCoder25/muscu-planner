import { describe, it, expect } from 'vitest';
import { buildingUpgradeCost, BUILDING_TYPES, BUILD, plotsForLevel } from '@/lib/buildings';
import { goldCost, travelOneWayMin, travelFactor } from '@/lib/expedition';
import { computeLevel } from '@/lib/levels';
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
  it('⚠️ LA RÈGLE : un cran coûte PLUS qu’une journée de revenu, sans devenir un mur', () => {
    // ⚠️ MESURÉ PAR BÂTIMENT, plus sur « un cran sur TOUS ». Cette assertion portait sur
    // le total, qui mélange deux phénomènes — la forme de la courbe (ce qu'on veut
    // tester) et la montée de `plotsForLevel` — exactement le défaut que le test suivant
    // avait déjà corrigé de son côté. Le total faisait apparaître le niveau 5 comme une
    // anomalie (8,7 jours) alors qu'il a simplement 5 emplacements ouverts au lieu de 10.
    // Par bâtiment, la courbe est PLATE : 1,7 jour au niveau 5, 2,0 à 28, 2,4 à 100.
    for (const L of LEVELS) {
      const jours = buildingUpgradeCost(L) / goldPerDay(L);
      // Sous une journée, on est en permanence au plafond de son niveau et l'or n'a
      // plus de destination.
      expect(jours, `niveau ${L} : ${jours.toFixed(2)} jour(s) de revenu`).toBeGreaterThan(1);
      // Au-delà de quelques jours, on ne progresse plus, on attend. ⚠️ C'est ce qui
      // était livré : à `upBase` 1320, un seul cran coûtait 6,3 jours de revenu au
      // niveau 28, et le compte réel portait 312 jours de retard.
      expect(jours, `niveau ${L} : ${jours.toFixed(2)} jour(s) de revenu`).toBeLessThan(4);
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
    // enchaîne mines et donjons. Un cran doit encore coûter une demi-journée.
    for (const L of LEVELS) {
      const jours = buildingUpgradeCost(L) / (goldPerDay(L) * 2);
      expect(
        jours,
        `niveau ${L} : ${jours.toFixed(2)} jour(s) même à revenu doublé`,
      ).toBeGreaterThan(0.5);
    }
  });
  it('⚠️ SIMULATION SUR UN AN : le puits ne déborde pas, et n’est pas un mur non plus', () => {
    // ⚠️ CE TEST EXISTE PARCE QUE SON ABSENCE A COÛTÉ CHER. La v0.684 avait fixé
    // `upBase` PAR SIMULATION, puis écrit la conclusion dans un commentaire — sans
    // l’encoder. Quand le roster est passé de 7 à 10 bâtiments (v0.727), le puits s’est
    // approfondi de 43 % tout seul ; le seul test en place mesurait un PROXY (jours de
    // revenu par cran), et on s’est contenté d’en relâcher la borne (70 → 80). Résultat
    // mesuré un an plus tard : le joueur le plus actif ne tenait plus que 44 % du
    // plafond, et le compte réel portait 312 jours de revenu de retard.
    // On mesure donc désormais LA CHOSE ELLE-MÊME.
    const PROFILS: [string, number][] = [
      ['tranquille', 400],
      ['régulier', 700],
      ['très actif', 1066], // XP/jour mesurée sur un compte réel très assidu
    ];
    for (const [nom, xpParJour] of PROFILS) {
      const niv = BUILDING_TYPES.map(() => 0);
      let or = 0;
      let xp = 0;
      for (let j = 0; j < 365; j++) {
        xp += xpParJour;
        const L = computeLevel(xp).level;
        or += goldPerDay(L);
        const plots = Math.min(plotsForLevel(L), BUILDING_TYPES.length);
        // Le joueur achète ce qu'il peut, du moins cher au plus cher : il rattrape
        // d'abord ce qui est le plus en retard. Jamais au-dessus de son niveau.
        for (;;) {
          let best = -1;
          let bestC = Infinity;
          for (let i = 0; i < plots; i++) {
            if (niv[i]! >= L) continue;
            const c =
              niv[i] === 0 ? (BUILDING_TYPES[i]!.buildGold ?? 500) : buildingUpgradeCost(niv[i]!);
            if (c < bestC) {
              bestC = c;
              best = i;
            }
          }
          if (best < 0 || bestC > or) break;
          or -= bestC;
          niv[best]!++;
        }
      }
      const L = computeLevel(xp).level;
      const plots = Math.min(plotsForLevel(L), BUILDING_TYPES.length);
      const part = niv.slice(0, plots).reduce((a, b) => a + b, 0) / (plots * L);
      // PLANCHER : sous ~55 %, les bâtiments restent à la moitié de ton niveau pour
      // toujours — ils cessent d'être un objectif et deviennent du décor. C'est très
      // exactement l'état livré à 1320 (44-53 % mesurés).
      expect(part, `${nom} : ${(part * 100).toFixed(0)} % du plafond après un an`).toBeGreaterThan(
        0.55,
      );
      // PLAFOND : au-dessus de ~90 %, on a tout, et l'or n'a plus de destination —
      // le débordement que la v0.684 corrigeait.
      expect(part, `${nom} : ${(part * 100).toFixed(0)} % du plafond après un an`).toBeLessThan(
        0.9,
      );
    }
  });
});
