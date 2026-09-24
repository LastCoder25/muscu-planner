<template>
  <!-- 🔯 LE CERCLE D'INVOCATION (maquette validée). Deux variantes : le PETIT pour le ×1, le
       GRAND pour le ×10 (demandé : « seul le ×10 en gros cercle »). Chaque couche tourne à
       sa vitesse, dans son sens ; pendant la charge, runes, nœuds, médaillons et perles
       s'allument en doré.
       ⚠️ CE N'EST PLUS UN BOUTON (v0.1101) : on ne le maintient plus, le choix du tirage
       lance tout. Il n'a donc ni rôle ni focus — annoncer un contrôle qui ne répond à rien
       tromperait qui navigue au clavier ou au lecteur d'écran.
       ⚠️ Rotation et allumage sont posés à la main sur les nœuds SVG, jamais par le rendu
       Vue : ils changent à chaque image, et re-rendre ~250 éléments 60 fois par seconde
       n'apporterait rien. -->
  <div ref="root" class="ivs" :class="[variant, { dim, revealing, charging }]" aria-hidden="true">
    <!-- ⚡ FLUIDITÉ (v0.1109) : chaque couche qui tourne est son PROPRE <svg>, superposé aux
         autres, et tourne par une animation CSS (Web Animations) que le COMPOSITEUR joue
         seul. Avant, on réécrivait l'attribut `transform` de groupes SVG à chaque image : le
         navigateur repeignait tout le cercle — halos (`drop-shadow`) compris — soixante fois
         par seconde, et ça saccadait dès que la révélation chargeait le fil principal. -->
    <div ref="stack" class="ivs-stack">
      <svg class="ivs-l" :viewBox="vb">
        <defs>
          <radialGradient :id="`${uid}-core`">
            <stop offset="0" stop-color="#e6d6ff" stop-opacity=".6" />
            <stop offset=".45" stop-color="#b57bff" stop-opacity=".3" />
            <stop offset="1" stop-color="#b57bff" stop-opacity="0" />
          </radialGradient>
          <radialGradient :id="`${uid}-aura`">
            <stop offset=".6" stop-color="#ffd23f" stop-opacity="0" />
            <stop offset=".82" stop-color="#ffd23f" stop-opacity=".35" />
            <stop offset="1" stop-color="#ffd23f" stop-opacity="0" />
          </radialGradient>
          <radialGradient :id="`${uid}-disc`">
            <stop offset="0" stop-color="#b57bff" stop-opacity=".16" />
            <stop offset=".7" stop-color="#b57bff" stop-opacity=".06" />
            <stop offset="1" stop-color="#b57bff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle v-if="big" :cx="C" :cy="C" r="198" :fill="`url(#${uid}-disc)`" />
        <!-- cadran fixe : graduations -->
        <circle class="ivs-ring thin" :cx="C" :cy="C" :r="g.dial" />
        <circle
          class="ivs-tick"
          :cx="C"
          :cy="C"
          :r="g.tick"
          :pathLength="g.ticks"
          stroke-dasharray=".12 .88"
        />
        <circle
          class="ivs-tick major"
          :cx="C"
          :cy="C"
          :r="g.tick"
          :pathLength="g.majors"
          stroke-dasharray=".03 .97"
          stroke-dashoffset=".015"
        />
        <circle class="ivs-ring" :cx="C" :cy="C" :r="g.dialIn" />
        <circle v-if="big" class="ivs-ring thin" :cx="C" :cy="C" r="183" stroke-dasharray="1 3" />
      </svg>
      <!-- l'aura a son calque : son opacité suit la charge, le compositeur la fond sans repeindre. -->
      <svg ref="aura" class="ivs-l ivs-aura" :viewBox="vb">
        <circle :cx="C" :cy="C" :r="g.aura" :fill="`url(#${uid}-aura)`" />
      </svg>

      <!-- couronne de perles (grand cercle) -->
      <svg v-if="big" class="ivs-l" :viewBox="vb" data-spin="0.6">
        <circle class="ivs-ring thin" :cx="C" :cy="C" r="210" stroke-dasharray="2 6" />
        <g v-for="(b, i) in beadsOuter" :key="'bo' + i" data-lit="bo" class="ivs-beadg">
          <circle class="ivs-bead" :class="{ big: b.big }" :cx="b.x" :cy="b.y" :r="b.r" />
          <template v-if="b.big">
            <circle
              class="ivs-spinner"
              :class="{ rev: b.rev }"
              :cx="b.x"
              :cy="b.y"
              :r="b.r * 1.6"
            />
            <circle class="ivs-bead" :cx="b.x" :cy="b.y" :r="b.r * 0.4" />
          </template>
        </g>
      </svg>

      <!-- bande de runes -->
      <svg class="ivs-l" :viewBox="vb" data-spin="1">
        <text
          v-for="(t, i) in runesOuter"
          :key="'ro' + i"
          data-lit="ro"
          class="ivs-rune"
          :x="t.x"
          :y="t.y"
          :transform="t.tr"
        >
          {{ t.ch }}
        </text>
        <circle class="ivs-ring bold" :cx="C" :cy="C" :r="g.runeRing" />
        <circle
          class="ivs-ring thin"
          :cx="C"
          :cy="C"
          :r="g.runeRing - 4"
          :stroke-dasharray="big ? undefined : '1 4'"
        />
      </svg>

      <template v-if="big">
        <!-- perles entre les runes et les médaillons -->
        <svg class="ivs-l" :viewBox="vb" data-spin="-1.3">
          <g v-for="(b, i) in beadsMid" :key="'bm' + i" data-lit="bm" class="ivs-beadg">
            <circle class="ivs-bead" :class="{ big: b.big }" :cx="b.x" :cy="b.y" :r="b.r" />
            <template v-if="b.big">
              <circle
                class="ivs-spinner"
                :class="{ rev: b.rev }"
                :cx="b.x"
                :cy="b.y"
                :r="b.r * 1.6"
              />
              <circle class="ivs-bead" :cx="b.x" :cy="b.y" :r="b.r * 0.4" />
            </template>
          </g>
        </svg>
        <!-- médaillons planétaires reliés en octogone -->
        <svg class="ivs-l" :viewBox="vb" data-spin="-0.45">
          <polygon class="ivs-ring thin" :points="medalPoly" />
          <g v-for="(m, i) in medals" :key="'md' + i" data-lit="md" class="ivs-medal">
            <circle :cx="m.x" :cy="m.y" r="12" />
            <text :x="m.x" :y="m.y">{{ m.ch }}</text>
          </g>
        </svg>
        <!-- arcs segmentés -->
        <svg class="ivs-l" :viewBox="vb" data-spin="3">
          <circle
            class="ivs-arcs"
            :cx="C"
            :cy="C"
            r="134"
            pathLength="24"
            stroke-dasharray="1.6 .4"
          />
          <circle class="ivs-ring thin" :cx="C" :cy="C" r="128" />
        </svg>
        <svg class="ivs-l" :viewBox="vb" data-spin="-3.4">
          <g v-for="(b, i) in beadsArc" :key="'ba' + i" data-lit="ba" class="ivs-beadg">
            <circle class="ivs-bead" :cx="b.x" :cy="b.y" :r="b.r" />
          </g>
        </svg>
      </template>
      <!-- satellites (petit cercle) -->
      <svg v-else class="ivs-l" :viewBox="vb" data-spin="2.4">
        <path class="ivs-sat" d="M150,-6 l4,8 l-4,8 l-4,-8 z" />
        <path class="ivs-sat" d="M150,290 l4,8 l-4,8 l-4,-8 z" />
        <path class="ivs-sat" d="M-6,150 l8,4 l8,-4 l-8,-4 z" />
        <path class="ivs-sat" d="M290,150 l8,4 l8,-4 l-8,-4 z" />
      </svg>

      <!-- étoiles + nœuds (contre-rotation) -->
      <svg class="ivs-l" :viewBox="vb" data-spin="-0.7">
        <template v-if="big">
          <polygon class="ivs-star" :points="star12" />
          <polygon class="ivs-star" :points="star8" opacity=".7" />
          <line
            v-for="(l, i) in spokes"
            :key="'sp' + i"
            class="ivs-spoke"
            :x1="l[0]"
            :y1="l[1]"
            :x2="l[2]"
            :y2="l[3]"
          />
        </template>
        <template v-else>
          <polygon
            class="ivs-star"
            points="150,52 219,81 248,150 219,219 150,248 81,219 52,150 81,81"
          />
          <polygon class="ivs-star" points="150,52 248,150 150,248 52,150" />
          <polygon class="ivs-star" points="81,81 219,81 219,219 81,219" />
          <circle class="ivs-ring" cx="150" cy="150" r="72" />
        </template>
        <circle
          v-for="(n, i) in nodes"
          :key="'nd' + i"
          data-lit="nd"
          class="ivs-node"
          :cx="n.x"
          :cy="n.y"
          :r="big ? 4 : 4.5"
        />
      </svg>

      <!-- hexagramme et runes intérieures -->
      <svg class="ivs-l" :viewBox="vb" data-spin="1.5">
        <circle v-if="big" class="ivs-ring" :cx="C" :cy="C" r="104" />
        <polygon class="ivs-ring" :points="hexA" />
        <polygon class="ivs-ring" :points="hexB" />
        <circle class="ivs-ring thin" :cx="C" :cy="C" :r="big ? 86 : 46" />
        <text
          v-for="(t, i) in runesInner"
          :key="'ri' + i"
          data-lit="ri"
          class="ivs-rune r-sm"
          :x="t.x"
          :y="t.y"
          :transform="t.tr"
        >
          {{ t.ch }}
        </text>
      </svg>

      <template v-if="big">
        <!-- lunes : six petits cercles qui orbitent, chacun tournant sur lui-même -->
        <svg class="ivs-l" :viewBox="vb" data-spin="2">
          <circle class="ivs-ring thin" :cx="C" :cy="C" r="74" />
          <g v-for="(m, i) in moons" :key="'mo' + i" data-lit="mo" class="ivs-moon">
            <circle class="ivs-moonb" :cx="m.x" :cy="m.y" r="7" />
            <circle class="ivs-spinner" :class="{ rev: i % 2 === 1 }" :cx="m.x" :cy="m.y" r="11" />
            <circle class="ivs-bead" :cx="m.sx" :cy="m.sy" r="2" />
          </g>
        </svg>
        <svg class="ivs-l" :viewBox="vb" data-spin="-2.2">
          <circle class="ivs-ring thin" :cx="C" :cy="C" r="62" stroke-dasharray="2 3" />
          <text
            v-for="(t, i) in runesCore"
            :key="'rc' + i"
            data-lit="rc"
            class="ivs-rune r-xs"
            :x="t.x"
            :y="t.y"
            :transform="t.tr"
          >
            {{ t.ch }}
          </text>
          <polygon class="ivs-ring thin" points="200,158 236,179 236,221 200,242 164,221 164,179" />
        </svg>
      </template>

      <!-- le cœur qui respire a son propre calque : sinon il repeindrait l'anneau de charge. -->
      <svg class="ivs-l ivs-corel" :viewBox="vb">
        <circle :cx="C" :cy="C" :r="big ? 80 : 70" :fill="`url(#${uid}-core)`" />
      </svg>
      <svg class="ivs-l" :viewBox="vb">
        <path class="ivs-glyph" :d="glyph" />
        <circle
          ref="prog"
          class="ivs-prog"
          :cx="C"
          :cy="C"
          :r="g.prog"
          pathLength="1"
          stroke-dasharray="1"
          stroke-dashoffset="1"
          :transform="`rotate(-90 ${C} ${C})`"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  variant: 'small' | 'big';
  /** Charge du cercle, 0..1 : l'anneau se remplit, les runes s'allument. */
  charge: number;
  /** Vitesse de rotation visée (°/s) — le cercle s'y accorde en douceur. */
  speed: number;
  /** La charge est en cours : le cercle grossit un peu et vibre avec elle. */
  charging: boolean;
  dim?: boolean;
  revealing?: boolean;
}>();

