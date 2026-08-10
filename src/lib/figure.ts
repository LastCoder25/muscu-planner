// Cinématique directe d'un bonhomme articulé (vue de profil), pur/testable.
// Une POSE = 5 angles articulaires ; un ANCRAGE positionne le corps dans le
// repère écran (viewBox 100×100, y vers le bas) en « clampant » les points au
// bon appui (pieds au sol, mains à la barre, dos au banc…). Les patterns
// d'exercices (src/data/exercisePatterns.ts) ne stockent que des poses ; le rendu
// (ExerciseAnim.vue) interpole entre deux poses et appelle jointsFor() par frame.
//
// Convention d'angle : 0° = vers le bas (0,+1), +90° = vers l'avant/droite (1,0),
// 180° = vers le haut (0,−1), −90° = vers l'arrière/gauche (−1,0).

export type Anchor = 'stand' | 'hang' | 'seated' | 'prone' | 'supine' | 'dip';

export interface Pose {
  torso: number; // inclinaison du buste (0 = droit, + = penché vers l'avant)
  shoulder: number; // angle du bras (épaule → coude)
  elbow: number; // angle de l'avant-bras (coude → main)
  hip: number; // angle de la cuisse (hanche → genou)
  knee: number; // angle du tibia (genou → cheville)
  rise?: number; // décalage vertical du corps entier (+ = monte : mollets, pompe basse…)
}

export type Pt = [number, number];

export interface Joints {
  head: Pt;
  headR: number;
  shoulder: Pt;
  elbow: Pt;
  hand: Pt;
  hip: Pt;
  knee: Pt;
  ankle: Pt;
  toe: Pt;
}

// Longueurs de segments (unités viewBox).
const L = { spine: 26, neck: 5, head: 7, uarm: 14, farm: 13, thigh: 17, shin: 17, foot: 7 };

const GROUND = 92; // ligne de sol
const BAR = 12; // barre de traction (haut)
const BENCH = 66; // dessus du banc (appuis dos)
const DIPBAR = 48; // barres parallèles (dips)
const SEAT = 58; // assise (bassin fixé au siège)

const RAD = Math.PI / 180;
function dir(a: number): Pt {
  return [Math.sin(a * RAD), Math.cos(a * RAD)];
}
function add(p: Pt, v: Pt, len: number): Pt {
  return [p[0] + v[0] * len, p[1] + v[1] * len];
}

// Squelette dans le repère canonique (hanche à l'origine, buste vers le haut).
function canonical(p: Pose): Joints {
  const hip: Pt = [0, 0];
  const up = 180 - p.torso; // direction du buste (haut, penché vers l'avant par torso)
  const shoulder = add(hip, dir(up), L.spine);
  const head = add(shoulder, dir(up), L.neck + L.head);
  const elbow = add(shoulder, dir(p.shoulder), L.uarm);
  const hand = add(elbow, dir(p.elbow), L.farm);
  const knee = add(hip, dir(p.hip), L.thigh);
  const ankle = add(knee, dir(p.knee), L.shin);
  const toe = add(ankle, dir(90), L.foot); // pied vers l'avant
  return { head, headR: L.head, shoulder, elbow, hand, hip, knee, ankle, toe };
}

function map(j: Joints, fn: (p: Pt) => Pt): Joints {
  return {
    head: fn(j.head),
    headR: j.headR,
    shoulder: fn(j.shoulder),
    elbow: fn(j.elbow),
    hand: fn(j.hand),
    hip: fn(j.hip),
    knee: fn(j.knee),
    ankle: fn(j.ankle),
    toe: fn(j.toe),
  };
}

function allPts(j: Joints): Pt[] {
  return [j.head, j.shoulder, j.elbow, j.hand, j.hip, j.knee, j.ankle, j.toe];
}

// Rotation +90° autour de l'origine (repère y-bas) : (x,y) → (−y, x).
// Amène le buste « vers le haut » à « vers la droite » (corps horizontal).
function rot90(j: Joints): Joints {
  return map(j, ([x, y]) => [-y, x]);
}

/** Coordonnées écran des articulations pour une pose + un ancrage. */
export function jointsFor(pose: Pose, anchor: Anchor): Joints {
  let j = canonical(pose);
  if (anchor === 'prone' || anchor === 'supine') j = rot90(j);

  const pts = allPts(j);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const maxY = Math.max(...ys);

  let tx = 50 - cx;
  let ty = GROUND - maxY; // défaut : appui bas posé au sol
  switch (anchor) {
    case 'supine':
      ty = BENCH - maxY; // dos posé sur le banc
      break;
    case 'seated':
      ty = SEAT - j.hip[1]; // bassin fixé au siège (le tibia balance librement)
      break;
    case 'hang':
      ty = BAR - j.hand[1]; // mains fixées à la barre
      tx = 50 - j.hand[0];
      break;
    case 'dip':
      ty = DIPBAR - j.hand[1]; // mains fixées aux barres parallèles
      break;
    default:
      break; // stand / prone : appui bas au sol (défaut)
  }
  ty -= pose.rise ?? 0; // + = le corps monte (mollets, traction…)
  return map(j, ([x, y]) => [x + tx, y + ty]);
}

export const FLOOR_Y = GROUND;
export const BAR_Y = BAR;
export const BENCH_Y = BENCH;
export const DIPBAR_Y = DIPBAR;
export const SEAT_Y = SEAT;

/** Interpole deux poses (a→b) pour un facteur t∈[0,1]. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    torso: m(a.torso, b.torso),
    shoulder: m(a.shoulder, b.shoulder),
    elbow: m(a.elbow, b.elbow),
    hip: m(a.hip, b.hip),
    knee: m(a.knee, b.knee),
    rise: m(a.rise ?? 0, b.rise ?? 0),
  };
}
