<template>
  <!-- 🪬 LES RUNES MULTICOLORES (bascule du 2026-09-30, spec `2026-09-30-runes-multicolores`).
       On OUVRE une rune → une compétence va au STOCK → on la FUSIONNE ou on la DONNE à un
       champion. ⚠️ Tous les refus viennent de `runeBank` (source unique écran + store) : cette
       feuille grise AVEC la raison, le store refuse. -->
  <q-dialog :model-value="open" position="bottom" @update:model-value="emit('close')">
    <q-card class="rb-card">
      <div class="rb-head">
        <span class="rb-title font-display">🪬 Runes</span>
        <span class="rb-wallet font-display"><RuneIcon size="18px" /> {{ bank.runes }}</span>
        <span
          v-if="bank.exalted"
          class="rb-blessed"
          :title="`${bank.exalted} rune${bank.exalted > 1 ? 's' : ''} du laboratoire : jamais verte${bank.exalted > 1 ? 's' : ''} ni bleue${bank.exalted > 1 ? 's' : ''}, ouverte${bank.exalted > 1 ? 's' : ''} en premier`"
          >dont {{ bank.exalted }} 🟣 violette{{ bank.exalted > 1 ? 's' : '' }} ou mieux</span
        >
        <span
          v-if="bank.blessed"
          class="rb-blessed"
          :title="`${bank.blessed} rune${bank.blessed > 1 ? 's' : ''} de l’autel : jamais verte${bank.blessed > 1 ? 's' : ''}, ouverte${bank.blessed > 1 ? 's' : ''} avant les ordinaires`"
          >dont {{ bank.blessed }} 🔷 bleue{{ bank.blessed > 1 ? 's' : '' }} ou mieux</span
        >
      </div>

      <!-- ── La compétence choisie : la donner, ou la fusionner ── -->
      <template v-if="sel">
        <button type="button" class="rb-back" @click="back">‹ Stock</button>
        <div class="rb-sel" :class="'t-' + SKILLS[sel.id].tier">
          <span class="rb-sel-emo">{{ SKILLS[sel.id].emoji }}</span>
          <span class="rb-sel-main">
            <span class="rb-sel-name font-display"
              >{{ SKILLS[sel.id].name }} <b>Nv {{ sel.level }}</b></span
            >
            <span class="rb-sel-what">{{ whatOf(sel.id, sel.level) }}</span>
            <span class="rb-sel-tier">{{ RUNE_INFO[SKILLS[sel.id].tier].label }}</span>
          </span>
        </div>

        <!-- Le champion à qui on la donne, s'il est plein : quelle compétence remplacer ? -->
        <template v-if="replaceFor">
          <div class="rb-sec">Remplacer chez {{ replaceFor.name }}</div>
          <p class="rb-note">
            Toutes ses places sont prises. La compétence remplacée est perdue, avec ses niveaux.
          </p>
          <div class="rb-list">
            <button
              v-for="(s, i) in replaceFor.skills ?? []"
              :key="s.id"
              type="button"
              class="rb-row"
              :class="'t-' + SKILLS[s.id].tier"
              :disabled="busy"
              @click="confirmReplace(replaceFor, i)"
            >
              <span class="rb-row-emo">{{ SKILLS[s.id].emoji }}</span>
              <span class="rb-row-main">
                <span class="rb-row-name">{{ SKILLS[s.id].name }} · Nv {{ s.level }}</span>
                <span class="rb-row-sub">{{ whatOf(s.id, s.level) }}</span>
              </span>
              <span class="rb-pill bad">🔁 Remplacer</span>
            </button>
          </div>
          <button type="button" class="rb-back" @click="replaceFor = null">‹ Autre champion</button>
        </template>

        <template v-else>
          <template v-if="fuseRows.length">
            <div class="rb-sec">Fusionner avec</div>
            <p class="rb-note">
              Choisis combien d’exemplaires ajouter à celui-ci : tout, ou seulement une partie.
            </p>
            <div class="rb-list">
              <div
                v-for="f in fuseRows"
                :key="f.level"
                class="rb-row rb-pick"
                :class="['t-' + SKILLS[sel.id].tier, { on: f.take > 0 }]"
              >
                <span class="rb-row-emo">{{ SKILLS[sel.id].emoji }}</span>
                <span class="rb-row-main">
                  <span class="rb-row-name">{{ SKILLS[sel.id].name }} · Nv {{ f.level }}</span>
                  <span class="rb-row-sub">{{ f.count }} au stock</span>
                </span>
                <span class="rb-step">
                  <button
                    type="button"
                    :aria-label="`Un Nv ${f.level} de moins`"
                    :disabled="busy || f.take === 0"
                    @click="setTake(f.level, f.take - 1)"
                  >
                    −
                  </button>
                  <b class="font-display">{{ f.take }}</b>
                  <button
                    type="button"
                    :aria-label="`Un Nv ${f.level} de plus`"
                    :disabled="busy || f.take >= f.count || pickTotal + f.level > SKILL_MAX_LEVEL"
                    @click="setTake(f.level, f.take + 1)"
                  >
                    +
                  </button>
                </span>
              </div>
            </div>
            <div class="rb-chips rb-pick-bar">
              <button
                type="button"
                class="rb-chip btn"
                :disabled="busy || bestTotal <= sel.level"
                @click="pickBest"
              >
                🎯 Jusqu’au Nv {{ bestTotal }}
              </button>
              <button
                v-if="selGroup && selGroup.after.length > 1"
                type="button"
                class="rb-chip btn"
                :disabled="busy"
                @click="askFuseAll(sel.id)"
              >
                🔗 Tous → {{ selGroup.after.map((l) => 'Nv ' + l).join(' · ') }}
              </button>
              <button
                v-if="pickedUids.length > 1"
                type="button"
                class="rb-chip btn"
                :disabled="busy"
                @click="take = {}"
              >
                ✖ Effacer
              </button>
            </div>
            <button
              type="button"
              class="rb-go font-display"
              :class="'t-' + SKILLS[sel.id].tier"
              :disabled="busy || !!pickBlock"
              @click="fusePicked"
            >
              <template v-if="pickBlock">{{ FUSE_BLOCK_LABEL[pickBlock] }}</template>
              <template v-else>🔗 Fusionner {{ pickedUids.length }} → Nv {{ pickTotal }}</template>
            </button>
          </template>
          <div class="rb-sec">Donner à un champion</div>
          <p v-if="!giveRows.length" class="rb-note">Aucun champion pour l’instant.</p>
          <div class="rb-list">
            <button
              v-for="r in giveRows"
              :key="r.adv.id"
              type="button"
              class="rb-row"
              :disabled="busy || !!r.block"
              @click="give(r)"
            >
              <span class="rb-row-emo">{{ r.emoji }}</span>
              <span class="rb-row-main">
                <span class="rb-row-name">{{ r.adv.name }}</span>
                <span class="rb-row-sub">{{ r.sub }}</span>
                <!-- Ses compétences actuelles, puis ses places libres. -->
                <span class="rb-has">
                  <template v-for="(k, i) in r.cells" :key="i">
                    <span
                      v-if="k"
                      class="rb-has-chip"
                      :class="['t-' + SKILLS[k.id].tier, { same: k.id === sel?.id }]"
                      :title="whatOf(k.id, k.level)"
                      >{{ SKILLS[k.id].emoji }} {{ SKILLS[k.id].name }} <b>{{ k.level }}</b></span
                    >
                    <span v-else class="rb-has-chip free">libre</span>
                  </template>
                </span>
              </span>
              <span class="rb-pill" :class="r.tone">{{ r.pill }}</span>
            </button>
          </div>

          <p class="rb-note">
            Une compétence donnée ne revient jamais au stock. Les exemplaires d’une même compétence
            se fusionnent : leurs niveaux s’additionnent ({{ SKILL_MAX_LEVEL }} au plus), de quoi
            préparer une compétence haut niveau pour ton prochain champion.
          </p>
        </template>
      </template>

      <!-- ── Le stock ── -->
      <template v-else>
        <div class="rb-tiles">
          <button type="button" class="rb-tile" :disabled="busy || !!blockOne" @click="doOpen(1)">
            <RuneIcon size="40px" />
            <span class="rb-t-x font-display">Ouvrir</span>
            <span class="rb-t-sub">{{ blockOne ? OPEN_BLOCK_LABEL[blockOne] : '1 rune' }}</span>
          </button>
          <button
            v-if="bank.runes >= RUNE_LOT.cost"
            type="button"
            class="rb-tile ten"
            :disabled="busy || !!blockLot"
            @click="doOpen(RUNE_LOT.size)"
          >
            <RuneIcon size="40px" />
            <span class="rb-t-x font-display">×{{ RUNE_LOT.size }}</span>
            <span class="rb-t-sub">{{ RUNE_LOT.cost }} runes</span>
          </button>
          <button
            v-if="bank.skills.length >= 2"
            type="button"
            class="rb-tile fuse"
            :disabled="busy || !fusePreview.length"
            @click="askFuseAll(null)"
          >
            <span class="rb-t-ico">🔗</span>
            <span class="rb-t-x font-display">Tout fusionner</span>
            <span class="rb-t-sub">{{
              fusePreview.length
                ? `${fusePreview.length} compétence${fusePreview.length > 1 ? 's' : ''}`
                : FUSE_ALL_NONE
            }}</span>
          </button>
        </div>
        <p class="rb-note">
          Une rune révèle une compétence : 🟢&nbsp;70&nbsp;% · 🔵&nbsp;22&nbsp;% · 🟣&nbsp;7&nbsp;%
          · 🟠&nbsp;1&nbsp;%. Elles tombent des lieux de la carte, des ascensions, de l’Éveil et du
          Scriptorium.
        </p>

        <template v-if="lastOpened.length">
          <div class="rb-sec">Ouvertes à l’instant</div>
          <div class="rb-chips">
            <span
              v-for="s in lastOpened"
              :key="s.uid"
              class="rb-chip"
              :class="'t-' + SKILLS[s.id].tier"
              >{{ SKILLS[s.id].emoji }} {{ SKILLS[s.id].name }}</span
            >
          </div>
        </template>

        <div class="rb-sec">Compétences au stock · {{ bank.skills.length }}</div>
        <p v-if="!bank.skills.length" class="rb-note">
          Rien au stock. Ouvre une rune pour révéler une compétence.
        </p>
        <div class="rb-chips">
          <button
            v-for="s in sortedSkills"
            :key="s.uid"
            type="button"
            class="rb-chip btn"
            :class="'t-' + SKILLS[s.id].tier"
            @click="select(s.uid)"
          >
            {{ SKILLS[s.id].emoji }} {{ SKILLS[s.id].name }} <b>Nv {{ s.level }}</b>
            <span v-if="s.count > 1" class="rb-count">×{{ s.count }}</span>
          </button>
        </div>
      </template>
    </q-card>
  </q-dialog>
  <RuneReveal
    :opened="revealing"
    :stock="bank.skills"
    :can-again="!busy && !openBlocker(bank, lastCount)"
    :busy="busy"
    @close="revealing = null"
    @again="doOpen(lastCount)"
  />
  <RuneFuseFx :groups="fusing" @close="fusing = null" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { useGameFx } from '@/composables/useGameFx';
