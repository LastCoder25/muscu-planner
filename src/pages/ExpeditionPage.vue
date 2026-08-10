<template>
  <q-page class="expe">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Expédition <span class="beta">bêta</span></div>
      <button class="iconbtn" aria-label="Nouvelle carte" @click="regen">🎲</button>
    </header>

    <!-- Barre d'état : étage + PV -->
    <div class="hud">
      <div class="hud-floor">Étage <b>{{ run.floor + 1 }}</b> / {{ run.floors }}</div>
      <div class="hud-pv">
        <div class="pv-bar"><div class="pv-fill" :style="{ width: pvPct + '%' }" /></div>
        <span class="pv-txt">❤️ {{ run.pv }}/{{ run.maxPv }}</span>
      </div>
    </div>

    <!-- Butin cumulé du run -->
    <div class="bag">
      <span class="bag-chip">🪙 {{ gold }}</span>
      <span class="bag-chip">✨ {{ dust }}</span>
      <span class="bag-chip">🎒 {{ loot.length }}</span>
    </div>

    <!-- Réglages bêta (nb d'étages) -->
    <div class="floors-pick">
      <span>Étages :</span>
      <button
        v-for="n in [2, 3, 4, 5]"
        :key="n"
        class="fp"
        :class="{ on: floorsWanted === n }"
        @click="setFloors(n)"
      >
        {{ n }}
      </button>
    </div>

    <!-- Carte de l'étage -->
    <div class="map-wrap">
      <svg :viewBox="`0 0 ${cols * CELL} ${rows * CELL}`" class="map">
        <!-- Couloirs (entre salles visibles) -->
        <line
          v-for="c in corridors"
          :key="c.k"
          class="corridor"
          :x1="c.x1"
          :y1="c.y1"
          :x2="c.x2"
          :y2="c.y2"
        />
        <!-- Salles -->
        <g
          v-for="r in floor.rooms"
          :key="r.id"
          :class="['room', roomClass(r.id)]"
          @click="onRoomClick(r.id)"
        >
          <rect
            :x="cx(r) - SIZE / 2"
            :y="cy(r) - SIZE / 2"
            :width="SIZE"
            :height="SIZE"
            rx="9"
            class="room-bg"
          />
          <text :x="cx(r)" :y="cy(r) + 1" class="room-emo">{{ roomGlyph(r) }}</text>
        </g>
      </svg>
    </div>

    <!-- Dernier événement (placeholder résolution) -->
    <div v-if="lastEvent" class="event" :class="lastEvent.kind">{{ lastEvent.text }}</div>

    <!-- Actions contextuelles -->
    <div class="actions">
      <q-btn
        v-if="onStairs"
        color="primary"
        text-color="dark"
        no-caps
        unelevated
        icon="south"
        label="Descendre à l'étage suivant"
        @click="goDown"
      />
      <q-btn
        v-else-if="onBoss"
        color="primary"
        text-color="dark"
        no-caps
        unelevated
        icon="emoji_events"
        label="Terminer l'expédition (bêta)"
        @click="finish"
      />
      <div v-else class="hint">
        Touche une salle <b>?</b> reliée pour explorer. Les couloirs mènent vers l'inconnu.
      </div>
    </div>

    <!-- Fin de run (bêta) -->
    <q-dialog v-model="over" persistent>
      <q-card class="over-card">
        <div class="over-emo">{{ run.status === 'cleared' ? '🏆' : '💀' }}</div>
        <div class="over-title font-display">
          {{ run.status === 'cleared' ? 'Expédition nettoyée !' : 'Vous êtes tombé…' }}
        </div>
        <div class="over-haul">🪙 {{ gold }} · ✨ {{ dust }} · 🎒 {{ loot.length }} objet(s)</div>
        <div class="over-sub">
          <template v-if="run.status === 'cleared'">Bien joué !</template>
          <template v-else>Tu gardes l'or et la poussière ; le gear reste au donjon.</template>
          Bêta : le butin n'est pas encore crédité au perso (Phase suivante : clés + récompenses).
        </div>
        <div class="over-row">
          <q-btn flat no-caps label="Rejouer" color="primary" @click="regen" />
          <q-btn flat no-caps label="Sortir" @click="router.back()" />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  generateDungeon,
  startRun,
  canMove,
  enterRoom,
  applyDamage,
  descend,
  isVisible,
  ROOM_EMOJI,
  type Floor,
  type Room,
  type RunState,
} from '@/lib/dungeonCrawl';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { computeCharacter } from '@/lib/character';
import { playerWithGear, rollDrop, type Item } from '@/lib/items';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, mulberry32, type Combatant } from '@/lib/combat';

