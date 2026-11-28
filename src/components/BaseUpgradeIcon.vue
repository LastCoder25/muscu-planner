<!-- 🏘️⬆️ Toute la base qui monte : trois bâtiments, une flèche au-dessus de chacun. -->
<template>
  <svg viewBox="0 0 40 34" class="bu-icon" aria-hidden="true" focusable="false">
    <g class="bu-arrows">
      <path d="M7 5 L12 11 H9 V16 H5 V11 H2 Z" />
      <path d="M20 0 L26 7 H22.5 V12 H17.5 V7 H14 Z" />
      <path d="M33 5 L38 11 H35 V16 H31 V11 H28 Z" />
    </g>
    <g class="bu-walls">
      <!-- Maison, donjon crénelé, atelier : portes évidées. -->
      <path d="M1 24 L7 18 L13 24 H12 V33 H8.5 V28 H5.5 V33 H2 V24 Z" />
      <path
        d="M14 14 H17 V16.5 H18.8 V14 H21.2 V16.5 H23 V14 H26 V33 H22 V27 A2 2 0 0 0 18 27 V33 H14 Z"
      />
      <path d="M27 24 L33 18 L39 24 H38 V33 H34.5 V28 H31.5 V33 H28 V24 Z" />
    </g>
  </svg>
</template>

<style scoped>
.bu-icon {
  display: block;
  width: 36px;
  height: 30.6px;
}
.bu-walls {
  fill: var(--text, #f3eee6);
}
.bu-arrows {
  fill: var(--accent, #ffd23f);
}
</style>
