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
        </template>
        <template v-else>Tous tes groupes sont couverts par ce que tu fais et prévois.</template>
        Touche un groupe pour voir d’où viennent ses séries.
      </p>

      <!-- Chaque groupe se déplie : le détail dit d'où vient son « fait » (séances, 360,
           challenges, secondaires à ½) — la question qu'on se pose en comparant au 360. -->
      <template v-for="r in rows" :key="r.muscle">
        <button
          type="button"
          class="bb-row"
          :class="['s-' + r.state, { act: r.act, open: open === r.muscle }]"
          :aria-expanded="open === r.muscle"
          @click="toggle(r.muscle)"
        >
          <span class="bb-name">
            <span class="bb-dot" :style="{ background: muscleColor(r.muscle) }" /><span
              class="bb-txt"
              >{{ r.muscle }}</span
            >
          </span>
          <!-- Le FAIT en vert et plus épais que la piste : il se distingue du prévu (hachuré, à
             la couleur de l’état) sans avoir à lire la légende. -->
          <span class="bb-bar">
            <span class="bb-track" />
            <span class="bb-done" :style="{ width: r.bar.donePct + '%' }" />
            <span
              class="bb-plan"
              :style="{
                left: r.bar.donePct + '%',
                width: r.bar.plannedPct - r.bar.donePct + '%',
              }"
            />
            <span class="bb-mark" :style="{ left: r.bar.targetPct + '%' }" />
          </span>
          <span class="bb-val">
            <span
              ><b>{{ fmtSets(r.done) }}</b
              >/{{ fmtSets(r.target) }}</span
            >
            <small v-if="r.value > r.done">→ {{ fmtSets(r.value) }}</small>
          </span>
          <span v-if="r.act" class="bb-add" aria-hidden="true">＋</span>
        </button>
        <div v-if="open === r.muscle" class="bb-detail">
          <p v-if="!detail.length" class="bb-d-empty">
            Rien ne travaille ce groupe pour l’instant.
          </p>
          <div v-for="c in detail" :key="c.source + c.exerciseId" class="bb-d-row">
            <span class="bb-d-src" :title="SOURCE_LABEL[c.source]">{{
              SOURCE_EMOJI[c.source]
            }}</span>
            <span class="bb-d-name"
              >{{ c.name }}<span v-if="c.share < 1" class="bb-d-half">½</span></span
            >
            <span class="bb-d-val"
              ><b>{{ fmtSets(c.done) }}</b
              ><template v-if="period === 'week' && c.planned > 0">
                / {{ fmtSets(c.planned) }}</template
              ></span
            >
          </div>
          <p class="bb-d-foot">
            🏋️ séance · 🎯 Défi 360 · 🔥 challenge — ½ : groupe secondaire de l’exo<template
              v-if="period === 'week'"
              >, fait / prévu cette semaine</template
            ><template v-else>, moyenne par semaine sur 4 semaines</template>.
          </p>
          <button v-if="r.act" type="button" class="bb-d-cta" @click="addChallenge(r.muscle)">
            ＋ Lancer un défi sur {{ r.muscle }}
          </button>
        </div>
      </template>

      <p class="bb-legend">
        <span class="bb-lg lg-done" /> fait · <span class="bb-lg lg-plan" /> prévu ·
        <span class="bb-lg lg-mark" /> cible — séries/sem. ; « fait/cible → avec le prévu » ; un
        muscle secondaire compte ½ série.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// Équilibre du corps : chaque groupe musculaire à hauteur de SA cible, toutes sources
// confondues (séances, Défi 360, challenges), pour compléter le 360 par des challenges
// sur les groupes en déficit. Toute la règle vit dans `lib/bodyBalance`.
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProfileStore } from '@/stores/profile';
import { useBalanceInput } from '@/composables/useBalanceInput';
import {
  bodyBalance,
  balanceBarGeometry,
  muscleBreakdown,
  type BalancePeriod,
  type BalanceSource,
} from '@/lib/bodyBalance';
import { muscleColor, fmtSets, VOLUME_LOW } from '@/lib/volume';
import { computeMuscleTargets } from '@/lib/programBuilder';

const PERIODS: { key: BalancePeriod; label: string }[] = [
  { key: 'week', label: 'Semaine' },
  { key: 'weeks4', label: '4 sem.' },
];
const LOW_PCT = Math.round(VOLUME_LOW * 100);
const SOURCE_EMOJI: Record<BalanceSource, string> = {
  session: '🏋️',
  combo: '🎯',
  challenge: '🔥',
  boss: '🐉',
};
const SOURCE_LABEL: Record<BalanceSource, string> = {
  session: 'Séance',
  combo: 'Défi 360',
  challenge: 'Challenge',
  boss: 'Boss amis',
};
const PERIOD_KEY = 'muscu:balance:period';

const router = useRouter();
const profileStore = useProfileStore();
const { input, ensureLoaded } = useBalanceInput();

