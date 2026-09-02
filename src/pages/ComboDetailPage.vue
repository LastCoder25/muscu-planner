<template>
  <q-page class="combo-detail">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Défi 360</div>
      <button class="iconbtn danger" aria-label="Supprimer" @click="confirmRemove">🗑</button>
    </header>

    <div v-if="!c" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <template v-else>
      <div class="head-card" :class="{ done: c.status === 'done' }">
        <div class="hc-top">
          <span class="hc-pct font-display">{{ pct }}%</span>
          <span class="hc-days">{{ daysLeftLabel }}</span>
        </div>
        <div class="hc-week">📅 Semaine du {{ comboWeek }}</div>
        <!-- Barre = dégradé unique (bulletproof, pas d'empilement) : vert (actuel) → rose
             (avancement THÉORIQUE = où l'on devrait en être) → piste. Le rose n'apparaît
             que si l'on est en retard (théorique > actuel). Trait 🎯 par-dessus. -->
        <div class="hc-bar" :style="barStyle">
          <i
            v-if="showOnTime"
            class="hc-ontime"
            :style="{ left: onTimePct + '%' }"
            :title="`Pour être dans les temps : ${onTimePct}%`"
          />
        </div>
        <div v-if="showOnTime" class="hc-pace" :class="onTimeState">
          🎯 Dans les temps : <b>{{ onTimePct }}%</b>
          <span class="hc-pace-tag">{{
            onTimeState === 'ahead' ? '✓ en avance' : `⏳ en retard (tu es à ${pct}%)`
          }}</span>
        </div>
        <div v-if="c.status === 'done'" class="hc-done">🎉 Défi 360 bouclé — bravo !</div>
        <div v-if="legsAtMax > 0" class="hc-over">
          🔥 {{ legsAtMax }} exo{{ legsAtMax > 1 ? 's' : '' }} au <b>maximal</b> !
          <span class="hc-over-sub">objectif ambition dépassé</span>
        </div>
      </div>

      <div v-if="c.status === 'active'" class="cta-row q-mb-md">
        <q-btn
          class="cta-grow"
          outline
          color="primary"
          no-caps
          icon="fitness_center"
          label="Générer une séance"
          :to="`/combo/${c.id}/session`"
        />
        <q-btn
          outline
          color="primary"
          no-caps
          icon="ios_share"
          label="Exporter"
          title="Exporter le Défi 360 complet détaillé"
          @click="exportCombo"
        />
      </div>

      <div
        v-for="leg in orderedLegs"
        :key="leg.exercise_id"
        class="leg"
        :class="{ ok: legComplete(leg) }"
      >
        <span
          v-if="noEquipIds.has(leg.exercise_id)"
          class="bw-ic"
          title="Poids du corps (aucun matériel)"
          >🤸</span
        >
        <div class="leg-top">
          <span class="leg-emo">{{ slotEmoji(leg.slot) }}</span>
          <div class="leg-main">
            <div class="leg-name">
              {{ leg.exercise_name }}
              <span v-if="leg.weight_kg" class="leg-kg">{{ leg.weight_kg }} kg</span>
            </div>
            <div class="leg-sub">
              {{ legDone(leg) }}/{{ leg.target }} {{ legUnitLabel(leg) }}
              <span v-if="legComplete(leg)" class="leg-ok">✓</span>
              <span v-if="legDone(leg) > leg.target" class="leg-extra"
                >+{{ legDone(leg) - leg.target }} en plus</span
              >
            </div>
          </div>
        </div>
        <!-- 3 paliers (secondaire / principal / maximal) : toujours un prochain jalon à viser.
             Le palier atteint s'allume ; le principal = ta cible (porte l'essentiel du bonus). -->
        <div class="leg-tiers">
          <span class="tier-pill" :class="{ on: tierRank(leg) >= 1 }">
            <span class="tp-lbl">Sec.</span> {{ tierMarks(leg).sec }}
          </span>
          <span class="tier-pill principal" :class="{ on: tierRank(leg) >= 2 }">
            <span class="tp-lbl">Principal</span> {{ leg.target }}
          </span>
          <span class="tier-pill max" :class="{ on: tierRank(leg) >= 3 }">
            <span class="tp-lbl">Max</span> {{ tierMarks(leg).max }}
          </span>
        </div>
        <!-- Mode séries : segments par série ; mode reps : barre de progression simple. -->
        <div v-if="legMode(leg) === 'sets'" class="seg-bar">
          <span
            v-for="n in Math.max(leg.target, legDone(leg))"
            :key="n"
            class="seg"
            :class="{ on: n <= legDone(leg), extra: n > leg.target }"
          >
            <template v-if="n <= legDone(leg)">{{ segSetLabel(legSets(leg)[n - 1]) }}</template>
          </span>
        </div>
        <div v-else class="reps-bar">
          <span
            class="reps-fill"
            :style="{ width: Math.min(100, (legDone(leg) / leg.target) * 100) + '%' }"
          />
        </div>
        <!-- Mode DURÉE (gainage) : chrono OU ajout manuel d'une durée (ticket 9ecad885). -->
        <div v-if="legMode(leg) === 'time'" class="leg-actions">
          <button
            class="chrono-cta"
            :class="{ running: isChronoOn(leg) }"
            @click="toggleChrono(leg)"
          >
            <q-icon :name="isChronoOn(leg) ? 'pause' : 'play_arrow'" size="18px" />
            {{ isChronoOn(leg) ? 'Pause' : 'Démarrer' }}
            <span class="cc-time">{{ chronoDisplay(leg) }}</span>
          </button>
          <button class="add corr" :disabled="!legSetsDone(leg)" @click="undoSet(leg)">↩</button>
        </div>
        <!-- Ajout manuel d'une durée sans chrono — caché pendant que ce chrono tourne. -->
        <div v-if="legMode(leg) === 'time' && !isChronoOn(leg)" class="dur-adds">
          <span class="da-lbl">Ajouter :</span>
          <button v-for="s in DUR_QUICK_ADDS" :key="s" class="da-btn" @click="doAddSeconds(leg, s)">
            +{{ fmtDurShort(s) }}
          </button>
        </div>
        <div v-else-if="legMode(leg) !== 'time'" class="leg-actions">
          <button class="add" @click="openSet(leg, 1)">＋ 1 série</button>
          <button class="add corr" :disabled="!legSetsDone(leg)" @click="undoSet(leg)">↩</button>
        </div>
        <!-- Détail des séries faites (secondes en durée / reps en mode reps). En mode
             séries, le détail est DANS les cellules jaunes → on ne le répète pas ici. -->
        <div v-if="legSets(leg).length && legMode(leg) !== 'sets'" class="leg-sets">
          <span v-for="(s, i) in legSets(leg)" :key="i" class="leg-set-chip">
            <template v-if="legMode(leg) === 'time'">{{ s.reps }} s</template>
            <template v-else
              >{{ s.reps }}<template v-if="s.weight">×{{ s.weight }} kg</template
              ><template v-if="s.assisted"> ·a</template></template
            >
          </span>
        </div>
      </div>

      <div class="foot">
        Fais tes séries quand tu veux dans la semaine. Toutes les séries prévues pour
        <b>tous</b> les exos = Défi 360 bouclé. Chaque série alimente ta piste Muscu (reps + poids).
      </div>

      <button v-if="c.status !== 'abandoned'" class="abandon" @click="abandon">Abandonner</button>
    </template>

    <!-- Saisie d'une série (reps + poids + assisté), dialogue partagé -->
    <SetLogDialog
      v-model="setOpen"
      :title="setLeg?.exercise_name ?? ''"
      :desc="`${setCount > 1 ? setCount + ' séries' : '1 série'} · reps & poids`"
      :assistable="setLeg?.assistable"
      :initial-reps="setInitReps"
      :initial-weight="setInitWeight"
      :initial-assisted="setInitAssisted"
      @save="onSetSave"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useComboStore } from '@/stores/combo';
