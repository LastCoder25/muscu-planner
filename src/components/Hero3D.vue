<template>
  <div ref="host" class="hero3d" :style="{ height: height + 'px' }">
    <div v-if="failed" class="h3-fail">
      <span>🧊</span>
      <span>3D indisponible sur cet appareil</span>
    </div>
    <div v-else class="h3-hint">glisse pour tourner</div>
  </div>
</template>

<script setup lang="ts">
// Hero3D — rendu Three.js du héros. Ne DÉCIDE rien : il assemble des primitives d'après
// la spec pure de `src/lib/hero3d.ts` (silhouette dérivée des stats, couleurs dérivées
// des raretés). Aucun asset : le personnage est procédural, comme l'avatar SVG.
//
// ⚠️ Un contexte WebGL non libéré FUIT et les navigateurs en plafonnent le nombre
// (~16) : tout ce qui est créé ici est disposé au démontage, et la boucle de rendu
// s'arrête dès que le composant sort de l'écran ou que l'onglet passe en arrière-plan
// (batterie — l'app est utilisée en salle, sur téléphone).
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import type { HeroSpec, HeroPiece } from '@/lib/hero3d';

const props = withDefaults(defineProps<{ spec: HeroSpec; height?: number }>(), { height: 320 });
const emit = defineEmits<{ unsupported: [] }>();

const host = ref<HTMLElement | null>(null);
const failed = ref(false);

const renderer = shallowRef<THREE.WebGLRenderer | null>(null);
const scene = shallowRef<THREE.Scene | null>(null);
const camera = shallowRef<THREE.PerspectiveCamera | null>(null);
const figure = shallowRef<THREE.Group | null>(null);

let raf = 0;
let running = false;
let t0 = 0;
let spin = 0; // rotation courante (rad)
let spinVel = 0; // inertie après un glissé
let dragging = false;
let lastX = 0;
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

// ── Construction du personnage ─────────────────────────────────────────────
function mat(color: string, opts: { glow?: boolean; metal?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.glow ? 0.25 : 0.62,
    metalness: opts.metal ?? 0.15,
    emissive: new THREE.Color(opts.glow ? color : '#000000'),
    emissiveIntensity: opts.glow ? 0.55 : 0,
  });
}

function pieceBySlot(spec: HeroSpec, slot: string): HeroPiece | undefined {
  return spec.pieces.find((p) => p.slot === slot);
}

/** Assemble la figure. Les proportions viennent de `spec.build` : épaules ← Puissance,
 *  épaisseur ← Endurance, élancement ← Agilité. Le corps EST la lecture du sport. */
