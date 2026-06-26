<template>
  <q-dialog :model-value="modelValue" position="bottom" @update:model-value="emit('update:modelValue', $event)">
    <div class="sheet">
      <div class="grab" />
      <h3 class="font-display">Changer d'exercice</h3>
      <p>Mêmes muscles ciblés — l'historique de charge est conservé.</p>

      <div class="swtabs">
        <button class="swtab" :class="{ on: tab === 0 }" @click="tab = 0">Suggestions</button>
        <button class="swtab" :class="{ on: tab === 1 }" @click="tab = 1">Séances passées</button>
      </div>

      <!-- Suggestions -->
      <div v-if="tab === 0">
        <div v-if="loadingSugg" class="row flex-center q-pa-md"><q-spinner color="primary" /></div>
        <div v-else-if="suggestions.length === 0" class="empty">Aucune alternative trouvée.</div>
        <button v-for="alt in suggestions" :key="alt.id" class="alt" @click="choose(alt)">
          <div class="alt-ic">🏋️</div>
          <div>
            <div class="alt-name">{{ alt.name }}</div>
            <div class="alt-meta">{{ alt.muscle_primary }}<template v-if="alt.equipment"> · {{ alt.equipment }}</template></div>
          </div>
          <div class="alt-go">›</div>
        </button>
      </div>

      <!-- Séances passées -->
      <div v-else>
        <div v-if="loadingPast" class="row flex-center q-pa-md"><q-spinner color="primary" /></div>
        <div v-else-if="past.length === 0" class="empty">Pas d'historique pour l'instant.</div>
        <button v-for="p in past" :key="p.id" class="alt" @click="choosePast(p)">
          <div class="alt-ic">🕑</div>
          <div>
            <div class="alt-name">{{ p.name }}</div>
            <div class="alt-meta">Dernière fois : <b>{{ p.lastLoad }} kg × {{ p.lastReps }}</b> · note {{ p.lastDiff }}</div>
          </div>
          <div class="alt-go">›</div>
        </button>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useLogsStore } from '@/stores/logs';
import type { LiveExercise } from '@/stores/live';

const props = defineProps<{ modelValue: boolean; exercise: LiveExercise | null }>();
const emit = defineEmits<{
  'update:modelValue': [boolean];
  swap: [{ id: string; name: string; muscle_primary?: string; equipment?: string }];
}>();

const library = useLibraryStore();
const logs = useLogsStore();

const tab = ref(0);
const suggestions = ref<ExerciseRow[]>([]);
const loadingSugg = ref(false);

interface PastItem { id: string; name: string; lastLoad: number; lastReps: number; lastDiff: number }
const past = ref<PastItem[]>([]);
const loadingPast = ref(false);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open || !props.exercise) return;
    tab.value = 0;
    await Promise.all([loadSuggestions(), loadPast()]);
  },
);

async function loadSuggestions() {
  const ex = props.exercise;
  if (!ex) {
    suggestions.value = [];
    return;
  }
  loadingSugg.value = true;
  try {
    // Alternatives pré-câblées de l'exo (en tête) + mêmes muscles.
    const [alts, byMuscle] = await Promise.all([
      ex.alternatives.length ? library.fetchByIds(ex.alternatives) : Promise.resolve([]),
      ex.muscle_primary ? library.fetchByMuscle(ex.muscle_primary) : Promise.resolve([]),
    ]);
    const seen = new Set<string>([ex.id]);
    const merged: ExerciseRow[] = [];
    for (const r of [...alts, ...byMuscle]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      merged.push(r);
    }
    suggestions.value = merged;
  } finally {
    loadingSugg.value = false;
  }
}

async function loadPast() {
  loadingPast.value = true;
  try {
    const rows = await logs.fetchRecent(12);
    const seen = new Set<string>();
    const items: PastItem[] = [];
    for (const row of rows) {
      for (const le of row.payload.exercises) {
        if (seen.has(le.id) || le.id === props.exercise?.id) continue;
        const last = le.performed[le.performed.length - 1];
        if (!last) continue;
        seen.add(le.id);
        items.push({ id: le.id, name: le.name, lastLoad: last.load_kg, lastReps: last.reps, lastDiff: last.difficulty });
      }
    }
    past.value = items;
  } finally {
    loadingPast.value = false;
  }
}

function choose(alt: ExerciseRow) {
  emit('swap', {
    id: alt.id,
    name: alt.name,
    muscle_primary: alt.muscle_primary ?? undefined,
    equipment: alt.equipment ?? undefined,
  });
  emit('update:modelValue', false);
}

async function choosePast(p: PastItem) {
  // Enrichit muscle/matériel depuis la bibliothèque si l'exo y existe.
  const [row] = await library.fetchByIds([p.id]);
  emit('swap', {
    id: p.id,
    name: p.name,
    muscle_primary: row?.muscle_primary ?? undefined,
    equipment: row?.equipment ?? undefined,
  });
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.sheet {
  width: 100%;
  background: var(--surface);
  border-radius: 26px 26px 0 0;
  border-top: 1px solid var(--line);
  padding: 10px 18px 26px;
  max-height: 80vh;
  overflow-y: auto;
}
.grab { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 6px auto 16px; }
h3 { font-size: 20px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.3px; }
p { font-size: 12.5px; color: var(--dim); margin: 4px 0 14px; }
.empty { color: var(--dim); padding: 16px 2px; font-size: 13px; }
.swtabs { display: flex; gap: 6px; background: var(--surface-2); padding: 4px; border-radius: 12px; margin-bottom: 14px; }
.swtab {
  flex: 1; height: 36px; border: none; background: transparent; color: var(--dim);
  font-family: var(--font-ui); font-weight: 600; font-size: 13px; border-radius: 9px; cursor: pointer;
  &.on { background: var(--accent); color: var(--accent-ink); }
}
.alt {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 14px; border-radius: 14px; background: var(--surface-2);
  border: 1px solid var(--line-soft); margin-bottom: 9px; cursor: pointer;
}
.alt-ic { width: 42px; height: 42px; border-radius: 11px; background: var(--bg); display: grid; place-items: center; font-size: 20px; flex: none; }
.alt-name { font-weight: 600; font-size: 14.5px; color: var(--text); }
.alt-meta { font-size: 11.5px; color: var(--dim); margin-top: 2px; b { color: var(--accent); font-weight: 600; } }
.alt-go { margin-left: auto; color: var(--accent); font-size: 20px; }
</style>
