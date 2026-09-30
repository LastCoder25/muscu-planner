<template>
  <!-- ⇄ Changer d'exo en cours de Défi 360. Deux destinations, un seul geste : un exo déjà
       dans le défi (même groupe), ou un exo neuf du même groupe. L'exo quitté disparaît ;
       son objectif et ses séries déjà faites passent sur la cible (cf. transferComboLeg). -->
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card v-if="leg && c" class="sw-card">
      <div class="sw-head">
        <div class="sw-title">⇄ Changer « {{ leg.exercise_name }} »</div>
        <q-btn flat round dense icon="close" aria-label="Fermer" @click="close" />
      </div>
      <!-- 🔁 Correction des séries basculées : chacune prend des valeurs de l'exo cible
           (dernière série, sinon milieu de sa fourchette), corrigeables une par une. -->
      <template v-if="pending && plan">
        <p class="sw-note">
          Vers <b>{{ pending.name }}</b
          >. Chaque série prend des valeurs de cet exo : corrige-les si besoin. Ton XP reste celle
          de ce que tu as vraiment fait.
        </p>
        <div v-if="plan.sets.length > 1" class="sw-row sw-all">
          <div class="sw-row-from">Toutes les séries</div>
          <div class="sw-row-ctl">
            <div class="sw-step">
              <q-btn
                flat
                round
                dense
                icon="remove"
                aria-label="Moins"
                @click="stepAll('reps', -1)"
              />
              <span class="sw-val">{{ unitShort }}</span>
              <q-btn flat round dense icon="add" aria-label="Plus" @click="stepAll('reps', 1)" />
            </div>
            <div v-if="!isTime" class="sw-step">
              <q-btn
                flat
                round
                dense
                icon="remove"
                aria-label="Moins lourd"
                @click="stepAll('weight', -1)"
              />
              <span class="sw-val">kg</span>
              <q-btn
                flat
                round
                dense
                icon="add"
                aria-label="Plus lourd"
                @click="stepAll('weight', 1)"
              />
            </div>
          </div>
        </div>
        <div v-for="(p, i) in plan.sets" :key="i" class="sw-row">
          <div class="sw-row-from">
            <span class="sw-row-n">{{ i + 1 }}</span>
            {{ fromLabel(i) }}
          </div>
          <div class="sw-row-ctl">
            <div class="sw-step">
              <q-btn flat round dense icon="remove" aria-label="Moins" @click="stepReps(p, -1)" />
              <span class="sw-val"
                ><b>{{ p.reps }}</b
                ><small>{{ unitShort }}</small></span
              >
              <q-btn flat round dense icon="add" aria-label="Plus" @click="stepReps(p, 1)" />
            </div>
            <div v-if="!isTime" class="sw-step">
              <q-btn
                flat
                round
                dense
                icon="remove"
                aria-label="Moins lourd"
                @click="stepWeight(p, -1)"
              />
              <span class="sw-val"
                ><b>{{ p.weight ? fmtKg(p.weight) : '—' }}</b
                ><small>kg</small></span
              >
              <q-btn
                flat
                round
                dense
                icon="add"
                aria-label="Plus lourd"
                @click="stepWeight(p, 1)"
              />
            </div>
            <button
              v-if="destAssistable"
              type="button"
              class="sw-asst"
              :class="{ on: p.assisted }"
              :aria-pressed="!!p.assisted"
              @click="p.assisted = !p.assisted"
            >
              assisté
            </button>
          </div>
        </div>
        <div v-if="!isSets" class="sw-row sw-target">
          <div class="sw-row-from">
            Objectif de {{ leg.target }} {{ unitWord }} de {{ leg.exercise_name }} → à ajouter sur
            {{ pending.name }}
          </div>
          <div class="sw-row-ctl">
            <div class="sw-step">
              <q-btn flat round dense icon="remove" aria-label="Moins" @click="stepTarget(-1)" />
              <span class="sw-val"
                ><b>{{ plan.target }}</b
                ><small>{{ unitShort }}</small></span
              >
              <q-btn flat round dense icon="add" aria-label="Plus" @click="stepTarget(1)" />
            </div>
          </div>
        </div>
        <p v-if="pending.warn" class="sw-note sw-warn">{{ pending.warn }}</p>
        <p class="sw-note">
          {{ leg.exercise_name }} quitte le défi. On ne peut pas revenir en arrière.
        </p>
        <div class="sw-actions">
          <q-btn flat no-caps label="‹ Retour" :disabled="busy" @click="cancelPending" />
          <q-btn
            unelevated
            no-caps
            color="primary"
            text-color="dark"
            label="Changer"
            :loading="busy"
            @click="confirmPending"
          />
        </div>
      </template>
      <template v-else>
        <p class="sw-note">
          <template v-if="doneCount">
            Tes {{ doneCount }} {{ unitWord }} déjà faites et ton objectif de {{ leg.target }}
            passent sur l'exo choisi. Elles gardent la valeur de l'exo sur lequel tu les as faites.
          </template>
          <template v-else>
            Ton objectif de {{ leg.target }} {{ unitWord }} passe sur l'exo choisi.
          </template>
        </p>

        <div v-if="inCombo.length" class="sw-grp">Déjà dans ton défi</div>
        <div v-if="inCombo.length" class="sw-grid">
          <button
            v-for="l in inCombo"
            :key="l.exercise_id"
            type="button"
            class="sw-tile"
            :disabled="busy"
            @click="pick({ leg: l.exercise_id }, l.exercise_name)"
          >
            <div class="sw-media">
              <ExerciseAnim
                v-if="hasAnim(l.exercise_id)"
                :exercise-id="l.exercise_id"
                :size="72"
                :title="l.exercise_name"
              />
              <img
                v-else-if="exImg(l.exercise_id)"
                :src="exImg(l.exercise_id)"
                :alt="l.exercise_name"
                loading="lazy"
              />
              <q-icon v-else name="fitness_center" size="24px" />
            </div>
            <div class="sw-name">{{ l.exercise_name }}</div>
            <div v-if="groupOf(l.slot)" class="sw-grp-tag">{{ groupOf(l.slot) }}</div>
            <div class="sw-sub">
              {{ legDone(l) }}/{{ l.target }} → {{ legDone(l) + doneCount }}/{{
                l.target + leg.target
              }}
            </div>
          </button>
        </div>

        <div class="sw-grp">
          {{ inCombo.length ? 'Ou un autre exo du groupe' : 'Un autre exo du groupe' }}
        </div>
        <div v-if="loading" class="sw-empty">Chargement…</div>
        <div v-else-if="!fresh.length" class="sw-empty">
          Aucun autre exo de ce groupe n'est disponible (déjà pris par un défi, ou compté
          autrement).
        </div>
        <div v-else class="sw-grid">
          <button
            v-for="e in fresh"
            :key="e.id"
            type="button"
            class="sw-tile"
            :disabled="busy"
            @click="pick({ exercise: newExercise(e) }, e.name)"
          >
            <div class="sw-media">
              <ExerciseAnim v-if="hasAnim(e.id)" :exercise-id="e.id" :size="72" :title="e.name" />
              <img v-else-if="exImg(e.id)" :src="exImg(e.id)" :alt="e.name" loading="lazy" />
              <q-icon v-else name="fitness_center" size="24px" />
              <span
                v-if="isNoEquipmentExercise(e.equipment_required, e.tags)"
                class="sw-bw"
                title="Poids du corps (aucun matériel)"
                >🤸</span
              >
            </div>
            <div class="sw-name">{{ e.name }}</div>
            <div v-if="groupOf(slotOf(e))" class="sw-grp-tag">{{ groupOf(slotOf(e)) }}</div>
          </button>
        </div>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import ExerciseAnim from './ExerciseAnim.vue';
