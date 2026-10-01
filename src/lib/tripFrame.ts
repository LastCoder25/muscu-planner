/**
 * 🎯 CADRER LE TRAJET D'UNE TROUPE (demandé : « quand je clique sur une tuile, centrer le
 * trajet de la troupe concernée sur la carte visible »).
 *
 * Le trajet va de son départ (un point fixe, sinon la ville) à son lieu, et repasse par la
 * ville quand la troupe rentre à la base. On centre la carte sur le milieu de ces points, et
 * on DÉZOOME si le trajet ne tient pas dans le cadre — jamais on ne zoome : toucher une tuile
 * ne doit pas faire perdre le niveau de zoom qu'on a choisi.
 */
export interface Pt {
  x: number;
  y: number;
}

/** Marge (px) gardée de chaque côté du trajet, pour que ses deux bouts ne collent pas au bord. */
export const TRIP_FRAME_MARGIN = 48;

export interface TripFrame {
  /** Centre du trajet, en coordonnées de carte. */
  cx: number;
  cy: number;
  /** Taille de rendu de la carte (px) à appliquer : ≤ la taille actuelle. */
  px: number;
}

/**
 * @param pts      les points du trajet (au moins un)
 * @param curPx    taille de rendu actuelle de la carte (px)
 * @param viewSize côté de la carte en unités de carte
 * @param contW/H  taille du cadre visible (px)
 * ⚠️ `px` n'est PAS borné par le dézoom minimal : c'est l'appelant qui le borne (clampPx).
 */
export function tripFrame(
  pts: readonly Pt[],
  curPx: number,
  viewSize: number,
  contW: number,
  contH: number,
  margin = TRIP_FRAME_MARGIN,
): TripFrame {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const availW = Math.max(1, contW - 2 * margin);
  const availH = Math.max(1, contH - 2 * margin);
  // px par unité de carte qui ferait tenir le trajet, sur chaque axe.
  const fitW = maxX > minX ? (availW / (maxX - minX)) * viewSize : Infinity;
  const fitH = maxY > minY ? (availH / (maxY - minY)) * viewSize : Infinity;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    px: Math.min(curPx, fitW, fitH),
  };
}
