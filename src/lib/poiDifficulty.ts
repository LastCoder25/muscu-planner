// poiDifficulty.ts — LA DIFFICULTÉ D'UN LIEU, EN UN SEUL NOMBRE. Pur/testable.
//
// ⚠️ POURQUOI (2026-09-23 ; signalé par l'utilisateur : « 2 lieux argent 3 étoiles, l'un à
// 93 % avec 3 champions, l'autre à 0 % avec les mêmes »). Le rang affiché d'un lieu vient de
// son NIVEAU (`characterRank(poi.level)`), or sa difficulté a DEUX facteurs : le niveau de
// ses ennemis ET leur nombre (`campFoe` : la force vaut `size` champions de référence du
// niveau du lieu). Mesuré, un lieu affiché « Argent ★3 » recouvrait donc une difficulté
// allant de **Bronze ★2** (1 ennemi) à **Argent ★3** (3 ennemis) — cinq crans sous la même
// étiquette, et vingt en fin de partie. L'étiquette ne disait que la moitié.
//
// ⚠️ LE MODÈLE EST DÉJÀ CELUI DU MOTEUR, il n'était pas dit : `fuseUnits` SOMME l'offense et
// la survie d'un groupe, donc qualité et quantité sont exactement substituables — six
// champions qui valent f égalent trois qui valent 2f. C'est ce qui autorise à ramener les
// deux facteurs à UN nombre : « ce lieu vaut une équipe pleine de niveau L' ».
//
// ⚠️ UN SEUL ARBITRE : `combatPower`, celui qui tranche déjà les objets, les donjons, les
// familiers et la défense de la base. En inventer un second pour la carte recréerait le
// défaut « deux comparateurs qui disent des trucs différents » (v0.744).
import { prestigeRankIndex } from './items';

/** Le nombre de champions d'une équipe de RÉFÉRENCE — l'unité dans laquelle se comptent la
 *  force d'un lieu (`forceShare`) et l'équipe qui sert d'étalon aux combats
 *  (`CARAVAN.refEscort`, qui la LIT).
 *  ⚠️ Elle vit ICI, dans le module sans dépendance, et non dans `caravan.ts` : sinon
 *  `poiDifficulty` devrait importer `caravan`, qui doit lire la difficulté pour l'XP de
 *  mission — un cycle. */
export const REF_TEAM = 3;

/**
 * 🧍 CORRECTION DES PETITES FORCES, PAR RANG (2026-09-22, mesuré ; demandé par l'utilisateur :
 * « aplanir la courbe par niveau »). La force d'un camp est une fraction LINÉAIRE du trio de
 * référence fondu : juste pour 2 contre 2 et 3 contre 3 (74-100 % à tous les niveaux), faux
 * pour UN champion contre une force de taille 1 — un champion seul n'a pas la forme équilibrée
 * du trio, et les champions de haut rang sont plus SPÉCIALISÉS. Mesuré (moyenne des 3 champions
 * de référence contre une taille 1) : 83-86 % aux rangs 0-3, puis 75 · 69 · 61 · 51 · 49 · 46 %
 * aux rangs 4 à 9. Chaque valeur est bisectée pour ramener ce cas à ~82 % (la valeur des
 * premiers rangs) ; les rangs 0-3, déjà dans la bande, restent à 1 (on ne durcit rien).
 * ⚠️ Pleine à la taille 1, elle s'efface linéairement jusqu'à la taille 2 (`smallForceWeight`) :
 * au-delà, la calibration mesurée des camps est intacte.
 * ⚠️ VIT ICI et non dans `camp.ts` (2026-09-23) : « quelle force a ce lieu » et « ce que cette
 * force vaut en rang » sont la même question, et `camp.ts` doit pouvoir lire la seconde sans
 * qu'un cycle d'imports s'installe.
 */
export const SMALL_FORCE_RELIEF: readonly number[] = [
  1, 1, 1, 1, 0.96, 0.93, 0.82, 0.85, 0.85, 0.84,
];

/** Poids de la correction selon la taille : 1 jusqu'à la taille 1, 0 à partir de 2. */
export function smallForceWeight(size: number): number {
  return Math.min(1, Math.max(0, 2 - size));
}