const route = useRoute();
const router = useRouter();
const char = useCharacterStore();
const progress = useProgress();

// Perso réel (stats de fond + équipement + talents) → combattant.
const character = computed(() =>
  computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    progress.energyEarned.value + (char.row?.login_energy ?? 0),
    char.row?.energy_spent ?? 0,
  ),
);
const talentFx = computed(() => talentEffects(char.row?.talents ?? []));
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    talentFx.value,
    character.value.level.level,
  ),
);
const heroLevel = computed(() => character.value.level.level);

const CELL = 66;
const SIZE = 46; // côté d'une salle (carré arrondi)
const TRAP_DMG = 14; // dégâts d'un piège (équilibrage bêta, provisoire)

const floorsWanted = ref(Math.min(5, Math.max(2, Number(route.query.floors) || 3)));
// Seed pseudo-aléatoire (composant → Math.random autorisé, contrairement aux libs).
const seed = ref(Math.floor(Math.random() * 1_000_000) + 1);
const dungeon = ref<Floor[]>(generateDungeon(seed.value, floorsWanted.value));
const run = ref<RunState>(startRun(floorsWanted.value, dungeon.value[0]!, 140));
const lastEvent = ref<{ kind: string; text: string } | null>(null);
const over = ref(false);
// Butin cumulé du run (Phase 3b : affiché ; persistance/récompense = Phase 3c).
const gold = ref(0);
const dust = ref(0);
const loot = ref<Item[]>([]);
let lootN = 0;

// Dès que les stats du perso sont prêtes, (ré)initialise le run avec les VRAIS PV.
let booted = false;
watch(
  () => progress.ready.value && !!char.row,
  (ok) => {
    if (ok && !booted) {
      booted = true;
      freshRun();
    }
  },
  { immediate: true },
);

const floor = computed(() => dungeon.value[run.value.floor]!);
const cols = computed(() => floor.value.cols);
const rows = computed(() => floor.value.rows);
const pvPct = computed(() => Math.round((run.value.pv / run.value.maxPv) * 100));
const currentRoom = computed(() => floor.value.rooms[run.value.current]!);
const onStairs = computed(() => currentRoom.value.type === 'stairs' && run.value.status === 'exploring');
const onBoss = computed(() => currentRoom.value.type === 'boss' && run.value.status === 'exploring');

const cx = (r: Room) => r.x * CELL + CELL / 2;
const cy = (r: Room) => r.y * CELL + CELL / 2;

// Couloirs visibles (au moins une extrémité visible ; dédup via id croissant).
const corridors = computed(() => {
  const out: { k: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const r of floor.value.rooms) {
    if (!isVisible(floor.value, run.value, r.id)) continue;
    for (const nb of r.links) {
      if (nb <= r.id) continue;
      if (!isVisible(floor.value, run.value, nb)) continue;
      const b = floor.value.rooms[nb]!;
      out.push({ k: `${r.id}-${nb}`, x1: cx(r), y1: cy(r), x2: cx(b), y2: cy(b) });
    }
  }
  return out;
});

function roomClass(id: number): string {
  if (!isVisible(floor.value, run.value, id)) return 'hidden';
  if (id === run.value.current) return 'current';
  if (run.value.visited.includes(id)) return 'visited';
  const clickable = canMove(run.value, floor.value, id);
  return clickable ? 'frontier open' : 'frontier';
}
function roomGlyph(r: Room): string {
  if (!isVisible(floor.value, run.value, r.id)) return '';
  if (!run.value.visited.includes(r.id)) return '?'; // frontière : type inconnu
  return ROOM_EMOJI[r.type];
}

