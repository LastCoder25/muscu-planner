<!--
  VillagePlots — les EMPLACEMENTS du village (bâtiments de production/utilitaires).

  Vivait sur la carte d'expédition, en anneau de petites pastilles SVG autour de la ville.
  Déplacé ICI (écran « Ma base ») en v0.664 : la carte n'a plus qu'un métier — choisir où
  envoyer le héros — et la base rassemble tout ce qui se gère. Les cibles tactiles passent
  au passage de pastilles de 8 px à de vraies tuiles.

  ⚠️ Aucune formule n'est réécrite : tout passe par `src/lib/buildings.ts` et le store, qui
  restent la source unique (coûts, production, stockage, plafonds).
-->
<template>
  <div class="vp">
    <!-- Feuille de gestion d'un emplacement -->
    <q-dialog v-model="sheetOpen" position="bottom">
      <q-card v-if="selectedPlot" class="vp-sheet">
        <div class="sh-head">
          <span class="sh-emo">{{
            selectedPlot.building ? emojiOf(selectedPlot.building) : '🏗️'
          }}</span>
          <div class="sh-main">
            <div class="sh-title font-display">
              {{ selectedPlot.building ? labelOf(selectedPlot.building) : 'Emplacement libre' }}
            </div>
            <div class="sh-sub">
              <template v-if="!selectedPlot.unlocked">
                🔒 Débloqué au niveau {{ nextSlotLevel }}
              </template>
              <template v-else-if="selectedPlot.building">
                Niv {{ selectedPlot.building.level }} · {{ effectNow(selectedPlot.building) }}
              </template>
              <template v-else>
                Construis un bâtiment : débloque une activité ou améliore tes récompenses.
              </template>
            </div>
          </div>
          <button class="sh-x" @click="selectedSlot = null">✕</button>
        </div>

        <!-- Construire -->
        <div v-if="selectedPlot.unlocked && !selectedPlot.building" class="pb">
          <template v-for="g in buildGroups" :key="g.key">
            <div class="pb-group">
              <span class="pb-group-t">{{ g.label }}</span>
              <span class="pb-group-h">{{ g.hint }}</span>
            </div>
            <button
              v-for="t in g.types"
              :key="t.id"
              class="pb-opt"
              :class="{ locked: !typeBuildable(t) }"
              :disabled="!typeBuildable(t) || gold < t.buildGold"
              @click="doBuild(selectedPlot.slot, t.id)"
            >
              <span class="pb-emo">{{ t.emoji }}</span>
              <span class="pb-main">
                <span class="pb-name">{{ t.label }}</span>
                <span class="pb-desc">{{ t.desc }}</span>
                <span class="pb-perlv">⬆️ par niveau : {{ perLevelLabel(t) }}</span>
              </span>
              <span class="pb-cost">
                {{ typeBuildable(t) ? '🪙' + t.buildGold : typeLockReason(t) }}
              </span>
            </button>
          </template>
        </div>

        <!-- Gérer -->
        <div v-else-if="selectedPlot.building" class="pm">
          <div class="pm-level">
            <span
              >Niveau <b>{{ selectedPlot.building.level }}</b> ·
              {{ effectNow(selectedPlot.building) }}</span
            >
            <span v-if="effectNext(selectedPlot.building)" class="pm-next">
              ⬆️ Niv {{ selectedPlot.building.level + 1 }} · {{ effectNext(selectedPlot.building) }}
            </span>
            <span v-if="perLevelOf(selectedPlot.building)" class="pm-perlv">
              Chaque niveau : {{ perLevelOf(selectedPlot.building) }}
            </span>
          </div>
          <div v-if="produces(selectedPlot.building)" class="pm-ready">
            <span>
              En stock :
              <b
                >{{ resEmoji(selectedPlot.building)
                }}{{ accruedExact(selectedPlot.building).toFixed(1) }}</b
              >
            </span>
            <span class="pm-cap">/ {{ Math.floor(storageOf(selectedPlot.building)) }} max</span>
          </div>
          <!-- ⚠️ « Convois plus rapides à chaque niveau » ne permet pas de décider d'un
               investissement qui se compte en centaines de milliers d'or. On montre les
               CHIFFRES des prochains paliers — calculés par les fonctions du jeu, donc
               ils ne peuvent pas mentir. -->
          <div v-if="preview.length" class="pm-prev">
            <div class="pm-prev-t">Aux prochains niveaux</div>
            <div
              v-for="r in preview"
              :key="r.level"
              class="pm-prev-r"
              :class="{ now: r.level === selectedPlot.building.level, step: r.milestone }"
            >
              <span class="pp-lv">niv {{ r.level }}</span>
              <span class="pp-tx">{{ r.text }}</span>
              <span v-if="r.level === selectedPlot.building.level" class="pp-tag">actuel</span>
            </div>
            <div v-if="milestone" class="pm-prev-r step far">
              <span class="pp-lv">niv {{ milestone.level }}</span>
              <span class="pp-tx">{{ milestone.text }}</span>
            </div>
          </div>
          <!-- ⚒️ L'ÉQUIPEMENTIER (v0.881, demandé : « création plus rapide ») : on touche un
               aventurier, puis l'objet à fondre — la pièce qui en sortira est annoncée sur
               la ligne (emplacement + rang). Les fabrications se mettent en FILE. La pièce
               sort au RANG de l'aventurier, jamais au-dessus de l'objet fourni. -->
          <div v-if="selectedPlot.building.typeId === 'outfitter'" class="of">
            <div v-if="outfitQueue.length" class="of-queue">
              <div class="of-t">⚒️ En fabrication · {{ outfitQueue.length }}</div>
              <div v-for="(j, i) in outfitQueue" :key="i" class="of-q">
                <span>{{ j.emoji }}</span>
                <span class="of-q-main">
                  {{ j.name }} <b :style="{ color: j.color }">{{ j.rank }}</b> pour {{ j.advName }}
                </span>
                <span class="of-q-left">{{ fmtSpan(j.leftMs) }}</span>
              </div>
            </div>
            <div class="of-t">Pour qui ?</div>
            <p v-if="!outfitAdvs.length" class="of-note">
              Recrute d’abord un aventurier à la Guilde.
            </p>
            <div v-else class="of-advs">
              <button
                v-for="a in outfitAdvs"
                :key="a.id"
                type="button"
                class="of-adv"
                :class="{ on: outfitAdvId === a.id }"
                @click="outfitAdvId = a.id"
              >
                <span>{{ a.emoji }}</span>
                <span class="of-adv-n">{{ a.name }}</span>
                <span class="of-adv-r" :style="{ color: a.color }">{{ a.rank }}</span>
                <span class="of-adv-g" :title="`${a.worn} pièce(s) portée(s) sur 4`"
                  >🗡️ {{ a.worn }}/4</span
                >
              </button>
            </div>
            <template v-if="outfitAdv">
              <!-- Ce qu'il porte AVANT de fondre quoi que ce soit (demandé : « il me faut savoir
                   son équipement avant de lancer la production »). Mêmes cases que la Guilde. -->
              <div class="of-t">Équipement de {{ outfitAdv.name }}</div>
              <div class="of-gear">
                <div
                  v-for="g in outfitGear"
                  :key="g.slot"
                  class="of-cell"
                  :class="{ empty: !g.filled }"
                  :style="g.color ? { '--gc': g.color } : {}"
                  :title="g.title"
                >
                  <span class="of-cell-e">{{ g.emoji }}</span>
                  <span class="of-cell-m">
                    <span class="of-cell-n">{{ g.name }}</span>
                    <span v-if="g.filled" class="of-cell-s">
                      <b :style="{ color: g.color }">{{ g.rank }}</b> · {{ g.stat }}
                    </span>
                    <span v-else class="of-cell-s">vide</span>
                    <span v-if="g.queued" class="of-cell-q">⚒️ {{ g.queued }} en fabrication</span>
                  </span>
                </div>
              </div>
              <div class="of-t">
                Quel objet fondre ?
                <span class="of-sub">
                  pièce au rang de {{ outfitAdv.name }}, jamais au-dessus de l’objet ·
                  {{ fmtSpan(outfitterMsFor(selectedPlot.building.level)) }} chacune
                </span>
              </div>
              <p v-if="!outfitRows.length" class="of-note">Aucun objet à fondre dans ton sac.</p>
              <button
                v-for="r in outfitRows"
                :key="r.item.id"
                type="button"
                class="of-item"
                :disabled="outfitBusy"
                @click="doOutfit(r)"
              >
                <span class="of-from">
                  {{ r.item.emoji }} {{ r.item.name }}
                  <span :style="{ color: rarityRank(r.item.rarity).color }">{{
                    gradeLabel(r.item)
                  }}</span>
                </span>
                <span class="of-to">
                  → {{ r.emoji }} {{ r.name }}
                  <b :style="{ color: rarityRank(r.rank).color }">{{ rarityRank(r.rank).name }}</b>
                  <span v-if="r.capped" class="of-warn">↓ objet plus bas</span>
                </span>
                <span class="of-vs" :class="'v-' + r.verdict">
                  <template v-if="r.verdict === 'empty'">✚ emplacement vide</template>
                  <template v-else-if="r.current">
                    {{ VERDICT_LABEL[r.verdict] }} {{ r.current.emoji }} {{ r.current.name }}
                    <b :style="{ color: rarityRank(r.current.rarity).color }">{{
                      rarityRank(r.current.rarity).name
                    }}</b>
                  </template>
                  <span v-if="r.queued" class="of-q-note">
                    · ⚒️ {{ r.queued }} déjà en fabrication</span
                  >
                </span>
              </button>
            </template>
          </div>
          <div class="pm-actions">
            <!-- ⚠️ Le vivier se gère DEPUIS SON BÂTIMENT. Il vivait dans une carte en bas
                 de la base, loin de la Guilde qu'on venait de monter : on cherchait ses
                 aventuriers là où ils n'étaient pas. Un bâtiment, un endroit. -->
            <button
              v-if="selectedPlot.building.typeId === 'guild'"
              class="pm-btn open"
              @click="emit('open-guild')"
            >
              ⚔️ Voir mes aventuriers
            </button>
            <button
              v-if="produces(selectedPlot.building)"
              class="pm-btn"
              :disabled="accrued(selectedPlot.building) < 1"
              @click="collectAll"
            >
              🧺 Récolter
            </button>
            <button
              v-if="buildingScales(selectedPlot.building.typeId)"
              class="pm-btn up"
              :disabled="!canUp(selectedPlot.building) || gold < upCost(selectedPlot.building)"
              @click="doUpgrade(selectedPlot.slot)"
            >
              <template v-if="!canUp(selectedPlot.building)">Max (niv {{ heroLevel }})</template>
              <template v-else>⬆️ Améliorer · 🪙{{ upCost(selectedPlot.building) }}</template>
            </button>
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Annonce « activité débloquée » -->
    <q-dialog v-model="unlockOpen">
      <q-card v-if="unlockInfo" class="unlock-card">
        <div class="unlock-emo">{{ unlockInfo.emoji }}</div>
        <div class="unlock-title font-display">{{ unlockInfo.label }} construit !</div>
        <div class="unlock-act">
          🎉 Débloqué : <b>{{ unlockInfo.unlock.activity }}</b>
        </div>
        <div class="unlock-where">📍 {{ unlockInfo.unlock.where }}</div>
        <button class="unlock-ok" @click="unlockInfo = null">Continuer</button>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useGameFx } from '@/composables/useGameFx';
