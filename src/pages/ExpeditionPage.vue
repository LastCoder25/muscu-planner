<template>
  <component :is="embedded ? 'div' : 'q-page'" class="expe" :class="{ embedded }">
    <GameLoader :show="booting" icon="🗝️" label="Entrée dans le Labyrinthe…" />
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
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
        tu <b>perds les objets trouvés</b> et une part des gains (or/poussière/pierres) qui
        <b>grandit avec la profondeur du palier</b>. La <b>retraite</b> banque tout le ramassé.
      </p>
      <p class="lobby-txt dim">Les clés 🗝️ tombent sur les donjons, les boss et la faille.</p>
      <p v-if="!labyUnlocked" class="lobby-txt dim">
        🔒 Construis la <b>🚪 Porte du Labyrinthe</b> sur la carte d'expédition pour le débloquer.
      </p>
      <p v-else-if="labyLuck > 0" class="lobby-txt dim">
        🚪 Porte niv.{{ gateLevel }} : butin des coffres +{{ Math.round(labyLuck * 100) }} %.
      </p>

      <!-- Ladder : paliers de plus en plus profonds, débloqués en chaîne. -->
      <div v-if="labyUnlocked" class="laby-list">
        <div
          v-for="t in tiers"
          :key="t.laby.id"
          class="laby-tier"
          :class="{ locked: !t.unlocked, cleared: t.cleared }"
        >
          <span class="lt-emo">{{ t.unlocked ? t.laby.emoji : '🔒' }}</span>
          <div class="lt-main">
            <div class="lt-name font-display">
              {{ t.laby.name }}
              <span v-if="t.cleared" class="lt-badge">✓</span>
            </div>
            <div class="lt-meta">
              Niv {{ t.laby.recoLevel }} · {{ t.laby.floors }} étages ·
              <span
                class="lt-pow"
                :class="{ ok: myPow >= recommendedPower(t.laby.recoLevel) }"
                title="Puissance conseillée pour ce palier — compare à la tienne"
                >⚔️ conseillé {{ fmtPow(recommendedPower(t.laby.recoLevel)) }}</span
              >
              ·
              <span class="lt-fam"
                >🐾 familier rang <b>{{ t.laby.rank }}</b></span
              >
              ·
              <span
                class="lt-band"
                :style="{
                  color: RANK_COLOR[dropPeakRank(t.laby.dropLevel, t.laby.luck, 0, heroLevel)],
                }"
                title="Rang le plus probable — tous les rangs peuvent tomber, seuls les % varient"
                >🎖️ ~{{ dropPeakRank(t.laby.dropLevel, t.laby.luck, 0, heroLevel) }}</span
              >
              · <span class="lt-death">💀 garde {{ t.deathKeep }}%</span>
            </div>
            <div v-if="!t.unlocked" class="lt-lock">
              🔒 Nettoie «
              {{ LABYRINTHS[LABYRINTHS.findIndex((l) => l.id === t.laby.id) - 1]?.name }} » d’abord
            </div>
          </div>
          <div v-if="t.unlocked" class="lt-actions">
            <button type="button" class="lt-go" :disabled="keys < 1" @click="start(t.laby)">
              {{ keys > 0 ? 'Lancer −1 🗝️' : 'clé ?' }}
            </button>
            <!-- Auto : réservé aux paliers DÉJÀ nettoyés (le run se joue tout seul).
                 Admin (mon compte) : disponible dès qu'un palier est débloqué. -->
            <button
              v-if="t.cleared || auth.isAdmin"
              type="button"
              class="lt-go auto"
              :disabled="keys < 1"
              title="Le run se joue tout seul, tu regardes"
              @click="startAuto(t.laby)"
            >
              ⚡ Auto
            </button>
          </div>
        </div>
      </div>
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
        <button
          type="button"
          class="bag-chip bag-chip-btn"
          :disabled="!loot.length"
          title="Voir le butin ramassé"
          @click="lootOpen = true"
        >
          🎒 {{ loot.length }}
        </button>
      </div>

      <!-- Bandeau AUTO : le run se joue seul → indicateur + bouton pour reprendre la main. -->
      <div v-if="autoMode" class="auto-banner">
        <span class="ab-txt"><span class="ab-dot" /> ⚡ Auto — le héros explore seul</span>
        <button type="button" class="ab-stop" @click="stopAuto">✋ Reprendre la main</button>
      </div>

      <div class="map-wrap">
        <!-- Marge : les salles sont décalées aléatoirement (aspect organique) → padding
             pour ne pas rogner celles des bords. -->
        <svg
          :viewBox="`${-MAP_PAD} ${-MAP_PAD} ${cols * CELL + 2 * MAP_PAD} ${rows * CELL + 2 * MAP_PAD}`"
          class="map"
          :style="{ '--amb': ambianceColor }"
        >
          <!-- Teinte d'ambiance du palier (rang G→SSS) -->
          <rect
            :x="-MAP_PAD"
            :y="-MAP_PAD"
            :width="cols * CELL + 2 * MAP_PAD"
            :height="rows * CELL + 2 * MAP_PAD"
            class="map-amb"
          />
          <!-- Couloirs = passages carvés (large sous-couche + trait) -->
          <line
            v-for="c in corridors"
            :key="'f' + c.k"
            class="corridor-floor"
            :x1="c.x1"
            :y1="c.y1"
            :x2="c.x2"
            :y2="c.y2"
          />
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
            :class="['room', roomClass(r.id), { auto: autoMode }]"
            @click="autoMode || onRoomClick(r.id)"
          >
            <circle :cx="cx(r)" :cy="cy(r)" :r="SIZE / 2" class="room-bg" />
            <!-- Torches : salle visitée = éclairée (2 flammes qui vacillent) -->
            <template v-if="roomLit(r)">
              <path
                class="torch"
                :d="`M${cx(r) - SIZE / 2 - 1} ${cy(r) - 5} q -1.7 -2.4 0 -4.8 q 1.7 2.4 0 4.8 Z`"
              />
              <path
                class="torch t2"
                :d="`M${cx(r) + SIZE / 2 + 1} ${cy(r) - 5} q -1.7 -2.4 0 -4.8 q 1.7 2.4 0 4.8 Z`"
              />
            </template>
            <ChestIcon
              v-if="isVisitedChest(r)"
              :color="chestColorOf(r.id)"
              :x="cx(r) - 12"
              :y="cy(r) - 12"
              width="24"
              height="24"
            />
            <text v-else :x="cx(r)" :y="cy(r) + 1" class="room-emo">{{ roomGlyph(r) }}</text>
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
          <div class="chest-anim">
            <ChestIcon :color="roomFx.grade?.color ?? '#c8813f'" class="chest-big" />
          </div>
          <div v-if="roomFx.grade" class="chest-grade" :style="{ color: roomFx.grade.color }">
            Coffre {{ roomFx.grade.label }}
          </div>
          <!-- Détail complet de l'objet gagné -->
          <div v-if="roomFx.item" class="fx-loot-card" :class="'r-' + roomFx.item.rarity">
            <ItemIcon :item="roomFx.item" :size="56" class="fl-icon" />
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
          <div class="trap-anim">{{ roomFx.trap?.emoji ?? '⚠️' }}</div>
          <div class="fx-result bad">
            {{ roomFx.trap?.label ?? 'Piège' }} !{{ roomFx.dmg ? ` −${roomFx.dmg} PV` : '' }}
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
          🪙 {{ gold }} · 🎒 {{ run.status === 'dead' ? 0 : loot.length }} objet(s)
        </div>
        <div class="over-sub">
          <template v-if="run.status === 'cleared'"> Butin crédité (+ trésor final) 🎉 </template>
          <template v-else>
            Tu es tombé : l'or et la poussière sont gardés, les objets restent au donjon.
          </template>
        </div>

        <!-- Récap du butin ramené (pour juger la rentabilité du run sans fouiller le sac) -->
        <div v-if="run.status !== 'dead' && loot.length" class="over-loot">
          <div class="ol-title">
            Objets rapportés <span class="ol-hint">(tape pour le détail)</span>
          </div>
          <button
            v-for="(it, i) in loot"
            :key="i"
            type="button"
            class="ol-item"
            :class="'r-' + it.rarity"
            @click="detailItem = it"
          >
            <ItemIcon :item="it" :size="38" />
            <div class="ol-main">
              <span class="ol-name">{{ it.name }}</span>
              <span class="ol-meta"
                >{{ RARITY_LABEL[it.rarity] }} · {{ effectLabel(it.effect, it.level) }}</span
              >
            </div>
            <span class="ol-chevron">›</span>
          </button>
        </div>
        <div class="over-row">
          <q-btn
            flat
            no-caps
            :label="keys > 0 ? 'Rejouer (−1 🗝️)' : 'Pas de clé'"
            color="primary"
            :disable="!canStart"
            @click="replay"
          />
          <q-btn
            v-if="labyrinthCleared(selectedLaby?.id ?? '', clearedSet)"
            flat
            no-caps
            label="⚡ Rejouer en auto"
            color="primary"
            :disable="!canStart"
            @click="replayAuto"
          />
          <q-btn flat no-caps label="Sortir" @click="back()" />
        </div>
      </q-card>
    </q-dialog>

    <!-- Butin ramassé EN COURS de run (clic sur le 🎒 de la topbar, ticket 8a43ca8c) -->
    <q-dialog v-model="lootOpen" position="bottom">
      <q-card class="fx-loot-card">
        <div class="ol-title">
          🎒 Butin ramassé <span class="ol-hint">(tape pour le détail)</span>
        </div>
        <div v-if="!loot.length" class="ol-hint">Rien pour l'instant — explore les coffres 📦.</div>
        <button
          v-for="(it, i) in loot"
          :key="i"
          type="button"
          class="ol-item"
          :class="'r-' + it.rarity"
          @click="detailItem = it"
        >
          <ItemIcon :item="it" :size="38" />
          <div class="ol-main">
            <span class="ol-name">{{ it.name }}</span>
            <span class="ol-meta"
              >{{ RARITY_LABEL[it.rarity] }} · {{ effectLabel(it.effect, it.level) }}</span
            >
          </div>
          <span class="ol-chevron">›</span>
        </button>
        <q-btn
          class="fx-cta"
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          label="Fermer"
          @click="lootOpen = false"
        />
      </q-card>
    </q-dialog>

    <!-- Détail d'un objet rapporté (clic sur le récap de butin) -->
    <q-dialog :model-value="!!detailItem" @update:model-value="detailItem = null">
      <q-card v-if="detailItem" class="fx-loot-card im-card" :class="'r-' + detailItem.rarity">
        <ItemIcon :item="detailItem" :size="56" class="fl-icon" />
        <div class="fl-name">{{ detailItem.name }}</div>
        <div class="fl-meta">
          {{ RARITY_LABEL[detailItem.rarity]
          }}<template v-if="rollStars(detailItem.roll)">
            · qualité {{ rollStars(detailItem.roll) }}/5</template
          >
          · {{ SLOT_LABEL[detailItem.slot] }} · niv {{ detailItem.level }}
        </div>
        <div class="fl-eff">✦ {{ effectLabel(detailItem.effect, detailItem.level) }}</div>
        <div v-if="detailItem.effect2" class="fl-eff">
          ✦ {{ effectLabel(detailItem.effect2, detailItem.level) }}
        </div>
        <div v-if="detailItem.setId" class="fl-set">🧩 {{ setName(detailItem.setId) }}</div>
        <q-btn
          class="fx-cta"
          color="primary"
          text-color="dark"
          no-caps
          unelevated
          label="Fermer"
          @click="detailItem = null"
        />
      </q-card>
    </q-dialog>
  </component>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  generateDungeon,
  startRun,
  canMove,
  enterRoom,
  pathTo,
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
import { useGamePanel } from '@/composables/useGamePanel';
import { labyrinthUnlocked, labyrinthLuckBonus } from '@/lib/buildings';
import {
  LABYRINTHS,
  labyrinthUnlockedTier,
  labyrinthCleared,
  labyClearId,
  deathKeepFraction,
  type Labyrinth,
} from '@/data/labyrinths';
import { computeCharacter } from '@/lib/character';
import {
  playerWithGear,
  rollDrop,
  rollSetPiece,
  ITEM_SETS,
  effectLabel,
  RARITY_LABEL,
  RARITY_RANK,
  RANK_COLOR,
  RANK_ORDER,
  rollStars,
  tierIndexOf,
  dropPeakRank,
  mergeEffects,
  SLOT_LABEL,
  type Item,
  type Rarity,
} from '@/lib/items';
import { rollActivityFamiliar } from '@/data/familiars';
import { pickLabyFoe, type LabyFoe } from '@/data/labyrinthFoes';
import { rollChestGrade, pickLabyTrap, type ChestGrade, type LabyTrap } from '@/data/labyrinthLoot';
import { talentEffects } from '@/lib/talents';
import { voiePassiveEffects, type VoieId } from '@/lib/voies';
import {
  simulateCombat,
  mulberry32,
  combatPower,
  fmtPow,
  type Combatant,
  type CombatEvent,
} from '@/lib/combat';
import { refFighter, recommendedPower } from '@/lib/proceduralContent';
import CombatStage from '@/components/CombatStage.vue';
import GameLoader from '@/components/GameLoader.vue';
import ChestIcon from '@/components/ChestIcon.vue';
import ItemIcon from '@/components/ItemIcon.vue';

