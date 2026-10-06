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
    if (p.dataset.scrollLock) return p;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** 🔒 La page de la carte est-elle VERROUILLÉE (demandé : « quand j'arrive sur la carte, je ne
 *  peux pas glisser l'écran ; je n'ai accès au dessous que par la flèche. Par contre, quand je
 *  touche un lieu, la fenêtre pour choisir les troupes doit pouvoir défiler ») ? Oui sur la
 *  carte seule ; non dès qu'une fenêtre s'ouvre depuis elle (fiche d'un lieu, équipe d'un
 *  voyage, base, renfort, partie dépliée sous la carte) ou qu'une autre île la remplace.
 *  Non plus quand la carte ne tient pas à l'écran (`fits` : une récompense du jour ou le guide
 *  au-dessus la poussent en bas) : on y descend alors au doigt. */
export function mapScrollLocked(s: {
  viewed: boolean;
  panel: boolean;
  selected: boolean;
  focusTrip: boolean;
  baseOpen: boolean;
  quick: boolean;
  fits: boolean;
}): boolean {
  if (!s.fits) return false;
  return !(s.viewed || s.panel || s.selected || s.focusTrip || s.baseOpen || s.quick);
}

/** 🔒 Coupe le défilement du conteneur qui fait défiler `el` (la page, ou le volet du
 *  cockpit) : plus aucun glissé au doigt ne le bouge, mais le code le fait toujours défiler
 *  (les flèches, `scrollTo`). ⚠️ Pas d'écouteur `touchmove` : sur la vraie carte, Chrome les
 *  rend non annulables (fil principal chargé) ; le verrou CSS, lui, tient. Rend le
 *  déverrouillage. */
export function lockPageScroll(el: HTMLElement): () => void {
  const box = scrollContainerOf(el);
  if (!box) return () => {};
  const prev = box.style.overflowY;
  box.style.overflowY = 'hidden';
  box.dataset.scrollLock = '1';
  return () => {
    box.style.overflowY = prev;
    delete box.dataset.scrollLock;
  };
}
