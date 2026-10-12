/**
 * 📌 GARDER UN ÉLÉMENT SOUS LE DOIGT (demandé par l'utilisateur : « quand je clique sur un
 * champion, ça recalcule les Gardes et Route et ça décale l'écran vers le bas »). Cocher un
 * champion fait apparaître des pastilles dans la fiche du lieu, AU-DESSUS de la liste : tout
 * ce qui suit descend, et la tuile qu'on vient de toucher glisse hors du doigt. On note sa
 * position avant le changement, puis on fait défiler son conteneur de l'écart.
 *
 * ⚠️ On ne compte pas sur l'ancrage du navigateur (`overflow-anchor`) : Safari ne l'a pas, et
 * Chrome le suspend dès que le contenu change au-dessus de la zone visible pendant un geste.
 */

/** Le premier ancêtre qui défile vraiment, sinon la page. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/** Le défilement qui ramène un élément à sa position d'avant (0 = rien à faire). */
export function anchorDelta(before: number, after: number): number {
  return Math.round(after - before);
}

/**
 * Note la position de `el` ; la fonction rendue, appelée APRÈS le rendu, fait défiler son
 * conteneur pour la lui rendre.
 */
export function holdPosition(el: HTMLElement): () => void {
  const before = el.getBoundingClientRect().top;
  return () => {
    if (!el.isConnected) return;
    const d = anchorDelta(before, el.getBoundingClientRect().top);
    if (!d) return;
    const sc = scrollParent(el);
    if (sc) sc.scrollTop += d;
  };
}
