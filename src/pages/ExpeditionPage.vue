<template>
  <q-page class="expe">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Expédition</div>
      <div class="iconbtn" />
    </header>

    <!-- LOBBY : lancer une expédition (coûte 1 clé) -->
    <div v-if="phase === 'lobby'" class="lobby">
      <div class="lobby-emo">🗝️</div>
      <div class="lobby-keys"><b>{{ keys }}</b> clé{{ keys > 1 ? 's' : '' }}</div>
      <p class="lobby-txt">
        Un donjon à <b>étages</b> à explorer : salles, coffres, pièges, boss. Tes <b>PV se
        reportent</b> entre les salles — c'est l'attrition qui te met en danger. À la mort tu gardes
        l'<b>or</b> et la <b>poussière</b>, mais tu perds les objets trouvés.
      </p>
      <p class="lobby-txt dim">Les clés 🗝️ tombent sur les donjons, les boss et la faille.</p>
      <q-btn
        class="lobby-cta"
        color="primary"
        text-color="dark"
        no-caps
        unelevated
        size="lg"
        :disable="!canStart"
        :label="keys > 0 ? 'Lancer une expédition (−1 🗝️)' : 'Aucune clé pour l’instant'"
        @click="start"
      />
    </div>

    <!-- RUNNING : exploration -->
    <template v-else>
      <div class="hud">
        <div class="hud-floor">Étage <b>{{ run.floor + 1 }}</b> / {{ run.floors }}</div>
        <div class="hud-pv">
          <div class="pv-bar"><div class="pv-fill" :style="{ width: pvPct + '%' }" /></div>
          <span class="pv-txt">❤️ {{ run.pv }}/{{ run.maxPv }}</span>
        </div>
      </div>

      <div class="bag">
        <span class="bag-chip">🪙 {{ gold }}</span>
        <span class="bag-chip">✨ {{ dust }}</span>
        <span class="bag-chip">🎒 {{ loot.length }}</span>
      </div>

      <div class="map-wrap">
        <svg :viewBox="`0 0 ${cols * CELL} ${rows * CELL}`" class="map">
          <line
            v-for="c in corridors"
            :key="c.k"
            class="corridor"
            :x1="c.x1"
            :y1="c.y1"
            :x2="c.x2"
            :y2="c.y2"
          />
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

      <div v-if="lastEvent" class="event" :class="lastEvent.kind">{{ lastEvent.text }}</div>

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
          label="Vaincre & terminer l'expédition"
          @click="finish"
        />
        <div v-else class="hint">
          Touche une salle <b>?</b> reliée pour explorer. Les couloirs mènent vers l'inconnu.
        </div>
        <button v-if="canRetreat" type="button" class="retreat-btn" @click="retreat">
          🚪 Sortir en gardant le butin
        </button>
      </div>
    </template>

    <!-- Fin de run (bêta) -->
    <q-dialog v-model="over" persistent>
      <q-card class="over-card">
        <div class="over-emo">{{ run.status === 'cleared' ? '🏆' : '💀' }}</div>
        <div class="over-title font-display">
          {{ run.status === 'cleared' ? 'Expédition nettoyée !' : 'Vous êtes tombé…' }}
        </div>
        <div class="over-haul">
          🪙 {{ gold }} · ✨ {{ dust }} ·
          🎒 {{ run.status === 'dead' ? 0 : loot.length }} objet(s)
        </div>
        <div class="over-sub">
          <template v-if="run.status === 'cleared'">
            Butin crédité (+ trésor final) 🎉
          </template>
          <template v-else>
            Tu es tombé : l'or et la poussière sont gardés, les objets restent au donjon.
          </template>
        </div>
        <div class="over-row">
          <q-btn
            flat
            no-caps
            :label="keys > 0 ? 'Nouvelle expédition (−1 🗝️)' : 'Pas de clé'"
            color="primary"
            :disable="!canStart"
            @click="replay"
          />
          <q-btn flat no-caps label="Sortir" @click="router.back()" />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useProgress } from '@/composables/useProgress';
import { computeCharacter } from '@/lib/character';
import { playerWithGear, rollDrop, rollSetPiece, ITEM_SETS, type Item } from '@/lib/items';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, mulberry32, type Combatant } from '@/lib/combat';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const progress = useProgress();

// Phase : lobby (choix de lancer, coûte 1 clé) → running (exploration).
const phase = ref<'lobby' | 'running'>('lobby');
const credited = ref(false); // butin crédité une seule fois en fin de run
const keys = computed(() => char.row?.keys ?? 0);
const canStart = computed(() => keys.value > 0 && progress.ready.value && !!char.row);

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