import { useGameFx } from '@/composables/useGameFx';
import {
  comboProgressPct,
  legTier,
  COMBO_TIER_SECONDARY,
  COMBO_TIER_MAX,
  legSetsDone,
  legDone,
  legComplete,
  legMode,
  legSets,
  legUnitLabel,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  comboExportText,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';
import { comboSlot } from '@/data/combo';
import {
  logicalToday,
  addDaysIso,
  suggestSetFromHistory,
  isNoEquipmentExercise,
} from '@/lib/challenges';
import SetLogDialog from '@/components/SetLogDialog.vue';
import { recallWeight, rememberWeight } from '@/lib/weightMemory';
import { useLibraryStore } from '@/stores/library';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const combo = useComboStore();
const library = useLibraryStore();
const gameFx = useGameFx();

const id = String(route.params.id);
const c = computed(() => combo.list.find((x) => x.id === id) ?? null);
const pct = computed(() => (c.value ? comboProgressPct(c.value) : 0));
// Paliers (secondaire / principal / maximal) par exo — repères + motivation.
const TIER_RANK: Record<string, number> = { none: 0, secondary: 1, principal: 2, max: 3 };
function tierRank(l: ComboLeg): number {
  return TIER_RANK[legTier(l)] ?? 0;
}
function tierMarks(l: ComboLeg): { sec: number; max: number } {
  return {
    sec: Math.max(1, Math.round(l.target * COMBO_TIER_SECONDARY)),
    max: Math.round(l.target * COMBO_TIER_MAX),
  };
}
const legsAtMax = computed(() => c.value?.legs.filter((l) => legTier(l) === 'max').length ?? 0);
// Ordre d'affichage : les plus PROCHES de la complétude en haut, les autres par
// avancement décroissant, les TERMINÉS relégués en bas.
const orderedLegs = computed(() => {
  const legs = c.value?.legs ?? [];
  const frac = (l: ComboLeg) => (l.target > 0 ? legDone(l) / l.target : 0);
  return [...legs].sort((a, b) => {
    const ca = legComplete(a) ? 1 : 0;
    const cb = legComplete(b) ? 1 : 0;
    if (ca !== cb) return ca - cb; // non terminés d'abord, terminés en bas
    return frac(b) - frac(a); // le plus proche de la complétude en haut
  });
});

function fmtDM(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}
// Semaine concernée (début → fin) du Défi 360.
const comboWeek = computed(() => {
  if (!c.value) return '';
  return `${fmtDM(c.value.start_date)} → ${fmtDM(addDaysIso(c.value.start_date, c.value.duration_days - 1))}`;
});

const daysLeftLabel = computed(() => {
  if (!c.value) return '';
  const end = addDaysIso(c.value.start_date, c.value.duration_days - 1);
  const today = logicalToday();
  if (today > end) return 'semaine terminée';
  // jours restants inclus aujourd'hui
  let n = 0;
  for (let d = 0; d < c.value.duration_days; d++) {
    if (addDaysIso(c.value.start_date, d) >= today) n++;
  }
  return `${n} j restant${n > 1 ? 's' : ''}`;
});

// % THÉORIQUE « dans les temps » : à un rythme régulier, la part que tu devrais avoir faite
// pour finir pile le dernier jour = jours écoulés (aujourd'hui inclus) / durée. Marqueur 🎯
// sur la barre → tu vois d'un coup d'œil si tu es en avance (barre au-delà) ou en retard.
const onTimePct = computed(() => {
  if (!c.value) return 0;
  const today = logicalToday();
  if (today < c.value.start_date) return 0;
  // Jours écoulés (aujourd'hui inclus). On parse les 2 dates en UTC explicite pour éviter
  // l'écart local/UTC (addDaysIso passe par toISOString → décalait d'un jour en France).
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.value.start_date}T00:00:00Z`);
  const elapsed = Math.round(ms / 86400000) + 1;
  const e = Math.max(0, Math.min(c.value.duration_days, elapsed));
  return Math.round((e / c.value.duration_days) * 100);
});
// Marqueur affiché tant que le défi est actif et dans la fenêtre (sinon 100 % = redondant).
const showOnTime = computed(
  () => !!c.value && c.value.status === 'active' && onTimePct.value > 0 && onTimePct.value < 100,
);
const onTimeState = computed(() => (pct.value >= onTimePct.value ? 'ahead' : 'behind'));

// Fond de la barre = un seul dégradé (aucun empilement / z-index) : vert (actuel) →
// rose (théorique, si en retard) → piste. Bulletproof côté rendu.
const barStyle = computed(() => {
  const p = Math.max(0, Math.min(100, pct.value));
  const ot = onTimePct.value;
  const stops =
    showOnTime.value && ot > p
      ? `var(--accent) 0 ${p}%, #ff6a9c ${p}% ${ot}%, var(--surface-2) ${ot}% 100%`
      : `var(--accent) 0 ${p}%, var(--surface-2) ${p}% 100%`;
  return { background: `linear-gradient(to right, ${stops})` };
});

