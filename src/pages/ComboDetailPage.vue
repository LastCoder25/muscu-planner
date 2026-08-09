<template>
  <q-page class="combo-detail">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Défi 360</div>
      <button class="iconbtn danger" aria-label="Supprimer" @click="confirmRemove">🗑</button>
    </header>

    <div v-if="!c" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <template v-else>
      <div class="head-card" :class="{ done: c.status === 'done' }">
        <div class="hc-top">
          <span class="hc-pct font-display">{{ pct }}%</span>
          <span class="hc-days">{{ daysLeftLabel }}</span>
        </div>
        <div class="hc-week">📅 Semaine du {{ comboWeek }}</div>
        <div class="hc-bar"><span :style="{ width: pct + '%' }" /></div>
        <div v-if="c.status === 'done'" class="hc-done">🎉 Défi 360 bouclé — bravo !</div>
      </div>

      <q-btn
        v-if="c.status === 'active'"
        class="full-width q-mb-md"
        outline
        color="primary"
        no-caps
        icon="fitness_center"
        label="Générer une séance"
        :to="`/combo/${c.id}/session`"
      />

      <div
        v-for="leg in c.legs"
        :key="leg.exercise_id"
        class="leg"
        :class="{ ok: legSetsDone(leg) >= leg.target }"
      >
        <div class="leg-top">
          <span class="leg-emo">{{ slotEmoji(leg.slot) }}</span>
          <div class="leg-main">
            <div class="leg-name">
              {{ leg.exercise_name }}
              <span v-if="leg.weight_kg" class="leg-kg">{{ leg.weight_kg }} kg</span>
            </div>
            <div class="leg-sub">
              {{ legSetsDone(leg) }}/{{ leg.target }} séries
              <span v-if="legSetsDone(leg) >= leg.target" class="leg-ok">✓</span>
              <span v-if="legSetsDone(leg) > leg.target" class="leg-extra"
                >+{{ legSetsDone(leg) - leg.target }} en plus</span
              >
            </div>
          </div>
        </div>
        <div class="seg-bar">
          <span
            v-for="n in Math.max(leg.target, legSetsDone(leg))"
            :key="n"
            class="seg"
            :class="{ on: n <= legSetsDone(leg), extra: n > leg.target }"
          />
        </div>
        <div class="leg-actions">
          <button v-for="n in [1, 2, 3, 4]" :key="n" class="add" @click="openSet(leg, n)">
            +{{ n }}
          </button>
          <button class="add corr" :disabled="!legSetsDone(leg)" @click="undoSet(leg)">↩</button>
        </div>
      </div>

      <div class="foot">
        Fais tes séries quand tu veux dans la semaine. Toutes les séries prévues pour
        <b>tous</b> les exos = Défi 360 bouclé. Chaque série alimente ta piste Muscu (reps + poids).
      </div>

      <button v-if="c.status !== 'abandoned'" class="abandon" @click="abandon">Abandonner</button>
    </template>

    <!-- Saisie d'une série (reps + poids), préremplie -->
    <q-dialog v-model="setOpen">
      <q-card class="set-card">
        <div class="set-title font-display">{{ setLeg?.exercise_name }}</div>
        <div class="set-desc">
          {{ setCount > 1 ? `${setCount} séries` : '1 série' }} · reps &amp; poids
        </div>
        <div class="set-row">
          <span class="set-lbl">Reps</span>
          <q-input v-model.number="setReps" type="number" filled dense style="max-width: 110px" />
        </div>
        <div class="set-row">
          <span class="set-lbl">Poids</span>
          <q-input
            v-model.number="setWeight"
            type="number"
            filled
            dense
            suffix="kg"
            style="max-width: 130px"
          />
          <span class="set-hint">vide = PdC</span>
        </div>
        <div v-if="setLeg?.assistable" class="set-row">
          <span class="set-lbl">Assisté</span>
          <q-toggle v-model="setAssisted" />
          <span class="set-hint">élastique → ×0,6</span>
        </div>
        <div class="set-actions">
          <q-btn flat no-caps label="Annuler" @click="setOpen = false" />
          <q-btn
            unelevated
            color="primary"
            text-color="dark"
            no-caps
            label="Valider"
            @click="saveSet"
          />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useComboStore } from '@/stores/combo';
import {
  comboProgressPct,
  legSetsDone,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  type ComboLeg,
} from '@/lib/combo';
import { comboSlot } from '@/data/combo';
import { logicalToday, addDaysIso } from '@/lib/challenges';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const combo = useComboStore();

const id = String(route.params.id);
const c = computed(() => combo.list.find((x) => x.id === id) ?? null);
const pct = computed(() => (c.value ? comboProgressPct(c.value) : 0));

function fmtDM(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}
// Semaine concernée (début → fin) du Défi 360.
const comboWeek = computed(() => {
  if (!c.value) return '';
  return `${fmtDM(c.value.start_date)} → ${fmtDM(addDaysIso(c.value.start_date, c.value.duration_days - 1))}`;
});

