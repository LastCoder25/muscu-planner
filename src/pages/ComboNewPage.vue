<template>
  <q-page class="combo-new">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Nouveau Défi 360</div>
      <div class="top-spacer" />
    </header>

    <p class="intro">
      Un défi <b>full-body sur 7 jours</b> : choisis un exo par groupe, fais toutes tes reps quand
      tu veux dans la semaine. Vise des reps <b>exigeantes</b> (proches de l'échec) — c'est ce qui
      fait progresser.
    </p>

    <div v-if="loading" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <template v-else>
      <div
        v-for="slot in COMBO_SLOTS"
        :key="slot.key"
        class="slot-card"
        :class="{ off: !enabled[slot.key] }"
      >
        <div class="slot-head">
          <span class="slot-emo">{{ slot.emoji }}</span>
          <div class="slot-main">
            <div class="slot-label font-display">
              {{ slot.label }}
              <span v-if="!slot.essential" class="slot-opt">option</span>
            </div>
            <div class="slot-hint">{{ slot.hint }}</div>
          </div>
          <q-toggle
            v-model="enabled[slot.key]"
            color="primary"
            :disable="!candidates(slot).length"
          />
        </div>

        <template v-if="enabled[slot.key]">
          <div v-if="!candidates(slot).length" class="no-ex">Aucun exo dispo (matériel).</div>
          <template v-else>
            <div class="ex-choices">
              <button
                v-for="e in candidates(slot)"
                :key="e.id"
                type="button"
                class="ex-chip"
                :class="{ on: picks[slot.key]?.exercise_id === e.id }"
                @click="pickExo(slot.key, e.id)"
              >
                {{ e.name }}
              </button>
            </div>
            <div class="leg-cfg">
              <div class="cfg-row">
                <span class="cfg-lbl">Reps / semaine</span>
                <div class="stepper">
                  <button type="button" @click="bumpTarget(slot.key, -5)">−</button>
                  <span class="stp-v font-display">{{ picks[slot.key]?.target ?? 0 }}</span>
                  <button type="button" @click="bumpTarget(slot.key, 5)">+</button>
                </div>
              </div>
              <div class="cfg-row">
                <span class="cfg-lbl">Charge (kg, option)</span>
                <q-input
                  v-model.number="picks[slot.key]!.weight_kg"
                  type="number"
                  dense
                  filled
                  placeholder="—"
                  style="max-width: 90px"
                />
              </div>
            </div>
          </template>
        </template>
      </div>
    </template>

    <div class="foot-bar">
      <div class="foot-info">{{ legCount }} exo{{ legCount > 1 ? 's' : '' }} · full-body</div>
      <q-btn
        color="primary"
        text-color="dark"
        no-caps
        size="lg"
        icon="check"
        label="Créer le Défi 360"
        :loading="creating"
        :disable="legCount === 0"
        @click="createCombo"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useProfileStore } from '@/stores/profile';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useComboStore } from '@/stores/combo';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { COMBO_SLOTS, type ComboSlot } from '@/data/combo';
import { suggestComboTarget, type ComboLeg } from '@/lib/combo';
import { repWeightFromExercise, logicalToday } from '@/lib/challenges';
import type { Level } from '@/lib/types';

const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const profileStore = useProfileStore();
const library = useLibraryStore();
const combo = useComboStore();
const challenges = useChallengesStore();

const lib = ref<ExerciseRow[]>([]);
const loading = ref(true);
const creating = ref(false);
const level = computed<Level>(() => profileStore.profile?.experience?.level ?? 'intermediaire');
const favSet = computed(() => new Set(profileStore.profile?.favorite_exercises ?? []));

const enabled = reactive<Record<string, boolean>>({});
const picks = reactive<
  Record<string, { exercise_id: string; target: number; weight_kg: number | null }>
>({});