let seq = 0;
const uid = `ivs${++seq}${Math.floor(Math.random() * 1e6)}`;
const big = computed(() => props.variant === 'big');
const size = computed(() => (big.value ? 400 : 300));
const C = computed(() => size.value / 2);
const g = computed(() =>
  big.value
    ? {
        aura: 226,
        dial: 198,
        tick: 193,
        ticks: 120,
        majors: 12,
        dialIn: 187,
        runeRing: 163,
        prog: 190,
      }
    : {
        aura: 170,
        dial: 147,
        tick: 142,
        ticks: 72,
        majors: 8,
        dialIn: 137,
        runeRing: 115,
        prog: 104,
      },
);

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
function polar(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + Math.cos(a) * r, c + Math.sin(a) * r];
}
function ring(c: number, n: number, r: number, step: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 360;
    const [x, y] = polar(c, r, a);
    return { x, y, tr: `rotate(${a} ${x} ${y})`, ch: RUNES[(i * step) % RUNES.length] };
  });
}
function starPts(c: number, n: number, skip: number, r: number) {
  return Array.from({ length: n }, (_, i) =>
    polar(c, r, (((i * skip) % n) * 360) / n).join(','),
  ).join(' ');
}
function beads(c: number, n: number, r: number, size: number, bigEvery: number) {
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = polar(c, r, (i * 360) / n);
    const isBig = bigEvery > 0 && i % bigEvery === 0;
    return { x, y, r: isBig ? size * 2 : size, big: isBig, rev: isBig && i % (bigEvery * 2) !== 0 };
  });
}

