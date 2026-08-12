<template>
  <q-page class="emap">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Carte des expéditions</div>
      <div class="iconbtn" />
    </header>

    <div class="bar">
      <span class="bar-chip">🪙 {{ char.row?.gold ?? 0 }}</span>
      <span class="bar-chip">Niv. {{ heroLevel }}</span>
      <span v-if="active" class="bar-chip live">🧭 En expédition</span>
    </div>

    <!-- Carte -->
    <div class="map-outer">
      <div ref="scrollEl" class="map-scroll" @scroll="onScroll">
      <svg viewBox="0 0 100 100" class="map" :style="{ width: mapPx + 'px', height: mapPx + 'px' }">
        <!-- Lignes arcaniques (leylines) rayonnant de la ville -->
        <line
          v-for="l in LEYS"
          :key="'ley' + l.a"
          :x1="TOWN.x" :y1="TOWN.y" :x2="l.x" :y2="l.y"
          class="ley"
        />
        <!-- Anneaux de distance (guides de trajet) -->
        <circle v-for="r in RINGS" :key="'ring' + r" :cx="TOWN.x" :cy="TOWN.y" :r="r" class="ring" />
        <text :x="TOWN.x" :y="TOWN.y - RING_NEAR + 2.5" class="ring-lbl">proche</text>
        <text :x="TOWN.x" :y="TOWN.y - RING_FAR + 2.5" class="ring-lbl">loin</text>

        <!-- Boussole (coin haut-droit) -->
        <g class="compass">
          <circle cx="90" cy="10" r="6" class="comp-bg" />
          <text x="90" y="6.5" class="comp-n">N</text>
          <line x1="90" y1="10" x2="90" y2="5.5" class="comp-needle" />
        </g>

        <!-- Trajet du héros (aller/retour, noir=parcouru, bleu=restant) -->
        <template v-if="active && hero">
          <line
            :x1="active.poi.x" :y1="active.poi.y" :x2="hero.x" :y2="hero.y"
            class="trail" :class="hero.phase === 'return' ? 'done' : 'todo'"
          />
          <line
            :x1="TOWN.x" :y1="TOWN.y" :x2="hero.x" :y2="hero.y"
            class="trail" :class="hero.phase === 'return' ? 'todo' : 'done'"
          />
        </template>

        <!-- POI -->
        <g
          v-for="p in pois"
          :key="p.id"
          class="poi"
          :class="[diffClass(p), { sel: selected?.id === p.id, dim: !!active }]"
          @click="selectPoi(p)"
        >
          <circle :cx="p.x" :cy="p.y" r="4.5" class="poi-bg" />
          <text :x="p.x" :y="p.y + 1.4" class="poi-emo">{{ POI_EMO[p.type] }}</text>
          <text :x="p.x" :y="p.y - 5.5" class="poi-lvl">{{ p.level }}</text>
        </g>

        <!-- Objectif actif -->
        <g v-if="active" class="poi target">
          <circle :cx="active.poi.x" :cy="active.poi.y" r="4.8" class="poi-bg" />
          <text :x="active.poi.x" :y="active.poi.y + 1.4" class="poi-emo">{{ POI_EMO[active.poi.type] }}</text>
        </g>

        <!-- Héros -->
        <g v-if="active && hero">
          <circle :cx="hero.x" :cy="hero.y" r="3.4" class="hero" />
          <text :x="hero.x" :y="hero.y + 1.2" class="hero-emo">🧝</text>
        </g>

        <!-- Ville (centre) -->
        <g class="town">
          <circle :cx="TOWN.x" :cy="TOWN.y" r="8" class="town-glow" />
          <circle :cx="TOWN.x" :cy="TOWN.y" r="5.5" class="town-bg" />
          <text :x="TOWN.x" :y="TOWN.y + 1.9" class="town-emo">🏰</text>
        </g>
      </svg>
      </div>

      <!-- Indicateurs de bord : flèche vers les activités hors écran -->
      <button
        v-for="e in edgeIndicators"
        :key="'edge' + e.id"
        class="edge-ind"
        :class="e.diff"
        :style="{ left: e.x + 'px', top: e.y + 'px' }"
        @click="panToPoi(e.poi)"
      >
        <span class="ei-arrow" :style="{ transform: `rotate(${e.deg}deg)` }">➤</span>
        <span class="ei-emo">{{ POI_EMO[e.poi.type] }}</span>
      </button>

      <!-- Zoom -->
      <div class="zoom-ctl">
        <button class="zoom-b" aria-label="Dézoomer" @click="zoom(-1)">−</button>
        <button class="zoom-b" aria-label="Recentrer" @click="centerTown">⌂</button>
        <button class="zoom-b" aria-label="Zoomer" @click="zoom(1)">+</button>
      </div>
    </div>

    <!-- Bandeau expédition en cours -->
    <div v-if="active" class="active-card">
      <div class="ac-emo">{{ POI_EMO[active.poi.type] }}</div>
      <div class="ac-main">
        <div class="ac-title font-display">{{ POI_LABEL[active.poi.type] }} niv {{ active.poi.level }}</div>
        <div class="ac-timers" v-if="hero && hero.phase !== 'done'">
          <span v-if="hero.phase === 'outbound'">🎯 Arrivée dans {{ fmtMs(hero.remainToObjectiveMs) }}</span>
          <span v-else>🏰 Retour dans {{ fmtMs(hero.remainTotalMs) }}</span>
          <span class="ac-total">· total {{ fmtMs(hero.remainTotalMs) }}</span>
        </div>
        <div v-else class="ac-back">🎉 Ton héros est rentré ! Butin livré.</div>
      </div>
    </div>

    <!-- Panneau POI sélectionné -->
    <transition name="sheet">
      <div v-if="selected && !active" class="sheet">
        <div class="sh-head">
          <span class="sh-emo">{{ POI_EMO[selected.type] }}</span>
          <div class="sh-main">
            <div class="sh-title font-display">{{ POI_LABEL[selected.type] }} · niv {{ selected.level }}</div>
            <div class="sh-sub">{{ poiRewardLabel(selected) }}</div>
          </div>
          <button class="sh-x" @click="selected = null">✕</button>
        </div>
        <div class="sh-row">
          <span class="sh-chip">⏱️ {{ fmtMin(roundTripMin(selected)) }}</span>
          <span class="sh-chip">🪙 {{ costOf(selected) }}</span>
          <span v-if="selected.type !== 'mine'" class="sh-chip" :class="winClass(winPct)">🎯 {{ winPct }}%</span>
        </div>
        <button
          class="sh-send"
          :disabled="!canSend"
          @click="send"
        >
          {{ sendLabel }}
        </button>
      </div>
    </transition>

    <!-- Modale de collecte au retour -->
    <q-dialog v-model="collectOpen">
      <q-card class="coll-card" v-if="lastOutcome">
        <div class="coll-emo">{{ lastOutcome.win ? '🏆' : '💀' }}</div>
        <div class="coll-title font-display">{{ lastOutcome.win ? 'Expédition réussie !' : 'Expédition ratée' }}</div>
        <div class="coll-text">{{ lastOutcome.text }}</div>
        <div class="coll-haul">
          <span v-if="lastOutcome.gold">🪙 +{{ lastOutcome.gold }}</span>
          <span v-if="lastOutcome.dust">✨ +{{ lastOutcome.dust }}</span>
          <span v-if="lastOutcome.key">🗝️ +{{ lastOutcome.key }}</span>
          <span v-if="lastOutcome.item" class="coll-item">🎁 {{ lastOutcome.item.name }}</span>
        </div>
        <q-btn color="primary" text-color="dark" no-caps unelevated label="Super" @click="collectOpen = false" />
      </q-card>
    </q-dialog>

    <div v-if="!active && !pois.length" class="empty">
      La carte se peuple avec le temps — de nouvelles activités apparaissent régulièrement. Reviens
      bientôt.
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { computeCharacter } from '@/lib/character';
import { playerWithGear } from '@/lib/items';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, type Combatant } from '@/lib/combat';
import {
  EXPE,
  heroPosition,
  poiCombatant,
  goldCost,
  travelOneWayMin,
  type Poi,
  type PoiType,
  type ExpeditionOutcome,
} from '@/lib/expedition';

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();

