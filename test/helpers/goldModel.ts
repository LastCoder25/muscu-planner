// Le MODÈLE DE REVENU d'une journée type — l'étalon des tests d'économie.
//
// ⚠️ EXTRAIT de `goldSink.test.ts` (il y vivait en privé) pour que le débit des CAMPS DE
// FACTION se mesure contre LE MÊME dénominateur. Une seconde copie du modèle aurait divergé
// au premier réglage, et c'est précisément par un mauvais dénominateur que ce fichier a déjà
// laissé passer un puits qui débordait (v0.684) puis un puits devenu mur (v0.733).
import { goldCost, travelOneWayMin, travelFactor } from '@/lib/expedition';
import { DUNGEONS, dungeonGold, dungeonSummonStones } from '@/data/dungeons';

export const LEVELS = [5, 10, 15, 20, 26, 35, 50, 70, 100];
/** ~4 séances de sport par semaine : le jeu est annexe. */
const SPORT_PER_DAY = 4 / 7;
/** Énergie d'une séance → ~8 descentes (coût plafonné à 40 ⚡). */
const RUNS_PER_SESSION = 8;
/** Descentes de donjon par JOUR, au rythme sportif du modèle. */
const RUNS_PER_DAY = RUNS_PER_SESSION * SPORT_PER_DAY;

const bestDungeon = (L: number) =>
  [...DUNGEONS].filter((d) => d.recoLevel <= L).sort((a, b) => b.recoLevel - a.recoLevel)[0] ??
  DUNGEONS[0]!;

/** Net d'une expédition de mine LOINTAINE — ce que joue un joueur qui optimise.
 *  ⚠️ ÉTAIT à distance MOYENNE (0,5), et c'est ce qui a fait SOUS-ESTIMER le revenu d'un
 *  facteur ~3 : depuis la v0.683 la récompense est SUPER-LINÉAIRE en temps de trajet
 *  (`TRAVEL_EXP` 1,4), donc aller loin paie bien plus que proportionnellement. */
export const MINE_DIST = 0.9;
export function mineNet(level: number): number {
  const rth = (2 * travelOneWayMin(level, MINE_DIST)) / 60;
  const cost = goldCost('mine', level);
  return Math.round(cost * (1.3 + travelFactor(rth))) - cost;
}
// ⚠️ PLUS DE MINE D’OR : le bâtiment a été retiré du registre (demandé), donc plus
// aucune production passive d’or. Mesuré avant retrait, elle pesait 19,3 % du revenu au
// niveau 10 mais seulement 3,4 % au niveau 100 — l’or vient des donjons et de la carte.
/** Revenu d'une JOURNÉE type : la séance de donjons au prorata, 2 mines LOINTAINES, le
 *  passif. Deux expéditions = ce que lance un joueur qui ouvre l'app matin et soir ; le
 *  héros n'en menant qu'UNE à la fois (~7 h de trajet au niveau 28), c'est aussi à peu
 *  près le plafond pratique. */
export function goldPerDay(L: number): number {
  return dungeonGold(bestDungeon(L)) * RUNS_PER_DAY + 2 * mineNet(L);
}
/** 🔮 Pierres d'invocation d'une journée type : elles tombent au NETTOYAGE d'un donjon
 *  (`dungeonSummonStones`, source unique de la règle). C'est l'étalon auquel se comparent
 *  les autres robinets de pierres. */
export function stonesPerDay(L: number): number {
  return dungeonSummonStones(bestDungeon(L)) * RUNS_PER_DAY;
}
