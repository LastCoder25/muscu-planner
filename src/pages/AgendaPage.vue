<template>
  <q-page class="agenda-page">
    <h1 class="page-title font-display">Agenda</h1>
    <p class="page-sub text-dim">{{ weekLabel }} · {{ total }} séance{{ total > 1 ? 's' : '' }}</p>

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
        <div v-for="(e, i) in d.entries" :key="i" class="entry" :class="'k-' + e.kind">
          <q-icon :name="e.icon" size="20px" class="entry-ic" />
          <div class="entry-main">
            <div class="entry-title">{{ e.title }}</div>
            <div v-if="e.meta" class="entry-meta">{{ e.meta }}</div>
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
import { ACTIVITY_LABELS, ACTIVITY_ICONS, paceLabel } from '@/data/cardio';

const logs = useLogsStore();
const tennis = useTennisStore();
const cardio = useCardioStore();
const loading = ref(true);

interface Entry {
  ts: number;
  kind: 'muscu' | 'tennis' | 'cardio';
  icon: string;
  title: string;
  meta: string;
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
const monday = new Date(now);
monday.setHours(0, 0, 0, 0);
monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
const weekStart = monday.getTime();
const weekEnd = weekStart + 7 * 86400000;

const weekLabel = computed(() => {
  const end = new Date(weekStart + 6 * 86400000);
  const f = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return `${f(monday)} – ${f(end)}`;
});

const entries = computed<Entry[]>(() => {
  const out: Entry[] = [];
  for (const r of logs.all) {
    const exos = r.payload.exercises?.length ?? 0;
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'muscu',
      icon: 'fitness_center',
      title: r.payload.name || 'Séance',
      meta: r.payload.duration_min ? fmtDur(r.payload.duration_min) : `${exos} exos`,
    });
  }
  for (const r of tennis.logs) {
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'tennis',
      icon: 'sports_tennis',
      title: r.payload.name || 'Tennis',
      meta: fmtDur(r.payload.duration_min),
    });
  }
  for (const r of cardio.logs) {
    const p = r.payload;
    const bits = [
      p.distance_km ? `${p.distance_km} km` : '',
      fmtDur(p.duration_min),
      paceLabel(p.distance_km, p.duration_min) ?? '',
    ].filter(Boolean);
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'cardio',
      icon: ACTIVITY_ICONS[p.activity] ?? 'directions_run',
      title: ACTIVITY_LABELS[p.activity] ?? 'Cardio',
      meta: bits.join(' · '),
    });
  }
  return out.filter((e) => e.ts >= weekStart && e.ts < weekEnd);
});

const total = computed(() => entries.value.length);

const days = computed(() => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + i * 86400000);
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
.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  margin-bottom: 6px;
  background: var(--surface);
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
</style>
