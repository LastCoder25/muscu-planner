// stageSkip.ts — faut-il jouer l'animation d'un combat de donjon, de boss ou de faille ?
// (pur/testé : la page ne fait que lire la raison et l'écrire au rapport)

/** Victoire assurée à partir de ce % : le rejeu d'un contenu déjà fait est passé d'office. */
export const SURE_WIN_PCT = 90;

/** Pourquoi l'animation est passée — `null` : on la joue.
 *  - `setting` : le joueur a choisi de TOUJOURS passer (donjons, boss, faille), 1re visite comprise ;
 *  - `sure` : victoire assurée sur un contenu DÉJÀ fait (la découverte reste animée). */
export type StageSkipReason = 'setting' | 'sure' | null;

/** ⚠️ `winPct` est un GETTER : la chance de victoire se simule (Monte-Carlo), inutile de la
 *  calculer quand le réglage suffit à décider. */
export function stageSkipReason(o: {
  always: boolean;
  firstVisit: boolean;
  winPct: () => number;
}): StageSkipReason {
  if (o.always) return 'setting';
  if (o.firstVisit) return null;
  return o.winPct() >= SURE_WIN_PCT ? 'sure' : null;
}
