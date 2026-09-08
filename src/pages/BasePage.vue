<template>
  <component :is="embedded ? 'div' : 'q-page'" class="base-page" :class="{ embedded }">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="back()">‹</button>
      <div class="top-title font-display">Ma base</div>
      <div class="iconbtn" />
    </header>

    <div class="bar">
      <span class="bar-chip">🪙 {{ char.row?.gold ?? 0 }}</span>
      <span class="bar-chip">🔩 {{ char.row?.scrap ?? 0 }}</span>
      <span class="bar-chip">Niv. {{ heroLevel }}</span>
      <span v-if="heroHome" class="bar-chip home">🦸 Héros à la base</span>
      <span v-else class="bar-chip away">🧭 Héros en expédition</span>
    </div>

    <!-- ── L'ENCEINTE ────────────────────────────────────────────────────────
         Octogone : ses 8 sommets SONT les 8 emplacements de tourelle. Les
         emplacements vides restent dessinés en pointillés — ils disent au joueur
         ce qu'il pourrait avoir. -->
    <div class="keep-wrap">
      <svg viewBox="0 0 200 200" class="keep" role="img" aria-label="Enceinte de la base">
        <defs>
          <radialGradient id="ground" cx="50%" cy="50%">
            <stop offset="0%" stop-color="#2b241a" />
            <stop offset="100%" stop-color="#1a1610" />
          </radialGradient>
        </defs>

        <!-- Terrain extérieur + champ de bataille -->
        <rect x="0" y="0" width="200" height="200" fill="url(#ground)" />
        <g v-if="corpses.length" class="field">
          <text
            v-for="c in corpses"
            :key="c.id"
            :x="(c.x / 100) * 200"
            :y="(c.y / 100) * 200"
            :class="['corpse', { looted: c.looted, champ: c.champion }]"
            text-anchor="middle"
          >
            {{ c.looted ? '·' : c.emoji }}
          </text>
        </g>

        <!-- Le mur -->
        <polygon
          :points="wallPoints"
          class="wall"
          :class="{ absent: !wallLevel, damaged: wallDamaged }"
        />
        <polygon :points="innerPoints" class="inner" />

        <!-- Emplacements de tourelle (8 sommets) -->
        <g v-for="(p, i) in octagon" :key="`t${i}`">
          <circle
            :cx="p.x"
            :cy="p.y"
            r="11"
            class="turret"
            :class="{ on: i < turretsBuilt, damaged: turretsDamaged && i < turretsBuilt }"
          />
          <text v-if="i < turretsBuilt" :x="p.x" :y="p.y + 4.5" class="turret-emo">🏹</text>
        </g>

        <!-- Tour de guet : plantée sur le mur, au nord -->
        <g v-if="watchLevel">
          <rect
            x="92"
            y="18"
            width="16"
            height="26"
            rx="3"
            class="tower"
            :class="{ damaged: watchDamaged }"
          />
          <text x="100" y="37" class="tower-emo">🗼</text>
        </g>

        <!-- Bâtiments à L'INTÉRIEUR -->
        <g v-for="(b, i) in innerBuildings" :key="b.typeId">
          <text :x="innerSpot(i).x" :y="innerSpot(i).y" class="bld" text-anchor="middle">
            {{ b.emoji }}
          </text>
        </g>
        <text v-if="!innerBuildings.length" x="100" y="105" class="empty-hint" text-anchor="middle">
          rien à protéger encore
        </text>
      </svg>

      <div class="keep-legend">
        <span>🧱 Muraille {{ wallLevel || '—' }}</span>
        <span>🏹 {{ turretsBuilt }}/{{ TURRET_SLOTS }} tourelles</span>
        <span>🗼 Guet {{ watchLevel || '—' }}</span>
      </div>
    </div>

    <!-- ── Production gelée ── -->
    <div v-if="freeze" class="panel warn">
      <div class="p-title">❄️ Production gelée</div>
      <p>
        Tes filons sont à l’arrêt tant que l’enceinte est en ruine.
        <b>Répare-la et la production repart.</b>
        Sinon, une séance de sport la relance aussi — ou les ouvriers s’y remettent seuls
        {{ freezeIn }}.
      </p>
      <button
        v-if="repairAllCost > 0"
        class="cta"
        :disabled="(char.row?.scrap ?? 0) < repairAllCost"
        @click="doRepairAll"
      >
        🔩 Tout réparer · {{ repairAllCost }} ferraille
      </button>
    </div>

    <!-- ── Menace en approche ── -->
    <div v-if="raid" class="panel threat">
      <div class="p-title">⚠️ Une armée approche — {{ arriveIn }}</div>
      <div class="scout">
        <div class="scout-line">
          <span class="k">Nature</span>
          <span class="v">
            {{
              scout.faction
                ? `${FACTION_EMOJI[scout.faction]} ${FACTION_LABEL[scout.faction]}`
                : '???'
            }}
          </span>
        </div>
        <div class="scout-line">
          <span class="k">Butin attendu</span>
          <span class="v">{{ scout.faction ? FACTION_LOOT[scout.faction] : '???' }}</span>
        </div>
        <div class="scout-line">
          <span class="k">Effectif</span>
          <span class="v">{{ scout.size ?? '???' }}</span>
        </div>
        <div class="scout-line">
          <span class="k">Niveau moyen</span>
          <span class="v">{{ scout.avgLevel ?? '???' }}</span>
        </div>
        <div v-if="scout.groups" class="scout-groups">
          <span v-for="(g, i) in scout.groups" :key="i" class="grp" :class="{ champ: g.champion }">
            {{ g.emoji }} ×{{ g.count }} · niv {{ g.level }}
          </span>
        </div>
        <div v-if="scout.forecast" class="forecast">
          🎯 Pronostic : <b>{{ forecastPct }} %</b> de chances de tenir
        </div>
      </div>
      <p class="scout-hint">
        {{ scoutHint }}
      </p>
    </div>
    <div v-else class="panel calm">
      <div class="p-title">🕊️ Aucune menace en vue</div>
      <p v-if="!wallLevel">
        Sans <b>muraille</b>, personne ne vient t’attaquer. C’est à toi d’ouvrir le bal.
      </p>
      <p v-else>Prochaine alerte {{ nextRaidIn }}. Ta base prospère : elle attire.</p>
    </div>

    <!-- ── Champ de bataille ── -->
    <div v-if="field" class="panel loot">
      <div class="p-title">🦴 Champ de bataille — {{ remaining }} corps</div>
      <p v-if="!salvageLevel">
        Construis un <b>Chantier de fouille</b> pour dépouiller les corps avant qu’ils ne
        pourrissent ({{ rotIn }}).
      </p>
      <template v-else>
        <p>
          {{ scavCap }} fouilleurs par vague · les corps pourrissent {{ rotIn }}. Tu peux les
          renvoyer autant de fois qu’il le faut.
        </p>
        <button v-if="scavReady" class="cta" @click="doCollect">
          📦 Récupérer le butin de la vague
        </button>
        <button v-else-if="scavBusy" class="cta ghost" disabled>
          ⏳ Fouilleurs sur le terrain — {{ scavIn }}
        </button>
        <button v-else-if="remaining > 0" class="cta" @click="doSend">
          🦴 Envoyer les fouilleurs ({{ Math.min(scavCap, remaining) }} corps)
        </button>
        <p v-else class="done">Le champ est entièrement dépouillé.</p>
      </template>
    </div>

    <!-- ── Structures ── -->
    <div class="panel">
      <div class="p-title">🛠️ Enceinte</div>
      <div v-for="t in DEFENSE_TYPES" :key="t.id" class="struct">
        <div class="s-head">
          <span class="s-emo">{{ t.emoji }}</span>
          <div class="s-id">
            <div class="s-label">
              {{ t.label }}
              <span v-if="lvlOf(t.id)" class="s-lvl">niv. {{ lvlOf(t.id) }}</span>
              <span v-if="damagedOf(t.id)" class="s-dmg">endommagée</span>
            </div>
            <div class="s-desc">{{ t.desc }}</div>
          </div>
        </div>
        <div class="s-actions">
          <button
            v-if="!lvlOf(t.id)"
            class="btn"
            :disabled="!canBuild(t.id)"
            @click="doBuild(t.id)"
          >
            Construire · {{ t.buildGold }} 🪙<span v-if="t.buildScrap">
              + {{ t.buildScrap }} 🔩</span
            >
          </button>
          <template v-else>
            <button
              v-if="damagedOf(t.id)"
              class="btn fix"
              :disabled="!canRepair(t.id)"
              @click="doRepair(t.id)"
            >
              Réparer · {{ repairCost(lvlOf(t.id)) }} 🔩
            </button>
            <button class="btn" :disabled="!canUpgrade(t.id)" @click="doUpgrade(t.id)">
              Améliorer · {{ upCost(t.id).gold }} 🪙 + {{ upCost(t.id).scrap }} 🔩
            </button>
          </template>
        </div>
        <div v-if="lvlOf(t.id) >= heroLevel" class="s-cap">
          Plafonné par ton niveau de personnage — le sport reste le plafond.
        </div>
      </div>
      <p v-if="heroLevel < defenseUnlockLevel" class="s-gate">
        🔒 L’enceinte se débloque au niveau {{ defenseUnlockLevel }}.
      </p>
    </div>

    <!-- ── Dernier siège ── -->
    <div v-if="lastReport" class="panel">
      <div class="p-title">
        {{ lastReport.held ? '🏆 Dernier siège — repoussé' : '💥 Dernier siège — enceinte forcée' }}
      </div>
      <p>
        {{ FACTION_EMOJI[lastReport.faction] }} {{ FACTION_LABEL[lastReport.faction] }} ·
        {{ lastReport.defeated }}/{{ lastReport.total }} groupes repoussés ·
        {{ lastReport.heroHome ? 'héros présent' : 'héros absent' }}
      </p>
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useProgress } from '@/composables/useProgress';
import { useGamePanel } from '@/composables/useGamePanel';
import { computeCharacter } from '@/lib/character';
import { playerWithGear } from '@/lib/items';
import { buildingType, buildingUpgradeCost } from '@/lib/buildings';
import {
  DEFENSE_TYPES,
  FACTION_EMOJI,
  FACTION_LABEL,
  FACTION_LOOT,
  TURRET_SLOTS,
  baseCombatant,
  defenseLevel,
  isDamaged,
  repairCost,
  resolveRaid,
  scavengerCount,
  scoutClarity,
  scoutLevel,
  scoutReport,
  turretCount,
  remainingCorpses,
  totalRepairCost,
  type DefenseId,
  type ScoutReport,
} from '@/lib/raid';