import RuneIcon from '@/components/RuneIcon.vue';
import RuneReveal from '@/components/RuneReveal.vue';
import RuneFuseFx from '@/components/RuneFuseFx.vue';
import {
  RUNE_INFO,
  RUNE_TIERS,
  SKILLS,
  SKILL_MAX_LEVEL,
  skillEffectText,
  type ChampSkill,
  type SkillId,
} from '@/lib/skillRunes';
import {
  FUSE_ALL_NONE,
  FUSE_BLOCK_LABEL,
  GIVE_BLOCK_LABEL,
  OPEN_BLOCK_LABEL,
  RUNE_LOT,
  emptyBank,
  fuseAllSkills,
  fuseBlocker,
  fuseGroupText,
  bestFusePick,
  fusePick,
  giveBlocker,
  giveKind,
  openBlocker,
  stackSkills,
  type FuseGroup,
  type FuseTake,
  type GiveBlock,
  type GiveKind,
  type StockSkill,
} from '@/lib/runeBank';
import { advChampionSlots, advSkillCells, advTitle, type Adventurer } from '@/lib/adventurers';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();
const gameFx = useGameFx();

const bank = computed(() => char.row?.runes ?? emptyBank());
const busy = ref(false);
const selUid = ref<string | null>(null);
const replaceFor = ref<Adventurer | null>(null);
const lastOpened = ref<StockSkill[]>([]);
/** Ce que l'écran d'ouverture met en scène (null = fermé), et la taille du dernier tirage. */
const revealing = ref<StockSkill[] | null>(null);
const lastCount = ref(1);
/** Ce que l'écran de fusion met en scène (null = fermé). */
const fusing = ref<FuseGroup[] | null>(null);
/** Combien d'exemplaires de chaque niveau on ajoute à celui qui est choisi. */
const take = ref<FuseTake>({});

