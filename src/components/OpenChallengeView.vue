<template>
  <!-- 🔁 Fiche d'un défi DÉCOUVERTE : 7 jours, aucun objectif de reps. On tape « +1 » à chaque
       fois qu'on fait une rep ; à la fin, un bilan (et, si on veut, un défi classique pour la
       suite). Rien ici ne parle de retard, de « raté » ni d'objectif. -->
  <div class="ocv">
    <div class="ocv-tag">
      <span class="chip">🔁 Découverte</span>
      <span class="chip dim">{{ ch.duration_days }} jours · sans objectif · sans prime</span>
      <span v-if="ch.status === 'active'" class="chip day"
        >jour {{ dayNo }}/{{ ch.duration_days }}</span
      >
      <span v-else class="chip day done">terminé</span>
    </div>

    <div v-if="notStarted" class="note">
      📅 Démarre <b>{{ startTxt }}</b> — rien à faire d’ici là.
    </div>

    <!-- Tuiles du moment : toujours les mêmes, vivantes pendant le défi. -->
    <div v-if="ch.status !== 'done'" class="tiles">
      <div class="tile">
        <span class="tv font-display">{{ report.total }}</span
        ><span class="tl">reps au total</span>
      </div>
      <div class="tile">
        <span class="tv font-display">{{ report.activeDays }}/{{ ch.duration_days }}</span
        ><span class="tl">jours actifs</span>
      </div>
      <div class="tile">
        <span class="tv font-display">{{ report.bestDay?.reps ?? 0 }}</span
        ><span class="tl">meilleur jour</span>
      </div>
    </div>

    <!-- La semaine, jour par jour (tuiles). -->
    <div class="week" role="list" aria-label="Reps par jour">
      <div
        v-for="d in weekCells"
        :key="d.i"
        class="wd"
        :class="{ on: d.reps > 0, today: d.today, future: d.future }"
        role="listitem"
      >
        <span class="wd-l">{{ d.label }}</span>
        <span class="wd-v font-display">{{ d.future ? '·' : d.reps }}</span>
      </div>
    </div>

    <!-- EN COURS : la saisie. -->
    <template v-if="ch.status === 'active' && !notStarted">
      <FractionRow
        :name="ch.exercise_name"
        :reps="todayCount.reps"
        :takes="todayCount.takes"
        @add="add"
        @undo="undo"
      />
      <p class="hint">
        Une prise = une rep (ou deux, ou trois) quand tu en fais. Tes reps rapportent leur XP
        normale ; il n’y a ni objectif à tenir, ni prime à la fin.
      </p>
      <button v-if="report.total > 0" class="stop" @click="finishNow">
        Terminer maintenant et voir mon bilan
      </button>
    </template>

    <!-- BILAN : défi terminé. -->
    <template v-if="ch.status === 'done'">
      <div class="sec-h">Bilan de ta semaine</div>
      <div v-if="report.total === 0" class="note">Aucune rep notée cette semaine.</div>
      <template v-else>
        <div class="tiles four">
          <div class="tile">
            <span class="tv font-display">{{ report.total }}</span
            ><span class="tl">reps</span>
          </div>
          <div class="tile">
            <span class="tv font-display">{{ report.activeDays }}</span
            ><span class="tl">jours actifs sur {{ report.days }}</span>
          </div>
          <div class="tile">
            <span class="tv font-display">{{ report.avgPerActiveDay }}</span
            ><span class="tl">reps / jour actif</span>
          </div>
          <div class="tile">
            <span class="tv font-display">{{ report.takes }}</span
            ><span class="tl">prises</span>
          </div>
        </div>
        <div v-if="report.bestDay" class="chips">
          <span class="chip on">🏆 Meilleur jour : {{ report.bestDay.reps }} reps</span>
          <span class="chip">{{ dayLabel(report.bestDay.date) }}</span>
          <span v-if="xp > 0" class="chip">+{{ xp }} XP</span>
        </div>

        <div v-if="report.byHour" class="hours">
          <div class="hours-h">Quand tu les as faites</div>
          <div class="hbars" role="img" :aria-label="hoursSummary">
            <div v-for="(v, h) in report.byHour" :key="h" class="hb">
              <span
                class="hb-bar"
                :class="{ peak: h === peakHour }"
                :style="{ height: hPct(v) + '%' }"
              />
            </div>
          </div>
          <div class="hbars-x">
            <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span>
          </div>
          <div class="chips">
            <span class="chip on">⏰ Heure de pointe : {{ peakHour }} h</span>
            <span class="chip">{{ hoursSummary }}</span>
          </div>
        </div>

        <!-- La suite : jamais automatique, toujours refusable. -->
        <div class="next">
          <div class="next-t font-display">Et maintenant ?</div>
          <div class="next-s">
            Relève un défi : <b>{{ followUp }} reps</b> en 7 jours (ton total +10 %), à ton rythme.
            Tu pourras modifier le total avant de lancer.
          </div>
          <button class="next-cta" @click="goFollowUp">Relever un défi</button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import FractionRow from '@/components/FractionRow.vue';
