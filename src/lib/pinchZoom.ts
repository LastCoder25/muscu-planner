/** Zoom à deux doigts (pincer / écarter) sur une vue défilable qui contient un contenu carré
 *  de `px` pixels. Pur et testable : l'écran lui passe les mesures, il applique le résultat.
 *
 *  ⚠️ LE POINT SOUS LES DOIGTS RESTE SOUS LES DOIGTS. Le milieu des deux doigts au DÉBUT du
 *  geste désigne un point de la carte (fraction 0..1 du contenu) ; on le garde sous le milieu
 *  COURANT des doigts — ce qui permet aussi de faire glisser la carte en pinçant. Zoomer
 *  autour du centre de l'écran ferait fuir ce qu'on vise. */
export interface PinchStart {
  px: number; // taille du contenu au début du geste
  dist: number; // écart entre les deux doigts au début
  fracX: number; // point de la carte visé, en fraction du contenu
  fracY: number;
}

/** Mémorise le début du geste. `midX/midY` = milieu des doigts, relatif à la vue. */
export function pinchStart(
  px: number,
  dist: number,
  midX: number,
  midY: number,
  scrollLeft: number,
  scrollTop: number,
): PinchStart {
  return {
    px,
    dist: Math.max(1, dist),
    fracX: (scrollLeft + midX) / px,
    fracY: (scrollTop + midY) / px,
  };
}

/** Nouvelle taille (bornée) et nouveau défilement pour l'écart et le milieu courants. */
export function pinchUpdate(
  s: PinchStart,
  dist: number,
  midX: number,
  midY: number,
  min: number,
  max: number,
): { px: number; scrollLeft: number; scrollTop: number } {
  const px = Math.round(Math.max(min, Math.min(max, (s.px * Math.max(1, dist)) / s.dist)));
  return {
    px,
    scrollLeft: s.fracX * px - midX,
    scrollTop: s.fracY * px - midY,
  };
}
