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
        Aucun autre exo de ce groupe n'est disponible (déjà pris par un défi, ou compté autrement).
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
        </button>
      </div>
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
  legDone,
  legMode,
  COMBO_TRANSFER_BLOCK_LABEL,
  type ComboChallenge,
  type ComboLeg,
  type ComboNewExercise,
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
  const slot = comboSlot(l.slot);
  const taken = new Set<string>();
  for (const ch of challenges.list)
    if (ch.status === 'active' && !isCardioChallengeRow(ch))
      taken.add(variantFamilyKey(ch.exercise_id));
  const fav = new Set(profile.profile?.favorite_exercises ?? []);
  return lib.value
    .filter(
      (e) =>
        (slot ? slot.muscles.includes(e.muscle_primary ?? '') : true) &&
        !isTennisExercise(e) &&
        !taken.has(variantFamilyKey(e.id)) &&
        comboTransferBlocker(cc, l.exercise_id, { exercise: newExercise(e) }) === null,
    )
    .sort((a, b) => (fav.has(b.id) ? 1 : 0) - (fav.has(a.id) ? 1 : 0));
});

const hasAnim = (id: string) => !!exerciseFrames(id);
const exImg = (id: string) => exerciseImage(id);

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
  const n = doneCount.value;
  let msg = n
    ? `Tes ${n} ${unitWord.value} de ${l.exercise_name} passent sur ${name}, avec ton objectif de ${l.target}.`
    : `Ton objectif de ${l.target} ${unitWord.value} passe sur ${name}.`;
  if ('leg' in to) {
    const d = cc.legs.find((x) => x.exercise_id === to.leg)!;
    msg += ` ${name} : ${legDone(d)}/${d.target} → ${legDone(d) + n}/${d.target + l.target}.`;
  }
  msg += ` ${l.exercise_name} quitte le défi. On ne peut pas revenir en arrière.`;
  $q.dialog({
    title: `⇄ ${l.exercise_name} → ${name}`,
    message: msg,
    cancel: { label: 'Annuler', flat: true, noCaps: true },
    ok: { label: 'Changer', color: 'primary', textColor: 'dark', noCaps: true, unelevated: true },
    persistent: false,
  }).onOk(() => void apply(cc.id, l.exercise_id, to, name));
}

async function apply(id: string, fromId: string, to: ComboTransferTarget, name: string) {
  busy.value = true;
  try {
    await combo.transferLeg(id, fromId, to);
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
  padding: 14px 14px 18px;
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
.sw-sub {
  font-size: 12px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.sw-empty {
  font-size: 13px;
  color: var(--dim);
  padding: 6px 0;
}
</style>
