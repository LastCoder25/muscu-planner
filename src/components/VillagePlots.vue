<!--
  VillagePlots — les EMPLACEMENTS du village (bâtiments de production/utilitaires).

  Vivait sur la carte d'expédition, en anneau de petites pastilles SVG autour de la ville.
  Déplacé ICI (écran « Ma base ») en v0.664 : la carte n'a plus qu'un métier — choisir où
  envoyer le héros — et la base rassemble tout ce qui se gère. Les cibles tactiles passent
  au passage de pastilles de 8 px à de vraies tuiles.

  ⚠️ Aucune formule n'est réécrite : tout passe par `src/lib/buildings.ts` et le store, qui
  restent la source unique (coûts, production, stockage, plafonds).
-->
<template>
  <div class="vp">
    <!-- Feuille de gestion d'un emplacement -->
    <q-dialog v-model="sheetOpen" position="bottom">
      <q-card v-if="selectedPlot" class="vp-sheet">
        <div class="sh-head">
          <span class="sh-emo">{{
            selectedPlot.building ? emojiOf(selectedPlot.building) : '🏗️'
          }}</span>
          <div class="sh-main">
            <div class="sh-title font-display">
              {{ selectedPlot.building ? labelOf(selectedPlot.building) : 'Emplacement libre' }}
            </div>
            <div class="sh-sub">
              <template v-if="!selectedPlot.unlocked">
                🔒 Débloqué au niveau {{ slotUnlockLevel(selectedPlot.slot) }}
              </template>
              <template v-else-if="selectedPlot.building">
                Niv {{ selectedPlot.building.level }} · {{ effectNow(selectedPlot.building) }}
              </template>
              <template v-else>
                Construis un bâtiment : débloque une activité ou améliore tes récompenses.
              </template>
            </div>
          </div>
          <button class="sh-x" @click="selectedSlot = null">✕</button>
        </div>

        <!-- Construire -->
        <div v-if="selectedPlot.unlocked && !selectedPlot.building" class="pb">
          <template v-for="g in buildGroups" :key="g.key">
            <div class="pb-group">
              <span class="pb-group-t">{{ g.label }}</span>
              <span class="pb-group-h">{{ g.hint }}</span>
            </div>
            <button
              v-for="t in g.types"
              :key="t.id"
              class="pb-opt"
              :class="{ locked: !typeBuildable(t) }"
              :disabled="!typeBuildable(t) || gold < t.buildGold"
              @click="doBuild(selectedPlot.slot, t.id)"
            >
              <span class="pb-emo">{{ t.emoji }}</span>
              <span class="pb-main">
                <span class="pb-name">{{ t.label }}</span>
                <span class="pb-desc">{{ t.desc }}</span>
                <span class="pb-perlv">⬆️ par niveau : {{ perLevelLabel(t) }}</span>
              </span>
              <span class="pb-cost">
                {{ typeBuildable(t) ? '🪙' + t.buildGold : typeLockReason(t) }}
              </span>
            </button>
          </template>
        </div>

        <!-- Gérer -->
        <div v-else-if="selectedPlot.building" class="pm">
          <div class="pm-level">
            <span
              >Niveau <b>{{ selectedPlot.building.level }}</b> ·
              {{ effectNow(selectedPlot.building) }}</span
            >
            <span v-if="effectNext(selectedPlot.building)" class="pm-next">
              ⬆️ Niv {{ selectedPlot.building.level + 1 }} · {{ effectNext(selectedPlot.building) }}
            </span>
            <span v-if="perLevelOf(selectedPlot.building)" class="pm-perlv">
              Chaque niveau : {{ perLevelOf(selectedPlot.building) }}
            </span>
          </div>
          <div v-if="produces(selectedPlot.building)" class="pm-ready">
            <span>
              En stock :
              <b
                >{{ resEmoji(selectedPlot.building)
                }}{{ accruedExact(selectedPlot.building).toFixed(1) }}</b
              >
            </span>
            <span class="pm-cap">/ {{ Math.floor(storageOf(selectedPlot.building)) }} max</span>
          </div>
          <!-- ⚠️ « Convois plus rapides à chaque niveau » ne permet pas de décider d'un
               investissement qui se compte en centaines de milliers d'or. On montre les
               CHIFFRES des prochains paliers — calculés par les fonctions du jeu, donc
               ils ne peuvent pas mentir. -->
          <div v-if="preview.length" class="pm-prev">
            <div class="pm-prev-t">Aux prochains niveaux</div>
            <div
              v-for="r in preview"
              :key="r.level"
              class="pm-prev-r"
              :class="{ now: r.level === selectedPlot.building.level, step: r.milestone }"
            >
              <span class="pp-lv">niv {{ r.level }}</span>
              <span class="pp-tx">{{ r.text }}</span>
              <span v-if="r.level === selectedPlot.building.level" class="pp-tag">actuel</span>
            </div>
            <div v-if="milestone" class="pm-prev-r step far">
              <span class="pp-lv">niv {{ milestone.level }}</span>
              <span class="pp-tx">{{ milestone.text }}</span>
            </div>
          </div>
          <div class="pm-actions">
            <!-- ⚠️ Le vivier se gère DEPUIS SON BÂTIMENT. Il vivait dans une carte en bas
                 de la base, loin de la Guilde qu'on venait de monter : on cherchait ses
                 aventuriers là où ils n'étaient pas. Un bâtiment, un endroit. -->
            <button
              v-if="selectedPlot.building.typeId === 'guild'"
              class="pm-btn open"
              @click="emit('open-guild')"
            >
              ⚔️ Voir mes aventuriers
            </button>
            <button
              v-if="produces(selectedPlot.building)"
              class="pm-btn"
              :disabled="accrued(selectedPlot.building) < 1"
              @click="collectAll"
            >
              🧺 Récolter
            </button>
            <button
              v-if="buildingScales(selectedPlot.building.typeId)"
              class="pm-btn up"
              :disabled="!canUp(selectedPlot.building) || gold < upCost(selectedPlot.building)"
              @click="doUpgrade(selectedPlot.slot)"
            >
              <template v-if="!canUp(selectedPlot.building)">Max (niv {{ heroLevel }})</template>
              <template v-else>⬆️ Améliorer · 🪙{{ upCost(selectedPlot.building) }}</template>
            </button>
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Annonce « activité débloquée » -->
    <q-dialog v-model="unlockOpen">
      <q-card v-if="unlockInfo" class="unlock-card">
        <div class="unlock-emo">{{ unlockInfo.emoji }}</div>
        <div class="unlock-title font-display">{{ unlockInfo.label }} construit !</div>
        <div class="unlock-act">
          🎉 Débloqué : <b>{{ unlockInfo.unlock.activity }}</b>
        </div>
        <div class="unlock-where">📍 {{ unlockInfo.unlock.where }}</div>
        <button class="unlock-ok" @click="unlockInfo = null">Continuer</button>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useGameFx } from '@/composables/useGameFx';
