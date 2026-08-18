<template>
  <q-page class="expe">
    <GameLoader :show="booting" icon="🗝️" label="Entrée dans le Labyrinthe…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="router.back()">‹</button>
      <div class="top-title font-display">Labyrinthe</div>
      <div class="iconbtn" />
    </header>

    <!-- LOBBY : lancer une expédition (coûte 1 clé) -->
    <div v-if="phase === 'lobby'" class="lobby">
      <div class="lobby-emo">🗝️</div>
      <div class="lobby-keys">
        <b>{{ keys }}</b> clé{{ keys > 1 ? 's' : '' }}
      </div>
      <p class="lobby-txt">
        Un donjon à <b>étages</b> à explorer : salles, coffres, pièges, boss. Tes
        <b>PV se reportent</b> entre les salles — c'est l'attrition qui te met en danger. À la mort
        tu gardes l'<b>or</b> et la <b>poussière</b>, mais tu perds les objets trouvés.
      </p>
      <p class="lobby-txt dim">Les clés 🗝️ tombent sur les donjons, les boss et la faille.</p>
      <p v-if="!labyUnlocked" class="lobby-txt dim">
        🔒 Construis la <b>🚪 Porte du Labyrinthe</b> sur la carte d'expédition pour le débloquer.
      </p>
      <p v-else-if="labyLuck > 0" class="lobby-txt dim">
        🚪 Porte niv.{{ gateLevel }} : butin des coffres +{{ Math.round(labyLuck * 100) }} %.
      </p>
      <q-btn
        class="lobby-cta"
        color="primary"
        text-color="dark"
        no-caps
        unelevated
        size="lg"
        :disable="!canStart"
        :label="
          !labyUnlocked
            ? '🔒 Porte du Labyrinthe requise'
            : keys > 0
              ? 'Entrer dans le labyrinthe (−1 🗝️)'
              : 'Aucune clé pour l’instant'
        "
        @click="start"
      />
    </div>

    <!-- RUNNING : exploration -->
    <template v-else>
      <div class="hud">
        <div class="hud-floor">
          Étage <b>{{ run.floor + 1 }}</b> / {{ run.floors }}
        </div>
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
          label="Vaincre & sortir du labyrinthe"
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

    <!-- Animation de salle : combat / coffre / piège -->
    <q-dialog :model-value="!!roomFx" persistent>
      <q-card class="fx-card">
        <template v-if="roomFx?.kind === 'combat'">
          <CombatStage
            :key="run.current"
            :player-name="char.row?.pseudo ?? 'Toi'"
            :player-max-pv="run.maxPv"
            :player-start-pv="stageStartPv"
            :fights="stageFights"
            :player-profile="playerProfile"
            :player-equipped="playerEquipped"
            @done="fxDone = true"
          />
          <template v-if="fxDone">
            <div class="fx-result" :class="roomFx.win ? 'good' : 'bad'">
              {{ roomFx.win ? '🏆 Victoire !' : '💀 Défaite…' }}
            </div>
            <q-btn
              class="fx-cta"
              color="primary"
              text-color="dark"
              no-caps
              unelevated
              label="Continuer"
              @click="closeFx"
            />
          </template>
        </template>

        <template v-else-if="roomFx?.kind === 'chest'">
          <div class="chest-anim">🎁</div>
          <!-- Détail complet de l'objet gagné -->
          <div v-if="roomFx.item" class="fx-loot-card" :class="'r-' + roomFx.item.rarity">
            <div class="fl-emoji">{{ roomFx.item.emoji }}</div>
            <div class="fl-name">{{ roomFx.item.name }}</div>
            <div class="fl-meta">
              {{ RARITY_LABEL[roomFx.item.rarity] }} · {{ SLOT_LABEL[roomFx.item.slot] }} · niv
              {{ roomFx.item.level }}
            </div>
            <div class="fl-eff">✦ {{ effectLabel(roomFx.item.effect, roomFx.item.level) }}</div>
            <div v-if="roomFx.item.setId" class="fl-set">🧩 Pièce de set</div>
          </div>
          <div v-else class="fx-result neutral">Coffre vide…</div>
          <q-btn
            class="fx-cta"
            color="primary"
            text-color="dark"
            no-caps
            unelevated
            :label="roomFx.item ? 'Récupérer' : 'Continuer'"
            @click="closeFx"
          />
        </template>

        <template v-else-if="roomFx?.kind === 'descend'">
          <div class="descend-anim">🪜</div>
          <div class="fx-result good">Étage {{ run.floor + 1 }} / {{ run.floors }}</div>
        </template>

        <template v-else-if="roomFx?.kind === 'trap'">
          <div class="trap-anim">⚠️</div>
          <div class="fx-result bad">Piège ! −{{ roomFx.dmg }} PV</div>
          <q-btn
            class="fx-cta"
            color="primary"
            text-color="dark"
            no-caps
            unelevated
            label="Continuer"
            @click="closeFx"
          />
        </template>
      </q-card>
    </q-dialog>

    <!-- Fin de run (bêta) -->
    <q-dialog v-model="over" persistent>
      <q-card class="over-card">
        <div class="over-emo">{{ run.status === 'cleared' ? '🏆' : '💀' }}</div>
        <div class="over-title font-display">
          {{ run.status === 'cleared' ? 'Labyrinthe nettoyé !' : 'Vous êtes tombé…' }}
        </div>
        <div class="over-haul">
          🪙 {{ gold }} · ✨ {{ dust }} · 🎒 {{ run.status === 'dead' ? 0 : loot.length }} objet(s)
        </div>
        <div class="over-sub">
          <template v-if="run.status === 'cleared'"> Butin crédité (+ trésor final) 🎉 </template>
          <template v-else>
            Tu es tombé : l'or et la poussière sont gardés, les objets restent au donjon.
          </template>
        </div>

        <!-- Récap du butin ramené (pour juger la rentabilité du run sans fouiller le sac) -->
        <div v-if="run.status !== 'dead' && loot.length" class="over-loot">
          <div class="ol-title">Objets rapportés</div>
          <div v-for="(it, i) in loot" :key="i" class="ol-item" :class="'r-' + it.rarity">
            <span class="ol-emo">{{ it.emoji }}</span>
            <div class="ol-main">
              <span class="ol-name">{{ it.name }}</span>
              <span class="ol-meta"
                >{{ RARITY_LABEL[it.rarity] }} · {{ effectLabel(it.effect, it.level) }}</span
              >
            </div>
          </div>
        </div>
        <div class="over-row">
          <q-btn
            flat
            no-caps
            :label="keys > 0 ? 'Nouveau labyrinthe (−1 🗝️)' : 'Pas de clé'"
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
import { useGameFx } from '@/composables/useGameFx';
import { labyrinthUnlocked, labyrinthLuckBonus } from '@/lib/buildings';
import { computeCharacter } from '@/lib/character';
import {
  playerWithGear,
  rollDrop,
  rollSetPiece,
  ITEM_SETS,
  effectLabel,
  RARITY_LABEL,
  RARITY_RANK,
  tierIndexOf,
  SLOT_LABEL,
  type Item,
  type Rarity,
} from '@/lib/items';
import { rollActivityFamiliar } from '@/data/familiars';
import { talentEffects } from '@/lib/talents';
import { simulateCombat, mulberry32, type Combatant, type CombatEvent } from '@/lib/combat';
import CombatStage from '@/components/CombatStage.vue';
import GameLoader from '@/components/GameLoader.vue';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const gameFx = useGameFx();
const progress = useProgress();

