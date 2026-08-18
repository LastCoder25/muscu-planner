<template>
  <q-page class="emap">
    <GameLoader :show="booting" icon="🗺️" label="Chargement de la carte…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
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

    <!-- Avant-poste requis pour envoyer des expéditions (construis-le sur un emplacement). -->
    <div v-if="!outpostBuilt" class="outpost-hint">
      🧭 Construis un <b>Avant-poste d’expédition</b> sur un emplacement pour envoyer des héros.
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
          <g v-if="active && hero">
            <circle :cx="hero.x" :cy="hero.y" r="3.4" class="hero" />
            <text :x="hero.x" :y="hero.y + 1.2" class="hero-emo">🧝</text>
          </g>

          <!-- Filons de production (village autour de la ville) -->
          <g
            v-for="pl in plots"
            :key="'plot' + pl.slot"
            class="plot"
            :class="{
              locked: !pl.unlocked,
              built: !!pl.building,
              ready: pl.ready,
              upgraded: flashSlot === pl.slot,
            }"
            @click="openPlot(pl)"
          >
            <circle :cx="pl.x" :cy="pl.y" r="4.2" class="plot-bg" />
            <text v-if="!pl.unlocked" :x="pl.x" :y="pl.y + 1.4" class="plot-emo">🔒</text>
            <text v-else-if="!pl.building" :x="pl.x" :y="pl.y + 1.6" class="plot-emo plot-plus">
              ＋
            </text>
            <template v-else>
              <text :x="pl.x" :y="pl.y + 1.4" class="plot-emo">{{ filonEmoji(pl.building) }}</text>
              <!-- Pastille de NIVEAU (lisible) en haut à droite du bâtiment -->
              <circle :cx="pl.x + 3.4" :cy="pl.y - 3.4" r="2.3" class="plot-lvl-bg" />
              <text :x="pl.x + 3.4" :y="pl.y - 2.5" class="plot-lvl font-display">
                {{ pl.building.level }}
              </text>
              <!-- Pastille « prêt à récolter » en bas à droite -->
              <circle
                v-if="pl.ready"
                :cx="pl.x + 3.4"
                :cy="pl.y + 3.4"
                r="1.5"
                class="plot-ready"
              />
            </template>
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

      <!-- Récolte des filons (visible dès qu'il y a quelque chose à récolter) -->
      <button
        v-if="readyTotal.dust + readyTotal.stone + readyTotal.energy > 0"
        class="collect-pill"
        @click="collectAll"
      >
        🧺 Récolter
        <span v-if="readyTotal.dust" class="cp-r">✨{{ readyTotal.dust }}</span>
        <span v-if="readyTotal.stone" class="cp-r">💎{{ readyTotal.stone }}</span>
        <span v-if="readyTotal.energy" class="cp-r">⚡{{ readyTotal.energy }}</span>
      </button>
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
          <span v-else-if="selected.type !== 'mine'" class="sh-chip" :class="winClass(winPct)"
            >🎯 {{ winPct }}%</span
          >
        </div>
        <button class="sh-send" :disabled="!canSend" @click="send">
          {{ sendLabel }}
        </button>
      </div>
    </transition>

    <!-- Emplacement de filon (construire / récolter / améliorer) — MODALE centrée
         (clic-dehors ou croix pour fermer ; plus de scroll en bas de page). -->
    <transition name="plot-fade">
      <div v-if="selectedPlot" class="plot-backdrop" @click.self="selectedSlot = null">
        <div class="sheet plot-modal">
          <div class="sh-head">
            <span class="sh-emo">{{
              selectedPlot.building ? filonEmoji(selectedPlot.building) : '🏗️'
            }}</span>
            <div class="sh-main">
              <div class="sh-title font-display">
                {{
                  selectedPlot.building ? filonLabel(selectedPlot.building) : 'Emplacement libre'
                }}
              </div>
              <div class="sh-sub">
                <template v-if="!selectedPlot.unlocked"
                  >🔒 Débloqué au niveau {{ plotUnlockLevel(selectedPlot.slot) }}</template
                >
                <template v-else-if="selectedPlot.building"
                  >Niv {{ selectedPlot.building.level }} ·
                  {{ filonProdLabel(selectedPlot.building) }}</template
                >
                <template v-else>Construis un filon (production passive de ressources).</template>
              </div>
            </div>
            <button class="sh-x" @click="selectedSlot = null">✕</button>
          </div>

          <!-- Construire : choix du type (gaté par niveau + unicité) -->
          <div v-if="selectedPlot.unlocked && !selectedPlot.building" class="plot-build">
            <button
              v-for="t in BUILDING_TYPES"
              :key="t.id"
              class="pb-opt"
              :class="{ locked: !typeBuildable(t) }"
              :disabled="!typeBuildable(t) || (char.row?.gold ?? 0) < t.buildGold"
              @click="doBuild(selectedPlot.slot, t.id)"
            >
              <span class="pb-emo">{{ t.emoji }}</span>
              <span class="pb-main">
                <span class="pb-name">{{ t.label }}</span>
                <span class="pb-desc">{{ t.desc }}</span>
              </span>
              <span class="pb-cost">{{
                typeBuildable(t) ? '🪙' + t.buildGold : typeLockReason(t)
              }}</span>
            </button>
          </div>

          <!-- Bâtiment construit : gérer -->
          <div v-else-if="selectedPlot.building" class="plot-manage">
            <!-- Niveau actuel + effet/production, avec APERÇU du niveau suivant -->
            <div class="pm-level">
              <span
                >Niveau <b>{{ selectedPlot.building.level }}</b> ·
                {{ filonProdLabel(selectedPlot.building) }}</span
              >
              <span
                v-if="
                  nextEffectLabel(selectedPlot.building) &&
                  nextEffectLabel(selectedPlot.building) !== filonProdLabel(selectedPlot.building)
                "
                class="pm-next"
              >
                ⬆️ Niv {{ selectedPlot.building.level + 1 }} ·
                {{ nextEffectLabel(selectedPlot.building) }}
              </span>
            </div>
            <!-- Filon : récolte (accumulation fractionnaire visible même quand < 1) -->
            <div v-if="!isUtility(selectedPlot.building)" class="pm-ready">
              <span>
                En stock :
                <b
                  >{{ filonResEmoji(selectedPlot.building)
                  }}{{ plotAccruedExact(selectedPlot.building).toFixed(1) }}</b
                >
              </span>
              <span class="pm-cap">/ {{ Math.floor(plotStorage(selectedPlot.building)) }} max</span>
            </div>
            <div class="pm-actions">
              <button
                v-if="!isUtility(selectedPlot.building)"
                class="pm-collect"
                :disabled="plotAccrued(selectedPlot.building) < 1"
                @click="collectAll"
              >
                🧺 Récolter
              </button>
              <button
                v-if="buildingScales(selectedPlot.building.typeId)"
                class="pm-up"
                :disabled="
                  !plotCanUpgrade(selectedPlot.building) ||
                  (char.row?.gold ?? 0) < plotUpCost(selectedPlot.building)
                "
                @click="doUpgrade(selectedPlot.slot)"
              >
                <template v-if="!plotCanUpgrade(selectedPlot.building)"
                  >Max (niv {{ heroLevel }})</template
                >
                <template v-else>⬆️ Améliorer · 🪙{{ plotUpCost(selectedPlot.building) }}</template>
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Annonce « activité débloquée » à la construction d'un bâtiment de déblocage -->
    <q-dialog v-model="unlockOpen">
      <q-card v-if="unlockInfo" class="unlock-card">
        <div class="unlock-emo">{{ unlockInfo.emoji }}</div>
        <div class="unlock-title font-display">{{ unlockInfo.label }} construit !</div>
        <div class="unlock-act">
          🎉 Débloqué : <b>{{ unlockInfo.unlock.activity }}</b>
        </div>
        <div class="unlock-where">📍 {{ unlockInfo.unlock.where }}</div>
        <div class="unlock-actions">
          <button v-if="unlockInfo.unlock.route" class="unlock-go" @click="goUnlock">
            Y aller
          </button>
          <button class="unlock-ok" @click="unlockInfo = null">Continuer</button>
        </div>
      </q-card>
    </q-dialog>

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
          <span v-if="lastOutcome.gold">🪙 +{{ lastOutcome.gold }}</span>
          <span v-if="lastOutcome.dust">✨ +{{ lastOutcome.dust }}</span>
          <span v-if="lastOutcome.stones">💎 +{{ lastOutcome.stones }}</span>
          <span v-if="lastOutcome.key">🗝️ +{{ lastOutcome.key }}</span>
          <span v-for="(it, i) in lastOutcomeItems" :key="i" class="coll-item"
            >🎁 {{ it.name }}</span
          >
        </div>
        <q-btn
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          label="Super"
          @click="collectOpen = false"
        />
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
import { useGameFx } from '@/composables/useGameFx';
import GameLoader from '@/components/GameLoader.vue';
import { computeCharacter } from '@/lib/character';
import { playerWithGear, RARITY_RANK } from '@/lib/items';
import {
  BUILDING_TYPES,
  buildingType,
  buildingScales,
  plotsForLevel,
  slotUnlockLevel,
  buildingUpgradeCost,
  canUpgradeBuilding,
  canBuildType,
  buildingUnlockLevel,
  buildingProdPerHour,
  buildingStorageCap,
  buildingAccrued,
  storageMult,
  collectable,
  expeditionsUnlocked,
  travelTimeMult,
  labyrinthLuckBonus,
  bossAltarRollFloor,
  BUILD,
  type Building,
  type BuildingType,
  type BuildingUnlock,
} from '@/lib/buildings';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, type Combatant } from '@/lib/combat';
import {
  EXPE,
  heroPosition,
  poiCombatant,
  simulateArena,
  goldCost,
  travelOneWayMin,
  expeditionTerrain,
  type Poi,
  type PoiType,
  type ExpeditionOutcome,
} from '@/lib/expedition';

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const gameFx = useGameFx();
// Emplacement fraîchement amélioré → flash localisé bref (anim d'upgrade).
const flashSlot = ref<number | null>(null);

