<template>
  <component :is="embedded ? 'div' : 'q-page'" class="fp-page" :class="{ embedded }">
    <header class="fp-head">
      <button class="fp-back" aria-label="Retour" @click="goBack">‹</button>
      <div class="fp-title font-display">{{ pseudo || 'Ami' }}</div>
      <span class="fp-ro" title="Tu ne peux rien modifier chez lui">👁 lecture seule</span>
    </header>

    <div v-if="loading" class="fp-empty"><q-spinner color="primary" size="28px" /></div>
    <div v-else-if="denied" class="fp-empty">
      Tu n'as pas (ou plus) accès à l'entraînement de cette personne.
    </div>

    <template v-else>
      <!-- Défi 360 en cours -->
      <section v-if="activeCombo" class="fp-sec">
        <div class="fp-sec-t">🎯 Défi 360 en cours</div>
        <div class="fp-card">
          <div class="fp-c-top">
            <span class="fp-pct font-display">{{ comboProgressPct(activeCombo) }} %</span>
            <span class="fp-c-sub"
              >{{ comboLegsDone(activeCombo) }}/{{ activeCombo.legs.length }} exos bouclés</span
            >
          </div>
          <div class="fp-bar">
            <div class="fp-fill" :style="fillOf(comboProgressPct(activeCombo))" />
          </div>
          <div v-for="leg in activeCombo.legs" :key="leg.exercise_id" class="fp-leg">
            <div class="fp-leg-top">
              <span class="fp-leg-n">{{ leg.exercise_name }}</span>
              <span class="fp-leg-c" :class="{ ok: legComplete(leg) }">
                {{ legDone(leg) }}/{{ leg.target }} {{ legUnitLabel(leg) }}
              </span>
            </div>
            <!-- Détail des séries : visible entre amis (choix assumé). -->
            <div v-if="legSets(leg).length" class="fp-sets">
              <span v-for="(s, i) in legSets(leg)" :key="i" class="fp-set">
                <template v-if="legMode(leg) === 'time'">{{ s.reps }} s</template>
                <template v-else
                  >{{ s.reps }}<template v-if="s.weight">×{{ s.weight }}kg</template></template
                >
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Challenges en cours -->
      <section class="fp-sec">
        <div class="fp-sec-t">🏆 Challenges en cours ({{ activeChallenges.length }})</div>
        <div v-if="!activeChallenges.length" class="fp-empty">Aucun challenge en cours.</div>
        <div v-for="c in activeChallenges" :key="c.id" class="fp-card">
          <div class="fp-c-top">
            <span class="fp-c-name">{{ c.exercise_name }}</span>
            <span class="fp-pct font-display">{{ st(c).completionPct }} %</span>
          </div>
          <div class="fp-bar"><div class="fp-fill" :style="fillOf(st(c).completionPct)" /></div>
          <div class="fp-c-sub">
            {{ st(c).totalDone }} {{ unitLabel(c) }} au total · j{{ dayIndex(c) }}/{{
              c.duration_days
            }}
            <span class="fp-bal" :class="balClass(c)">{{ balLabel(c) }}</span>
          </div>
        </div>
      </section>

      <section v-if="doneCount" class="fp-sec">
        <div class="fp-sec-t">✅ Terminés</div>
        <div class="fp-done">
          {{ doneCount }} challenge{{ doneCount > 1 ? 's' : '' }} bouclé{{ doneCount > 1 ? 's' : ''
          }}{{ doneCombos ? ` · ${doneCombos} Défi 360` : '' }}
        </div>
      </section>
    </template>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFriendsStore } from '@/stores/friends';
import { useAuthStore } from '@/stores/auth';
import {
  challengeStats,
  challengeLiveBalance,
  logicalToday,
  type Challenge,
} from '@/lib/challenges';
import {
  comboProgressPct,
  legDone,
  legComplete,
  legMode,
  legSets,
  legUnitLabel,
  type ComboChallenge,
} from '@/lib/combo';