function buildFigure(spec: HeroSpec): THREE.Group {
  const g = new THREE.Group();
  const { shoulders, bulk, height: hgt } = spec.build;
  const skin = mat(spec.tint, { metal: 0.05 });
  const dark = mat('#2A241C', { metal: 0.3 });

  const add = (m: THREE.Mesh, x: number, y: number, z = 0) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  // Torse : la pièce qui porte l'essentiel de la lecture de silhouette.
  const torsoW = 0.52 * shoulders;
  const torsoH = 0.78 * hgt;
  const torsoD = 0.3 * bulk;
  add(new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), skin), 0, 0.5, 0);

  // Bassin, un cran plus étroit que les épaules quoi qu'il arrive.
  add(
    new THREE.Mesh(new THREE.BoxGeometry(torsoW * 0.78, 0.22, torsoD * 0.95), dark),
    0,
    0.5 - torsoH / 2 - 0.1,
    0,
  );

  // Tête + cou.
  add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), skin), 0, 0.5 + torsoH / 2 + 0.2, 0);
  add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), skin),
    0,
    0.5 + torsoH / 2 + 0.06,
    0,
  );

  // Bras et jambes : capsules, épaisseur pilotée par l'Endurance.
  const limbR = 0.075 * bulk;
  const armL = 0.56 * hgt;
  const legL = 0.62 * hgt;
  for (const side of [-1, 1]) {
    add(
      new THREE.Mesh(new THREE.CapsuleGeometry(limbR, armL, 6, 14), skin),
      side * (torsoW / 2 + limbR + 0.02),
      0.5 + torsoH / 2 - armL / 2 - 0.06,
    );
    add(
      new THREE.Mesh(new THREE.CapsuleGeometry(limbR * 1.15, legL, 6, 14), dark),
      side * torsoW * 0.22,
      0.5 - torsoH / 2 - 0.1 - legL / 2 - 0.04,
    );
  }

  // ── Équipement : seulement ce qui est réellement porté ──
  const armor = pieceBySlot(spec, 'armor');
  if (armor) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(torsoW * 1.1, torsoH * 0.62, torsoD * 1.25),
      mat(armor.color, { glow: armor.glow, metal: 0.55 }),
    );
    add(m, 0, 0.58, 0);
  }

  const accessory = pieceBySlot(spec, 'accessory');
  if (accessory) {
    const am = mat(accessory.color, { glow: accessory.glow, metal: 0.6 });
    for (const side of [-1, 1]) {
      add(
        new THREE.Mesh(new THREE.SphereGeometry(0.12 * shoulders, 16, 12), am),
        side * (torsoW / 2 + 0.03),
        0.5 + torsoH / 2 - 0.05,
      );
    }
  }

  const weapon = pieceBySlot(spec, 'weapon');
  if (weapon) {
    const wm = mat(weapon.color, { glow: weapon.glow, metal: 0.8 });
    const hand = torsoW / 2 + limbR + 0.02;
    const handY = 0.5 + torsoH / 2 - armL - 0.02;
    // Lame tenue verticalement le long du bras droit.
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.012), wm), hand, handY + 0.42);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.045), wm), hand, handY + 0.06);
  }

  const relic = pieceBySlot(spec, 'relic');
  if (relic) {
    const rm = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.11, 0),
      mat(relic.color, { glow: true, metal: 0.7 }),
    );
    rm.name = 'relic';
    add(rm, -(torsoW / 2 + 0.24), 0.5 + torsoH / 2 + 0.16, 0);
  }

  if (spec.familiar) {
    const fm = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 18, 14),
      mat(spec.familiar.color, { glow: spec.familiar.glow, metal: 0.4 }),
    );
    fm.name = 'familiar';
    add(fm, torsoW / 2 + 0.3, 0.36, 0.16);
  }

  // Socle : ancre le personnage au sol, sinon il flotte dans le vide.
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.02, 40),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3A332A'),
      roughness: 0.9,
      transparent: true,
      opacity: 0.55,
    }),
  );
  add(disc, 0, 0.5 - torsoH / 2 - 0.1 - legL - 0.06, 0);

  return g;
}

/** Libère TOUT ce qu'un groupe a alloué côté GPU. */
function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
    else mm?.dispose?.();
  });
}

function rebuild() {
  const sc = scene.value;
  if (!sc) return;
  if (figure.value) {
    sc.remove(figure.value);
    disposeGroup(figure.value);
  }
  const g = buildFigure(props.spec);
  figure.value = g;
  sc.add(g);
}

// ── Boucle de rendu ────────────────────────────────────────────────────────
function frame(now: number) {
  if (!running) return;
  const r = renderer.value;
  const sc = scene.value;
  const cam = camera.value;
  const g = figure.value;
  if (!r || !sc || !cam || !g) return;

  const t = (now - t0) / 1000;
  if (!reduce) {
    if (!dragging) {
      spin += spinVel + 0.0035; // rotation lente d'exposition + inertie du glissé
      spinVel *= 0.94;
    }
    g.rotation.y = spin;
    g.position.y = Math.sin(t * 1.6) * 0.012; // respiration
    const relic = g.getObjectByName('relic');
    if (relic) relic.rotation.set(t * 0.9, t * 1.3, 0);
    const fam = g.getObjectByName('familiar');
    if (fam) {
      fam.position.y = 0.36 + Math.sin(t * 2.1) * 0.05;
      fam.position.x = 0.42 + Math.cos(t * 0.8) * 0.05;
    }
  } else {
    g.rotation.y = spin;
  }

  r.render(sc, cam);
  raf = requestAnimationFrame(frame);
}