const props = defineProps<{ embedded?: boolean }>();
const route = useRoute();
const router = useRouter();
const { gameBack } = useGamePanel();
// Retour/Sortir : dans le volet jeu (cockpit) → revient à l'Aventure ; sinon route.
function leave() {
  if (props.embedded) return gameBack();
  router.back();
}
// Quitter un run EN COURS = abandon → le butin ramassé (crédité seulement à la fin du
// palier) est perdu. On avertit (le bouton « 🚪 Sortir en gardant le butin » banque, lui).
const runInProgress = () => phase.value === 'running' && !over.value;
function back() {
  if (runInProgress()) {
    $q.dialog({
      title: 'Quitter le labyrinthe ?',
      message:
        'Le run en cours sera <b>abandonné</b> : tu perds tout le butin ramassé (or, poussière, objets). Le butin n’est crédité qu’<b>à la fin du palier</b>. Pour le garder, utilise « 🚪 Sortir en gardant le butin » sur un escalier.',
      html: true,
      cancel: { label: 'Rester', flat: true },
      ok: { label: 'Quitter (perdre le butin)', color: 'negative' },
    }).onOk(leave);
    return;
  }
  leave();
}
// Rafraîchir/fermer l'onglet pendant un run → avertissement natif du navigateur.
function beforeUnload(e: BeforeUnloadEvent) {
  if (runInProgress()) {
    e.preventDefault();
    e.returnValue = '';
  }
}
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