/** Niveau d'accès à l'enceinte. La défense est un système de mi-partie : elle suppose une
 *  économie derrière elle (or, ferraille) et une base qui vaille la peine d'être défendue.
 *  Mesuré, un joueur trop tôt ne tenait aucun siège même en bâtissant à son niveau. */
const defenseUnlockLevel = Math.min(...DEFENSE_TYPES.map((t) => t.unlockLevel));

const props = defineProps<{ embedded?: boolean }>();
const router = useRouter();
const $q = useQuasar();
const char = useCharacterStore();
const auth = useAuthStore();
const progress = useProgress();
const { gameBack } = useGamePanel();

function back() {
  if (props.embedded) gameBack();
  else router.back();
}

// Horloge : tout l'état de la base est dérivé de timestamps (aucun cron, hors-ligne).
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const heroLevel = computed(() => progress.global.value.level);
const base = computed(() => char.row?.base ?? null);
const defenses = computed(() => base.value?.defenses ?? []);
const raid = computed(() => base.value?.raid ?? null);
const field = computed(() => base.value?.field ?? null);
const freeze = computed(() => base.value?.freeze ?? null);
const lastReport = computed(() => base.value?.lastReport ?? null);
const corpses = computed(() => field.value?.corpses ?? []);
const remaining = computed(() => remainingCorpses(field.value));
const heroHome = computed(() => !char.row?.expedition);

