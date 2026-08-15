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
        <div v-if="over.bonusXp > 0" class="hc-over">
          🔥 Dépassement : +{{ over.bonusXp }} XP
          <span class="hc-over-sub"
            >{{ over.legsOver }}/{{ over.totalLegs }} exos au-delà de l'objectif</span
          >
        </div>
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
        <div class="seg-bar" :style="{ '--cols': leg.target }">
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
          <!-- Exo bouclé → le reprendre en petit défi (d073a26b). -->
          <button v-if="legSetsDone(leg) >= leg.target" class="add chal" @click="toChallenge(leg)">
            🏆 En challenge
          </button>
        </div>
      </div>

      <div class="foot">
        Fais tes séries quand tu veux dans la semaine. Toutes les séries prévues pour
        <b>tous</b> les exos = Défi 360 bouclé. Chaque série alimente ta piste Muscu (reps + poids).
      </div>

      <button v-if="c.status !== 'abandoned'" class="abandon" @click="abandon">Abandonner</button>
    </template>

    <!-- Saisie d'une série (reps + poids + assisté), dialogue partagé -->
    <SetLogDialog
      v-model="setOpen"
      :title="setLeg?.exercise_name ?? ''"
      :desc="`${setCount > 1 ? setCount + ' séries' : '1 série'} · reps & poids`"
      :assistable="setLeg?.assistable"
      :initial-reps="setInitReps"
      :initial-weight="setInitWeight"
      :initial-assisted="setInitAssisted"
      @save="onSetSave"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useComboStore } from '@/stores/combo';
import { useGameFx } from '@/composables/useGameFx';
import {
  comboProgressPct,
  comboOverachievement,
  legSetsDone,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  type ComboLeg,
} from '@/lib/combo';
import { comboSlot } from '@/data/combo';
import { logicalToday, addDaysIso } from '@/lib/challenges';
import SetLogDialog from '@/components/SetLogDialog.vue';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const combo = useComboStore();
const gameFx = useGameFx();

const id = String(route.params.id);
const c = computed(() => combo.list.find((x) => x.id === id) ?? null);
const pct = computed(() => (c.value ? comboProgressPct(c.value) : 0));
const over = computed(() =>
  c.value ? comboOverachievement(c.value) : { bonusXp: 0, legsOver: 0, totalLegs: 0 },
);

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

// Saisie d'une série via le dialogue partagé, préremplie avec la dernière série.
const setOpen = ref(false);
const setLeg = ref<ComboLeg | null>(null);
const setCount = ref(1);
const setInitReps = ref(10);
const setInitWeight = ref<number | null>(null);
const setInitAssisted = ref(false);
function openSet(leg: ComboLeg, count: number) {
  setLeg.value = leg;
  setCount.value = count;
  setInitReps.value = legLastReps(leg);
  setInitWeight.value = legLastWeight(leg);
  setInitAssisted.value = legLastAssisted(leg);
  setOpen.value = true;
}
function onSetSave(v: { reps: number; weight: number | null; assisted: boolean }) {
  const leg = setLeg.value;
  if (!auth.user?.id || !c.value || !leg) return;
  const before = c.value.status;
  for (let i = 0; i < setCount.value; i++) {
    combo.addSet(id, leg.exercise_id, logicalToday(), v.reps, v.weight, v.assisted);
  }
  if (before !== 'done' && c.value.status === 'done') {
    gameFx.celebrate({
      kind: 'generic',
      emoji: '🎯',
      title: 'Défi 360 bouclé !',
      subtitle: 'Full-body complété — bravo 💪',
      rarity: 'divin',
    });
  }
}
function undoSet(leg: ComboLeg) {
  combo.removeLastSet(id, leg.exercise_id);
}
// Reprendre cet exo (bouclé dans le 360) en petit défi solo → wizard pré-rempli.
function toChallenge(leg: ComboLeg) {
  void router.push({ path: '/challenges/new', query: { ex: leg.exercise_id } });
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
  // Des séries déjà faites comptent pour l'XP/l'énergie → on marque « abandonné »
  // (conservé) au lieu de supprimer. Suppression sèche réservée aux 360 vierges.
  const hasDone = (c.value?.legs ?? []).some((l) => legSetsDone(l) > 0);
  $q.dialog({
    title: hasDone ? 'Abandonner ce Défi 360 ?' : 'Supprimer ce Défi 360 ?',
    message: hasDone
      ? 'Tu as déjà fait des séries : il passe en « abandonné » (ton effort et ton XP restent comptés).'
      : 'Aucune série faite : suppression définitive.',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: hasDone ? 'Abandonner' : 'Supprimer', color: 'negative' },
  }).onOk(() => {
    void (hasDone ? combo.setStatus(id, 'abandoned') : combo.remove(id)).then(() => router.back());
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
.hc-over {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--d1);
}
.hc-over-sub {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--dim);
  margin-top: 1px;
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
/* Segments de TAILLE FIXE : `--cols` (l'objectif) par ligne ; les séries en plus
   ajoutent des lignes de même taille (ex. 22 pour un objectif de 9 → 3 lignes de 9). */
.seg {
  flex: 0 0 calc((100% - (var(--cols, 10) - 1) * 3px) / var(--cols, 10));
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
.add.chal {
  flex: 1 1 100%;
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
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
