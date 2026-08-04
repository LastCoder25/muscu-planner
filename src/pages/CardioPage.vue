<template>
  <q-page class="cardio-page">
    <h1 class="page-title font-display">Cardio</h1>
    <p class="page-sub text-dim">Marche, rando, course, trail, vélo…</p>

    <div class="seg">
      <button class="seg-b" :class="{ on: tab === 'log' }" @click="tab = 'log'">
        <q-icon name="edit_note" size="18px" /> Enregistrer
      </button>
      <button class="seg-b" :class="{ on: tab === 'hist' }" @click="tab = 'hist'">
        <q-icon name="history" size="18px" /> Historique
      </button>
    </div>

    <!-- Enregistrer une sortie -->
    <section v-show="tab === 'log'" class="card">
      <div class="card-head">
        <q-icon name="edit_note" size="22px" />
        <div class="card-title">Enregistrer une sortie</div>
      </div>

      <div class="section-lbl">Activité</div>
      <div class="chips">
        <button
          v-for="a in CARDIO_ACTIVITIES"
          :key="a.id"
          class="chip"
          :class="{ on: activity === a.id }"
          @click="activity = a.id"
        >
          <q-icon :name="a.icon" size="16px" />{{ a.label }}
        </button>
      </div>

      <div class="fields">
        <q-input v-model="date" type="date" filled label="Date" />
        <q-input v-model.number="distance" type="number" filled label="Distance (km)" step="0.1" />
        <q-input v-model.number="duration" type="number" filled label="Durée (min)" />
        <div v-if="hasElevation" class="fields-row">
          <q-input v-model.number="dplus" type="number" filled label="D+ (m)" />
          <q-input v-model.number="dminus" type="number" filled label="D- (m)" />
        </div>
      </div>

      <!-- Métriques calculées -->
      <div v-if="pace || speed" class="metrics">
        <div class="metric">
          <div class="m-v font-display">{{ pace ?? '—' }}</div>
          <div class="m-l">allure moy.</div>
        </div>
        <div class="metric">
          <div class="m-v font-display">{{ speed != null ? speed + ' km/h' : '—' }}</div>
          <div class="m-l">vitesse moy.</div>
        </div>
        <template v-if="hasDeniv">
          <div class="metric eff">
            <div class="m-v font-display">{{ ePace ?? '—' }}</div>
            <div class="m-l">allure d'effort</div>
          </div>
          <div class="metric eff">
            <div class="m-v font-display">{{ eSpeed != null ? eSpeed + ' km/h' : '—' }}</div>
            <div class="m-l">vitesse d'effort</div>
          </div>
        </template>
      </div>
      <p v-if="hasDeniv" class="eff-note">
        Effort = distance + (D+ + D-)/100 (100 m de dénivelé ≈ 1 km à plat).
      </p>

      <div class="section-lbl">Ressenti</div>
      <div class="rate-btns">
        <button
          v-for="n in 4"
          :key="n"
          class="rate-b"
          :class="{ on: rpe === n }"
          :style="{ '--c': `var(--d${n})` }"
          @click="rpe = n as Difficulty"
        >
          {{ n }}
        </button>
      </div>

      <q-input
        v-model="comment"
        type="textarea"
        autogrow
        filled
        label="Commentaire"
        class="q-mt-sm"
      />

      <q-btn
        class="save full-width"
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="check"
        label="Enregistrer"
        :loading="saving"
        @click="save"
      />
    </section>

    <!-- Historique -->
    <div v-if="tab === 'hist' && !cardio.logs.length" class="empty">
      Aucune sortie enregistrée pour l'instant.
    </div>
    <section v-if="tab === 'hist' && cardio.logs.length" class="card">
      <div class="card-head">
        <q-icon name="history" size="22px" />
        <div class="card-title">Mes sorties</div>
      </div>
      <div v-for="l in cardio.logs" :key="l.id" class="log-row">
        <q-icon :name="ACTIVITY_ICONS[l.payload.activity]" size="20px" class="log-ic" />
        <div class="log-main">
          <div class="log-name">{{ ACTIVITY_LABELS[l.payload.activity] }}</div>
          <div class="log-meta">
            {{ fmtDate(l.performed_at) }}
            <template v-if="l.payload.distance_km"> · {{ l.payload.distance_km }} km</template>
            <template v-if="l.payload.duration_min"> · {{ l.payload.duration_min }} min</template>
            <template v-if="l.payload.elevation_m"> · +{{ l.payload.elevation_m }} m</template>
            <template v-if="l.payload.descent_m"> · −{{ l.payload.descent_m }} m</template>
          </div>
          <div class="log-pace">
            <span v-if="paceOf(l.payload)">🏃 {{ paceOf(l.payload) }}</span>
            <span v-if="effortPaceOf(l.payload)">⛰ {{ effortPaceOf(l.payload) }} (effort)</span>
          </div>
        </div>
        <button class="log-del" aria-label="Supprimer" @click="remove(l.id)">
          <q-icon name="delete_outline" size="18px" />
        </button>
      </div>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import {
  CARDIO_ACTIVITIES,
  ACTIVITY_LABELS,
  ACTIVITY_ICONS,
  activityHasElevation,
  paceLabel,
  speedKmh,
  effortPace,
  effortSpeedKmh,
} from '@/data/cardio';
import type { CardioActivity, Difficulty, CardioLog } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

