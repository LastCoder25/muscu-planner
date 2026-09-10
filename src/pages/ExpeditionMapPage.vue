<template>
  <component :is="embedded ? 'div' : 'q-page'" class="emap" :class="{ embedded }">
    <GameLoader :show="booting" icon="🗺️" label="Chargement de la carte…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
      <div class="top-title font-display">Carte des expéditions</div>
      <div class="iconbtn" />
    </header>

    <div class="bar">
      <span class="bar-chip">🪙 {{ char.row?.gold ?? 0 }}</span>
      <span class="bar-chip">Niv. {{ heroLevel }}</span>
      <span v-if="active" class="bar-chip live">🧭 En expédition</span>
      <span v-else-if="outpostBuilt && travelMult < 1" class="bar-chip">
        🧭 −{{ Math.round((1 - travelMult) * 100) }}% trajet
      </span>
    </div>

    <!-- Avant-poste requis pour envoyer des expéditions. Les emplacements vivent
         désormais sur l'écran « Ma base » (v0.664) → on y renvoie explicitement. -->
    <div v-if="!outpostBuilt" class="outpost-hint">
      🧭 Construis un <b>Avant-poste d’expédition</b> depuis <b>Ma base</b> pour envoyer des héros.
      Chaque niveau réduit les temps de trajet.
    </div>

    <!-- Carte -->
    <div class="map-outer">
      <div ref="scrollEl" class="map-scroll" @scroll="onScroll">
        <svg
          :viewBox="`0 0 ${MAP} ${MAP}`"
          class="map"
          :style="{ width: mapPx + 'px', height: mapPx + 'px' }"
        >
          <!-- Fond PARCHEMIN noir & blanc : mer + côte + rivières + reliefs à l'encre -->
          <rect :x="-10" :y="-10" :width="MAP + 20" :height="MAP + 20" class="sea" />
          <path :d="terrain.coast" class="coast-line" />
          <path :d="terrain.coast" class="land" />
          <path v-for="(rv, i) in terrain.rivers" :key="'rv' + i" :d="rv" class="river" />
          <path
            v-for="(feat, i) in terrain.features"
            :key="'ft' + i"
            :d="feat.d"
            class="feat"
            :class="'f-' + feat.kind"
          />

          <!-- Cadre décoratif + boussole (visibles carte dézoomée) -->
          <rect x="1.5" y="1.5" :width="MAP - 3" :height="MAP - 3" rx="2" class="map-frame" />
          <rect x="3.5" y="3.5" :width="MAP - 7" :height="MAP - 7" rx="1" class="map-frame thin" />
          <g class="compass" :transform="`translate(${MAP - 100} 0)`">
            <circle cx="90" cy="10" r="5.5" class="comp-bg" />
            <path d="M 90 5 L 91.4 10 L 90 8.7 L 88.6 10 Z" class="comp-needle" />
            <text x="90" y="4" class="comp-n">N</text>
          </g>

          <!-- Trajet du héros (aller/retour, noir=parcouru, bleu=restant) -->
          <template v-if="active && hero">
            <line
              :x1="active.poi.x"
              :y1="active.poi.y"
              :x2="hero.x"
              :y2="hero.y"
              class="trail"
              :class="hero.phase === 'return' ? 'done' : 'todo'"
            />
            <line
              :x1="TOWN.x"
              :y1="TOWN.y"
              :x2="hero.x"
              :y2="hero.y"
              class="trail"
              :class="hero.phase === 'return' ? 'todo' : 'done'"
            />
            <!-- Chevrons de direction : s'allument un à un du héros vers la cible
               (sens du déplacement), orientés dans la direction, en boucle. -->
            <path
              v-for="a in travelArrows"
              :key="'arr' + a.i"
              class="dir-arrow"
              d="M -1 -1.5 L 1.4 0 L -1 1.5 Z"
              :transform="`translate(${a.x} ${a.y}) rotate(${a.angle})`"
              :style="{ animationDelay: a.delay + 's' }"
            />
          </template>

          <!-- Trajets des CONVOIS : même tracé aller/retour que le héros, en violet et
             en pointillés — la couleur seule ne suffit pas à distinguer deux routes. -->
          <template v-for="v in vansOnMap" :key="'vt' + v.id">
            <line
              :x1="v.poi.x"
              :y1="v.poi.y"
              :x2="v.at.x"
              :y2="v.at.y"
              class="trail van"
              :class="v.at.phase === 'return' ? 'done' : 'todo'"
            />
            <line
              :x1="TOWN.x"
              :y1="TOWN.y"
              :x2="v.at.x"
              :y2="v.at.y"
              class="trail van"
              :class="v.at.phase === 'return' ? 'todo' : 'done'"
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
            <text :x="active.poi.x" :y="active.poi.y + 1.4" class="poi-emo">
              {{ POI_EMO[active.poi.type] }}
            </text>
          </g>

          <!-- Héros -->
          <g v-for="v in vansOnMap" :key="'vm' + v.id">
            <circle :cx="v.at.x" :cy="v.at.y" r="3" class="van-mark" />
            <text :x="v.at.x" :y="v.at.y + 1.1" class="van-emo">🐫</text>
          </g>

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
        <div class="ac-title font-display">
          {{ POI_LABEL[active.poi.type] }} niv {{ active.poi.level }}
        </div>
        <div class="ac-timers" v-if="hero && hero.phase !== 'done'">
          <span v-if="hero.phase === 'outbound'"
            >🎯 Arrivée dans {{ fmtMs(hero.remainToObjectiveMs) }}</span
          >
          <span v-else>🏰 Retour dans {{ fmtMs(hero.remainTotalMs) }}</span>
          <span class="ac-total">· total {{ fmtMs(hero.remainTotalMs) }}</span>
        </div>
        <div v-else class="ac-back">🎉 Ton héros est rentré ! Butin livré.</div>
      </div>
    </div>

    <!-- Panneau POI sélectionné -->
    <!-- ⚠️ La cargaison ne se verse pas toute seule : on vient la prendre, comme pour
         les rapports d’expédition. Le convoi, lui, est déjà rentré — on ne bloque jamais
         les aventuriers en attendant que le joueur clique. -->
    <div v-if="claimable.length" class="panel vans">
      <div v-for="c in claimable" :key="c.id" class="van">
        <span>🐫</span>
        <span>Convoi rentré de {{ POI_LABEL[c.poi.type] }}</span>
        <button class="van-go" :disabled="busyCaravan" @click="doClaimCaravan(c.id)">
          🎁 Récupérer
        </button>
      </div>
    </div>
    <transition name="sheet">
      <div v-if="selected && !active" class="sheet">
        <div class="sh-head">
          <span class="sh-emo">{{ POI_EMO[selected.type] }}</span>
          <div class="sh-main">
            <div class="sh-title font-display">
              {{ POI_LABEL[selected.type] }} · niv {{ selected.level }}
            </div>
            <div class="sh-sub">{{ poiRewardLabel(selected) }}</div>
          </div>
          <button class="sh-x" @click="selected = null">✕</button>
        </div>
        <div class="sh-row">
          <span class="sh-chip">⏱️ {{ fmtMin(roundTripMin(selected)) }}</span>
          <span class="sh-chip">🪙 {{ costOf(selected) }}</span>
          <span v-if="selected.type === 'arena'" class="sh-chip">🌊 ~{{ arenaWaves }} vagues</span>
          <span v-if="selected.perilous" class="sh-chip peril"
            >⚠️ Route dangereuse — embuscades doublées, butin renforcé</span
          >
          <span v-else-if="selected.type !== 'mine'" class="sh-chip" :class="winClass(winPct)"
            >🎯 {{ winPct }}%</span
          >
        </div>
        <button class="sh-send" :disabled="!canSend" @click="send">
          {{ sendLabel }}
        </button>
        <!-- ⚠️ La caravane ne s’affiche que sur les lieux de RÉCOLTE : le héros se bat,
             les convois exploitent. Elle ne coûte AUCUNE énergie — c’est tout son intérêt
             pour un joueur qui s’entraîne peu — mais elle immobilise ses aventuriers. -->
        <template v-if="canOfferCaravan">
          <div class="car-sep">ou bien</div>
          <div class="car-row">
            <span class="sh-chip">🐫 {{ fmtMin(caravanMin) }}</span>
            <span class="sh-chip">⚡ 0</span>
            <span class="sh-chip">{{ freeAdvs.length }} dispo · {{ vansLeft }} convoi(s)</span>
          </div>
          <div class="car-pick">
            <button
              v-for="a in freeAdvs"
              :key="a.id"
              class="car-adv"
              :class="{ on: escort.includes(a.id) }"
              @click="toggleEscort(a.id)"
            >
              <span class="ca-emo">{{ advTitle(a)?.emoji ?? '🧑' }}</span>
              <span class="ca-name">{{ a.name }}</span>
            </button>
          </div>
          <button class="sh-send car-send" :disabled="!canSendCaravanNow" @click="doSendCaravan">
            🐫 Envoyer une caravane ({{ escort.length }})
          </button>
        </template>
      </div>
    </transition>

    <!-- Emplacement de filon (construire / récolter / améliorer) — MODALE centrée
         (clic-dehors ou croix pour fermer ; plus de scroll en bas de page). -->
    <!-- Modale de collecte au retour -->
    <q-dialog v-model="collectOpen">
      <q-card class="coll-card" v-if="lastOutcome">
        <div class="coll-emo">
          {{ lastOutcome.waves !== undefined ? '🏟️' : lastOutcome.win ? '🏆' : '💀' }}
        </div>
        <div class="coll-title font-display">
          <template v-if="lastOutcome.waves !== undefined"
            >{{ lastOutcome.waves }} vague{{ lastOutcome.waves > 1 ? 's' : '' }} tenue{{
              lastOutcome.waves > 1 ? 's' : ''
            }}</template
          >
          <template v-else>{{
            lastOutcome.win ? 'Expédition réussie !' : 'Expédition ratée'
          }}</template>
        </div>
        <div class="coll-text">{{ lastOutcome.text }}</div>
        <div class="coll-haul">
          <span v-for="p in haulPills(lastOutcome)" :key="p.emoji">{{ p.emoji }} +{{ p.n }}</span>
          <span v-for="(it, i) in lastOutcomeItems" :key="i" class="coll-item">
            <ItemIcon :item="it" :size="26" :show-stars="false" />{{ it.name }}</span
          >
        </div>
        <q-btn
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          :label="lastPending ? '🎁 Récupérer le butin' : 'Super'"
          @click="lastPending ? doClaim() : (collectOpen = false)"
        />
      </q-card>
    </q-dialog>

    <div v-if="!active && !pois.length" class="empty">
      La carte se peuple avec le temps — de nouvelles activités apparaissent régulièrement. Reviens
      bientôt.
    </div>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useGameFx } from '@/composables/useGameFx';