// Exos candidats d'un emplacement : reps, muscle_primary du slot, matériel possédé.
function candidates(slot: ComboSlot): ExerciseRow[] {
  return lib.value
    .filter((e) => e.unit !== 'time' && slot.muscles.includes(e.muscle_primary ?? ''))
    .sort((a, b) => (favSet.value.has(b.id) ? 1 : 0) - (favSet.value.has(a.id) ? 1 : 0))
    .slice(0, 6);
}
function pickExo(slotKey: string, exId: string) {
  const p = picks[slotKey];
  if (p) p.exercise_id = exId;
}
function bumpTarget(slotKey: string, d: number) {
  const p = picks[slotKey];
  if (p) p.target = Math.max(5, p.target + d);
}
const legCount = computed(
  () => COMBO_SLOTS.filter((s) => enabled[s.key] && picks[s.key]?.exercise_id).length,
);

async function createCombo() {
  const uid = auth.user?.id;
  if (!uid) return;
  // Exclusivité : pas de Défi 360 si un défi MUSCU est déjà actif.
  // TODO(cleanup avant release) : retirer le bypass `!auth.isAdmin` — débridage
  // TEMPORAIRE pour tester le Défi 360 en parallèle des défis muscu (compte admin).
  const activeMuscu = challenges.list.some(
    (c) => c.status === 'active' && !isCardioChallengeRow(c),
  );
  if (activeMuscu && !auth.isAdmin) {
    $q.notify({
      type: 'warning',
      message: 'Termine tes défis muscu en cours : le Défi 360 les remplace (1 seul programme).',
    });
    return;
  }
  const legs: ComboLeg[] = [];
  for (const slot of COMBO_SLOTS) {
    if (!enabled[slot.key]) continue;
    const p = picks[slot.key];
    if (!p?.exercise_id) continue;
    const e = lib.value.find((x) => x.id === p.exercise_id);
    if (!e) continue;
    legs.push({
      slot: slot.key,
      exercise_id: e.id,
      exercise_name: e.name,
      muscle_primary: e.muscle_primary,
      rep_weight: repWeightFromExercise(e.muscle_secondary, e.equipment_required),
      target: p.target,
      weight_kg: p.weight_kg || null,
      progress: [],
    });
  }
  if (!legs.length) return;
  creating.value = true;
  try {
    const c = await combo.create({
      name: 'Défi 360',
      start_date: logicalToday(),
      duration_days: 7,
      legs,
    });
    $q.notify({ type: 'positive', message: 'Défi 360 lancé 💪' });
    await router.replace(`/combo/${c.id}`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  const uid = auth.user?.id;
  try {
    if (uid && !profileStore.profile) await profileStore.fetch(uid);
    if (challenges.list.length === 0) await challenges.fetchMine();
    if (combo.list.length === 0) await combo.fetchMine();
    lib.value = await library.fetchAll();
    // Init : essentiels activés avec le 1er candidat + cible suggérée.
    for (const slot of COMBO_SLOTS) {
      enabled[slot.key] = slot.essential;
      const first = candidates(slot)[0];
      picks[slot.key] = {
        exercise_id: first?.id ?? '',
        target: suggestComboTarget(level.value, slot.essential),
        weight_kg: null,
      };
    }
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.combo-new {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 120px;
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
  font-size: 28px;
  cursor: pointer;
  width: 32px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.top-spacer {
  width: 32px;
}
.intro {
  font-size: 13px;
  color: var(--dim);
  line-height: 1.5;
  margin: 0 0 14px;
}
.slot-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.slot-card.off {
  opacity: 0.55;
}
.slot-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.slot-emo {
  font-size: 24px;
}
.slot-main {
  flex: 1;
  min-width: 0;
}
.slot-label {
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}
.slot-opt {
  font-size: 10px;
  color: var(--dim);
  text-transform: uppercase;
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 1px 5px;
  margin-left: 4px;
}
.slot-hint {
  font-size: 11.5px;
  color: var(--dim);
}
.no-ex {
  font-size: 12px;
  color: var(--dim);
  margin-top: 8px;
}
.ex-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.ex-chip {
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 12.5px;
  cursor: pointer;
}
.ex-chip.on {
  border-color: var(--accent);
  color: var(--accent);
}
.leg-cfg {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cfg-lbl {
  font-size: 12.5px;
  color: var(--dim);
}
.stepper {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stepper button {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.stp-v {
  min-width: 40px;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
}
.foot-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--bg);
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 12px;
}
.foot-info {
  flex: 1;
  font-size: 12.5px;
  color: var(--dim);
}
</style>