const $q = useQuasar();
const auth = useAuthStore();
const cardio = useCardioStore();
const challenges = useChallengesStore();

const tab = ref<'log' | 'hist'>('log');

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// performed_at = date choisie + heure courante (ordre correct dans la journée).
function performedAtIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map((n) => Number(n) || 0);
  const now = new Date();
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1, now.getHours(), now.getMinutes(), now.getSeconds());
  return dt.toISOString();
}

const activity = ref<CardioActivity>('course');
const date = ref(todayIso());
const distance = ref<number | null>(null);
const duration = ref<number | null>(null);
const dplus = ref<number | null>(null);
const dminus = ref<number | null>(null);
const rpe = ref<Difficulty | null>(null);
const comment = ref('');
const saving = ref(false);

const hasElevation = computed(() => activityHasElevation(activity.value));
const hasDeniv = computed(() => !!(dplus.value || dminus.value));

const pace = computed(() => paceLabel(distance.value ?? undefined, duration.value ?? undefined));
const speed = computed(() => speedKmh(distance.value ?? undefined, duration.value ?? undefined));
const ePace = computed(() =>
  effortPace(
    distance.value ?? undefined,
    duration.value ?? undefined,
    dplus.value ?? undefined,
    dminus.value ?? undefined,
  ),
);
const eSpeed = computed(() =>
  effortSpeedKmh(
    distance.value ?? undefined,
    duration.value ?? undefined,
    dplus.value ?? undefined,
    dminus.value ?? undefined,
  ),
);

const paceOf = (l: CardioLog) => paceLabel(l.distance_km, l.duration_min);
const effortPaceOf = (l: CardioLog) =>
  l.elevation_m || l.descent_m
    ? effortPace(l.distance_km, l.duration_min, l.elevation_m, l.descent_m)
    : null;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

onMounted(() => {
  cardio.fetchLogs().catch(() => undefined);
});

async function save() {
  const userId = auth.user?.id;
  if (!userId) return;
  if (!distance.value && !duration.value) {
    $q.notify({ type: 'warning', message: 'Renseigne une distance ou une durée.' });
    return;
  }
  saving.value = true;
  try {
    const log: CardioLog = {
      schema_version: SCHEMA_VERSION,
      type: 'cardio_log',
      id: crypto.randomUUID(),
      activity: activity.value,
      performed_at: performedAtIso(date.value),
      ...(distance.value ? { distance_km: distance.value } : {}),
      ...(duration.value ? { duration_min: duration.value } : {}),
      ...(dplus.value && hasElevation.value ? { elevation_m: dplus.value } : {}),
      ...(dminus.value && hasElevation.value ? { descent_m: dminus.value } : {}),
      ...(rpe.value ? { rpe: rpe.value } : {}),
      ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
    };
    await cardio.addLog(userId, log);
    $q.notify({ type: 'positive', message: 'Sortie enregistrée.' });
    // Reporte la sortie sur les défis cardio actifs (marche/course/vélo).
    try {
      const fed = await challenges.applyCardioLog({
        date: date.value,
        activity: activity.value,
        ...(distance.value ? { distanceKm: distance.value } : {}),
        ...(duration.value ? { durationMin: duration.value } : {}),
      });
      if (fed.length) {
        $q.notify({ type: 'positive', message: `Compté pour ton défi : ${fed.join(', ')}.` });
      }
    } catch {
      /* silencieux : la sortie est déjà enregistrée */
    }
    date.value = todayIso();
    distance.value = null;
    duration.value = null;
    dplus.value = null;
    dminus.value = null;
    rpe.value = null;
    comment.value = '';
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Enregistrement impossible.',
    });
  } finally {
    saving.value = false;
  }
}

function remove(id: string) {
  $q.dialog({
    title: 'Supprimer la sortie',
    message: 'Cette sortie sera supprimée. Continuer ?',
    cancel: { label: 'Retour', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void cardio
      .remove(id)
      .then(() => $q.notify({ type: 'positive', message: 'Sortie supprimée.' }));
  });
}
</script>

<style scoped lang="scss">
.cardio-page {
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
.seg {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 16px;
}
.seg-b {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.seg-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}
.empty {
  color: var(--dim);
  padding: 24px 4px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.card-head .q-icon {
  color: var(--accent);
}
.card-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  color: var(--text);
}
.section-lbl {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 14px 0 8px;
}
.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.fields-row {
  display: flex;
  gap: 10px;
}
.fields-row .q-input {
  flex: 1;
}
.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.metric {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px;
  text-align: center;
}
.metric.eff {
  border-color: var(--accent);
}
.m-v {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
}
.m-l {
  font-size: 11px;
  color: var(--dim);
  margin-top: 2px;
}
.eff-note {
  font-size: 11px;
  color: var(--dim);
  margin: 8px 0 0;
}
.rate-btns {
  display: flex;
  gap: 10px;
}
.rate-b {
  flex: 1;
  height: 46px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}
.rate-b.on {
  border-color: var(--c);
  background: var(--c);
  color: #15120e;
}
.save {
  border-radius: 12px;
  margin-top: 16px;
}
.log-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.log-ic {
  color: var(--accent);
  margin-top: 2px;
}
.log-main {
  flex: 1;
}
.log-name {
  font-weight: 600;
  color: var(--text);
}
.log-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.log-pace {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--accent);
  margin-top: 3px;
}
.log-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
</style>