import { advRarity, advTitle, guildRoster } from '@/lib/adventurers';
import {
  altarLuckBonus,
  FAMILIAR_SLOT,
  TROPHY_SLOT,
  gradeLabel,
  rarityRank,
  type Item,
} from '@/lib/items';
import {
  advGearCells,
  lineageOf,
  outfitOptions,
  outfitterMsFor,
  wornGear,
  type OutfitOption,
  type OutfitVerdict,
} from '@/lib/advGear';
import { fmtSpan } from '@/lib/raid';
import {
  perLevelLabel,
  BUILD,
  BUILDING_TYPES,
  buildingType,
  buildingAccrued,
  buildingProdPerHour,
  buildingStorageCap,
  buildingUnlockLevel,
  buildingUpgradeCost,
  buildingScales,
  canBuildType,
  canBuildOnSlot,
  canUpgradeBuilding,
  slotUnlockLevel,
  storageMult,
  travelTimeMult,
  labyrinthLuckBonus,
  bossAltarRollFloor,
  type Building,
  type BuildingCategory,
  type BuildingType,
  type BuildingUnlock,
  RESOURCE_EMOJI,
} from '@/lib/buildings';
import { buildingPreview, nextMilestone } from '@/lib/buildingPreview';

const props = defineProps<{ heroLevel: number; now: number; slot: number | null }>();
const emit = defineEmits<{
  'update:slot': [number | null];
  /** `'recruit'` = ouvrir directement sur le choix de classe (une place vient de s'ouvrir). */
  'open-guild': [mode?: 'recruit'];
}>();
const char = useCharacterStore();
const auth = useAuthStore();
const gameFx = useGameFx();
const $q = useQuasar();