import { useChallengesStore } from '@/stores/challenges';
import {
  addDaysIso,
  addFractionTake,
  challengeDayXp,
  fractionDay,
  logicalToday,
  openChallengeExpired,
  openChallengeReport,
  removeLastFractionTake,
  type Challenge,
} from '@/lib/challenges';
import { followUpTarget } from '@/lib/repsHabit';
import { startLabel } from '@/lib/startDate';

const props = defineProps<{ ch: Challenge }>();
const store = useChallengesStore();
const router = useRouter();
const $q = useQuasar();
const today = logicalToday();

const report = computed(() => openChallengeReport(props.ch));
const dayIdx = computed(() => {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${props.ch.start_date}T00:00:00Z`);
  return Math.round(ms / 86400000);
});
const notStarted = computed(() => dayIdx.value < 0);
const dayNo = computed(() => Math.min(props.ch.duration_days, Math.max(1, dayIdx.value + 1)));
const startTxt = computed(() => startLabel(props.ch.start_date, today));
const todayEntry = computed(() => props.ch.progress.find((p) => p.date === today));
const todayCount = computed(() => fractionDay(todayEntry.value));
const xp = computed(() => props.ch.progress.reduce((a, p) => a + challengeDayXp(props.ch, p), 0));
const followUp = computed(() => followUpTarget(report.value.total));

const DAY_L = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const weekCells = computed(() =>
  Array.from({ length: props.ch.duration_days }, (_, i) => {
    const date = addDaysIso(props.ch.start_date, i);
    return {
      i,
      label: DAY_L[new Date(`${date}T12:00:00`).getDay()]!,
      reps: props.ch.progress.find((p) => p.date === date)?.done ?? 0,
      today: date === today,
      future: date > today,
    };
  }),
);
function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const peakHour = computed(() => {
  const h = report.value.byHour;
  if (!h) return 0;
  return h.indexOf(Math.max(...h));
});
const maxHour = computed(() => Math.max(1, ...(report.value.byHour ?? [1])));
const hPct = (v: number) => (v > 0 ? Math.max(6, Math.round((v / maxHour.value) * 100)) : 0);
/** « matin 12 · après-midi 20 · soir 8 » : la même chose que le graphe, en mots. */
const hoursSummary = computed(() => {
  const h = report.value.byHour ?? [];
  const sum = (a: number, b: number) => h.slice(a, b).reduce((x, y) => x + y, 0);
  return `nuit ${sum(0, 6)} · matin ${sum(6, 12)} · après-midi ${sum(12, 18)} · soir ${sum(18, 24)}`;
});

/** La charge / l'assistance de la dernière prise ou série : on ne les retape pas. */
function template() {
  const last = props.ch.progress
    .flatMap((p) => p.sets ?? [])
    .filter((s) => !s.sec)
    .at(-1);
  return { weight: last?.weight ?? null, assisted: !!last?.assisted };
}
async function persist(next: Challenge['progress'], prev: Challenge['progress']) {
  const c = props.ch;
  c.progress = next; // tout de suite : un tap doit répondre sans attendre le réseau
  try {
    await store.updateProgress(c.id, next);
  } catch {
    c.progress = prev;
    $q.notify({ type: 'negative', message: 'Prise non enregistrée : réessaie.' });
  }
}
async function add(n: number) {
  const c = props.ch;
  if (c.status !== 'active' || notStarted.value) return;
  const next = addFractionTake(c, today, n, template(), new Date().toISOString());
  if (next) await persist(next, c.progress);
}
async function undo() {
  const c = props.ch;
  const next = removeLastFractionTake(c, today);
  if (next) await persist(next, c.progress);
}
function finishNow() {
  $q.dialog({
    title: 'Terminer maintenant ?',
    message: 'Le défi se clôt et tu vois ton bilan. Tes reps restent comptées.',
    cancel: { label: 'Continuer', flat: true },
    ok: { label: 'Terminer', color: 'primary' },
  }).onOk(() => void store.setStatus(props.ch.id, 'done'));
}
function goFollowUp() {
  void router.push({
    path: '/challenges/new',
    query: {
      ex: props.ch.exercise_id,
      fmt: 'cumulative',
      total: String(followUp.value),
      days: '7',
      frac: '1',
    },
  });
}

onMounted(() => {
  // Les 7 jours sont écoulés : le défi se clôt (statut « terminé », jamais « abandonné »).
  if (openChallengeExpired(props.ch, today)) void store.setStatus(props.ch.id, 'done');
});
</script>

<style scoped lang="scss">
.ocv {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px 40px;
}
.chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}
.chip.dim {
  color: var(--dim);
  font-weight: 500;
}
.chip.on,
.chip.day {
  border-color: var(--accent);
  color: var(--accent);
}
.chip.day.done {
  border-color: var(--d1);
  color: var(--d1);
}
.ocv-tag,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.note {
  font-size: 13px;
  color: var(--dim);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.tiles.four {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.tile {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 8px;
  text-align: center;
}
.tv {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
}
.tl {
  font-size: 11px;
  color: var(--dim);
}
.week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.wd {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  border-radius: 10px;
  border: 1px solid var(--line-soft);
  background: var(--surface);
  color: var(--dim);
}
.wd.on {
  border-color: var(--accent);
  color: var(--text);
}
.wd.today {
  border-color: var(--text);
}
.wd.future {
  opacity: 0.5;
}
.wd-l {
  font-size: 10px;
  text-transform: uppercase;
}
.wd-v {
  font-size: 16px;
  font-weight: 700;
}
.hint {
  font-size: 12px;
  color: var(--dim);
  margin: 0;
}
.stop {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--dim);
  font-size: 13px;
  cursor: pointer;
}
.sec-h {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  margin-top: 6px;
}
.hours-h {
  font-size: 12.5px;
  color: var(--dim);
  margin-bottom: 6px;
}
.hbars {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  align-items: end;
  gap: 2px;
  height: 64px;
}
.hb {
  height: 100%;
  display: flex;
  align-items: flex-end;
}
.hb-bar {
  display: block;
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
.hb-bar.peak {
  background: var(--accent);
}
.hbars-x {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--dim);
  margin: 2px 0 8px;
}
.next {
  margin-top: 6px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface);
}
.next-t {
  font-size: 16px;
  font-weight: 700;
}
.next-s {
  font-size: 13px;
  color: var(--dim);
  margin: 4px 0 10px;
}
.next-cta {
  min-height: 48px;
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #15120e;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}
</style>