// Rang d'objet (G..SSS) → intensité d'animation GameFx (5 crans).
function fxRarity(r: Rarity): 'common' | 'rare' | 'epic' | 'legendary' | 'divin' {
  const i = RARITY_RANK[r];
  return i >= 9 ? 'divin' : i >= 7 ? 'legendary' : i >= 5 ? 'epic' : i >= 3 ? 'rare' : 'common';
}

// Phase : lobby (choix de lancer, coûte 1 clé) → running (exploration).
const phase = ref<'lobby' | 'running'>('lobby');
const credited = ref(false); // butin crédité une seule fois en fin de run
const keys = computed(() => char.row?.keys ?? 0);
// Le Labyrinthe est débloqué en construisant la 🚪 Porte du Labyrinthe sur la carte.
// Chaque niveau de la Porte enrichit le butin des coffres (labyLuck).
const labyUnlocked = computed(() => labyrinthUnlocked(char.row?.buildings ?? []));
const gateLevel = computed(
  () => (char.row?.buildings ?? []).find((b) => b.typeId === 'labyrinth_gate')?.level ?? 0,
);
const labyLuck = computed(() => labyrinthLuckBonus(char.row?.buildings ?? []));
const canStart = computed(
  () => labyUnlocked.value && keys.value > 0 && progress.ready.value && !!char.row,
);

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
const talentFx = computed(() =>
  talentEffects(char.row?.talents ?? [], character.value.level.level),
);
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

