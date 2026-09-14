<template>
  <section class="bb">
    <div class="bb-head">
      <h2 class="bb-title font-display">⚖️ Équilibre du corps</h2>
      <div class="bb-seg" role="tablist">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          role="tab"
          :aria-selected="period === p.key"
          :class="{ on: period === p.key }"
          @click="period = p.key"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="bb-empty"><q-spinner color="primary" size="22px" /></div>
    <div v-else-if="!rows.length" class="bb-empty">
      Renseigne ton profil pour calculer la cible de chaque muscle.
    </div>
    <template v-else>
      <p class="bb-lead">
        <template v-if="deficits">
          <b>{{ deficits }}</b> groupe{{ deficits > 1 ? 's' : '' }} sous {{ LOW_PCT }} % de la
          cible, même en tenant ce que tu as prévu.
          {{ deficits > 1 ? 'Touche un groupe' : 'Touche-le' }} pour lancer un défi dessus.
        </template>
        <template v-else>Tous tes groupes sont couverts par ce que tu fais et prévois.</template>
      </p>

      <component
        :is="r.state === 'low' ? 'button' : 'div'"
        v-for="r in rows"
        :key="r.muscle"
        class="bb-row"
        :class="['s-' + r.state, { act: r.state === 'low' }]"
        :type="r.state === 'low' ? 'button' : undefined"
        :aria-label="r.state === 'low' ? `Lancer un défi : ${r.muscle}` : undefined"
        @click="r.state === 'low' && addChallenge(r.muscle)"
      >
        <span class="bb-name">
          <span class="bb-dot" :style="{ background: muscleColor(r.muscle) }" />{{ cap(r.muscle) }}
        </span>
        <span class="bb-bar">
          <span class="bb-done" :style="{ width: w(r.done, r.target) + '%' }" />
          <span
            class="bb-plan"
            :style="{ left: w(r.done, r.target) + '%', width: w(r.value - r.done, r.target) + '%' }"
          />
          <span class="bb-mark" :style="{ left: MARK + '%' }" />
        </span>
        <span class="bb-val"
          ><b>{{ fmt(r.value) }}</b
          >/{{ fmt(r.target) }}</span
        >
        <span v-if="r.state === 'low'" class="bb-add" aria-hidden="true">＋</span>
      </component>

      <p class="bb-legend">
        <span class="lg lg-done" /> fait · <span class="lg lg-plan" /> prévu ·
        <span class="lg lg-mark" /> cible — séries/sem. ; un muscle secondaire compte ½ série.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// Équilibre du corps : chaque groupe musculaire à hauteur de SA cible, toutes sources
// confondues (séances, Défi 360, challenges), pour compléter le 360 par des challenges
// sur les groupes en déficit. Toute la règle vit dans `lib/bodyBalance`.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLogsStore } from '@/stores/logs';
import { useLibraryStore } from '@/stores/library';
import { useComboStore } from '@/stores/combo';
import { useChallengesStore } from '@/stores/challenges';
import { useProfileStore } from '@/stores/profile';
import { bodyBalance, type BalancePeriod } from '@/lib/bodyBalance';
import { muscleColor } from '@/lib/volume';
import { computeMuscleTargets } from '@/lib/programBuilder';
import { logicalToday } from '@/lib/challenges';

const PERIODS: { key: BalancePeriod; label: string }[] = [
  { key: 'week', label: 'Semaine' },
  { key: 'weeks4', label: '4 sem.' },
];
const LOW_PCT = 60;
// La barre va jusqu'à 130 % de la cible (le seuil « surchargé ») : la cible tombe à 77 %.
const SCALE = 1.3;
const MARK = Math.round(100 / SCALE);

const router = useRouter();
const logsStore = useLogsStore();
const library = useLibraryStore();
const combo = useComboStore();
const challenges = useChallengesStore();
const profileStore = useProfileStore();

const period = ref<BalancePeriod>('weeks4');
const loading = ref(true);
const secondaries = ref<Map<string, string[]>>(new Map());

