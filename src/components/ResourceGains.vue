<template>
  <!-- ✨ CE QUI VIENT D'ARRIVER, sous le plateau de ressources (demandé : « une petite
       animation sous la barre des ressources, +1, +2, +10 000… selon la ressource »). Il
       remplace les toasts verts du bas d'écran, qui s'empilaient à l'ouverture jusqu'à
       couvrir l'écran et SPOILAIENT l'issue des expéditions. Le bandeau ne dit QUE combien :
       d'où ça vient et comment ça s'est passé, c'est la boîte 📬 qui le raconte. -->
  <!-- ⚠️ Une ancre de hauteur NULLE : le bandeau FLOTTE par-dessus ce qui suit (le sélecteur
       Aventure/Carte) au lieu de pousser la page. Il décalait tout, et la carte, mesurée
       pendant qu'il était là, restait trop courte une fois qu'il était parti (signalé).
       Toucher le bandeau le ferme. -->
  <div class="rg-anchor">
    <Transition name="rg">
      <div v-if="gains.length" class="rg" role="status" aria-live="polite" @click.self="close">
        <TransitionGroup name="rg-chip" tag="div" class="rg-chips" @click="close">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import RuneIcon from '@/components/RuneIcon.vue';
import { useCharacterStore } from '@/stores/character';
import { compactNumber } from '@/lib/compactNumber';
import { emptySeals, sealsSummary } from '@/lib/ascension';
import {
  GATED_GAINS,
  gateGain,
  mergeGains,
  resourceGains,
  type GainGate,
  type GatedGain,
  type ResourceGain,
} from '@/lib/resourceGains';
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
const SHOW_MS = 5000;
const gains = ref<ResourceGain[]>([]);
let last: ResourceSnapshot | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// 🪙💠 L'or et le mana sont retenus et ne s'annoncent qu'une fois par heure chacun
// (`gateGain`). La dernière annonce est retenue par appareil : sinon chaque remontage de
// l'écran la ré-autoriserait. ⚠️ La clé de l'or garde son nom d'avant (v1.229.1).
const gateKey = (id: GatedGain) => `muscu:gains:${id}-at`;
function readShownAt(id: GatedGain): number {
  try {
    const v = Number(localStorage.getItem(gateKey(id)));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
const gates = Object.fromEntries(
  GATED_GAINS.map((id) => [id, { held: 0, shownAt: readShownAt(id) }]),
) as Record<GatedGain, GainGate>;

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
    let add = resourceGains(last, snap);
    last = snap;
    const now = Date.now();
    for (const id of GATED_GAINS) {
      const gated = gateGain(add, id, gates[id], now);
      if (gated.gate.shownAt !== gates[id].shownAt) {
        try {
          localStorage.setItem(gateKey(id), String(gated.gate.shownAt));
        } catch {
          /* stockage indisponible : l'heure reste en mémoire */
        }
      }
      gates[id] = gated.gate;
      add = gated.show;
    }
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

function close() {
  gains.value = [];
  if (timer) clearTimeout(timer);
  timer = null;
}
function openDetails() {
  close();
  emit('details');
}
</script>

<style scoped>
.rg-anchor {
  position: relative;
  height: 0;
}
.rg {
  position: absolute;
  top: 2px;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 2px 2px 2px 8px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--bg);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  cursor: pointer;
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