const daysLeftLabel = computed(() => {
  if (!c.value) return '';
  const end = addDaysIso(c.value.start_date, c.value.duration_days - 1);
  const today = logicalToday();
  if (today > end) return 'semaine terminée';
  // jours restants inclus aujourd'hui
  let n = 0;
  for (let d = 0; d < c.value.duration_days; d++) {
    if (addDaysIso(c.value.start_date, d) >= today) n++;
  }
  return `${n} j restant${n > 1 ? 's' : ''}`;
});

function slotEmoji(key: string) {
  return comboSlot(key)?.emoji ?? '💪';
}

// Saisie d'une série (reps + poids), préremplie avec la dernière série.
const setOpen = ref(false);
const setLeg = ref<ComboLeg | null>(null);
const setCount = ref(1);
const setReps = ref<number>(10);
const setWeight = ref<number | null>(null);
const setAssisted = ref(false);
function openSet(leg: ComboLeg, count: number) {
  setLeg.value = leg;
  setCount.value = count;
  setReps.value = legLastReps(leg);
  setWeight.value = legLastWeight(leg);
  setAssisted.value = legLastAssisted(leg);
  setOpen.value = true;
}
function saveSet() {
  const leg = setLeg.value;
  const reps = Math.max(1, Math.round(setReps.value || 0));
  if (!auth.user?.id || !c.value || !leg) return;
  const before = c.value.status;
  const w = setWeight.value != null && setWeight.value > 0 ? setWeight.value : null;
  const asst = !!leg.assistable && setAssisted.value;
  for (let i = 0; i < setCount.value; i++) {
    combo.addSet(id, leg.exercise_id, logicalToday(), reps, w, asst);
  }
  setOpen.value = false;
  if (before !== 'done' && c.value.status === 'done') {
    $q.notify({ type: 'positive', message: 'Défi 360 bouclé 🎉' });
  }
}
function undoSet(leg: ComboLeg) {
  combo.removeLastSet(id, leg.exercise_id);
}
function abandon() {
  $q.dialog({
    title: 'Abandonner le Défi 360 ?',
    message: 'Il passera en abandonné. Tu pourras en relancer un.',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Abandonner', color: 'negative' },
  }).onOk(() => {
    void combo.setStatus(id, 'abandoned').then(() => router.back());
  });
}
function confirmRemove() {
  $q.dialog({
    title: 'Supprimer ce Défi 360 ?',
    message: 'Suppression définitive.',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void combo.remove(id).then(() => router.back());
  });
}

onMounted(async () => {
  if (!combo.loaded) await combo.fetchMine().catch(() => undefined);
});
</script>

<style scoped lang="scss">
.combo-detail {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 40px;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}
.iconbtn {
  background: none;
  border: none;
  color: var(--text);
  font-size: 26px;
  cursor: pointer;
  width: 32px;
}
.iconbtn.danger {
  font-size: 18px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.head-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
}
.head-card.done {
  border-color: var(--accent);
}
.hc-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.hc-pct {
  font-size: 30px;
  font-weight: 800;
  color: var(--accent);
}
.hc-days {
  font-size: 12.5px;
  color: var(--dim);
}
.hc-week {
  font-size: 12.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  margin: 2px 0 8px;
}
.hc-bar {
  height: 10px;
  background: var(--surface-2);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
}
.hc-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.hc-done {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}
.leg {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 8px;
}
.leg.ok {
  border-color: var(--d1);
}
.leg-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.leg-emo {
  font-size: 22px;
}
.leg-main {
  flex: 1;
  min-width: 0;
}
.leg-name {
  font-weight: 600;
  font-size: 14.5px;
  color: var(--text);
}
.leg-kg {
  font-size: 11px;
  color: var(--dim);
  margin-left: 4px;
}
.leg-sub {
  font-size: 12px;
  color: var(--dim);
}
.leg-ok {
  color: var(--d1);
}
.bar {
  height: 8px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
  margin: 9px 0;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
.seg-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin: 9px 0;
}
.seg {
  flex: 1 1 16px;
  min-width: 16px;
  height: 8px;
  border-radius: 3px;
  background: var(--surface-2);
}
.seg.on {
  background: var(--accent);
}
/* Série faite AU-DELÀ de l'objectif → couleur distincte (vert « en plus »). */
.seg.extra.on {
  background: var(--d1);
}
.leg-extra {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--d1);
}
.leg-actions {
  display: flex;
  gap: 6px;
}
.add {
  flex: 1;
  padding: 9px 0;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.add.neg {
  border-color: var(--d4);
  color: var(--d4);
}
.add.corr {
  flex: none;
  width: 48px;
  border-color: var(--line);
  color: var(--dim);
  font-size: 16px;
}
.add.corr:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.set-card {
  background: var(--surface);
  color: var(--text);
  padding: 18px 16px;
  border-radius: 16px;
  width: 320px;
  max-width: 92vw;
}
.set-title {
  font-size: 18px;
  font-weight: 700;
}
.set-desc {
  font-size: 12.5px;
  color: var(--dim);
  margin: 4px 0 14px;
}
.set-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.set-lbl {
  font-size: 13px;
  color: var(--dim);
  min-width: 46px;
}
.set-hint {
  font-size: 11px;
  color: var(--dim);
}
.set-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.foot {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.5;
  margin: 14px 0;
}
.abandon {
  width: 100%;
  padding: 10px;
  background: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--dim);
  cursor: pointer;
}
</style>