const TOWN = EXPE.town;
// Décor de carte : anneaux de distance + lignes arcaniques rayonnant de la ville.
const RINGS = [EXPE.distMin, (EXPE.distMin + EXPE.distMax) / 2, EXPE.distMax];
const RING_NEAR = EXPE.distMin;
const RING_FAR = EXPE.distMax;
const LEYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI * 2) / 8;
  return { a: i, x: TOWN.x + Math.cos(a) * EXPE.distMax, y: TOWN.y + Math.sin(a) * EXPE.distMax };
});
const POI_EMO: Record<PoiType, string> = { mine: '⛏️', camp: '🏕️', lair: '👹' };
const POI_LABEL: Record<PoiType, string> = { mine: 'Mine', camp: 'Camp', lair: 'Repaire' };

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const character = computed(() =>
  computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    progress.energyEarned.value + (char.row?.login_energy ?? 0),
    char.row?.energy_spent ?? 0,
  ),
);
const heroLevel = computed(() => character.value.level.level);
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    talentEffects(char.row?.talents ?? []),
    heroLevel.value,
  ),
);

const active = computed(() => char.row?.expedition ?? null);
const pois = computed<Poi[]>(() => char.row?.expedition_map?.pois ?? []);
const hero = computed(() => (active.value ? heroPosition(active.value, now.value) : null));

