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
import { combatPowerRaw } from './combat';
import { refEscortUnits, CARAVAN } from './caravan';
import { fuseUnits } from './skirmish';
import { prestigeRankIndex } from './items';
import { characterRank, type CharacterRank } from './characterRank';
import { campSpecOf, harvestGuardOf, type Poi } from './expedition';

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
  return (Math.max(0, size) / CARAVAN.refEscort) * smallForceMult(level, size);
}

/** La puissance d'une équipe PLEINE de référence du niveau `L`, mémoïsée.
 *  ⚠️ PARESSEUSE et par PRÉFIXE : chaque niveau coûte la construction de 3 champions et de
 *  leurs 12 pièces, et la carte en interroge une vingtaine à chaque rendu. */
const POWERS: number[] = [];
export function refPowerAt(level: number): number {
  const L = Math.max(1, Math.round(level));
  for (let i = POWERS.length; i < L; i++)
    POWERS.push(combatPowerRaw(fuseUnits(refEscortUnits(i + 1), 'Référence')));
  return POWERS[L - 1]!;
}

/** Jusqu'où on cherche un niveau équivalent. ⚠️ Au-delà du plafond du jeu (100) : un lieu
 *  « au-dessus du joueur » (v0.982) peut dépasser, et rendre 100 pour tout ce qui suit
 *  écraserait les écarts au moment où ils comptent le plus. */
export const DIFFICULTY_MAX_LEVEL = 160;

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
function poiDifficultyLevel(poi: Pick<Poi, 'id' | 'type' | 'level'>): number {
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