/** Multiplicateur de force d'une force de taille `size` au niveau `level`. */
export function smallForceMult(level: number, size: number): number {
  const i = Math.min(SMALL_FORCE_RELIEF.length - 1, prestigeRankIndex(Math.max(1, level)));
  return 1 + smallForceWeight(size) * (SMALL_FORCE_RELIEF[i]! - 1);
}

/**
 * 💪 LA FORCE d'un lieu, en ÉQUIPES DE RÉFÉRENCE de son niveau (1 = une équipe pleine).
 * ⚠️ C'est EXACTEMENT le multiplicateur que `campFoe` applique à la référence — la même
 * expression, écrite une seule fois : une seconde copie finirait par annoncer une force que
 * le combat n'applique pas.
 */
export function forceShare(level: number, size: number): number {
  return (Math.max(0, size) / REF_TEAM) * smallForceMult(level, size);
}

/**
 * 📐 LA COURBE DE RÉFÉRENCE : la puissance d'une équipe PLEINE de `REF_TEAM` champions de
 * référence, ÉQUIPÉS, du niveau 1 au niveau 160 — c'est l'échelle dans laquelle toute
 * difficulté s'exprime.
 *
 * ⚠️ TABULÉE, et c'est un choix : elle se calcule depuis `refEscortUnits` (caravan.ts), or
 * `caravan.ts` doit LIRE la difficulté pour l'XP de mission. L'importer d'ici ferait un
 * cycle. C'est le patron des autres courbes de calibration du projet
 * (`RANK_OPENING_RELIEF`, `LABY_CONTENT_BOOST`, `RIFT_RELIEF`) : une table mesurée, et un
 * TEST qui la compare à la vraie fonction — elle ne peut donc pas dériver en silence.
 * ⚠️ NE PAS la modifier à la main : la régénérer depuis `refEscortUnits` si la référence
 * change (le test dira laquelle des deux a bougé).
 */
export const REF_POWER: readonly number[] = [
  21.88, 28.96, 35.7, 41.63, 48.63, 55.86, 62.47, 68.58, 75.58, 82.6, 112.14, 121.06, 129.66,
  139.98, 147.77, 158.09, 167.91, 178.29, 187.5, 198.04, 251.21, 265.88, 279.28, 293.41, 306.25,
  321.93, 337.11, 351.32, 366.72, 382.93, 506.94, 529.55, 551.06, 572.6, 597.04, 619.8, 643.39,
  670.48, 695.29, 718.79, 1050.42, 1085.14, 1124.11, 1156.3, 1194.28, 1231.7, 1263.78, 1298.53,
  1337.94, 1375.31, 2309.59, 2378.3, 2455.48, 2521.52, 2607.91, 2679.21, 2759.74, 2828.28, 2902.48,
  2976.43, 4017.25, 4110.91, 4205.97, 4297, 4396.35, 4489.97, 4589.39, 4691.22, 4787.99, 4890.12,
  5666.83, 5776.5, 5892.4, 6011.29, 6124.38, 6247.35, 6357.37, 6483.95, 6600.97, 6722.64, 7214.98,
  7336.23, 7454.75, 7580.3, 7705.08, 7823.25, 7944.69, 8077.75, 8198.01, 8329.6, 8925.95, 9062.15,
  9193.94, 9326.06, 9464.3, 9595.19, 9732.5, 9872.73, 10018.78, 10151.33, 10297.76, 10438.35,
  10580.36, 10715.66, 10864.9, 11003.72, 11155.53, 11298.5, 11445.06, 11592.33, 11735.8, 11884.32,
  12027.64, 12177.79, 12329.53, 12483.07, 12633.68, 12791.84, 12940.51, 13096.98, 13244.17,
  13405.27, 13554.83, 13714.15, 13873.51, 14031.28, 14189.77, 14345.41, 14504.8, 14660.26, 14821.41,
  14984.15, 15150.28, 15311.44, 15481.06, 15641.6, 15801.59, 15961.85, 16132.11, 16301.88, 16465.84,
  16642.3, 16810.45, 16981.38, 17145.85, 17317.47, 17484.7, 17654.87, 17831.28, 18008.34, 18179.87,
  18360.41, 18532.72, 18702.84, 18876.34, 19055.6, 19236.16, 19407.92, 19600.5, 19779.31,
];

/** La puissance d'une équipe PLEINE de référence du niveau `L`. */
export function refPowerAt(level: number): number {
  const L = Math.max(1, Math.min(REF_POWER.length, Math.round(level)));
  return REF_POWER[L - 1]!;
}