// ── Carte pannable/zoomable (plus grande que l'écran) ──
const scrollEl = ref<HTMLElement | null>(null);
const mapPx = ref(700); // taille de rendu du SVG (px) → zoom
const scrollX = ref(0);
const scrollY = ref(0);
const contW = ref(1);
const contH = ref(1);
const MIN_PX = 340;
const MAX_PX = 1700;
function measure() {
  const el = scrollEl.value;
  if (!el) return;
  contW.value = el.clientWidth;
  contH.value = el.clientHeight;
}
function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  scrollX.value = el.scrollLeft;
  scrollY.value = el.scrollTop;
}
function centerOn(svgX: number, svgY: number) {
  const el = scrollEl.value;
  if (!el) return;
  el.scrollLeft = (svgX / 100) * mapPx.value - el.clientWidth / 2;
  el.scrollTop = (svgY / 100) * mapPx.value - el.clientHeight / 2;
  onScroll();
}
function centerTown() {
  centerOn(TOWN.x, TOWN.y);
}
function panToPoi(p: Poi) {
  centerOn(p.x, p.y);
}
function zoom(dir: number) {
  const el = scrollEl.value;
  // Fraction du centre du viewport (0..1) → on la conserve après le zoom.
  const cx = ((el?.scrollLeft ?? 0) + contW.value / 2) / mapPx.value;
  const cy = ((el?.scrollTop ?? 0) + contH.value / 2) / mapPx.value;
  mapPx.value = Math.max(MIN_PX, Math.min(MAX_PX, mapPx.value + dir * 200));
  void nextTick(() => centerOn(cx * 100, cy * 100));
}
// Activités hors écran → flèche au bord pointant vers elles (clic = slide dessus).
const edgeIndicators = computed(() => {
  if (!scrollEl.value) return [] as { id: string; poi: Poi; x: number; y: number; deg: number; diff: string }[];
  const cw = contW.value;
  const ch = contH.value;
  const m = 22;
  const src = [...pois.value, ...(active.value ? [active.value.poi] : [])];
  const out: { id: string; poi: Poi; x: number; y: number; deg: number; diff: string }[] = [];
  for (const p of src) {
    const px = (p.x / 100) * mapPx.value - scrollX.value;
    const py = (p.y / 100) * mapPx.value - scrollY.value;
    if (px >= 0 && px <= cw && py >= 0 && py <= ch) continue; // visible
    const dx = px - cw / 2;
    const dy = py - ch / 2;
    const scale = Math.min((cw / 2 - m) / (Math.abs(dx) || 1e-6), (ch / 2 - m) / (Math.abs(dy) || 1e-6));
    out.push({
      id: p.id,
      poi: p,
      x: cw / 2 + dx * scale,
      y: ch / 2 + dy * scale,
      deg: (Math.atan2(dy, dx) * 180) / Math.PI,
      diff: diffClass(p),
    });
  }
  return out;
});

const selected = ref<Poi | null>(null);
const collectOpen = ref(false);
const lastOutcome = ref<ExpeditionOutcome | null>(null);

function selectPoi(p: Poi) {
  if (active.value) return;
  selected.value = p;
}

// % de victoire (Monte-Carlo) contre l'adversaire du POI.
const winPct = computed(() => {
  const p = selected.value;
  if (!p || p.type === 'mine') return 100;
  const foe = poiCombatant(p.level, p.type);
  let w = 0;
  for (let s = 0; s < 40; s++)
    if (simulateCombat(fighter.value, foe, { seed: s * 131 + 5, goldOnWin: 0 }).win) w++;
  return Math.round((w / 40) * 100);
});
function winClass(pct: number): string {
  return pct >= 70 ? 'wp-good' : pct >= 35 ? 'wp-mid' : 'wp-bad';
}
function diffClass(p: Poi): string {
  const d = p.level - heroLevel.value;
  return d <= 0 ? 'easy' : d <= 2 ? 'mid' : 'hard';
}

