<template>
  <!-- Vignette de l'exécution (animée si l'exo a ses deux poses) qui ouvre la fiche en
       grand : animation + étapes + conseil. Une seule implémentation pour la fiche d'un
       défi et les listes d'exos du Défi 360 — deux copies finiraient par diverger.
       Sans illustration, rien n'est cliquable : on rend le contenu de repli (slot). -->
  <button
    v-if="img"
    type="button"
    class="exo-thumb"
    :style="{ width: size + 'px', height: size + 'px' }"
    :aria-label="`Voir l'exécution : ${name}`"
    @click.stop="open = true"
  >
    <ExerciseAnim v-if="frames" :exercise-id="exerciseId" :size="size" :title="name" />
    <img v-else :src="img" alt="" />
    <span class="exo-thumb-zoom" aria-hidden="true">⤢</span>
  </button>
  <slot v-else />

  <q-dialog v-model="open">
    <q-card class="exo-modal">
      <div class="exo-modal-title font-display">{{ name }}</div>
      <div class="exo-modal-media">
        <ExerciseAnim v-if="frames" :exercise-id="exerciseId" :size="300" :title="name" />
        <img v-else-if="img" :src="img" :alt="name" />
      </div>
      <!-- Licence Creative Commons : l'auteur doit être crédité là où l'image est montrée. -->
      <div v-if="credit" class="exo-credit">
        Photo :
        <a :href="credit.source" target="_blank" rel="noopener">{{ credit.author }}</a>
        · {{ credit.license }} · Wikimedia Commons
      </div>
      <ol v-if="steps?.steps?.length" class="exo-steps">
        <li v-for="(s, i) in steps.steps" :key="i">{{ s }}</li>
      </ol>
      <div v-if="steps?.tip" class="exo-tip">💡 {{ steps.tip }}</div>
      <q-btn
        class="exo-modal-close"
        no-caps
        unelevated
        color="primary"
        text-color="dark"
        label="Fermer"
        @click="open = false"
      />
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ExerciseAnim from '@/components/ExerciseAnim.vue';
import { exerciseImage, exerciseFrames, exerciseImageCredit } from '@/data/exerciseImages';
import { exerciseInstructions } from '@/data/exerciseInstructions';

const props = withDefaults(defineProps<{ exerciseId: string; name: string; size?: number }>(), {
  size: 42,
});

const open = ref(false);
const img = computed(() => exerciseImage(props.exerciseId));
const frames = computed(() => exerciseFrames(props.exerciseId));
const steps = computed(() => exerciseInstructions(props.exerciseId));
const credit = computed(() => exerciseImageCredit(props.exerciseId));
</script>

<style scoped>
.exo-thumb {
  position: relative;
  flex: none;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--accent);
  padding: 0;
  cursor: pointer;
  background: var(--surface);
}
.exo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* Badge « agrandir » : signale que la vignette ouvre l'animation en grand. */
.exo-thumb-zoom {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}
.exo-modal {
  padding: 16px;
  max-width: 440px;
  width: 92vw;
  border-radius: 16px;
  background: var(--surface);
}
.exo-modal-title {
  font-weight: 700;
  font-size: 18px;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.exo-modal-media {
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg);
  display: grid;
  place-items: center;
  padding: 8px;
}
.exo-modal-media img {
  max-width: 100%;
  border-radius: 8px;
}
.exo-credit {
  margin-top: 6px;
  font-size: 11px;
  color: var(--dim);
}
.exo-credit a {
  color: inherit;
}
.exo-steps {
  margin: 14px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.exo-tip {
  margin-top: 10px;
  font-size: 13px;
  color: var(--dim);
}
.exo-modal-close {
  margin-top: 16px;
  width: 100%;
}
</style>
