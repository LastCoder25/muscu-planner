<template>
  <!-- PLEIN ÉCRAN : c'est un plateau, pas une vignette (leçon de l'arène, v0.652 — une
       modale ordinaire le bridait à quelques centaines de pixels de haut). `persistent`
       parce que le plateau a son propre « Passer » et son écran de fin : un tap à côté ne
       doit pas escamoter le verdict. -->
  <q-dialog :model-value="!!replay" maximized persistent @update:model-value="close">
    <div class="rift-full">
      <RiftStage
        v-if="stage && input"
        :key="seq"
        :stage="stage"
        :level="input.level"
        :hero="hero"
        :cast="cast"
        :when="when"
        @done="onDone"
      />
      <!-- ⚔️ Une interception : la bataille rangée. -->
      <WarbandStage
        v-else-if="battle && replay"
        :key="'w' + seq"
        :stage="battle"
        :faction="replay.faction"
        :hero="hero"
        :cast="cast"
        :when="when"
        @done="onDone"
      />
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
// 🕳️ Le rejeu d'une incursion — ou ⚔️ d'une interception —, monté UNE fois pour toutes.
//
// ⚠️ Il existe parce que DEUX écrans mènent au même rapport (la boîte 📬 de l'Aventure et
// la modale de collecte de la carte) : écrire le montage deux fois, c'est se garantir
// qu'ils divergeront — le projet a déjà payé ce défaut sur les libellés de POI et sur
// « qui défend ». Les pages ne connaissent que `replay`.
import { computed, ref, watch } from 'vue';
import type { Equipped } from '@/lib/items';
import type { PartyResult } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';
import { buildRiftStage, replayWhenLabel, riftCast, riftStageInputOf } from '@/lib/riftStage';
import { useCharacterStore } from '@/stores/character';
import RiftStage from '@/components/RiftStage.vue';
import WarbandStage from '@/components/WarbandStage.vue';
import { buildWarbandStage, warbandStageInputOf } from '@/lib/warbandStage';

const props = defineProps<{
  /** Le rapport à rejouer. ⚠️ Le NIVEAU n'est pas passé à côté : il vit dans `party.rift`,
   *  figé au départ de l'incursion — une seconde source finirait par diverger. */
  replay: PartyResult | null;
  roster: readonly Adventurer[];
  heroProfile: 'puissant' | 'agile' | 'polyvalent';
  heroEquipped: Equipped;
}>();
const emit = defineEmits<{ 'update:replay': [PartyResult | null]; report: [] }>();

/** ⚠️ Remonté à chaque ouverture : sans clé neuve, Vue réutiliserait le composant déjà
 *  monté et le second rejeu resterait figé sur l'état final du premier. */
const seq = ref(0);
watch(
  () => props.replay,
  (r) => {
    if (r) seq.value++;
  },
);

const input = computed(() => (props.replay ? riftStageInputOf(props.replay) : null));

const stage = computed(() => {
  const i = input.value;
  if (!i) return null;
  // ⚠️ Graine DÉRIVÉE du rapport lui-même : le terrain d'une incursion donnée est le même
  // à chaque ouverture. Une graine tirée de l'horloge ferait bouger le décor sans raison.
  const seed = (i.level * 131 + i.population * 17 + i.killed + 1) >>> 0;
  return buildRiftStage(i, seed);
});

/** ⚔️ Une interception (`party.battle`) se rejoue en bataille rangée — même dialogue, même
 *  rejeu automatique, même « Voir le rapport » : un second montage divergerait. */
const battle = computed(() => {
  const r = props.replay;
  const b = r ? warbandStageInputOf(r) : null;
  if (!r || !b) return null;
  const seed = (b.armyPv * 7 + b.maxPv * 3 + b.steps.length + 1) >>> 0;
  return buildWarbandStage(b, r.win, r.escort.length + (r.hero ? 1 : 0), seed);
});

/** ⏱️ L'heure de la bataille, si le rejeu arrive en retard (`replayWhenLabel`). ⚠️ Le
 *  message se retrouve par la MÊME RÉFÉRENCE que `party` : tous les chemins (rejeu
 *  automatique, boîte 📬, collecte de la carte) passent `message.party` tel quel — aucune
 *  page n'a donc à transmettre une date de plus. Figée à l'ouverture. */
const char = useCharacterStore();
const when = computed(() => {
  const r = props.replay;
  if (!r) return null;
  const m = char.row?.messages?.find((x) => x.party === r);
  return m ? replayWhenLabel(m.resolvedAt, Date.now()) : null;
});

const hero = computed(() =>
  props.replay?.hero ? { profile: props.heroProfile, equipped: props.heroEquipped } : null,
);

/** Le groupe dans l’ordre de la formation — héros devant, puis les champions (`riftCast`,
 *  qui lit l’escorte comme le rapport). */
const cast = computed(() => (props.replay ? riftCast(props.replay, props.roster) : []));

function close(): void {
  emit('update:replay', null);
}
/** « Voir le rapport » (fin du rejeu) : on dit à la page d'ouvrir le rapport, PUIS on ferme.
 *  ⚠️ Sans ce signal le bouton ne faisait que fermer (signalé : « il ne fait rien ») — le
 *  rejeu automatique ne part d'aucun rapport ouvert, il n'y avait donc rien derrière. */
function onDone(): void {
  emit('report');
  close();
}
</script>

<style scoped lang="scss">
.rift-full {
  width: 100vw;
  height: 100dvh;
  background: var(--bg);
}
</style>
