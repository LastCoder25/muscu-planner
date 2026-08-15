<template>
  <div class="stage" :class="{ qshake: stageShake }">
    <div v-if="critFlash" class="crit-flash" />
    <div class="cs-vs">
      <!-- Joueur (avatar SVG) -->
      <div
        class="cs-side player"
        :class="{ shake: shakeSide === 'player', lunge: lungeSide === 'player' }"
      >
        <div class="cs-fighter idle-player" :class="{ hit: shakeSide === 'player' }">
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
        <div v-if="heal && heal.side === 'player'" class="cs-pop heal">{{ heal.text }}</div>
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
        <div class="cs-emo-wrap">
          <span class="cs-aura" :class="'ar-' + foeArchetype" />
          <div class="cs-emo" :class="['idle-' + foeArchetype, { hit: shakeSide === 'monster' }]">
            {{ foe?.emoji ?? '👾' }}
          </div>
        </div>
        <span v-if="burstSide === 'monster'" class="cs-burst" />
        <div class="cs-name">
          {{ foe?.name ?? '—' }}
          <span v-if="foeArchetype !== 'normal'" class="cs-arch" :class="'ar-' + foeArchetype">{{
            ARCH_LABEL[foeArchetype]
          }}</span>
        </div>
        <div class="cs-bar">
          <span class="ghost gm" :style="{ width: mPct + '%' }" />
          <span class="m" :style="{ width: mPct + '%' }" />
        </div>
        <div class="cs-pv">{{ monsterPv }}</div>
        <div v-if="pop && pop.side === 'monster'" class="cs-pop" :class="pop.kind">{{ pop.text }}</div>
        <div v-if="heal && heal.side === 'monster'" class="cs-pop heal">{{ heal.text }}</div>
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
  archetype?: string; // identité visuelle (aura + idle)
  log: CombatEvent[];
}

const ARCH_LABEL: Record<string, string> = {
  evasive: 'insaisissable',
  striker: 'féroce',
  brute: 'brutal',
  tank: 'colosse',
  normal: '',
};
const props = defineProps<{
  playerName: string;
  playerMaxPv: number;
  // PV du joueur AU DÉBUT du combat (attrition : Labyrinthe/donjon avec PV reportés).
  // Défaut = playerMaxPv (le combat démarre à pleine vie). Évite l'illusion « gros
  // coup au démarrage » quand la barre partait du max puis chutait aux PV réels.
  playerStartPv?: number;
  fights: StageFight[];
  playerProfile: 'puissant' | 'agile' | 'polyvalent';
  playerEquipped: Equipped;
}>();
const startPv = computed(() => props.playerStartPv ?? props.playerMaxPv);
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
const playerPv = ref(startPv.value);
const monsterPv = ref(props.fights[0]?.maxPv ?? 1);
const pop = ref<{ side: 'player' | 'monster'; text: string; kind: string } | null>(null);
const heal = ref<{ side: 'player' | 'monster'; text: string } | null>(null); // soin (vol de vie) / épines
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
const foeArchetype = computed(() => foe.value?.archetype ?? 'normal');
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
  // Soin / épines : détecte les PV qui remontent (vol de vie) ou qui baissent hors
  // du coup direct (épines) → petit pop dédié, en plus du pop de dégâts.
  heal.value = null;
  const prevP = playerPv.value;
  const prevM = monsterPv.value;
  if (step.fi === fightIdx.value) {
    if (e.playerPv > prevP) heal.value = { side: 'player', text: `+${e.playerPv - prevP}` };
    else if (e.monsterPv > prevM) heal.value = { side: 'monster', text: `+${e.monsterPv - prevM}` };
    // Épines : le joueur attaqué renvoie des dégâts → le monstre perd des PV pendant SON tour.
    else if (e.who === 'monster' && e.monsterPv < prevM)
      heal.value = { side: 'monster', text: `↩−${prevM - e.monsterPv}` };
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
  heal.value = null;
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
  heal.value = null;
  clearFx();
  playerPv.value = startPv.value;
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
.cs-emo-wrap {
  position: relative;
  width: 56px;
  height: 56px;
  margin: 0 auto;
  display: grid;
  place-items: center;
}
.cs-emo {
  font-size: 40px;
  line-height: 1.1;
  transition: filter 0.05s;
  position: relative;
  z-index: 1;
}
.cs-emo.hit {
  filter: brightness(1.9) drop-shadow(0 0 5px var(--d4));
}
/* Aura d'archétype (derrière l'emoji) : halo teinté qui pulse doucement. */
.cs-aura {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  opacity: 0.5;
  filter: blur(7px);
  animation: auraPulse 2.4s ease-in-out infinite;
}
.cs-aura.ar-normal {
  display: none;
}
.cs-aura.ar-evasive {
  background: radial-gradient(circle, #4ec6d6 0%, transparent 70%);
}
.cs-aura.ar-striker {
  background: radial-gradient(circle, #ff6a45 0%, transparent 70%);
}
.cs-aura.ar-brute {
  background: radial-gradient(circle, #ff3b1f 0%, transparent 70%);
}
.cs-aura.ar-tank {
  background: radial-gradient(circle, #9aa7b5 0%, transparent 70%);
}
@keyframes auraPulse {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.4;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.65;
  }
}
/* Idle « respiration » selon l'archétype (feel distinct par monstre). */
.idle-evasive {
  animation: idleFloat 1.5s ease-in-out infinite;
}
.idle-striker {
  animation: idleTwitch 1.3s ease-in-out infinite;
}
.idle-brute {
  animation: idleHeavy 2.6s ease-in-out infinite;
}
.idle-tank {
  animation: idleHeavy 3.4s ease-in-out infinite;
}
.idle-normal {
  animation: idleFloat 2.6s ease-in-out infinite;
}
.idle-player {
  animation: idleFloat 3s ease-in-out infinite;
}
@keyframes idleFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
@keyframes idleTwitch {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-2px) rotate(-3deg);
  }
}
@keyframes idleHeavy {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}
.cs-arch {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 1px 5px;
  border-radius: 999px;
  margin-left: 4px;
  vertical-align: middle;
}
.cs-arch.ar-evasive {
  color: #4ec6d6;
  border: 1px solid #4ec6d6;
}
.cs-arch.ar-striker {
  color: #ff6a45;
  border: 1px solid #ff6a45;
}
.cs-arch.ar-brute {
  color: #ff3b1f;
  border: 1px solid #ff3b1f;
}
.cs-arch.ar-tank {
  color: #9aa7b5;
  border: 1px solid #9aa7b5;
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
  .cs-side.monster.enter,
  .cs-aura,
  .idle-evasive,
  .idle-striker,
  .idle-brute,
  .idle-tank,
  .idle-normal,
  .idle-player {
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
.cs-pop.heal {
  color: var(--d1);
  top: 40px;
  font-size: 12px;
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