const sel = computed(() => bank.value.skills.find((s) => s.uid === selUid.value) ?? null);
// Une compétence donnée ou fusionnée quitte le stock : on revient à la liste.
watch(sel, (s) => {
  if (!s) {
    selUid.value = null;
    replaceFor.value = null;
  }
});
// Une autre compétence choisie : on repart d'une sélection vide.
watch(selUid, () => {
  take.value = {};
});

const blockOne = computed(() => openBlocker(bank.value, 1));
const blockLot = computed(() => openBlocker(bank.value, RUNE_LOT.size));

/** Rangées par couleur (la plus rare en tête), puis par nom, puis par niveau. */
const sortedSkills = computed(() =>
  stackSkills(bank.value.skills).sort(
    (a, b) =>
      RUNE_TIERS.indexOf(SKILLS[b.id].tier) - RUNE_TIERS.indexOf(SKILLS[a.id].tier) ||
      SKILLS[a.id].name.localeCompare(SKILLS[b.id].name, 'fr') ||
      b.level - a.level,
  ),
);

function whatOf(id: SkillId, level: number): string {
  return skillEffectText(id, level);
}

interface GiveRow {
  adv: Adventurer;
  emoji: string;
  kind: GiveKind;
  block: GiveBlock | null;
  pill: string;
  tone: string;
  sub: string;
  /** Ses compétences posées, puis `null` par place libre. */
  cells: (ChampSkill | null)[];
  order: number;
}
const GIVE_ORDER: Record<GiveKind, number> = { stack: 0, new: 1, replace: 2 };