const gold = computed(() => char.row?.gold ?? 0);
const heroLevel = computed(() => props.heroLevel);
const buildings = computed(() => char.row?.buildings ?? []);
const plotCount = BUILD.plotCap;

interface PlotView {
  slot: number;
  unlocked: boolean;
  building: Building | null;
  ready: boolean;
}
/** ⚠️ ON CONSTRUIT LÀ OÙ ON TOUCHE, PAS DANS L'ORDRE : un emplacement VIDE n'est plus
 *  jugé sur sa POSITION (`i < plotsForLevel(niveau)`) mais sur le QUOTA — combien de
 *  bâtiments sont déjà posés, où qu'ils soient (`canBuildOnSlot`, source unique partagée
 *  avec le store et `BasePage.vue`). Un emplacement OCCUPÉ reste toujours « débloqué » :
 *  il se gère, quel que soit le quota atteint depuis. */
const plots = computed<PlotView[]>(() => {
  return Array.from({ length: plotCount }, (_, i) => {
    const b = buildings.value.find((x) => x.slot === i) ?? null;
    return {
      slot: i,
      unlocked: !!b || canBuildOnSlot(i, buildings.value, heroLevel.value),
      building: b,
      ready: b ? buildingAccrued(b, props.now, storageMult(buildings.value)) > 0 : false,
    };
  });
});
/** Niveau requis pour que le PROCHAIN bâtiment (le quota, pas une position) devienne
 *  constructible — la même valeur pour TOUS les emplacements vides verrouillés, quel que
 *  soit celui qu'on a touché. */