// Monstre de salle scalé au niveau du perso + profondeur de l'étage. Volontairement
// plus faible qu'un boss de palier (une salle = une bouchée) : c'est l'ACCUMULATION
// sur l'étage, PV reportés, qui use → l'Endurance compte. (équilibrage provisoire bêta)
function makeMonster(isBoss: boolean, depth: number): Combatant {
  const L = heroLevel.value;
  const t = isBoss ? 2.4 : 1;
  const d = 0.8 + 0.5 * depth;
  return {
    name: isBoss ? 'Gardien de l’étage' : 'Rôdeur',
    pv: Math.round((28 + 14 * L) * d * t),
    damage: Math.round((5 + 2.6 * L) * d * t),
    crit: 0.05,
    dodge: 0.04 + 0.03 * depth,
    initiative: 8,
    strikes: 1,
  };
}
// Seed déterministe par salle (rejouable pour une même carte).
function roomSeed(id: number): number {
  return (seed.value * 131 + run.value.floor * 7919 + id * 17) >>> 0 || 1;
}
const depthOf = () => (run.value.floors > 1 ? run.value.floor / (run.value.floors - 1) : 0);

function fightRoom(id: number, isBoss: boolean) {
  const monster = makeMonster(isBoss, depthOf());
  const goldWin = Math.round((6 + 3 * heroLevel.value) * (isBoss ? 4 : 1));
  const res = simulateCombat(fighter.value, monster, {
    seed: roomSeed(id),
    goldOnWin: goldWin,
    startPlayerPv: run.value.pv,
  });
  const finalPv = res.log.length ? res.log[res.log.length - 1]!.playerPv : run.value.pv;
  run.value = { ...run.value, pv: finalPv, status: finalPv <= 0 ? 'dead' : run.value.status };
  if (res.win) {
    gold.value += res.gold;
    const dd = Math.round(2 + heroLevel.value * 0.5) * (isBoss ? 3 : 1);
    dust.value += dd;
    lastEvent.value = {
      kind: 'good',
      text: `${isBoss ? '👑' : '👾'} Vaincu ! +${res.gold} 🪙 +${dd} ✨ · ${finalPv} PV`,
    };
  } else {
    lastEvent.value = { kind: 'bad', text: `💀 Battu par le ${monster.name.toLowerCase()}…` };
  }
}
function openChest(id: number) {
  const rng = mulberry32(roomSeed(id));
  let drop: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 4 && !drop; k++)
    drop = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: heroLevel.value,
      luck: 0.4,
      spread: 1,
    });
  if (drop) {
    loot.value.push({ ...drop, id: `exp_${lootN++}` });
    dust.value += 3;
    lastEvent.value = { kind: 'good', text: `🎁 ${drop.name} !` };
  } else {
    lastEvent.value = { kind: 'neutral', text: '🎁 Coffre vide…' };
  }
}

function onRoomClick(id: number) {
  if (!canMove(run.value, floor.value, id)) return;
  const wasNew = !run.value.visited.includes(id);
  const target = floor.value.rooms[id]!;
  run.value = enterRoom(run.value, floor.value, id);
  if (!wasNew) {
    lastEvent.value = null;
    return;
  }
  switch (target.type) {
    case 'trap':
      run.value = applyDamage(run.value, TRAP_DMG);
      lastEvent.value = { kind: 'bad', text: `⚠️ Piège ! −${TRAP_DMG} PV` };
      break;
    case 'monster':
      fightRoom(id, false);
      break;
    case 'boss':
      fightRoom(id, true);
      break;
    case 'chest':
      openChest(id);
      break;
    case 'stairs':
      lastEvent.value = { kind: 'good', text: '🔽 Escalier — descends à l’étage suivant' };
      break;
    default:
      lastEvent.value = { kind: 'neutral', text: '· Salle vide' };
  }
  if (run.value.status === 'dead') over.value = true;
}