// Semaine par défaut : c'est l'unité du Défi 360, et la vue 4 semaines (une MOYENNE) ne se
// compare à rien de ce qu'on voit ailleurs. Le choix est retenu sur l'appareil.
function savedPeriod(): BalancePeriod {
  try {
    return localStorage.getItem(PERIOD_KEY) === 'weeks4' ? 'weeks4' : 'week';
  } catch {
    return 'week';
  }
}
const period = ref<BalancePeriod>(savedPeriod());
watch(period, (v) => {
  try {
    localStorage.setItem(PERIOD_KEY, v);
  } catch {
    // Stockage indisponible : le choix vaut pour la visite.
  }
});
const loading = ref(true);
const open = ref<string | null>(null);

function toggle(muscle: string) {
  open.value = open.value === muscle ? null : muscle;
}

const rows = computed(() => {
  const profile = profileStore.profile;
  if (!profile) return [];
  return bodyBalance({ ...input.value, targets: computeMuscleTargets(profile) }, period.value).map(
    (r) => ({
      ...r,
      act: r.state === 'low',
      bar: balanceBarGeometry(r.done, r.value, r.target),
    }),
  );
});
const deficits = computed(() => rows.value.filter((r) => r.act).length);
const detail = computed(() => {
  const profile = profileStore.profile;
  if (!profile || !open.value) return [];
  return muscleBreakdown(
    { ...input.value, targets: computeMuscleTargets(profile) },
    open.value,
    period.value,
  );
});

async function addChallenge(muscle: string) {
  await router.push({ path: '/challenges/new', query: { muscle } });
}

onMounted(async () => {
  try {
    await ensureLoaded();
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
  cursor: pointer;
  &.act {
    background: color-mix(in srgb, var(--d4) 8%, transparent);
    margin-bottom: 2px;
  }
  &.open {
    background: var(--surface-2);
    border-radius: 8px 8px 0 0;
    margin-bottom: 0;
  }
}
/* Retour à la ligne plutôt que troncature : « ischio-jambiers » ne tient pas sur 88 px à
   344 px de large, et coupé il ne se lit plus. La ligne garde ses 44 px. */
.bb-name {
  flex: 0 0 88px;
  min-width: 0;
  display: flex;
  align-items: center;
  font-size: 12.5px;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
/* Majuscule initiale seulement : `capitalize` en mettrait une après le tiret
   (« Ischio-Jambiers »). Même technique que la pastille du wizard de challenge. */
.bb-txt {
  min-width: 0;
  &::first-letter {
    text-transform: uppercase;
  }
}
.bb-dot {
  flex: 0 0 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
}
/* La barre fait la hauteur du FAIT (14 px) ; la piste et le prévu, plus fins (8 px), sont
   centrés dedans — le fait déborde au-dessus et au-dessous : la « surépaisseur ». */
.bb-bar {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 14px;
}
.bb-track,
.bb-plan {
  position: absolute;
  top: 3px;
  bottom: 3px;
}
.bb-track {
  left: 0;
  right: 0;
  background: var(--surface-3);
  border-radius: 4px;
}
.bb-done {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background: var(--d1);
  border-radius: 4px;
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
  z-index: 2;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--text);
  opacity: 0.8;
}
.bb-val {
  flex: 0 0 auto;
  min-width: 44px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.1;
  font: 12px var(--font-display);
  color: var(--dim);
  b {
    color: var(--text);
    font-size: 14px;
  }
  small {
    font-size: 10.5px;
    color: var(--bb-c);
  }
}
.bb-detail {
  margin: 0 0 6px;
  padding: 6px 10px 10px;
  background: var(--surface-2);
  border-radius: 0 0 8px 8px;
}
.bb-d-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  font-size: 12.5px;
}
.bb-d-src {
  flex: 0 0 18px;
  text-align: center;
}
.bb-d-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.bb-d-half {
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 10.5px;
  background: var(--surface-3);
  color: var(--dim);
}
.bb-d-val {
  flex: 0 0 auto;
  font: 12px var(--font-display);
  color: var(--dim);
  b {
    color: var(--d1);
    font-size: 13px;
  }
}
.bb-d-empty,
.bb-d-foot {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--dim);
  line-height: 1.4;
}
.bb-d-cta {
  margin-top: 8px;
  width: 100%;
  min-height: 44px;
  border: 0;
  border-radius: 8px;
  background: var(--d4);
  color: var(--accent-ink);
  font: 600 13px var(--font-ui);
  cursor: pointer;
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
.bb-lg {
  display: inline-block;
  width: 12px;
  height: 8px;
  border-radius: 2px;
  vertical-align: 0;
}
.lg-done {
  height: 10px;
  background: var(--d1);
}
.lg-plan {
  height: 6px;
  background: repeating-linear-gradient(-45deg, var(--accent) 0 2px, transparent 2px 4px);
}
.lg-mark {
  width: 2px;
  height: 10px;
  background: var(--text);
}
</style>
