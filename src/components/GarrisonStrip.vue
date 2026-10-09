<template>
  <!-- 🏰 UNE RANGÉE DE LA GARNISON, EN FRISE (2026-10-09, demandé : les grandes tuiles
       gênaient) : une case par place, dans le langage des frises de voyage. Toucher un
       occupant le choisit (les actions Ramener / Remplacer / Transférer apparaissent dessous) ;
       toucher une place libre ouvre le renfort. ⚠️ La composition vient de `garrisonStrip`. -->
  <div class="gs" :class="{ mil: militia }">
    <p class="gs-head">
      <span class="gs-title">{{ title }}</span>
      <span v-if="note" class="gs-note" :class="noteTone">{{ note }}</span>
    </p>
    <div class="gs-row" :style="{ '--cols': cols }">
      <template v-for="c in cells" :key="c.key">
        <!-- 🦸 Le héros : deux cases, il vaut deux places. -->
        <div
          v-if="c.kind === 'hero'"
          class="gs-cell hero"
          :class="c.state"
          :style="{ gridColumn: 'span ' + Math.min(2, cols) }"
          :title="heroTitle(c.state, c.inMs)"
        >
          <span class="gs-face">🦸</span>
          <span class="gs-lab">Ton héros</span>
          <span class="gs-sub">{{ stateSub(c.state, c.inMs) ?? '2 places' }}</span>
        </div>
        <button
          v-else-if="c.kind === 'member'"
          type="button"
          class="gs-cell member"
          :class="[c.state, { on: c.selected, locked: !c.selectable }]"
          :disabled="!c.selectable"
          :aria-pressed="c.selectable ? c.selected : undefined"
          :title="memberTitle(c)"
          @click="emit('toggle', c.id)"
        >
          <span class="gs-face">
            <MilitiaPortrait v-if="militia" />
            <ChampionPortrait v-else :champion-id="advOf(c.id)?.championId">{{
              advOf(c.id) ? (advTitle(advOf(c.id)!)?.emoji ?? '🧑') : '🧑'
            }}</ChampionPortrait>
          </span>
          <span class="gs-lab">{{ militia ? MILITIA_NAME : (advOf(c.id)?.name ?? '?') }}</span>
          <span class="gs-sub" :class="{ loss: c.state === 'here' && !!c.loss }">{{
            stateSub(c.state, c.inMs) ?? (c.reserved ? '⚔️' : c.loss ? `−${c.loss} %` : '')
          }}</span>
          <span v-if="c.selected" class="gs-check">✓</span>
        </button>
        <button
          v-else
          type="button"
          class="gs-cell free"
          :aria-label="c.unlimited ? 'Envoyer en renfort · sans limite' : freeLabel"
          :title="c.unlimited ? 'Sans limite de places' : freeLabel"
          @click="emit('add')"
        >
          <span class="gs-face">＋</span>
          <span class="gs-lab">{{ c.unlimited ? 'Sans limite' : 'Libre' }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import MilitiaPortrait from '@/components/MilitiaPortrait.vue';
import { advTitle, type Adventurer } from '@/lib/adventurers';
import { formatDuration } from '@/lib/duration';
import { stripColumns, type StripCell, type StripState } from '@/lib/garrisonStrip';
import { MILITIA_NAME } from '@/lib/militia';

const props = defineProps<{
  cells: StripCell[];
  title: string;
  /** Une ligne courte à droite du titre (ce que la rangée apporte, ou un avertissement). */
  note?: string | null;
  noteTone?: 'warn' | 'dim' | null;
  /** La rangée de la milice : portrait de milicien, cases libres « place de milicien ». */
  militia?: boolean;
  advs?: ReadonlyMap<string, Adventurer>;
}>();
const emit = defineEmits<{ toggle: [id: string]; add: [] }>();

/** Jamais plus de 5 colonnes : au-delà (forteresse sans limite) la frise passe à la ligne. */
const cols = computed(() => Math.min(5, stripColumns(props.cells)));
const advOf = (id: string) => props.advs?.get(id);
const freeLabel = computed(() =>
  props.militia
    ? 'Place de milicien · envoyer en renfort'
    : 'Place de champion · envoyer en renfort',
);

function stateSub(s: StripState, inMs: number): string | null {
  if (s === 'coming') return `🧭 ${formatDuration(inMs)}`;
  if (s === 'away') return `↩ ${inMs > 0 ? formatDuration(inMs) : 'bientôt'}`;
  return null;
}
function heroTitle(s: StripState, inMs: number) {
  if (s === 'coming') return `Ton héros arrive dans ${formatDuration(inMs)} · il prend 2 places`;
  if (s === 'away') return 'Ton héros est en sortie et reviendra ici · 2 places';
  return 'Ton héros est posté ici · il prend 2 places';
}
function memberTitle(c: Extract<StripCell, { kind: 'member' }>) {
  const who = props.militia ? MILITIA_NAME : (advOf(c.id)?.name ?? '');
  if (c.reserved) return `${who} · ${c.reserved}`;
  if (c.state === 'away')
    return `${who} est en sortie · sa place l'attend (${stateSub(c.state, c.inMs)})`;
  if (c.state === 'coming')
    return `${who} arrive dans ${formatDuration(c.inMs)} · touche pour le faire rebrousser chemin`;
  const loss = c.loss ? ` · sans lui, la tenue perd ${c.loss} %` : '';
  return `${who}${loss} · touche pour le ramener ou le remplacer`;
}
</script>

<style scoped>
.gs {
  margin: 6px 0 2px;
}
.gs-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  margin: 0 0 5px;
  font-size: 12.5px;
}
.gs-title {
  font-weight: 700;
}
.gs-note {
  font-size: 11.5px;
  color: var(--dim);
}
.gs-note.warn {
  color: var(--d4, #ff6a45);
  font-weight: 600;
}
.gs-row {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 4px;
}
.gs-cell {
  position: relative;
  min-width: 0;
  min-height: 58px;
  padding: 5px 2px 4px;
  border-radius: 10px;
  border: 1.5px solid var(--line);
  background: var(--surface-2, var(--surface));
  color: var(--text);
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  text-align: center;
}
button.gs-cell {
  cursor: pointer;
}
.gs-face {
  font-size: 22px;
  line-height: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
}
.gs-lab {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  font-weight: 600;
}
.gs-sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--dim);
  min-height: 12px;
}
/* Ce que la tenue perdrait sans lui : la teinte de la perte d’AdvPickTile. */
.gs-sub.loss {
  color: var(--d4, #ff6a45);
  font-weight: 700;
}
/* Présent : trait plein. En route / en sortie : pointillé, comme l'attente d'une frise. */
.gs-cell.coming,
.gs-cell.away {
  border-style: dashed;
  opacity: 0.78;
}
.gs-cell.away {
  border-color: var(--d3, #ffb23f);
}
.gs-cell.hero {
  border-color: color-mix(in srgb, var(--accent, #ffd23f) 55%, var(--line));
}
.gs-cell.member.on {
  border-color: var(--accent, #ffd23f);
  background: color-mix(in srgb, var(--accent, #ffd23f) 14%, var(--surface));
}
.gs-cell.member.locked {
  cursor: default;
}
.gs-check {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 11px;
  font-weight: 800;
  color: var(--accent, #ffd23f);
}
.gs-cell.free {
  border-style: dashed;
  background: transparent;
  color: var(--dim);
}
.gs-cell.free .gs-face {
  font-size: 18px;
  color: var(--accent, #ffd23f);
}
.gs-cell.free:hover,
.gs-cell.free:focus-visible {
  border-color: var(--accent, #ffd23f);
}
/* La milice est un bouche-trou : bordure neutre, comme ses encarts ailleurs. */
.gs.mil .gs-cell.member.here {
  border-color: var(--line);
}
</style>