function goDown() {
  const next = dungeon.value[run.value.floor + 1] ?? null;
  run.value = descend(run.value, next);
  lastEvent.value = null;
  if (run.value.status === 'cleared') over.value = true;
}
function finish() {
  run.value = descend(run.value, null); // dernier étage → nettoyé
  over.value = true;
}

// (Ré)initialise un run sur la carte courante avec les VRAIS PV du perso.
function freshRun() {
  dungeon.value = generateDungeon(seed.value, floorsWanted.value);
  run.value = startRun(floorsWanted.value, dungeon.value[0]!, fighter.value.pv || 140);
  gold.value = 0;
  dust.value = 0;
  loot.value = [];
  lootN = 0;
  lastEvent.value = null;
  over.value = false;
}
function regen() {
  seed.value = Math.floor(Math.random() * 1_000_000) + 1;
  freshRun();
}
function setFloors(n: number) {
  floorsWanted.value = n;
  regen();
}
</script>

<style scoped>
.expe {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 40px;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
}
.iconbtn {
  background: none;
  border: none;
  color: var(--text);
  font-size: 24px;
  cursor: pointer;
  width: 36px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.beta {
  font-size: 10px;
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 7px;
  vertical-align: middle;
}
.hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.hud-floor {
  font-size: 13px;
  color: var(--dim);
}
.hud-floor b {
  color: var(--text);
  font-size: 15px;
}
.hud-pv {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 240px;
}
.pv-bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--surface-3, var(--line));
  overflow: hidden;
}
.pv-fill {
  height: 100%;
  background: var(--d1);
  border-radius: 4px;
  transition: width 0.3s;
}
.pv-txt {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
}
.bag {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.bag-chip {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 10px;
}
.floors-pick {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 12px;
}
.fp {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}
.fp.on {
  border-color: var(--accent);
  color: var(--accent);
}
.map-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px;
}
.map {
  width: 100%;
  height: auto;
  display: block;
}
.corridor {
  stroke: var(--line);
  stroke-width: 6;
  stroke-linecap: round;
}
.room {
  cursor: default;
}
.room .room-bg {
  fill: var(--surface-2);
  stroke: var(--line);
  stroke-width: 2;
}
.room .room-emo {
  text-anchor: middle;
  dominant-baseline: central;
  font-size: 22px;
  fill: var(--text);
}
.room.hidden .room-bg {
  fill: transparent;
  stroke: transparent;
}
.room.visited .room-bg {
  fill: var(--surface-2);
  stroke: var(--line);
}
.room.current .room-bg {
  fill: color-mix(in srgb, var(--accent) 22%, var(--surface));
  stroke: var(--accent);
  stroke-width: 3;
}
.room.frontier .room-bg {
  fill: var(--surface);
  stroke: var(--dim);
  stroke-dasharray: 4 4;
}
.room.frontier .room-emo {
  fill: var(--dim);
  font-weight: 700;
}
.room.frontier.open {
  cursor: pointer;
}
.room.frontier.open .room-bg {
  stroke: var(--accent);
  stroke-dasharray: 5 3;
}
.room.frontier.open .room-emo {
  fill: var(--accent);
}
.event {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  text-align: center;
}
.event.bad {
  background: color-mix(in srgb, var(--d4) 20%, transparent);
  color: var(--d4);
}
.event.good {
  background: color-mix(in srgb, var(--d1) 20%, transparent);
  color: var(--d1);
}
.event.fight {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}
.event.neutral {
  background: var(--surface-2);
  color: var(--dim);
}
.actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.hint {
  font-size: 12.5px;
  color: var(--dim);
  text-align: center;
  line-height: 1.5;
}
.over-card {
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  padding: 22px;
  text-align: center;
  min-width: 260px;
}
.over-emo {
  font-size: 44px;
}
.over-title {
  font-size: 20px;
  font-weight: 700;
  margin: 6px 0;
}
.over-haul {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 8px;
}
.over-sub {
  font-size: 12.5px;
  color: var(--dim);
  line-height: 1.5;
  margin-bottom: 14px;
}
.over-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