/** Chaque champion, avec ce qui se passera : amélioration, place libre, remplacement, ou grisé
 *  avec la raison. Tri : améliorations, places libres, remplacements, grisés. */
const giveRows = computed<GiveRow[]>(() => {
  const s = sel.value;
  if (!s) return [];
  return char.advList
    .filter((a) => advChampionSlots(a).slots > 0)
    .map((a): GiveRow => {
      const c = advChampionSlots(a);
      const kind = giveKind(c, s.id);
      const raw = giveBlocker(bank.value, s.uid, c, kind === 'replace' ? 0 : null);
      const block = raw === 'full' ? null : raw;
      const cur = c.skills.find((k) => k.id === s.id);
      const pill = block
        ? '—'
        : kind === 'stack'
          ? `⬆️ Nv ${cur!.level} → ${cur!.level + s.level}`
          : kind === 'new'
            ? '🟢 Nouvelle'
            : '🔁 Remplacer';
      return {
        adv: a,
        emoji: advTitle(a)?.emoji ?? '🧑',
        kind,
        block,
        pill,
        tone: block ? 'off' : kind === 'replace' ? 'bad' : 'up',
        sub: block
          ? GIVE_BLOCK_LABEL[block]
          : `${c.skills.length}/${c.slots} compétence${c.slots > 1 ? 's' : ''}`,
        cells: advSkillCells(a),
        order: block ? 3 : GIVE_ORDER[kind],
      };
    })
    .sort((x, y) => x.order - y.order || x.adv.name.localeCompare(y.adv.name, 'fr'));
});

/** La fusion choisie (lignes par niveau, exemplaires retenus, niveau obtenu) : `fusePick`. */
const pick = computed(() => fusePick(bank.value, selUid.value ?? '', take.value));
const fuseRows = computed(() => pick.value.rows);
const pickedUids = computed(() => pick.value.uids);
const pickTotal = computed(() => pick.value.total);
const pickBlock = computed(() => fuseBlocker(bank.value, pickedUids.value));

function setTake(level: number, n: number) {
  take.value = { ...take.value, [level]: Math.max(0, n) };
}

/** 🎯 Le plus haut niveau atteignable à partir de la compétence choisie. */
const best = computed(() => bestFusePick(bank.value, selUid.value ?? ''));
const bestTotal = computed(() => best.value.total);
function pickBest() {
  take.value = { ...best.value.take };
}

