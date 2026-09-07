<template>
  <div ref="host" class="hm" :style="{ height: height + 'px' }">
    <div v-if="failed" class="hm-msg">🧊 3D indisponible sur cet appareil</div>
    <div v-else-if="loading" class="hm-msg">Chargement du héros…</div>
    <div v-else class="hm-hint">glisse pour tourner</div>
  </div>
</template>

<script setup lang="ts">
// HeroModel — paper-doll 3D : un corps de base riggé sur lequel on GREFFE les pièces
// d'équipement. Toutes les pièces du pack partagent le MÊME squelette (65 os, mêmes noms,
// même ordre — vérifié) : on re-bind donc chaque mesh sur le squelette du corps de base,
// si bien qu'une seule pose anime l'ensemble.
//
// Ce composant ne décide RIEN de ce qui est porté : `src/lib/heroModel.ts` s'en charge.
//
// ⚠️ Hygiène WebGL : un contexte non libéré fuit et les navigateurs en plafonnent le
// nombre. Tout est disposé au démontage, la boucle s'arrête hors écran / onglet caché.
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HERO_DIR, type HeroPlan } from '@/lib/heroModel';

const props = withDefaults(defineProps<{ plan: HeroPlan; height?: number; armDrop?: number }>(), {
  height: 380,
  armDrop: 0,
});

const host = ref<HTMLElement | null>(null);
const failed = ref(false);
const loading = ref(true);

const renderer = shallowRef<THREE.WebGLRenderer | null>(null);
const scene = shallowRef<THREE.Scene | null>(null);
const camera = shallowRef<THREE.PerspectiveCamera | null>(null);
const rig = shallowRef<THREE.Group | null>(null); // le groupe qu'on fait tourner
const skeleton = shallowRef<THREE.Skeleton | null>(null);

let raf = 0;
let running = false;
let t0 = 0;
let spin = 0;
let spinVel = 0;
let dragging = false;
let lastX = 0;
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;
let token = 0; // invalide les chargements obsolètes si le plan change en cours de route

const reduce =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const loader = new GLTFLoader();
const cache = new Map<string, THREE.Group>(); // glTF déjà téléchargé → on ne refetch pas

async function loadFile(file: string): Promise<THREE.Group> {
  const hit = cache.get(file);
  if (hit) return hit;
  const gltf = await loader.loadAsync(HERO_DIR + file);
  cache.set(file, gltf.scene);
  return gltf.scene;
}

function firstSkinned(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  return found;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
    else mm?.dispose?.();
  });
}

/** (Re)construit le personnage : corps de base + pièces greffées sur son squelette. */
async function build() {
  const sc = scene.value;
  if (!sc) return;
  const mine = ++token;
  loading.value = true;

  if (rig.value) {
    sc.remove(rig.value);
    disposeTree(rig.value);
    rig.value = null;
  }

  try {
    const baseSrc = await loadFile(props.plan.base);
    if (mine !== token) return; // un autre build a démarré entre-temps
    const group = new THREE.Group();
    const base = baseSrc.clone(true);
    group.add(base);

    const baseSkinned = firstSkinned(base);
    const skel = baseSkinned?.skeleton ?? null;
    skeleton.value = skel;
    const parent = baseSkinned?.parent ?? base;

    for (const p of props.plan.parts) {
      let src: THREE.Group;
      try {
        src = await loadFile(`${p}.gltf`);
      } catch {
        continue; // pièce absente du bundle : on saute plutôt que de tout casser
      }
      if (mine !== token) return;
      const piece = src.clone(true);
      const skins: THREE.SkinnedMesh[] = [];
      piece.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skins.push(o as THREE.SkinnedMesh);
      });
      for (const s of skins) {
        // Squelettes identiques → on rattache la pièce à CELUI du corps : une seule
        // pose (et plus tard une seule animation) pilote tout le personnage.
        if (skel) {
          s.skeleton = skel;
          s.bind(skel, s.bindMatrix);
        }
        s.frustumCulled = false; // sinon une pièce disparaît quand sa boîte sort du champ
        parent.add(s);
      }
    }

    // Recentre et met à l'échelle d'après la boîte englobante réelle : le pack peut
    // changer d'unités sans qu'on ait à retoucher la caméra.
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const k = 1.75 / Math.max(size.y || 1, 0.001);
    group.scale.setScalar(k);
    group.position.set(-center.x * k, -box.min.y * k, -center.z * k);

    rig.value = group;
    sc.add(group);
    applyPose(0);
    loading.value = false;
  } catch {
    failed.value = true;
    loading.value = false;
  }
}