const nextSlotLevel = computed(() => slotUnlockLevel(buildings.value.length));

/** L'emplacement ouvert est piloté par le PARENT : c'est le dessin de l'enceinte qui
 *  sert de sélecteur (comme l'anneau de la carte le faisait avant). */
const selectedSlot = computed({
  get: () => props.slot,
  set: (v: number | null) => emit('update:slot', v),
});
const selectedPlot = computed(() =>
  selectedSlot.value === null
    ? null
    : (plots.value.find((p) => p.slot === selectedSlot.value) ?? null),
);
/** Les prochains niveaux, chiffrés. Voir l'horizon est l'intérêt : savoir qu'un convoi
 *  de plus arrive au niveau 18 aide à décider AUJOURD'HUI. */
const preview = computed(() =>
  selectedPlot.value?.building
    ? buildingPreview(selectedPlot.value.building.typeId, selectedPlot.value.building.level, 5)
    : [],
);
/** Le prochain palier quand il tombe HORS de l'aperçu — sinon on croit qu'il n'arrivera
 *  jamais. Masqué s'il est déjà listé. */
const milestone = computed(() => {
  const b = selectedPlot.value?.building;
  if (!b) return null;
  const m = nextMilestone(b.typeId, b.level);
  return m && !preview.value.some((r) => r.level === m.level) ? m : null;
});

const sheetOpen = computed({
  get: () => selectedSlot.value !== null,
  set: (v: boolean) => {
    if (!v) selectedSlot.value = null;
  },
});