// ── Ladder de paliers : chaque palier se débloque en nettoyant le précédent. ──
const clearedSet = computed(() => char.row?.cleared_dungeons ?? []);
const tiers = computed(() =>
  LABYRINTHS.map((l) => ({
    laby: l,
    unlocked: labyrinthUnlockedTier(l.id, clearedSet.value),
    cleared: labyrinthCleared(l.id, clearedSet.value),
    deathKeep: Math.round(deathKeepFraction(l.id) * 100),
  })),
);
// Palier en cours d'exploration (choisi dans le lobby).
const selectedLaby = ref<Labyrinth | null>(null);

// ── Mode AUTO (paliers déjà nettoyés) : le run se joue TOUT SEUL, visuellement en
// temps réel (clique chaque salle, avance d'étage, combat le boss), puis affiche
// l'écran de fin. On enchaîne les salles via un timer qui appelle les MÊMES actions
// que le joueur (onRoomClick/goDown/finish), en fermant automatiquement les modales.
const autoMode = ref(false);
let autoTimer: ReturnType<typeof setTimeout> | undefined;
const AUTO_STEP_MS = 550;

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
// Effets actifs = talents + passif de VOIE (comme la fiche Héros) → le Labyrinthe combat
// avec ta vraie puissance de build.
const talentFx = computed(() =>
  mergeEffects(
    talentEffects(char.row?.talents ?? []),
    voiePassiveEffects(char.row?.voie as VoieId),
  ),
);
const fighter = computed<Combatant>(() =>
  playerWithGear(
    char.row?.pseudo ?? 'Toi',
    character.value,
    char.row?.equipped ?? {},
    talentFx.value,
    character.value.level.level,
    char.row?.voie,
  ),
);
const heroLevel = computed(() => character.value.level.level);
// Puissance de combat du joueur → comparée à la « puissance conseillée » de chaque palier.
const myPow = computed(() => combatPower(fighter.value));

const CELL = 66;
const SIZE = 46; // côté d'une salle (carré arrondi) ; salles alignées sur la grille
const MAP_PAD = 8; // petite marge du viewBox

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
// Atténuation du VOL DE VIE dans le Labyrinthe. Le heal ∝ dégâts infligés (énormes face
// aux monstres à échelle relative) → à 0,5 il ANNULAIT l'attrition (build 30-50 % vol de
// vie = run trivial, cf. simulation). Baissé à 0,3 : le vol de vie aide encore nettement
// mais ne trivialise plus (un build 50 % finit ~usé, pas intact) → l'Endurance/les PV
// reportés comptent à nouveau. (curseur à ajuster si besoin.)
const LABY_LIFESTEAL = 0.3;
const lastEvent = ref<{ kind: string; text: string } | null>(null);
const over = ref(false);
// Butin cumulé du run (Phase 3b : affiché ; persistance/récompense = Phase 3c).
const gold = ref(0);
// Compteur INTERNE de richesse du run (monstres/coffres/vault − pièges) : plus une devise
// affichée (la poussière a été retirée du jeu) → sert uniquement de proxy au faucet de
// parchemins d'enchant 📜 en fin de run (cf. `scrolls = dust.value / 8`).
const dust = ref(0);
const scrollsGained = ref(0); // parchemins d'enchant 📜 crédités (récap de fin)
const loot = ref<Item[]>([]);
// Détail d'un objet du récap de butin (modale au clic).
const detailItem = ref<Item | null>(null);
const lootOpen = ref(false); // modale « butin ramassé » en cours de run (ticket 8a43ca8c)
function setName(id?: string): string {
  return id ? (ITEM_SETS.find((s) => s.id === id)?.name ?? 'Set') : '';
}

