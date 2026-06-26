<template>
  <q-page class="ex-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back">‹</button>
      <div class="top-title font-display">{{ ex?.name || 'Exercice' }}</div>
    </header>

    <div v-if="loading" class="column flex-center" style="min-height: 50vh"><q-spinner color="primary" size="32px" /></div>

    <div v-else-if="ex" class="scroll">
      <!-- Média -->
      <div class="media">
        <img v-if="ex.payload?.media_url" :src="ex.payload.media_url" :alt="ex.name" />
        <q-icon v-else name="fitness_center" size="48px" color="grey-7" />
      </div>

      <div class="badges">
        <span class="chip lvl" :class="'l' + (ex.difficulty ?? 1)">{{ levelLabel(ex.difficulty) }}</span>
      </div>

      <!-- Muscles -->
      <div class="sec-h">Muscles</div>
      <div class="chips">
        <span v-if="ex.muscle_primary" class="chip accent">{{ ex.muscle_primary }}</span>
        <span v-for="m in ex.muscle_secondary ?? []" :key="m" class="chip">{{ m }}</span>
      </div>

      <!-- Matériel -->
      <div class="sec-h">Matériel</div>
      <div class="chips">
        <span v-if="ex.equipment" class="chip">{{ ex.equipment }}</span>
      </div>
      <div v-if="requiredLabels.length" class="required">
        Requis : {{ requiredLabels.join(', ') }}
      </div>
      <div v-else class="required dim">Aucun matériel requis (poids du corps).</div>

      <!-- Instructions -->
      <div class="sec-h">Instructions</div>
      <p v-if="ex.payload?.instructions" class="instructions">{{ ex.payload.instructions }}</p>
      <div v-else class="no-instr">
        Pas encore d'instructions pour cet exercice.
        <button class="link" @click="goSettings">Envoyer un retour</button>
      </div>

      <!-- Alternatives -->
      <template v-if="alts.length">
        <div class="sec-h">Alternatives</div>
        <button v-for="a in alts" :key="a.id" class="alt" @click="goExercise(a.id)">
          <div>
            <div class="alt-name">{{ a.name }}</div>
            <div class="alt-meta">{{ a.muscle_primary }}<template v-if="a.equipment"> · {{ a.equipment }}</template></div>
          </div>
          <div class="alt-go">›</div>
        </button>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLibraryStore, type ExerciseFull, type ExerciseRow } from '@/stores/library';
import { EQUIPMENT_ITEMS } from '@/data/profileOptions';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const library = useLibraryStore();

const loading = ref(true);
const ex = ref<ExerciseFull | null>(null);
const alts = ref<ExerciseRow[]>([]);

const EQUIP_LABELS: Record<string, string> = Object.fromEntries(EQUIPMENT_ITEMS.map((e) => [e.value, e.label]));

const requiredLabels = computed(() =>
  (ex.value?.equipment_required ?? []).map((a) => EQUIP_LABELS[a] ?? a),
);

function levelLabel(d: number | null | undefined) {
  return d === 3 ? 'Avancé' : d === 2 ? 'Intermédiaire' : 'Débutant';
}

async function load(id: string) {
  loading.value = true;
  alts.value = [];
  try {
    ex.value = await library.fetchOne(id);
    if (!ex.value) {
      $q.notify({ type: 'negative', message: 'Exercice introuvable.' });
      await router.push('/');
      return;
    }
    const altIds = ex.value.payload?.alternatives ?? [];
    if (altIds.length) alts.value = await library.fetchByIds(altIds);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
}

function back() {
  router.back();
}
async function goExercise(id: string) {
  await router.push(`/exercise/${id}`);
}
async function goSettings() {
  await router.push('/settings');
}

onMounted(async () => {
  await load(String(route.params.id));
});
watch(() => route.params.id, async (id) => {
  if (id) await load(String(id));
});
</script>

<style scoped lang="scss">
.ex-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; color: var(--text); }

.scroll { flex: 1; overflow-y: auto; padding: 16px; }
.media { height: 160px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line-soft); display: grid; place-items: center; overflow: hidden; margin-bottom: 14px; img { width: 100%; height: 100%; object-fit: cover; } }
.badges { margin-bottom: 8px; }

.sec-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim); margin: 20px 2px 10px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { font-size: 12px; font-weight: 600; letter-spacing: 0.3px; color: var(--dim); background: var(--surface); border: 1px solid var(--line-soft); padding: 6px 11px; border-radius: 8px; }
.chip.accent { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.chip.lvl { text-transform: uppercase; font-size: 11px; }
.chip.lvl.l1 { color: var(--accent-ink); background: var(--d1); border-color: var(--d1); }
.chip.lvl.l2 { color: var(--accent-ink); background: var(--d3); border-color: var(--d3); }
.chip.lvl.l3 { color: #fff; background: var(--d4); border-color: var(--d4); }
.required { font-size: 13px; color: var(--text); margin-top: 10px; &.dim { color: var(--dim); } }

.instructions { font-size: 14px; color: var(--text); line-height: 1.5; white-space: pre-wrap; }
.no-instr { font-size: 13px; color: var(--dim); }
.link { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; margin-left: 4px; font-size: 13px; text-decoration: underline; }

.alt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-soft); margin-bottom: 8px; cursor: pointer; }
.alt-name { font-weight: 600; font-size: 14.5px; color: var(--text); }
.alt-meta { font-size: 11.5px; color: var(--dim); margin-top: 2px; }
.alt-go { margin-left: auto; color: var(--accent); font-size: 20px; }
</style>
