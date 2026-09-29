<template>
  <!-- 🔙 FAIRE DEMI-TOUR (demandé : « un truc plus design avec le détail »). La simple boîte
       « Faire demi-tour ? » ne montrait ni où en est la troupe, ni ce que l'on gagne à
       rentrer. On DESSINE le chemin (base → point de demi-tour → lieu), on dit QUI rentre,
       et les deux options sont des TUILES comparables : continuer ou rebrousser chemin. -->
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <div v-if="ask && preview" class="rc">
      <header class="rc-head">
        <span class="rc-ico">🔙</span>
        <div class="rc-htxt">
          <div class="rc-title">Faire demi-tour ?</div>
          <div class="rc-sub">
            {{ ask.label }} · vers {{ POI_LABEL[ask.poi.type] }}
            <span class="rc-rank" :style="{ '--rk': rank.color }">{{ rank.name }}</span>
          </div>
        </div>
      </header>

      <!-- 🗺️ Le chemin : ce qui est fait (plein), ce qui reste (pointillé), et là où l'on
           tournerait. Le marqueur se lit comme la troupe sur la carte. -->
      <div class="rc-route" role="img" :aria-label="routeAria">
        <span class="rc-end">
          <span class="rc-end-ico">🏰</span>
          <small>Base</small>
        </span>
        <div class="rc-track">
          <div class="rc-todo" />
          <div class="rc-done" :style="{ width: pct }" />
          <span class="rc-dot" :style="{ left: pct }">
            <span class="rc-dot-emo">{{ ask.emo }}</span>
            <span class="rc-turn">↩</span>
          </span>
        </div>
        <span class="rc-end dest" :style="{ '--rk': rank.color }">
          <span class="rc-end-ico">{{ POI_EMO[ask.poi.type] }}</span>
          <small>niv {{ ask.poi.level }}</small>
        </span>
      </div>
      <div class="rc-legend">
        <span>🚶 déjà {{ fmt(preview.walkedMs) }}</span>
        <span>encore {{ fmt(preview.toGoMs) }} ➜</span>
      </div>

      <!-- 🧑 Qui rentre. -->
      <div v-if="ask.hero || crew.length || militia" class="rc-crew">
        <span v-if="ask.hero" class="rc-who hero">🧝 Ton héros</span>
        <span v-for="a in crew" :key="a.id" class="rc-who">
          <span class="rc-who-pic"
            ><ChampionPortrait :champion-id="a.championId">{{ a.emoji }}</ChampionPortrait></span
          >
          {{ a.name }}
        </span>
        <span v-if="militia" class="rc-who"
          >🪖 {{ militia }} milicien{{ militia > 1 ? 's' : '' }}</span
        >
      </div>

      <!-- ⚖️ Les deux choix, côte à côte : on compare avant de toucher. -->
      <div class="rc-choices">
        <button type="button" class="rc-tile go" @click="emit('update:modelValue', false)">
          <span class="t-ico">➡️</span>
          <b>Continuer</b>
          <span class="t-line">Arrivée dans {{ fmt(preview.toGoMs) }}</span>
          <span class="t-line dim">
            {{
              preview.homeIfContinueMs === null
                ? 'Reste sur le point'
                : `À la base dans ${fmt(preview.homeIfContinueMs)}`
            }}
          </span>
        </button>
        <button type="button" class="rc-tile back" :disabled="busy" @click="emit('confirm')">
          <span class="t-ico">🔙</span>
          <b>Demi-tour</b>
          <span class="t-line"
            >{{ ask.homeName ?? 'À la base' }} dans {{ fmt(preview.backMs) }}</span
          >
          <span v-if="saved > 0" class="t-line gain">{{ fmt(saved) }} plus tôt</span>
          <span v-else class="t-line dim">Le chemin déjà fait</span>
        </button>
      </div>

      <div class="rc-pills">
        <span class="rc-pill">🚫 Lieu non atteint</span>
        <span class="rc-pill">⚖️ Rien gagné, rien perdu</span>
        <span class="rc-pill">{{
          ask.kind === 'reinf'
            ? '🛡️ Le point ne sera pas renforcé'
            : '📍 Le lieu reste sur la carte'
        }}</span>
      </div>
    </div>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ChampionPortrait from '@/components/ChampionPortrait.vue';
import { POI_EMO, POI_LABEL, type Poi } from '@/lib/expedition';
import { poiRank } from '@/lib/poiRank';
import { formatDuration } from '@/lib/duration';
import type { RecallPreview } from '@/lib/party';

export interface RecallAsk {
  kind: 'hero' | 'party' | 'reinf';
  label: string;
  emo: string;
  poi: Poi;
  hero: boolean;
  /** Où l'on rentre en faisant demi-tour : la base, ou le point de départ d'un transfert. */
  homeName?: string;
}