function play() {
  if (running || failed.value || !renderer.value) return;
  running = true;
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
}
function pause() {
  running = false;
  cancelAnimationFrame(raf);
}

function resize() {
  const el = host.value;
  const r = renderer.value;
  const cam = camera.value;
  if (!el || !r || !cam) return;
  const w = el.clientWidth || 1;
  const h = el.clientHeight || 1;
  r.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}

// ── Glissé pour tourner ────────────────────────────────────────────────────
function onDown(e: PointerEvent) {
  dragging = true;
  lastX = e.clientX;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}
function onMove(e: PointerEvent) {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  spin += dx * 0.011;
  spinVel = dx * 0.011;
  if (figure.value) figure.value.rotation.y = spin;
}
function onUp() {
  dragging = false;
}

onMounted(() => {
  const el = host.value;
  if (!el) return;
  let r: THREE.WebGLRenderer;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    // Pas de WebGL (vieux appareil, GPU bloqué) → l'hôte retombe sur l'avatar SVG.
    failed.value = true;
    emit('unsupported');
    return;
  }
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // au-delà : coût pur
  el.appendChild(r.domElement);
  r.domElement.classList.add('h3-canvas');
  renderer.value = r;

  const sc = new THREE.Scene();
  scene.value = sc;

  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  cam.position.set(0, 0.62, 3.05);
  cam.lookAt(0, 0.42, 0);
  camera.value = cam;

  // Lumières : ambiance sombre + liseré jaune voltage, comme la charte.
  sc.add(new THREE.HemisphereLight(0xffffff, 0x1a1610, 1.05));
  const key = new THREE.DirectionalLight(0xfff0d0, 1.5);
  key.position.set(2.2, 3, 2.4);
  sc.add(key);
  const rim = new THREE.DirectionalLight(0xffd23f, 1.9);
  rim.position.set(-2.4, 1.4, -2);
  sc.add(rim);

  rebuild();

  r.domElement.addEventListener('pointerdown', onDown);
  r.domElement.addEventListener('pointermove', onMove);
  r.domElement.addEventListener('pointerup', onUp);
  r.domElement.addEventListener('pointercancel', onUp);

  ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  // Hors écran ou onglet en arrière-plan → on ne brûle pas la batterie.
  io = new IntersectionObserver((entries) => {
    if (entries.some((x) => x.isIntersecting)) play();
    else pause();
  });
  io.observe(el);
  document.addEventListener('visibilitychange', onVisibility);
  play();
});

function onVisibility() {
  if (document.hidden) pause();
  else play();
}

watch(() => props.spec, rebuild, { deep: true });

onBeforeUnmount(() => {
  pause();
  document.removeEventListener('visibilitychange', onVisibility);
  io?.disconnect();
  ro?.disconnect();
  const r = renderer.value;
  if (r) {
    r.domElement.removeEventListener('pointerdown', onDown);
    r.domElement.removeEventListener('pointermove', onMove);
    r.domElement.removeEventListener('pointerup', onUp);
    r.domElement.removeEventListener('pointercancel', onUp);
  }
  if (figure.value) disposeGroup(figure.value);
  scene.value?.clear();
  r?.dispose();
  r?.domElement.remove();
  renderer.value = null;
  scene.value = null;
  figure.value = null;
});
</script>

<style scoped lang="scss">
.hero3d {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background:
    radial-gradient(
      ellipse at 50% 38%,
      color-mix(in srgb, var(--accent) 9%, transparent),
      transparent 62%
    ),
    color-mix(in srgb, var(--surface) 88%, #000);
  border: 1px solid var(--line);
  touch-action: pan-y; /* le glissé horizontal tourne le héros, le vertical scrolle */
}
:deep(.h3-canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.h3-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 6px;
  text-align: center;
  font-size: 11px;
  color: var(--dim);
  pointer-events: none;
}
.h3-fail {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--dim);
}
.h3-fail span:first-child {
  font-size: 26px;
}
</style>
