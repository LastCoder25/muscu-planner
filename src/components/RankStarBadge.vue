<template>
  <!-- 🏅 LE RANG ET LES ÉTOILES, comme le coin haut-droit du portrait d'un champion : une
       BOULE (l'emoji coloré du rang) dans un cercle, et le nombre d'étoiles au-dessus. Un
       seul dessin pour les champions ET leurs pièces : deux copies finiraient par diverger. -->
  <div class="rsb" :style="{ '--rank-c': color }" :title="title ?? `${name} · ${star}/5 ★`">
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="rsb-track" cx="22" cy="22" r="18" />
      <text class="rsb-emo" x="22" y="23" text-anchor="middle" dominant-baseline="central">
        {{ emoji }}
      </text>
    </svg>
    <span class="rsb-star font-display">{{ star }}★</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ emoji: string; name: string; color: string; star: number; title?: string }>();
</script>

<style scoped>
.rsb {
  position: relative;
  aspect-ratio: 1;
}
.rsb svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.rsb-track {
  fill: var(--bg);
  stroke: color-mix(in srgb, var(--accent) 60%, var(--line));
  stroke-width: 3.5;
}
.rsb-emo {
  font-size: 18px;
}
.rsb-star {
  position: absolute;
  top: 9%;
  left: 50%;
  transform: translate(-50%, -50%);
  line-height: 1;
  background: var(--bg);
  border-radius: 999px;
  padding: 1px 4px;
  border: 1px solid color-mix(in srgb, var(--rank-c) 60%, transparent);
  font-size: 9px;
  font-weight: 800;
  color: var(--rank-c);
  white-space: nowrap;
}
</style>
