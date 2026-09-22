// 🌀 LA SILHOUETTE D'UNE FAILLE — un portail ovale vertical cerné de flammes.
//
// Pur : il ne rend que des chemins SVG, dans un repère fixe (`PORTAL_VIEW`). Le même dessin
// sert au rejeu d'une incursion (la porte du gardien, l'entrée) et à la carte d'expédition :
// une faille doit se reconnaître d'un écran à l'autre. La COULEUR n'est pas ici — c'est
// celle du rang de la faille (`characterRank(niveau).color`), posée par le composant.
import { mulberry32 } from './combat';

/** Repère du dessin : un ovale plus haut que large, avec la place des flammes autour
 *  (plus au-dessus qu'en dessous : le feu monte). */
export const PORTAL_VIEW = { w: 100, h: 160, cx: 50, cy: 90, rx: 28, ry: 50 } as const;

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Une couronne de langues de feu autour de l'ovale.
 *
 * `grow` : ce que les flammes dépassent de l'ovale, en part de son rayon. Les flammes
 * MONTENT — celles du haut sont plus longues et penchent vers le haut, celles du bas sont
 * ramassées : c'est ce qui fait lire un feu plutôt qu'une scie circulaire.
 */
export function flameRing(seed: number, tongues: number, grow: number): string {
  const { cx, cy, rx, ry } = PORTAL_VIEW;
  // Le générateur du jeu, pas une copie : le même portail a toujours les mêmes flammes.
  const rng = mulberry32(seed);
  const pt = (theta: number, k: number) => ({
    x: cx + Math.cos(theta) * rx * k,
    y: cy + Math.sin(theta) * ry * k,
  });
  const step = (Math.PI * 2) / tongues;
  const start = -Math.PI / 2 + rng() * step;
  let d = '';
  for (let i = 0; i < tongues; i++) {
    const a0 = start + i * step;
    const a1 = a0 + step;
    const mid = a0 + step * (0.35 + rng() * 0.3);
    // sin < 0 en haut (y vers le bas) : 1 tout en haut, 0 tout en bas.
    const up = (1 - Math.sin(mid)) / 2;
    const len = grow * (0.35 + 0.65 * up) * (0.7 + rng() * 0.6);
    const v0 = pt(a0, 1);
    const v1 = pt(a1, 1);
    const tip = pt(mid, 1 + len);
    tip.y -= len * ry * 0.45; // la flamme s'élève
    const c0 = pt(a0 + step * 0.15, 1 + len * 0.55);
    const c1 = pt(a1 - step * 0.15, 1 + len * 0.55);
    if (i === 0) d += `M${r1(v0.x)} ${r1(v0.y)}`;
    d += `Q${r1(c0.x)} ${r1(c0.y)} ${r1(tip.x)} ${r1(tip.y)}`;
    d += `Q${r1(c1.x)} ${r1(c1.y)} ${r1(v1.x)} ${r1(v1.y)}`;
  }
  return d + 'Z';
}

/** Les trois couches de feu, de la plus large (sombre) à la plus serrée (vive). */
export function portalFlames(seed: number): string[] {
  return [flameRing(seed, 11, 0.42), flameRing(seed + 7, 14, 0.28), flameRing(seed + 13, 17, 0.16)];
}