// Animation de salle (combat / coffre / piège) jouée en overlay avant de continuer.
type StageFight = {
  name: string;
  emoji: string;
  maxPv: number;
  archetype?: string;
  log: CombatEvent[];
};
const roomFx = ref<{
  kind: 'combat' | 'chest' | 'trap' | 'descend';
  win?: boolean;
  item?: Item | null;
  grade?: ChestGrade;
  dmg?: number;
  trap?: LabyTrap;
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
  window.addEventListener('beforeunload', beforeUnload);
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
  const isVault = floor.value.rooms[id]?.type === 'vault';
  if (id === run.value.current) return isVault ? 'current vault' : 'current';
  if (run.value.visited.includes(id)) return isVault ? 'visited vault' : 'visited';
  const clickable = canMove(run.value, floor.value, id);
  return clickable ? 'frontier open' : 'frontier';
}
function roomGlyph(r: Room): string {
  if (!isVisible(floor.value, run.value, r.id)) return '';
  if (!run.value.visited.includes(r.id)) return '?'; // frontière : type inconnu
  if (r.type === 'chest') return ''; // coffre = image tintée (ChestIcon), pas d'emoji
  if (r.type === 'trap') return trapKindOf(r.id).emoji; // piège découvert = son icône variée
  return ROOM_EMOJI[r.type];
}
// Coffre déjà ouvert (visité) → on affiche l'image de coffre teintée à son grade.
function isVisitedChest(r: Room): boolean {
  return r.type === 'chest' && run.value.visited.includes(r.id);
}
function chestColorOf(id: number): string {
  return chestGradeOf(id).color;
}

// Monstre de salle scalé au niveau du perso + profondeur de l'étage. Volontairement
// plus faible qu'un boss de palier (une salle = une bouchée) : c'est l'ACCUMULATION
// sur l'étage, PV reportés, qui use → l'Endurance compte. (équilibrage provisoire bêta)
// Monstres calibrés RELATIVEMENT au joueur (le sport rend le perso très fort en
// absolu → une échelle fixe le laissait one-shot tout sans jamais perdre de PV).
// pv = k × dégâts/tour du joueur (⇒ le monstre SURVIT et riposte) ; dégâts = part
// des PV max du joueur (⇒ attrition réelle). Deeper = plus dur (push-your-luck).
// Index de rang du palier courant (0=G … 9=SSS) → thème du roster de monstres.
const labyTierIndex = computed(() =>
  Math.max(0, RANK_ORDER.indexOf(selectedLaby.value?.rank ?? 'G')),
);
// Teinte d'ambiance de l'étage = couleur du RANG du palier (G→SSS) → chaque palier a
// son atmosphère de fond sur la carte.
const ambianceColor = computed(() => RANK_COLOR[selectedLaby.value?.rank ?? 'G']);
// Torches : les salles VISITÉES sont « éclairées » (2 flammes) ; le reste est sombre.
function roomLit(r: Room): boolean {
  return run.value.visited.includes(r.id) && isVisible(floor.value, run.value, r.id);
}

// Niveau de calibration ABSOLU du palier = son niveau conseillé (comme les donjons).
// → la difficulté ne dépend PLUS de ta puissance : un palier profond est objectivement
// dur, un bas-niveau sur-équipé n'y survit pas (ticket anti-runaway, difficulté absolue).
const palierLevel = computed(() => selectedLaby.value?.recoLevel ?? heroLevel.value);

