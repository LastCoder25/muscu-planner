<template>
  <!-- En-tête d'un exo du Défi 360, partagé par l'onglet 🎯 et la fiche du défi.
       UNE ligne quand le nom et l'avancement tiennent côte à côte, DEUX sinon : l'avancement
       passe alors dessous, collé à droite. Le nom n'est jamais tronqué pour lui faire de la
       place (avant, la pastille lui volait la moitié de la ligne et il partait sur deux ou
       trois lignes). -->
  <div class="lh">
    <div class="lh-thumb">
      <ExerciseDemo :exercise-id="leg.exercise_id" :name="leg.exercise_name" :size="size">
        <span class="lh-emo">{{ fallback }}</span>
      </ExerciseDemo>
    </div>
    <div class="lh-body">
      <div class="lh-name" :title="leg.exercise_name">
        {{ leg.exercise_name
        }}<span v-if="bodyweight" class="lh-bw" title="Poids du corps (aucun matériel)">🤸</span>
      </div>
      <!-- Toute la ligne ouvre les séries faites : une cible large, pas une pastille de 20 px. -->
      <button
        class="lh-meta"
        :aria-label="`Séries faites : ${leg.exercise_name}`"
        @click="emit('history')"
      >
        <span class="lh-range">🎯 {{ range }}</span>
        <!-- Conseil de charge, relu après chaque série (cf. legLoadAdvice). -->
        <span v-if="load" class="lh-load" :class="load.call" :title="load.title">{{
          load.text
        }}</span>
        <span class="lh-count" :class="{ ok: legComplete(leg) }" :style="{ '--mc': color }">
          {{ legDone(leg) }}/{{ leg.target }} {{ legUnitLabel(leg) }}
          <span v-if="extra > 0" class="lh-extra">+{{ extra }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ExerciseDemo from './ExerciseDemo.vue';
import {
  legComplete,
  legDone,
  legMode,
  legLoadAdvice,
  LOAD_ADVICE,
  legRepRange,
  legUnitLabel,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { repRangeLabel } from '@/lib/repScheme';
import { comboLegColor } from '@/lib/volume';
import type { Objective } from '@/lib/types';

const props = withDefaults(
  defineProps<{
    leg: ComboLeg;
    objective?: Objective | null;
    bodyweight?: boolean;
    size?: number;
    /** Emoji affiché quand l'exo n'a pas d'illustration. */
    fallback?: string;
    /** Défis 360 passés : le conseil de charge s'y rabat quand l'exo n'a pas encore de série. */
    history?: ComboChallenge[];
  }>(),
  { objective: null, bodyweight: false, size: 38, fallback: '💪', history: () => [] },
);
const emit = defineEmits<{ history: [] }>();

const range = computed(() =>
  repRangeLabel(legRepRange(props.leg, props.objective), legMode(props.leg) === 'time'),
);
/** Conseil de charge : on ne dit jamais de combien monter, le pas dépend de l'exo. */
const load = computed(() => {
  const a = legLoadAdvice(props.leg, props.history, legRepRange(props.leg, props.objective));
  if (!a) return null;
  const kg = a.weight != null ? `${String(a.weight).replace('.', ',')} kg` : null;
  if (a.call === 'up')
    return {
      call: a.call,
      text: a.assisted ? '🏋️ ↑ moins d’assistance' : kg ? `🏋️ ${kg} ↑ monte` : '🏋️ ↑ plus dur',
      title: a.assisted
        ? 'Tu touches le haut de la fourchette : prends un élastique plus fin, ou passe sans'
        : kg
          ? 'Tu touches le haut de la fourchette : monte la charge'
          : 'Tu touches le haut de la fourchette : ajoute du lest ou une variante plus dure',
    };
  if (a.call === 'down')
    return {
      call: a.call,
      text: a.assisted ? '🏋️ ↓ plus d’assistance' : kg ? `🏋️ ${kg} ↓ allège` : '🏋️ ↓ plus facile',
      title: a.assisted
        ? 'Tu restes sous la fourchette : prends un élastique plus épais'
        : 'Tu restes sous la fourchette : allège la charge',
    };
  if (a.topUp)
    return {
      call: a.call,
      text: `💪 ${a.reps} strictes + élastique`,
      title: `Bravo pour les strictes ! Vise ${a.reps} reps sans aide, puis complète ton volume avec l’élastique`,
    };
  return {
    call: a.call,
    text: kg ? `🏋️ ${kg} · ${a.reps}` : `🏋️ vise ${a.reps}`,
    title: `Garde cette charge et vise ${a.reps} reps (conseil tiré de tes ${LOAD_ADVICE.window} dernières séries à cette charge)`,
  };
});
const extra = computed(() => legDone(props.leg) - props.leg.target);
/** Couleur du groupe musculaire, celle de l'Équilibre du corps : on relie l'exo à sa barre. */
const color = computed(() => comboLegColor(props.leg));
</script>

<style scoped>
.lh {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
}
.lh-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
}
.lh-emo {
  font-size: 22px;
}
/* Le nom garde sa largeur naturelle : c'est l'avancement qui passe à la ligne s'il n'y a
   pas la place, jamais le nom qui se comprime. */
.lh-body {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}
.lh-name {
  flex: 0 1 auto;
  max-width: 100%;
  font-weight: 600;
  font-size: 14.5px;
  line-height: 1.25;
  color: var(--text);
  /* Un nom très long garde deux lignes au plus, sans pousser la carte. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lh-bw {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  font-size: 10px;
  line-height: 1;
  vertical-align: 1px;
  border-radius: 50%;
  background: rgba(95, 208, 224, 0.15);
  border: 1px solid #5fd0e0;
}
.lh-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 4px 8px;
  margin: -7px 0 -7px auto;
  /* ⚠️ Jamais `flex: none` : la ligne se calerait sur son contenu et déborderait de
     l'écran dès que le conseil de charge s'allonge (115 px de trop à 344 px, vu au banc).
     Bornée à la largeur disponible, elle replie ses éléments. */
  flex: 0 1 auto;
  max-width: 100%;
  padding: 7px 0;
  min-width: 0;
  background: none;
  border: none;
  font-family: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.lh-range {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
}
.lh-load {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  /* Le conseil peut être long : il se replie au lieu de pousser la carte. */
  min-width: 0;
  text-align: right;
}
.lh-load.up {
  color: var(--d1);
}
.lh-load.down {
  color: var(--d3);
}
.lh-count {
  padding: 1px 8px;
  border-radius: 999px;
  /* Le contour porte la couleur du groupe musculaire (Équilibre du corps). */
  border: 1.5px solid var(--mc, var(--line));
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lh-count.ok {
  color: #15120e;
  background: var(--d1);
}
.lh-extra {
  margin-left: 3px;
  color: var(--d1);
}
.lh-count.ok .lh-extra {
  color: #15120e;
}
</style>
