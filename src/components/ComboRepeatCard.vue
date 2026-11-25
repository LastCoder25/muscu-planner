<template>
  <!-- 🔁 Relancer le dernier Défi 360 à l'identique (v1.357.0 ; demandé : « pour ceux qui font
       toujours le même 360 : relancer directement le dernier, en choisissant la date de début »).
       Les mêmes repères de départ que la création (aujourd'hui / demain / lundi) et la même date
       libre. Présentationnel : l'écran crée le défi (`launch`). -->
  <section class="rep-card" data-test="repeat-card">
    <div class="rep-head">
      <span class="rep-ico" aria-hidden="true">🔁</span>
      <div class="rep-htxt">
        <div class="rep-title">Relancer comme la dernière fois</div>
        <div class="rep-sub">Ton dernier Défi 360 : {{ whenTxt }}</div>
      </div>
    </div>

    <div class="rep-chips">
      <span class="rep-chip" data-test="repeat-exos"
        >{{ summary.exos }} exo{{ summary.exos > 1 ? 's' : '' }}</span
      >
      <span class="rep-chip">{{ summary.groups }} groupe{{ summary.groups > 1 ? 's' : '' }}</span>
      <span class="rep-chip">{{ summary.days }} jours</span>
    </div>
    <div class="rep-names">
      <span v-for="(n, i) in shownNames" :key="i" class="rep-name">{{ n }}</span>
      <span v-if="hiddenCount > 0" class="rep-name more">+{{ hiddenCount }}</span>
    </div>

    <div class="rep-lab">Départ</div>
    <div class="rep-start">
      <button
        v-for="o in startChoices"
        :key="o.id"
        type="button"
        class="rep-tile"
        :class="{ on: startDate === o.date }"
        :aria-pressed="startDate === o.date"
        @click="pick(o.date)"
      >
        {{ o.label }}
      </button>
      <input
        class="rep-date"
        type="date"
        aria-label="Autre date de départ"
        :value="startDate"
        :min="today"
        :max="startMax"
        @change="pick(($event.target as HTMLInputElement).value)"
      />
    </div>
    <div v-if="startDate !== today" class="rep-note">
      📅 Il démarrera <b>{{ startTxt }}</b
      >.
    </div>

    <p v-if="blocked" class="rep-blocked" role="alert" data-test="repeat-blocked">
      ⚠️ {{ blocked }}
    </p>
    <button
      type="button"
      class="rep-go"
      data-test="repeat-go"
      :disabled="!!blocked || busy"
      @click="emit('launch', startDate)"
    >
      {{ busy ? 'Lancement…' : 'Relancer tel quel' }}
    </button>
    <!-- ✏️ Même défi, mais on repasse par le bilan (exos, volume, répartition) avant de lancer. -->
    <button
      type="button"
      class="rep-adjust"
      data-test="repeat-adjust"
      :disabled="busy"
      @click="emit('adjust', startDate)"
    >
      ✏️ Ajuster avant
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ComboChallenge } from '@/lib/combo';
import { repeatSummary } from '@/lib/comboRepeat';
import { logicalToday } from '@/lib/challenges';
import {
  START_MAX_AHEAD_DAYS,
  addDaysUtcIso,
  dateRangeLabel,
  isStartAllowed,
  startLabel,
  startOptions,
} from '@/lib/startDate';

const props = defineProps<{
  last: ComboChallenge;
  /** Raison qui empêche de relancer (exo pris par un challenge), ou null. */
  blocked?: string | null;
  busy?: boolean;
}>();
const emit = defineEmits<{ launch: [startDate: string]; adjust: [startDate: string] }>();

const MAX_NAMES = 6;
const today = logicalToday();
const startMax = addDaysUtcIso(today, START_MAX_AHEAD_DAYS);
const startDate = ref(today);
const startChoices = computed(() => startOptions(today));
const startTxt = computed(() => startLabel(startDate.value, today));
const summary = computed(() => repeatSummary(props.last));
const whenTxt = computed(() => dateRangeLabel(props.last.start_date, props.last.duration_days));
const shownNames = computed(() => summary.value.names.slice(0, MAX_NAMES));
const hiddenCount = computed(() => Math.max(0, summary.value.names.length - MAX_NAMES));

function pick(d: string): void {
  if (isStartAllowed(d, today)) startDate.value = d;
}
</script>

<style scoped lang="scss">
.rep-card {
  width: 100%;
  text-align: left;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rep-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rep-ico {
  font-size: 24px;
}
.rep-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--text);
}
.rep-sub {
  font-size: 12px;
  color: var(--dim);
}
.rep-chips,
.rep-names,
.rep-start {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rep-chip {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--accent-ink);
  background: var(--accent);
}
.rep-name {
  font-size: 11.5px;
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--dim);
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rep-lab {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
}
.rep-tile,
.rep-date {
  min-height: 44px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  border-radius: 10px;
}
.rep-tile {
  cursor: pointer;
}
.rep-tile.on {
  color: var(--accent-ink);
  background: var(--accent);
  border-color: var(--accent);
}
.rep-date {
  min-width: 0;
  max-width: 100%;
  color-scheme: dark;
}
.rep-note {
  font-size: 12.5px;
  color: var(--dim);
}
.rep-blocked {
  margin: 0;
  font-size: 13px;
  color: var(--d4);
}
.rep-go {
  min-height: 48px;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  color: var(--accent-ink);
  background: var(--accent);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}
.rep-adjust {
  min-height: 48px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  cursor: pointer;
}
.rep-adjust:disabled {
  opacity: 0.45;
  cursor: default;
}
.rep-go:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