// ⚠️ Géométrie calculée UNE fois par variante (la variante ne change pas en cours de vie).
const V = props.variant === 'big';
const c0 = V ? 200 : 150;
const runesOuter = ring(c0, V ? 36 : 24, V ? 173 : 126, 7);
const runesInner = ring(c0, V ? 16 : 12, V ? 95 : 58, V ? 5 : 7);
const runesCore = V ? ring(200, 8, 50, 3) : [];
const nodes = Array.from({ length: V ? 12 : 8 }, (_, i) => {
  const [x, y] = polar(c0, V ? 124 : 98, (i * 360) / (V ? 12 : 8));
  return { x, y };
});
const spokes = V
  ? Array.from({ length: 12 }, (_, i) => [...polar(200, 104, i * 30), ...polar(200, 124, i * 30)])
  : [];
const star12 = V ? starPts(200, 12, 5, 124) : '';
const star8 = V ? starPts(200, 8, 3, 118) : '';
const hexA = V ? '200,120 269,240 131,240' : '150,82 209,184 91,184';
const hexB = V ? '200,280 131,160 269,160' : '150,218 91,116 209,116';
const MEDAL = ['☉', '☽', '♃', '♄', '♂', '♀', '☿', '✶'];
const medals = V
  ? MEDAL.map((ch, i) => {
      const [x, y] = polar(200, 146, i * 45 + 22.5);
      return { x, y, ch };
    })
  : [];
