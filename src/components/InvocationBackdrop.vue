<template>
  <!-- 🏛️ LE SANCTUAIRE — le fond de l'invocation (maquette validée le 2026-09-21).
       Dessiné au trait, sans image : piliers, arche ouverte sur un ciel étoilé, dalles en
       perspective, braseros, rayons et poussières. La lueur au sol et les poussières
       prennent la couleur du présage (`--c`, posée par l'écran parent).
       ⚠️ Rien n'y est réactif : tout est tiré une fois, au montage. -->
  <div class="ivb" aria-hidden="true">
    <div class="ivb-sky"></div>
    <div class="ivb-stars"></div>
    <svg class="ivb-scene" viewBox="0 0 400 800" preserveAspectRatio="xMidYMax slice">
      <polygon points="0,430 400,430 400,800 0,800" fill="#1d1712" />
      <line
        v-for="(l, i) in floor"
        :key="i"
        class="ivb-floor"
        :x1="l[0]"
        :y1="l[1]"
        :x2="l[2]"
        :y2="l[3]"
      />
      <path class="ivb-win" d="M120,430 L120,230 A80,80 0 0 1 280,230 L280,430 Z" />
      <path class="ivb-edge" d="M120,430 L120,230 A80,80 0 0 1 280,230 L280,430" />
      <path class="ivb-edge" d="M108,430 L108,228 A92,92 0 0 1 292,228 L292,430" opacity=".6" />
      <rect class="ivb-stone" x="14" y="120" width="54" height="330" />
      <rect class="ivb-stone2" x="14" y="120" width="12" height="330" />
      <rect class="ivb-stone" x="6" y="104" width="70" height="18" />
      <rect class="ivb-stone" x="6" y="438" width="70" height="14" />
      <rect class="ivb-stone" x="332" y="120" width="54" height="330" />
      <rect class="ivb-stone2" x="374" y="120" width="12" height="330" />
      <rect class="ivb-stone" x="324" y="104" width="70" height="18" />
      <rect class="ivb-stone" x="324" y="438" width="70" height="14" />
      <path
        class="ivb-edge"
        d="M30,140 V430 M52,140 V430 M348,140 V430 M370,140 V430"
        opacity=".35"
      />
      <rect class="ivb-stone" x="0" y="80" width="400" height="26" />
      <path class="ivb-edge" d="M0,106 H400" opacity=".7" />
      <path d="M86,106 h26 v96 l-13,-12 l-13,12 z" fill="#3b2a55" />
      <path d="M288,106 h26 v96 l-13,-12 l-13,12 z" fill="#3b2a55" />
      <circle cx="99" cy="136" r="6" fill="none" stroke="#b57bff" stroke-width="1.2" opacity=".8" />
      <circle
        cx="301"
        cy="136"
        r="6"
        fill="none"
        stroke="#b57bff"
        stroke-width="1.2"
        opacity=".8"
      />
    </svg>
    <div class="ivb-shaft"></div>
    <div class="ivb-shaft s2"></div>
    <div class="ivb-shaft s3"></div>
    <div class="ivb-glow"></div>
    <div v-for="side in ['l', 'r']" :key="side" class="ivb-brazier" :class="side">
      <div class="ivb-halo"></div>
      <div class="ivb-fl"></div>
      <div class="ivb-fl b"></div>
      <div class="ivb-bowl"></div>
    </div>
    <div v-for="(m, i) in motes" :key="'m' + i" class="ivb-mote" :style="m"></div>
  </div>
</template>

<script setup lang="ts">
/** Dalles du sol : lignes qui fuient vers le point de fuite, puis rangées qui s'espacent. */
const floor: number[][] = [];
for (let i = -8; i <= 8; i++) floor.push([200 + i * 10, 430, 200 + i * 90, 800]);
for (let y = 440, step = 8; y < 800; step *= 1.32, y += step) floor.push([0, y, 400, y]);

/** Poussières lumineuses qui montent. ⚠️ Le hasard est purement décoratif. */
const motes = Array.from({ length: 16 }, () => {
  const s = 2 + Math.random() * 2.5;
  return {
    left: `${8 + Math.random() * 84}%`,
    width: `${s}px`,
    height: `${s}px`,
    '--dx': `${(Math.random() - 0.5) * 60}px`,
    animationDuration: `${7 + Math.random() * 7}s`,
    animationDelay: `${-Math.random() * 14}s`,
  };
});
</script>

<style lang="scss">
.ivb {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ivb-sky {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(70% 40% at 50% 22%, #2b2340, transparent 70%),
    linear-gradient(to bottom, #120f1c 0%, #1a1522 40%, #211a14 58%, #17120d 100%);
}
.ivb-stars {
  position: absolute;
  inset: 0 0 60% 0;
  opacity: 0.5;
  background-image:
    radial-gradient(1px 1px at 12% 18%, #fff8 50%, transparent 51%),
    radial-gradient(1px 1px at 72% 12%, #fff6 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 34% 40%, #fff5 50%, transparent 51%),
    radial-gradient(1px 1px at 86% 46%, #fff7 50%, transparent 51%),
    radial-gradient(1px 1px at 22% 72%, #fff4 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 62% 30%, #fff6 50%, transparent 51%),
    radial-gradient(1px 1px at 48% 8%, #fff5 50%, transparent 51%),
    radial-gradient(1px 1px at 92% 78%, #fff4 50%, transparent 51%);
}
.ivb-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ivb-stone {
  fill: #2a2230;
}
.ivb-stone2 {
  fill: #221b28;
}
.ivb-edge {
  fill: none;
  stroke: #4a3d52;
  stroke-width: 1.2;
}
.ivb-floor {
  stroke: #3a2f2a;
  stroke-width: 1;
}
.ivb-win {
  fill: #0e0b18;
}
.ivb-glow {
  position: absolute;
  left: 50%;
  top: 60%;
  width: min(150vw, 660px);
  height: min(50vw, 220px);
  transform: translate(-50%, -30%);
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--c) 30%, transparent),
    transparent
  );
  opacity: 0.7;
}
.ivb-shaft {
  position: absolute;
  top: -10%;
  left: 50%;
  width: 90px;
  height: 75%;
  margin-left: -45px;
  transform-origin: top center;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, #b57bff 22%, transparent),
    transparent 85%
  );
  filter: blur(10px);
  opacity: 0.5;
  animation: ivb-shaft 7s ease-in-out infinite;
  &.s2 {
    transform: rotate(14deg);
    animation-delay: -2.3s;
    width: 60px;
    margin-left: -30px;
  }
  &.s3 {
    transform: rotate(-14deg);
    animation-delay: -4.6s;
    width: 60px;
    margin-left: -30px;
  }
}
@keyframes ivb-shaft {
  50% {
    opacity: 0.18;
  }
}
.ivb-brazier {
  position: absolute;
  bottom: 20%;
  width: 34px;
  height: 60px;
  &.l {
    left: 6%;
  }
  &.r {
    right: 6%;
  }
}
.ivb-bowl {
  position: absolute;
  bottom: 0;
  left: 2px;
  right: 2px;
  height: 14px;
  border-radius: 0 0 16px 16px;
  background: #3a2e38;
  border-top: 2px solid #5a4a55;
}
.ivb-fl {
  position: absolute;
  bottom: 12px;
  left: 50%;
  width: 22px;
  height: 38px;
  margin-left: -11px;
  border-radius: 50% 50% 45% 45% / 65% 65% 35% 35%;
  background: radial-gradient(
    ellipse at 50% 75%,
    #fff6c8 0 18%,
    #ffb23f 45%,
    #ff6a45 70%,
    transparent 72%
  );
  transform-origin: bottom center;
  filter: drop-shadow(0 0 10px #ff9a3f);
  animation: ivb-flick 1.3s ease-in-out infinite alternate;
  &.b {
    width: 14px;
    height: 26px;
    margin-left: -7px;
    opacity: 0.8;
    animation-duration: 0.9s;
    animation-delay: -0.4s;
  }
}
.ivb-halo {
  position: absolute;
  bottom: -10px;
  left: 50%;
  width: 170px;
  height: 170px;
  margin-left: -85px;
  border-radius: 50%;
  background: radial-gradient(closest-side, #ff9a3f33, transparent);
  animation: ivb-halo 2.6s ease-in-out infinite alternate;
}
@keyframes ivb-flick {
  0% {
    transform: scale(1, 1) rotate(-2deg);
  }
  50% {
    transform: scale(0.92, 1.08) rotate(3deg);
  }
  100% {
    transform: scale(1.05, 0.94) rotate(-1deg);
  }
}
@keyframes ivb-halo {
  to {
    opacity: 0.55;
    transform: scale(0.92);
  }
}
.ivb-mote {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 6px var(--c);
  opacity: 0;
  animation: ivb-mote linear infinite;
}
@keyframes ivb-mote {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  15% {
    opacity: 0.8;
  }
  85% {
    opacity: 0.5;
  }
  100% {
    transform: translate(var(--dx), -75vh);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ivb-shaft,
  .ivb-fl,
  .ivb-halo,
  .ivb-mote {
    animation: none;
  }
}
</style>