/** Ce que « Tout fusionner » ferait, compétence par compétence (vide = rien à fusionner). */
const fusePreview = computed(() => fuseAllSkills(bank.value).groups);
/** Ce que la fusion de tous les exemplaires de la compétence choisie ferait. */
const selGroup = computed(() => fusePreview.value.find((g) => g.id === sel.value?.id) ?? null);

/** ⚠️ Une fusion ne se défait pas : on dit ce qui sera fusionné avant de le faire. */
function askFuseAll(only: SkillId | null) {
  const groups = fusePreview.value.filter((g) => !only || g.id === only);
  if (!groups.length) return;
  $q.dialog({
    title: only ? 'Fusionner tous les exemplaires ?' : 'Tout fusionner ?',
    message: groups
      .map((g) => `${SKILLS[g.id].emoji} ${SKILLS[g.id].name} : ${fuseGroupText(g)}`)
      .join('\n'),
    style: 'white-space: pre-line',
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Fusionner', color: 'positive' },
  }).onOk(() => {
    void run(async (uid) => {
      const r = await char.fuseAllRuneSkills(uid, only);
      if (!r.ok) throw new Error(r.reason);
      back();
      fusing.value = r.groups;
    });
  });
}

function select(uid: string) {
  selUid.value = uid;
  replaceFor.value = null;
}
function back() {
  selUid.value = null;
  replaceFor.value = null;
}

async function run(fn: (uid: string) => Promise<void>) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    await fn(uid);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
  } finally {
    busy.value = false;
  }
}

/** Ouvre : le store a DÉJÀ tiré et crédité, l'écran d'ouverture (`RuneReveal`) ne fait que
 *  montrer — le mur, l'alcôve, les glyphes, l'éclat. Les ouvertes restent listées ci-dessous. */
function doOpen(count: number) {
  void run(async (uid) => {
    const r = await char.openRuneBatch(uid, count);
    if (!r.ok) throw new Error(r.reason);
    lastOpened.value = r.opened;
    lastCount.value = count;
    revealing.value = r.opened;
  });
}

/** Fusionne les exemplaires choisis : le store fusionne, l'écran de fusion le montre. */
function fusePicked() {
  const uids = pickedUids.value;
  if (fuseBlocker(bank.value, uids)) return;
  void run(async (uid) => {
    const r = await char.fuseRuneSkills(uid, uids);
    if (!r.ok) throw new Error(r.reason);
    back();
    fusing.value = [r.group];
  });
}

function doGive(adv: Adventurer, replaceIndex: number | null) {
  const s = sel.value;
  if (!s) return;
  const id = s.id;
  void run(async (uid) => {
    const r = await char.giveRuneSkill(uid, s.uid, adv.id, replaceIndex);
    if (!r.ok) throw new Error(r.reason);
    gameFx.celebrateRune(r.kind, id, adv.name, r.level);
    back();
  });
}

function give(r: GiveRow) {
  if (r.block) return;
  if (r.kind === 'replace') {
    replaceFor.value = r.adv;
    return;
  }
  doGive(r.adv, null);
}

/** ⚠️ Le remplacement DIT ce qui est perdu avant de le faire. */
function confirmReplace(adv: Adventurer, index: number) {
  const old = adv.skills?.[index];
  if (!old) return;
  $q.dialog({
    title: `Remplacer ${SKILLS[old.id].name} niveau ${old.level} ?`,
    message: `${adv.name} perd ${SKILLS[old.id].name} et ses niveaux. Elle ne revient pas au stock.`,
    cancel: true,
    ok: { label: 'Remplacer', color: 'negative' },
  }).onOk(() => doGive(adv, index));
}
</script>

