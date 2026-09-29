// labyrinthView.ts — ce que l'écran du Labyrinthe AFFICHE, dérivé de l'état (pur/testé).
// Rien ici ne décide d'un combat ni d'un butin : on lit le run et le palier pour les peindre.
import { LABY_GUARDIANS, type LabyFoeKind } from '@/data/labyrinthFoes';
import { labyTierIndex } from '@/lib/labyrinthRun';
import type { Labyrinth } from '@/data/labyrinths';

export type FloorPip = 'done' | 'cur' | 'next';

/** Une pastille par étage : ceux qu'on a quittés, celui où l'on est, ceux qui restent. */
export function floorPips(floor: number, floors: number): FloorPip[] {
  return Array.from({ length: Math.max(0, floors) }, (_, i) =>
    i < floor ? 'done' : i === floor ? 'cur' : 'next',
  );
}

/** Le gardien qu'on affronte au fond d'un palier — celui que `pickLabyFoe` tire pour le boss
 *  (même index de rang), donc la tuile montre la créature que le combat mettra en face. */
export function labyGuardian(laby: Labyrinth): LabyFoeKind {
  const i = Math.min(LABY_GUARDIANS.length - 1, labyTierIndex(laby));
  return LABY_GUARDIANS[i]!;
}

/** État de la barrière de départ (🔰, une par descente) pour la barre d'état, ou `null` si le
 *  héros n'en porte pas. `left` absent = elle n'a pas encore servi, donc elle est pleine. */
export function barrierLabel(startShield: number, left: number | undefined): string | null {
  if (!(startShield > 0)) return null;
  if (left === undefined) return 'pleine';
  return left > 0 ? `${left} PV` : 'épuisée';
}
