<template>
  <component :is="embedded ? 'div' : 'q-page'" class="stats-page" :class="{ embedded }">
    <h1 class="p-title font-display">{{ muscuScope ? 'Stats muscu' : 'Statistiques' }}</h1>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <!-- Niveaux : Global/Défis = effort (XP) ; par sport = pratique (temps). -->
      <div v-if="!muscuScope" class="lvl-note">
        Global &amp; Défis = effort · par sport = temps de pratique
      </div>
      <div class="lvl-list">
        <div
          v-for="c in levelCards"
          :key="c.key"
          class="lvl-card"
          :class="{ big: c.key === 'global' }"
        >
          <div class="lvl-head">
            <span class="lvl-name">{{ c.label }}</span>
            <span class="lvl-n font-display">Niv. {{ c.info.level }}</span>
          </div>
          <div class="lvl-bar">
            <div class="lvl-fill" :style="{ width: c.info.progressPct + '%' }" />
          </div>
          <div class="lvl-xp">
            {{ c.info.xpIntoLevel.toLocaleString('fr-FR') }} /
            {{ c.info.xpForLevel.toLocaleString('fr-FR') }} {{ c.unit }}
          </div>
        </div>
      </div>

      <div v-if="muscuSessionCount === 0" class="empty">
        Aucune série muscu enregistrée pour l’instant. Fais une <b>Séance libre</b>, suis ton
        <b>programme</b> ou remplis ton <b>Défi 360</b> — les séances rapides (durée seule) ne
        comptent pas de séries par muscle.
      </div>

      <template v-else>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-v font-display">{{ muscuSessionCount }}</span
            ><span class="kpi-l">séances</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ totalSets }}</span
            ><span class="kpi-l">séries</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ exos.length }}</span
            ><span class="kpi-l">exos</span>
          </div>
        </div>

        <!-- Cette semaine : régularité -->
        <div class="sec-h">Cette semaine</div>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-v font-display">{{ weekSetsTotal }}</span
            ><span class="kpi-l">séries</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ muscuFreq30 }}</span
            ><span class="kpi-l">séances / 30 j</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ weekStreak }}</span
            ><span class="kpi-l">sem. d’affilée</span>
          </div>
        </div>

        <!-- Volume hebdo RÉEL vs CIBLE (ferme la boucle du programme) -->
        <template v-if="volStatus.length">
          <div class="sec-h">Volume hebdo vs objectif</div>
          <div class="grp-card">
            <div v-for="s in volStatus" :key="s.muscle" class="grp-row">
              <span class="grp-name"
                ><span class="grp-dot" :style="{ background: muscleColor(s.muscle) }" />{{
                  s.muscle
                }}</span
              >
              <div class="grp-bar">
                <div
                  class="grp-fill"
                  :style="{ width: volPct(s) + '%', background: VOL_COLORS[s.state] }"
                />
              </div>
              <span class="grp-val" :class="'vs-' + s.state"
                ><b>{{ s.done }}</b
                >/{{ s.target }}</span
              >
            </div>
          </div>
          <p class="hint hint-legend">
            <span class="vs-dot low" /> négligé · <span class="vs-dot ok" /> dans la cible ·
            <span class="vs-dot high" /> au-dessus. Cible hebdo = ton programme (objectif, niveau,
            sports).
          </p>
        </template>

        <!-- Volume par semaine (tendance) -->
        <div class="sec-h">Volume par semaine (8 sem.)</div>
        <div class="wk-chart">
          <div
            v-for="(w, i) in weekSeries"
            :key="w.weekStart"
            class="wk-col"
            :title="w.weekStart + ' — ' + w.sets + ' séries'"
          >
            <div
              class="wk-bar"
              :class="{ cur: i === weekSeries.length - 1 }"
              :style="{ height: Math.round((w.sets / maxWeekSets) * 100) + '%' }"
            />
            <span class="wk-x">{{ w.sets }}</span>
          </div>
        </div>

        <!-- Volume par PÉRIODE (semaine/mois) : carte du corps + détail par exo -->
        <div class="sec-h">Volume musculaire</div>
        <div class="vol-period">
          <button :class="{ on: volPeriod === 'week' }" @click="volPeriod = 'week'">
            Cette semaine
          </button>
          <button :class="{ on: volPeriod === 'month' }" @click="volPeriod = 'month'">
            Ce mois
          </button>
        </div>
        <div class="vol-card">
          <MuscleBody :series="volSets" />
          <div class="vol-total">
            <b>{{ volData.totalSets }}</b> séries · {{ volPeriodLabel }}
          </div>
          <div v-if="volData.byExo.length" class="vol-exos">
            <div v-for="e in volData.byExo" :key="e.id" class="vol-exo">
              <span class="ve-dot" :style="{ background: muscleColor(e.muscle) }" />
              <span class="ve-name">{{ e.name }}</span>
              <span class="ve-num"
                ><b>{{ e.sets }}</b> séries · {{ e.reps }} reps</span
              >
            </div>
          </div>
          <div v-else class="vol-empty">
            Aucune série détaillée sur la période. Fais une <b>Séance libre</b> ou suis ton
            <b>programme</b> pour remplir le schéma — les <i>séances rapides</i> (durée seule) ne
            comptent pas de séries par muscle.
          </div>
        </div>

        <!-- Radar d'équilibre musculaire (pics = séries par région) -->
        <div class="sec-h">Équilibre musculaire</div>
        <div class="grp-card radar-card">
          <div v-if="totalSets > 0" class="radar-wrap">
            <svg
              class="radar"
              viewBox="0 0 200 200"
              role="img"
              aria-label="Radar d’équilibre musculaire"
            >
              <!-- toile (anneaux + axes) -->
              <polygon
                v-for="(ring, i) in radarRings"
                :key="'ring' + i"
                class="radar-ring"
                :points="ring"
              />
              <line
                v-for="a in radarAxes"
                :key="'ax' + a.key"
                class="radar-axis"
                :x1="RADAR.cx"
                :y1="RADAR.cy"
                :x2="a.x2"
                :y2="a.y2"
              />
              <!-- forme (séries par région) -->
              <polygon class="radar-shape" :points="radarShape" />
              <!-- labels -->
              <text
                v-for="a in radarAxes"
                :key="'lb' + a.key"
                class="radar-lbl"
                :x="a.lx"
                :y="a.ly"
                :text-anchor="a.anchor"
              >
                {{ a.key }}
                <tspan class="radar-lbl-v">{{ a.sets }}</tspan>
              </text>
            </svg>
          </div>
          <div v-else class="vol-empty">
            Pas encore de séries — le radar se remplit avec tes séances.
          </div>
        </div>

        <!-- Séries par groupe musculaire -->
        <div class="sec-h">Séries par groupe musculaire (total)</div>
        <div class="grp-card">
          <div v-for="g in muscleSets" :key="g.muscle" class="grp-row">
            <span class="grp-name"
              ><span class="grp-dot" :style="{ background: muscleColor(g.muscle) }" />{{
                g.muscle
              }}</span
            >
            <div class="grp-bar">
              <div
                class="grp-fill"
                :style="{ width: barPct(g.sets) + '%', background: muscleColor(g.muscle) }"
              />
            </div>
            <span class="grp-val"
              ><b>{{ g.sets }}</b></span
            >
          </div>
        </div>

        <!-- Exercices les plus fréquents -->
        <div class="sec-h">Exercices (les plus fréquents)</div>
        <button v-for="e in exos" :key="e.id" class="ex-row" @click="openExercise(e.id)">
          <span class="ex-dot" :style="{ background: muscleColor(e.muscle) }" />
          <div class="ex-main">
            <div class="ex-name">{{ e.name }}</div>
            <div class="ex-sub">
              {{ e.muscle }} · {{ e.sessions }} séance{{ e.sessions > 1 ? 's' : '' }} ·
              {{ e.sets }} séries
            </div>
          </div>
          <div class="ex-loads">
            <template v-if="e.max != null">
              <div class="ex-load">
                <b>{{ e.max }}</b
                ><small>max</small>
              </div>
              <div class="ex-load">
                <b>{{ e.median }}</b
                ><small>méd.</small>
              </div>
              <div class="ex-load">
                <b>{{ e.avg }}</b
                ><small>moy.</small>
              </div>
            </template>
            <div v-else class="ex-pdc">PdC</div>
          </div>
          <q-icon name="chevron_right" color="grey-6" size="20px" />
        </button>
        <p class="hint">Touche un exercice pour voir la courbe d’évolution (1RM estimé).</p>
      </template>

      <!-- Tennis -->
      <template v-if="!muscuScope && drillLogs.length">
        <div class="sec-h sec-tennis">🎾 Tennis</div>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-v font-display">{{ tennisKpis.sessions }}</span
            ><span class="kpi-l">séances</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ tennisKpis.minutes }}</span
            ><span class="kpi-l">minutes</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ tennisLast30 }}</span
            ><span class="kpi-l">sur 30 j</span>
          </div>
        </div>

        <div v-if="shotBreakdown.length" class="sec-h">Coups travaillés</div>
        <div v-if="shotBreakdown.length" class="grp-card">
          <div v-for="s in shotBreakdown" :key="s.shot" class="grp-row">
            <span class="grp-name">{{ shotLabel(s.shot) }}</span>
            <div class="grp-bar">
              <div
                class="grp-fill"
                :style="{ width: (s.n / maxShot) * 100 + '%', background: 'var(--accent)' }"
              />
            </div>
            <span class="grp-val"
              ><b>{{ s.n }}</b></span
            >
          </div>
        </div>
      </template>

      <!-- Cardio -->
      <template v-if="!muscuScope && cardio.logs.length">
        <div class="sec-h sec-tennis">🏃 Cardio</div>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-v font-display">{{ cardioKpis.km }}</span
            ><span class="kpi-l">km</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ cardioKpis.dplus }}</span
            ><span class="kpi-l">m D+</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ cardioKpis.sessions }}</span
            ><span class="kpi-l">sorties</span>
          </div>
          <div class="kpi">
            <span class="kpi-v font-display">{{ cardioKpis.last30 }}</span
            ><span class="kpi-l">sur 30 j</span>
          </div>
        </div>
      </template>
    </template>
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useLogsStore, type LogRow } from '@/stores/logs';
import { useTennisStore, type DrillLogRow } from '@/stores/tennis';
import { useCardioStore } from '@/stores/cardio';
import { useComboStore } from '@/stores/combo';
import { useChallengesStore } from '@/stores/challenges';
import MuscleBody from '@/components/MuscleBody.vue';
import {
  muscleColor,
  weeklySetsByMuscle,
  muscleVolumeInRange,
  comboLogEntries,
  challengeLogEntries,
  isMuscuLog,
  mondayOf,
  firstOfMonth,
  dayAfter,
  volumeVsTarget,
  weeklyVolumeSeries,
  muscuSessionsInLastDays,
  muscuWeekStreak,
  type LogEntry,
} from '@/lib/volume';
import { computeMuscleTargets } from '@/lib/programBuilder';
import { useProfileStore } from '@/stores/profile';
import { DRILL_SHOT_LABELS } from '@/data/tennis';
import { useProgress } from '@/composables/useProgress';
import type { DrillShot, Difficulty } from '@/lib/types';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();

