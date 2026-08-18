<template>
  <q-page class="agenda-page">
    <h1 class="page-title font-display">Agenda</h1>
    <div class="week-nav">
      <button class="wk-btn" aria-label="Semaine précédente" @click="weekOffset--">‹</button>
      <div class="wk-mid">
        <div class="wk-label">{{ weekOffset === 0 ? 'Cette semaine' : weekLabel }}</div>
        <div class="wk-sub text-dim">{{ total }} activité{{ total > 1 ? 's' : '' }}</div>
      </div>
      <button
        class="wk-btn"
        aria-label="Semaine suivante"
        :disabled="weekOffset >= 0"
        @click="weekOffset++"
      >
        ›
      </button>
    </div>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <div v-for="d in days" :key="d.iso" class="day" :class="{ today: d.iso === todayIso }">
        <div class="day-head">
          <span class="day-name">{{ d.label }}</span>
          <span v-if="d.iso === todayIso" class="day-today">aujourd'hui</span>
        </div>
        <div v-if="!d.entries.length" class="day-empty">—</div>
        <div v-else class="day-entries">
          <div v-for="(e, i) in d.entries" :key="i" class="entry" :class="'k-' + e.kind">
            <q-icon :name="e.icon" size="20px" class="entry-ic" />
            <div class="entry-main">
              <div class="entry-title">{{ e.title }}</div>
              <div v-if="e.meta" class="entry-meta">{{ e.meta }}</div>
              <div v-if="e.xp > 0" class="entry-gain">
                <span class="eg-xp">+{{ e.xp }} XP</span>
                <span v-if="e.energy > 0" class="eg-en">+{{ e.energy }} ⚡</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useTennisStore } from '@/stores/tennis';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import { challengeDayXp } from '@/lib/challenges';
import {
  sessionXp,
  otherSportXp,
  cardioSessionXp,
  drillSessionXp,
  estimateKm,
} from '@/lib/athlete';
import { ACTIVITY_LABELS, ACTIVITY_ICONS, paceLabel, isCardioOutingChallenge } from '@/data/cardio';

// Disciplines « spécifiques » (tennis/prépa…) : comptent leur XP mais N'alimentent
// PAS l'énergie d'aventure (fond = muscu + cardio + autre sport uniquement).
const SPECIFIQUE_DISC = new Set(['crossfit', 'hyrox', 'mobilite', 'prepa_physique']);

const logs = useLogsStore();
const tennis = useTennisStore();
const cardio = useCardioStore();
const challenges = useChallengesStore();
const loading = ref(true);

interface Entry {
  ts: number;
  kind: 'muscu' | 'tennis' | 'cardio' | 'challenge';
  icon: string;
  title: string;
  meta: string;
  xp: number; // XP gagnée par l'activité
  energy: number; // énergie d'aventure gagnée (= XP si activité de fond, 0 sinon)
}

