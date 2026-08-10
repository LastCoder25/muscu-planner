<template>
  <div class="stage" :class="{ qshake: stageShake }">
    <div v-if="critFlash" class="crit-flash" />
    <div class="cs-vs">
      <!-- Joueur (avatar SVG) -->
      <div
        class="cs-side player"
        :class="{ shake: shakeSide === 'player', lunge: lungeSide === 'player' }"
      >
        <div class="cs-fighter" :class="{ hit: shakeSide === 'player' }">
          <AventureAvatar :profile="playerProfile" :equipped="playerEquipped" />
        </div>
        <span v-if="burstSide === 'player'" class="cs-burst" />
        <div class="cs-name">{{ playerName }}</div>
        <div class="cs-bar">
          <span class="ghost gp" :style="{ width: pPct + '%' }" />
          <span class="p" :style="{ width: pPct + '%' }" />
        </div>
        <div class="cs-pv">{{ playerPv }}</div>
        <div v-if="pop && pop.side === 'player'" class="cs-pop" :class="pop.kind">{{ pop.text }}</div>
      </div>

      <div class="cs-mid">⚔️</div>

      <!-- Monstre courant -->
      <div
        class="cs-side monster"
        :class="{
          shake: shakeSide === 'monster',
          lunge: lungeSide === 'monster',
          dead: monsterDead,
          enter: monsterEnter,
        }"
      >
        <div class="cs-emo" :class="{ hit: shakeSide === 'monster' }">{{ foe?.emoji ?? '👾' }}</div>
        <span v-if="burstSide === 'monster'" class="cs-burst" />
        <div class="cs-name">{{ foe?.name ?? '—' }}</div>
        <div class="cs-bar">
          <span class="ghost gm" :style="{ width: mPct + '%' }" />
          <span class="m" :style="{ width: mPct + '%' }" />
        </div>
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
import type { Equipped } from '@/lib/items';
import AventureAvatar from '@/components/AventureAvatar.vue';

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
  playerProfile: 'puissant' | 'agile' | 'polyvalent';
  playerEquipped: Equipped;
}>();
const emit = defineEmits<{ done: [] }>(); // fin de l'animation → révèle résultat + butin

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
const burstSide = ref<'player' | 'monster' | null>(null);
const lungeSide = ref<'player' | 'monster' | null>(null); // l'attaquant s'élance
const stageShake = ref(false); // secousse de toute la scène sur un critique
const critFlash = ref(false); // éclair plein écran sur un critique
const monsterDead = ref(false); // le monstre tombe à 0 PV
const monsterEnter = ref(false); // le monstre suivant entre en scène (donjon)
const done = ref(false);
const lastWin = ref(false);

const foe = computed(() => props.fights[fightIdx.value] ?? null);
const pPct = computed(() => Math.round((playerPv.value / Math.max(1, props.playerMaxPv)) * 100));
const mPct = computed(() =>
  Math.round((monsterPv.value / Math.max(1, foe.value?.maxPv ?? 1)) * 100),
);

let timer: ReturnType<typeof setInterval> | undefined;
let popTimer: ReturnType<typeof setTimeout> | undefined;

function clearFx() {
  shakeSide.value = null;
  burstSide.value = null;
  lungeSide.value = null;
  stageShake.value = false;
  critFlash.value = false;
}
function apply(step: { fi: number; e: CombatEvent }) {
  const e = step.e;
  // Changement de combat (donjon) → le monstre suivant entre en scène.
  if (step.fi !== fightIdx.value) {
    fightIdx.value = step.fi;
    monsterDead.value = false;
    monsterEnter.value = true;
    setTimeout(() => (monsterEnter.value = false), 320);
  }
  playerPv.value = e.playerPv;
  monsterPv.value = e.monsterPv;
  const attacker = e.who; // 'player' | 'monster'
  const defender = e.who === 'player' ? 'monster' : 'player';
  lungeSide.value = attacker; // l'attaquant s'élance vers la cible
  if (e.type === 'dodge') {
    pop.value = { side: defender, text: 'esquive', kind: 'dodge' };
  } else {
    pop.value = {
      side: defender,
      text: (e.type === 'crit' ? 'CRIT −' : '−') + e.damage,
      kind: e.type,
    };
    shakeSide.value = defender;
    burstSide.value = defender; // étincelle d'impact
    if (e.type === 'crit') {
      stageShake.value = true; // crit = toute la scène tremble + éclair
      critFlash.value = true;
    }
  }
  if (e.monsterPv <= 0) monsterDead.value = true; // le monstre tombe
  clearTimeout(popTimer);
  popTimer = setTimeout(clearFx, 160);
}