/** Jusqu'où on cherche un niveau équivalent. ⚠️ Au-delà du plafond du jeu (100) : un lieu
 *  « au-dessus du joueur » (v0.982) peut dépasser, et rendre 100 pour tout ce qui suit
 *  écraserait les écarts au moment où ils comptent le plus. */
export const DIFFICULTY_MAX_LEVEL = REF_POWER.length;

/**
 * ⚖️ CE QUE CE LIEU PÈSE, dans l'unité de la courbe de référence : `size` ennemis du niveau
 * `level` valent cette puissance-là. C'est la SEULE quantité que les deux fonctions ci-dessous
 * comparent — l'une cherche le niveau qui la PORTE, l'autre le niveau qui l'ATTEINT. Écrite une
 * fois, l'inversion se lit au lieu d'être postulée en commentaire.
 */
function poiPower(level: number, size: number): number {
  return forceShare(level, size) * refPowerAt(level);
}

/**
 * 🎯 LE NIVEAU ÉQUIVALENT : celui auquel une équipe PLEINE de référence aurait la force de ce
 * lieu. C'est LUI que le rang affiché doit dire — pas `poi.level`, qui ne parle que de ce que
 * vaut un ennemi pris isolément.
 *
 * ⚠️ Bornes assumées : sous la force d'une équipe de niveau 1 on rend 1 (un lieu peut être
 * plus facile que le plancher du jeu — un seul ennemi de bas niveau), au-dessus on rend
 * `DIFFICULTY_MAX_LEVEL`. ⚠️ AUCUNE sortie rapide sur ces deux bornes : la bisection y converge
 * déjà (`hi` descend jusqu'à 1, `lo` monte jusqu'au plafond). Un garde qu'aucune valeur ne peut
 * distinguer donne la confiance sans la couverture — la saturation vit dans un TEST.
 */
export function difficultyLevel(level: number, size: number): number {
  const vaut = poiPower(level, size);
  // `refPowerAt` est strictement croissante (testé) : une recherche binaire suffit.
  let lo = 1;
  let hi = DIFFICULTY_MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (refPowerAt(mid) <= vaut) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * 🎲 L'INVERSE : le niveau à donner à une force de `size` ennemis pour qu'elle ATTEIGNE OU
 * DÉPASSE la difficulté `cible`. C'est ce qui permet au spawn de tirer un RANG de difficulté
 * puis d'en dériver le niveau des ennemis — « peu de forts » et « beaucoup de faibles »
 * deviennent deux façons de remplir le même rang.
 *
 * ⚠️ Ce n'est PAS une inversion exacte : la courbe avance par crans, donc le niveau retenu
 * dépasse souvent la cible (testé). On cherche le plus petit qui l'atteint.
 * ⚠️ Elle compare le MÊME `poiPower` que `difficultyLevel`, au lieu de bisecter SUR une
 * bisection : la propriété cherchée s'écrit en une comparaison, pas en O(log²).
 * ⚠️ BORNÉ. Aux rangs les plus hauts, « peu d'ennemis très forts » n'existe pas : il faudrait
 * un ennemi plus puissant que ce que le plafond du jeu produit. On rend alors le niveau
 * maximal, et la difficulté reste SOUS la cible — le rang affiché, lui, est calculé, donc il
 * dira la vérité plutôt que la cible manquée.
 */
export function levelForDifficulty(cible: number, size: number): number {
  // ⚠️ BORNÉE AU PLAFOND, explicitement : au-delà, `refPowerAt` écrête de toute façon, et
  // laisser la cible déborder ferait dépendre le résultat d'un écrêtage implicite. Inatteignable
  // en jeu (la cible vient de `riftLevelFor`, bornée par le niveau du joueur).
  const c = Math.max(1, Math.min(DIFFICULTY_MAX_LEVEL, Math.round(cible)));
  // ⚠️ Ce garde-ci MORD : une force nulle ne porte jamais rien, donc la bisection partirait au
  // plafond là où le niveau 1 suffit à « atteindre » la difficulté 1.
  if (c <= 1) return 1;
  const vise = refPowerAt(c);
  let lo = 1;
  let hi = DIFFICULTY_MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (poiPower(mid, size) >= vise) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
