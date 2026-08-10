<template>
  <div class="stage">
    <div class="cs-vs">
      <!-- Joueur -->
      <div class="cs-side" :class="{ shake: shakeSide === 'player' }">
        <div class="cs-emo">🛡️</div>
        <div class="cs-name">{{ playerName }}</div>
        <div class="cs-bar"><span class="p" :style="{ width: pPct + '%' }" /></div>
        <div class="cs-pv">{{ playerPv }}</div>
        <div v-if="pop && pop.side === 'player'" class="cs-pop" :class="pop.kind">{{ pop.text }}</div>
      </div>

      <div class="cs-mid">⚔️</div>

      <!-- Monstre courant -->
      <div class="cs-side" :class="{ shake: shakeSide === 'monster' }">
        <div class="cs-emo">{{ foe?.emoji ?? '👾' }}</div>
        <div class="cs-name">{{ foe?.name ?? '—' }}</div>
        <div class="cs-bar"><span class="m" :style="{ width: mPct + '%' }" /></div>
        <div class="cs-pv">{{ monsterPv }}</div>
        <div v-if="pop && pop.side === 'monster'" class="cs-pop" :class="pop.kind">{{ pop.text }}</div>
      </div>
    </div>

    <div class="cs-foot">
      <span v-if="fights.length > 1" class="cs-prog">Combat {{ fightIdx + 1 }}/{{ fights.length }}</span>
      <span v-if="done" class="cs-result" :class="lastWin ? 'win' : 'lose'">
        {{ lastWin ? '🏆 Victoire' : '💀 Défaite' }}
      </span>
      <button v-if="done" class="cs-replay" @click="start">⟲ Rejouer</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Rejeu ANIMÉ d'un combat à partir du log EXACT (seedé) de simulateCombat :
// barres de PV, dégâts flottants, crit/esquive, shake. Prototype Phase 1.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { CombatEvent } from '@/lib/combat';

interface StageFight {
  name: string;
  emoji: string;
  maxPv: number;
  log: CombatEvent[];
}
const props = defineProps<{
  playerName: string;
  playerMaxPv: number;
  fights: StageFight[];
}>();

// Séquence à plat : chaque pas = un événement + l'index de son combat.
const steps = computed(() => {
  const out: { fi: number; e: CombatEvent }[] = [];
  props.fights.forEach((f, fi) => f.log.forEach((e) => out.push({ fi, e })));
  return out;
});
const stepMs = computed(() => (steps.value.length > 60 ? 90 : steps.value.length > 25 ? 150 : 220));

const i = ref(0);
const fightIdx = ref(0);
const playerPv = ref(props.playerMaxPv);
const monsterPv = ref(props.fights[0]?.maxPv ?? 1);
const pop = ref<{ side: 'player' | 'monster'; text: string; kind: string } | null>(null);
const shakeSide = ref<'player' | 'monster' | null>(null);
const done = ref(false);
const lastWin = ref(false);

const foe = computed(() => props.fights[fightIdx.value] ?? null);
const pPct = computed(() => Math.round((playerPv.value / Math.max(1, props.playerMaxPv)) * 100));
const mPct = computed(() =>
  Math.round((monsterPv.value / Math.max(1, foe.value?.maxPv ?? 1)) * 100),
);

let timer: ReturnType<typeof setInterval> | undefined;
let popTimer: ReturnType<typeof setTimeout> | undefined;

function apply(step: { fi: number; e: CombatEvent }) {
  fightIdx.value = step.fi;
  const e = step.e;
  playerPv.value = e.playerPv;
  monsterPv.value = e.monsterPv;
  // Le défenseur = l'opposé de l'attaquant (who = attaquant).
  const defender = e.who === 'player' ? 'monster' : 'player';
  if (e.type === 'dodge') {
    pop.value = { side: defender, text: 'esquive', kind: 'dodge' };
  } else {
    pop.value = {
      side: defender,
      text: (e.type === 'crit' ? 'CRIT −' : '−') + e.damage,
      kind: e.type,
    };
    shakeSide.value = defender;
    clearTimeout(popTimer);
    popTimer = setTimeout(() => (shakeSide.value = null), 140);
  }
}

function finish() {
  clearInterval(timer);
  timer = undefined;
  pop.value = null;
  shakeSide.value = null;
  const last = steps.value[steps.value.length - 1];
  lastWin.value = !!last && last.e.monsterPv <= 0 && last.e.playerPv > 0;
  done.value = true;
}

function start() {
  clearInterval(timer);
  done.value = false;
  i.value = 0;
  fightIdx.value = 0;
  playerPv.value = props.playerMaxPv;
  monsterPv.value = props.fights[0]?.maxPv ?? 1;
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !steps.value.length) {
    // Accessibilité : pas d'animation → état final direct.
    if (steps.value.length) apply(steps.value[steps.value.length - 1]!);
    finish();
    return;
  }
  timer = setInterval(() => {
    if (i.value >= steps.value.length) return finish();
    apply(steps.value[i.value]!);
    i.value++;
  }, stepMs.value);
}

onMounted(start);
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(popTimer);
});
</script>

<style scoped lang="scss">
.stage {
  padding: 8px 0 4px;
}
.cs-vs {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 8px;
}
.cs-side {
  position: relative;
  text-align: center;
  min-width: 0;
}
.cs-emo {
  font-size: 40px;
  line-height: 1.1;
}
.cs-name {
  font-size: 12px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-bar {
  height: 8px;
  background: var(--surface-2, #2a241c);
  border-radius: 5px;
  overflow: hidden;
  margin: 4px 0 2px;
}
.cs-bar .p {
  display: block;
  height: 100%;
  background: var(--d1);
  transition: width 0.12s linear;
}
.cs-bar .m {
  display: block;
  height: 100%;
  background: var(--d4);
  transition: width 0.12s linear;
}
.cs-pv {
  font-size: 11px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cs-mid {
  align-self: center;
  font-size: 20px;
  opacity: 0.6;
}
.cs-pop {
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  font-weight: 800;
  font-size: 14px;
  color: var(--text);
  animation: floatpop 0.5s ease-out;
  pointer-events: none;
  white-space: nowrap;
}
.cs-pop.crit {
  color: var(--accent);
  font-size: 17px;
}
.cs-pop.dodge {
  color: var(--dim);
  font-style: italic;
}
@keyframes floatpop {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -14px);
  }
}
.shake {
  animation: shake 0.14s linear;
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cs-pop,
  .shake {
    animation: none;
  }
}
.cs-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
  min-height: 24px;
}
.cs-prog {
  font-size: 12px;
  color: var(--dim);
}
.cs-result {
  font-weight: 700;
  font-size: 14px;
}
.cs-result.win {
  color: var(--d1);
}
.cs-result.lose {
  color: var(--d4);
}
.cs-replay {
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 999px;
  padding: 5px 12px;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
</style>
