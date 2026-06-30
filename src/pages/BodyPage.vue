<template>
  <q-page class="body-page">
    <h1 class="p-title font-display">Suivi corporel</h1>

    <!-- Fréquence de saisie -->
    <section class="block">
      <div class="lbl">Fréquence de saisie</div>
      <div class="freq">
        <button v-for="f in FREQ" :key="f.value" class="choice small" :class="{ active: frequency === f.value }" @click="setFrequency(f.value)">{{ f.label }}</button>
      </div>
    </section>

    <!-- Rappel -->
    <div v-if="due" class="due">
      <q-icon name="event_available" size="20px" />
      <span>{{ entries.length ? 'C’est l’heure de ta saisie.' : 'Première saisie : note tes mesures de départ.' }}</span>
    </div>

    <!-- Nouvelle saisie -->
    <div class="grp">
      <button class="grp-head" :class="{ open: formOpen }" @click="formOpen = !formOpen">
        <q-icon name="add_circle_outline" size="20px" />
        <span class="grp-title">Nouvelle saisie</span>
        <q-icon class="chev" name="expand_more" size="22px" />
      </button>
      <div v-show="formOpen" class="grp-body">
        <div class="row-2">
          <q-input v-model.number="f.weight" type="number" inputmode="decimal" filled label="Poids (kg)" />
          <div class="sleep-row">
            <q-input v-model.number="f.sleepH" type="number" inputmode="numeric" min="0" filled label="Sommeil (h)" />
            <q-input v-model.number="f.sleepMin" type="number" inputmode="numeric" min="0" max="59" filled label="min" />
          </div>
        </div>
        <div class="row items-center justify-between q-mt-md">
          <div class="lbl" style="margin: 0">Circonférences (cm)</div>
          <button class="howto-toggle" @click="howtoOpen = !howtoOpen">{{ howtoOpen ? 'Masquer' : 'Comment mesurer ?' }}</button>
        </div>
        <div v-if="howtoOpen" class="howto">
          <div v-for="m in MEASURES" :key="m.key" class="howto-row"><b>{{ m.label }}</b> — {{ m.howto }}</div>
          <div class="howto-tip">Mesure toujours au même moment (le matin), du même côté, sans serrer le mètre.</div>
        </div>
        <div class="meas-grid q-mt-sm">
          <q-input v-for="m in MEASURES" :key="m.key" v-model.number="f.measures[m.key]" type="number" inputmode="decimal" filled dense :label="m.label" />
        </div>
        <q-input v-model="f.note" filled autogrow label="Note (optionnel)" class="q-mt-md" />
        <q-btn no-caps color="primary" text-color="dark" label="Enregistrer la saisie" class="full-width q-mt-md" :loading="saving" :disable="!hasInput" @click="save" />
      </div>
    </div>

    <div v-if="loading" class="column items-center q-mt-xl"><q-spinner color="primary" size="32px" /></div>

    <template v-else-if="entries.length">
      <!-- Dernières valeurs -->
      <section class="block">
        <div class="block-h">Dernières valeurs</div>
        <div class="cards">
          <div class="mcard">
            <div class="mc-k">Poids</div>
            <div class="mc-v">{{ fmt(weightStat.val) }}<small v-if="weightStat.val != null"> kg</small></div>
            <div v-if="weightStat.delta != null" class="mc-d" :class="deltaCls(weightStat.delta)">{{ signed(weightStat.delta) }} kg</div>
          </div>
          <div class="mcard">
            <div class="mc-k">Sommeil</div>
            <div class="mc-v">{{ fmtSleep(sleepStat.val) }}</div>
          </div>
          <div v-for="m in MEASURES" :key="m.key" class="mcard">
            <div class="mc-k">{{ m.label }}</div>
            <div class="mc-v">{{ fmt(measStat(m.key).val) }}<small v-if="measStat(m.key).val != null"> cm</small></div>
            <div v-if="measStat(m.key).delta != null" class="mc-d" :class="deltaCls(measStat(m.key).delta!)">{{ signed(measStat(m.key).delta!) }} cm</div>
          </div>
        </div>
      </section>

      <!-- Courbe du poids -->
      <section v-if="weightChart" class="block">
        <div class="block-h">Évolution du poids</div>
        <div class="chart">
          <svg :viewBox="`0 0 ${weightChart.W} ${weightChart.H}`" preserveAspectRatio="none" class="chart-svg">
            <polyline :points="weightChart.pts" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
          </svg>
          <div class="chart-meta">min <b>{{ weightChart.min }}</b> · max <b>{{ weightChart.max }}</b> · actuel <b>{{ weightChart.last }}</b> kg</div>
        </div>
      </section>

      <!-- Historique -->
      <section class="block">
        <div class="block-h">Historique</div>
        <div v-for="e in reversed" :key="e.id" class="hrow">
          <div class="h-date">{{ fmtDate(e.measured_at) }}</div>
          <div class="h-vals">
            <span v-if="e.weight_kg != null">{{ e.weight_kg }} kg</span>
            <span v-if="e.sleep_hours != null">{{ fmtSleep(e.sleep_hours) }}</span>
            <span v-if="measCount(e)" class="dim">{{ measCount(e) }} mesure{{ measCount(e) > 1 ? 's' : '' }}</span>
          </div>
          <q-btn flat round dense size="sm" icon="delete_outline" color="negative" aria-label="Supprimer" @click="del(e.id)" />
        </div>
      </section>
    </template>

    <div v-else-if="!loading" class="empty">Aucune saisie pour l’instant. Note ta première mesure ci-dessus.</div>
  </q-page>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useBodyStore, type BodyEntry } from '@/stores/body';