import {
  perLevelLabel,
  BUILD,
  BUILDING_TYPES,
  buildingType,
  buildingAccrued,
  buildingProdPerHour,
  buildingStorageCap,
  buildingUnlockLevel,
  buildingUpgradeCost,
  buildingScales,
  canBuildType,
  canUpgradeBuilding,
  plotsForLevel,
  slotUnlockLevel,
  storageMult,
  travelTimeMult,
  labyrinthLuckBonus,
  bossAltarRollFloor,
  bossSummonDiscount,
  type Building,
  type BuildingCategory,
  type BuildingType,
  type BuildingUnlock,
  RESOURCE_EMOJI,
} from '@/lib/buildings';
import { buildingPreview, nextMilestone } from '@/lib/buildingPreview';

const props = defineProps<{ heroLevel: number; now: number; slot: number | null }>();
const emit = defineEmits<{ 'update:slot': [number | null]; 'open-guild': [] }>();
const char = useCharacterStore();
const auth = useAuthStore();
const gameFx = useGameFx();

const gold = computed(() => char.row?.gold ?? 0);
const heroLevel = computed(() => props.heroLevel);
const buildings = computed(() => char.row?.buildings ?? []);
const plotCount = BUILD.plotCap;

interface PlotView {
  slot: number;
  unlocked: boolean;
  building: Building | null;
  ready: boolean;
}
const plots = computed<PlotView[]>(() => {
  const unlocked = plotsForLevel(heroLevel.value);
  return Array.from({ length: plotCount }, (_, i) => {
    const b = buildings.value.find((x) => x.slot === i) ?? null;
    return {
      slot: i,
      unlocked: i < unlocked,
      building: b,
      ready: b ? buildingAccrued(b, props.now, storageMult(buildings.value)) > 0 : false,
    };
  });
});

/** L'emplacement ouvert est piloté par le PARENT : c'est le dessin de l'enceinte qui
 *  sert de sélecteur (comme l'anneau de la carte le faisait avant). */
const selectedSlot = computed({
  get: () => props.slot,
  set: (v: number | null) => emit('update:slot', v),
});
const selectedPlot = computed(() =>
  selectedSlot.value === null
    ? null
    : (plots.value.find((p) => p.slot === selectedSlot.value) ?? null),
);
/** Les prochains niveaux, chiffrés. Voir l'horizon est l'intérêt : savoir qu'un convoi
 *  de plus arrive au niveau 18 aide à décider AUJOURD'HUI. */