const floorsWanted = ref(Math.min(5, Math.max(2, Number(route.query.floors) || 3)));
// Seed pseudo-aléatoire (composant → Math.random autorisé, contrairement aux libs).
const seed = ref(Math.floor(Math.random() * 1_000_000) + 1);
const dungeon = ref<Floor[]>(generateDungeon(seed.value, floorsWanted.value));
// Le pool de PV du run = les VRAIS PV max du héros (avant : 140 fixe → incohérent
// avec le combat qui, lui, plafonnait le vol de vie aux PV réels → on remontait au
// max à chaque combat). Ré-initialisé dans onMounted une fois le perso chargé.
const run = ref<RunState>(
  startRun(floorsWanted.value, dungeon.value[0]!, Math.max(60, fighter.value.pv)),
);
// Vol de vie ATTÉNUÉ dans le labyrinthe → l'attrition (PV reportés) reste réelle même
// pour un build sustain (sinon on finit tous les étages à PV pleins).
const LABY_LIFESTEAL = 0.5;
const lastEvent = ref<{ kind: string; text: string } | null>(null);
const over = ref(false);
// Butin cumulé du run (Phase 3b : affiché ; persistance/récompense = Phase 3c).
const gold = ref(0);
const dust = ref(0);
const loot = ref<Item[]>([]);
let lootN = 0;

// Animation de salle (combat / coffre / piège) jouée en overlay avant de continuer.
type StageFight = { name: string; emoji: string; maxPv: number; log: CombatEvent[] };
const roomFx = ref<{
  kind: 'combat' | 'chest' | 'trap' | 'descend';
  win?: boolean;
  item?: Item | null;
  dmg?: number;
} | null>(null);
const stageFights = ref<StageFight[]>([]);
const stageStartPv = ref(0); // PV du joueur AU DÉBUT du combat animé (attrition)
const fxDone = ref(false); // combat : résultat révélé à la fin de l'animation
const playerProfile = computed(() => character.value.profile);
const playerEquipped = computed(() => char.row?.equipped ?? {});

// Écran de chargement thématique bref à l'entrée du Labyrinthe (immersion).
const booting = ref(true);
onMounted(async () => {
  setTimeout(() => (booting.value = false), 750);
  try {
    await char.fetchMine();
  } catch {
    /* pas bloquant */
  }
  // Perso chargé (équipement/talents inclus) → cale le pool sur les vrais PV max,
  // tant que le run n'a pas commencé (uniquement la salle de départ visitée).
  if (run.value.visited.length <= 1)
    run.value = startRun(floorsWanted.value, dungeon.value[0]!, Math.max(60, fighter.value.pv));
});