const medalPoly = V
  ? Array.from({ length: 8 }, (_, i) => polar(200, 146, i * 45 + 22.5).join(',')).join(' ')
  : '';
const beadsOuter = V ? beads(200, 32, 210, 2.2, 8) : [];
const beadsMid = V ? beads(200, 24, 156, 1.6, 6) : [];
const beadsArc = V ? beads(200, 12, 128, 2, 0) : [];
const moons = V
  ? Array.from({ length: 6 }, (_, i) => {
      const [x, y] = polar(200, 74, i * 60);
      const [sx, sy] = polar(200, 85, i * 60);
      return { x, y, sx, sy };
    })
  : [];
const glyph = V
  ? 'M200,170 L200,230 M178,185 L222,215 M222,185 L178,215 M191,200 A9,9 0 1 0 209,200 A9,9 0 1 0 191,200'
  : 'M150,126 L150,174 M132,138 L168,162 M168,138 L132,162 M143,150 A7,7 0 1 0 157,150 A7,7 0 1 0 143,150';

const root = ref<HTMLElement | null>(null);
const stack = ref<HTMLElement | null>(null);
const aura = ref<SVGSVGElement | null>(null);
const prog = ref<SVGCircleElement | null>(null);
const vb = computed(() => `0 0 ${size.value} ${size.value}`);
/** Vitesse de référence (°/s) : une couche de facteur 1 y fait un tour en 30 s. Les autres
 *  vitesses s'obtiennent par `playbackRate` — la rotation reste sur le compositeur. */
const BASE_SPEED = 12;
let spinners: Animation[] = [];
let litGroups: Element[][] = [];
let litN: number[] = [];
let raf = 0;
let last = 0;
let spd = 12;
let rate = 1;

/** L'allumage suit la charge : les runes et nœuds s'éclairent un à un. ⚠️ Posé à la main,
 *  comme l'aura et l'anneau : lier `charge` au template re-rendrait les ~250 nœuds du
 *  cercle à chaque image de la charge. */