function finish() {
  clearInterval(timer);
  timer = undefined;
  pop.value = null;
  clearFx();
  const last = steps.value[steps.value.length - 1];
  lastWin.value = !!last && last.e.monsterPv <= 0 && last.e.playerPv > 0;
  done.value = true;
  emit('done');
}

function start() {
  clearInterval(timer);
  done.value = false;
  i.value = 0;
  fightIdx.value = 0;
  monsterDead.value = false;
  monsterEnter.value = false;
  clearFx();
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
  position: relative;
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
  transition: transform 0.12s ease-out;
}
/* Coup porté : l'attaquant s'élance vers le centre. */
.cs-side.player.lunge {
  transform: translateX(16px);
}
.cs-side.monster.lunge {
  transform: translateX(-16px);
}
/* Monstre : mort (tombe) et entrée du suivant. */
.cs-side.monster.dead {
  transform: translateY(8px) rotate(12deg);
  opacity: 0.15;
  transition:
    transform 0.35s ease-in,
    opacity 0.35s ease-in;
}
.cs-side.monster.enter {
  animation: enterFoe 0.32s ease-out;
}
@keyframes enterFoe {
  0% {
    opacity: 0;
    transform: translateX(30px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
/* Joueur : avatar SVG comme sprite. */
.cs-fighter {
  width: 48px;
  height: 58px;
  margin: 0 auto;
  transition: filter 0.05s;
}
.cs-fighter.hit {
  filter: brightness(1.6) drop-shadow(0 0 5px var(--d4));
}
.cs-emo {
  font-size: 40px;
  line-height: 1.1;
  transition: filter 0.05s;
}
.cs-emo.hit {
  filter: brightness(1.9) drop-shadow(0 0 5px var(--d4));
}
/* Éclair plein écran sur un critique. */
.crit-flash {
  position: absolute;
  inset: 0;
  background: var(--accent);
  opacity: 0;
  pointer-events: none;
  border-radius: 12px;
  animation: critflash 0.22s ease-out;
}
@keyframes critflash {
  0% {
    opacity: 0.35;
  }
  100% {
    opacity: 0;
  }
}
/* Étincelle d'impact : anneau qui s'étend et s'estompe. */
.cs-burst {
  position: absolute;
  top: 20px;
  left: 50%;
  width: 30px;
  height: 30px;
  margin: -15px 0 0 -15px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  pointer-events: none;
  animation: burst 0.28s ease-out;
}
@keyframes burst {
  0% {
    opacity: 0.9;
    transform: scale(0.3);
  }
  100% {
    opacity: 0;
    transform: scale(1.7);
  }
}
/* Crit : toute la scène tremble. */
.stage.qshake {
  animation: qshake 0.16s linear;
}
@keyframes qshake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(-3px, 2px);
  }
  75% {
    transform: translate(3px, -2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cs-burst,
  .stage.qshake,
  .crit-flash,
  .cs-side.monster.enter {
    animation: none;
  }
  .cs-side,
  .cs-bar .ghost {
    transition: none;
  }
  .cs-emo.hit,
  .cs-fighter.hit {
    filter: none;
  }
}
.cs-name {
  font-size: 12px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cs-bar {
  position: relative;
  height: 8px;
  background: var(--surface-2, #2a241c);
  border-radius: 5px;
  overflow: hidden;
  margin: 4px 0 2px;
}
/* Barre réelle (rapide) + barre « fantôme » (blanche, se vide en retard) → on voit
   le morceau de PV perdu d'un coup. */
.cs-bar .p,
.cs-bar .m,
.cs-bar .ghost {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
}
.cs-bar .ghost {
  background: rgba(255, 255, 255, 0.55);
  transition: width 0.55s ease 0.08s;
}
.cs-bar .p {
  background: var(--d1);
  transition: width 0.1s linear;
}
.cs-bar .m {
  background: var(--d4);
  transition: width 0.1s linear;
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
