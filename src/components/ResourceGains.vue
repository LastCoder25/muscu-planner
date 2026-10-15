<template>
  <!-- ✨ CE QUI VIENT D'ARRIVER, sous le plateau de ressources (demandé : « une petite
       animation sous la barre des ressources, +1, +2, +10 000… selon la ressource »). Il
       remplace les toasts verts du bas d'écran, qui s'empilaient à l'ouverture jusqu'à
       couvrir l'écran et SPOILAIENT l'issue des expéditions. Le bandeau ne dit QUE combien :
       d'où ça vient et comment ça s'est passé, c'est la boîte 📬 qui le raconte. -->
  <Transition name="rg">
    <div v-if="gains.length" class="rg" role="status" aria-live="polite">
      <TransitionGroup name="rg-chip" tag="div" class="rg-chips">
        <span v-for="g in gains" :key="g.id" class="rg-chip" :class="g.id"
          ><b>+{{ compactNumber(g.n) }}</b
          ><span class="rg-ico"
            ><RuneIcon v-if="g.id === 'runes'" /><template v-else>{{
              ICONS[g.id] ?? '✨'
            }}</template></span
          ></span
        >
      </TransitionGroup>
      <button class="rg-more" type="button" @click="openDetails">📬 détail</button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import RuneIcon from '@/components/RuneIcon.vue';
import { useCharacterStore } from '@/stores/character';
import { compactNumber } from '@/lib/compactNumber';
import { emptySeals, sealsSummary } from '@/lib/ascension';
import { mergeGains, resourceGains, type ResourceGain } from '@/lib/resourceGains';
import type { ResourceSnapshot } from '@/lib/resourceGains';

const props = defineProps<{
  /** L'énergie disponible (même valeur que le plateau). */
  energy: number;
  /** L'XP de fond est chargée : avant, l'énergie vaut 0 et son arrivée serait un faux gain. */
  ready: boolean;
}>();
const emit = defineEmits<{ details: [] }>();

/** Les mêmes icônes que le plateau (`ResourceTray`) : un « +N » se relie d'un coup d'œil
 *  à la puce qu'il vient de faire monter. */
const ICONS: Record<string, string> = {
  energy: '⚡',
  mana: '💠',
  gold: '🪙',
  summon: '🔮',
  keys: '🗝️',
  sealsChamp: '🔱',
  sealsGear: '⚜️',
  tickets: '🎟️',
  supplies: '🎒',
};

const char = useCharacterStore();
const snapshot = computed<ResourceSnapshot | null>(() => {
  const row = char.row;
  if (!row) return null;
  const seals = row.seals ?? emptySeals();
  return {
    energy: props.energy,
    mana: row.mana,
    gold: row.gold,
    summon: row.summon_stones ?? 0,
    keys: row.keys,
    sealsChamp: sealsSummary(seals, 'champion').total,
    sealsGear: sealsSummary(seals, 'gear').total,
    tickets: row.gacha_tickets ?? 0,
    runes: row.runes?.runes ?? 0,
    supplies: Object.values(row.supplies ?? {}).reduce<number>((s, n) => s + (n ?? 0), 0),
  };
});

/** Tant que des crédits arrivent, le bandeau reste ; il s'efface ce délai après le dernier. */
const SHOW_MS = 7000;
const gains = ref<ResourceGain[]>([]);
let last: ResourceSnapshot | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// ⚠️ La référence ne se pose qu'une fois TOUT chargé (ligne ET XP de fond), et sans rien
// annoncer : ce qu'on avait déjà en ouvrant n'est pas un gain.
watch(
  () => [props.ready, snapshot.value] as const,
  ([ready, snap], old) => {
    if (!snap) return;
    const wasReady = old?.[0] ?? false;
    if (!ready || !wasReady || !last) {
      last = snap;
      return;
    }
    const add = resourceGains(last, snap);
    last = snap;
    if (!add.length) return;
    gains.value = mergeGains(gains.value, add);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      gains.value = [];
      timer = null;
    }, SHOW_MS);
  },
  { immediate: true },
);
onUnmounted(() => {
  if (timer) clearTimeout(timer);
});

function openDetails() {
  gains.value = [];
  emit('details');
}
</script>

<style scoped>
.rg {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  min-width: 0;
}
.rg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.rg-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--d1, #7bc86c);
  background: color-mix(in srgb, var(--d1, #7bc86c) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--d1, #7bc86c) 45%, transparent);
}
.rg-chip b {
  font-family: 'Oswald', sans-serif;
  font-weight: 600;
}
.rg-ico {
  display: inline-flex;
  width: 1.2em;
  justify-content: center;
}
.rg-more {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 12px;
  cursor: pointer;
}
/* Chaque « +N » monte en place, puis tout le bandeau s'efface. */
.rg-chip-enter-active {
  transition:
    transform 0.45s cubic-bezier(0.2, 1.4, 0.4, 1),
    opacity 0.3s;
}
.rg-chip-enter-from {
  transform: translateY(8px) scale(0.7);
  opacity: 0;
}
.rg-enter-active,
.rg-leave-active {
  transition:
    opacity 0.5s,
    transform 0.5s;
}
.rg-enter-from,
.rg-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .rg-chip-enter-active,
  .rg-enter-active,
  .rg-leave-active {
    transition: none;
  }
}
</style>
