<template>
  <component :is="embedded ? 'div' : 'q-page'" class="lb-page" :class="{ embedded }">
    <h1 class="page-title font-display">Classement</h1>
    <p class="page-sub text-dim">
      Le niveau global de chaque aventurier — « sur l'honneur ». Fais du sport pour grimper 💪
    </p>

    <div class="seg">
      <button class="seg-b" :class="{ on: sort === 'global' }" @click="sort = 'global'">
        🏆 Global
      </button>
      <button class="seg-b" :class="{ on: sort === 'muscu' }" @click="sort = 'muscu'">
        💪 Muscu
      </button>
      <button class="seg-b" :class="{ on: sort === 'cardio' }" @click="sort = 'cardio'">
        ❤️ Cardio
      </button>
      <button class="seg-b" :class="{ on: sort === 'challenges' }" @click="sort = 'challenges'">
        🎯 Défis
      </button>
    </div>

    <div v-if="lb.loading && !lb.rows.length" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>
    <div v-else-if="!ranked.length" class="empty">
      Personne encore classé. Sois le premier — enregistre une séance !
    </div>

    <div v-else class="board">
      <div
        v-for="(r, i) in ranked"
        :key="r.user_id"
        class="row"
        :class="{ me: r.user_id === myId, podium: i < 3 }"
      >
        <span class="rank font-display">{{ medal(i) }}</span>
        <span class="who">
          <span class="pseudo">{{ r.pseudo }}</span>
          <span v-if="r.user_id === myId" class="you">toi</span>
          <span class="sub"
            >💪{{ r.muscu_level }} · ❤️{{ r.cardio_level }} · 🎯{{ r.challenges_level }}</span
          >
        </span>
        <span class="lvl font-display">Niv {{ levelOf(r) }}</span>
      </div>

      <!-- Ma position si hors du top affiché -->
      <div v-if="myRow && !inList" class="row me outside">
        <span class="rank font-display">·</span>
        <span class="who">
          <span class="pseudo">{{ myRow.pseudo }}</span>
          <span class="you">toi</span>
          <span class="sub">hors du top {{ ranked.length }}</span>
        </span>
        <span class="lvl font-display">Niv {{ levelOf(myRow) }}</span>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { useLeaderboardStore, type LeaderRow } from '@/stores/leaderboard';

const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();
const lb = useLeaderboardStore();

const myId = computed(() => auth.user?.id ?? '');
const sort = ref<'global' | 'muscu' | 'cardio' | 'challenges'>('global');

function levelOf(r: LeaderRow): number {
  return sort.value === 'muscu'
    ? r.muscu_level
    : sort.value === 'cardio'
      ? r.cardio_level
      : sort.value === 'challenges'
        ? r.challenges_level
        : r.global_level;
}
const ranked = computed(() =>
  [...lb.rows].sort((a, b) => levelOf(b) - levelOf(a) || b.global_xp - a.global_xp),
);
const myRow = computed(() => lb.rows.find((r) => r.user_id === myId.value) ?? null);
const inList = computed(() => ranked.value.some((r) => r.user_id === myId.value));

function medal(i: number): string {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
}

// Publie mes stats (une fois le sport chargé + pseudo choisi), puis (re)charge le top.
async function publishAndFetch() {
  const uid = auth.user?.id;
  const pseudo = char.row?.pseudo;
  if (uid && pseudo && progress.ready.value) {
    try {
      await lb.upsertMine(uid, {
        pseudo,
        global_level: progress.global.value.level,
        global_xp: progress.global.value.xp,
        muscu_level: progress.muscu.value.level,
        cardio_level: progress.cardio.value.level,
        challenges_level: progress.challenges.value.level,
      });
    } catch {
      /* pas bloquant */
    }
  }
  await lb.fetchTop().catch(() => undefined);
}

onMounted(() => {
  void lb.fetchTop().catch(() => undefined); // affiche vite les autres
  if (!char.row) void char.fetchMine().catch(() => undefined);
  if (progress.ready.value) void publishAndFetch();
});
// Quand le sport est chargé → publie mes stats et rafraîchit.
watch(
  () => progress.ready.value,
  (r) => {
    if (r) void publishAndFetch();
  },
);
</script>

<style scoped lang="scss">
.lb-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px calc(96px + env(safe-area-inset-bottom, 0px));
}
.lb-page.embedded {
  min-height: 0;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.page-sub {
  margin: 4px 0 18px;
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
  padding: 8px 4px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
.seg-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}
.empty {
  color: var(--dim);
  padding: 24px 4px;
}
.board {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 14px;
}
.row.podium {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
}
.row.me {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.row.outside {
  margin-top: 6px;
  border-style: dashed;
}
.rank {
  min-width: 30px;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pseudo {
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.you {
  font-size: 10px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sub {
  font-size: 11px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}
.lvl {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  flex-shrink: 0;
}
</style>