/** Pose d'attente PROCÉDURALE : le pack ne fournit aucune animation (la bibliothèque
 *  d'animations est un téléchargement séparé). On anime donc quelques os à la main —
 *  respiration, léger balancement — et `armDrop` permet de rabattre les bras si le
 *  modèle est livré en T-pose. */
function applyPose(t: number) {
  const skel = skeleton.value;
  if (!skel) return;
  const bone = (n: string) => skel.bones.find((b) => b.name === n);
  const breathe = reduce ? 0 : Math.sin(t * 1.5) * 0.02;

  const spine = bone('spine_02');
  if (spine) spine.rotation.x = breathe * 0.5;
  const head = bone('Head');
  if (head) head.rotation.y = reduce ? 0 : Math.sin(t * 0.7) * 0.08;

  for (const [name, sign] of [
    ['upperarm_l', 1],
    ['upperarm_r', -1],
  ] as const) {
    const b = bone(name);
    if (b) b.rotation.z = sign * props.armDrop + breathe * sign * 0.3;
  }
}

function frame(now: number) {
  if (!running) return;
  const r = renderer.value;
  const sc = scene.value;
  const cam = camera.value;
  if (!r || !sc || !cam) return;
  const t = (now - t0) / 1000;

  const g = rig.value;
  if (g) {
    if (!reduce && !dragging) {
      spin += spinVel + 0.0032;
      spinVel *= 0.94;
    }
    g.rotation.y = spin;
    applyPose(t);
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
}
function onUp() {
  dragging = false;
}
function onVisibility() {
  if (document.hidden) pause();
  else play();
}

onMounted(() => {
  const el = host.value;
  if (!el) return;
  let r: THREE.WebGLRenderer;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    failed.value = true;
    loading.value = false;
    return;
  }
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.appendChild(r.domElement);
  r.domElement.classList.add('hm-canvas');
  renderer.value = r;

  const sc = new THREE.Scene();
  scene.value = sc;
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  cam.position.set(0, 1.05, 4.1);
  cam.lookAt(0, 0.95, 0);
  camera.value = cam;

  sc.add(new THREE.HemisphereLight(0xffffff, 0x1a1610, 1.6));
  const key = new THREE.DirectionalLight(0xfff2d8, 2.1);
  key.position.set(2.4, 3.2, 2.6);
  sc.add(key);
  const rim = new THREE.DirectionalLight(0xffd23f, 2.2); // liseré jaune voltage (charte)
  rim.position.set(-2.6, 1.6, -2.2);
  sc.add(rim);

  r.domElement.addEventListener('pointerdown', onDown);
  r.domElement.addEventListener('pointermove', onMove);
  r.domElement.addEventListener('pointerup', onUp);
  r.domElement.addEventListener('pointercancel', onUp);

  ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  io = new IntersectionObserver((es) => (es.some((x) => x.isIntersecting) ? play() : pause()));
  io.observe(el);
  document.addEventListener('visibilitychange', onVisibility);

  void build();
  play();
});

watch(
  () => props.plan,
  () => void build(),
  { deep: true },
);

onBeforeUnmount(() => {
  token++;
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
  if (rig.value) disposeTree(rig.value);
  for (const g of cache.values()) disposeTree(g);
  cache.clear();
  scene.value?.clear();
  r?.dispose();
  r?.domElement.remove();
  renderer.value = null;
  scene.value = null;
  rig.value = null;
  skeleton.value = null;
});
</script>

<style scoped lang="scss">
.hm {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--line);
  background:
    radial-gradient(
      ellipse at 50% 34%,
      color-mix(in srgb, var(--accent) 10%, transparent),
      transparent 64%
    ),
    color-mix(in srgb, var(--surface) 88%, #000);
  touch-action: pan-y;
}
:deep(.hm-canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.hm-msg,
.hm-hint {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  color: var(--dim);
  pointer-events: none;
}
.hm-msg {
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
}
.hm-hint {
  bottom: 6px;
  font-size: 11px;
}
</style>
