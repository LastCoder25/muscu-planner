// poiRank.ts — LE RANG AFFICHÉ D'UN LIEU. Pur/testable.
//
// ⚠️ SÉPARÉ de `poiDifficulty.ts`, qui porte la COURBE et n'a aucune dépendance : le spawn
// (`expedition.ts`) doit pouvoir dériver un niveau depuis une difficulté visée, or ce module
// lit `expedition` pour connaître la taille d'une force. Les garder ensemble ferait un cycle.
import { characterRank, type CharacterRank } from './characterRank';
import { campSpecOf, harvestGuardOf, type Poi } from './expedition';
import { difficultyLevel } from './poiDifficulty';

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