const logsStore = useLogsStore();
const profileStore = useProfileStore();
const tennis = useTennisStore();
const cardio = useCardioStore();
const combo = useComboStore();
const challenges = useChallengesStore();
const loading = ref(true);
// Vue « muscu seule » (ouverte depuis la tuile Muscu, `?scope=muscu`) : on masque
// tennis / cardio / autres sports et on ne garde que le niveau Muscu.
const muscuScope = computed(() => route.query.scope === 'muscu');
const logs = ref<LogRow[]>([]);
const drillLogs = ref<DrillLogRow[]>([]);
const progress = useProgress();
// Global + un niveau par SPORT réellement pratiqué (cohérent avec l'accueil) + Défis.
// En vue muscu seule : seulement le niveau Muscu (tuile `disc:musculation`).
const levelCards = computed(() => {
  if (muscuScope.value) {
    return progress.sportTiles.value
      .filter((t) => t.key === 'disc:musculation')
      .map((t) => ({ key: t.key, label: t.label, info: t.level, unit: 'min' }));
  }
  return [
    { key: 'global', label: 'Global', info: progress.global.value, unit: 'XP' },
    ...progress.sportTiles.value.map((t) => ({
      key: t.key,
      label: t.label,
      info: t.level,
      unit: 'min',
    })),
    { key: 'challenges', label: 'Défis', info: progress.challenges.value, unit: 'XP' },
  ];
});

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