// Monstre = baseline ABSOLUE calibrée sur le build de RÉFÉRENCE du palier (refFighter au
// niveau du palier) + profondeur, MODULÉE par l'archétype de la créature (assassin/brute/
// colosse/sangsue/vif) → un FEEL différent à chaque combat. Nom/emoji viennent du roster.
function makeMonster(isBoss: boolean, depth: number, foe: LabyFoe): Combatant {
  const ref = refFighter(palierLevel.value); // combattant de référence du PALIER (absolu)
  const pTurn = ref.damage * (ref.strikes ?? 1) * (1 + ref.crit); // dégâts/tour de la référence
  const P = ref.pv;
  const d = 0.85 + 0.55 * depth; // 0.85 (surface) → 1.4 (fond)
  const a = foe.arch;
  // Baseline coriace : ~3 tours (salle) / ~6,5 tours (gardien) ; dégâts ~5,5 % / ~9 % des PV.
  const basePv = pTurn * (isBoss ? 6.5 : 3) * d;
  const baseDmg = P * (isBoss ? 0.09 : 0.055) * d;
  return {
    name: foe.name,
    pv: Math.max(10, Math.round(basePv * a.pvMult)),
    damage: Math.max(1, Math.round(baseDmg * a.dmgMult)),
    crit: a.crit + 0.03 * depth,
    dodge: a.dodge + 0.02 * depth,
    initiative: isBoss ? 14 : 8,
    strikes: a.strikes ?? 1,
    ...(a.lifesteal ? { lifesteal: a.lifesteal } : {}),
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
  // Créature de la salle (roster du palier + archétype), seedée → rejouable.
  const foe = pickLabyFoe(mulberry32((roomSeed(id) ^ 0x2f6b) >>> 0), labyTierIndex.value, isBoss);
  const monster = makeMonster(isBoss, depthOf(), foe);
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
      text: `${foe.emoji} Vaincu ! +${res.gold} 🪙 · ${finalPv} PV`,
    };
  } else {
    lastEvent.value = { kind: 'bad', text: `💀 Battu par ${monster.name}…` };
  }
  // Rejoue le combat animé (log seedé exact) en overlay, avec l'identité de la créature
  // (emoji + archétype → aura + tag « féroce/brutal/colosse/insaisissable » via CombatStage).
  stageFights.value = [
    {
      name: monster.name,
      emoji: foe.emoji,
      maxPv: monster.pv,
      archetype: foe.arch.arch,
      log: res.log,
    },
  ];
  fxDone.value = false;
  roomFx.value = { kind: 'combat', win: res.win };
}
// Grade d'un coffre (bronze→platine) : seed SÉPARÉ (n'interfère pas avec le tirage du
// butin), dérivé de la frise glissante (rollChestGrade) → se décale avec le niveau du
// palier. Déterministe → identique entre l'ouverture et l'affichage sur la carte.
function chestGradeOf(id: number): ChestGrade {
  return rollChestGrade(
    mulberry32((roomSeed(id) ^ 0xc0ffee) >>> 0),
    runDropLevel(),
    runLuck(),
    heroLevel.value,
  );
}
function openChest(id: number) {
  const grade = chestGradeOf(id);
  const rng = mulberry32(roomSeed(id));
  // Le GRADE du coffre pilote le contenu : luck (rareté), niveau, ressources, objet garanti.
  const luck = Math.min(1, 0.35 + 0.45 * depthOf() + labyLuck.value + grade.luckBonus);
  const level = Math.max(1, heroLevel.value + grade.levelBonus);
  const tries = grade.guaranteed ? 8 : 4;
  let drop: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < tries && !drop; k++)
    drop = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level,
      luck,
      spread: 1,
      playerLevel: heroLevel.value,
    });
  const item = drop ? { ...drop, id: crypto.randomUUID() } : null;
  dust.value += 3 + grade.dustBonus;
  if (item) loot.value.push(item);
  const bits = [item?.name].filter(Boolean).join(' + ');
  lastEvent.value = {
    kind: 'good',
    text: `${grade.emoji} Coffre ${grade.label}${bits ? ' — ' + bits : ' ouvert'} !`,
  };
  roomFx.value = { kind: 'chest', item, grade };
}
// Piège de la salle (seed séparé) : type varié (pointes/gaz/flammes = dégâts modulés ;
// trappe = vol d'or ; toile = vol de poussière). Déterministe → même icône à l'affichage.
function trapKindOf(id: number): LabyTrap {
  return pickLabyTrap(mulberry32((roomSeed(id) ^ 0x7a17) >>> 0));
}
function springTrap(id: number) {
  const trap = trapKindOf(id);
  if (trap.kind === 'dmg') {
    const dmg = Math.max(1, Math.round(trapDmg.value * trap.mult));
    run.value = applyDamage(run.value, dmg); // mort gérée à la fermeture (closeFx)
    lastEvent.value = { kind: 'bad', text: `${trap.emoji} ${trap.label} ! −${dmg} PV` };
    roomFx.value = { kind: 'trap', trap, dmg };
  } else {
    const isGold = trap.kind === 'gold';
    const pool = isGold ? gold : dust;
    const want = isGold
      ? Math.round((10 + heroLevel.value * 4) * (1 + depthOf()))
      : Math.round((4 + heroLevel.value) * (1 + depthOf()));
    const loss = Math.min(pool.value, want);
    pool.value -= loss;
    lastEvent.value = {
      kind: 'bad',
      text:
        loss && isGold
          ? `${trap.emoji} ${trap.label} ! −${loss} 🪙`
          : loss
            ? `${trap.emoji} ${trap.label} ! butin dérobé`
            : `${trap.emoji} ${trap.label} — rien à voler !`,
    };
    roomFx.value = { kind: 'trap', trap };
  }
}
// SALLE SECRÈTE : gros butin GARANTI — un objet de HAUT rang (plusieurs tirages, on garde
// le meilleur, niveau+2 et forte luck) + lot d'or/poussière/fragments. Comme les autres
// gains du run, ils passent par les accumulateurs (× fraction si on meurt ensuite).
function openVault(id: number) {
  const rng = mulberry32((roomSeed(id) ^ 0x5a17) >>> 0);
  let best: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 5; k++) {
    const d = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: runDropLevel() + 2,
      luck: Math.min(1, runLuck() + 0.35),
      playerLevel: heroLevel.value,
    });
    if (d && (!best || RARITY_RANK[d.rarity] > RARITY_RANK[best.rarity])) best = d;
  }
  const item = best ? { ...best, id: crypto.randomUUID() } : null;
  const gGold = 30 + Math.round(heroLevel.value * 6);
  const gDust = 20 + Math.round(heroLevel.value * 0.8);
  gold.value += gGold;
  dust.value += gDust;
  if (item) loot.value.push(item);
  lastEvent.value = {
    kind: 'good',
    text: `💎 Salle secrète ! ${item ? item.name + ' · ' : ''}+${gGold}🪙`,
  };
  gameFx.celebrate({
    kind: 'drop',
    emoji: '💎',
    title: 'Salle secrète !',
    subtitle: item ? `${item.name} · ${RARITY_LABEL[item.rarity]}` : 'Coffre au trésor',
    rarity: item ? fxRarity(item.rarity) : 'legendary',
  });
  roomFx.value = { kind: 'chest', item };
}
// Ferme l'overlay de salle ; si le combat a été fatal, on bascule sur la fin de run.
function closeFx() {
  roomFx.value = null;
  if (run.value.status === 'dead') void endRun('dead');
}

// ── Clic pour marcher : cliquer une salle atteignable via la zone explorée y déplace le
// héros de case en case (retour arrière sans re-cliquer chaque salle). ──
const WALK_STEP_MS = 190; // plus vif que l'auto-run (on retraverse du connu)
const walking = ref(false);
let walkTimer: ReturnType<typeof setTimeout> | undefined;
function stopWalk() {
  if (walkTimer) clearTimeout(walkTimer);
  walkTimer = undefined;
  walking.value = false;
}
function walkTo(path: number[]) {
  if (!path.length || walking.value) return;
  walking.value = true;
  let i = 0;
  const step = () => {
    if (i >= path.length || run.value.status !== 'exploring') {
      stopWalk();
      return;
    }
    const id = path[i]!;
    const last = i === path.length - 1;
    // Dernière case NEUVE (frontière) → on y déclenche son événement (combat/coffre/…).
    if (last && !run.value.visited.includes(id)) {
      stopWalk();
      onRoomClick(id);
      return;
    }
    run.value = enterRoom(run.value, floor.value, id);
    lastEvent.value = null;
    i++;
    walkTimer = setTimeout(step, WALK_STEP_MS);
  };
  step();
}