const props = defineProps<{
  modelValue: boolean;
  ask: RecallAsk | null;
  preview: RecallPreview | null;
  crew: { id: string; name: string; emoji: string; championId?: string | null }[];
  militia: number;
  busy?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; confirm: [] }>();

const rank = computed(() =>
  props.ask ? poiRank(props.ask.poi) : { color: 'var(--dim)', name: '' },
);
const pct = computed(() => `${Math.round((props.preview?.frac ?? 0) * 1000) / 10}%`);
/** Ce que le demi-tour fait gagner sur le retour, si l'on continuait. */
const saved = computed(() => {
  const p = props.preview;
  return p && p.homeIfContinueMs !== null ? p.homeIfContinueMs - p.backMs : 0;
});
const fmt = (ms: number) => formatDuration(Math.max(0, ms));
const routeAria = computed(() =>
  props.preview
    ? `Déjà ${fmt(props.preview.walkedMs)} de marche, encore ${fmt(props.preview.toGoMs)} jusqu’au lieu`
    : '',
);
</script>

<style scoped>
.rc {
  box-sizing: border-box;
  width: min(420px, calc(100vw - 32px));
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
}
.rc-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rc-ico {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 24px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}
.rc-htxt {
  min-width: 0;
}
.rc-title {
  font-family: Oswald, sans-serif;
  font-size: 21px;
  line-height: 1.1;
  color: var(--text);
}
.rc-sub {
  font-size: 13px;
  color: var(--dim);
  margin-top: 3px;
}
.rc-rank {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--rk);
  border: 1px solid color-mix(in srgb, var(--rk) 55%, transparent);
  background: color-mix(in srgb, var(--rk) 14%, transparent);
}

/* 🗺️ Le chemin */
.rc-route {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 10px 4px;
  border-radius: 14px;
  background: var(--surface-2, color-mix(in srgb, var(--bg) 60%, var(--surface)));
}
.rc-end {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.rc-end-ico {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 19px;
  background: var(--surface);
  border: 2px solid var(--line);
}
.rc-end.dest .rc-end-ico {
  border-color: var(--rk);
  box-shadow: 0 0 10px color-mix(in srgb, var(--rk) 40%, transparent);
}
.rc-end small {
  font-size: 10.5px;
  color: var(--dim);
}
.rc-track {
  position: relative;
  flex: 1;
  height: 36px;
  margin-bottom: 16px;
}
.rc-todo,
.rc-done {
  position: absolute;
  top: 50%;
  left: 0;
  height: 0;
  transform: translateY(-50%);
}
.rc-todo {
  right: 0;
  border-top: 3px dashed var(--line);
}
.rc-done {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 40%, transparent),
    var(--accent)
  );
}
.rc-dot {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 14%, transparent);
}
.rc-dot-emo {
  font-size: 17px;
}
.rc-turn {
  position: absolute;
  top: calc(100% + 1px);
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  animation: rc-bob 1.6s ease-in-out infinite;
}
@keyframes rc-bob {
  50% {
    transform: translateX(-4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rc-turn {
    animation: none;
  }
}
.rc-legend {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--dim);
  margin-top: -8px;
  padding: 0 4px;
}

/* 🧑 Qui rentre */
.rc-crew {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rc-who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 3px;
  border-radius: 999px;
  font-size: 12.5px;
  color: var(--text);
  background: var(--surface-2, color-mix(in srgb, var(--bg) 60%, var(--surface)));
  border: 1px solid var(--line);
}
.rc-who.hero {
  padding-left: 10px;
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}
.rc-who-pic {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  font-size: 14px;
  background: var(--surface);
}

/* ⚖️ Les deux choix */
.rc-choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.rc-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-height: 112px;
  padding: 12px;
  border-radius: 14px;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  background: var(--surface-2, color-mix(in srgb, var(--bg) 60%, var(--surface)));
  border: 1.5px solid var(--line);
  transition:
    transform 0.12s,
    border-color 0.12s;
}
.rc-tile:active {
  transform: scale(0.97);
}
.rc-tile.back {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.rc-tile:disabled {
  opacity: 0.5;
}
.rc-tile b {
  font-family: Oswald, sans-serif;
  font-size: 17px;
  font-weight: 600;
}
.t-ico {
  font-size: 20px;
  margin-bottom: 2px;
}
.t-line {
  font-size: 12.5px;
  line-height: 1.3;
}
.t-line.dim {
  color: var(--dim);
}
.t-line.gain {
  color: var(--d1);
  font-weight: 700;
}

.rc-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rc-pill {
  font-size: 11.5px;
  color: var(--dim);
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
}
</style>
