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
        :members="members"
        @done="close"
      />
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
// 🕳️ Le rejeu d'une incursion, monté UNE fois pour toutes.
//
// ⚠️ Il existe parce que DEUX écrans mènent au même rapport (la boîte 📬 de l'Aventure et
// la modale de collecte de la carte) : écrire le montage deux fois, c'est se garantir
// qu'ils divergeront — le projet a déjà payé ce défaut sur les libellés de POI et sur
// « qui défend ». Les pages ne connaissent que `replay`.
import { computed, ref, watch } from 'vue';
import type { Equipped } from '@/lib/items';
import type { PartyResult } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';
import { buildRiftStage, riftStageInputOf } from '@/lib/riftStage';
import { partyReport } from '@/lib/party';
import RiftStage from '@/components/RiftStage.vue';

const props = defineProps<{
  /** Le rapport à rejouer. ⚠️ Le NIVEAU n'est pas passé à côté : il vit dans `party.rift`,
   *  figé au départ de l'incursion — une seconde source finirait par diverger. */
  replay: PartyResult | null;
  roster: readonly Adventurer[];
  heroProfile: 'puissant' | 'agile' | 'polyvalent';
  heroEquipped: Equipped;
}>();
const emit = defineEmits<{ 'update:replay': [PartyResult | null] }>();

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

const hero = computed(() =>
  props.replay?.hero ? { profile: props.heroProfile, equipped: props.heroEquipped } : null,
);

/** Les mêmes membres que le rapport affiche — une seule lecture de l'escorte. */
const members = computed(() =>
  props.replay ? partyReport(props.replay, props.roster).members : [],
);

function close(): void {
  emit('update:replay', null);
}
</script>

<style scoped lang="scss">
.rift-full {
  width: 100vw;
  height: 100dvh;
  background: var(--bg);
}
</style>