const floor = computed(() => dungeon.value[run.value.floor]!);
const cols = computed(() => floor.value.cols);
const rows = computed(() => floor.value.rows);
const pvPct = computed(() => Math.round((run.value.pv / run.value.maxPv) * 100));
const currentRoom = computed(() => floor.value.rooms[run.value.current]!);
const onStairs = computed(
  () => currentRoom.value.type === 'stairs' && run.value.status === 'exploring',
);
const onBoss = computed(
  () => currentRoom.value.type === 'boss' && run.value.status === 'exploring',
);
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
// Monstres calibrés RELATIVEMENT au joueur (le sport rend le perso très fort en
// absolu → une échelle fixe le laissait one-shot tout sans jamais perdre de PV).
// pv = k × dégâts/tour du joueur (⇒ le monstre SURVIT et riposte) ; dégâts = part
// des PV max du joueur (⇒ attrition réelle). Deeper = plus dur (push-your-luck).
function makeMonster(isBoss: boolean, depth: number): Combatant {
  const f = fighter.value;
  const pTurn = f.damage * (f.strikes ?? 1) * (1 + f.crit); // dégâts/tour approx du joueur
  const P = f.pv;
  const d = 0.85 + 0.55 * depth; // 0.85 (surface) → 1.4 (fond)
  return {
    name: isBoss ? 'Gardien de l’étage' : 'Rôdeur',
    // Coriaces : survivent ~3 tours (rôdeur) / ~6,5 tours (gardien) → de VRAIS
    // combats de plusieurs rounds (avant : ~1,5 tour → mouraient en un coup).
    pv: Math.max(10, Math.round(pTurn * (isBoss ? 6.5 : 3) * d)),
    // Frappent plus fort : ~5,5 % (rôdeur) / ~9 % (gardien) des PV max par coup.
    damage: Math.max(1, Math.round(P * (isBoss ? 0.09 : 0.055) * d)),
    crit: 0.05 + 0.05 * depth,
    dodge: 0.03 + 0.04 * depth,
    initiative: isBoss ? 14 : 8,
    strikes: 1,
  };
}
// Piège = 5 % des PV max du joueur (proportionnel, plus les 14 fixes ridicules).
const trapDmg = computed(() => Math.max(8, Math.round(fighter.value.pv * 0.05)));
// Seed déterministe par salle (rejouable pour une même carte).
function roomSeed(id: number): number {
  return (seed.value * 131 + run.value.floor * 7919 + id * 17) >>> 0 || 1;
}
const depthOf = () => (run.value.floors > 1 ? run.value.floor / (run.value.floors - 1) : 0);

function fightRoom(id: number, isBoss: boolean) {
  const monster = makeMonster(isBoss, depthOf());
  const goldWin = Math.round((6 + 3 * heroLevel.value) * (isBoss ? 4 : 1));
  stageStartPv.value = run.value.pv; // PV AVANT le combat (barre part de là, pas du max)
  // Combattant du labyrinthe : max PLAFONNÉ au pool courant (le vol de vie ne peut
  // pas dépasser les PV reportés → pas de « remontée au max » entre les combats) et
  // vol de vie atténué → l'attrition compte vraiment.
  const combatFighter: Combatant = {
    ...fighter.value,
    pv: run.value.pv,
    lifesteal: (fighter.value.lifesteal ?? 0) * LABY_LIFESTEAL,
  };
  const res = simulateCombat(combatFighter, monster, {
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
  // Rejoue le combat animé (log seedé exact) en overlay.
  stageFights.value = [
    { name: monster.name, emoji: isBoss ? '👑' : '👾', maxPv: monster.pv, log: res.log },
  ];
  fxDone.value = false;
  roomFx.value = { kind: 'combat', win: res.win };
}
function openChest(id: number) {
  const rng = mulberry32(roomSeed(id));
  // Plus on est profond, plus la rareté du coffre grimpe (récompense du risque),
  // + bonus de la Porte du Labyrinthe (chaque niveau enrichit le butin).
  const luck = Math.min(1, 0.35 + 0.45 * depthOf() + labyLuck.value);
  let drop: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 4 && !drop; k++)
    drop = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: heroLevel.value,
      luck,
      spread: 1,
    });
  const item = drop ? { ...drop, id: `exp_${lootN++}` } : null;
  if (item) {
    loot.value.push(item);
    dust.value += 3;
    lastEvent.value = { kind: 'good', text: `🎁 ${item.name} !` };
  } else {
    lastEvent.value = { kind: 'neutral', text: '🎁 Coffre vide…' };
  }
  roomFx.value = { kind: 'chest', item };
}
// Ferme l'overlay de salle ; si le combat a été fatal, on bascule sur la fin de run.
function closeFx() {
  roomFx.value = null;
  if (run.value.status === 'dead') void endRun('dead');
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
      run.value = applyDamage(run.value, trapDmg.value);
      lastEvent.value = { kind: 'bad', text: `⚠️ Piège ! −${trapDmg.value} PV` };
      roomFx.value = { kind: 'trap', dmg: trapDmg.value }; // mort gérée à la fermeture (closeFx)
      break;
    case 'monster':
      fightRoom(id, false);
      break;
    case 'boss':
      fightRoom(id, true);
      break;
    case 'chest':
      openChest(id);
      regen(0.06); // le repos d'un coffre soigne un peu
      break;
    case 'stairs':
      lastEvent.value = { kind: 'good', text: '🔽 Escalier — descends à l’étage suivant' };
      break;
    default:
      regen(0.1); // salle vide = on souffle → petite récupération
      lastEvent.value = { kind: 'neutral', text: '· Salle vide — tu récupères un peu' };
  }
}
// Régénère `pct` des PV MAX (salles sûres) → l'attrition reste survivable malgré
// des monstres plus coriaces ; pousser en profondeur (moins de salles sûres) reste risqué.
function regen(pct: number) {
  const max = run.value.maxPv;
  const pv = Math.min(max, run.value.pv + Math.round(max * pct));
  run.value = { ...run.value, pv };
}