import { useGamePanel } from '@/composables/useGamePanel';
import GameLoader from '@/components/GameLoader.vue';
import ItemIcon from '@/components/ItemIcon.vue';
import { computeCharacter } from '@/lib/character';
import { DUNGEONS } from '@/data/dungeons';
import { playerWithGear, mergeEffects, RARITY_RANK } from '@/lib/items';
import { expeditionsUnlocked, travelTimeMult } from '@/lib/buildings';
import { talentEffects } from '@/lib/talents';
import { voiePassiveEffects, type VoieId } from '@/lib/voies';
import { simulateCombat, type Combatant } from '@/lib/combat';
import {
  POI_LABEL,
  type ExpeditionMessage,
  haulPills,
  EXPE,
  travelPosition,
  poiCombatant,
  simulateArena,
  goldCost,
  travelOneWayMin,
  expeditionTerrain,
  type Poi,
  type PoiType,
  HARVEST_TYPES,
} from '@/lib/expedition';
import { advAvailable, advTitle } from '@/lib/adventurers';
import { CARAVAN, caravanLegMin, caravanSlots, isCaravanClaimable } from '@/lib/caravan';

const props = defineProps<{ embedded?: boolean }>();
const router = useRouter();
const { gameBack } = useGamePanel();
// Retour : dans le volet jeu (cockpit) → revient à l'Aventure du volet ; sinon route.
function back() {
  if (props.embedded) return gameBack();
  router.back();
}
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const gameFx = useGameFx();