function onRoomClick(id: number) {
  if (walking.value) return; // déplacement auto en cours → on ignore les clics
  // Salle NON adjacente : si elle est atteignable via la zone déjà explorée, on y
  // marche automatiquement de case en case (retour arrière sans re-cliquer chaque salle).
  if (!canMove(run.value, floor.value, id)) {
    const path = pathTo(run.value, floor.value, id);
    if (path && path.length) walkTo(path);
    return;
  }
  const wasNew = !run.value.visited.includes(id);
  const target = floor.value.rooms[id]!;
  run.value = enterRoom(run.value, floor.value, id);
  if (!wasNew) {
    lastEvent.value = null;
    return;
  }
  switch (target.type) {
    case 'trap':
      springTrap(id);
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
    case 'vault':
      openVault(id);
      regen(0.1); // planque sûre → on souffle un peu
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

// Niveau de butin/familier du run = celui du PALIER choisi (croît avec la profondeur),
// borné pour ne pas déborder si un palier profond est atteint sous-nivelé.
function runDropLevel(): number {
  return selectedLaby.value?.dropLevel ?? heroLevel.value + 1;
}
function runLuck(): number {
  return Math.min(1, (selectedLaby.value?.luck ?? 0.5) + labyLuck.value);
}
// Trésor final garanti à la victoire (haute chance + haute rareté). ~15 % de
// chance que ce soit une PIÈCE DE SET (2e voie d'accès aux sets, cf. ticket) —
// les boss restent la source garantie/ciblée.
// Trésor final = la « belle récompense » du clear (le seul intérêt de pousser
// jusqu'au bout malgré l'attrition). Objet de HAUT niveau (heroLevel+2), rareté
// GARANTIE épique minimum, ~25 % de chance d'être une pièce de set convoitée.
function rollTreasure(): Item | null {
  const rng = mulberry32((seed.value * 977 + 4242) >>> 0 || 1);
  const lvl = runDropLevel() + 1; // niveau du PALIER (croît avec la profondeur)
  const luck = runLuck();
  if (rng() < 0.25 && ITEM_SETS.length) {
    const set = ITEM_SETS[Math.floor(rng() * ITEM_SETS.length)]!;
    const piece = rollSetPiece(rng, {
      setId: set.id,
      level: lvl,
      luck,
      playerLevel: heroLevel.value,
    });
    return { ...piece, id: crypto.randomUUID() };
  }
  // Garde le MEILLEUR tier (rang+qualité) sur plusieurs tirages → « belle récompense »
  // RELATIVE à la profondeur du PALIER (plus le palier est profond, plus le rang monte).
  let best: Omit<Item, 'id'> | null = null;
  for (let k = 0; k < 8; k++) {
    const cand = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: lvl,
      luck,
      spread: 0,
      playerLevel: heroLevel.value,
    });
    if (cand && (!best || tierIndexOf(cand) > tierIndexOf(best))) best = cand;
  }
  return best ? { ...best, id: crypto.randomUUID() } : null;
}

// (Ré)initialise un run sur la carte courante avec les VRAIS PV du perso.
function freshRun() {
  dungeon.value = generateDungeon(seed.value, floorsWanted.value);
  run.value = startRun(floorsWanted.value, dungeon.value[0]!, fighter.value.pv || 140);
  gold.value = 0;
  dust.value = 0;
  scrollsGained.value = 0;
  loot.value = [];
  lastEvent.value = null;
  over.value = false;
}

// Lance un PALIER (consomme 1 clé) : carte fraîche du palier, PV pleins.
async function start(tier?: Labyrinth) {
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
  // Palier : celui passé (clic sur une carte) ou le courant (rejouer depuis la modale).
  const laby = tier ?? selectedLaby.value ?? LABYRINTHS[0]!;
  if (!labyrinthUnlockedTier(laby.id, clearedSet.value)) return;
  const ok = await char.spendKey(uid);
  if (!ok) {
    $q.notify({ type: 'warning', message: 'Il te faut une clé 🗝️ (donjons, boss, faille).' });
    return;
  }
  selectedLaby.value = laby;
  seed.value = Math.floor(Math.random() * 1_000_000) + 1;
  floorsWanted.value = laby.floors;
  credited.value = false;
  freshRun();
  phase.value = 'running';
}

// ── Auto-run (paliers nettoyés) ──
function stopAuto() {
  autoMode.value = false;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = undefined;
}
function scheduleAuto(ms = AUTO_STEP_MS) {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(autoTick, ms);
}
// Seuil de PV bas : en dessous, si une SORTIE sûre est trouvée, l'auto sort (retraite)
// plutôt que de risquer la mort (qui fait perdre les objets).
const AUTO_SAFE_PV = 0.28;

// Le boss du dernier étage est-il GAGNABLE au PV courant ? (simulation seedée, identique à
// celle de fightRoom → verdict exact). En auto, on ne fuit PAS un boss gagnable : on tente
// le clear (familier + déblocage du palier suivant), au lieu de retraiter bêtement à bas PV.
function bossWinnableNow(): boolean {
  const bossRoom = floor.value.rooms.find((r) => r.type === 'boss');
  if (!bossRoom) return false; // étage intermédiaire (pas de boss) → non concerné
  const foe = pickLabyFoe(
    mulberry32((roomSeed(bossRoom.id) ^ 0x2f6b) >>> 0),
    labyTierIndex.value,
    true,
  );
  const monster = makeMonster(true, depthOf(), foe);
  const combatFighter: Combatant = {
    ...fighter.value,
    pv: run.value.pv,
    lifesteal: (fighter.value.lifesteal ?? 0) * LABY_LIFESTEAL,
  };
  return simulateCombat(combatFighter, monster, {
    seed: roomSeed(bossRoom.id),
    goldOnWin: 0,
    startPlayerPv: run.value.pv,
  }).win;
}