function goDown() {
  const next = dungeon.value[run.value.floor + 1] ?? null;
  run.value = descend(run.value, next);
  lastEvent.value = null;
  // Animation de descente d'étage (l'étage suivant est déjà chargé derrière).
  roomFx.value = { kind: 'descend' };
  setTimeout(() => {
    if (roomFx.value?.kind === 'descend') closeFx();
  }, 1200);
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
// Trésor final = la « belle récompense » du clear (le seul intérêt de pousser
// jusqu'au bout malgré l'attrition). Objet de HAUT niveau (heroLevel+2), rareté
// GARANTIE épique minimum, ~25 % de chance d'être une pièce de set convoitée.
function rollTreasure(): Item | null {
  const rng = mulberry32((seed.value * 977 + 4242) >>> 0 || 1);
  if (rng() < 0.25 && ITEM_SETS.length) {
    const set = ITEM_SETS[Math.floor(rng() * ITEM_SETS.length)]!;
    const piece = rollSetPiece(rng, { setId: set.id, level: heroLevel.value + 1, luck: 1 });
    return { ...piece, id: `exp_t_${lootN++}` };
  }
  // Garde le MEILLEUR tier (rang+qualité) sur plusieurs tirages → « belle récompense »
  // RELATIVE à la profondeur. (Le rang est plafonné par la profondeur : un seuil absolu
  // « ≥ B » était impossible sous ~niv.22 → la garantie devenait du code mort.)
  let best: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 8; k++) {
    const cand = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: heroLevel.value + 2,
      luck: 1,
      spread: 0,
    });
    if (cand && (!best || tierIndexOf(cand) > tierIndexOf(best))) best = cand;
  }
  return best ? { ...best, id: `exp_t_${lootN++}` } : null;
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
  if (!uid) return;
  if (!labyUnlocked.value) {
    $q.notify({
      type: 'warning',
      message: 'Construis la 🚪 Porte du Labyrinthe (carte d’expédition) pour le débloquer.',
    });
    return;
  }
  if (!canStart.value) return;
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
      // SIGNATURE du Labyrinthe : un FAMILIER garanti au clear (voie thémée/garantie).
      const famRng = mulberry32((seed.value * 131 + 91) >>> 0 || 1);
      const fam = rollActivityFamiliar(famRng, { level: heroLevel.value + 1, luck: 1 });
      loot.value.push({ ...fam, id: `exp_f_${lootN++}` });
      gameFx.celebrate({
        kind: 'familiar',
        emoji: fam.emoji,
        title: 'Familier trouvé !',
        subtitle: `${fam.name} · ${RARITY_LABEL[fam.rarity]}`,
        rarity: fxRarity(fam.rarity),
      });
    }
    // Pierres magiques 💎 (voie diffuse) : proportionnelles à la progression du run
    // (la poussière amassée = proxy des salles/monstres) + bonus de clear.
    const stones = Math.max(2, Math.round(dust.value / 3)) + (outcome === 'cleared' ? 4 : 0);
    const uid = auth.user?.id;
    if (uid)
      await char.applyExpedition(uid, {
        gold: gold.value,
        dust: dust.value,
        stones: outcome === 'dead' ? Math.floor(stones / 2) : stones,
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
  min-height: 54px;
  height: auto;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  min-width: 260px;
  padding: 10px 18px;
}
/* Le libellé (avec le nombre de clés) peut être long → il s'enroule proprement au
   lieu de déborder sous le bouton (hauteur auto). */
.lobby-cta :deep(.q-btn__content) {
  white-space: normal;
  line-height: 1.25;
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
/* Overlay d'animation de salle (combat / coffre / piège) */
.fx-card {
  background: var(--surface);
  color: var(--text);
  border-radius: 16px;
  padding: 16px;
  width: 100%;
  max-width: 440px;
  text-align: center;
}
.fx-result {
  font-size: 18px;
  font-weight: 800;
  margin-top: 12px;
}
.fx-result.good {
  color: var(--d1);
}
.fx-result.bad {
  color: var(--d4);
}
.fx-result.neutral {
  color: var(--dim);
}
.fx-cta {
  margin-top: 14px;
  width: 100%;
  height: 48px;
  border-radius: 12px;
  font-weight: 700;
}
/* Coffre : rebond + ouverture */
.chest-anim {
  font-size: 76px;
  animation: chest-open 0.9s ease-out;
  transform-origin: bottom center;
}
@keyframes chest-open {
  0% {
    transform: scale(0.5) rotate(0);
    opacity: 0;
  }
  40% {
    transform: scale(1.1) rotate(-6deg);
    opacity: 1;
  }
  55% {
    transform: scale(1) rotate(6deg);
  }
  70% {
    transform: scale(1.15) rotate(-3deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
/* Carte détaillée de l'objet gagné (coffre) */
.fx-loot-card {
  margin: 12px auto 0;
  max-width: 300px;
  border: 2px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  background: var(--surface-2);
  animation: fx-pop 0.4s ease-out 0.5s both;
}
.fl-emoji {
  font-size: 34px;
}
.fl-name {
  font-size: 16px;
  font-weight: 800;
  margin-top: 2px;
}
.fl-meta {
  font-size: 11.5px;
  color: var(--dim);
  margin-top: 2px;
}
.fl-eff {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  margin-top: 8px;
}
.fl-set {
  font-size: 11.5px;
  color: var(--accent);
  margin-top: 4px;
}
/* Rangs G→SSS : couleur portée par --rk (voir défs communes plus bas). */
.r-G {
  --rk: #9a8f7e;
}
.r-F {
  --rk: #8f9c86;
}
.r-E {
  --rk: #6bd18a;
}
.r-D {
  --rk: #4ec6d6;
}
.r-C {
  --rk: #5a9bff;
}
.r-B {
  --rk: #b07cff;
}
.r-A {
  --rk: var(--accent);
}
.r-S {
  --rk: #ff9a3f;
}
.r-SS {
  --rk: #ff5b5b;
}
.r-SSS {
  --rk: #ff5cd8;
}
.fx-loot-card[class*='r-'] {
  border-color: var(--rk, var(--line));
}
/* Descente d'étage */
.descend-anim {
  font-size: 76px;
  animation: descend 1s ease-in;
}
@keyframes descend {
  0% {
    transform: translateY(-40px);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translateY(30px);
    opacity: 0.85;
  }
}
@keyframes fx-pop {
  0% {
    transform: scale(0.6);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
/* Piège : secousse + flash rouge */
.trap-anim {
  font-size: 76px;
  animation: trap-shake 0.5s ease-in-out;
}
@keyframes trap-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-8px) rotate(-5deg);
  }
  40% {
    transform: translateX(8px) rotate(5deg);
  }
  60% {
    transform: translateX(-6px);
  }
  80% {
    transform: translateX(6px);
  }
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
.over-loot {
  text-align: left;
  max-height: 200px;
  overflow-y: auto;
  margin: 0 0 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ol-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--dim);
  font-weight: 700;
  margin-bottom: 2px;
}
.ol-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  border-left-width: 3px;
  background: var(--surface);
}
.ol-item[class*='r-'] {
  border-left-color: var(--rk, var(--line));
}
.ol-emo {
  font-size: 18px;
}
.ol-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ol-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.ol-meta {
  font-size: 11px;
  color: var(--dim);
}
.over-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
