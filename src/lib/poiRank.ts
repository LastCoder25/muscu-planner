// poiRank.ts — LE RANG AFFICHÉ D'UN LIEU. Pur/testable.
//
// ⚠️ SÉPARÉ de `poiDifficulty.ts`, qui porte la COURBE et n'a aucune dépendance : le spawn
// (`expedition.ts`) doit pouvoir dériver un niveau depuis une difficulté visée, or ce module
// lit `expedition` pour connaître la taille d'une force. Les garder ensemble ferait un cycle.
import { characterRank, type CharacterRank } from './characterRank';
import { poiDifficultyLevel, type Poi } from './expedition';

// 🏅 La définition vit dans `expedition.ts` (les récompenses la lisent) ; ré-exportée ici
// pour les écrans qui la lisaient déjà.
export { poiDifficultyLevel };

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