interface ExoStat {
  id: string;
  name: string;
  muscle: string;
  sessions: number;
  sets: number;
  avg: number | null;
  median: number | null;
  max: number | null;
}

// Agrégat par exercice (toutes séances MUSCU, séances + Défi 360).
const exos = computed<ExoStat[]>(() => {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      muscle: string;
      sessions: Set<string>;
      sets: number;
      loads: number[];
    }
  >();
  for (const e of entries.value) {
    if (!isMuscuLog(e.log)) continue;
    for (const ex of e.log.exercises) {
      const cur = map.get(ex.id) ?? {
        id: ex.id,
        name: ex.name,
        muscle: ex.muscle_primary ?? '—',
        sessions: new Set(),
        sets: 0,
        loads: [],
      };
      cur.sessions.add(e.log.id);
      for (const s of ex.performed) {
        cur.sets++;
        if (s.load_kg > 0) cur.loads.push(s.load_kg);
      }
      map.set(ex.id, cur);
    }
  }
  return [...map.values()]
    .map((e) => ({
      id: e.id,
      name: e.name,
      muscle: e.muscle,
      sessions: e.sessions.size,
      sets: e.sets,
      avg: e.loads.length
        ? Math.round((e.loads.reduce((a, b) => a + b, 0) / e.loads.length) * 10) / 10
        : null,
      median: e.loads.length ? median(e.loads) : null,
      max: e.loads.length ? Math.max(...e.loads) : null,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets);
});

const muscleSets = computed(() => {
  const map = new Map<string, number>();
  for (const e of entries.value) {
    if (!isMuscuLog(e.log)) continue;
    for (const ex of e.log.exercises) {
      const m = ex.muscle_primary ?? '—';
      map.set(m, (map.get(m) ?? 0) + ex.performed.length);
    }
  }
  return [...map.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
});

const totalSets = computed(() => muscleSets.value.reduce((a, g) => a + g.sets, 0));
// Nb de séances MUSCU (séances loggées + jours de Défi 360) avec ≥1 série.
const muscuSessionCount = computed(
  () => entries.value.filter((e) => isMuscuLog(e.log) && e.log.exercises.length > 0).length,
);
const maxMuscle = computed(() => Math.max(1, ...muscleSets.value.map((g) => g.sets)));

// ── Radar d'ÉQUILIBRE musculaire (façon stats de RPG : force/agilité/…) : 6 régions,
// pics = nb de séries du groupe sur la période → on voit d'un coup si le perso est
// équilibré ou déséquilibré (ticket 69db971c). ──
const RADAR_REGIONS: { key: string; muscles: string[] }[] = [
  { key: 'Poitrine', muscles: ['pectoraux'] },
  { key: 'Épaules', muscles: ['épaules'] },
  { key: 'Bras', muscles: ['biceps', 'triceps', 'avant-bras'] },
  { key: 'Jambes', muscles: ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers'] },
  { key: 'Core', muscles: ['abdominaux'] },
  { key: 'Dos', muscles: ['dos'] },
];
const RADAR = { cx: 100, cy: 100, r: 66, n: RADAR_REGIONS.length };
const radarData = computed(() => {
  const bySets = new Map<string, number>();
  for (const g of muscleSets.value) bySets.set(g.muscle.toLowerCase(), g.sets);
  return RADAR_REGIONS.map((reg) => ({
    key: reg.key,
    sets: reg.muscles.reduce((a, m) => a + (bySets.get(m) ?? 0), 0),
  }));
});
const radarMax = computed(() => Math.max(1, ...radarData.value.map((r) => r.sets)));
function radarPoint(i: number, frac: number): { x: number; y: number } {
  const ang = ((-90 + (360 / RADAR.n) * i) * Math.PI) / 180;
  return {
    x: RADAR.cx + RADAR.r * frac * Math.cos(ang),
    y: RADAR.cy + RADAR.r * frac * Math.sin(ang),
  };
}
const poly = (frac: (i: number) => number) =>
  radarData.value
    .map((_, i) => {
      const p = radarPoint(i, frac(i));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
const radarShape = computed(() => poly((i) => radarData.value[i]!.sets / radarMax.value));
const radarRings = computed(() => [0.25, 0.5, 0.75, 1].map((f) => poly(() => f)));
const radarAxes = computed(() =>
  radarData.value.map((r, i) => {
    const end = radarPoint(i, 1);
    const lbl = radarPoint(i, 1.28);
    return {
      key: r.key,
      sets: r.sets,
      x2: end.x.toFixed(1),
      y2: end.y.toFixed(1),
      lx: lbl.x,
      ly: lbl.y,
      anchor: lbl.x < 46 ? 'end' : lbl.x > 154 ? 'start' : 'middle',
    };
  }),
);

function barPct(n: number) {
  return Math.round((n / maxMuscle.value) * 100);
}

// ── Volume HEBDO : réel vs cible + tendances (ferme la boucle du programme) ──
// Les séries du Défi 360 sont converties en séances synthétiques → elles comptent
// dans TOUT le volume muscu (heatmap, objectif, tendance) au même titre qu'une séance.
const entries = computed<LogEntry[]>(() => [
  ...logs.value.map((r) => ({ performedAt: r.performed_at, log: r.payload })),
  ...comboLogEntries(combo.list),
  ...challengeLogEntries(challenges.list),
]);
// Date du jour en LOCAL (jamais toISOString → pas de décalage de fuseau).
const todayIso = (() => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
})();
const targets = computed(() =>
  profileStore.profile ? computeMuscleTargets(profileStore.profile) : {},
);
// Volume par PÉRIODE (heatmap corps + détail) — semaine en cours ou mois en cours.
const volPeriod = ref<'week' | 'month'>('week');
const volPeriodLabel = computed(() =>
  volPeriod.value === 'week' ? 'cette semaine' : 'ce mois-ci',
);
const volData = computed(() => {
  const start = volPeriod.value === 'week' ? mondayOf(todayIso) : firstOfMonth(todayIso);
  return muscleVolumeInRange(entries.value, start, dayAfter(todayIso));
});
const volSets = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  const bm = volData.value.byMuscle;
  for (const m of Object.keys(bm)) out[m] = bm[m]!.sets;
  return out;
});
const weeklyDone = computed(() => weeklySetsByMuscle(entries.value, todayIso));
const volStatus = computed(() => volumeVsTarget(weeklyDone.value, targets.value));
const weekSeries = computed(() => weeklyVolumeSeries(entries.value, 8, todayIso));
const maxWeekSets = computed(() => Math.max(1, ...weekSeries.value.map((w) => w.sets)));
const muscuFreq30 = computed(() => muscuSessionsInLastDays(entries.value, 30, todayIso));
const weekStreak = computed(() => muscuWeekStreak(entries.value, todayIso));
const weekSetsTotal = computed(() => Object.values(weeklyDone.value).reduce((a, b) => a + b, 0));
// Couleur par état : négligé (rouge) / dans la cible (jaune voltage) / au-dessus (orange).
const VOL_COLORS: Record<string, string> = { low: '#FF6A45', ok: '#FFD23F', high: '#FFB23F' };
// Largeur de barre = done/target plafonné à 100 % (le surplus se lit à la couleur).
function volPct(s: { pct: number }) {
  return Math.round(Math.min(1, s.pct) * 100);
}

async function openExercise(id: string) {
  await router.push(`/exercise/${id}`);
}

// ————— Stats tennis (drill_logs) —————
const tennisKpis = computed(() => {
  const rows = drillLogs.value;
  const minutes = rows.reduce((a, r) => a + (r.payload.duration_min ?? 0), 0);
  const rated = rows
    .map((r) => r.payload.global_difficulty)
    .filter((d): d is Difficulty => d != null);
  const avg = rated.length
    ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10
    : null;
  return { sessions: rows.length, minutes, avg };
});

// Répartition des drills réalisés par coup travaillé.
const shotBreakdown = computed(() => {
  const map = new Map<DrillShot, number>();
  for (const r of drillLogs.value) {
    for (const d of r.payload.drills) {
      if (!d.done) continue;
      const shot = (d as { shot?: DrillShot }).shot;
      if (shot) map.set(shot, (map.get(shot) ?? 0) + 1);
    }
  }
  return [...map.entries()].map(([shot, n]) => ({ shot, n })).sort((a, b) => b.n - a.n);
});
const maxShot = computed(() => Math.max(1, ...shotBreakdown.value.map((s) => s.n)));
const shotLabel = (s: DrillShot) => DRILL_SHOT_LABELS[s];

// Régularité : nombre de séances tennis sur les 30 derniers jours.
const tennisLast30 = computed(() => {
  const cutoff = Date.now() - 30 * 86400000;
  return drillLogs.value.filter((r) => Date.parse(r.performed_at) >= cutoff).length;
});

// ————— Stats cardio (cardio_logs) —————
const cardioKpis = computed(() => {
  const rows = cardio.logs;
  const km = Math.round(rows.reduce((a, r) => a + (r.payload.distance_km ?? 0), 0) * 10) / 10;
  const dplus = rows.reduce((a, r) => a + (r.payload.elevation_m ?? 0), 0);
  const cutoff = Date.now() - 30 * 86400000;
  const last30 = rows.filter((r) => Date.parse(r.performed_at) >= cutoff).length;
  return { sessions: rows.length, km, dplus, last30 };
});

onMounted(async () => {
  try {
    cardio.fetchLogs(300).catch(() => undefined);
    combo.fetchMine().catch(() => undefined);
    challenges.fetchMine().catch(() => undefined);
    tennis
      .fetchLogs(300)
      .then((l) => (drillLogs.value = l))
      .catch(() => undefined);
    logs.value = await logsStore.fetchRecent(300);
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.stats-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.stats-page.embedded {
  min-height: 0;
}
/* Niveaux (global + pistes) */
.lvl-note {
  font-size: 11.5px;
  color: var(--dim);
  margin-bottom: 8px;
}
.lvl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}
.lvl-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
}
.lvl-card.big {
  border-color: var(--accent);
}
.lvl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.lvl-name {
  font-weight: 600;
  color: var(--text);
}
.lvl-card.big .lvl-name {
  color: var(--accent);
}
.lvl-n {
  font-weight: 700;
  color: var(--accent);
  font-size: 15px;
}
.lvl-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 8px 0 4px;
}
.lvl-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.lvl-xp {
  font-size: 11px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
/* Niveau d'athlète */
.ath-card {
  --tier: var(--accent);
  background: var(--surface-2);
  border: 1px solid var(--tier);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 18px;
}
.ath-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ath-circle {
  width: 52px;
  height: 52px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid var(--tier);
  background: color-mix(in srgb, var(--tier) 18%, transparent);
  color: var(--tier);
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ath-info {
  flex: 1;
  min-width: 0;
}
.ath-tier {
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ath-xp {
  font-size: 13px;
  color: var(--dim);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.ath-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 12px 0 6px;
}
.ath-fill {
  height: 100%;
  background: var(--tier);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.ath-next {
  font-size: 11.5px;
  color: var(--dim);
}
.p-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 4px 0 18px;
}
.empty {
  color: var(--dim);
  padding: 24px 0;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.kpi {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 14px;
  text-align: center;
}
.kpi-v {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: var(--accent);
}
.kpi-l {
  font-size: 11px;
  color: var(--dim);
}

.sec-h {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 24px 2px 10px;
}
.grp-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 6px 14px;
}
/* Radar d'équilibre musculaire (toile + forme). */
.radar-card {
  padding: 8px;
}
.radar-wrap {
  max-width: 320px;
  margin: 0 auto;
}
.radar {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.radar-ring {
  fill: none;
  stroke: var(--line);
  stroke-width: 0.8;
  opacity: 0.5;
}
.radar-axis {
  stroke: var(--line);
  stroke-width: 0.8;
  opacity: 0.5;
}
.radar-shape {
  fill: color-mix(in srgb, var(--accent) 28%, transparent);
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linejoin: round;
}
.radar-lbl {
  fill: var(--text);
  font-size: 9px;
  font-weight: 600;
}
.radar-lbl-v {
  fill: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
}
/* Volume par période : sélecteur + carte du corps + détail par exo. */
.vol-period {
  display: inline-flex;
  gap: 4px;
  background: var(--surface-2, #2b241b);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  margin-bottom: 10px;
}
.vol-period button {
  border: none;
  background: none;
  color: var(--dim);
  font-weight: 700;
  font-size: 12.5px;
  padding: 5px 16px;
  border-radius: 999px;
  cursor: pointer;
}
.vol-period button.on {
  background: var(--accent);
  color: #15120e;
}
.vol-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.vol-total {
  text-align: center;
  font-size: 13px;
  color: var(--dim);
  margin: 4px 0 10px;
}
.vol-total b {
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 16px;
}
.vol-exos {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.vol-exo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--line-soft);
  font-size: 13px;
}
.ve-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.ve-name {
  flex: 1;
  min-width: 0;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ve-num {
  flex: none;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.ve-num b {
  color: var(--text);
}
.vol-empty {
  text-align: center;
  color: var(--dim);
  font-size: 12.5px;
  padding: 8px 0;
}
.grp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line-soft);
  &:last-child {
    border-bottom: none;
  }
}
.grp-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--text);
  text-transform: capitalize;
  width: 110px;
  flex: none;
}
.grp-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.grp-bar {
  flex: 1;
  height: 8px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
}
.grp-fill {
  height: 100%;
  border-radius: 5px;
}
.grp-val {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--text);
  width: 32px;
  text-align: right;
  flex: none;
  b {
    color: var(--accent);
  }
}

.ex-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
}
.ex-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.ex-main {
  flex: 1;
  min-width: 0;
}
.ex-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.ex-sub {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
  text-transform: capitalize;
}
.ex-loads {
  display: flex;
  gap: 10px;
  flex: none;
}
.ex-load {
  text-align: center;
  b {
    display: block;
    font-family: var(--font-display);
    font-size: 15px;
    color: var(--text);
  }
  small {
    font-size: 9px;
    color: var(--dim);
    text-transform: uppercase;
  }
}
.ex-pdc {
  font-size: 12px;
  color: var(--dim);
}
.hint {
  color: var(--dim);
  font-size: 12px;
  margin-top: 10px;
  text-align: center;
}

/* Volume hebdo vs cible : la valeur "done/target" se teinte selon l'état. */
.grp-val.vs-low b {
  color: #ff6a45;
}
.grp-val.vs-high b {
  color: #ffb23f;
}
.hint-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.vs-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  vertical-align: middle;
}
.vs-dot.low {
  background: #ff6a45;
}
.vs-dot.ok {
  background: var(--accent);
}
.vs-dot.high {
  background: #ffb23f;
}

/* Tendance : volume par semaine (barres). */
.wk-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 120px;
  padding: 8px 10px 0;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
}
.wk-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
}
.wk-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: color-mix(in srgb, var(--accent) 40%, transparent);
  transition: height 0.3s;
}
.wk-bar.cur {
  background: var(--accent);
}
.wk-x {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--dim);
}
</style>
