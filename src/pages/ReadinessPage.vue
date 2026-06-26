<template>
  <q-page class="ready-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">Forme du jour</div>
        <div class="top-sub" v-if="session">{{ session.name }}</div>
      </div>
    </header>

    <div v-if="loading" class="column flex-center" style="min-height: 50vh"><q-spinner color="primary" size="32px" /></div>

    <template v-else-if="session">
      <div class="scroll">
        <p class="intro">Un point rapide avant de commencer — on adapte si besoin.</p>

        <div v-for="q in QUESTIONS" :key="q.key" class="q-block">
          <div class="q-label">{{ q.label }}</div>
          <div class="scale">
            <button
              v-for="(opt, i) in q.options" :key="i"
              class="scale-btn" :class="{ sel: answers[q.key] === i + 1 }"
              @click="answers[q.key] = i + 1"
            >{{ opt }}</button>
          </div>
        </div>

        <div class="suggestion" :class="suggestLight ? 'warn' : 'ok'">
          <q-icon :name="suggestLight ? 'bedtime' : 'bolt'" size="20px" />
          {{ suggestLight ? 'Journée fatiguée — une séance allégée est conseillée.' : 'En forme — séance normale.' }}
        </div>
      </div>

      <div class="cta-wrap">
        <button class="cta" @click="go(false, true)">Séance normale</button>
        <button class="cta light" @click="go(true, true)">Séance allégée<small>−1 série/exo</small></button>
        <button class="skip" @click="go(false, false)">Passer</button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { Session } from '@/lib/types';
import { useLiveStore } from '@/stores/live';
import { useSessionsStore } from '@/stores/sessions';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const live = useLiveStore();
const sessionsStore = useSessionsStore();

const id = String(route.params.id);
const loading = ref(true);
const session = ref<Session | null>(null);

const QUESTIONS = [
  { key: 'forme', label: 'Forme générale', options: ['Faible', 'OK', 'En forme'] },
  { key: 'sommeil', label: 'Sommeil', options: ['Mauvais', 'Correct', 'Bon'] },
  { key: 'courbatures', label: 'Courbatures', options: ['Fortes', 'Légères', 'Aucune'] },
] as const;

interface Answers { forme: number; sommeil: number; courbatures: number }
const answers = reactive<Answers>({ forme: 2, sommeil: 2, courbatures: 2 });

// readiness 1–5 : somme (3..9) ramenée à 1..5.
const readiness = computed(() => {
  const sum = answers.forme + answers.sommeil + answers.courbatures;
  return Math.min(5, Math.max(1, Math.round(((sum - 3) / 6) * 4 + 1)));
});
const suggestLight = computed(() => readiness.value <= 2);

async function back() {
  await router.push('/');
}

async function go(light: boolean, note: boolean) {
  if (!session.value) return;
  live.start(session.value, { resume: false, light, readiness: note ? readiness.value : undefined });
  await router.replace(`/session/${id}`);
}

onMounted(async () => {
  // Reprise d'une séance en cours → on saute le check.
  if (live.hasSaved(id)) {
    await router.replace(`/session/${id}`);
    return;
  }
  try {
    if (sessionsStore.list.length === 0) await sessionsStore.fetchMine();
    session.value = sessionsStore.list.find((s) => s.id === id)?.payload ?? null;
    if (!session.value) {
      $q.notify({ type: 'negative', message: 'Séance introuvable.' });
      await router.push('/');
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.ready-page { background: var(--bg); min-height: 100vh; display: flex; flex-direction: column; }
.top { padding: 14px 16px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line-soft); }
.iconbtn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font-size: 18px; display: grid; place-items: center; cursor: pointer; flex: none; }
.top-mid { flex: 1; min-width: 0; }
.top-title { font-weight: 600; font-size: 18px; text-transform: uppercase; }
.top-sub { font-size: 11.5px; color: var(--dim); margin-top: 2px; }

.scroll { flex: 1; overflow-y: auto; padding: 18px 16px 160px; }
.intro { color: var(--dim); font-size: 14px; margin-bottom: 18px; }
.q-block { margin-bottom: 18px; }
.q-label { font-size: 13px; color: var(--text); font-weight: 600; margin-bottom: 8px; }
.scale { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.scale-btn { min-height: 50px; border-radius: 12px; background: var(--surface); border: 1.5px solid var(--line); color: var(--text); font-family: var(--font-ui); font-size: 14px; cursor: pointer; &.sel { border-color: var(--accent); background: var(--surface-2); } }

.suggestion { display: flex; align-items: center; gap: 8px; padding: 14px; border-radius: 14px; font-size: 14px; margin-top: 8px; }
.suggestion.ok { background: var(--surface); border: 1px solid var(--line-soft); color: var(--dim); }
.suggestion.warn { background: var(--surface-2); border: 1px solid var(--accent); color: var(--text); }

.cta-wrap { position: fixed; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; padding: 14px 16px 24px; background: linear-gradient(180deg, #15120e00, var(--bg) 30%); display: flex; flex-direction: column; gap: 10px; }
.cta { width: 100%; height: 54px; border: none; border-radius: 16px; background: var(--accent); color: var(--accent-ink); font-family: var(--font-display); font-weight: 700; font-size: 17px; letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer; }
.cta.light { background: var(--surface-2); color: var(--text); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; gap: 8px; small { font-family: var(--font-ui); font-weight: 400; font-size: 11px; color: var(--dim); text-transform: none; } }
.skip { background: none; border: none; color: var(--dim); font-size: 13px; cursor: pointer; padding: 4px; }
</style>
