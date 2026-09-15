<template>
  <!-- LE PORTRAIT D’UN AVENTURIER — le même langage que celui du héros à l’entrée de
       l’Aventure (demandé par l’utilisateur) : l’avatar au centre d’un cercle teinté par
       son RANG, ses étoiles sur l’anneau, et quatre ronds aux coins.
       ↖ sa classe (rareté) · ↗ son rang · ↙ l’avancement vers l’étoile suivante · ↘ sa
       puissance. ⚠️ Toujours PAS de niveau affiché : c’est la règle posée à la conception
       (« un aventurier de manga ») — le rang et l’anneau disent où il en est. -->
  <div
    class="ap"
    :class="{ busy: !!state && !state.startsWith('✅') }"
    :style="{ '--rank-c': rank.color, '--rar-c': rarColor }"
  >
    <div class="ap-square">
      <button
        class="ap-mini corner tl"
        type="button"
        :title="`${title?.label ?? 'Sans classe'} · ${rarLabel}`"
        :aria-label="`Fiche de ${adv.name}`"
        @click="emit('open')"
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track rar" cx="22" cy="22" r="18" />
          <text class="apm-emo" x="22" y="23" text-anchor="middle" dominant-baseline="central">
            {{ title?.emoji ?? '🧑' }}
          </text>
        </svg>
      </button>

      <div class="ap-mini corner tr" :title="`${rank.name} · ${rank.star}/5 ★`">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track full" cx="22" cy="22" r="18" />
          <text class="apm-emo" x="22" y="23" text-anchor="middle" dominant-baseline="central">
            {{ rank.emoji }}
          </text>
        </svg>
        <span class="apm-ic txt font-display">{{ rank.star }}★</span>
      </div>

      <div
        class="ap-frame"
        role="button"
        tabindex="0"
        :aria-label="`Fiche de ${adv.name}`"
        @click="onFrame"
        @keydown.enter.prevent="emit('open')"
      >
        <AventureAvatar
          class="ap-avatar"
          :profile="look.profile"
          :equipped="equipped"
          :weapon-shape="look.weaponKind"
          :talent-icon="talentIcon"
          @familiar-click="emit('familiar')"
          @talent-click="emit('talent')"
        />
        <svg class="ap-stars" viewBox="0 0 100 100" aria-hidden="true">
          <path
            v-for="i in 5"
            :key="i"
            class="ap-star"
            :class="{ on: i <= rank.star }"
            :d="STAR_PATH"
            :transform="starTf(i - 1)"
          />
        </svg>
      </div>

      <div class="ap-mini corner bl" :title="`Vers l’étoile suivante : ${pct} %`">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track" cx="22" cy="22" r="18" />
          <circle
            class="apm-arc"
            cx="22"
            cy="22"
            r="18"
            stroke-dasharray="113.1"
            :stroke-dashoffset="113.1 * (1 - pct / 100)"
            transform="rotate(-90 22 22)"
          />
          <text
            class="apm-v font-display"
            x="22"
            y="22"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ pct }}%
          </text>
        </svg>
        <span class="apm-ic txt font-display">XP</span>
      </div>

      <div class="ap-mini corner br pow" :title="`Puissance ${fmtPow(power)}`">
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="apm-track full" cx="22" cy="22" r="18" />
          <text
            class="apm-v font-display"
            x="22"
            y="22"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ fmtPow(power) }}
          </text>
        </svg>
        <span class="apm-ic">⚔️</span>
      </div>
    </div>

    <button class="ap-name font-display" type="button" @click="emit('open')">{{ adv.name }}</button>
    <div class="ap-sub">
      {{ title?.label ?? '—' }} · <b :style="{ color: rarColor }">{{ rarLabel }}</b>
    </div>
    <div v-if="state" class="ap-state">{{ state }}</div>
    <button
      v-if="promotable"
      class="ap-promo"
      type="button"
      :disabled="disabled"
      @click="emit('promote')"
    >
      ⭐ Promouvoir
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AventureAvatar from '@/components/AventureAvatar.vue';
import { advRank, advRankProgress, advRarity, advTitle, type Adventurer } from '@/lib/adventurers';
import type { AdvLook } from '@/lib/advGear';
import { FAMILIAR_SLOT, rarityRank, type Equipped, type Item } from '@/lib/items';
import { fmtPow } from '@/lib/combat';

const props = defineProps<{
  adv: Adventurer;
  /** Son apparence, équipement PORTÉ compris (`advLooks`, v0.865). ⚠️ Requise et calculée
   *  par le parent pour tout le vivier d'un coup : « porté » dépend des autres aventuriers
   *  (une pièce ne se porte qu'une fois), un portrait seul ne peut pas le savoir. */
  look: AdvLook;
  familiar: Item | null;
  talentIcon?: string;
  power: number;
  /** Ce qu’il fait en ce moment (« ✅ disponible », « 🐫 en route · 2 h »…). */
  state?: string;
  promotable?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ open: []; familiar: []; talent: []; promote: [] }>();

