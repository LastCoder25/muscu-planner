/**
 * ⛵ LA SCÈNE DE TRAVERSÉE (demandé par l'utilisateur : « quand je quitte une île, une animation
 * qui remplace la carte avec le timer restant avant d'arriver, et une animation par île en se
 * basant sur le style de l'île »). Pur, testé.
 *
 * ⚠️ Ce module ne décide RIEN de la traversée : départ, arrivée et débarquement restent ceux de
 * `crossing.ts` (le tick du store accoste). Il ne fait que dire OÙ en est le bateau et DE QUOI
 * a l'air l'île vers laquelle on vogue.
 *
 * ⚠️ Les couleurs de mer et de terre sont LUES dans `ISLAND_STYLES` (la carte de l'île) : la
 * scène annonce l'île qu'on va voir, deux palettes écrites à côté finiraient par diverger.
 */
import { islandRadiusAt, ISLAND_STYLES } from './islandTerrain';
import type { Crossing } from './expedition';

/** L'AMBIANCE d'une île, qui pilote les effets de la scène. */
type CrossingMood = 'sun' | 'dusk' | 'fog' | 'war' | 'curse';

export interface CrossingTheme {
  mood: CrossingMood;
  /** Ciel, du haut vers l'horizon. */
  sky0: string;
  sky1: string;
  /** Mer (lue dans `ISLAND_STYLES`). */
  sea0: string;
  sea1: string;
  /** Terre de l'île à l'horizon (lue dans `ISLAND_STYLES`). */
  land: string;
  /** Couleur des effets (soleil, lucioles, feux follets, braises, éclairs). */
  glow: string;
  /** Une phrase d'ambiance. */
  hint: string;
}

/** Ce qui varie d'une île à l'autre et que la carte ne connaît pas : le ciel et ses effets. */
const SKIES: Record<number, Pick<CrossingTheme, 'mood' | 'sky0' | 'sky1' | 'glow' | 'hint'>> = {
  1: {
    mood: 'sun',
    sky0: '#4f8fb8',
    sky1: '#f2d69a',
    glow: '#ffe28a',
    hint: 'Grand soleil — des voiles de pillards rôdent au large.',
  },
  2: {
    mood: 'dusk',
    sky0: '#2a3b3a',
    sky1: '#c98a4f',
    glow: '#d8f27a',
    hint: 'Le jour tombe — on entend hurler sur la côte.',
  },
  3: {
    mood: 'fog',
    sky0: '#3a4547',
    sky1: '#8b9690',
    glow: '#9ef0c8',
    hint: 'Un brouillard froid monte — des feux follets dansent sur l’eau.',
  },
  4: {
    mood: 'war',
    sky0: '#3b1d18',
    sky1: '#d9683a',
    glow: '#ffae4a',
    hint: 'Le ciel rougeoie — la fumée des camps de guerre monte au loin.',
  },
  5: {
    mood: 'curse',
    sky0: '#0d0718',
    sky1: '#4b2a6e',
    glow: '#c79bff',
    hint: 'Nuit sans lune — l’orage maudit gronde sur l’île.',
  },
};

/** Le thème de la scène pour l'île de DESTINATION (île 1 par défaut). */
export function crossingTheme(islandId: number): CrossingTheme {
  const sky = SKIES[islandId] ?? SKIES[1]!;
  const style = ISLAND_STYLES[islandId] ?? ISLAND_STYLES[1]!;
  return { ...sky, sea0: style.sea0, sea1: style.sea1, land: style.land1 };
}

type CrossingPhase = 'waiting' | 'sailing' | 'docking';

export interface CrossingProgress {
  /** En attente des troupes · en mer · arrivé, l'accostage se fait au prochain tick. */
  phase: CrossingPhase;
  /** Avancement de la traversée en mer, 0 au départ, 1 à l'arrivée. */
  progress: number;
  /** Temps restant avant d'accoster (attente comprise). */
  leftMs: number;
  /** Temps restant avant de lever l'ancre (0 une fois parti). */
  departInMs: number;
}

/** Où en est le bateau à l'instant `now`. */
export function crossingProgress(
  c: Pick<Crossing, 'departAt' | 'arriveAt'>,
  now: number,
): CrossingProgress {
  const leftMs = Math.max(0, c.arriveAt - now);
  const departInMs = Math.max(0, c.departAt - now);
  if (departInMs > 0) return { phase: 'waiting', progress: 0, leftMs, departInMs };
  if (leftMs === 0) return { phase: 'docking', progress: 1, leftMs, departInMs };
  const span = Math.max(1, c.arriveAt - c.departAt);
  // Ici now ∈ [departAt, arriveAt[ : le quotient est déjà dans [0, 1[, aucun garde à poser.
  const progress = (now - c.departAt) / span;
  return { phase: 'sailing', progress, leftMs, departInMs };
}

/**
 * ⛰️ La SILHOUETTE d'une île vue de profil, sur l'horizon : une crête dont le relief suit le
 * rayon de sa côte (`islandRadiusAt`) — chaque île a donc son propre profil, celui de sa carte,
 * sans un relief inventé à part. Chemin fermé sur l'horizon, posé entre `x0` et `x0 + w`.
 */
export function islandRidge(
  islandId: number,
  x0: number,
  w: number,
  baseY: number,
  h: number,
): string {
  const STEPS = 24;
  const radii: number[] = [];
  for (let i = 0; i <= STEPS; i++) radii.push(islandRadiusAt(islandId, (i / STEPS) * Math.PI));
  const lo = Math.min(...radii);
  const hi = Math.max(...radii);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  let d = `M${r1(x0)} ${r1(baseY)}`;
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS;
    // Une colline (sinus) que la côte module : les bords plongent dans la mer.
    const hill = Math.sin(f * Math.PI);
    const rel = hi > lo ? (radii[i]! - lo) / (hi - lo) : 0.5;
    const y = baseY - h * hill * (0.55 + 0.45 * rel);
    d += ` L${r1(x0 + f * w)} ${r1(y)}`;
  }
  return `${d} L${r1(x0 + w)} ${r1(baseY)} Z`;
}