// ── Libellés (tout dérivé de buildings.ts : aucune formule réécrite ici) ──
// ⚠️ La table d'emojis vivait EN DOUBLE ici et dans buildings.ts, et les deux avaient
// divergé (fragments : 🫧 contre 🧩). On lit la source unique.
const RES_EMOJI: Record<string, string> = RESOURCE_EMOJI;
function emojiOf(b: Building): string {
  return buildingType(b.typeId)?.emoji ?? '🏛️';
}
function labelOf(b: Building): string {
  return buildingType(b.typeId)?.label ?? 'Bâtiment';
}
function resEmoji(b: Building): string {
  return RES_EMOJI[buildingType(b.typeId)?.resource ?? 'dust'] ?? '✨';
}
function produces(b: Building): boolean {
  return !!buildingType(b.typeId)?.resource;
}
/** Libellé d'effet d'un utilitaire à un niveau donné. */
function utilityEffectLabel(b: Building): string {
  if (b.typeId === 'outpost')
    return `−${Math.round((1 - travelTimeMult([b])) * 100)}% temps de trajet`;
  if (b.typeId === 'labyrinth_gate')
    return `+${Math.round(labyrinthLuckBonus([b]) * 100)}% butin des coffres`;
  if (b.typeId === 'boss_altar')
    return `boss : +${Math.round(altarLuckBonus(bossAltarRollFloor([b])) * 100)} % de chance`;
  if (b.typeId === 'warehouse') return `+${Math.round((storageMult([b]) - 1) * 100)}% stockage`;
  return '';
}
/** Producteur pur → prod/h. Utilitaire → effet. Hybride → les deux. */
function effectAt(b: Building, level: number): string {
  const t = buildingType(b.typeId);
  if (!t) return '';
  const at: Building = { ...b, level };
  const prod = t.resource
    ? `${buildingProdPerHour(at).toFixed(1)} ${RES_EMOJI[t.resource] ?? '✨'}/h`
    : '';
  if (t.category === 'producer') return prod;
  const eff = utilityEffectLabel(at);
  return prod ? `${eff} · ${prod}` : eff;
}
function perLevelOf(b: Building): string {
  const t = buildingType(b.typeId);
  return t ? perLevelLabel(t) : '';
}
function effectNow(b: Building): string {
  return effectAt(b, b.level);
}
function effectNext(b: Building): string {
  if (!canUp(b)) return '';
  const next = effectAt(b, b.level + 1);
  return next && next !== effectNow(b) ? next : '';
}
function accrued(b: Building): number {
  return buildingAccrued(b, props.now, storageMult(buildings.value));
}
/** Accumulation EXACTE (non arrondie) : un filon lent afficherait « 0 » pendant des
 *  heures avec un `floor` — on voit qu'il tourne. */
function accruedExact(b: Building): number {
  const hours = Math.max(0, (props.now - b.collectedAt) / 3_600_000);
  return Math.min(
    buildingProdPerHour(b) * hours,
    buildingStorageCap(b, storageMult(buildings.value)),
  );
}
function storageOf(b: Building): number {
  return buildingStorageCap(b, storageMult(buildings.value));
}
function canUp(b: Building): boolean {
  return canUpgradeBuilding(b, heroLevel.value);
}
function upCost(b: Building): number {
  return buildingUpgradeCost(b.level);
}

const BUILD_GROUPS: { key: BuildingCategory; label: string; hint: string }[] = [
  { key: 'producer', label: '⛏️ Producteurs', hint: 'Ressource passive à récolter' },
  { key: 'utility', label: '🏛️ Utilitaires', hint: 'Effet global (débloque / accélère)' },
];
/** ⚠️ UN TYPE DÉJÀ CONSTRUIT DISPARAÎT DE LA LISTE, il ne s'affiche plus grisé : TOUS
 *  les types sont `unique` (1 seul exemplaire), donc « déjà construit » ne redevient
 *  jamais constructible — l'y laisser n'informait de rien qu'on ne sache déjà en ouvrant
 *  la fiche du bâtiment lui-même. Un groupe qui n'a plus rien à proposer disparaît aussi. */
const buildGroups = computed(() =>
  BUILD_GROUPS.map((g) => ({
    ...g,
    types: BUILDING_TYPES.filter(
      (t) => t.category === g.key && !buildings.value.some((b) => b.typeId === t.id),
    ),
  })).filter((g) => g.types.length),
);
function typeBuildable(t: BuildingType): boolean {
  return canBuildType(t.id, heroLevel.value, buildings.value);
}
/** Les types VERROUILLÉS PAR LE NIVEAU restent visibles (avec leur 🔒) : seuls les
 *  types déjà construits sont retirés, plus haut, de `buildGroups`. */
function typeLockReason(t: BuildingType): string {
  return heroLevel.value < buildingUnlockLevel(t.id) ? `🔒 niv ${buildingUnlockLevel(t.id)}` : '';
}