const rank = computed(() => advRank(props.adv));
const title = computed(() => advTitle(props.adv));
// Le rang de la CLASSE (v0.833) : c’est lui qui borne ses compagnons, affichés en rang.
const rarColor = computed(() => rarityRank(advRarity(props.adv)).color);
const rarLabel = computed(() => 'classe ' + rarityRank(advRarity(props.adv)).name);
const pct = computed(() => Math.round(advRankProgress(props.adv) * 100));
/** L’avatar ne lit que l’emplacement et la RARETÉ de chaque pièce (la forme de l’arme lui
 *  est passée à part) : la règle d’apparence vit dans `advLooks` (lib), ce composant ne
 *  fait que la traduire en « équipement ». */
const equipped = computed<Equipped>(() => {
  const out: Equipped = {};
  for (const [slot, v] of Object.entries(props.look.gear)) {
    out[slot as keyof Equipped] = { id: `look-${slot}`, slot, rarity: v.rarity } as Item;
  }
  if (props.familiar) out[FAMILIAR_SLOT] = props.familiar;
  return out;
});
/** Le cadre ouvre la fiche — sauf quand on touche le familier ou le talent de l’avatar,
 *  qui ouvrent leur propre sélecteur. */
function onFrame(e: MouseEvent) {
  if ((e.target as Element | null)?.closest?.('.hotspot')) return;
  emit('open');
}

// Mêmes étoiles que le portrait du héros, posées sur l’anneau.
const STAR_PATH =
  'M0,-6 L1.76,-2.43 L5.7,-1.85 L2.85,0.94 L3.53,4.85 L0,3 L-3.53,4.85 L-2.85,0.94 L-5.7,-1.85 L-1.76,-2.43 Z';
const STAR_ANGLES = [-150, -120, -90, -60, -30];
function starTf(i: number): string {
  const a = ((STAR_ANGLES[i] ?? -90) * Math.PI) / 180;
  const R = 48;
  return `translate(${(50 + R * Math.cos(a)).toFixed(2)} ${(50 + R * Math.sin(a) - 1.5).toFixed(2)}) scale(0.9)`;
}
</script>

<style scoped lang="scss">
.ap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px 10px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  min-width: 0;
  text-align: center;
}
.ap.busy {
  opacity: 0.82;
}
.ap-square {
  position: relative;
  width: 100%;
  max-width: 180px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ap-frame {
  position: relative;
  width: 60%;
  aspect-ratio: 1;
  border-radius: 50%;
  cursor: pointer;
  background: radial-gradient(
    circle at 50% 42%,
    color-mix(in srgb, var(--rank-c) 22%, var(--bg)),
    color-mix(in srgb, var(--rank-c) 6%, var(--bg)) 70%
  );
  border: 3px solid color-mix(in srgb, var(--rank-c) 80%, transparent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--rank-c) 30%, transparent);
}
.ap-avatar {
  position: absolute;
  left: 50%;
  top: 53%;
  transform: translate(-50%, -50%);
  width: 80%;
  height: 98%;
}
.ap-stars {
  position: absolute;
  inset: -3px;
  width: calc(100% + 6px);
  height: calc(100% + 6px);
  overflow: visible;
  pointer-events: none;
}
.ap-star {
  fill: #14100a;
  stroke: color-mix(in srgb, var(--rank-c) 55%, var(--dim));
  stroke-width: 1;
}
.ap-star.on {
  fill: var(--rank-c);
  stroke: #14100a;
  stroke-width: 1.4;
  paint-order: stroke;
}
.ap-mini {
  position: absolute;
  width: 24%;
  aspect-ratio: 1;
  background: none;
  border: none;
  padding: 0;
}
button.ap-mini {
  cursor: pointer;
}
.corner.tl {
  top: 0;
  left: 0;
}
.corner.tr {
  top: 0;
  right: 0;
}
.corner.bl {
  bottom: 0;
  left: 0;
}
.corner.br {
  bottom: 0;
  right: 0;
}
.ap-mini svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.apm-track {
  fill: var(--bg);
  stroke: var(--line);
  stroke-width: 3.5;
}
.apm-track.full {
  stroke: color-mix(in srgb, var(--accent) 60%, var(--line));
}
.apm-track.rar {
  stroke: var(--rar-c);
}
.apm-arc {
  fill: none;
  stroke: var(--rank-c);
  stroke-width: 3.5;
  stroke-linecap: round;
}
.apm-emo {
  font-size: 18px;
}
.apm-v {
  font-weight: 700;
  font-size: 12px;
  fill: var(--rank-c);
  font-variant-numeric: tabular-nums;
}
.pow .apm-v {
  fill: var(--accent);
  font-size: 12px;
}
.apm-ic {
  position: absolute;
  top: 9%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  line-height: 1;
  background: var(--bg);
  border-radius: 999px;
  padding: 1px 4px;
  border: 1px solid color-mix(in srgb, var(--rank-c) 60%, transparent);
  white-space: nowrap;
}
.pow .apm-ic {
  border-color: color-mix(in srgb, var(--accent) 60%, transparent);
}
.apm-ic.txt {
  font-size: 9px;
  font-weight: 800;
  color: var(--rank-c);
}
.ap-name {
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ap-sub,
.ap-state {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.3;
}
.ap-promo {
  margin-top: 6px;
  min-height: 36px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-weight: 700;
  font-size: 12.5px;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .ap-frame {
    box-shadow: none;
  }
}
</style>