onMounted(async () => {
  try {
    await char.fetchMine();
  } catch {
    /* pas bloquant */
  }
});

const floor = computed(() => dungeon.value[run.value.floor]!);
const cols = computed(() => floor.value.cols);
const rows = computed(() => floor.value.rows);
const pvPct = computed(() => Math.round((run.value.pv / run.value.maxPv) * 100));
const currentRoom = computed(() => floor.value.rooms[run.value.current]!);
const onStairs = computed(() => currentRoom.value.type === 'stairs' && run.value.status === 'exploring');
const onBoss = computed(() => currentRoom.value.type === 'boss' && run.value.status === 'exploring');
// Retraite possible depuis le départ ou un escalier (banque le butin, pas de trésor final).
const canRetreat = computed(
  () =>
    run.value.status === 'exploring' &&
    (currentRoom.value.type === 'start' || currentRoom.value.type === 'stairs'),
);

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
  if (run.value.status === 'dead') void endRun('dead');
}

function goDown() {
  const next = dungeon.value[run.value.floor + 1] ?? null;
  run.value = descend(run.value, next);
  lastEvent.value = null;
}
function finish() {
  void endRun('cleared');
}
function retreat() {
  void endRun('retreat');
}

// Nb d'étages selon le niveau du perso (2 → 5).
function floorsForLevel(): number {
  return Math.min(5, Math.max(2, 2 + Math.floor(heroLevel.value / 5)));
}
// Trésor final garanti à la victoire (haute chance + haute rareté). ~15 % de
// chance que ce soit une PIÈCE DE SET (2e voie d'accès aux sets, cf. ticket) —
// les boss restent la source garantie/ciblée.
function rollTreasure(): Item | null {
  const rng = mulberry32((seed.value * 977 + 4242) >>> 0 || 1);
  if (rng() < 0.15 && ITEM_SETS.length) {
    const set = ITEM_SETS[Math.floor(rng() * ITEM_SETS.length)]!;
    const piece = rollSetPiece(rng, { setId: set.id, level: heroLevel.value, luck: 0.85 });
    return { ...piece, id: `exp_t_${lootN++}` };
  }
  let d: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 8 && !d; k++)
    d = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: heroLevel.value + 1,
      luck: 0.85,
      spread: 0,
    });
  return d ? { ...d, id: `exp_t_${lootN++}` } : null;
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

// Lance une expédition (consomme 1 clé) : carte fraîche, PV pleins.
async function start() {
  const uid = auth.user?.id;
  if (!uid || !canStart.value) return;
  const ok = await char.spendKey(uid);
  if (!ok) {
    $q.notify({ type: 'warning', message: 'Il te faut une clé 🗝️ (donjons, boss, faille).' });
    return;
  }
  seed.value = Math.floor(Math.random() * 1_000_000) + 1;
  floorsWanted.value = floorsForLevel();
  credited.value = false;
  freshRun();
  phase.value = 'running';
}

// Termine le run et CRÉDITE le butin au perso. Mort → or+poussière seuls (gear
// perdu) ; nettoyé → + trésor final ; retraite → butin gardé, pas de trésor final.
async function endRun(outcome: 'cleared' | 'dead' | 'retreat') {
  run.value = { ...run.value, status: outcome === 'dead' ? 'dead' : 'cleared' };
  if (!credited.value) {
    credited.value = true;
    if (outcome === 'cleared') {
      const t = rollTreasure();
      if (t) loot.value.push(t);
    }
    const uid = auth.user?.id;
    if (uid)
      await char.applyExpedition(uid, {
        gold: gold.value,
        dust: dust.value,
        drops: outcome === 'dead' ? [] : loot.value,
      });
  }
  over.value = true;
}
// Relance directement une nouvelle expédition depuis la modale de fin (−1 clé).
function replay() {
  over.value = false;
  void start();
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
/* Lobby */
.lobby {
  text-align: center;
  padding: 24px 16px;
}
.lobby-emo {
  font-size: 52px;
}
.lobby-keys {
  font-size: 15px;
  color: var(--dim);
  margin-top: 4px;
}
.lobby-keys b {
  color: var(--accent);
  font-size: 22px;
}
.lobby-txt {
  font-size: 13.5px;
  color: var(--text);
  line-height: 1.55;
  max-width: 460px;
  margin: 14px auto 0;
}
.lobby-txt.dim {
  color: var(--dim);
  font-size: 12.5px;
}
.lobby-cta {
  margin-top: 20px;
  height: 54px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  min-width: 260px;
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
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.retreat-btn {
  background: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  padding: 8px 14px;
  cursor: pointer;
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
