<template>
  <component :is="embedded ? 'div' : 'q-page'" class="cardio-page" :class="{ embedded }">
    <h1 class="page-title font-display">Cardio</h1>
    <p class="page-sub text-dim">Marche, rando, course, trail, vélo…</p>

    <div class="seg">
      <button class="seg-b" :class="{ on: tab === 'act' }" @click="tab = 'act'">
        <q-icon name="directions_run" size="18px" /> Activité
      </button>
      <button class="seg-b" :class="{ on: tab === 'hist' }" @click="tab = 'hist'">
        <q-icon name="history" size="18px" /> Historique
      </button>
    </div>

    <!-- Tuiles d'activité (comme Muscu) -->
    <div v-if="tab === 'act' && !action" class="tiles">
      <button class="tile" @click="action = 'log'">
        <q-icon name="edit_note" size="30px" />
        <span>Enregistrer une sortie</span>
        <small>Marche, course, vélo…</small>
      </button>
    </div>

    <button v-if="tab === 'act' && action" class="back-b" @click="action = null">
      <q-icon name="arrow_back" size="18px" /> Retour
    </button>

    <!-- Enregistrer une sortie -->
    <section v-show="tab === 'act' && action === 'log'" class="card">
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
        <q-input v-if="hasSteps" v-model.number="steps" type="number" filled label="Pas" />
        <q-input
          v-model.number="load"
          type="number"
          filled
          label="Charge portée (kg)"
          hint="Veste/sac lesté — valorise le poids (+3 %/kg)"
        />
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
    <div v-if="tab === 'hist' && !filteredLogs.length" class="empty">
      {{
        activityFilter
          ? 'Aucune sortie pour cette activité.'
          : "Aucune sortie enregistrée pour l'instant."
      }}
    </div>
    <section v-if="tab === 'hist' && filteredLogs.length" class="card">
      <div class="card-head">
        <q-icon name="history" size="22px" />
        <div class="card-title">Mes sorties</div>
      </div>
      <div v-if="activityFilter" class="filter-banner">
        <span
          >Filtre : <b>{{ ACTIVITY_LABELS[activityFilter] }}</b></span
        >
        <button class="filter-clear" @click="clearActivityFilter">Tout voir ✕</button>
      </div>
      <div v-for="l in filteredLogs" :key="l.id" class="log-row">
        <q-icon :name="ACTIVITY_ICONS[l.payload.activity]" size="20px" class="log-ic" />
        <div class="log-main">
          <div class="log-name">{{ ACTIVITY_LABELS[l.payload.activity] }}</div>
          <div class="log-meta">
            {{ fmtDate(l.performed_at) }}
            <template v-if="l.payload.distance_km"> · {{ l.payload.distance_km }} km</template>
            <template v-if="l.payload.duration_min"> · {{ l.payload.duration_min }} min</template>
            <template v-if="l.payload.steps"> · {{ l.payload.steps }} pas</template>
            <template v-if="l.payload.load_kg"> · 🎒 {{ l.payload.load_kg }} kg</template>
            <template v-if="l.payload.elevation_m"> · +{{ l.payload.elevation_m }} m</template>
            <template v-if="l.payload.descent_m"> · −{{ l.payload.descent_m }} m</template>
          </div>
          <div class="log-pace">
            <span v-if="paceOf(l.payload)">🏃 {{ paceOf(l.payload) }}</span>
            <span v-if="effortPaceOf(l.payload)">⛰ {{ effortPaceOf(l.payload) }} (effort)</span>
            <span v-if="l.payload.challenge_id" class="log-mirror">↔ défi (0 XP)</span>
            <template v-else>
              <span class="log-xp">+{{ xpOf(l.payload) }} XP</span>
              <span class="log-en">+{{ xpOf(l.payload) }} ⚡</span>
            </template>
          </div>
        </div>
        <button class="log-del" aria-label="Supprimer" @click="remove(l.id)">
          <q-icon name="delete_outline" size="18px" />
        </button>
      </div>
    </section>
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import { useProgress } from '@/composables/useProgress';
import { useXpFx } from '@/composables/useXpFx';
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
import { cardioSessionXp } from '@/lib/athlete';
import { recordsBeaten, type SportEntry } from '@/lib/sportAchievements';

const $q = useQuasar();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const cardio = useCardioStore();
const challenges = useChallengesStore();
const progress = useProgress();
const xpFx = useXpFx();

const tab = ref<'act' | 'hist'>(route.query.tab === 'hist' ? 'hist' : 'act');
// ?new=1 (depuis le sélecteur de saisie) → ouvre directement le formulaire de sortie.
const action = ref<'log' | null>(route.query.new ? 'log' : null);

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

// Activité pré-sélectionnée si fournie (?activity=marche depuis la tuile d'accueil).
const ACTIVITY_IDS = CARDIO_ACTIVITIES.map((a) => a.id);
const queryActivity = route.query.activity as CardioActivity | undefined;
const activity = ref<CardioActivity>(
  queryActivity && ACTIVITY_IDS.includes(queryActivity) ? queryActivity : 'course',
);
const date = ref(todayIso());
const distance = ref<number | null>(null);
const duration = ref<number | null>(null);
const steps = ref<number | null>(null);
const load = ref<number | null>(null);
const dplus = ref<number | null>(null);
const dminus = ref<number | null>(null);
const rpe = ref<Difficulty | null>(null);
const comment = ref('');
const saving = ref(false);

const hasElevation = computed(() => activityHasElevation(activity.value));
// Les pas sont pertinents à pied (pas à vélo).
const hasSteps = computed(() => activity.value !== 'velo' && activity.value !== 'velo_appart');
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
const xpOf = (l: CardioLog) => cardioSessionXp(l);