import { exerciseImage, exerciseFrames } from '@/data/exerciseImages';
import { comboSlot } from '@/data/combo';
import { variantFamilyKey } from '@/data/combo';
import {
  comboTransferBlocker,
  comboTransferPlan,
  legDone,
  legSets,
  legMode,
  COMBO_TRANSFER_BLOCK_LABEL,
  transferSlotFor,
  type ComboChallenge,
  type ComboLeg,
  type ComboNewExercise,
  type ComboSetWork,
  type ComboTransferPlan,
  type ComboTransferTarget,
} from '@/lib/combo';
import { repRangeForExercise, DEFAULT_OBJECTIVE } from '@/lib/repScheme';
import {
  repWeightFromExercise,
  isBodyweightExercise,
  isNoEquipmentExercise,
} from '@/lib/challenges';
import { isTennisExercise } from '@/lib/tennisTraining';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import { useProfileStore } from '@/stores/profile';

const props = defineProps<{
  modelValue: boolean;
  /** Id du Défi 360 : on relit la version du store, toujours à jour. */
  comboId: string | null;
  /** Exo à quitter (son id). */
  exerciseId: string | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; done: [name: string] }>();

const $q = useQuasar();
const library = useLibraryStore();
const challenges = useChallengesStore();
const combo = useComboStore();
const profile = useProfileStore();

const c = computed<ComboChallenge | null>(
  () => combo.list.find((x) => x.id === props.comboId) ?? null,
);
const leg = computed<ComboLeg | null>(
  () => c.value?.legs.find((l) => l.exercise_id === props.exerciseId) ?? null,
);
const doneCount = computed(() => (leg.value ? legDone(leg.value) : 0));
const unitWord = computed(() => {
  const m = leg.value ? legMode(leg.value) : 'sets';
  return m === 'sets' ? 'séries' : m === 'time' ? 'secondes' : 'reps';
});