defineProps<{ embedded?: boolean }>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const friends = useFriendsStore();

const friendId = String(route.params.id);
const loading = ref(true);
const denied = ref(false);
const challenges = ref<Challenge[]>([]);
const combos = ref<ComboChallenge[]>([]);

const pseudo = computed(() => friends.pseudos[friendId] ?? '');
const activeChallenges = computed(() => challenges.value.filter((c) => c.status === 'active'));
const doneCount = computed(() => challenges.value.filter((c) => c.status === 'done').length);
const doneCombos = computed(() => combos.value.filter((c) => c.status === 'done').length);
const activeCombo = computed(() => combos.value.find((c) => c.status === 'active') ?? null);

const st = (c: Challenge) => challengeStats(c);
const comboLegsDone = (c: ComboChallenge) => c.legs.filter((l) => legComplete(l)).length;
const fillOf = (pct: number) => ({ width: Math.max(0, Math.min(100, pct)) + '%' });
const unitLabel = (c: Challenge) =>
  c.unit === 'distance' ? 'km' : c.unit === 'time' ? 'sec' : 'reps';

/** Jour courant du défi (1-based), borné à sa durée. */
function dayIndex(c: Challenge): number {
  const today = logicalToday();
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`);
  return Math.max(1, Math.min(c.duration_days, Math.round(ms / 86400000) + 1));
}
function balLabel(c: Challenge): string {
  const b = challengeLiveBalance(c);
  if (b > 0) return `+${Math.round(b)} d'avance`;
  if (b < 0) return `${Math.round(b)} de retard`;
  return 'dans les temps';
}
function balClass(c: Challenge) {
  const b = challengeLiveBalance(c);
  return { ahead: b > 0, late: b < 0 };
}

onMounted(async () => {
  const uid = auth.user?.id;
  if (!uid) return;
  try {
    if (!friends.loaded) await friends.fetchMine(uid);
    const d = await friends.fetchFriendTraining(friendId);
    challenges.value = d.challenges;
    combos.value = d.combos;
    // La RLS renvoie 0 ligne si on n'est pas ami : on le dit clairement plutôt que
    // d'afficher une page vide trompeuse.
    if (!friends.accepted.some((v) => v.userId === friendId)) denied.value = true;
  } catch {
    denied.value = true;
  } finally {
    loading.value = false;
  }
});

async function goBack() {
  await router.push('/friends');
}
</script>

<style scoped lang="scss">
.fp-page {
  padding: 14px 16px 40px;
}
.fp-page.embedded {
  min-height: 0;
}
.fp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.fp-back {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
  flex: none;
}
.fp-title {
  flex: 1;
  min-width: 0;
  font-size: 20px;
  font-weight: 700;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-ro {
  font-size: 11px;
  color: var(--dim-2);
  border: 1px solid var(--line-soft);
  border-radius: 999px;
  padding: 4px 9px;
  flex: none;
}
.fp-sec {
  margin-top: 18px;
}
.fp-sec-t {
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.fp-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 11px 12px;
  margin-bottom: 8px;
}
.fp-c-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.fp-c-name {
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-pct {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.fp-c-sub {
  font-size: 12px;
  color: var(--dim);
  margin-top: 4px;
}
.fp-bar {
  height: 8px;
  border-radius: 5px;
  background: var(--surface-2);
  overflow: hidden;
  margin: 8px 0 2px;
}
.fp-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 5px;
}
.fp-bal {
  margin-left: 6px;
}
.fp-bal.ahead {
  color: var(--d1);
}
.fp-bal.late {
  color: var(--d3);
}
.fp-leg {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line-soft);
}
.fp-leg-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.fp-leg-n {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-leg-c {
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.fp-leg-c.ok {
  color: var(--d1);
  font-weight: 700;
}
.fp-sets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.fp-set {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
}
.fp-empty {
  padding: 18px 0;
  text-align: center;
  font-size: 13px;
  color: var(--dim);
}
.fp-done {
  font-size: 13px;
  color: var(--dim);
}
</style>