const preview = computed(() =>
  selectedPlot.value?.building
    ? buildingPreview(selectedPlot.value.building.typeId, selectedPlot.value.building.level, 5)
    : [],
);
/** Le prochain palier quand il tombe HORS de l'aperçu — sinon on croit qu'il n'arrivera
 *  jamais. Masqué s'il est déjà listé. */
const milestone = computed(() => {
  const b = selectedPlot.value?.building;
  if (!b) return null;
  const m = nextMilestone(b.typeId, b.level);
  return m && !preview.value.some((r) => r.level === m.level) ? m : null;
});

const sheetOpen = computed({
  get: () => selectedSlot.value !== null,
  set: (v: boolean) => {
    if (!v) selectedSlot.value = null;
  },
});

// ── Libellés (tout dérivé de buildings.ts : aucune formule réécrite ici) ──
// ⚠️ La table d'emojis vivait EN DOUBLE ici et dans buildings.ts, et les deux avaient
// divergé (fragments : 🫧 contre 🧩). On lit la source unique.
const RES_EMOJI: Record<string, string> = RESOURCE_EMOJI;
function emojiOf(b: Building): string {
  return buildingType(b.typeId)?.emoji ?? '🏛️';
}
function labelOf(b: Building): string {
  return buildingType(b.typeId)?.label ?? 'Bâtiment';
}
function resEmoji(b: Building): string {
  return RES_EMOJI[buildingType(b.typeId)?.resource ?? 'dust'] ?? '✨';
}
function produces(b: Building): boolean {
  return !!buildingType(b.typeId)?.resource;
}
/** Libellé d'effet d'un utilitaire à un niveau donné. */
function utilityEffectLabel(b: Building): string {
  if (b.typeId === 'outpost')
    return `−${Math.round((1 - travelTimeMult([b])) * 100)}% temps de trajet`;
  if (b.typeId === 'labyrinth_gate')
    return `+${Math.round(labyrinthLuckBonus([b]) * 100)}% butin des coffres`;
  if (b.typeId === 'boss_altar')
    return `+${Math.round(bossAltarRollFloor([b]) * 100)}% jet · −${Math.round(bossSummonDiscount([b]) * 100)}% coût 🔮`;
  if (b.typeId === 'warehouse') return `+${Math.round((storageMult([b]) - 1) * 100)}% stockage`;
  return '';
}
/** Producteur pur → prod/h. Utilitaire → effet. Hybride → les deux. */
function effectAt(b: Building, level: number): string {
  const t = buildingType(b.typeId);
  if (!t) return '';
  const at: Building = { ...b, level };
  const prod = t.resource
    ? `${buildingProdPerHour(at).toFixed(1)} ${RES_EMOJI[t.resource] ?? '✨'}/h`
    : '';
  if (t.category === 'producer') return prod;
  const eff = utilityEffectLabel(at);
  return prod ? `${eff} · ${prod}` : eff;
}
function perLevelOf(b: Building): string {
  const t = buildingType(b.typeId);
  return t ? perLevelLabel(t) : '';
}
function effectNow(b: Building): string {
  return effectAt(b, b.level);
}
function effectNext(b: Building): string {
  if (!canUp(b)) return '';
  const next = effectAt(b, b.level + 1);
  return next && next !== effectNow(b) ? next : '';
}
function accrued(b: Building): number {
  return buildingAccrued(b, props.now, storageMult(buildings.value));
}
/** Accumulation EXACTE (non arrondie) : un filon lent afficherait « 0 » pendant des
 *  heures avec un `floor` — on voit qu'il tourne. */
function accruedExact(b: Building): number {
  const hours = Math.max(0, (props.now - b.collectedAt) / 3_600_000);
  return Math.min(
    buildingProdPerHour(b) * hours,
    buildingStorageCap(b, storageMult(buildings.value)),
  );
}
function storageOf(b: Building): number {
  return buildingStorageCap(b, storageMult(buildings.value));
}
function canUp(b: Building): boolean {
  return canUpgradeBuilding(b, heroLevel.value);
}
function upCost(b: Building): number {
  return buildingUpgradeCost(b.level);
}

const BUILD_GROUPS: { key: BuildingCategory; label: string; hint: string }[] = [
  { key: 'producer', label: '⛏️ Producteurs', hint: 'Ressource passive à récolter' },
  { key: 'utility', label: '🏛️ Utilitaires', hint: 'Effet global (débloque / accélère)' },
];
const buildGroups = computed(() =>
  BUILD_GROUPS.map((g) => ({
    ...g,
    types: BUILDING_TYPES.filter((t) => t.category === g.key),
  })).filter((g) => g.types.length),
);
function typeBuildable(t: BuildingType): boolean {
  return canBuildType(t.id, heroLevel.value, buildings.value);
}
function typeLockReason(t: BuildingType): string {
  if (heroLevel.value < buildingUnlockLevel(t.id)) return `🔒 niv ${buildingUnlockLevel(t.id)}`;
  if (t.unique && buildings.value.some((b) => b.typeId === t.id)) return 'déjà construit';
  return '';
}