const unlockInfo = ref<{ emoji: string; label: string; unlock: BuildingUnlock } | null>(null);
const unlockOpen = computed({
  get: () => !!unlockInfo.value,
  set: (v: boolean) => {
    if (!v) unlockInfo.value = null;
  },
});

function doBuild(slot: number, typeId: string) {
  const uid = auth.user?.id;
  const t = buildingType(typeId);
  if (!uid || !t) return;
  void char.buildFilon(uid, typeId, slot, Date.now(), heroLevel.value).then(() => {
    if (!buildings.value.some((b) => b.slot === slot)) return;
    selectedSlot.value = null; // ferme la feuille → l'éclat joue en plein écran
    gameFx.celebrate({
      kind: 'building',
      emoji: t.emoji,
      title: 'Bâtiment construit !',
      subtitle: t.label,
      rarity: 'legendary',
    });
    if (t.unlock) unlockInfo.value = { emoji: t.emoji, label: t.label, unlock: t.unlock };
  });
}
/**
 * Améliorer un bâtiment. ⚠️ MONTER LA GUILDE N'EST PAS UN NIVEAU COMME UN AUTRE : un cran
 * sur deux OUVRE UNE PLACE, et c'est le seul moment où l'on recrute. Sans signal, le
 * joueur payait des dizaines de milliers d'or puis refermait la feuille sans savoir
 * qu'une recrue l'attendait — demandé par l'utilisateur.
 *
 * ⚠️ On compare l'effectif AVANT et APRÈS plutôt que de recalculer « est-ce un cran
 * pair ? » : la règle d'effectif vit dans `guildRoster`, et une seconde lecture
 * finirait par diverger d'elle.
 */
async function doUpgrade(slot: number) {
  const uid = auth.user?.id;
  if (!uid) return;
  const b = plots.value[slot]?.building;
  const avant = b?.typeId === 'guild' ? guildRoster(b.level) : -1;
  await char.upgradeFilon(uid, slot, heroLevel.value);
  if (avant < 0) return;
  const apres = guildRoster(char.guildLevel);
  if (apres <= avant) return;
  gameFx.celebrate({
    kind: 'unlock',
    emoji: '⚔️',
    title: 'Une place de plus à la Guilde',
    subtitle: 'Un aventurier attend son affectation',
    rarity: 'epic',
  });
  emit('open-guild', 'recruit');
}
function collectAll() {
  const uid = auth.user?.id;
  if (uid) void char.collectFilons(uid, Date.now());
}

// ── ⚒️ L'ÉQUIPEMENTIER : un objet du sac devient une pièce pour un aventurier ──
const outfitAdvId = ref('');
const outfitBusy = ref(false);
/** Objets du sac qui peuvent partir à la forge : ni 🔒, ni familier, ni porté par le
 *  héros — les mêmes exclusions que le store applique (`startOutfit`), pour que rien
 *  d'impossible ne soit proposé. */
const outfitCandidates = computed<Item[]>(() => {
  const cur = char.row;
  if (!cur) return [];
  return cur.inventory.filter(
    (it) =>
      it.slot !== FAMILIAR_SLOT &&
      it.slot !== TROPHY_SLOT &&
      !it.locked &&
      cur.equipped[it.slot]?.id !== it.id,
  );
});
/** Les aventuriers qu'on peut équiper (une lignée connue), avec leur rang de classe — le
 *  rang des pièces qui sortiront pour eux. */