const TOWN = EXPE.town;
const MAP = EXPE.mapSize;
const POI_EMO: Record<PoiType, string> = {
  mine: '⛏️',
  camp: '🏕️',
  lair: '👹',
  arena: '🏟️',
  well: '💧',
  shrine: '🔮',
  archive: '📖',
  wreck: '🔩',
};

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
// Niveau de PROGRESSION DANS LE JEU (≠ niveau de sport) : profondeur atteinte en donjon
// = recoLevel du donjon le plus profond nettoyé (frontière). Sert à caler la DIFFICULTÉ
// des expéditions sur ce que le joueur a VRAIMENT accompli, pas sur son niveau de sport
// (qui peut être élevé sans avoir farmé le jeu → sinon activités 100 % gagnées). Ticket
// f6e40aa6. Plancher 2 (early : quelques activités abordables). +1 = la « frontière »
// (le cran juste au-dessus du dernier nettoyé) → une part d'activités reste un vrai défi.
const progressionLevel = computed(() => {
  const cleared = new Set(char.row?.cleared_dungeons ?? []);
  let maxReco = 0;
  for (const d of DUNGEONS) if (cleared.has(d.id)) maxReco = Math.max(maxReco, d.recoLevel);
  return Math.max(2, maxReco + 1); // frontière = un cran au-dessus du dernier nettoyé
});
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    mergeEffects(
      talentEffects(char.row?.talents ?? []),
      voiePassiveEffects(char.row?.voie as VoieId),
    ),
    heroLevel.value,
    char.row?.voie,
  ),
);

