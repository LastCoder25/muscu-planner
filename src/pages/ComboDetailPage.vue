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
        <div class="hc-bar"><span :style="{ width: pct + '%' }" /></div>
        <div v-if="c.status === 'done'" class="hc-done">🎉 Défi 360 bouclé — bravo !</div>
      </div>

      <div
        v-for="leg in c.legs"
        :key="leg.exercise_id"
        class="leg"
        :class="{ ok: done(leg) >= leg.target }"
      >
        <div class="leg-top">
          <span class="leg-emo">{{ slotEmoji(leg.slot) }}</span>
          <div class="leg-main">
            <div class="leg-name">
              {{ leg.exercise_name }}
              <span v-if="leg.weight_kg" class="leg-kg">{{ leg.weight_kg }} kg</span>
            </div>
            <div class="leg-sub">
              {{ done(leg) }}/{{ leg.target }} reps
              <span v-if="done(leg) >= leg.target" class="leg-ok">✓</span>
            </div>
          </div>
        </div>
        <div class="bar"><span :style="{ width: legPct(leg) + '%' }" /></div>
        <div class="leg-actions">
          <button v-for="n in QUICK" :key="n" class="add" @click="add(leg, n)">+{{ n }}</button>
          <button class="add minus" aria-label="Corriger" @click="add(leg, -5)">−5</button>
        </div>
      </div>

      <div class="foot">
        Fais tes reps quand tu veux dans la semaine. Le total atteint pour <b>tous</b> les exos =
        Défi 360 bouclé. Chaque rep alimente ta piste Muscu (façon séance).
      </div>

      <button v-if="c.status !== 'abandoned'" class="abandon" @click="abandon">Abandonner</button>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useComboStore } from '@/stores/combo';
import { comboProgressPct, legDone, type ComboLeg } from '@/lib/combo';
import { comboSlot } from '@/data/combo';
import { logicalToday, addDaysIso } from '@/lib/challenges';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const combo = useComboStore();

const id = String(route.params.id);
const QUICK = [5, 10, 20];
const c = computed(() => combo.list.find((x) => x.id === id) ?? null);
const pct = computed(() => (c.value ? comboProgressPct(c.value) : 0));

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

function done(leg: ComboLeg) {
  return legDone(leg);
}
function legPct(leg: ComboLeg) {
  return leg.target > 0 ? Math.min(100, Math.round((legDone(leg) / leg.target) * 100)) : 0;
}
function slotEmoji(key: string) {
  return comboSlot(key)?.emoji ?? '💪';
}

function add(leg: ComboLeg, n: number) {
  if (!auth.user?.id || !c.value) return;
  const before = c.value.status;
  combo.addReps(id, leg.exercise_id, logicalToday(), n); // optimiste (instantané)
  if (before !== 'done' && c.value.status === 'done') {
    $q.notify({ type: 'positive', message: 'Défi 360 bouclé 🎉' });
  }
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
.add.minus {
  flex: none;
  width: 52px;
  border-color: var(--line);
  color: var(--dim);
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