const wallLevel = computed(() => defenseLevel(defenses.value, 'wall'));
const watchLevel = computed(() => defenseLevel(defenses.value, 'watchtower'));
const salvageLevel = computed(() => defenseLevel(defenses.value, 'salvage'));
const wallDamaged = computed(() => isDamaged(defenses.value, 'wall'));
const watchDamaged = computed(() => isDamaged(defenses.value, 'watchtower'));
const turretsDamaged = computed(() => isDamaged(defenses.value, 'turret'));
const turretsBuilt = computed(() => turretCount(defenseLevel(defenses.value, 'turret')));
const scavCap = computed(() => scavengerCount(salvageLevel.value));
/** Ce que coûte le retour à la normale : remettre l'enceinte en état relance aussi la
 *  production (le gel est la conséquence de la casse, pas une punition séparée). */
const repairAllCost = computed(() => (base.value ? totalRepairCost(base.value) : 0));

// ── Géométrie de l'enceinte : un octogone dont les 8 sommets sont les emplacements
// de tourelle. TURRET_SLOTS vaut 8 précisément pour que le compte tombe juste.
const octagon = computed(() =>
  Array.from({ length: TURRET_SLOTS }, (_, i) => {
    const a = (i / TURRET_SLOTS) * Math.PI * 2 - Math.PI / 2;
    return { x: 100 + Math.cos(a) * 72, y: 100 + Math.sin(a) * 72 };
  }),
);
const wallPoints = computed(() => octagon.value.map((p) => `${p.x},${p.y}`).join(' '));
const innerPoints = computed(() =>
  octagon.value.map((p) => `${100 + (p.x - 100) * 0.86},${100 + (p.y - 100) * 0.86}`).join(' '),
);

