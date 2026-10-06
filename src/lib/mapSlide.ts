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

/** Un bloc sur le chemin du doigt : où il en est de son défilement vertical. */
export interface ScrollBoxY {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** Le bloc défile en hauteur (`overflow-y: auto | scroll`). */
  scrollsY: boolean;
}

/** 👆 Un glissé vertical de `dy` px (doigt vers le bas = positif) fait-il défiler un bloc
 *  INTÉRIEUR à la page (la carte, une liste) ? Sinon, c'est la page qui défilerait. */
export function innerCanScrollY(boxes: readonly ScrollBoxY[], dy: number): boolean {
  return boxes.some(
    (b) =>
      b.scrollsY && (dy > 0 ? b.scrollTop > 0 : b.scrollTop + b.clientHeight < b.scrollHeight - 1),
  );
}

/** 👆 SOUS LA CARTE, PAS AU DOIGT (demandé : « on ne peut pas défiler avec le doigt, seules
 *  les flèches y mènent ») : annule tout glissé vertical qui ferait défiler la page — ou le
 *  volet du cockpit — autour de `root`. La carte, les listes et les rangées de tuiles défilent
 *  toujours ; les flèches font défiler par le code (`scrollTo`), que rien n'arrête. Le choix
 *  se fait au premier mouvement du geste, puis tient jusqu'au lever du doigt. Rend le
 *  nettoyage. */
export function blockPageSwipe(root: HTMLElement): () => void {
  let start: { x: number; y: number } | null = null;
  let block: boolean | null = null;
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
    block = null;
  };
  const onMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!start || !t || e.touches.length > 1) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (block === null) {
      if (Math.abs(dy) < 4 || Math.abs(dx) > Math.abs(dy)) return;
      const page = scrollContainerOf(root);
      const boxes: ScrollBoxY[] = [];
      for (let p = e.target as HTMLElement | null; p && p !== page; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        boxes.push({
          scrollTop: p.scrollTop,
          scrollHeight: p.scrollHeight,
          clientHeight: p.clientHeight,
          scrollsY: oy === 'auto' || oy === 'scroll',
        });
      }
      block = !innerCanScrollY(boxes, dy);
    }
    if (block && e.cancelable) e.preventDefault();
  };
  const onEnd = () => {
    start = null;
    block = null;
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, { passive: true });
  document.addEventListener('touchcancel', onEnd, { passive: true });
  return () => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
  };
}