function fmtDur(min?: number): string {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} h`;
  return `${m} min`;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const now = new Date();
const todayIso = isoDay(now);
// Lundi de la semaine courante (00:00).
const baseMonday = new Date(now);
baseMonday.setHours(0, 0, 0, 0);
baseMonday.setDate(baseMonday.getDate() - ((now.getDay() + 6) % 7));

// Navigation d'historique : 0 = semaine en cours, négatif = semaines passées.
const weekOffset = ref(0);
const weekStart = computed(() => baseMonday.getTime() + weekOffset.value * 7 * 86400000);
const weekEnd = computed(() => weekStart.value + 7 * 86400000);

const weekLabel = computed(() => {
  const f = (t: number) =>
    new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return `${f(weekStart.value)} – ${f(weekStart.value + 6 * 86400000)}`;
});

const entries = computed<Entry[]>(() => {
  const out: Entry[] = [];
  for (const r of logs.all) {
    const exos = r.payload.exercises?.length ?? 0;
    const bits = [fmtDur(r.payload.duration_min), exos ? `${exos} exos` : ''].filter(Boolean);
    const disc = r.payload.discipline ?? 'musculation';
    const xp =
      disc === 'autre_sport'
        ? otherSportXp(r.payload.duration_min ?? 0, r.payload.name)
        : sessionXp(r.payload);
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'muscu',
      icon: 'fitness_center',
      title: r.payload.name || 'Séance',
      meta: bits.join(' · '),
      xp,
      energy: SPECIFIQUE_DISC.has(disc) ? 0 : xp, // spécifique = XP mais pas d'énergie
    });
  }
  for (const r of tennis.logs) {
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'tennis',
      icon: 'sports_tennis',
      title: r.payload.name || 'Tennis',
      meta: fmtDur(r.payload.duration_min),
      xp: drillSessionXp(r.payload),
      energy: 0, // tennis exclu de l'énergie d'aventure
    });
  }
  // DÉDUP anti-doublon : une sortie MIROIR (créée depuis un défi) ne s'affiche pas
  // s'il existe déjà une saisie MANUELLE du même jour+activité (elle la couvre), et
  // au plus UN miroir par (défi, jour). (Sinon marches en double dans l'agenda.)
  const dayOf = (iso: string) => iso.slice(0, 10);
  const manualDayAct = new Set(
    cardio.logs
      .filter((r) => !r.payload.challenge_id)
      .map((r) => `${r.payload.activity}|${dayOf(r.performed_at)}`),
  );
  const seenMirror = new Set<string>();
  for (const r of cardio.logs) {
    const p = r.payload;
    const day = dayOf(r.performed_at);
    // km affiché (arrondi ; à défaut de distance saisie, estimé depuis les pas).
    const km = estimateKm(p);
    if (p.challenge_id) {
      // Miroir SANS contenu réel (0 km ET 0 min) = artefact (jour auto-clos à target 0)
      // → jamais affiché (ticket 72996f3b : marche fantôme le lundi).
      if (!km && !(p.duration_min ?? 0)) continue;
      if (manualDayAct.has(`${p.activity}|${day}`)) continue; // couvert par une saisie manuelle
      const key = `${p.challenge_id}|${p.challenge_day ?? day}`;
      if (seenMirror.has(key)) continue; // déjà un miroir pour ce (défi, jour)
      seenMirror.add(key);
    }
    const bits = [
      km ? `${km.toFixed(1)} km` : '',
      fmtDur(p.duration_min),
      paceLabel(p.distance_km, p.duration_min) ?? '',
    ].filter(Boolean);
    const xp = p.challenge_id ? 0 : cardioSessionXp(p); // sortie miroir = 0 (déjà comptée par le défi)
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'cardio',
      icon: ACTIVITY_ICONS[p.activity] ?? 'directions_run',
      title: ACTIVITY_LABELS[p.activity] ?? 'Cardio',
      meta: bits.join(' · '),
      xp,
      energy: xp,
    });
  }
  // Reps de défis jour par jour, SAUF les vraies sorties cardio (marche/course/
  // vélo) déjà couvertes par les sorties miroir. Le conditionnement (jumping
  // jacks…) n'a pas de miroir → il reste affiché ici.
  for (const c of challenges.list) {
    if (isCardioOutingChallenge(c)) continue;
    const uLabel = c.unit === 'time' ? 'sec' : c.unit === 'distance' ? 'km' : 'reps';
    for (const p of c.progress) {
      if (!(p.done > 0)) continue;
      const [y, m, dd] = p.date.split('-').map(Number);
      const ts = new Date(y!, (m ?? 1) - 1, dd ?? 1, 12).getTime();
      const xp = challengeDayXp(c, p);
      // Détail par série si saisi (ex. « 10/9/11 reps ») ; sinon le total du jour.
      const setReps = (p.sets ?? []).map((s) => s.reps).filter((r) => r > 0);
      const meta =
        c.unit === 'reps' && setReps.length > 1
          ? `${setReps.join('/')} ${uLabel}`
          : `${p.done} ${uLabel}`;
      out.push({
        ts,
        kind: 'challenge',
        icon: 'emoji_events',
        title: c.exercise_name,
        meta,
        xp,
        energy: xp, // défis muscu/cardio → comptent dans le fond → énergie
      });
    }
  }
  return out.filter((e) => e.ts >= weekStart.value && e.ts < weekEnd.value);
});

const total = computed(() => entries.value.length);

const days = computed(() => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.value + i * 86400000);
    const iso = isoDay(d);
    const dayEntries = entries.value
      .filter((e) => isoDay(new Date(e.ts)) === iso)
      .sort((a, b) => a.ts - b.ts);
    return {
      iso,
      label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short' }),
      entries: dayEntries,
    };
  });
});

onMounted(async () => {
  try {
    await Promise.all([
      logs.fetchAll().catch(() => undefined),
      tennis.fetchLogs().catch(() => undefined),
      cardio.fetchLogs().catch(() => undefined),
      challenges.list.length ? Promise.resolve() : challenges.fetchMine().catch(() => undefined),
    ]);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.agenda-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 20px;
}
.text-dim {
  color: var(--dim);
}
.week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 20px;
}
.wk-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 22px;
  cursor: pointer;
}
.wk-btn:disabled {
  color: var(--dim);
  opacity: 0.4;
  cursor: not-allowed;
}
.wk-mid {
  flex: 1;
  text-align: center;
}
.wk-label {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}
.wk-sub {
  font-size: 12px;
}
.day {
  margin-bottom: 16px;
}
.day-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.day-name {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text);
  text-transform: capitalize;
}
.day.today .day-name {
  color: var(--accent);
}
.day-today {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--accent-ink);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 8px;
}
.day-empty {
  color: var(--dim);
  font-size: 13px;
  padding-left: 2px;
}
.day-entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
}
.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  background: var(--surface);
}
.entry.k-challenge {
  border-left-color: var(--d2, #c6d24a);
}
.entry-ic {
  color: var(--accent);
}
.entry-main {
  flex: 1;
  min-width: 0;
}
.entry-title {
  font-weight: 600;
  color: var(--text);
}
.entry-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.entry-gain {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: 12px;
  font-weight: 700;
}
.eg-xp {
  color: var(--accent);
}
.eg-en {
  color: var(--text);
  opacity: 0.75;
}
</style>
