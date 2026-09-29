<!--
  💰 CE QU'ON RAMÈNE, ressource par ressource, et TOUCHER UNE RESSOURCE DIT CE QUE C'EST
  (v0.1294 dans les rapports, étendu aux tuiles de voyage : « quand je clique sur ce que
  ramène le héros, je n'ai pas la bulle »). Une bulle au toucher, pas un survol : un téléphone
  n'en a pas. Un seul composant pour tous les écrans, sinon l'un d'eux oublie la bulle.

  ⚠️ Plusieurs racines (les boutons, puis la bulle) : la bulle s'ancre sur le PARENT
  positionné de l'appelant (la ligne entière), pas sur la ressource — ancrée à droite, elle
  sortait de l'écran à 344 px.
-->
<template>
  <button
    v-for="g in pills"
    :key="g.emoji"
    type="button"
    class="hp"
    :class="variant"
    :aria-expanded="open === g.emoji"
    :aria-label="`${nameOf(g)} : ${sign}${fmt(g.n)}`"
    @click.stop="open = open === g.emoji ? null : g.emoji"
  >
    {{ g.emoji }} {{ sign }}{{ fmt(g.n) }}
  </button>
  <span v-if="tip" class="hp-tip" role="tooltip">
    <b>{{ tip.emoji }} {{ nameOf(tip) }}</b>
    <span v-if="useOf(tip)">{{ useOf(tip) }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RESOURCE_SOURCES } from '@/data/resourceSources';
import type { HaulPill } from '@/lib/expedition';

/** Une pastille : \`name\` absent = on retombe sur la fiche de la devise, puis sur l'emoji. */
type Pill = Pick<HaulPill, 'emoji' | 'n'> & Partial<Pick<HaulPill, 'name' | 'what'>>;

const props = withDefaults(
  defineProps<{
    pills: readonly Pill[];
    /** « + » dans un rapport (ce qui est gagné), rien sur une tuile de voyage. */
    sign?: string;
    /** \`plain\` : du texte en ligne (rapport) ; \`chip\` : une pastille bordée (voyage). */
    variant?: 'plain' | 'chip';
  }>(),
  { sign: '', variant: 'plain' },
);

/** À quoi sert une ressource : le consommable le dit lui-même, les devises du plateau
 *  reprennent la fiche « d'où elle vient » (une seule description par devise). */
const BY_EMOJI = new Map(Object.values(RESOURCE_SOURCES).map((r) => [r.emoji, r]));
const nameOf = (g: Pill) => g.name ?? BY_EMOJI.get(g.emoji)?.name ?? g.emoji;
const useOf = (g: Pill) => g.what ?? BY_EMOJI.get(g.emoji)?.use ?? '';
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

/** La ressource dont la bulle est ouverte ; un toucher ailleurs la referme. */
const open = ref<string | null>(null);
const tip = computed(() => props.pills.find((p) => p.emoji === open.value) ?? null);
const close = () => (open.value = null);
watch(open, (v) =>
  v ? window.addEventListener('click', close) : window.removeEventListener('click', close),
);
onBeforeUnmount(() => window.removeEventListener('click', close));
</script>

<style scoped lang="scss">
.hp {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.hp.plain {
  padding: 2px 4px;
  margin: -2px -4px;
  min-height: 28px;
  border-radius: 6px;
}
.hp.chip {
  padding: 2px 8px;
  min-height: 28px;
  border-radius: 999px;
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--line);
  font-size: 12px;
}
.hp:hover,
.hp:focus-visible,
.hp[aria-expanded='true'] {
  background: color-mix(in srgb, var(--text) 10%, transparent);
}
.hp-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 5;
  width: max-content;
  max-width: 100%;
  background: var(--surface-2, var(--surface));
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  color: var(--text);
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  font-size: 12.5px;
  line-height: 1.3;
}
</style>