function slotEmoji(key: string) {
  return comboSlot(key)?.emoji ?? '💪';
}
// Détail d'une série affiché DANS sa cellule jaune : « 12×15kg » (ou « 12 » au poids
// du corps, « 12·a » si assisté). Vide si la série n'existe pas (cellule à faire).
function segSetLabel(s: ComboSet | undefined): string {
  if (!s) return '';
  const base = s.weight ? `${s.reps}×${s.weight}kg` : `${s.reps}`;
  return s.assisted ? `${base}·a` : base;
}

// Saisie d'une série via le dialogue partagé, préremplie avec la dernière série.
const setOpen = ref(false);
const setLeg = ref<ComboLeg | null>(null);
const setCount = ref(1);
const setInitReps = ref(10);
const setInitWeight = ref<number | null>(null);
const setInitAssisted = ref(false);
function openSet(leg: ComboLeg, count: number) {
  setLeg.value = leg;
  setCount.value = count;
  const last = legSets(leg);
  if (last.length) {
    setInitReps.value = legLastReps(leg);
    setInitWeight.value = legLastWeight(leg) ?? recallWeight(leg.exercise_id);
    setInitAssisted.value = legLastAssisted(leg);
  } else {
    // Aucune série encore sur cet exo dans ce 360 → poids mémorisé pour cet exo (toutes
    // activités, ticket efa49f4f), sinon conseil dérivé de l'historique (ticket 5f5bad0f).
    const hist = combo.list
      .flatMap((cc) => cc.legs)
      .filter((l) => l.exercise_id === leg.exercise_id)
      .flatMap((l) => legSets(l));
    const sug = suggestSetFromHistory(hist);
    setInitReps.value = sug?.repMax ?? legLastReps(leg);
    setInitWeight.value = recallWeight(leg.exercise_id) ?? sug?.weight ?? legLastWeight(leg);
    setInitAssisted.value = false;
  }
  setOpen.value = true;
}
function onSetSave(v: { reps: number; weight: number | null; assisted: boolean }) {
  const leg = setLeg.value;
  if (!auth.user?.id || !c.value || !leg) return;
  rememberWeight(leg.exercise_id, v.weight); // mémorise le poids pour cet exo (ticket efa49f4f)
  const before = c.value.status;
  for (let i = 0; i < setCount.value; i++) {
    combo.addSet(id, leg.exercise_id, logicalToday(), v.reps, v.weight, v.assisted);
  }
  if (before !== 'done' && c.value.status === 'done') {
    gameFx.celebrate({
      kind: 'generic',
      emoji: '🎯',
      title: 'Défi 360 bouclé !',
      subtitle: 'Full-body complété — bravo 💪',
      rarity: 'divin',
    });
  }
}
// Ajouts rapides de durée (gainage) sans chrono (ticket 9ecad885).
const DUR_QUICK_ADDS = [15, 30, 60] as const;
function fmtDurShort(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`;
}
// Mode DURÉE (gainage) : ajoute directement une « série » de N secondes (stockées dans
// le champ reps ; pas de poids) → pas de dialogue reps+poids inadapté au gainage.
function doAddSeconds(leg: ComboLeg, sec: number) {
  if (!auth.user?.id || !c.value) return;
  const before = c.value.status;
  combo.addSet(id, leg.exercise_id, logicalToday(), sec, null, false);
  if (before !== 'done' && c.value.status === 'done') {
    gameFx.celebrate({
      kind: 'generic',
      emoji: '🎯',
      title: 'Défi 360 bouclé !',
      subtitle: 'Full-body complété — bravo 💪',
      rarity: 'divin',
    });
  }
}
function undoSet(leg: ComboLeg) {
  // Confirmation avant de retirer (évite les retraits par fausse manipulation).
  $q.dialog({
    title: 'Retirer la dernière série ?',
    message: `Retirer la dernière série de « ${leg.exercise_name} » ?`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Retirer', color: 'negative' },
  }).onOk(() => combo.removeLastSet(id, leg.exercise_id));
}

// Exporte : partage natif (mobile) si dispo, sinon copie dans le presse-papier.
// Le texte détaillé est construit par la lib partagée (même rendu sur les 2 écrans).
async function exportCombo() {
  if (!c.value) return;
  const text = comboExportText(c.value, logicalToday());
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Défi 360', text });
    } catch {
      /* partage annulé */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    $q.notify({ type: 'positive', message: 'Défi 360 copié dans le presse-papier.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Copie impossible sur cet appareil.' });
  }
}

// ── Chrono des exos de DURÉE (gainage) — comme dans les challenges ──
// Démarrer → décompte (mm:ss) ; Pause → enregistre une SÉRIE de N secondes et remet à 0.
// Un seul chrono actif à la fois (démarrer un autre exo enregistre d'abord le décompte courant).
const chronoLegKey = ref<string | null>(null);
const chronoSec = ref(0);
const chronoRunning = ref(false);
let chronoTick: ReturnType<typeof setInterval> | undefined;
function isChronoOn(leg: ComboLeg): boolean {
  return chronoRunning.value && chronoLegKey.value === leg.exercise_id;
}
function chronoDisplay(leg: ComboLeg): string {
  const s = chronoLegKey.value === leg.exercise_id ? chronoSec.value : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function logChrono(legKey: string) {
  clearInterval(chronoTick);
  chronoTick = undefined;
  chronoRunning.value = false;
  const leg = c.value?.legs.find((l) => l.exercise_id === legKey);
  if (leg && chronoSec.value > 0) doAddSeconds(leg, chronoSec.value);
  chronoSec.value = 0;
  chronoLegKey.value = null;
}
function toggleChrono(leg: ComboLeg) {
  if (isChronoOn(leg)) {
    logChrono(leg.exercise_id); // Pause → enregistre la série
    return;
  }
  // Démarrer : enregistre d'abord un décompte laissé en cours sur un AUTRE exo.
  if (chronoLegKey.value && chronoLegKey.value !== leg.exercise_id) logChrono(chronoLegKey.value);
  chronoLegKey.value = leg.exercise_id;
  chronoSec.value = 0;
  chronoRunning.value = true;
  chronoTick = setInterval(() => (chronoSec.value += 1), 1000);
}
onBeforeUnmount(() => {
  if (chronoLegKey.value) logChrono(chronoLegKey.value);
  else clearInterval(chronoTick);
});
function abandon() {
  $q.dialog({
    title: 'Abandonner le Défi 360 ?',
    message: 'Il passera en abandonné. Tu pourras en relancer un.',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    void combo.setStatus(id, 'abandoned').then(() => router.back());
  });
}
function confirmRemove() {
  // Des séries déjà faites comptent pour l'XP/l'énergie → on marque « abandonné »
  // (conservé) au lieu de supprimer. Suppression sèche réservée aux 360 vierges.
  const hasDone = (c.value?.legs ?? []).some((l) => legSetsDone(l) > 0);
  $q.dialog({
    title: hasDone ? 'Abandonner ce Défi 360 ?' : 'Supprimer ce Défi 360 ?',
    message: hasDone
      ? 'Tu as déjà fait des séries : il passe en « abandonné » (ton effort et ton XP restent comptés).'
      : 'Aucune série faite : suppression définitive.',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: hasDone ? 'Abandonner' : 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void (hasDone ? combo.setStatus(id, 'abandoned') : combo.remove(id)).then(() => router.back());
  });
}

// Exos SANS AUCUN matériel (poids du corps pur : pompes, gainage…) → liseré distinct.
const noEquipIds = ref<Set<string>>(new Set());
async function loadEquip() {
  const ids = [...new Set((c.value?.legs ?? []).map((l) => l.exercise_id))];
  if (!ids.length) return;
  const rows = await library.fetchByIds(ids).catch(() => []);
  noEquipIds.value = new Set(
    rows.filter((r) => isNoEquipmentExercise(r.equipment_required, r.tags)).map((r) => r.id),
  );
}
onMounted(async () => {
  if (!combo.loaded) await combo.fetchMine().catch(() => undefined);
  await loadEquip();
});
</script>

<style scoped lang="scss">
.combo-detail {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 40px;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}
.iconbtn {
  background: none;
  border: none;
  color: var(--text);
  font-size: 26px;
  cursor: pointer;
  width: 32px;
}
.iconbtn.danger {
  font-size: 18px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.head-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
}
.head-card.done {
  border-color: var(--accent);
}
.hc-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.hc-pct {
  font-size: 30px;
  font-weight: 800;
  color: var(--accent);
}
.hc-days {
  font-size: 12.5px;
  color: var(--dim);
}
.hc-week {
  font-size: 12.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  margin: 2px 0 8px;
}
.hc-bar {
  position: relative;
  height: 10px;
  background: var(--surface-2);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
}
/* Graduation tous les 5 % (segmente la barre pour lire la position d'un coup d'œil). */
.hc-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(5% - 1.5px),
    rgba(0, 0, 0, 0.32) calc(5% - 1.5px),
    rgba(0, 0, 0, 0.32) 5%
  );
}
/* Repère « dans les temps » : trait vertical à la position théorique attendue. */
.hc-ontime {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 2;
}
.hc-pace {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dim);
}
.hc-pace b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.hc-pace-tag {
  margin-left: 6px;
  font-weight: 700;
}
.hc-pace.ahead .hc-pace-tag {
  color: var(--d1);
}
.hc-pace.behind .hc-pace-tag {
  color: var(--d3);
}
.hc-done {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}
.hc-over {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--d1);
}
.hc-over-sub {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--dim);
  margin-top: 1px;
}
/* Ligne d'actions : « Générer une séance » (extensible) + « Exporter ». */
.cta-row {
  display: flex;
  gap: 8px;
}
.cta-grow {
  flex: 1;
  min-width: 0;
}
.leg {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
}
.leg.ok {
  border-color: var(--d1);
}
/* Icône « poids du corps » (aucun matériel) — pastille ronde cyan, coin haut-droit. */
.bw-ic {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  border-radius: 50%;
  background: rgba(95, 208, 224, 0.15);
  border: 1px solid #5fd0e0;
  z-index: 1;
}
.leg-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.leg-emo {
  font-size: 22px;
}
.leg-main {
  flex: 1;
  min-width: 0;
}
.leg-name {
  font-weight: 600;
  font-size: 14.5px;
  color: var(--text);
}
.leg-kg {
  font-size: 11px;
  color: var(--dim);
  margin-left: 4px;
}
.leg-sub {
  font-size: 12px;
  color: var(--dim);
}
.leg-ok {
  color: var(--d1);
}
/* 3 paliers (secondaire / principal / maximal) — repères toujours visibles, allumés
   quand atteints. Le principal est mis en avant (c'est la cible). */
.leg-tiers {
  display: flex;
  gap: 6px;
  margin: 8px 0 4px;
}
.tier-pill {
  flex: 1;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  padding: 3px 4px;
  white-space: nowrap;
}
.tier-pill .tp-lbl {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  opacity: 0.8;
}
.tier-pill.principal {
  font-weight: 700;
}
.tier-pill.on {
  color: var(--accent-ink);
  background: var(--accent);
  border-color: var(--accent);
}
.tier-pill.max.on {
  background: var(--d3, #ffb23f);
  border-color: var(--d3, #ffb23f);
}
.bar {
  height: 8px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
  margin: 9px 0;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
/* Grille de cellules UNIFORMES (mêmes dimensions pour faites/à faire) qui se
   répartissent proprement sur plusieurs lignes ; chaque colonne accueille « 12×15kg ». */
.seg-bar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 4px;
  margin: 9px 0;
}
/* Mode reps : barre de progression continue (l'objectif en reps peut être élevé). */
.reps-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
  margin: 9px 0;
}
.reps-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}
/* Cellules « série » : chaque cellule faite (jaune) affiche son détail « 12×15kg ».
   Elles s'élargissent selon le contenu et passent à la ligne ; les cases à faire
   restent des repères vides. */
.seg {
  min-height: 24px;
  padding: 3px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
}
.seg.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}
/* Série faite AU-DELÀ de l'objectif → couleur distincte (vert « en plus »). */
.seg.extra.on {
  background: var(--d1);
  border-color: var(--d1);
  color: #10231a;
}
.leg-extra {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--d1);
}
.leg-actions {
  display: flex;
  gap: 6px;
}
/* Ajout manuel de durée (gainage) sans chrono — pastilles compactes. */
.dur-adds {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.da-lbl {
  font-size: 11px;
  color: var(--dim);
}
.da-btn {
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.da-btn:active {
  background: var(--accent);
  color: var(--accent-ink);
}
/* Chrono des exos de durée (gainage) — cohérent avec le chrono des challenges. */
.chrono-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 6px;
  padding: 11px 0;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
}
.chrono-cta.running {
  background: var(--accent);
  color: var(--bg);
}
.chrono-cta .cc-time {
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
  opacity: 0.9;
}
/* Détail des séries faites : petites puces reps×poids sous les boutons. */
.leg-sets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.leg-set-chip {
  font-size: 11px;
  color: var(--dim);
  background: var(--surface-2);
  border-radius: 6px;
  padding: 1px 6px;
  font-variant-numeric: tabular-nums;
}
.add {
  flex: 1;
  padding: 9px 0;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.add.neg {
  border-color: var(--d4);
  color: var(--d4);
}
.add.corr {
  flex: none;
  width: 48px;
  border-color: var(--d4);
  color: var(--d4);
  font-size: 16px;
}
.add.corr:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.add.chal {
  flex: 1 1 100%;
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.foot {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.5;
  margin: 14px 0;
}
.abandon {
  width: 100%;
  padding: 10px;
  background: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--dim);
  cursor: pointer;
}
</style>