function paintCharge(c: number) {
  litGroups.forEach((arr, j) => {
    const n = Math.round(c * arr.length);
    if (n === litN[j]) return;
    litN[j] = n;
    arr.forEach((e, i) => e.classList.toggle('on', i < n));
  });
  if (aura.value) aura.value.style.opacity = String(c * 0.9);
  prog.value?.setAttribute('stroke-dashoffset', String(1 - c));
}
watch(() => props.charge, paintCharge);

function frame(t: number) {
  const dt = Math.min(0.05, (t - (last || t)) / 1000);
  last = t;
  // La vitesse visée s'atteint en douceur ; on ne touche au compositeur que si elle a
  // vraiment changé (`updatePlaybackRate` raccorde sans à-coup).
  spd += (props.speed - spd) * Math.min(1, dt * 4);
  const r = spd / BASE_SPEED;
  if (Math.abs(r - rate) > rate * 0.01) {
    rate = r;
    for (const a of spinners) a.updatePlaybackRate(r);
  }
  // Pendant la charge, le cercle enfle et VIBRE : une vibration continue (sommes de
  // sinus) plutôt qu'un saut aléatoire à chaque image, qui se lisait comme une saccade.
  if (stack.value) {
    const k = props.charging ? props.charge : 0;
    stack.value.style.transform = k
      ? `scale(${1 + k * 0.06}) translate(${(Math.sin(t / 23) + Math.sin(t / 41)) * k * 0.9}px,${(Math.cos(t / 29) + Math.sin(t / 53)) * k * 0.9}px)`
      : '';
  }
  raf = requestAnimationFrame(frame);
}

