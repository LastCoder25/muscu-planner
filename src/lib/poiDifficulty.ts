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
import { characterRank, type CharacterRank } from './characterRank';
import { campSpecOf, harvestGuardOf, type Poi } from './expedition';

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
  21.88, 28.96, 35.7, 41.63, 48.63, 55.86, 62.47, 68.58, 75.58, 82.6, 109.52, 118.22, 126.89,
  136.59, 144.44, 154.18, 163.76, 173.59, 182.94, 192.93, 236.23, 248.06, 260.6, 273.8, 285.43,
  299.21, 314.09, 326.81, 341.18, 356.94, 447.93, 466.13, 484.86, 503.7, 522.9, 542.76, 562.77,
  583.28, 604.17, 625.61, 856.77, 889.62, 924.66, 959.19, 993.06, 1028.92, 1060.63, 1092.39,
  1125.46, 1155.7, 1779.37, 1827.92, 1880.8, 1931.77, 1986.28, 2039.86, 2097.21, 2151.09, 2208.54,
  2264.29, 2971.35, 3046.02, 3118.59, 3192.37, 3269.91, 3344.11, 3421.16, 3501.44, 3580.63, 3657.89,
  3976.74, 4063.23, 4153.75, 4235.68, 4313.3, 4396.81, 4474.52, 4557.56, 4640.96, 4723.72, 4801.84,
  4882.4, 4958.65, 5040.65, 5119.65, 5198.24, 5276.89, 5360.76, 5439.54, 5525.48, 5607.17, 5691.52,
  5773.03, 5855.66, 5939.85, 6022.59, 6109.13, 6194.69, 6283.41, 6366.75, 6456.2, 6542.18, 6628.76,
  6715.48, 6806.7, 6892.24, 6985.7, 7074.03, 7163.94, 7255.14, 7345.8, 7435.77, 7526.23, 7620.99,
  7713.33, 7811.41, 7900.14, 7998.87, 8091.7, 8185, 8278.31, 8377.6, 8471.84, 8566.42, 8667.35,
  8763.95, 8862.91, 8960.22, 9056.76, 9154.98, 9255.48, 9355.62, 9459.35, 9556.61, 9661.13, 9761.43,
  9862.31, 9962.15, 10064.71, 10168.73, 10271.07, 10378.58, 10479.18, 10583.66, 10687.22, 10790.19,
  10893.48, 11000.7, 11105.82, 11213.98, 11317.28, 11427.28, 11532.76, 11638.44, 11744.44, 11852.07,
  11961.58, 12069.74, 12183.89, 12292.7,
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
 * 🎯 LE NIVEAU ÉQUIVALENT : celui auquel une équipe PLEINE de référence aurait la force de ce
 * lieu. C'est LUI que le rang affiché doit dire — pas `poi.level`, qui ne parle que de ce que
 * vaut un ennemi pris isolément.
 *
 * ⚠️ Bornes assumées : sous la force d'une équipe de niveau 1 on rend 1 (un lieu peut être
 * plus facile que le plancher du jeu — un seul ennemi de bas niveau), au-dessus on rend
 * `DIFFICULTY_MAX_LEVEL`.
 */
export function difficultyLevel(level: number, size: number): number {
  const target = forceShare(level, size) * refPowerAt(level);
  if (target <= refPowerAt(1)) return 1;
  // `refPowerAt` est strictement croissante (testé) : une recherche binaire suffit, et elle
  // ne remplit la table que jusqu'au plafond une fois.
  let lo = 1;
  let hi = DIFFICULTY_MAX_LEVEL;
  if (target >= refPowerAt(hi)) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (refPowerAt(mid) <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * 🏅 LE NIVEAU QUE LE RANG AFFICHÉ D'UN LIEU DOIT DIRE.
 *
 * Camps, repaires et lieux de RÉCOLTE gardés : leur difficulté a deux facteurs (le niveau de
 * leurs ennemis et leur nombre) — on rend le niveau ÉQUIVALENT, celui auquel une équipe
 * pleine de référence pèserait autant.
 *
 * ⚠️ UNE FAILLE GARDE SON NIVEAU, et c'est une décision explicite (v0.928, « on ne change
 * pas le rang comme on a dit au départ ») : son rang est FIXÉ à son apparition et ne monte
 * pas avec l'âge, alors que sa difficulté, elle, grossit chaque jour. Son effectif est
 * affiché à côté (`👾 7 / 12`), donc rien n'est caché. Une bande en marche et l'arène
 * gardent le leur pour la même raison : leur effectif est dit ailleurs.
 */
export function poiDifficultyLevel(poi: Pick<Poi, 'id' | 'type' | 'level'>): number {
  const spec = campSpecOf(poi) ?? harvestGuardOf(poi);
  return spec ? difficultyLevel(poi.level, spec.size) : Math.max(1, poi.level);
}

/** 🏅 Le rang affiché d'un lieu. ⚠️ SOURCE UNIQUE : la pastille de la carte, la fiche ET les
 *  filtres de difficulté la lisent — trois définitions finiraient par se contredire, et
 *  filtrer « Argent » cesserait de montrer les lieux marqués Argent. */
export function poiRank(poi: Pick<Poi, 'id' | 'type' | 'level'>): CharacterRank {
  return characterRank(poiDifficultyLevel(poi));
}

/** Les RANGS présents sur la carte, du plus bas au plus haut, avec leur nombre de lieux —
 *  les options du filtre de difficulté. Seuls les rangs présents sont proposés : un filtre
 *  « Divin : 0 » n'apprend rien. */
export function poiRankCounts(
  pois: readonly Pick<Poi, 'id' | 'type' | 'level'>[],
): { rankIndex: number; count: number }[] {
  const n = new Map<number, number>();
  for (const p of pois) {
    const r = poiRank(p).rankIndex;
    n.set(r, (n.get(r) ?? 0) + 1);
  }
  return [...n].sort((a, b) => a[0] - b[0]).map(([rankIndex, count]) => ({ rankIndex, count }));
}