const active = computed(() => char.row?.expedition ?? null);
const pois = computed<Poi[]>(() => char.row?.expedition_map?.pois ?? []);
// Fond de carte (terrain) déterministe pour le seed de la carte.
const terrain = computed(() =>
  char.row?.expedition_map
    ? expeditionTerrain(char.row.expedition_map.seed)
    : { coast: '', features: [], rivers: [] },
);
const hero = computed(() => (active.value ? travelPosition(active.value, now.value) : null));

// Chevrons de direction le long du segment RESTANT (héros → cible du moment :
// l'objectif à l'aller, la ville au retour). Ils s'allument un à un du héros vers
// la cible (délai croissant) et sont orientés dans le sens du déplacement.
const ARROW_STEP = 0.16; // décalage d'allumage entre 2 chevrons (s)
const travelArrows = computed(() => {
  const h = hero.value;
  const a = active.value;
  if (!h || !a || h.phase === 'done') return [];
  const target = h.phase === 'return' ? TOWN : a.poi;
  const dx = target.x - h.x;
  const dy = target.y - h.y;
  const len = Math.hypot(dx, dy);
  if (len < 6) return []; // trop proche de la cible → rien à montrer
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const n = Math.min(5, Math.max(2, Math.round(len / 14))); // ~1 chevron / 14 u
  const arrows: { x: number; y: number; angle: number; i: number; delay: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1); // répartis, sans coller au héros ni à la cible
    arrows.push({ x: h.x + dx * t, y: h.y + dy * t, angle, i, delay: (i - 1) * ARROW_STEP });
  }
  return arrows;
});