onMounted(() => {
  const el = root.value;
  if (!el) return;
  const keys = ['ro', 'ri', 'rc', 'nd', 'md', 'bo', 'bm', 'ba', 'mo'];
  litGroups = keys
    .map((k) => [...el.querySelectorAll(`[data-lit="${k}"]`)])
    .filter((a) => a.length);
  litN = litGroups.map(() => -1);
  paintCharge(props.charge);
  // ⚠️ Mouvement réduit : le cercle reste immobile (il s'allume quand même, c'est une information).
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  spd = props.speed;
  rate = spd / BASE_SPEED;
  spinners = [...el.querySelectorAll<SVGSVGElement>('[data-spin]')].map((e) => {
    const k = Number(e.getAttribute('data-spin'));
    const a = e.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${Math.sign(k) * 360}deg)` }],
      { duration: (360 / (Math.abs(k) * BASE_SPEED)) * 1000, iterations: Infinity },
    );
    a.playbackRate = rate;
    return a;
  });
  raf = requestAnimationFrame(frame);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  for (const a of spinners) a.cancel();
});

defineExpose({ el: root });
</script>

<style lang="scss">
.ivs {
  position: absolute;
  left: 50%;
  top: 60%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  /* ⚠️ Décor, plus un bouton : il ne doit intercepter aucun toucher — le grand cercle du
     ×10 déborde de la scène et volerait les gestes de ce qui est dessous. */
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
  &.small {
    width: min(78vw, 320px);
  }
  /* ⚠️ Le grand cercle tient dans la largeur ET la hauteur de la scène (mesuré sur 6
     formats, de l'iPhone SE au Z Fold) ; seule la couronne de perles déborde. Sans la
     borne de hauteur, il recouvrait le sélecteur et la consigne sur un petit écran. */
  &.big {
    width: min(100vw - 12px, 500px);
    width: min(100cqw - 4px, 500px, 68cqh);
    top: 59%;
  }
  &.dim {
    opacity: 0.25;
    transition: opacity 500ms;
    pointer-events: none;
  }
  &.revealing {
    opacity: 0.55;
    transition: opacity 400ms;
    pointer-events: none;
  }
}
/* Les calques se superposent exactement : même boîte, même viewBox. Chacun tourne autour de
   son centre (celui du cercle) — une transformation que le compositeur applique sans
   repeindre le dessin. */
.ivs-stack {
  position: absolute;
  inset: 0;
  /* ⚠️ Elle enfle et vibre pendant la charge : sans ce calque, chaque échelle différente
     forcerait à redessiner tous les calques du cercle à la nouvelle taille. */
  will-change: transform;
}
.ivs-l {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  display: block;
  transform-origin: 50% 50%;
  &[data-spin] {
    will-change: transform;
  }
}
.ivs-ring {
  fill: none;
  stroke: #b57bff;
  stroke-width: 1.2;
  opacity: 0.7;
  &.thin {
    stroke-width: 0.7;
    opacity: 0.5;
  }
  &.bold {
    stroke-width: 2.2;
    opacity: 0.85;
  }
}
.ivs-tick {
  fill: none;
  stroke: #b57bff;
  stroke-width: 5;
  opacity: 0.45;
  &.major {
    stroke-width: 10;
    opacity: 0.8;
  }
}
.ivs-rune {
  fill: color-mix(in srgb, #b57bff 70%, #fff 30%);
  font-family: 'Segoe UI Symbol', 'Noto Sans Runic', serif;
  font-size: 13px;
  text-anchor: middle;
  dominant-baseline: central;
  opacity: 0.45;
  transition:
    opacity 120ms,
    fill 120ms;
  &.r-sm {
    font-size: 10px;
  }
  &.r-xs {
    font-size: 8px;
  }
  &.on {
    fill: #fff6d6;
    opacity: 1;
    filter: drop-shadow(0 0 3px #ffd23f);
  }
}
.ivs-node {
  fill: #15120e;
  stroke: #b57bff;
  stroke-width: 1.4;
  &.on {
    fill: #ffd23f;
    stroke: #fff6d6;
    filter: drop-shadow(0 0 4px #ffd23f);
  }
}
.ivs-star {
  fill: color-mix(in srgb, #b57bff 8%, transparent);
  stroke: #b57bff;
  stroke-width: 1.2;
  opacity: 0.8;
}
.ivs-sat {
  fill: #d9c4ff;
  filter: drop-shadow(0 0 4px #b57bff);
}
.ivs-spoke {
  stroke: #b57bff;
  stroke-width: 0.8;
  opacity: 0.45;
}
.ivs-arcs {
  fill: none;
  stroke: #b57bff;
  stroke-width: 3.5;
  opacity: 0.5;
}
.ivs-medal {
  circle {
    fill: #15101f;
    stroke: #b57bff;
    stroke-width: 1.3;
  }
  text {
    fill: #d9c4ff;
    font-size: 12px;
    text-anchor: middle;
    dominant-baseline: central;
  }
  &.on circle {
    fill: #3a2a0c;
    stroke: #ffd23f;
    filter: drop-shadow(0 0 5px #ffd23f);
  }
  &.on text {
    fill: #fff6d6;
  }
}
.ivs-bead {
  fill: #c9a6ff;
  opacity: 0.8;
  &.big {
    fill: #15101f;
    stroke: #b57bff;
    stroke-width: 1.2;
  }
}
.ivs-beadg.on .ivs-bead {
  fill: #ffd23f;
  opacity: 1;
  filter: drop-shadow(0 0 3px #ffd23f);
  &.big {
    fill: #3a2a0c;
    stroke: #ffd23f;
  }
}
.ivs-spinner {
  fill: none;
  stroke: #d9c4ff;
  stroke-width: 1;
  stroke-dasharray: 2 2.6;
  transform-box: fill-box;
  transform-origin: center;
  animation: ivs-spin 3.2s linear infinite;
  opacity: 0.8;
  &.rev {
    animation-direction: reverse;
    animation-duration: 2.2s;
  }
}
.ivs-moonb {
  fill: #15101f;
  stroke: #b57bff;
  stroke-width: 1.2;
}
.ivs-moon.on .ivs-moonb {
  fill: #3a2a0c;
  stroke: #ffd23f;
  filter: drop-shadow(0 0 4px #ffd23f);
}
.ivs-moon.on .ivs-spinner,
.ivs-beadg.on .ivs-spinner {
  stroke: #ffd23f;
}
.ivs-glyph {
  fill: none;
  stroke: #e6d6ff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
}
.ivs-prog {
  fill: none;
  stroke: #ffd23f;
  stroke-width: 4;
  stroke-linecap: round;
  filter: drop-shadow(0 0 6px #ffd23f);
}
.ivs-aura {
  opacity: 0;
  will-change: opacity;
}
.ivs-corel {
  animation: ivs-breathe 3.2s ease-in-out infinite;
}
@keyframes ivs-breathe {
  50% {
    opacity: 0.7;
    transform: scale(0.94);
  }
}
@keyframes ivs-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ivs-corel,
  .ivs-spinner {
    animation: none;
  }
}
</style>