const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const body = useBodyStore();

const MEASURES = [
  { key: 'biceps', label: 'Biceps', howto: 'Bras fléchi et contracté, au point le plus large.' },
  { key: 'cuisse', label: 'Cuisse', howto: 'Debout, juste sous le pli fessier, au point le plus large.' },
  { key: 'taille', label: 'Taille', howto: 'Au plus étroit (niveau nombril), sans rentrer le ventre, fin d’expiration.' },
  { key: 'hanches', label: 'Hanches', howto: 'Au point le plus large des fesses/hanches, pieds joints.' },
  { key: 'poitrine', label: 'Poitrine', howto: 'À hauteur des mamelons, bras le long du corps, fin d’expiration.' },
  { key: 'mollet', label: 'Mollet', howto: 'Debout, poids réparti, au point le plus large du mollet.' },
  { key: 'avant_bras', label: 'Avant-bras', howto: 'Bras tendu et détendu, au point le plus large près du coude.' },
] as const;
type MeasureKey = (typeof MEASURES)[number]['key'];

const FREQ = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
] as const;
type Freq = (typeof FREQ)[number]['value'];

const loading = ref(true);
const saving = ref(false);
const formOpen = ref(true);
const howtoOpen = ref(false);
const entries = computed(() => body.entries);
const reversed = computed(() => entries.value.slice().reverse());

// ── Formulaire ──────────────────────────────────────────
interface FormState { weight: number | null; sleepH: number | null; sleepMin: number | null; measures: Record<string, number | null>; note: string }
const f = reactive<FormState>({
  weight: null,
  sleepH: null,
  sleepMin: null,
  measures: Object.fromEntries(MEASURES.map((m) => [m.key, null])),
  note: '',
});
const hasInput = computed(
  () => f.weight != null || f.sleepH != null || f.sleepMin != null || f.note.trim() !== '' || MEASURES.some((m) => f.measures[m.key] != null),
);
// Sommeil en heures décimales (h + min/60) pour le stockage.
function sleepToHours(): number | null {
  if (f.sleepH == null && f.sleepMin == null) return null;
  return +((f.sleepH ?? 0) + (f.sleepMin ?? 0) / 60).toFixed(2);
}

// ── Fréquence + rappel ──────────────────────────────────
const frequency = computed<Freq>(() => profileStore.profile?.preferences?.tracking_frequency ?? 'week');
async function setFrequency(value: Freq) {
  const p = profileStore.profile;
  const userId = auth.user?.id;
  if (!p || !userId || frequency.value === value) return;
  try {
    await profileStore.update(userId, { ...p, preferences: { ...(p.preferences ?? {}), tracking_frequency: value } });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  }
}
const due = computed(() => {
  const last = entries.value[entries.value.length - 1];
  if (!last) return true;
  const interval = frequency.value === 'day' ? 1 : frequency.value === 'week' ? 7 : 30;
  const days = Math.floor((Date.now() - new Date(last.measured_at).getTime()) / 86400000);
  return days >= interval;
});

// ── Stats (dernière valeur + delta vs précédente) ───────
function statFrom(vals: number[]): { val: number | null; delta: number | null } {
  if (vals.length === 0) return { val: null, delta: null };
  const val = vals[vals.length - 1]!;
  const delta = vals.length >= 2 ? +(val - vals[vals.length - 2]!).toFixed(1) : null;
  return { val, delta };
}
const weightStat = computed(() => statFrom(entries.value.map((e) => e.weight_kg).filter((v): v is number => v != null)));
const sleepStat = computed(() => statFrom(entries.value.map((e) => e.sleep_hours).filter((v): v is number => v != null)));
function measStat(key: MeasureKey) {
  return statFrom(entries.value.map((e) => e.measurements?.[key]).filter((v): v is number => v != null));
}