const costOf = (p: Poi) => goldCost(p.type, p.level);
const roundTripMin = (p: Poi) => travelOneWayMin(p.level, p.distNorm) * 2;
function poiRewardLabel(p: Poi): string {
  if (p.type === 'mine') return 'Or + poussière (récolte)';
  if (p.type === 'camp') return 'Poussière + un objet';
  return 'Pièce de set garantie sur réussite 🧩';
}

const canSend = computed(
  () =>
    !!selected.value &&
    !active.value &&
    !!char.row &&
    progress.ready.value &&
    (char.row?.gold ?? 0) >= costOf(selected.value),
);
const sendLabel = computed(() => {
  if (!selected.value) return 'Envoyer';
  if ((char.row?.gold ?? 0) < costOf(selected.value)) return 'Pas assez d’or';
  return `Envoyer le héros (🪙 ${costOf(selected.value)})`;
});

async function send() {
  const uid = auth.user?.id;
  const p = selected.value;
  if (!uid || !p || !canSend.value) return;
  try {
    await char.expeSend(uid, p, fighter.value, Date.now(), heroLevel.value);
    selected.value = null;
    $q.notify({ type: 'positive', message: '🧭 Héros en route !' });
  } catch (e) {
    $q.notify({ type: 'warning', message: e instanceof Error ? e.message : 'Échec de l’envoi.' });
  }
}

// Cycle de vie : dépose le rapport à l'arrivée, crédite le butin au retour.
let busy = false;
async function lifecycle() {
  const uid = auth.user?.id;
  if (!uid || busy) return;
  busy = true;
  try {
    const msg = await char.expeTick(uid, Date.now());
    if (msg)
      $q.notify({
        type: msg.win ? 'positive' : 'warning',
        message: `📬 ${msg.win ? 'Rapport : victoire' : 'Rapport : échec'} — le héros rentre.`,
      });
    const o = await char.expeCollect(uid, Date.now());
    if (o) {
      lastOutcome.value = o;
      collectOpen.value = true;
    }
    await char.expeSyncMap(uid, Date.now(), heroLevel.value);
  } finally {
    busy = false;
  }
}