const lib = ref<ExerciseRow[]>([]);
const loading = ref(false);
const busy = ref(false);
watch(
  () => props.modelValue,
  async (open) => {
    if (!open || lib.value.length) return;
    loading.value = true;
    try {
      if (challenges.list.length === 0) await challenges.fetchMine();
      lib.value = await library.fetchAll();
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

/** Un exo neuf : construit comme l'assistant de création le pose sur un exo. */
function newExercise(e: ExerciseRow): ComboNewExercise {
  const time = e.unit === 'time';
  const range = repRangeForExercise(profile.profile?.objective ?? DEFAULT_OBJECTIVE, {
    time,
    muscle_primary: e.muscle_primary,
    id: e.id,
  });
  return {
    exercise_id: e.id,
    exercise_name: e.name,
    muscle_primary: e.muscle_primary,
    rep_weight: repWeightFromExercise(e.muscle_secondary, e.equipment_required, e.name),
    time,
    assistable: !time && isBodyweightExercise(e.equipment_required, e.name),
    rep_min: range.min,
    rep_max: range.max,
  };
}

/** Les autres exos du défi vers lesquels on peut basculer (même groupe, même comptage). */
const inCombo = computed(() => {
  const cc = c.value;
  const l = leg.value;
  if (!cc || !l) return [];
  return cc.legs.filter(
    (x) => x !== l && comboTransferBlocker(cc, l.exercise_id, { leg: x.exercise_id }) === null,
  );
});

/** Exos neufs du groupe : même règle que l'assistant de création (muscle de l'emplacement,
 *  pas de tennis, pas un exo déjà pris par un challenge muscu actif), puis le blocage de la
 *  lib (même comptage, mouvement pas déjà ailleurs dans le défi). Favoris en tête. */
const fresh = computed(() => {
  const cc = c.value;
  const l = leg.value;
  if (!cc || !l) return [];
  const taken = new Set<string>();
  for (const ch of challenges.list)
    if (ch.status === 'active' && !isCardioChallengeRow(ch))
      taken.add(variantFamilyKey(ch.exercise_id));
  const fav = new Set(profile.profile?.favorite_exercises ?? []);
  return lib.value
    .filter(
      (e) =>
        !isTennisExercise(e) &&
        !taken.has(variantFamilyKey(e.id)) &&
        comboTransferBlocker(cc, l.exercise_id, { exercise: newExercise(e) }) === null,
    )
    .sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));
});

const hasAnim = (id: string) => !!exerciseFrames(id);
const exImg = (id: string) => exerciseImage(id);

/** Groupe d'un exo neuf dans le défi (celui où il serait posé). */
function slotOf(e: { muscle_primary?: string | null }): string | undefined {
  return leg.value ? (transferSlotFor(leg.value, e.muscle_primary) ?? undefined) : undefined;
}
/** Étiquette du groupe, seulement s'il diffère de celui de l'exo quitté (jambes). */
function groupOf(slot: string | undefined): string | null {
  if (!slot || !leg.value || slot === leg.value.slot) return null;
  const g = comboSlot(slot);
  return g ? `${g.emoji} ${g.label}` : null;
}

function close() {
  emit('update:modelValue', false);
}

function pick(to: ComboTransferTarget, name: string) {
  const cc = c.value;
  const l = leg.value;
  if (!cc || !l) return;
  const block = comboTransferBlocker(cc, l.exercise_id, to);
  if (block) {
    $q.notify({ type: 'warning', message: COMBO_TRANSFER_BLOCK_LABEL[block] });
    return;
  }
  // Squat ↔ Charnière : le volume change de muscle, on le dit avant de valider.
  const toSlot =
    'leg' in to ? cc.legs.find((x) => x.exercise_id === to.leg)?.slot : slotOf(to.exercise);
  const fromG = comboSlot(l.slot);
  const toG = toSlot ? comboSlot(toSlot) : undefined;
  const warn =
    fromG && toG && fromG.key !== toG.key
      ? `Le volume passe du groupe ${fromG.label} (${fromG.muscles.join(', ')}) au groupe ${toG.label} (${toG.muscles.join(', ')}).`
      : null;
  plan.value = comboTransferPlan(cc, l.exercise_id, to, profile.profile?.objective ?? null);
  pending.value = { to, name, warn };
}

// ── Correction avant bascule ──────────────────────────────────────────────
const pending = ref<{ to: ComboTransferTarget; name: string; warn: string | null } | null>(null);
const plan = ref<ComboTransferPlan | null>(null);
watch(
  () => props.modelValue,
  (open) => {
    if (!open) cancelPending();
  },
);
const isTime = computed(() => !!leg.value && legMode(leg.value) === 'time');
const isSets = computed(() => !leg.value || legMode(leg.value) === 'sets');
const unitShort = computed(() => (isTime.value ? 's' : 'reps'));
const destAssistable = computed(() => {
  const p = pending.value;
  if (!p) return false;
  if ('leg' in p.to) {
    const id = p.to.leg;
    return !!c.value?.legs.find((x) => x.exercise_id === id)?.assistable;
  }
  return p.to.exercise.assistable;
});
const KG_STEP = 2.5;
const fmtKg = (w: number) => String(Math.round(w * 10) / 10).replace('.', ',');
function stepReps(p: ComboSetWork, d: number) {
  p.reps = Math.max(1, (p.reps || 0) + d * (isTime.value ? 5 : 1));
}
function stepWeight(p: ComboSetWork, d: number) {
  const w = Math.max(0, (p.weight ?? 0) + d * KG_STEP);
  p.weight = w > 0 ? w : null;
}
function stepAll(what: 'reps' | 'weight', d: number) {
  for (const p of plan.value?.sets ?? []) (what === 'reps' ? stepReps : stepWeight)(p, d);
}
function stepTarget(d: number) {
  if (plan.value) plan.value.target = Math.max(1, plan.value.target + d * (isTime.value ? 5 : 1));
}
/** « Dips · 12 reps · 20 kg » : ce qu'était la série i avant la bascule. */
function fromLabel(i: number): string {
  const l = leg.value;
  const st = l ? legSets(l)[i] : undefined;
  if (!l || !st) return '';
  const w = st.origin?.done ?? st;
  let t = `${st.origin?.exercise_name ?? l.exercise_name} · ${w.reps} ${unitShort.value}`;
  if (w.weight) t += ` · ${fmtKg(w.weight)} kg`;
  if (w.assisted) t += ' · assisté';
  return t;
}
function cancelPending() {
  pending.value = null;
  plan.value = null;
}
function confirmPending() {
  const p = pending.value;
  const cc = c.value;
  const l = leg.value;
  if (!p || !plan.value || !cc || !l) return;
  void apply(cc.id, l.exercise_id, p.to, p.name, plan.value);
}

async function apply(
  id: string,
  fromId: string,
  to: ComboTransferTarget,
  name: string,
  chosen: ComboTransferPlan,
) {
  busy.value = true;
  try {
    await combo.transferLeg(id, fromId, to, chosen);
    emit('done', name);
    close();
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.sw-card {
  width: min(520px, 94vw);
  max-height: 86vh;
  overflow: auto;
  padding: 14px 10px 18px;
  background: var(--surface);
}
.sw-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sw-title {
  flex: 1;
  min-width: 0;
  font-family: 'Oswald', sans-serif;
  font-size: 18px;
  line-height: 1.2;
}
.sw-note {
  margin: 6px 0 12px;
  font-size: 13px;
  color: var(--dim);
  line-height: 1.4;
}
.sw-grp {
  margin: 12px 0 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dim);
}
.sw-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sw-tile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-height: 44px;
  padding: 8px;
  background: var(--bg);
  border: 2px solid var(--line-soft, var(--line));
  border-radius: 14px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.sw-tile:hover,
.sw-tile:focus-visible {
  border-color: var(--accent);
}
.sw-tile:disabled {
  opacity: 0.5;
  cursor: default;
}
.sw-media {
  position: relative;
  display: grid;
  place-items: center;
  height: 76px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-2, var(--surface));
  color: var(--dim);
}
.sw-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sw-bw {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 14px;
}
.sw-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.sw-grp-tag {
  font-size: 11px;
  color: var(--accent);
}
.sw-sub {
  font-size: 12px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.sw-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.sw-all {
  border-top: none;
}
.sw-target {
  border-top: 2px solid var(--line);
}
.sw-row-from {
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.sw-row-n {
  display: inline-block;
  min-width: 18px;
  font-weight: 700;
  color: var(--text);
}
.sw-row-ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 4px;
}
.sw-step {
  display: inline-flex;
  align-items: center;
  gap: 0;
  background: var(--bg);
  border-radius: 12px;
}
.sw-step :deep(.q-btn) {
  min-width: 44px;
  min-height: 44px;
}
.sw-val {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 40px;
  line-height: 1.05;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.sw-val b {
  font-family: 'Oswald', sans-serif;
  font-size: 17px;
}
.sw-val small {
  font-size: 10px;
  color: var(--dim);
}
.sw-asst {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--bg);
  color: var(--dim);
  font-size: 13px;
  cursor: pointer;
}
.sw-asst.on {
  border-color: var(--accent);
  color: var(--text);
}
.sw-warn {
  color: var(--d3);
}
.sw-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.sw-empty {
  font-size: 13px;
  color: var(--dim);
  padding: 6px 0;
}
</style>