// ── Carte pannable/zoomable (plus grande que l'écran) ──
const scrollEl = ref<HTMLElement | null>(null);
const mapPx = ref(700); // taille de rendu du SVG (px) → zoom
const scrollX = ref(0);
const scrollY = ref(0);
const contW = ref(1);
const contH = ref(1);
const MIN_PX = 340;
const MAX_PX = 1700;
const ZOOM_STEP = 200; // 1 cran de zoom (± via les boutons +/−)
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
  el.scrollLeft = (svgX / MAP) * mapPx.value - el.clientWidth / 2;
  el.scrollTop = (svgY / MAP) * mapPx.value - el.clientHeight / 2;
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
  mapPx.value = Math.max(MIN_PX, Math.min(MAX_PX, mapPx.value + dir * ZOOM_STEP));
  void nextTick(() => centerOn(cx * MAP, cy * MAP));
}
// Activités hors écran → flèche au bord pointant vers elles (clic = slide dessus).
const edgeIndicators = computed(() => {
  if (!scrollEl.value)
    return [] as { id: string; poi: Poi; x: number; y: number; deg: number; diff: string }[];
  const cw = contW.value;
  const ch = contH.value;
  const m = 22;
  const src = [...pois.value, ...(active.value ? [active.value.poi] : [])];
  const out: { id: string; poi: Poi; x: number; y: number; deg: number; diff: string }[] = [];
  for (const p of src) {
    const px = (p.x / MAP) * mapPx.value - scrollX.value;
    const py = (p.y / MAP) * mapPx.value - scrollY.value;
    if (px >= 0 && px <= cw && py >= 0 && py <= ch) continue; // visible
    const dx = px - cw / 2;
    const dy = py - ch / 2;
    const scale = Math.min(
      (cw / 2 - m) / (Math.abs(dx) || 1e-6),
      (ch / 2 - m) / (Math.abs(dy) || 1e-6),
    );
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

// ── CARAVANES ──────────────────────────────────────────────────────────────
// Un convoi part vers un lieu de RÉCOLTE, ne coûte aucune énergie, et immobilise son
// escorte. Il CONSOMME le lieu comme le ferait le héros : les deux se disputent la carte.
const escort = ref<string[]>([]);
const freeAdvs = computed(() => char.advList.filter((a) => advAvailable(a, now.value)));
const vansLeft = computed(
  () =>
    caravanSlots(char.comptoirLevel) -
    char.caravanList.filter((c) => now.value < c.returnAt).length,
);
const canOfferCaravan = computed(
  () => !!selected.value && char.comptoirLevel > 0 && HARVEST_TYPES.has(selected.value.type),
);
const caravanMin = computed(() =>
  selected.value
    ? 2 *
      caravanLegMin(
        selected.value,
        freeAdvs.value.filter((a) => escort.value.includes(a.id)),
      )
    : 0,
);
const canSendCaravanNow = computed(
  () => escort.value.length > 0 && vansLeft.value > 0 && !busyCaravan.value,
);
/** Les convois EN ROUTE, situés par la même interpolation que le héros
 *  (`travelPosition`) : un convoi part, atteint son lieu, et revient — on doit le voir
 *  faire, sinon la seule trace d'une caravane est une carte « 🎁 Récupérer ». */
const vansOnMap = computed(() =>
  char.caravanList
    .filter((c) => now.value < c.returnAt)
    .map((c) => ({ id: c.id, poi: c.poi, at: travelPosition(c, now.value) })),
);
const busyCaravan = ref(false);
const claimable = computed(() => char.caravanList.filter((c) => isCaravanClaimable(c, now.value)));
async function doClaimCaravan(id: string) {
  const uid = auth.user?.id;
  if (!uid || busyCaravan.value) return;
  busyCaravan.value = true;
  try {
    const ok = await char.claimCaravan(uid, id);
    if (ok) $q.notify({ type: 'positive', message: 'Cargaison récupérée.' });
  } finally {
    busyCaravan.value = false;
  }
}
function toggleEscort(id: string) {
  escort.value = escort.value.includes(id)
    ? escort.value.filter((x) => x !== id)
    : escort.value.length < CARAVAN.escortMax
      ? [...escort.value, id]
      : escort.value;
}
async function doSendCaravan() {
  const uid = auth.user?.id;
  const poi = selected.value;
  if (!uid || !poi || busyCaravan.value) return;
  busyCaravan.value = true;
  try {
    const ok = await char.sendCaravan(uid, poi, escort.value);
    if (ok) {
      selected.value = null;
      escort.value = [];
    }
    $q.notify(
      ok
        ? { type: 'positive', message: 'Le convoi est parti.' }
        : { type: 'negative', message: 'Envoi impossible (place, escorte ou Comptoir).' },
    );
  } finally {
    busyCaravan.value = false;
  }
}
const collectOpen = ref(false);
const lastOutcome = ref<ExpeditionMessage | null>(null);
// Objets ramenés (l'arène en rend PLUSIEURS via `items`, les autres un seul via `item`).
const lastOutcomeItems = computed(() => {
  const o = lastOutcome.value;
  if (!o) return [];
  return o.items && o.items.length ? o.items : o.item ? [o.item] : [];
});
/** Le rapport ouvert attend-il d'être encaissé ? (sinon la modale n'est qu'un compte rendu) */
const lastPending = computed(() => !!lastOutcome.value && lastOutcome.value.claimed === false);

// ── Filons de production (village autour de la ville) ──
function selectPoi(p: Poi) {
  if (active.value) return;
  selected.value = p;
}

// % de victoire (Monte-Carlo) contre l'adversaire du POI.
const winPct = computed(() => {
  const p = selected.value;
  if (!p || HARVEST_TYPES.has(p.type) || p.type === 'arena') return 100; // récolte : pas de combat
  const foe = poiCombatant(p.level, p.type);
  let w = 0;
  for (let s = 0; s < 40; s++)
    if (simulateCombat(fighter.value, foe, { seed: s * 131 + 5, goldOnWin: 0 }).win) w++;
  return Math.round((w / 40) * 100);
});
// Arène : estimation du nombre de vagues tenues (moyenne Monte-Carlo).
const arenaWaves = computed(() => {
  const p = selected.value;
  if (!p || p.type !== 'arena') return 0;
  let sum = 0;
  for (let s = 0; s < 24; s++) sum += simulateArena(fighter.value, p.level, s * 977 + 3);
  return Math.round(sum / 24);
});
function winClass(pct: number): string {
  return pct >= 70 ? 'wp-good' : pct >= 35 ? 'wp-mid' : 'wp-bad';
}
function diffClass(p: Poi): string {
  const d = p.level - progressionLevel.value;
  return d <= 0 ? 'easy' : d <= 2 ? 'mid' : 'hard';
}

const costOf = (p: Poi) => goldCost(p.type, p.level);
// Avant-poste : débloque les expéditions + réduit les trajets.
const outpostBuilt = computed(() => expeditionsUnlocked(char.row?.buildings ?? []));
const travelMult = computed(() => travelTimeMult(char.row?.buildings ?? []));
const roundTripMin = (p: Poi) =>
  Math.round(travelOneWayMin(p.level, p.distNorm) * 2 * travelMult.value);
// Ce que le POI rapporte VRAIMENT (crédité par expeCollect) : or, énergie (mines),
// objets, clés. La poussière n'existe plus (refonte drops-only) → on ne l'annonce plus.
function poiRewardLabel(p: Poi): string {
  if (p.type === 'mine') return 'Or 🪙 + énergie ⚡ (récolte)';
  if (p.type === 'well') return 'Énergie ⚡ en quantité (récolte, sans combat)';
  if (p.type === 'shrine') return "Pierres d'invocation 🔮 (récolte, sans combat)";
  if (p.type === 'archive') return 'Clés du Labyrinthe 🗝️ (récolte, sans combat)';
  // ⚠️ Sans cette ligne, l'épave tombait dans le cas par défaut et s'annonçait comme un
  // REPAIRE (« pièce de set + pierres ») — l'inverse de ce qu'elle donne vraiment.
  if (p.type === 'wreck') return 'Ferraille 🔩 en quantité (récolte, sans combat)';
  if (p.type === 'camp') return 'Or 🪙 + un objet 🎁';
  if (p.type === 'arena') return 'Survie par vagues 🌊 — objets + pierres 🔮 ∝ vagues';
  return 'Pièce de set 🧩 + pierres d’invocation 🔮';
}

const canSend = computed(
  () =>
    !!selected.value &&
    !active.value &&
    !!char.row &&
    progress.ready.value &&
    outpostBuilt.value &&
    (char.row?.gold ?? 0) >= costOf(selected.value),
);
const sendLabel = computed(() => {
  if (!selected.value) return 'Envoyer';
  if (!outpostBuilt.value) return '🧭 Construis un Avant-poste d’abord';
  if ((char.row?.gold ?? 0) < costOf(selected.value)) return 'Pas assez d’or';
  return `Envoyer le héros (🪙 ${costOf(selected.value)})`;
});

async function send() {
  const uid = auth.user?.id;
  const p = selected.value;
  if (!uid || !p || !canSend.value) return;
  try {
    await char.expeSend(uid, p, fighter.value, Date.now(), progressionLevel.value);
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
    // Le héros rentre : il redevient disponible, mais son chargement reste à ENCAISSER.
    const settled = await char.expeSettle(uid, Date.now());
    if (settled) {
      lastOutcome.value = settled;
      collectOpen.value = true;
    }
    await char.expeSyncMap(uid, Date.now(), progressionLevel.value);
  } finally {
    busy = false;
  }
}

/** Encaisse le rapport ouvert. La CÉLÉBRATION est ici et non au retour : le butin se
 *  découvre au moment où on le prend, pas pendant qu'on regardait ailleurs. */
async function doClaim() {
  const uid = auth.user?.id;
  const m = lastOutcome.value;
  if (!uid || !m) return;
  const done = await char.expeClaim(uid, m.id, Date.now());
  collectOpen.value = false;
  if (!done) return;
  const drops = done.items && done.items.length ? done.items : done.item ? [done.item] : [];
  const rk = (r: string) => RARITY_RANK[r as keyof typeof RARITY_RANK] ?? 0;
  const top = drops.slice().sort((a, b) => rk(b.rarity) - rk(a.rarity))[0];
  if (top && rk(top.rarity) >= 7)
    gameFx.celebrate({
      kind: 'drop',
      emoji: top.emoji,
      title: rk(top.rarity) >= 9 ? 'DROP RANG SSS !' : `Butin rang ${top.rarity} !`,
      subtitle:
        drops.length > 1
          ? `${top.name} (+${drops.length - 1} autre${drops.length > 2 ? 's' : ''})`
          : top.name,
      rarity: rk(top.rarity) >= 9 ? 'divin' : rk(top.rarity) >= 8 ? 'legendary' : 'epic',
    });
}

// Écran de chargement thématique bref à l'ouverture de la carte (immersion).
const booting = ref(true);
onMounted(async () => {
  setTimeout(() => (booting.value = false), 750);
  const uid = auth.user?.id;
  if (uid && !char.row) await char.fetchMine().catch(() => undefined);
  if (uid) await char.expeSyncMap(uid, Date.now(), progressionLevel.value).catch(() => undefined);
  await nextTick();
  measure();
  // Vue de départ : base large (grande carte) + 2 crans de zoom (1 cran = 200 px).
  mapPx.value = Math.max(MIN_PX, Math.min(MAX_PX, Math.round(contW.value * 1.3) + 2 * ZOOM_STEP));
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
/* ── Caravanes : la seconde offre d’un lieu de récolte ── */
.car-sep {
  margin: 10px 0 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dim);
  text-align: center;
}
.car-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
/* Grille fluide : l’escorte peut compter jusqu’à quatre noms sur un écran plié. */
.car-pick {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}
.car-adv {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 7px 4px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  min-height: 44px;
}
.car-adv.on {
  border-color: var(--accent);
  background: linear-gradient(180deg, rgba(255, 210, 63, 0.16), #1d1913 65%);
}
.ca-emo {
  font-size: 20px;
}
.ca-name {
  font-size: 11px;
  color: var(--dim);
}
.car-send {
  margin-top: 2px;
}
/* Convois rentrés : la cargaison se récupère À LA MAIN, comme les expéditions. */
.vans {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.van {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.van-go {
  margin-left: auto;
  background: var(--accent);
  color: #15120e;
  border: none;
  border-radius: 9px;
  padding: 7px 11px;
  font-weight: 700;
  min-height: 36px;
}
/* Route dangereuse : télégraphiée AVANT l'envoi → le choix du POI devient un arbitrage
   risque/gain, au lieu de « le plus proche ». */
.sh-chip.peril {
  border-color: var(--d3);
  color: var(--d3);
}

.emap {
  background: var(--bg);
  min-height: 100vh;
  color: var(--text);
  padding-bottom: 24px;
}
.emap.embedded {
  min-height: 0;
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
.outpost-hint {
  margin: 0 12px 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.4;
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
  background: #d7d0bd;
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
/* Terrain : socle + régions SOLIDES + motifs vectoriels */
/* Carte PARCHEMIN dessinée à l'encre (style livre d'aventure) */
/* Parchemin NOIR & BLANC (encre monochrome) */
.sea {
  fill: #d7d0bd;
}
.coast-line {
  fill: #2a251c;
  transform: translate(0.7px, 0.8px); /* double-trait de côte */
}
.land {
  fill: #ece3cd;
  stroke: #2a251c;
  stroke-width: 0.5;
}
.river {
  fill: none;
  stroke: #2a251c;
  stroke-width: 0.35;
  stroke-linecap: round;
  opacity: 0.65;
}
.feat {
  pointer-events: none;
}
.f-mountain {
  fill: none;
  stroke: #2a251c;
  stroke-width: 0.42;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.f-tree {
  fill: #2f2b22;
  stroke: none;
}
.f-dune {
  fill: none;
  stroke: #2a251c;
  stroke-width: 0.4;
  stroke-linecap: round;
  opacity: 0.7;
}
.map-frame {
  fill: none;
  stroke: #2a251c;
  stroke-width: 0.55;
}
.map-frame.thin {
  stroke-width: 0.28;
}
.compass .comp-bg {
  fill: #ece3cd;
  stroke: #2a251c;
  stroke-width: 0.4;
}
.compass .comp-n {
  font-size: 3px;
  text-anchor: middle;
  fill: #2a251c;
  font-weight: 700;
}
.compass .comp-needle {
  fill: #2a251c;
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
/* Convois : violet, distinct du bleu du héros ET de l'accent jaune (sélection/cible),
   et hors de la gamme vert/orange/rouge qui code la difficulté des lieux. Pointillé
   pour rester lisible sans la couleur. */
.trail.van {
  stroke-width: 1;
  stroke-dasharray: 2 2.2;
}
.trail.van.done {
  stroke: rgba(181, 123, 255, 0.32);
}
.trail.van.todo {
  stroke: #b57bff;
  filter: drop-shadow(0 0 1px rgba(181, 123, 255, 0.55));
}
.van-mark {
  fill: var(--surface);
  stroke: #b57bff;
  stroke-width: 0.8;
}
.van-emo {
  font-size: 3px;
  text-anchor: middle;
  pointer-events: none;
}

/* Chevrons de direction : s'allument un à un (délai croissant héros→cible) puis
   s'éteignent → sensation de flux dans le sens du déplacement. En boucle. */
.dir-arrow {
  fill: #4a9eff;
  stroke: none;
  opacity: 0;
  animation: dir-flow 1.5s ease-in-out infinite;
}
@keyframes dir-flow {
  0% {
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  55% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dir-arrow {
    animation: none;
    opacity: 0.85;
  }
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
/* Annonce « activité débloquée » (construction d'un bâtiment de déblocage). */
.unlock-card {
  padding: 24px;
  text-align: center;
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  min-width: 280px;
  max-width: 360px;
  border: 1px solid var(--accent);
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent);
}
.empty {
  margin: 24px 16px;
  color: var(--dim);
  text-align: center;
  font-size: 13px;
}
</style>
