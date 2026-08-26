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
        <div class="hc-bar">
          <span :style="{ width: pct + '%' }" />
          <!-- Repère 🎯 : où tu devrais être pour finir dans les temps (rythme régulier). -->
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
        <div v-if="over.bonusXp > 0" class="hc-over">
          🔥 Dépassement : +{{ over.bonusXp }} XP
          <span class="hc-over-sub"
            >{{ over.legsOver }}/{{ over.totalLegs }} exos au-delà de l'objectif</span
          >
        </div>
      </div>

      <q-btn
        v-if="c.status === 'active'"
        class="full-width q-mb-md"
        outline
        color="primary"
        no-caps
        icon="fitness_center"
        label="Générer une séance"
        :to="`/combo/${c.id}/session`"
      />

      <div
        v-for="leg in c.legs"
        :key="leg.exercise_id"
        class="leg"
        :class="{ ok: legComplete(leg) }"
      >
        <div class="leg-top">
          <span class="leg-emo">{{ slotEmoji(leg.slot) }}</span>
          <div class="leg-main">
            <div class="leg-name">
              {{ leg.exercise_name }}
              <span v-if="noEquipIds.has(leg.exercise_id)" class="leg-bw-badge"
                >🤸 Poids du corps</span
              >
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
        <!-- Mode séries : segments par série ; mode reps : barre de progression simple. -->
        <div v-if="legMode(leg) === 'sets'" class="seg-bar" :style="{ '--cols': leg.target }">
          <span
            v-for="n in Math.max(leg.target, legDone(leg))"
            :key="n"
            class="seg"
            :class="{ on: n <= legDone(leg), extra: n > leg.target }"
          />
        </div>
        <div v-else class="reps-bar">
          <span
            class="reps-fill"
            :style="{ width: Math.min(100, (legDone(leg) / leg.target) * 100) + '%' }"
          />
        </div>
        <!-- Mode DURÉE (gainage) : UNIQUEMENT le chrono (comme les challenges). Démarrer →
             décompte ; Pause → enregistre une série de la durée RÉELLE écoulée. -->
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
        <div v-else class="leg-actions">
          <button class="add" @click="openSet(leg, 1)">＋ 1 série</button>
          <button class="add corr" :disabled="!legSetsDone(leg)" @click="undoSet(leg)">↩</button>
        </div>
        <!-- Détail des séries faites (reps × poids, ou secondes en mode durée). -->
        <div v-if="legSets(leg).length" class="leg-sets">
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
  comboOverachievement,
  legSetsDone,
  legDone,
  legComplete,
  legMode,
  legSets,
  legUnitLabel,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  type ComboLeg,
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
const over = computed(() =>
  c.value ? comboOverachievement(c.value) : { bonusXp: 0, legsOver: 0, totalLegs: 0 },
);

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
  let elapsed = 0;
  for (let d = 0; d < c.value.duration_days; d++) {
    if (addDaysIso(c.value.start_date, d) <= today) elapsed++;
  }
  return Math.min(100, Math.round((elapsed / c.value.duration_days) * 100));
});
// Marqueur affiché tant que le défi est actif et dans la fenêtre (sinon 100 % = redondant).
const showOnTime = computed(
  () => !!c.value && c.value.status === 'active' && onTimePct.value > 0 && onTimePct.value < 100,
);
const onTimeState = computed(() => (pct.value >= onTimePct.value ? 'ahead' : 'behind'));

function slotEmoji(key: string) {
  return comboSlot(key)?.emoji ?? '💪';
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
  combo.removeLastSet(id, leg.exercise_id);
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
.hc-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
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
.leg {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
}
.leg.ok {
  border-color: var(--d1);
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
/* Badge « poids du corps » (aucun matériel) — cyan, lisible, distinct du vert « atteint ». */
.leg-bw-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #5fd0e0;
  border: 1px solid #5fd0e0;
  border-radius: 999px;
  padding: 0 7px;
  margin-left: 6px;
  vertical-align: middle;
  white-space: nowrap;
}
.leg-sub {
  font-size: 12px;
  color: var(--dim);
}
.leg-ok {
  color: var(--d1);
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
.seg-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
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
/* Segments de TAILLE FIXE : `--cols` (l'objectif) par ligne ; les séries en plus
   ajoutent des lignes de même taille (ex. 22 pour un objectif de 9 → 3 lignes de 9). */
.seg {
  flex: 0 0 calc((100% - (var(--cols, 10) - 1) * 3px) / var(--cols, 10));
  height: 8px;
  border-radius: 3px;
  background: var(--surface-2);
}
.seg.on {
  background: var(--accent);
}
/* Série faite AU-DELÀ de l'objectif → couleur distincte (vert « en plus »). */
.seg.extra.on {
  background: var(--d1);
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
  border-color: var(--line);
  color: var(--dim);
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