<style scoped>
.rb-card {
  background: var(--surface);
  color: var(--text);
  padding: 16px 14px;
  border-radius: 16px 16px 0 0;
  width: 480px;
  max-width: 100vw;
  max-height: 88vh;
  overflow-y: auto;
}
.rb-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.rb-title {
  font-size: 22px;
}
.rb-blessed {
  font-size: 12px;
  color: #8ec5ff;
}
.rb-wallet {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 18px;
  color: #d9b8ff;
}
.rb-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.rb-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 118px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, #b57bff 55%, var(--line));
  background: radial-gradient(
    circle at 50% 30%,
    color-mix(in srgb, #b57bff 18%, var(--surface)),
    var(--bg)
  );
  color: var(--text);
  cursor: pointer;
}
.rb-tile.ten {
  border-color: color-mix(in srgb, #ffd24a 55%, var(--line));
}
.rb-pick {
  cursor: default;
  border-color: var(--line);
}
.rb-pick.on {
  border-color: var(--tier, #7bc86c);
  background: color-mix(in srgb, var(--tier, #7bc86c) 10%, transparent);
}
.rb-step {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.rb-step button {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  font-size: 22px;
  cursor: pointer;
}
.rb-step button:disabled {
  opacity: 0.35;
  cursor: default;
}
.rb-step b {
  min-width: 22px;
  text-align: center;
  font-size: 20px;
}
.rb-pick-bar {
  margin-top: 8px;
}
.rb-go {
  width: 100%;
  min-height: 52px;
  margin-top: 10px;
  border: 1px solid color-mix(in srgb, var(--tier, #7bc86c) 70%, var(--line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--tier, #7bc86c) 22%, var(--surface));
  color: var(--text);
  font-size: 19px;
  cursor: pointer;
}
.rb-go:disabled {
  opacity: 0.55;
  cursor: default;
  font-size: 15px;
}
.rb-count {
  margin-left: 2px;
  font-weight: 700;
  color: var(--text);
}
.rb-tile.fuse {
  border-color: color-mix(in srgb, #7bc86c 55%, var(--line));
}
.rb-t-ico {
  font-size: 32px;
  line-height: 40px;
}
.rb-tile:disabled {
  opacity: 0.5;
  cursor: default;
}
.rb-t-x {
  font-size: 22px;
}
.rb-t-sub {
  font-size: 12px;
  color: var(--dim);
}
.rb-sec {
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--dim);
}
.rb-note {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--dim);
}
.rb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--tier, var(--line));
  background: color-mix(in srgb, var(--tier, var(--line)) 12%, transparent);
  color: var(--text);
  font-size: 13px;
}
.rb-chip.btn {
  min-height: 44px;
  cursor: pointer;
}
.rb-chip b {
  color: var(--tier);
  font-size: 12px;
}
.rb-back {
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 14px;
  cursor: pointer;
}
.rb-sel {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  border: 1.5px solid var(--tier);
  background: color-mix(in srgb, var(--tier) 12%, var(--surface));
}
.rb-sel-emo {
  font-size: 36px;
}
.rb-sel-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rb-sel-name {
  font-size: 18px;
}
.rb-sel-name b {
  color: var(--tier);
  font-size: 14px;
}
.rb-sel-what {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.rb-sel-tier {
  font-size: 12px;
  color: var(--dim);
}
.rb-list {
  display: grid;
  gap: 6px;
}
.rb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 6px 10px;
  border-radius: 12px;
  border: 1px solid var(--tier, var(--line));
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.rb-row:disabled {
  opacity: 0.5;
  cursor: default;
}
.rb-row-emo {
  font-size: 22px;
}
.rb-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.rb-row-name {
  font-weight: 600;
  font-size: 14px;
}
.rb-row-sub {
  font-size: 12px;
  color: var(--dim);
  overflow-wrap: anywhere;
}
.rb-has {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.rb-has-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tier, var(--line)) 70%, transparent);
  background: color-mix(in srgb, var(--tier, var(--line)) 12%, transparent);
  font-size: 11.5px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rb-has-chip b {
  color: var(--tier);
}
.rb-has-chip.same {
  border-width: 2px;
  font-weight: 700;
}
.rb-has-chip.free {
  border-style: dashed;
  border-color: var(--line);
  background: none;
  color: var(--dim);
}
.rb-pill {
  flex: none;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.rb-pill.up {
  color: var(--d1, #7bc86c);
  background: color-mix(in srgb, var(--d1, #7bc86c) 16%, transparent);
}
.rb-pill.bad {
  color: var(--d3, #ffb23f);
  background: color-mix(in srgb, var(--d3, #ffb23f) 16%, transparent);
}
.rb-pill.off {
  color: var(--dim);
}
.t-green {
  --tier: #7bc86c;
}
.t-blue {
  --tier: #5aa9ff;
}
.t-violet {
  --tier: #b98cff;
}
.t-gold {
  --tier: #ffb23f;
}
</style>
