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

/** 🏅 Le rang affiché d'un lieu. ⚠️ SOURCE UNIQUE : la pastille de la carte, la fiche et les
 *  bords de carte la lisent — plusieurs définitions finiraient par se contredire. */
export function poiRank(poi: Pick<Poi, 'id' | 'type' | 'level'>): CharacterRank {
  return characterRank(poiDifficultyLevel(poi));
}