const unlockInfo = ref<{ emoji: string; label: string; unlock: BuildingUnlock } | null>(null);
const unlockOpen = computed({
  get: () => !!unlockInfo.value,
  set: (v: boolean) => {
    if (!v) unlockInfo.value = null;
  },
});

function doBuild(slot: number, typeId: string) {
  const uid = auth.user?.id;
  const t = buildingType(typeId);
  if (!uid || !t) return;
  void char.buildFilon(uid, typeId, slot, Date.now(), heroLevel.value).then(() => {
    if (!buildings.value.some((b) => b.slot === slot)) return;
    selectedSlot.value = null; // ferme la feuille → l'éclat joue en plein écran
    gameFx.celebrate({
      kind: 'building',
      emoji: t.emoji,
      title: 'Bâtiment construit !',
      subtitle: t.label,
      rarity: 'legendary',
    });
    if (t.unlock) unlockInfo.value = { emoji: t.emoji, label: t.label, unlock: t.unlock };
  });
}
function doUpgrade(slot: number) {
  const uid = auth.user?.id;
  if (uid) void char.upgradeFilon(uid, slot, heroLevel.value);
}
function collectAll() {
  const uid = auth.user?.id;
  if (uid) void char.collectFilons(uid, Date.now());
}
</script>

<style scoped>
.vp-tile.locked {
  opacity: 0.45;
  cursor: default;
}
.vp-tile.ready {
  border-color: var(--accent, #ffd23f);
}

/* Feuille */
/* Aperçu des prochains niveaux : une ligne par palier, le niveau ACTUEL en repère. */
.pm-prev {
  margin: 10px 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}
.pm-prev-t {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.pm-prev-r {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 12.5px;
  color: var(--dim);
}
.pm-prev-r.now {
  color: var(--text);
  font-weight: 700;
}
/* Un PALIER (un convoi de plus, un aventurier de plus) se distingue d’une simple
   continuation : c’est lui qu’on vise. */
.pm-prev-r.step .pp-tx {
  color: var(--accent);
}
.pm-prev-r.far {
  margin-top: 4px;
  border-top: 1px dashed var(--line);
  padding-top: 6px;
}
.pp-lv {
  flex: 0 0 46px;
  font-variant-numeric: tabular-nums;
}
.pp-tx {
  flex: 1;
  min-width: 0;
}
.pp-tag {
  font-size: 10px;
  color: var(--accent);
}
.pm-btn.open {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--accent);
}
.vp-sheet {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 14px;
  color: var(--text);
}
.sh-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.sh-emo {
  font-size: 26px;
}
.sh-main {
  flex: 1;
  min-width: 0;
}
.sh-title {
  font-size: 16px;
}
.sh-sub {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
}
.sh-x {
  border: 0;
  background: none;
  color: var(--dim);
  font-size: 18px;
  width: 36px;
  height: 36px;
  cursor: pointer;
}
.pb,
.pm {
  margin-top: 10px;
}
.pb-group {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 10px 0 4px;
}
.pb-group-t {
  font-size: 13px;
  font-weight: 600;
}
.pb-group-h {
  font-size: 11px;
  color: var(--dim);
}
.pb-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.pb-opt:disabled {
  opacity: 0.45;
  cursor: default;
}
.pb-emo {
  font-size: 20px;
}
.pb-main {
  flex: 1;
  min-width: 0;
}
.pb-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.pb-perlv {
  font-size: 11.5px;
  color: var(--accent);
}
.pm-perlv {
  font-size: 12px;
  color: var(--dim);
}
.pb-desc {
  display: block;
  font-size: 11px;
  color: var(--dim);
  line-height: 1.35;
}
.pb-cost {
  font-size: 12px;
  white-space: nowrap;
}
.pm-level {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}
.pm-next {
  color: var(--dim);
  font-size: 12px;
}
.pm-ready {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
}
.pm-cap {
  color: var(--dim);
}
.pm-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.pm-btn {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.pm-btn.up {
  border-color: var(--accent, #ffd23f);
  color: var(--accent, #ffd23f);
}
.pm-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.unlock-card {
  background: var(--surface);
  color: var(--text);
  padding: 20px;
  text-align: center;
  border-radius: 16px;
}
.unlock-emo {
  font-size: 44px;
}
.unlock-title {
  font-size: 18px;
  margin-top: 6px;
}
.unlock-act {
  margin-top: 10px;
  font-size: 14px;
}
.unlock-where {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dim);
}
.unlock-ok {
  margin-top: 16px;
  min-height: 44px;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--accent, #ffd23f);
  background: none;
  color: var(--accent, #ffd23f);
  cursor: pointer;
}
</style>