/** Les bâtiments de production, à l'intérieur des murs — c'est ce qu'on défend. */
const innerBuildings = computed(() =>
  (char.row?.buildings ?? []).map((b) => ({
    typeId: b.typeId,
    emoji: buildingType(b.typeId)?.emoji ?? '🏠',
  })),
);
function innerSpot(i: number): { x: number; y: number } {
  const cols = 3;
  const x = 68 + (i % cols) * 32;
  const y = 88 + Math.floor(i / cols) * 30;
  return { x, y };
}

// ── Renseignement ──
const EMPTY_SCOUT: ScoutReport = {
  clarity: 0,
  faction: null,
  size: null,
  avgLevel: null,
  hasChampion: null,
  groups: null,
  forecast: false,
};
const scout = computed(() => (raid.value ? scoutReport(raid.value, clarity.value) : EMPTY_SCOUT));
const clarity = computed(() =>
  raid.value ? scoutClarity(scoutLevel(defenses.value), raid.value.level, heroLevel.value) : 0,
);
const scoutHint = computed(() => {
  if (!watchLevel.value) return 'Sans Tour de guet, tu ne sais rien de ce qui arrive.';
  if (clarity.value >= 5) return 'Ta tour lit l’armée à livre ouvert.';
  return 'Monte la Tour de guet pour en savoir plus — et être prévenu plus tôt.';
});

/** Pronostic : Monte-Carlo seedé sur les défenses RÉELLES, comme le 🎯 % des donjons.
 *  Réservé à la clarté maximale : c'est la dernière chose que le renseignement achète. */
const forecastPct = computed(() => {
  const r = raid.value;
  if (!r) return 0;
  const def = baseCombatant(defenses.value, heroHome.value ? hero.value : null);
  let held = 0;
  for (let i = 0; i < 40; i++) {
    if (resolveRaid(def, { ...r, seed: r.seed + i * 7919 }, 0, heroHome.value).held) held++;
  }
  return Math.round((held / 40) * 100);
});

