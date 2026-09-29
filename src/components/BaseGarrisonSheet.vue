<template>
  <!-- 🏠 LA BASE, COMME UN LIEU FIXE (2026-09-29, demandé : « la base est cliquable pour voir
       les effectifs en garnison ; accès à tous les champions, héros et garnison sur la base pour
       pouvoir les envoyer ailleurs comme sur les lieux fixes »). Qui est À LA MAISON : le héros,
       les champions disponibles, les miliciens. Aucune limite de places : la base n'en a pas.
       On en choisit, puis un lieu tenu où les envoyer en renfort. ⚠️ Aucune règle ici : les
       places viennent de `baseSendBlocker` (la lib), le départ du store — l'écran ne fait que
       les montrer. -->
  <!-- `no-refocus` : à la fermeture, le focus ne revient pas sur la ville (il y laissait un
       cadre visible). -->
  <q-dialog
    :model-value="modelValue"
    position="bottom"
    no-refocus
    @update:model-value="close"
  >
    <div class="bgs">
      <div class="bgs-head">
        <span class="bgs-title">🏠 Ta base</span>
        <span class="bgs-sum"
          >{{ champs.length }} champion{{ champs.length > 1 ? 's' : '' }} · {{ milHome }} milicien{{
            milHome > 1 ? 's' : ''
          }}</span
        >
        <button type="button" class="bgs-x" aria-label="Fermer" @click="close(false)">✕</button>
      </div>

      <!-- 🦸 Le héros : son état. Il ne tient pas de lieu fixe (règle des points de contrôle),
           il part depuis la fiche d'un lieu. -->
      <div class="bgs-hero" :class="{ away: !heroHome }">
        <span class="bgs-hero-emo" aria-hidden="true">🦸</span>
        <span class="bgs-hero-main">
          <b>Héros</b>
          <span class="bgs-dim">{{ heroStatus }}</span>
        </span>
      </div>

      <p class="bgs-cap">
        ⚔️ <b>Champions à la base</b>
        <span v-if="away > 0"> · {{ away }} ailleurs (en route, postés, à l’infirmerie)</span>
      </p>
      <div v-if="champs.length" class="bgs-pick">
        <AdvPickTile
          v-for="a in champs"
          :key="a.id"
          :adv="a"
          :on="sel.includes(a.id)"
          @toggle="toggle(a.id)"
        />
      </div>
      <p v-else class="bgs-dim">Aucun champion à la base pour l’instant.</p>

      <template v-if="milHome > 0">
        <p class="bgs-cap">
          <span class="bgs-inline"><MilitiaPortrait /></span> <b>Miliciens</b> · touche-en un pour
          en choisir autant
        </p>
        <div class="bgs-mil">
          <button
            v-for="i in milHome"
            :key="'mil' + i"
            type="button"
            class="bgs-mil-tile"
            :class="{ on: i <= mil }"
            :aria-pressed="i <= mil"
            :aria-label="`${i} milicien${i > 1 ? 's' : ''}`"
            @click="mil = i === mil ? i - 1 : i"
          >
            <span class="bgs-mil-emo"><MilitiaPortrait /></span>
            <span class="bgs-mil-n">{{ i }}</span>
          </button>
        </div>
      </template>

      <!-- ⇄ Où les envoyer : un lieu tenu par tuile, grisé AVEC la raison. -->
      <template v-if="sel.length || mil > 0">
        <p class="bgs-cap">
          ⇄ <b>Envoyer en renfort</b>
          {{ sel.length ? `${sel.length} champion${sel.length > 1 ? 's' : ''}` : ''
          }}{{ sel.length && mil ? ' et ' : ''
          }}{{ mil ? `${mil} milicien${mil > 1 ? 's' : ''}` : '' }}
          vers :
        </p>
        <div v-if="rows.length" class="bgs-grid">
          <button
            v-for="t in rows"
            :key="t.id"
            type="button"
            class="bgs-target"
            :disabled="!!t.why || busy"
            :title="t.why ?? ''"
            @click="emit('send', t.id, [...sel], mil)"
          >
            <span class="bgs-t-emo">{{ t.emo }}</span>
            <span class="bgs-t-main">
              <span class="bgs-t-name">{{ t.label }}</span>
              <span class="bgs-t-sub">{{
                t.why ?? `🧭 ${formatDurationMin(t.min)} · ${t.free} place${t.free > 1 ? 's' : ''}`
              }}</span>
            </span>
          </button>
        </div>
        <p v-else class="bgs-dim">
          Aucun lieu fixe tenu : prends-en un depuis la carte pour y poster du monde.
        </p>
      </template>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AdvPickTile from '@/components/AdvPickTile.vue';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import type { Adventurer } from '@/lib/adventurers';