// Premier PAS (salle adjacente) vers la salle la PLUS PROCHE qui satisfait `pred`, en ne
// TRAVERSANT que des salles déjà visitées (le backtracking ne redéclenche rien). Renvoie
// l'id du 1ᵉʳ hop, ou null si aucune cible atteignable. BFS sur le graphe des couloirs.
function hopToNearest(pred: (r: (typeof floor.value.rooms)[number]) => boolean): number | null {
  const start = run.value.current;
  const rooms = floor.value.rooms;
  const visited = new Set(run.value.visited);
  const prev = new Map<number, number>([[start, -1]]);
  const q: number[] = [start];
  let goal = -1;
  while (q.length) {
    const id = q.shift()!;
    for (const nb of rooms[id]!.links) {
      if (prev.has(nb)) continue;
      prev.set(nb, id);
      if (pred(rooms[nb]!)) {
        goal = nb;
        q.length = 0;
        break;
      }
      if (visited.has(nb)) q.push(nb); // on ne marche que sur du connu
    }
  }
  if (goal < 0) return null;
  let cur = goal; // remonte jusqu'au 1ᵉʳ hop depuis `start`
  while (prev.get(cur) !== start) cur = prev.get(cur)!;
  return cur;
}
const isUnvisited = (r: { id: number }) => !run.value.visited.includes(r.id);
const isSafeExit = (r: { type: string; id: number }) =>
  (r.type === 'start' || r.type === 'stairs') && run.value.visited.includes(r.id);
const hasSafeExit = computed(() => floor.value.rooms.some((r) => isSafeExit(r)));
const lowHp = computed(() => run.value.pv / Math.max(1, run.value.maxPv) < AUTO_SAFE_PV);

// Un « tour » d'auto : ferme la modale en cours si prête, sinon agit.
function autoTick() {
  if (!autoMode.value) return;
  if (over.value || phase.value !== 'running') return stopAuto();
  if (roomFx.value) {
    const k = roomFx.value.kind;
    if (k === 'combat' && !fxDone.value) return scheduleAuto(300); // laisse jouer l'animation
    if (k === 'descend') return scheduleAuto(300); // s'auto-ferme déjà
    closeFx(); // combat fini / coffre / piège → on ferme et on enchaîne
    return scheduleAuto();
  }
  if (over.value) return stopAuto();

  // NETTOYAGE COMPLET : on visite TOUTES les salles avant de sortir. On garde
  // escalier/boss pour la fin (sinon on descendrait/affronterait trop tôt).
  const exploreHop = hopToNearest(
    (r) => isUnvisited(r) && r.type !== 'stairs' && r.type !== 'boss',
  );
  const onlyBossLeft = exploreHop == null; // exploration finie → ne reste que l'escalier/boss

  // SÉCURITÉ : PV bas ET une sortie sûre (départ/escalier visité) existe → on SORT en gardant
  // le butin plutôt que de risquer la mort. EXCEPTION : s'il ne reste QUE le boss et qu'il est
  // GAGNABLE au PV courant, on ne fuit pas — on tente le clear (familier + déblocage du palier
  // suivant), sinon l'auto retraitait bêtement à bas PV et ne finissait jamais (tickets
  // c7187901 / 6294811a).
  if (lowHp.value && hasSafeExit.value && !(onlyBossLeft && bossWinnableNow())) {
    if (canRetreat.value) return void retreat(); // déjà sur un point de sortie
    const hop = hopToNearest(isSafeExit);
    if (hop != null) {
      onRoomClick(hop);
      return scheduleAuto(Math.round(AUTO_STEP_MS * 0.7)); // repli un peu plus vif
    }
  }

  if (exploreHop != null) {
    onRoomClick(exploreHop);
    return scheduleAuto();
  }

  // Plus rien de « neutre » à explorer → on s'occupe de l'escalier / du boss.
  if (onBoss.value) return void finish(); // sur le boss (déjà affronté) → écran de fin
  if (onStairs.value) {
    goDown();
    return scheduleAuto(1500);
  }
  // Il reste l'escalier ou le boss non visité → on y va (dernières cases).
  const exitHop = hopToNearest((r) => isUnvisited(r) && (r.type === 'stairs' || r.type === 'boss'));
  if (exitHop != null) {
    onRoomClick(exitHop);
    return scheduleAuto();
  }
  // On a tout visité mais on n'est pas sur l'escalier (étage intermédiaire) → y retourner.
  const backToStairs = hopToNearest((r) => r.type === 'stairs' && run.value.visited.includes(r.id));
  if (backToStairs != null) {
    onRoomClick(backToStairs);
    return scheduleAuto();
  }
  retreat(); // sécurité ultime : on sort avec le butin
}
// Lance un palier NETTOYÉ en mode auto (mêmes règles/coût qu'un run manuel).
async function startAuto(tier: Labyrinth) {
  await start(tier);
  if (phase.value === 'running') {
    autoMode.value = true;
    scheduleAuto(800);
  }
}
onBeforeUnmount(() => {
  stopAuto();
  stopWalk();
  window.removeEventListener('beforeunload', beforeUnload);
});

// Termine le run et CRÉDITE le butin au perso. Mort → or+poussière seuls (gear
// perdu) ; nettoyé → + trésor final ; retraite → butin gardé, pas de trésor final.
async function endRun(outcome: 'cleared' | 'dead' | 'retreat') {
  run.value = { ...run.value, status: outcome === 'dead' ? 'dead' : 'cleared' };
  if (!credited.value) {
    credited.value = true;
    if (outcome === 'cleared') {
      const t = rollTreasure();
      if (t) loot.value.push(t);
      // SIGNATURE du Labyrinthe : un FAMILIER garanti au clear, de rang d'autant plus
      // haut que le PALIER est profond (level+luck du palier → raretés croissantes).
      const famRng = mulberry32((seed.value * 131 + 91) >>> 0 || 1);
      const fam = rollActivityFamiliar(famRng, {
        level: runDropLevel(),
        luck: runLuck(),
        playerLevel: heroLevel.value,
      });
      loot.value.push({ ...fam, id: crypto.randomUUID() });
      gameFx.celebrate({
        kind: 'familiar',
        emoji: fam.emoji,
        title: 'Familier trouvé !',
        subtitle: `${fam.name} · ${RARITY_LABEL[fam.rarity]}`,
        rarity: fxRarity(fam.rarity),
      });
    }
    // Parchemins d'enchant 📜 (carburant de l'enchant) : faucet SECONDAIRE ∝ progression
    // du run (`dust.value` = compteur INTERNE de richesse du run — salles/monstres/coffres,
    // plus affiché — sert de proxy), PLAFONNÉ + bonus de clear.
    const scrolls =
      Math.min(10, Math.max(1, Math.round(dust.value / 8))) + (outcome === 'cleared' ? 2 : 0);
    // MORT : on garde une FRACTION des gains liée à la profondeur du palier non terminé
    // (profond = pardonne moins). Les objets restent perdus. Retraite/clear = tout gardé.
    const keep = outcome === 'dead' ? deathKeepFraction(selectedLaby.value?.id ?? '') : 1;
    const uid = auth.user?.id;
    if (uid)
      await char.applyExpedition(uid, {
        gold: Math.floor(gold.value * keep),
        enchantScrolls: Math.floor(scrolls * keep),
        drops: outcome === 'dead' ? [] : loot.value,
        // Nettoyage → débloque le palier suivant (mort/retraite ne débloquent pas).
        ...(outcome === 'cleared' && selectedLaby.value
          ? { clearedDungeonId: labyClearId(selectedLaby.value.id) }
          : {}),
      });
    // Recale les compteurs affichés sur les montants RÉELLEMENT crédités (fraction gardée
    // en cas de mort) → le récap ne ment pas.
    gold.value = Math.floor(gold.value * keep);
    scrollsGained.value = Math.floor(scrolls * keep);
  }
  stopAuto(); // fin de run → coupe l'auto (la relance depuis la modale est manuelle)
  over.value = true;
}
// Relance directement une nouvelle expédition depuis la modale de fin (−1 clé).
function replay() {
  over.value = false;
  void start();
}
// Relance le même palier en AUTO depuis la modale de fin.
function replayAuto() {
  over.value = false;
  if (selectedLaby.value) void startAuto(selectedLaby.value);
}
</script>