const rows = computed(() => {
  const profile = profileStore.profile;
  if (!profile) return [];
  const map = secondaries.value;
  return bodyBalance(
    {
      sessions: logsStore.all.map((r) => ({ performedAt: r.performed_at, log: r.payload })),
      combos: combo.list,
      challenges: challenges.list,
      targets: computeMuscleTargets(profile),
      objective: profile.objective,
      secondaries: (id) => map.get(id),
      today: logicalToday(),
    },
    period.value,
  );
});
const deficits = computed(() => rows.value.filter((r) => r.state === 'low').length);

function w(n: number, target: number): number {
  return Math.max(0, Math.min(100, Math.round((n / (target * SCALE)) * 100)));
}
// Majuscule initiale seulement (`capitalize` en mettrait une après le tiret : « Ischio-Jambiers »).
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
async function addChallenge(muscle: string) {
  await router.push({ path: '/challenges/new', query: { muscle } });
}

onMounted(async () => {
  try {
    const [map] = await Promise.all([library.fetchSecondaries(), logsStore.fetchAll()]);
    secondaries.value = map;
  } catch {
    // Sans secondaires ni séances, le graphe reste juste sur ce qu'il sait (360 + défis).
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.bb {
  margin-top: 18px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.bb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.bb-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.2;
  font-weight: 600;
}
.bb-seg {
  display: flex;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 2px;
  button {
    border: 0;
    background: transparent;
    color: var(--dim);
    font: 600 12px var(--font-ui);
    min-height: 32px;
    padding: 0 12px;
    border-radius: 6px;
    cursor: pointer;
    &.on {
      background: var(--accent);
      color: var(--accent-ink);
    }
  }
}
.bb-lead {
  margin: 8px 0 6px;
  font-size: 12.5px;
  color: var(--dim);
  b {
    color: var(--d4);
  }
}
.bb-empty {
  padding: 14px 0 4px;
  text-align: center;
  font-size: 13px;
  color: var(--dim);
}
.bb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  --bb-c: var(--accent);
  &.s-low {
    --bb-c: var(--d4);
  }
  &.s-high {
    --bb-c: var(--d3);
  }
  &.act {
    cursor: pointer;
    background: color-mix(in srgb, var(--d4) 8%, transparent);
    margin-bottom: 2px;
  }
}
/* Retour à la ligne plutôt que troncature : « ischio-jambiers » ne tient pas sur 88 px à
   344 px de large, et coupé il ne se lit plus. La ligne garde ses 44 px. */
.bb-name {
  flex: 0 0 88px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.bb-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: 1px;
}
.bb-bar {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 10px;
  background: var(--surface-3);
  border-radius: 5px;
  overflow: hidden;
}
.bb-done,
.bb-plan {
  position: absolute;
  top: 0;
  bottom: 0;
}
.bb-done {
  left: 0;
  background: var(--bb-c);
}
.bb-plan {
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--bb-c) 70%, transparent) 0 3px,
    transparent 3px 6px
  );
}
.bb-mark {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--text);
  opacity: 0.8;
}
.bb-val {
  flex: 0 0 auto;
  min-width: 44px;
  text-align: right;
  font: 12px var(--font-display);
  color: var(--dim);
  b {
    color: var(--bb-c);
    font-size: 14px;
  }
}
.bb-add {
  flex: 0 0 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--d4);
  color: var(--accent-ink);
  font-weight: 700;
}
.bb-legend {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--dim);
  line-height: 1.5;
}
.lg {
  display: inline-block;
  width: 12px;
  height: 8px;
  border-radius: 2px;
  vertical-align: 0;
}
.lg-done {
  background: var(--accent);
}
.lg-plan {
  background: repeating-linear-gradient(-45deg, var(--accent) 0 2px, transparent 2px 4px);
}
.lg-mark {
  width: 2px;
  height: 10px;
  background: var(--text);
}
</style>