import { REINFORCE_BLOCK_LABEL, baseSendBlocker, militiaFreeSeats } from '@/lib/controlPoints';
import type { ControlState } from '@/lib/expedition';
import { formatDurationMin } from '@/lib/duration';

export interface BaseSendTarget {
  id: string;
  emo: string;
  label: string;
  control: ControlState;
}

const props = defineProps<{
  modelValue: boolean;
  /** Les champions À LA BASE (disponibles), dans l'ordre d'affichage. */
  champs: Adventurer[];
  /** Combien de champions sont ailleurs. */
  away: number;
  milHome: number;
  heroHome: boolean;
  heroStatus: string;
  /** Les lieux fixes TENUS. */
  targets: BaseSendTarget[];
  /** Le trajet (min) d'un départ de la base vers `id` avec cette sélection — la règle du store. */
  legMin: (id: string, champIds: readonly string[], militia: number) => number;
  busy: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  send: [id: string, champIds: string[], militia: number];
}>();

const sel = ref<string[]>([]);
const mil = ref(0);
function close(v: boolean) {
  emit('update:modelValue', v);
}
function toggle(id: string) {
  sel.value = sel.value.includes(id) ? sel.value.filter((x) => x !== id) : [...sel.value, id];
}
// À la fermeture, ou quand quelqu'un quitte la base (parti, blessé), la sélection suit.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      sel.value = [];
      mil.value = 0;
    }
  },
);
watch(
  () => props.champs.map((a) => a.id).join('|'),
  () => {
    const here = new Set(props.champs.map((a) => a.id));
    sel.value = sel.value.filter((x) => here.has(x));
  },
);
watch(
  () => props.milHome,
  (n) => {
    if (mil.value > n) mil.value = n;
  },
);

const rows = computed(() =>
  props.targets.map((t) => {
    const why = baseSendBlocker(t.control, sel.value.length, mil.value);
    return {
      id: t.id,
      emo: t.emo,
      label: t.label,
      free: militiaFreeSeats(t.control),
      min: props.legMin(t.id, sel.value, mil.value),
      why: why ? REINFORCE_BLOCK_LABEL[why] : null,
    };
  }),
);
</script>

<style scoped>
.bgs {
  width: 100%;
  max-width: 560px;
  max-height: 80dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px 20px;
}
.bgs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.bgs-title {
  font-family: Oswald, sans-serif;
  font-size: 18px;
  font-weight: 700;
}
.bgs-sum {
  color: var(--dim);
  font-size: 13px;
  flex: 1;
  min-width: 0;
}
.bgs-x {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  cursor: pointer;
}
.bgs-hero {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1.5px solid var(--d1);
  background: var(--surface-2, var(--bg));
  margin-bottom: 10px;
}
.bgs-hero.away {
  border-color: var(--line);
  border-style: dashed;
}
.bgs-hero-emo {
  font-size: 26px;
  line-height: 1;
}
.bgs-hero-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 13px;
}
.bgs-cap {
  margin: 8px 0 6px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--dim);
}
.bgs-cap b {
  color: var(--text);
}
.bgs-dim {
  color: var(--dim);
  font-size: 12px;
}
.bgs-pick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.bgs-inline {
  display: inline-flex;
  vertical-align: -0.2em;
}
.bgs-mil {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.bgs-mil-tile {
  position: relative;
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2, var(--bg));
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font: inherit;
}
.bgs-mil-tile.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.bgs-mil-emo {
  font-size: 24px;
  line-height: 1;
}
.bgs-mil-n {
  position: absolute;
  top: 2px;
  right: 5px;
  font-size: 9px;
  color: var(--dim);
}
.bgs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 6px;
}
.bgs-target {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1.5px solid var(--accent);
  border-radius: 10px;
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.bgs-target:disabled {
  cursor: default;
  border-color: var(--line);
  border-style: dashed;
  opacity: 0.6;
}
.bgs-t-emo {
  font-size: 20px;
  flex: none;
}
.bgs-t-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bgs-t-name {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.bgs-t-sub {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.3;
}
</style>