// ── Courbe du poids ─────────────────────────────────────
const weightChart = computed(() => {
  const s = entries.value.map((e) => e.weight_kg).filter((v): v is number => v != null);
  if (s.length < 2) return null;
  const min = Math.min(...s);
  const max = Math.max(...s);
  const range = max - min || 1;
  const W = 300;
  const H = 90;
  const pad = 6;
  const pts = s
    .map((v, i) => {
      const x = (i / (s.length - 1)) * (W - 2 * pad) + pad;
      const y = H - pad - ((v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return { pts, min, max, last: s[s.length - 1], W, H };
});

// ── Helpers d'affichage ─────────────────────────────────
function fmt(v: number | null) {
  return v == null ? '—' : String(v);
}
function signed(v: number) {
  return v > 0 ? `+${v}` : String(v);
}
function deltaCls(v: number) {
  return v > 0 ? 'up' : v < 0 ? 'down' : '';
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}
function measCount(e: BodyEntry) {
  return e.measurements ? Object.keys(e.measurements).length : 0;
}
// Heures décimales → « 7h30 ».
function fmtSleep(h: number | null) {
  if (h == null) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}

// ── Actions ─────────────────────────────────────────────
async function save() {
  if (!hasInput.value) return;
  saving.value = true;
  try {
    const measurements: Record<string, number> = {};
    for (const m of MEASURES) {
      const v = f.measures[m.key];
      if (v != null) measurements[m.key] = v;
    }
    await body.add({
      measured_at: new Date().toISOString().slice(0, 10),
      weight_kg: f.weight,
      sleep_hours: sleepToHours(),
      measurements: Object.keys(measurements).length ? measurements : null,
      note: f.note.trim() || null,
    });
    f.weight = null;
    f.sleepH = null;
    f.sleepMin = null;
    f.note = '';
    for (const m of MEASURES) f.measures[m.key] = null;
    formOpen.value = false;
    $q.notify({ type: 'positive', message: 'Saisie enregistrée 💪' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec de l’enregistrement.' });
  } finally {
    saving.value = false;
  }
}

function del(id: string) {
  $q.dialog({
    title: 'Supprimer la saisie',
    message: 'Cette saisie sera supprimée. Continuer ?',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    body.remove(id).catch((e: unknown) => $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' }));
  });
}

onMounted(async () => {
  const userId = auth.user?.id;
  try {
    if (userId && !profileStore.profile) await profileStore.fetch(userId);
    await body.fetchRecent();
    formOpen.value = due.value || entries.value.length === 0;
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Chargement impossible.' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.body-page { background: var(--bg); min-height: 100vh; padding: 20px 16px 40px; }
.p-title { font-size: 28px; font-weight: 700; color: var(--text); margin: 4px 0 18px; }
.block { margin-bottom: 24px; }
.block-h { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); margin-bottom: 12px; }
.lbl { font-size: 12px; color: var(--dim); margin-bottom: 8px; }

.freq { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.choice { width: 100%; min-height: 48px; background: var(--surface); border: 1.5px solid var(--line); border-radius: 12px; color: var(--text); font-family: var(--font-ui); font-size: 15px; cursor: pointer; &.active { border-color: var(--accent); background: var(--surface-2); } &.small { min-height: 44px; font-size: 14px; } }

.due { display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--accent); color: var(--text); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; font-size: 14px; }

.grp { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); margin-bottom: 18px; overflow: hidden; }
.grp-head { width: 100%; display: flex; align-items: center; gap: 12px; padding: 16px; cursor: pointer; background: none; border: none; color: var(--text); font-family: var(--font-display); font-size: 17px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
.grp-title { flex: 1; text-align: left; }
.chev { color: var(--dim); transition: transform 0.18s; }
.grp-head.open .chev { transform: rotate(180deg); }
.grp-body { padding: 6px 14px 14px; }

.row-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.sleep-row { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 8px; }
.howto-toggle { background: none; border: none; color: var(--accent); font-size: 12px; cursor: pointer; }
.howto { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 12px; margin-top: 8px; }
.howto-row { font-size: 12.5px; color: var(--dim); margin-bottom: 6px; b { color: var(--text); } }
.howto-tip { font-size: 12px; color: var(--accent); margin-top: 4px; }
.meas-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.mcard { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 10px 12px; }
.mc-k { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.4px; }
.mc-v { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--text); margin-top: 2px; small { font-size: 12px; color: var(--dim); } }
.mc-d { font-size: 12px; margin-top: 2px; color: var(--dim); &.up { color: var(--d3); } &.down { color: var(--d1); } }

.chart { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 14px; padding: 12px; }
.chart-svg { width: 100%; height: 90px; display: block; }
.chart-meta { color: var(--dim); font-size: 12px; margin-top: 8px; b { color: var(--text); } }

.hrow { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line-soft); }
.h-date { font-family: var(--font-display); font-size: 13px; color: var(--text); width: 90px; flex: none; }
.h-vals { flex: 1; display: flex; gap: 10px; flex-wrap: wrap; font-size: 13.5px; color: var(--text); .dim { color: var(--dim); } }

.empty { color: var(--dim); padding: 24px 0; }
</style>