/** Ce que chaque aventurier PORTE vraiment (règles du combat, `wornGear`). */
const outfitWorn = computed(() => wornGear(char.advList, char.row?.adv_gear?.stock ?? []));
const outfitForges = computed(() => char.row?.adv_gear?.forges ?? []);
const outfitAdvs = computed(() =>
  char.advList
    .filter((a) => lineageOf(a))
    .map((a) => {
      const rk = rarityRank(advRarity(a));
      return {
        id: a.id,
        name: a.name,
        emoji: advTitle(a)?.emoji ?? '🧑',
        rank: rk.name,
        color: rk.color,
        worn: outfitWorn.value.get(a.id)?.length ?? 0,
      };
    }),
);
const outfitAdv = computed(() => char.advList.find((a) => a.id === outfitAdvId.value) ?? null);
/** Ses 4 cases (mêmes que la Guilde), avec ce qui est déjà en fabrication pour chacune. */
const outfitGear = computed(() => {
  const adv = outfitAdv.value;
  if (!adv) return [];
  return advGearCells(adv, outfitWorn.value.get(adv.id) ?? []).map((c) => ({
    ...c,
    queued: outfitForges.value.filter((f) => f.advId === adv.id && f.piece.slot === c.slot).length,
  }));
});
const VERDICT_LABEL: Record<OutfitVerdict, string> = {
  empty: '',
  up: '↑ mieux que',
  same: '= même rang que',
  down: '↓ moins bien que',
};
/** Les objets à fondre pour lui, dans l'ordre conseillé (`outfitOptions`, lib). */
const outfitRows = computed(() =>
  outfitAdv.value
    ? outfitOptions(
        outfitCandidates.value,
        outfitAdv.value,
        outfitWorn.value.get(outfitAdv.value.id) ?? [],
        outfitForges.value,
      )
    : [],
);
/** La FILE en cours, avec le temps restant de chaque pièce (piloté par `props.now`). */
const outfitQueue = computed(() =>
  (char.row?.adv_gear?.forges ?? []).map((f) => {
    const rk = rarityRank(f.piece.rarity);
    return {
      emoji: f.piece.emoji,
      name: f.piece.name,
      rank: rk.name,
      color: rk.color,
      advName: char.advList.find((a) => a.id === f.advId)?.name ?? '?',
      leftMs: Math.max(0, f.until - props.now),
    };
  }),
);
/** ⚠️ CONFIRMATION, comme la vente et le recyclage du sac : l'objet du héros est DÉTRUIT
 *  à la fabrication, sans retour possible. Le rang de la pièce est connu d'avance
 *  (`outfitRank`) : on le dit. L'aventurier reste sélectionné pour enchaîner. */
function doOutfit(r: OutfitOption) {
  const adv = outfitAdv.value;
  if (outfitBusy.value || !adv) return;
  const piece = `${r.emoji} ${r.name} ${rarityRank(r.rank).name}`;
  const replaces = r.current
    ? ` Il porte déjà ${r.current.emoji} ${r.current.name} ${rarityRank(r.current.rarity).name} sur cet emplacement${r.verdict === 'down' ? ' — la nouvelle pièce sera d’un rang inférieur' : ''}.`
    : '';
  $q.dialog({
    title: 'Fondre cet objet ?',
    message: `${r.item.emoji} « ${r.item.name} » (${gradeLabel(r.item)}) sera détruit pour fabriquer ${piece} pour ${adv.name}.${replaces}`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: '⚒️ Fabriquer', color: 'negative' },
  }).onOk(() => void runOutfit(r.item.id, adv.id));
}
async function runOutfit(itemId: string, advId: string) {
  const uid = auth.user?.id;
  if (!uid || outfitBusy.value) return;
  outfitBusy.value = true;
  try {
    await char.startOutfit(uid, itemId, advId, Date.now(), heroLevel.value);
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  } finally {
    outfitBusy.value = false;
  }
}
</script>