const hero = computed(() => {
  const c = char.row;
  if (!c) return null;
  const st = computeCharacter(
    progress.powerXp.value,
    progress.enduranceXp.value,
    progress.agilityXp.value,
    progress.energyEarned.value + c.login_energy,
    c.energy_spent,
  );
  return playerWithGear(c.pseudo, st, c.equipped, {}, st.level.level, c.voie);
});

// ── Compteurs ──
function fmtDelay(ms: number): string {
  if (ms <= 0) return 'maintenant';
  const m = Math.round(ms / 60000);
  if (m < 60) return `dans ${m} min`;
  const h = Math.floor(m / 60);
  return `dans ${h} h ${String(m % 60).padStart(2, '0')}`;
}
const arriveIn = computed(() => (raid.value ? fmtDelay(raid.value.arrivesAt - now.value) : ''));
const nextRaidIn = computed(() =>
  base.value ? fmtDelay(base.value.nextRaidAt - now.value) : 'plus tard',
);
const freezeIn = computed(() => (freeze.value ? fmtDelay(freeze.value.until - now.value) : ''));
const rotIn = computed(() => (field.value ? fmtDelay(field.value.expiresAt - now.value) : ''));
const scavBusy = computed(
  () => !!field.value?.dispatchUntil && now.value < field.value.dispatchUntil,
);
const scavReady = computed(
  () => !!field.value?.dispatchUntil && now.value >= field.value.dispatchUntil,
);
const scavIn = computed(() =>
  field.value?.dispatchUntil ? fmtDelay(field.value.dispatchUntil - now.value) : '',
);

// ── Structures ──
function lvlOf(id: DefenseId): number {
  return defenseLevel(defenses.value, id);
}
function damagedOf(id: DefenseId): boolean {
  return isDamaged(defenses.value, id);
}
function upCost(id: DefenseId): { gold: number; scrap: number } {
  const l = Math.max(1, lvlOf(id));
  return { gold: buildingUpgradeCost(l), scrap: repairCost(l) };
}
function canBuild(id: DefenseId): boolean {
  const t = DEFENSE_TYPES.find((x) => x.id === id);
  const c = char.row;
  if (!t || !c) return false;
  return heroLevel.value >= t.unlockLevel && c.gold >= t.buildGold && c.scrap >= t.buildScrap;
}
function canUpgrade(id: DefenseId): boolean {
  const c = char.row;
  if (!c || lvlOf(id) >= heroLevel.value) return false;
  const k = upCost(id);
  return c.gold >= k.gold && c.scrap >= k.scrap;
}
function canRepair(id: DefenseId): boolean {
  return (char.row?.scrap ?? 0) >= repairCost(lvlOf(id));
}

async function guard(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  }
}
const uid = computed(() => auth.user?.id ?? '');
const doBuild = (id: DefenseId) =>
  guard(() => char.buildDefense(uid.value, id, heroLevel.value, Date.now()));
const doUpgrade = (id: DefenseId) =>
  guard(() => char.upgradeDefense(uid.value, id, heroLevel.value, Date.now()));
const doRepair = (id: DefenseId) => guard(() => char.repairDefense(uid.value, id));
const doRepairAll = () =>
  guard(async () => {
    const cost = await char.repairAll(uid.value);
    if (cost)
      $q.notify({ type: 'positive', message: '🔩 Enceinte réparée — la production repart.' });
  });