<style scoped>
.expe {
  background: var(--bg);
  min-height: 100vh;
  padding: 0 16px 40px;
}
.expe.embedded {
  min-height: 0;
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
/* Ladder : liste des paliers de Labyrinthe. */
.laby-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
  margin-top: 16px;
}
.laby-tier {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  background: var(--surface);
  color: inherit;
}
.laby-tier.locked {
  border-left-color: var(--line);
  opacity: 0.6;
}
.laby-tier.cleared {
  border-left-color: var(--d1);
}
.lt-emo {
  font-size: 24px;
  flex: 0 0 auto;
}
.lt-main {
  flex: 1 1 auto;
  min-width: 0;
}
.lt-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}
.lt-badge {
  color: var(--d1);
}
.lt-meta {
  font-size: 11.5px;
  color: var(--dim);
  margin-top: 1px;
}
.lt-fam {
  color: color-mix(in srgb, var(--accent) 70%, var(--dim));
}
.lt-pow {
  color: color-mix(in srgb, #ff6a45 55%, var(--dim));
  font-variant-numeric: tabular-nums;
}
.lt-pow.ok {
  color: color-mix(in srgb, #7bc86c 75%, var(--dim));
}
.lt-death {
  color: color-mix(in srgb, #ff6a45 60%, var(--dim));
}
.lt-lock {
  font-size: 11px;
  color: var(--dim);
  margin-top: 2px;
}
.lt-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lt-go {
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  border-radius: 9px;
  padding: 6px 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.lt-go.auto {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  color: color-mix(in srgb, var(--accent) 80%, var(--text));
}
.lt-go:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.lt-go:not(:disabled):active {
  transform: scale(0.96);
}
/* Bandeau AUTO pendant un run auto. */
.auto-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin: 6px 0 10px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.ab-txt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}
.ab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: ab-pulse 1s ease-in-out infinite;
}
@keyframes ab-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ab-dot {
    animation: none;
  }
}
.ab-stop {
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 9px;
  padding: 5px 10px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
/* En auto, les salles ne sont pas cliquables → curseur neutre. */
.room.auto {
  cursor: default;
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
.bag-chip-btn {
  cursor: pointer;
}
.bag-chip-btn:not(:disabled):hover {
  border-color: var(--primary);
}
.bag-chip-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.map-wrap {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 12px;
}
.map {
  width: 100%;
  height: auto;
  display: block;
}
/* Teinte d'ambiance du palier (couleur du rang), douce, en fond de carte. */
.map-amb {
  fill: var(--amb, #9a8f7e);
  opacity: 0.1;
}
/* Couloirs = passages carvés : large sous-couche « sol » teintée + trait plus clair. */
.corridor-floor {
  stroke: color-mix(in srgb, var(--amb, #9a8f7e) 30%, #000);
  stroke-width: 9;
  stroke-linecap: round;
  opacity: 0.55;
}
.corridor {
  stroke: color-mix(in srgb, var(--amb, #9a8f7e) 35%, var(--line));
  stroke-width: 4;
  stroke-linecap: round;
}
/* Torches des salles éclairées (visitées) : petites flammes qui vacillent. */
.torch {
  fill: #ffb23f;
  filter: drop-shadow(0 0 1.4px #ff8a2f);
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: torch-flicker 0.9s ease-in-out infinite;
}
.torch.t2 {
  animation-delay: 0.45s;
}
@keyframes torch-flicker {
  0%,
  100% {
    opacity: 0.85;
    transform: scaleY(1);
  }
  50% {
    opacity: 1;
    transform: scaleY(1.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .torch {
    animation: none;
  }
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
/* Salle secrète découverte : liseré doré (elle reste « ? » tant qu'on n'y est pas entré). */
.room.vault .room-bg {
  fill: color-mix(in srgb, #ffd23f 20%, var(--surface));
  stroke: #ffd23f;
  stroke-width: 2.5;
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
.chest-big {
  width: 84px;
  height: 84px;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.4));
}
.chest-grade {
  font-weight: 800;
  font-size: 18px;
  margin-top: 2px;
  letter-spacing: 0.02em;
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
.fl-icon {
  margin: 0 auto 6px;
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
.ol-hint {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  opacity: 0.75;
}
.ol-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  border-left-width: 3px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ol-item[class*='r-'] {
  border-left-color: var(--rk, var(--line));
}
.ol-item:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
}
.ol-item:active {
  transform: scale(0.99);
}
.ol-chevron {
  margin-left: auto;
  font-size: 18px;
  color: var(--dim);
}
/* Modale de détail d'objet : la carte de butin, un peu plus large. */
.im-card {
  min-width: 260px;
  max-width: 92vw;
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