const TOWN = EXPE.town;
const MAP = EXPE.mapSize;
const POI_EMO: Record<PoiType, string> = { mine: '⛏️', camp: '🏕️', lair: '👹', arena: '🏟️' };
const POI_LABEL: Record<PoiType, string> = {
  mine: 'Mine',
  camp: 'Camp',
  lair: 'Repaire',
  arena: 'Arène',
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
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    talentEffects(char.row?.talents ?? [], heroLevel.value),
    heroLevel.value,
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
const hero = computed(() => (active.value ? heroPosition(active.value, now.value) : null));

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
const collectOpen = ref(false);
const lastOutcome = ref<ExpeditionOutcome | null>(null);
// Objets ramenés (l'arène en rend PLUSIEURS via `items`, les autres un seul via `item`).
const lastOutcomeItems = computed(() => {
  const o = lastOutcome.value;
  if (!o) return [];
  return o.items && o.items.length ? o.items : o.item ? [o.item] : [];
});

// ── Filons de production (village autour de la ville) ──
const PLOT_R = 22; // rayon des emplacements autour de la ville (< distMin des POI)
interface PlotView {
  slot: number;
  x: number;
  y: number;
  unlocked: boolean;
  building: Building | null;
  ready: boolean;
}
const plots = computed<PlotView[]>(() => {
  const cap = BUILD.plotCap;
  const unlocked = plotsForLevel(heroLevel.value);
  const bs = char.row?.buildings ?? [];
  return Array.from({ length: cap }, (_, i) => {
    const ang = ((-90 + i * (360 / cap)) * Math.PI) / 180;
    const b = bs.find((x) => x.slot === i) ?? null;
    return {
      slot: i,
      x: TOWN.x + Math.cos(ang) * PLOT_R,
      y: TOWN.y + Math.sin(ang) * PLOT_R,
      unlocked: i < unlocked,
      building: b,
      ready: b ? buildingAccrued(b, now.value) > 0 : false,
    };
  });
});
const readyTotal = computed(() => collectable(char.row?.buildings ?? [], now.value));
const selectedSlot = ref<number | null>(null);
const selectedPlot = computed<PlotView | null>(() =>
  selectedSlot.value === null
    ? null
    : (plots.value.find((p) => p.slot === selectedSlot.value) ?? null),
);
function openPlot(pl: PlotView) {
  selected.value = null;
  selectedSlot.value = pl.slot;
}
function plotUnlockLevel(slot: number): number {
  return slotUnlockLevel(slot);
}
function filonEmoji(b: Building): string {
  return buildingType(b.typeId)?.emoji ?? '⛏️';
}
function filonLabel(b: Building): string {
  return buildingType(b.typeId)?.label ?? 'Filon';
}
const RES_EMOJI: Record<string, string> = { dust: '✨', stone: '💎', energy: '⚡' };
// Emoji de la ressource produite par un bâtiment (✨/💎/⚡) — remplace l'ancien binaire.
function filonResEmoji(b: Building): string {
  return RES_EMOJI[buildingType(b.typeId)?.resource ?? 'dust'] ?? '✨';
}
// Effet/production d'un bâtiment À UN NIVEAU donné (producteur → prod/h ; utilitaire → effet).
function buildingEffectAt(b: Building, level: number): string {
  const t = buildingType(b.typeId);
  if (!t) return '';
  const at: Building = { ...b, level };
  if (t.category === 'utility') return utilityEffectLabel(at);
  return `${buildingProdPerHour(at).toFixed(1)} ${RES_EMOJI[t.resource ?? 'dust'] ?? '✨'}/h`;
}
function filonProdLabel(b: Building): string {
  return buildingEffectAt(b, b.level);
}
// Effet du niveau SUIVANT (vide si déjà au max = niveau joueur).
function nextEffectLabel(b: Building): string {
  return plotCanUpgrade(b) ? buildingEffectAt(b, b.level + 1) : '';
}
function plotAccrued(b: Building): number {
  return buildingAccrued(b, now.value, storageMult(char.row?.buildings ?? []));
}
// Accumulation EXACTE (non arrondie) pour l'affichage : un filon lent (pierres
// niv.1 ~0.16/h) affichait « 0 » pendant des heures (floor) → on voit qu'il tourne.
function plotAccruedExact(b: Building): number {
  const perHr = buildingProdPerHour(b);
  const mult = storageMult(char.row?.buildings ?? []);
  const hours = Math.max(0, (now.value - b.collectedAt) / 3_600_000);
  return Math.min(perHr * hours, buildingStorageCap(b, mult));
}
function plotStorage(b: Building): number {
  return buildingStorageCap(b, storageMult(char.row?.buildings ?? []));
}
function plotCanUpgrade(b: Building): boolean {
  return canUpgradeBuilding(b, heroLevel.value);
}
function plotUpCost(b: Building): number {
  return buildingUpgradeCost(b.level);
}
// Annonce « activité débloquée » (quoi + où) après avoir construit un bâtiment de
// déblocage → le joueur sait ce qu'il vient d'ouvrir et où le trouver.
const unlockInfo = ref<{ emoji: string; label: string; unlock: BuildingUnlock } | null>(null);
const unlockOpen = computed({
  get: () => !!unlockInfo.value,
  set: (v: boolean) => {
    if (!v) unlockInfo.value = null;
  },
});
function goUnlock() {
  const route = unlockInfo.value?.unlock.route;
  unlockInfo.value = null;
  if (route) void router.push(route);
}
function doBuild(slot: number, typeId: string) {
  const uid = auth.user?.id;
  const t = buildingType(typeId);
  if (!uid || !t) return;
  void char.buildFilon(uid, typeId, slot, Date.now(), heroLevel.value).then(() => {
    // Célébration centrale uniquement à la CONSTRUCTION (rare), pas aux upgrades.
    if (char.row?.buildings.some((b) => b.slot === slot)) {
      selectedSlot.value = null; // ferme la modale → l'animation joue en plein écran
      gameFx.celebrate({
        kind: 'building',
        emoji: t.emoji,
        title: 'Bâtiment construit !',
        subtitle: t.label,
        rarity: 'legendary', // gros éclat pour un moment marquant
      });
      // Bâtiment qui DÉBLOQUE une activité → annonce « débloqué : X, ça se trouve ici ».
      if (t.unlock) unlockInfo.value = { emoji: t.emoji, label: t.label, unlock: t.unlock };
    }
  });
}
function doUpgrade(slot: number) {
  const uid = auth.user?.id;
  if (!uid) return;
  const before = char.row?.buildings.find((b) => b.slot === slot)?.level ?? 0;
  void char.upgradeFilon(uid, slot, heroLevel.value).then(() => {
    // Upgrade fréquent → flash LOCALISÉ sur l'emplacement (pas d'overlay plein écran).
    const after = char.row?.buildings.find((b) => b.slot === slot)?.level ?? 0;
    if (after > before) {
      flashSlot.value = slot;
      setTimeout(() => {
        if (flashSlot.value === slot) flashSlot.value = null;
      }, 700);
    }
  });
}
function collectAll() {
  const uid = auth.user?.id;
  if (uid) void char.collectFilons(uid, Date.now());
}
// Construction : un type est-il disponible (niveau atteint + unicité respectée) ?
function typeBuildable(t: BuildingType): boolean {
  return canBuildType(t.id, heroLevel.value, char.row?.buildings ?? []);
}
function typeLockReason(t: BuildingType): string {
  if (heroLevel.value < buildingUnlockLevel(t.id)) return `🔒 niv ${buildingUnlockLevel(t.id)}`;
  if (t.unique && (char.row?.buildings ?? []).some((b) => b.typeId === t.id))
    return 'déjà construit';
  return '';
}
function isUtility(b: Building): boolean {
  return buildingType(b.typeId)?.category === 'utility';
}
// Libellé d'effet d'un utilitaire (pour l'instant : l'entrepôt = +stockage).
function utilityEffectLabel(b: Building): string {
  const pct = Math.round((storageMult([b]) - 1) * 100);
  if (pct > 0) return `+${pct}% stockage de tous les filons`;
  if (b.typeId === 'outpost')
    return `−${Math.round((1 - travelTimeMult([b])) * 100)}% temps de trajet`;
  if (b.typeId === 'labyrinth_gate')
    return `+${Math.round(labyrinthLuckBonus([b]) * 100)}% butin des coffres`;
  if (b.typeId === 'boss_altar')
    return `4ᵉ choix · ciblage du set · +${Math.round(bossAltarRollFloor([b]) * 100)}% qualité de roll`;
  return buildingType(b.typeId)?.desc ?? ''; // incubateur & co : description
}

function selectPoi(p: Poi) {
  if (active.value) return;
  selected.value = p;
}

// % de victoire (Monte-Carlo) contre l'adversaire du POI.
const winPct = computed(() => {
  const p = selected.value;
  if (!p || p.type === 'mine' || p.type === 'arena') return 100;
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
  const d = p.level - heroLevel.value;
  return d <= 0 ? 'easy' : d <= 2 ? 'mid' : 'hard';
}

const costOf = (p: Poi) => goldCost(p.type, p.level);
// Avant-poste : débloque les expéditions + réduit les trajets.
const outpostBuilt = computed(() => expeditionsUnlocked(char.row?.buildings ?? []));
const travelMult = computed(() => travelTimeMult(char.row?.buildings ?? []));
const roundTripMin = (p: Poi) =>
  Math.round(travelOneWayMin(p.level, p.distNorm) * 2 * travelMult.value);
function poiRewardLabel(p: Poi): string {
  if (p.type === 'mine') return 'Or + poussière (récolte)';
  if (p.type === 'camp') return 'Poussière + un objet';
  if (p.type === 'arena') return 'Survie par vagues — PLUSIEURS objets + poussière ∝ vagues 🌊';
  return 'Pièce de set garantie sur réussite 🧩';
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
      // Butin d'expédition légendaire/divin → éclat central (gros moment). L'arène peut
      // en ramener plusieurs → on célèbre le PLUS RARE.
      const drops = o.items && o.items.length ? o.items : o.item ? [o.item] : [];
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
    await char.expeSyncMap(uid, Date.now(), heroLevel.value);
  } finally {
    busy = false;
  }
}

// Écran de chargement thématique bref à l'ouverture de la carte (immersion).
const booting = ref(true);
onMounted(async () => {
  setTimeout(() => (booting.value = false), 750);
  const uid = auth.user?.id;
  if (uid && !char.row) await char.fetchMine().catch(() => undefined);
  if (uid) await char.expeSyncMap(uid, Date.now(), heroLevel.value).catch(() => undefined);
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
/* Filons (emplacements autour de la ville) */
.plot {
  cursor: pointer;
}
.plot-bg {
  fill: var(--surface);
  stroke: var(--line);
  stroke-width: 0.6;
}
.plot.locked .plot-bg {
  opacity: 0.5;
  stroke-dasharray: 1 1;
}
.plot:not(.locked):not(.built) .plot-bg {
  stroke: var(--accent);
  stroke-dasharray: 1.4 1.2;
  fill: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.plot.built .plot-bg {
  stroke: #7ab8ff;
}
.plot.ready .plot-bg {
  stroke: var(--accent);
  animation: plot-pulse 1.8s ease-in-out infinite;
}
.plot-emo {
  font-size: 4px;
  text-anchor: middle;
}
.plot-plus {
  fill: var(--accent);
  font-size: 5px;
}
.plot-lvl-bg {
  fill: var(--accent);
  stroke: var(--bg);
  stroke-width: 0.5;
}
.plot-lvl {
  font-size: 3px;
  fill: var(--accent-ink, #15120e);
  text-anchor: middle;
  font-weight: 700;
}
.plot-ready {
  fill: var(--accent);
}
@keyframes plot-pulse {
  0%,
  100% {
    stroke-width: 0.6;
  }
  50% {
    stroke-width: 1.4;
  }
}
/* Flash d'UPGRADE localisé sur l'emplacement (bref anneau accent qui jaillit). */
.plot.upgraded .plot-bg {
  animation: plot-upflash 0.7s ease-out;
}
@keyframes plot-upflash {
  0% {
    stroke: var(--accent);
    stroke-width: 3;
    filter: drop-shadow(0 0 3px var(--accent));
  }
  100% {
    stroke-width: 0.6;
    filter: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .plot.ready .plot-bg {
    animation: none;
  }
}
/* Pastille « récolter » (flottante sur la carte) */
.collect-pill {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--surface);
  color: var(--accent);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.cp-r {
  font-variant-numeric: tabular-nums;
}
/* Panneau construction / gestion de filon */
.plot-build {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pb-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}
.pb-opt:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pb-opt.locked .pb-cost {
  color: var(--dim);
  font-size: 11px;
  white-space: nowrap;
}
.pb-emo {
  font-size: 22px;
}
.pb-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pb-name {
  font-weight: 700;
  font-size: 14px;
}
.pb-desc {
  font-size: 11px;
  color: var(--dim);
}
.pb-cost {
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.plot-manage {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-level {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  margin-bottom: 8px;
}
.pm-next {
  font-size: 12.5px;
  color: var(--accent);
}
.pm-ready {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 15px;
}
.pm-cap {
  color: var(--dim);
  font-size: 12px;
}
.pm-actions {
  display: flex;
  gap: 8px;
}
.pm-collect,
.pm-up {
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.pm-collect {
  border-color: var(--accent);
  color: var(--accent);
}
.pm-collect:disabled,
.pm-up:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.active-card,
.sheet {
  margin: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
}
/* Emplacement de filon en MODALE centrée (fini le scroll + croix qui ferme). */
.plot-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.plot-modal {
  margin: 0;
  width: 100%;
  max-width: 440px;
  max-height: 85vh;
  overflow-y: auto;
}
.plot-fade-enter-active,
.plot-fade-leave-active {
  transition: opacity 0.2s;
}
.plot-fade-enter-from,
.plot-fade-leave-to {
  opacity: 0;
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
.unlock-emo {
  font-size: 46px;
}
.unlock-title {
  font-size: 19px;
  font-weight: 800;
  margin: 6px 0 12px;
  color: var(--accent);
}
.unlock-act {
  font-size: 15px;
  margin-bottom: 8px;
}
.unlock-where {
  font-size: 13px;
  color: var(--dim);
  line-height: 1.4;
  margin-bottom: 18px;
}
.unlock-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.unlock-go {
  border: none;
  background: var(--accent);
  color: var(--dark, #15120e);
  font-weight: 800;
  border-radius: 10px;
  padding: 10px 18px;
  cursor: pointer;
}
.unlock-ok {
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  font-weight: 700;
  border-radius: 10px;
  padding: 10px 18px;
  cursor: pointer;
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
