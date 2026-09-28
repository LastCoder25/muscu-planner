<script setup lang="ts">
// 🔀 Panneau de FUSION des talents et des familiers : 3 de la même rareté → 1 de la rareté au-dessus
// (plafonnée au rang du joueur). Le PARENT porte l'état et les règles (`companionFusion.ts`) ; ce
// composant ne fait que les montrer — un seul dessin pour les deux fenêtres.
import { computed } from 'vue';
import { FUSION_SIZE } from '@/lib/companionFusion';
import { rarityRank, type Rarity } from '@/lib/items';

const props = defineProps<{
  /** « talents » ou « familiers » (libellés). */
  noun: string;
  active: boolean;
  /** Raretés où l'on a assez d'exemplaires fusionnables, et ce qu'elles donnent. */
  counts: { rank: Rarity; rows: { id: string }[]; to: Rarity }[];
  selected: number;
  /** Rareté de la sélection en cours (celle du premier choisi). */
  rank: Rarity | null;
  /** Rareté obtenue par la sélection en cours. */
  to: Rarity | null;
  busy: boolean;
}>();
const emit = defineEmits<{
  start: [];
  stop: [];
  pick: [rows: { id: string }[]];
  fuse: [];
}>();

const rk = (r: Rarity) => rarityRank(r);
const ready = computed(() => props.selected === FUSION_SIZE && !props.busy);
</script>

<template>
  <div class="fz">
    <button v-if="!active" type="button" class="fz-start" @click="emit('start')">
      🔀 Fusionner des {{ noun }}
      <span class="fz-sub">{{ FUSION_SIZE }} de la même rareté → 1 de la rareté au-dessus</span>
    </button>
    <template v-else>
      <div class="fz-hint">
        Touche <b>{{ FUSION_SIZE }} {{ noun }}</b> de la même rareté. Le résultat est tiré au
        hasard, de la rareté au-dessus — jamais au-delà de ton rang (au rang maximal, il reste du
        même rang).
      </div>
      <div v-if="counts.length" class="fz-chips">
        <button
          v-for="c in counts"
          :key="c.rank"
          type="button"
          class="fz-chip"
          :style="{ '--rk': rk(c.rank).color, '--rk2': rk(c.to).color }"
          :title="`Sélectionner les ${FUSION_SIZE} moins bons ${rk(c.rank).name}`"
          @click="emit('pick', c.rows)"
        >
          <span class="fz-from">{{ rk(c.rank).name }} ×{{ c.rows.length }}</span>
          <span class="fz-arrow">→</span>
          <span class="fz-to">{{ rk(c.to).name }}</span>
        </button>
      </div>
      <div v-else class="fz-none">
        Pas encore {{ FUSION_SIZE }} {{ noun }} fusionnables de la même rareté.
      </div>
      <div class="fz-bar">
        <span class="fz-count">
          {{ selected }}/{{ FUSION_SIZE }}
          <template v-if="rank && to">
            · <b :style="{ color: rk(rank).color }">{{ rk(rank).name }}</b> →
            <b :style="{ color: rk(to).color }">{{ rk(to).name }}</b>
          </template>
        </span>
        <button type="button" class="fz-btn ghost" @click="emit('stop')">Annuler</button>
        <button type="button" class="fz-btn" :disabled="!ready" @click="emit('fuse')">
          {{ busy ? '⏳' : '🔀 Fusionner' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fz {
  margin: 8px 0;
}
.fz-start {
  width: 100%;
  min-height: 48px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--text);
  font-weight: 700;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}
.fz-sub {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--dim);
}
.fz-hint {
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.4;
}
.fz-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.fz-chip {
  min-height: 44px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--rk);
  background: color-mix(in srgb, var(--rk) 12%, var(--surface));
  color: var(--text);
  font-size: 12.5px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.fz-arrow {
  color: var(--dim);
}
.fz-to {
  color: var(--rk2);
}
.fz-none {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--dim);
}
.fz-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin-top: 10px;
  padding: 8px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.fz-count {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.fz-btn {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  cursor: pointer;
}
.fz-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.fz-btn.ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--line);
}
</style>