<style scoped>
.vp-tile.locked {
  opacity: 0.45;
  cursor: default;
}
.vp-tile.ready {
  border-color: var(--accent, #ffd23f);
}

/* Feuille */
/* Aperçu des prochains niveaux : une ligne par palier, le niveau ACTUEL en repère. */
.pm-prev {
  margin: 10px 0 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}
.pm-prev-t {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
  margin-bottom: 6px;
}
.pm-prev-r {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 12.5px;
  color: var(--dim);
}
.pm-prev-r.now {
  color: var(--text);
  font-weight: 700;
}
/* Un PALIER (un convoi de plus, un aventurier de plus) se distingue d’une simple
   continuation : c’est lui qu’on vise. */
.pm-prev-r.step .pp-tx {
  color: var(--accent);
}
.pm-prev-r.far {
  margin-top: 4px;
  border-top: 1px dashed var(--line);
  padding-top: 6px;
}
.pp-lv {
  flex: 0 0 46px;
  font-variant-numeric: tabular-nums;
}
.pp-tx {
  flex: 1;
  min-width: 0;
}
.pp-tag {
  font-size: 10px;
  color: var(--accent);
}
.pm-btn.open {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--accent);
}
.vp-sheet {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 14px;
  color: var(--text);
}
.sh-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.sh-emo {
  font-size: 26px;
}
.sh-main {
  flex: 1;
  min-width: 0;
}
.sh-title {
  font-size: 16px;
}
.sh-sub {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
}
.sh-x {
  border: 0;
  background: none;
  color: var(--dim);
  font-size: 18px;
  width: 36px;
  height: 36px;
  cursor: pointer;
}
.pb,
.pm {
  margin-top: 10px;
}
.pb-group {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 10px 0 4px;
}
.pb-group-t {
  font-size: 13px;
  font-weight: 600;
}
.pb-group-h {
  font-size: 11px;
  color: var(--dim);
}
.pb-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.pb-opt:disabled {
  opacity: 0.45;
  cursor: default;
}
.pb-emo {
  font-size: 20px;
}
.pb-main {
  flex: 1;
  min-width: 0;
}
.pb-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.pb-perlv {
  font-size: 11.5px;
  color: var(--accent);
}
.pm-perlv {
  font-size: 12px;
  color: var(--dim);
}
.pb-desc {
  display: block;
  font-size: 11px;
  color: var(--dim);
  line-height: 1.35;
}
.pb-cost {
  font-size: 12px;
  white-space: nowrap;
}
.pm-level {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}
.pm-next {
  color: var(--dim);
  font-size: 12px;
}
.pm-ready {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
}
.pm-cap {
  color: var(--dim);
}
.of {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.of-t {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}
.of-sub {
  display: block;
  font-weight: 400;
  color: var(--dim);
  font-size: 11.5px;
}
.of-note {
  margin: 0;
  font-size: 12.5px;
  color: var(--dim);
}
.of-queue {
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.of-q {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12.5px;
}
.of-q-main {
  flex: 1;
  min-width: 0;
}
.of-q-left {
  color: var(--dim);
  white-space: nowrap;
}
.of-advs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.of-adv {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.of-adv.on {
  border-color: var(--accent, #ffd23f);
  background: color-mix(in srgb, var(--accent, #ffd23f) 14%, transparent);
}
.of-adv-r {
  font-size: 11px;
  font-weight: 700;
}
.of-item {
  min-height: 48px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  cursor: pointer;
}
.of-item:disabled {
  opacity: 0.5;
}
.of-to {
  font-size: 12.5px;
  color: var(--dim);
}
.of-warn {
  color: var(--d3, #ffb23f);
  font-size: 11px;
}
.of-adv-g {
  font-size: 10.5px;
  color: var(--dim);
}
.of-gear {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.of-cell {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 44px;
  padding: 4px 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--gc, var(--line)) 55%, var(--line));
  background: color-mix(in srgb, var(--gc, transparent) 8%, #1d1913);
}
.of-cell.empty {
  border-style: dashed;
  opacity: 0.7;
}
.of-cell-e {
  font-size: 18px;
}
.of-cell-m {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}
.of-cell-n {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.of-cell-s {
  font-size: 11px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.of-cell-q {
  font-size: 10.5px;
  color: var(--accent, #ffd23f);
}
.of-vs {
  font-size: 11.5px;
  color: var(--dim);
}
.of-vs.v-empty,
.of-vs.v-up {
  color: var(--d1, #7bc86c);
}
.of-vs.v-down {
  color: var(--d3, #ffb23f);
}
.of-q-note {
  color: var(--accent, #ffd23f);
}
.pm-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.pm-btn {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1d1913;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.pm-btn.up {
  border-color: var(--accent, #ffd23f);
  color: var(--accent, #ffd23f);
}
.pm-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.unlock-card {
  background: var(--surface);
  color: var(--text);
  padding: 20px;
  text-align: center;
  border-radius: 16px;
}
.unlock-emo {
  font-size: 44px;
}
.unlock-title {
  font-size: 18px;
  margin-top: 6px;
}
.unlock-act {
  margin-top: 10px;
  font-size: 14px;
}
.unlock-where {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dim);
}
.unlock-ok {
  margin-top: 16px;
  min-height: 44px;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--accent, #ffd23f);
  background: none;
  color: var(--accent, #ffd23f);
  cursor: pointer;
}
</style>
