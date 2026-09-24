<template>
  <!-- 🎮 Le bouton qui ouvre les mini-jeux du gainage, À CÔTÉ du chrono. Il n'apparaît que
       pour les exos où les deux mains tiennent le téléphone (`holdGameAllowed`). -->
  <button
    v-if="allowed"
    type="button"
    class="hgl-btn"
    :class="{ compact }"
    aria-label="Jouer pendant que je tiens"
    @click="picking = true"
  >
    🎮<span v-if="!compact"> Jouer pendant que je tiens</span>
  </button>

  <!-- Le choix du jeu, À CHAQUE FOIS (décision de l'utilisateur) : rien n'est retenu. -->
  <q-dialog v-model="picking" position="bottom">
    <div class="hgl-sheet">
      <div class="hgl-title">Choisis ton jeu</div>
      <div class="hgl-sub">
        {{ running ? 'Le chrono tourne déjà.' : 'Le chrono démarre avec le jeu.' }} Quitter le jeu
        met le chrono en pause.
      </div>
      <button
        v-for="g in HOLD_GAMES"
        :key="g.id"
        type="button"
        class="hgl-game"
        @click="pick(g.id)"
      >
        <span class="hgl-emo">{{ g.emoji }}</span>
        <span class="hgl-txt">
          <span class="hgl-name">{{ g.name }} <span class="hgl-skill">· {{ g.skill }}</span></span>
          <span class="hgl-rule">{{ g.rule }}</span>
        </span>
      </button>
    </div>
  </q-dialog>

  <HoldGame
    v-if="game"
    v-model="playing"
    :game="game"
    :target-sec="targetSec"
    :elapsed-sec="elapsedSec"
    :running="running"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import HoldGame from '@/components/HoldGame.vue';
import { HOLD_GAMES, holdGameAllowed, type HoldGameId } from '@/lib/holdGames';

const props = defineProps<{
  exerciseId: string | null | undefined;
  /** La durée visée pour cette série : elle cale la montée en difficulté du jeu. */
  targetSec: number;
  /** Le temps écoulé de la série EN COURS (pas le cumul du jour). */
  elapsedSec: number;
  running: boolean;
  /** Bouton réduit à l'icône, pour les lignes serrées. */
  compact?: boolean;
}>();

/** `start` : l'hôte démarre son chrono · `stop` : il le met en pause (la série s'enregistre). */
const emit = defineEmits<{ start: []; stop: [] }>();

const allowed = computed(() => holdGameAllowed(props.exerciseId));
const picking = ref(false);
const playing = ref(false);
const game = ref<HoldGameId | null>(null);

function pick(id: HoldGameId) {
  game.value = id;
  picking.value = false;
  if (!props.running) emit('start');
  playing.value = true;
}

// Quitter le jeu = « j'ai lâché » : on met le chrono en pause, sinon il continuerait de
// compter pendant qu'on se relève, et la série enregistrée serait trop longue.
watch(playing, (v, was) => {
  if (was && !v && props.running) emit('stop');
});
</script>

<style scoped>
.hgl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}
.hgl-btn.compact {
  min-width: 44px;
  padding: 0 10px;
  font-size: 18px;
}
.hgl-sheet {
  width: 100%;
  max-width: 520px;
  background: var(--surface);
  border-radius: 18px 18px 0 0;
  padding: 16px 14px 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hgl-title {
  font-weight: 800;
  font-size: 17px;
}
.hgl-sub {
  font-size: 12.5px;
  color: var(--dim);
  margin-bottom: 4px;
}
.hgl-game {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.hgl-game:active {
  border-color: var(--accent);
}
.hgl-emo {
  font-size: 28px;
  flex: none;
}
.hgl-txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hgl-name {
  font-weight: 800;
  font-size: 15px;
}
.hgl-skill {
  font-weight: 600;
  color: var(--dim);
  font-size: 12.5px;
}
.hgl-rule {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
