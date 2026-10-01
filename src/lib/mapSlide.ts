/**
 * ↕️ LE BOUTON DE GLISSEMENT DE LA CARTE (v1.8.3, demandé : « un bouton à gauche du zoom pour
 * slider jusqu'aux tuiles des expéditions, et remonter tout en haut si on les voit »).
 *
 * Une seule règle : si la rangée de tuiles sous la carte est à l'écran, le bouton REMONTE en
 * haut de la page (ressources, effectifs) ; sinon il DESCEND jusqu'aux tuiles. `margin` évite
 * de dire « visible » pour une rangée dont seul un liseré dépasse du bas de l'écran.
 */
export type MapSlide = 'down' | 'up';

export const MAP_SLIDE_MARGIN = 40;

export function mapSlideDirection(
  tilesTop: number,
  viewportHeight: number,
  margin = MAP_SLIDE_MARGIN,
): MapSlide {
  return tilesTop < viewportHeight - margin ? 'up' : 'down';
}

/** Le conteneur qui fait défiler `el` : le premier parent qui défile vraiment, sinon la page.
 *  ⚠️ En cockpit (Z Fold déplié), le volet droit est son propre conteneur : remonter la
 *  fenêtre n'y ferait rien. */
export function scrollContainerOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
