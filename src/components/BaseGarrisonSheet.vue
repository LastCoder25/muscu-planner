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
  <q-dialog :model-value="modelValue" position="bottom" no-refocus @update:model-value="close">
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

      <p class="bgs-cap">
        ⚔️ <b>Effectifs à la base</b>
        <span v-if="away > 0">
          · {{ away }} champion{{ away > 1 ? 's' : '' }} ailleurs (en route, postés, à
          l’infirmerie)</span
        >
      </p>
      <button v-if="away > 0 || !heroHome" type="button" class="bgs-recall" @click="emit('recall')">
        🔙 Rappeler à la base
      </button>
      <div class="bgs-pick">
        <!-- 🦸 Le héros, PARMI les effectifs. Disponible, il se choisit comme un champion
             (2026-10-05, demandé : « envoyer le héros sur un lieu fixe depuis la base ») : il y
             tient garnison et prend 2 places sur les 5. -->
        <button
          type="button"
          class="bgs-hero"
          :class="{ away: !heroHome, on: hero }"
          :disabled="!heroHome"
          :aria-pressed="hero"
          @click="hero = !hero"
        >
          <span class="bgs-hero-emo" aria-hidden="true">🦸</span>
          <span class="bgs-hero-main">
            <b>Héros</b>
            <span class="bgs-dim">{{ hero ? '✓ part en garnison · 2 places' : heroStatus }}</span>
          </span>
        </button>
        <AdvPickTile
          v-for="a in champs"
          :key="a.id"
          :adv="a"
          :on="sel.includes(a.id)"
          @toggle="toggle(a.id)"
        />
      </div>
      <p v-if="!champs.length" class="bgs-dim">Aucun champion à la base pour l’instant.</p>

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
      <template v-if="sel.length || mil > 0 || hero">
        <p class="bgs-cap">
          ⇄ <b>Envoyer en renfort</b> {{ hero ? 'le héros' : ''
          }}{{ hero && (sel.length || mil) ? ', ' : ''
          }}{{ sel.length ? `${sel.length} champion${sel.length > 1 ? 's' : ''}` : ''
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
            @click="emit('send', t.id, [...sel], mil, hero)"
          >
            <span class="bgs-t-emo">{{ t.emo }}</span>
            <span class="bgs-t-main">
              <span class="bgs-t-name">{{ t.label }}</span>
              <span class="bgs-t-sub">{{
                t.why ??
                `🧭 ${formatDurationMin(t.min)} · ${Number.isFinite(t.free) ? `${t.free} place${t.free > 1 ? 's' : ''}` : 'sans limite'}`
              }}</span>
              <span v-if="!t.why && t.bumped > 0" class="bgs-t-over"
                >🏠 {{ t.bumped }} milicien{{ t.bumped > 1 ? 's' : '' }} en poste
                {{ t.bumped > 1 ? 'rentreront' : 'rentrera' }} à la base pour leur faire place</span
              >
              <span v-if="!t.why && t.over > 0 && Number.isFinite(t.free)" class="bgs-t-over"
                >🔄 {{ t.over }} en trop : demi-tour si toujours plein à l’arrivée</span
              >
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
import {
  REINFORCE_BLOCK_LABEL,
  baseSendBlocker,
  controlFreeSeats,
  garrisonFreeSeats,
} from '@/lib/controlPoints';
import { emptyReinfSelection, reinfBumped } from '@/lib/reinforceSelection';
import { MILITIA } from '@/lib/militia';
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
  legMin: (id: string, champIds: readonly string[], militia: number, hero: boolean) => number;
  busy: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  send: [id: string, champIds: string[], militia: number, hero: boolean];
  /** 🔙 Ouvrir le rappel de ceux qui sont dehors (héros compris). */
  recall: [];
}>();

const sel = ref<string[]>([]);
const mil = ref(0);
/** 🦸 Le héros part aussi. */
const hero = ref(false);
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
      hero.value = false;
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
  () => props.heroHome,
  (h) => {
    if (!h) hero.value = false;
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
    const why = baseSendBlocker(t.control, sel.value.length, mil.value, hero.value);
    return {
      id: t.id,
      emo: t.emo,
      label: t.label,
      free: garrisonFreeSeats(t.control),
      // 🏠 Les miliciens en poste que le héros et les champions délogeront (revue 2026-10-08).
      bumped: reinfBumped(
        { ...emptyReinfSelection(), champs: [...sel.value] },
        { champ: controlFreeSeats(t.control), total: garrisonFreeSeats(t.control) },
        hero.value ? MILITIA.heroSeats : 0,
      ),
      // 🛡️ Les miliciens partent même vers un lieu plein : ceux au-delà des places libres
      // s'installent si une place se libère d'ici l'arrivée, sinon ils font demi-tour.
      over: Math.max(
        0,
        mil.value -
          Math.max(
            0,
            garrisonFreeSeats(t.control) - sel.value.length - (hero.value ? MILITIA.heroSeats : 0),
          ),
      ),
      min: props.legMin(t.id, sel.value, mil.value, hero.value),
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
.bgs-recall {
  width: 100%;
  min-height: 44px;
  margin: 0 0 10px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
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
/* Même gabarit qu'une tuile de champion (`AdvPickTile`) : il se lit dans la même grille. */
.bgs-hero {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 44px;
  padding: 7px 8px;
  border-radius: 12px;
  border: 1.5px solid var(--d1);
  background: #1d1913;
}
.bgs-hero {
  width: 100%;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.bgs-hero.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, #1d1913);
}
.bgs-hero:disabled {
  cursor: default;
}
.bgs-hero.away {
  border-color: var(--line);
  border-style: dashed;
}
.bgs-hero-emo {
  flex: none;
  font-size: 40px;
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
.bgs-t-over {
  font-size: 11px;
  color: var(--d3);
  line-height: 1.3;
}
.bgs-t-sub {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.3;
}
</style>
