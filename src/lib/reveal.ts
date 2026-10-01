import { scrollContainerOf } from '@/lib/mapSlide';

/**
 * 📜 DE COMBIEN FAIRE DÉFILER pour montrer un bloc en gardant le plus possible de ce qui est
 * AU-DESSUS (la carte, sous les voyages en cours). Demandé : toucher une tuile cale la
 * dernière tuile en bas de l'écran, toutes les tuiles visibles, le maximum de carte au-dessus.
 *
 * On cale le BAS du bloc (`bottom`) sur le bas de la vue — ce qui remonte la carte autant que
 * possible, dans un sens comme dans l'autre — sans jamais pousser son HAUT (`top`, la rangée
 * de tuiles) au-dessus du haut de la vue : si le bloc est plus grand que la vue, c'est le haut
 * qui gagne. Rend un décalage en px (positif = descendre, négatif = remonter).
 */
export function revealScrollDelta(r: {
  top: number;
  bottom: number;
  viewTop: number;
  viewBottom: number;
  margin?: number;
}): number {
  const m = r.margin ?? 8;
  const alignBottom = r.bottom - (r.viewBottom - m);
  const keepTop = r.top - (r.viewTop + m);
  return Math.min(alignBottom, keepTop);
}

/** 📜 Fait défiler pour que le BAS de `bottomEl` tombe en bas de la vue, sans pousser le haut
 *  de `topEl` au-dessus (`revealScrollDelta`). Seule partie qui touche au DOM : la règle,
 *  elle, est la fonction pure ci-dessus. */
export function revealBlock(topEl: Element, bottomEl: Element, margin?: number): void {
  const top = topEl.getBoundingClientRect().top;
  const bottom = bottomEl.getBoundingClientRect().bottom;
  // La page entière (`scrollingElement`) se mesure sur la fenêtre, pas sur son propre rect.
  const box = scrollContainerOf(bottomEl as HTMLElement);
  const page = !box || box === document.scrollingElement;
  const view = page ? { top: 0, bottom: window.innerHeight } : box.getBoundingClientRect();
  const delta = revealScrollDelta({
    top,
    bottom,
    viewTop: view.top,
    viewBottom: view.bottom,
    margin,
  });
  if (Math.abs(delta) < 2) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  (page ? window : box).scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
}
