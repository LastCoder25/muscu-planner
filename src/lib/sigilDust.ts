/**
 * ✨ LA POUSSIÈRE SCINTILLANTE du cercle d'invocation (v0.1114).
 *
 * Chaque boule colorée ALLUMÉE sème des grains à l'endroit où elle se trouve ; les grains
 * restent sur place et s'éteignent en scintillant pendant que la boule file sur son
 * orbite — la traînée naît de la course, elle n'est dessinée par personne. Le barème vit
 * dans `DUST` (plus rare = plus spectaculaire, testé).
 *
 * ⚠️ La simulation (`stepDust`) est PURE — on lui passe le hasard, le temps et les
 * positions — et le dessin (`drawDust`) ne fait que peindre ce qu'elle rend : c'est ce qui
 * permet de tester le semis sans navigateur.
 */
import { DUST } from '@/lib/gachaReveal';

export type DustGrade = 'A' | 'S';

export interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  star: boolean;
  grade: DustGrade;
  /** Déphasage du scintillement : deux grains voisins ne clignotent pas ensemble. */
  phase: number;
}

/** Une source de poussière pour cette image : sa position et sa lettre. */
export interface DustSource {
  x: number;
  y: number;
  grade: DustGrade;
}

/** Plafond de grains vivants : au-delà, on ne sème plus (garde-fou de performance). */
export const MAX_GRAINS = 700;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Avance la poussière de `dt` secondes : vieillit et déplace les grains, retire les morts,
 * puis sème autour de chaque source. `acc` porte le reliquat fractionnaire de chaque source
 * d'une image à l'autre (sinon un débit de 12/s à 60 images/s ne sèmerait jamais rien).
 * `scale` = pixels par unité du cercle, pour que la dispersion suive la taille à l'écran.
 */
export function stepDust(
  grains: Grain[],
  sources: readonly DustSource[],
  acc: number[],
  dt: number,
  scale: number,
  rng: () => number,
): Grain[] {
  const alive: Grain[] = [];
  for (const g of grains) {
    const age = g.age + dt;
    if (age >= g.life) continue;
    const drag = Math.pow(0.35, dt);
    alive.push({
      ...g,
      age,
      x: g.x + g.vx * dt,
      y: g.y + g.vy * dt,
      vx: g.vx * drag,
      vy: g.vy * drag,
    });
  }
  sources.forEach((s, i) => {
    const st = DUST[s.grade];
    let pending = (acc[i] ?? 0) + st.rate * dt;
    while (pending >= 1) {
      pending -= 1;
      if (alive.length >= MAX_GRAINS) continue;
      const flare = rng() < st.flares;
      const a = rng() * Math.PI * 2;
      const r = rng() * 4 * scale;
      const speed = (4 + rng() * 10) * scale;
      alive.push({
        x: s.x + Math.cos(a) * r,
        y: s.y + Math.sin(a) * r,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 3 * scale,
        age: 0,
        life: lerp(st.life[0], st.life[1], rng()),
        size: lerp(st.size[0], st.size[1], rng()) * (flare ? 2.3 : 1),
        star: flare || rng() < st.stars,
        grade: s.grade,
        phase: rng() * Math.PI * 2,
      });
    }
    acc[i] = pending;
  });
  return alive;
}

/** Éclat d'un grain à l'instant `t` (s) : il scintille et s'éteint en fin de vie. */
export function grainAlpha(g: Grain, t: number): number {
  const fade = 1 - g.age / g.life;
  const flick = 0.55 + 0.45 * Math.sin(g.phase + t * DUST[g.grade].twinkle * Math.PI * 2);
  // Les premiers instants montent en douceur : un grain qui apparaît d'un coup se voit.
  const born = Math.min(1, g.age / 0.08);
  return Math.max(0, fade * flick * born);
}

/* ───────────── dessin (navigateur) ───────────── */

type Sprites = Record<DustGrade, { dot: HTMLCanvasElement; star: HTMLCanvasElement }>;
const SPRITE = 64;

function sprite(draw: (ctx: CanvasRenderingContext2D, c: number) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SPRITE;
  const ctx = cv.getContext('2d');
  if (ctx) draw(ctx, SPRITE / 2);
  return cv;
}
function glow(ctx: CanvasRenderingContext2D, c: number, color: string, r: number) {
  const g = ctx.createRadialGradient(c, c, 0, c, c, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.18, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
}

/** Les deux images d'un grain (point doux, étoile à quatre branches), par couleur. */
export function makeSprites(colors: Record<DustGrade, string>): Sprites {
  const one = (color: string) => ({
    dot: sprite((ctx, c) => glow(ctx, c, color, c)),
    star: sprite((ctx, c) => {
      glow(ctx, c, color, c * 0.55);
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, h] of <[number, number][]>[
        [c * 2, c * 0.16],
        [c * 0.16, c * 2],
      ]) {
        const g = ctx.createRadialGradient(c, c, 0, c, c, c);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c - w / 2, c - h / 2, w, h);
      }
    }),
  });
  return { A: one(colors.A), S: one(colors.S) };
}

/** Peint les grains (en mode additif : la poussière éclaire ce qu'elle recouvre). */
export function drawDust(
  ctx: CanvasRenderingContext2D,
  grains: readonly Grain[],
  sprites: Sprites,
  t: number,
): void {
  ctx.globalCompositeOperation = 'lighter';
  for (const g of grains) {
    const a = grainAlpha(g, t);
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    const img = g.star ? sprites[g.grade].star : sprites[g.grade].dot;
    const s = g.size * (g.star ? 2.6 : 2);
    ctx.drawImage(img, g.x - s / 2, g.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