onMounted(async () => {
  const uid = auth.user?.id;
  if (uid && !char.row) await char.fetchMine().catch(() => undefined);
  if (uid) await char.expeSyncMap(uid, Date.now(), heroLevel.value).catch(() => undefined);
  await nextTick();
  measure();
  mapPx.value = Math.max(MIN_PX, Math.min(MAX_PX, Math.round(contW.value * 1.7))); // départ : un peu dézoomé
  await nextTick();
  centerTown();
  window.addEventListener('resize', measure);
  timer = setInterval(() => {
    now.value = Date.now();
    void lifecycle();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener('resize', measure);
});

// ── Formatage durées ──
function fmtMs(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
function fmtMin(min: number): string {
  return fmtMs(min * 60000);
}
</script>

<style scoped lang="scss">
.emap {
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
  padding-bottom: 24px;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px;
}
.top-title {
  font-size: 18px;
  font-weight: 800;
}
.iconbtn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-size: 24px;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
}
.bar {
  display: flex;
  gap: 8px;
  padding: 0 12px 8px;
}
.bar-chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}
.bar-chip.live {
  border-color: var(--accent);
  color: var(--accent);
}
.map-outer {
  position: relative;
  margin: 0 8px;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
}
.map-scroll {
  height: 62vh;
  overflow: auto;
  touch-action: pan-x pan-y;
  background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 7%, var(--surface)), var(--bg) 72%);
  scrollbar-width: none;
}
.map-scroll::-webkit-scrollbar {
  display: none;
}
.map {
  display: block;
}
/* Indicateurs de bord (activités hors écran) */
.edge-ind {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  cursor: pointer;
  z-index: 3;
  font-size: 12px;
}
.edge-ind.easy {
  border-color: #7bc86c;
}
.edge-ind.mid {
  border-color: #ffb23f;
}
.edge-ind.hard {
  border-color: #ff6a45;
}
.ei-arrow {
  color: var(--accent);
  font-size: 11px;
  line-height: 1;
}
.ei-emo {
  font-size: 13px;
}
/* Contrôles de zoom */
.zoom-ctl {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 3;
}
.zoom-b {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  display: grid;
  place-items: center;
}
/* Décor de carte */
.ley {
  stroke: color-mix(in srgb, #4a9eff 35%, transparent);
  stroke-width: 0.3;
  stroke-dasharray: 1 2;
}
.ring {
  fill: none;
  stroke: var(--line);
  stroke-width: 0.4;
  stroke-dasharray: 1.5 2;
  opacity: 0.7;
}
.ring-lbl {
  font-size: 2.4px;
  text-anchor: middle;
  fill: var(--dim);
  letter-spacing: 0.2px;
  text-transform: uppercase;
}
.compass .comp-bg {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 0.4;
}
.compass .comp-n {
  font-size: 3px;
  text-anchor: middle;
  fill: var(--accent);
  font-weight: 700;
}
.compass .comp-needle {
  stroke: var(--accent);
  stroke-width: 0.6;
  stroke-linecap: round;
}
.town-glow {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);
  animation: town-pulse 2.4s ease-in-out infinite;
}
@keyframes town-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.75;
  }
}
@media (prefers-reduced-motion: reduce) {
  .town-glow {
    animation: none;
  }
}
.trail {
  stroke-width: 1.4;
  stroke-linecap: round;
  fill: none;
}
.trail.done {
  stroke: var(--line);
}
.trail.todo {
  stroke: #4a9eff;
  filter: drop-shadow(0 0 1px rgba(74, 158, 255, 0.6));
}
.poi {
  cursor: pointer;
}
.poi-bg {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 0.8;
}
.poi.easy .poi-bg {
  stroke: #7bc86c;
}
.poi.mid .poi-bg {
  stroke: #ffb23f;
}
.poi.hard .poi-bg {
  stroke: #ff6a45;
}
.poi.sel .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.5;
}
.poi.dim {
  opacity: 0.4;
}
.poi.target .poi-bg {
  stroke: var(--accent);
  stroke-width: 1.4;
}
.poi-emo {
  font-size: 4px;
  text-anchor: middle;
}
.poi-lvl {
  font-size: 3px;
  text-anchor: middle;
  fill: var(--dim);
  font-weight: 700;
}
.hero {
  fill: var(--accent);
  filter: drop-shadow(0 0 2px var(--accent));
}
.hero-emo {
  font-size: 3.4px;
  text-anchor: middle;
}
.town-bg {
  fill: color-mix(in srgb, var(--accent) 25%, var(--surface));
  stroke: var(--accent);
  stroke-width: 1;
}
.town-emo {
  font-size: 5px;
  text-anchor: middle;
}
.active-card,
.sheet {
  margin: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.active-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border-color: var(--accent);
}
.ac-emo {
  font-size: 26px;
}
.ac-title {
  font-size: 15px;
  font-weight: 800;
}
.ac-timers {
  font-size: 12.5px;
  color: var(--text);
  font-weight: 600;
}
.ac-total {
  color: var(--dim);
  font-weight: 400;
}
.ac-back {
  font-size: 13px;
  color: var(--accent);
  font-weight: 700;
}
.sh-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sh-emo {
  font-size: 26px;
}
.sh-main {
  flex: 1;
  min-width: 0;
}
.sh-title {
  font-size: 15px;
  font-weight: 800;
}
.sh-sub {
  font-size: 12px;
  color: var(--dim);
}
.sh-x {
  background: none;
  border: none;
  color: var(--dim);
  font-size: 18px;
  cursor: pointer;
}
.sh-row {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.sh-chip {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}
.wp-good {
  color: #7bc86c;
  border-color: #7bc86c;
}
.wp-mid {
  color: #ffb23f;
  border-color: #ffb23f;
}
.wp-bad {
  color: #ff6a45;
  border-color: #ff6a45;
}
.sh-send {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}
.sh-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.coll-card {
  padding: 24px;
  text-align: center;
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  min-width: 260px;
}
.coll-emo {
  font-size: 48px;
}
.coll-title {
  font-size: 20px;
  font-weight: 800;
  margin: 6px 0;
}
.coll-text {
  font-size: 13px;
  color: var(--dim);
  margin-bottom: 12px;
}
.coll-haul {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  font-weight: 700;
  margin-bottom: 16px;
}
.coll-item {
  color: var(--accent);
}
.empty {
  margin: 24px 16px;
  color: var(--dim);
  text-align: center;
  font-size: 13px;
}
</style>
