<template>
  <!-- 🎒 LE BUTIN — garde à gauche, recycle à droite, QUEL QUE SOIT le côté où ça tombe.
       ⚠️ Toute la difficulté du jeu tient à ce décalage : il faut ignorer le réflexe
       « taper du côté où je vois » pour appliquer la règle. C'est ce qui occupe l'esprit
       mieux que les deux autres — et c'est pour ça que les deux bacs sont ÉCRITS en bas
       et toujours visibles : la règle ne doit jamais demander un effort de mémoire. -->
  <div class="tr">
    <div
      v-for="a in beats"
      :key="a.beat.id"
      class="tr-item"
      :class="[a.beat.from, a.beat.kind]"
      :style="{ top: `${Math.min(1, a.progress) * 68}%` }"
    >
      {{ item(a.beat.id, a.beat.kind) }}
    </div>

    <div class="tr-bins">
      <div class="tr-bin keep" :class="{ lit: lit === 'left' }">
        <span class="tr-bin-ico">✨</span>
        <span class="tr-bin-lab">GARDER</span>
      </div>
      <div class="tr-bin scrap" :class="{ lit: lit === 'right' }">
        <span class="tr-bin-ico">🔩</span>
        <span class="tr-bin-lab">RECYCLER</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ActiveBeat, HoldItemKind, HoldSide, HoldVerdict } from '@/lib/holdGames';

const props = defineProps<{
  beats: ActiveBeat[];
  pulse: { side: HoldSide; verdict: HoldVerdict; at: number } | null;
  reduced: boolean;
}>();

// ⚠️ Deux familles franchement distinctes : ce qui brille se garde, ce qui est cassé se
// recycle. Si la lecture demandait une seconde d'hésitation, le jeu deviendrait pénible
// au lieu d'être absorbant.
const KEEP = ['💎', '💍', '📜', '⚔️', '🔮'];
const SCRAP = ['🔩', '🪨', '🦴', '⛓️', '🗑️'];

function item(id: number, kind: HoldItemKind | undefined) {
  const pool = kind === 'scrap' ? SCRAP : KEEP;
  return pool[id % pool.length];
}

const lit = computed(() =>
  props.pulse && props.pulse.verdict !== 'wrong' ? props.pulse.side : null,
);
</script>

<style scoped>
.tr {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.tr-item {
  position: absolute;
  font-size: 34px;
  will-change: top;
}
.tr-item.left {
  left: 18%;
}
.tr-item.right {
  right: 18%;
}
/* Un halo de la couleur de la DESTINATION, jamais du côté d'où ça tombe : c'est un
   indice sur la règle, pas sur la position. */
.tr-item.keep {
  filter: drop-shadow(0 0 9px color-mix(in srgb, var(--d1) 60%, transparent));
}
.tr-item.scrap {
  filter: drop-shadow(0 0 9px color-mix(in srgb, var(--dim) 60%, transparent));
}
.tr-bins {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.tr-bin {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 4px;
  border-radius: 12px;
  border: 2px dashed var(--line);
  transition: border-color 110ms linear;
}
.tr-bin-ico {
  font-size: 20px;
}
.tr-bin-lab {
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: var(--dim);
}
.tr-bin.keep.lit {
  border-color: var(--d1);
}
.tr-bin.scrap.lit {
  border-color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .tr-bin {
    transition: none;
  }
}
</style>