const doSend = () => guard(() => char.sendScavengers(uid.value, Date.now()));
const doCollect = () =>
  guard(async () => {
    const got = await char.collectScavengers(uid.value, Date.now(), heroLevel.value);
    if (!got) return;
    const bits = [
      got.gold ? `🪙 ${got.gold}` : '',
      got.fragments ? `🧩 ${got.fragments}` : '',
      got.inkDust ? `🖋️ ${got.inkDust}` : '',
      got.items.length ? `🎁 ${got.items.length} objet${got.items.length > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    $q.notify({
      type: 'positive',
      message: `${got.corpses} corps dépouillés — ${bits.join(' · ') || 'rien de valeur'}`,
    });
  });
</script>

<style scoped>
.base-page {
  padding: 0 12px 28px;
}
.base-page.embedded {
  min-height: 0;
}
.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  letter-spacing: 0.4px;
}
.iconbtn {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.bar-chip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
}
.bar-chip.home {
  border-color: #7bc86c;
  color: #7bc86c;
}
.bar-chip.away {
  color: var(--dim);
}

/* ── Enceinte ── */
.keep-wrap {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 6px;
  margin-bottom: 12px;
}
.keep {
  width: 100%;
  display: block;
  border-radius: 10px;
}
.wall {
  fill: #241f18;
  stroke: #6b5c45;
  stroke-width: 7;
  stroke-linejoin: round;
}
.wall.absent {
  stroke: #3a332a;
  stroke-dasharray: 6 6;
  fill: #1d1913;
}
.wall.damaged {
  stroke: #ff6a45;
  stroke-dasharray: 14 7;
}
.inner {
  fill: #2b2419;
  stroke: #3a332a;
  stroke-width: 1.5;
}
.turret {
  fill: #1d1913;
  stroke: #3a332a;
  stroke-width: 2;
  stroke-dasharray: 3 3;
}
.turret.on {
  fill: #3a2f1c;
  stroke: var(--accent, #ffd23f);
  stroke-dasharray: none;
}
.turret.damaged {
  stroke: #ff6a45;
}
.turret-emo {
  font-size: 11px;
  text-anchor: middle;
}
.tower {
  fill: #3a2f1c;
  stroke: var(--accent, #ffd23f);
  stroke-width: 2;
}
.tower.damaged {
  stroke: #ff6a45;
}
.tower-emo {
  font-size: 12px;
  text-anchor: middle;
}
.bld {
  font-size: 17px;
}
.empty-hint {
  font-size: 8px;
  fill: var(--dim);
}
.corpse {
  font-size: 11px;
  opacity: 0.9;
}
.corpse.looted {
  font-size: 14px;
  fill: #5c5346;
  opacity: 0.6;
}
.corpse.champ {
  font-size: 15px;
}
.keep-legend {
  display: flex;
  justify-content: space-around;
  font-size: 11px;
  color: var(--dim);
  padding: 6px 0 2px;
}

/* ── Panneaux ── */
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 12px;
}
.panel p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--dim);
  line-height: 1.45;
}
.panel.threat {
  border-color: #ffb23f;
}
.panel.warn {
  border-color: #ff6a45;
}
.p-title {
  font-weight: 600;
  font-size: 14px;
}
.scout {
  margin-top: 8px;
}
.scout-line {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.scout-line .k {
  color: var(--dim);
}
.scout-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.grp {
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 2px 7px;
  font-size: 12px;
}
.grp.champ {
  border-color: #ffb23f;
  color: #ffb23f;
}
.forecast {
  margin-top: 8px;
  font-size: 13px;
}
.scout-hint {
  font-style: italic;
}
.done {
  color: #7bc86c !important;
}

/* ── Structures ── */
.struct {
  border-top: 1px solid var(--line);
  padding: 10px 0 4px;
}
.s-head {
  display: flex;
  gap: 10px;
}
.s-emo {
  font-size: 22px;
}
.s-label {
  font-size: 14px;
  font-weight: 600;
}
.s-lvl {
  color: var(--accent, #ffd23f);
  font-size: 12px;
  margin-left: 6px;
}
.s-dmg {
  color: #ff6a45;
  font-size: 11px;
  margin-left: 6px;
}
.s-desc {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
}
.s-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.s-cap {
  font-size: 11px;
  color: var(--dim);
  margin-top: 5px;
}
.s-gate {
  margin-top: 10px !important;
}
.btn,
.cta {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  font-size: 13px;
  padding: 0 12px;
  cursor: pointer;
}
.btn:disabled,
.cta:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.fix {
  border-color: #ff6a45;
  color: #ff6a45;
}
.cta {
  width: 100%;
  margin-top: 10px;
  border-color: var(--accent, #ffd23f);
  color: var(--accent, #ffd23f);
}
.cta.ghost {
  border-color: var(--line);
  color: var(--dim);
}
</style>