// Filtre par activité (arrive depuis une tuile d'accueil cardio:<activity>).
const activityFilter = computed(() => (route.query.activity as CardioActivity | undefined) || null);
const filteredLogs = computed(() => {
  // Pas les sorties « miroir » d'un défi (doublon : les défis ont leur écran dédié).
  const base = cardio.logs.filter((l) => !l.payload.challenge_id);
  return activityFilter.value
    ? base.filter((l) => l.payload.activity === activityFilter.value)
    : base;
});
function clearActivityFilter() {
  void router.replace({ query: { tab: 'hist' } });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

onMounted(() => {
  cardio.fetchLogs().catch(() => undefined);
});

async function save() {
  const userId = auth.user?.id;
  if (!userId) return;
  if (!distance.value && !duration.value && !(hasSteps.value && steps.value)) {
    $q.notify({ type: 'warning', message: 'Renseigne une durée, une distance ou des pas.' });
    return;
  }
  saving.value = true;
  // Snapshot XP AVANT (cardio + global) pour l'animation de progression.
  const beforeC = progress.cardio.value;
  const beforeG = progress.global.value;
  try {
    const log: CardioLog = {
      schema_version: SCHEMA_VERSION,
      type: 'cardio_log',
      id: crypto.randomUUID(),
      activity: activity.value,
      performed_at: performedAtIso(date.value),
      ...(distance.value ? { distance_km: distance.value } : {}),
      ...(duration.value ? { duration_min: duration.value } : {}),
      ...(steps.value && hasSteps.value ? { steps: steps.value } : {}),
      ...(load.value ? { load_kg: load.value } : {}),
      ...(dplus.value && hasElevation.value ? { elevation_m: dplus.value } : {}),
      ...(dminus.value && hasElevation.value ? { descent_m: dminus.value } : {}),
      ...(rpe.value ? { rpe: rpe.value } : {}),
      ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
    };
    // Détection de RECORD (avant ajout : on compare aux sorties précédentes de l'activité).
    const toEntry = (l: CardioLog): SportEntry => ({
      sport: l.activity,
      category: 'cardio',
      hasDistance: true,
      date: (l.performed_at || '').slice(0, 10),
      durationMin: l.duration_min || 0,
      distanceKm: l.distance_km || 0,
      dPlus: l.elevation_m || 0,
      tonnage: 0,
    });
    const prevSame = cardio.logs
      .filter((r) => r.payload.activity === activity.value && !r.payload.challenge_id)
      .map((r) => toEntry(r.payload));
    const records = recordsBeaten(prevSame, toEntry(log));

    await cardio.addLog(userId, log);
    $q.notify({ type: 'positive', message: 'Sortie enregistrée.' });
    if (records.length) {
      const lbl = { duration: 'durée', distance: 'distance', dplus: 'D+' };
      $q.notify({
        type: 'positive',
        icon: 'emoji_events',
        message: `🏅 Nouveau record ${records.map((r) => lbl[r]).join(' & ')} ! Voir les trophées`,
        actions: [
          { label: 'Trophées', color: 'white', handler: () => void router.push('/trophies') },
        ],
        timeout: 4000,
      });
    }
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
    // Animation d'XP gagnée (cercle Cardio + cercle Global, progression avant→après).
    await nextTick();
    xpFx.show([
      {
        emoji: '🏃',
        label: 'Cardio',
        fromLevel: beforeC.level,
        fromPct: beforeC.progressPct,
        toLevel: progress.cardio.value.level,
        toPct: progress.cardio.value.progressPct,
      },
      {
        emoji: '🌍',
        label: 'Global',
        fromLevel: beforeG.level,
        fromPct: beforeG.progressPct,
        toLevel: progress.global.value.level,
        toPct: progress.global.value.progressPct,
      },
    ]);
    date.value = todayIso();
    distance.value = null;
    duration.value = null;
    steps.value = null;
    load.value = null;
    dplus.value = null;
    dminus.value = null;
    rpe.value = null;
    comment.value = '';
    // Sortie enregistrée → retour à l'accueil (l'animation d'XP est un overlay global, elle
    // continue par-dessus). Le joueur revient à son tableau de bord après la saisie.
    void router.push('/');
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
    void (async () => {
      // Retire la contribution de cette sortie aux défis cardio qu'elle alimentait
      // (une sortie MIROIR d'un défi n'a rien alimenté → on ne soustrait pas).
      const row = cardio.logs.find((l) => l.id === id);
      const p = row?.payload;
      const isMirror = !!p?.challenge_id;
      await cardio.remove(id);
      if (p && !isMirror) {
        await challenges
          .removeCardioLog({
            date: (p.performed_at ?? '').slice(0, 10),
            activity: p.activity,
            distanceKm: p.distance_km ?? undefined,
            durationMin: p.duration_min ?? undefined,
          })
          .catch(() => undefined);
      }
      $q.notify({ type: 'positive', message: 'Sortie supprimée.' });
    })();
  });
}
</script>

<style scoped lang="scss">
.cardio-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.cardio-page.embedded {
  min-height: 0;
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
.tiles {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 96px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.08s;
}
.tile .q-icon {
  color: var(--accent);
}
.tile small {
  font-family: var(--font-body, inherit);
  font-weight: 400;
  font-size: 12px;
  color: var(--dim);
}
.tile:active {
  transform: scale(0.98);
}
.back-b {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 0;
  margin-bottom: 12px;
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
.log-xp {
  font-weight: 700;
}
.log-en {
  font-weight: 700;
  color: var(--text);
  opacity: 0.75;
}
.filter-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.filter-clear {
  border: none;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.log-mirror {
  color: var(--dim);
}
.log-del {
  background: none;
  border: none;
  color: var(--d4);
  cursor: pointer;
  padding: 4px;
}
</style>
