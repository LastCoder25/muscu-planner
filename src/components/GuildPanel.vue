<template>
  <q-dialog :model-value="open" position="bottom" @update:model-value="emit('close')">
    <q-card class="guild-card">
      <div class="g-head">
        <span class="g-title font-display">⚔️ Guilde d’aventuriers</span>
        <span class="g-count">{{ roster.length }}/{{ maxRoster }}</span>
      </div>

      <p v-if="!guildLevel" class="g-empty">
        Construis la <b>Guilde</b> dans ta cour pour recruter des aventuriers.
      </p>

      <template v-else>
        <!-- ── Le vivier ── -->
        <div v-if="!roster.length" class="g-empty">
          Personne encore. Recrute ton premier aventurier — il escortera tes caravanes.
        </div>
        <!-- ⚠️ La carte OUVRE LA FICHE (demandé par l'utilisateur) : le vivier ne montrait
             que rang, classe et état — le parcours, les stats, les rôles de convoi et les
             signatures de combat n'étaient visibles NULLE PART une fois la promotion
             passée. On choisissait une voie sans jamais pouvoir relire ce qu'elle a donné.
             `role`/`tabindex`/clavier : c'est un bouton, il doit se comporter comme tel. -->
        <div
          v-for="a in roster"
          :key="a.id"
          class="adv hit"
          :class="{ busy: !isFree(a) }"
          role="button"
          tabindex="0"
          :aria-label="`Fiche de ${a.name}`"
          @click="detailAdv = a"
          @keydown.enter.prevent="detailAdv = a"
          @keydown.space.prevent="detailAdv = a"
        >
          <span class="adv-emo">{{ titleOf(a)?.emoji ?? '🧑' }}</span>
          <div class="adv-main">
            <div class="adv-top">
              <span class="adv-name">{{ a.name }}</span>
              <!-- ⚠️ On montre le RANG, jamais le niveau : c’est la promesse « aventurier
                   de manga ». Le niveau ne sert qu’à calculer, il ne s’affiche pas. -->
              <span class="adv-rank" :style="{ color: rankOf(a).color }">
                {{ rankOf(a).emoji }} {{ rankOf(a).name }} {{ stars(rankOf(a).star) }}
              </span>
            </div>
            <div class="adv-sub">
              {{ titleOf(a)?.label ?? '—' }}
              <span class="adv-rar">{{ RARITY_LABEL[rarityOf(a)] }}</span>
              <span v-if="signaturesOf(a).length" class="adv-sig">✦</span>
            </div>
            <!-- La BARRE : sans elle, le niveau étant caché, on peut travailler deux
                 niveaux entiers sans le moindre retour visible. -->
            <div class="adv-bar" :title="`Étoile suivante au niveau ${nextStarOf(a)}`">
              <span class="adv-fill" :style="{ width: Math.round(progressOf(a) * 100) + '%' }" />
            </div>
            <div class="adv-state">
              <!-- ⚠️ La formation passe AVANT la convalescence : les deux peuvent courir
                   ensemble, et c'est celle qu'on vient de lancer qu'on cherche des yeux. -->
              <template v-if="trainOf(a)">
                🎓 en formation ({{ trainNameOf(a) }}) · {{ leftOf(trainOf(a)) }}
              </template>
              <template v-else-if="hurtOf(a)">🛏️ à l’infirmerie · {{ leftOf(hurtOf(a)) }}</template>
              <template v-else-if="busyOf(a)">🐫 en route · {{ leftOf(busyOf(a)) }}</template>
              <template v-else>✅ disponible</template>
            </div>
          </div>
          <button
            v-if="canPromoteOne(a) && !trainOf(a) && !busyOf(a)"
            class="adv-promo"
            :disabled="busy"
            @click.stop="openPromo(a)"
          >
            ⭐ Promouvoir
          </button>
        </div>

        <!-- ── Recruter ── -->
        <div class="g-recruit">
          <div v-if="roster.length >= maxRoster" class="g-note">
            Guilde pleine. <b>Monte-la d’un niveau</b> pour loger quelqu’un de plus.
          </div>
          <template v-else>
            <div class="g-note">
              Recruter : <b>{{ cost }} 🪙</b> — le prix monte avec l’effectif.
            </div>
            <div class="g-choices">
              <button
                v-for="c in offers"
                :key="c.id"
                class="g-choice"
                :disabled="busy || gold < cost"
                @click="doRecruit(c.id)"
              >
                <span class="gc-emo">{{ c.emoji }}</span>
                <span class="gc-lbl">{{ c.label }}</span>
                <span class="gc-w">{{ shape(c) }}</span>
              </button>
            </div>
          </template>
        </div>
      </template>

      <div class="g-actions">
        <q-btn flat no-caps label="Fermer" @click="emit('close')" />
      </div>
    </q-card>
  </q-dialog>

  <!-- ── Promotion : 1 parmi 3, tirées mais TOUJOURS dans la lignée ── -->
  <q-dialog v-model="promoOpen">
    <q-card class="guild-card">
      <div class="g-title font-display">⭐ Promotion — {{ promoAdv?.name }}</div>
      <p class="g-note">
        Choisis sa voie. Le choix est <b>définitif</b>, et il décide de ce qui lui sera proposé
        ensuite. Toutes ces classes valent le <b>même rang</b> : ce qui les sépare, c'est leur
        <b>orientation</b>, leur <b>rôle sur les convois</b> et leur <b>signature de combat</b>.
      </p>
      <div v-if="!trainingLevel" class="g-empty">
        Il te faut un <b>Centre de formation</b> pour qu’il apprenne une nouvelle classe.
      </div>
      <!-- ⚠️ La durée s'annonce AVANT le choix : elle double à chaque rang et
           l'aventurier est immobilisé pendant tout ce temps. La découvrir après coup,
           c'est découvrir le prix après avoir payé. -->
      <div v-else-if="promoAdv" class="g-cost">
        🎓 Formation : <b>{{ fmtMs(promoMs) }}</b> — il sera indisponible pendant ce temps.
      </div>
      <div v-if="promoAdv" class="g-choices">
        <button
          v-for="c in promoOffers"
          :key="c.id"
          class="g-choice"
          :disabled="busy"
          @click="doPromote(c.id)"
        >
          <span class="gc-emo">{{ c.emoji }}</span>
          <span class="gc-lbl">{{ c.label }}</span>
          <!-- ⚠️ « 💪3 ❤️2 ⚡1 » seul ne dit RIEN à qui choisit : on nomme l'orientation,
               puis les deux différences qui décident vraiment — ce qu'il apporte au
               convoi, et ce qu'il fait au combat. -->
          <span class="gc-shape">{{ advShapeLabel(c.w) }} · {{ shape(c) }}</span>
          <span v-if="c.role" class="gc-perk">{{ ADV_ROLE_LABEL[c.role] }}</span>
          <span v-if="c.signature && ADV_SIGNATURE_LABEL[c.signature]" class="gc-perk sig">
            {{ ADV_SIGNATURE_LABEL[c.signature] }}
          </span>
          <span v-if="!c.role && !c.signature" class="gc-perk none">
            Aucun rôle ni signature — de la stat brute
          </span>
          <span class="gc-rar">{{ RARITY_LABEL[classRarity(c)] }}</span>
        </button>
      </div>
      <div class="g-actions">
        <q-btn flat no-caps label="Plus tard" @click="promoOpen = false" />
      </div>
    </q-card>
  </q-dialog>
  <!-- ── FICHE D'UN AVENTURIER ──────────────────────────────────────────────
         Tout ce que le vivier ne peut pas montrer sans devenir illisible.
         ⚠️ Toujours PAS de niveau : c'est la règle posée à la conception (« un aventurier
         de manga »). Le rang et la barre disent où il en est ; le nombre, jamais. -->
  <q-dialog :model-value="!!detailAdv" position="bottom" @update:model-value="detailAdv = null">
    <q-card v-if="detailAdv" class="guild-card">
      <div class="g-head">
        <span class="g-title font-display">
          {{ titleOf(detailAdv)?.emoji ?? '🧑' }} {{ detailAdv.name }}
        </span>
        <span class="adv-rank" :style="{ color: rankOf(detailAdv).color }">
          {{ rankOf(detailAdv).emoji }} {{ rankOf(detailAdv).name }}
          {{ stars(rankOf(detailAdv).star) }}
        </span>
      </div>

      <div class="d-sub">
        {{ titleOf(detailAdv)?.label ?? '—' }} · <b>{{ RARITY_LABEL[rarityOf(detailAdv)] }}</b> ·
        {{ advShapeLabel(statWeights(detailAdv)) }}
      </div>

      <!-- Les STATS, qui n'étaient lisibles nulle part une fois la promotion faite. -->
      <div class="d-stats">
        <span class="d-stat">💪 {{ statsOf(detailAdv).puissance }}</span>
        <span class="d-stat">❤️ {{ statsOf(detailAdv).endurance }}</span>
        <span class="d-stat">⚡ {{ statsOf(detailAdv).agilite }}</span>
      </div>

      <div class="adv-bar" :title="`Étoile suivante au niveau ${nextStarOf(detailAdv)}`">
        <span class="adv-fill" :style="{ width: Math.round(progressOf(detailAdv) * 100) + '%' }" />
      </div>

      <div class="d-state">
        <template v-if="trainOf(detailAdv)">
          🎓 en formation ({{ trainNameOf(detailAdv) }}) · {{ leftOf(trainOf(detailAdv)) }}
        </template>
        <template v-else-if="hurtOf(detailAdv)">
          🛏️ à l'infirmerie · {{ leftOf(hurtOf(detailAdv)) }}
        </template>
        <template v-else-if="busyOf(detailAdv)">
          🐫 en route · {{ leftOf(busyOf(detailAdv)) }}
        </template>
        <template v-else>✅ disponible</template>
      </div>

      <!-- ⚠️ LE PARCOURS est la vraie raison d'être de cette fiche : chaque promotion est
             un choix DÉFINITIF, et il n'existait aucun endroit pour relire la suite de
             choix qui a fait cet aventurier. -->
      <div class="d-sec">🧭 Parcours</div>
      <div class="d-path">
        <span v-for="(c, i) in pathOf(detailAdv)" :key="i" class="d-step">
          {{ c.emoji }} {{ c.label }}
        </span>
      </div>

      <div v-if="rolesOf(detailAdv).length" class="d-sec">🐫 Sur les convois</div>
      <div v-if="rolesOf(detailAdv).length" class="d-perks">
        <span v-for="r in rolesOf(detailAdv)" :key="r" class="d-perk">
          {{ ADV_ROLE_LABEL[r] }}
        </span>
      </div>

      <div v-if="sigLabelsOf(detailAdv).length" class="d-sec">⚔️ Au combat</div>
      <div v-if="sigLabelsOf(detailAdv).length" class="d-perks">
        <span v-for="(l, i) in sigLabelsOf(detailAdv)" :key="i" class="d-perk sig">{{ l }}</span>
      </div>

      <p v-if="!rolesOf(detailAdv).length && !sigLabelsOf(detailAdv).length" class="g-note">
        Ni rôle de convoi ni signature — de la stat brute.
      </p>

      <div class="g-actions">
        <q-btn
          v-if="canPromoteOne(detailAdv) && !trainOf(detailAdv) && !busyOf(detailAdv)"
          flat
          no-caps
          label="⭐ Promouvoir"
          :disable="busy"
          @click="openPromoFromDetail(detailAdv)"
        />
        <q-btn flat no-caps label="Fermer" @click="detailAdv = null" />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
// Le panneau de la Guilde : le vivier, son rang, sa BARRE, le recrutement et les
// promotions. ⚠️ On n'affiche JAMAIS le niveau d'un aventurier — seulement son rang et
// l'avancement vers l'étoile suivante. C'est la règle posée dès la conception (« un
// aventurier de manga »), et c'est aussi ce qui rend la barre indispensable.
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import {
  ADV_CLASSES,
  advAvailable,
  advNextStarLevel,
  advRank,
  advRankProgress,
  advRarity,
  advSignatures,
  advTitle,
  advClass,
  advRoles,
  advStats,
  canPromote,
  classChoices,
  classRarity,
  advShapeLabel,
  ADV_ROLE_LABEL,
  ADV_SIGNATURE_LABEL,
  type AdvClass,
  type Adventurer,
} from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';
import { RARITY_LABEL } from '@/lib/items';
import { trainMsFor } from '@/lib/caravan';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();

const busy = ref(false);
const now = ref(Date.now());
setInterval(() => (now.value = Date.now()), 30_000);

const roster = computed(() => char.advList);
const guildLevel = computed(() => char.guildLevel);
const trainingLevel = computed(() => char.trainingLevel);
const gold = computed(() => char.row?.gold ?? 0);
const maxRoster = computed(() => 1 + Math.floor(guildLevel.value / 2));
const cost = computed(() =>
  Math.round(220 * (1 + roster.value.length) * Math.max(1, guildLevel.value) ** 0.6),
);

/** Graine du recrutement : figée tant que le vivier ne bouge pas, pour que l'offre
 *  affichée soit exactement celle qui sera recrutée. */
const recruitSeed = computed(() => (roster.value.length + 1) * 2654435761 + guildLevel.value);
const offers = computed(() => char.recruitChoices(recruitSeed.value));

const rankOf = (a: Adventurer) => advRank(a);
const titleOf = (a: Adventurer) => advTitle(a);
const rarityOf = (a: Adventurer) => advRarity(a);
const progressOf = (a: Adventurer) => advRankProgress(a);
const nextStarOf = (a: Adventurer) => advNextStarLevel(a);
const signaturesOf = (a: Adventurer) => advSignatures(a);
const stars = (s: number) => rankStarStr(s);
const isFree = (a: Adventurer) => advAvailable(a, now.value);
const busyOf = (a: Adventurer) => ((a.busyUntil ?? 0) > now.value ? a.busyUntil! : 0);
const hurtOf = (a: Adventurer) => ((a.hurtUntil ?? 0) > now.value ? a.hurtUntil! : 0);
/** Formation en cours (0 si aucune). ⚠️ Elle IMMOBILISE : c'est tout le coût d'une
 *  promotion, et le Centre de formation est ce qui l'abrège. */
const trainOf = (a: Adventurer) => ((a.training?.until ?? 0) > now.value ? a.training!.until : 0);
const trainNameOf = (a: Adventurer) =>
  a.training ? (ADV_CLASSES.find((c) => c.id === a.training!.classId)?.label ?? '?') : '';
const canPromoteOne = (a: Adventurer) => canPromote(a, guildLevel.value);

// ── Fiche d'un aventurier ──
const detailAdv = ref<Adventurer | null>(null);
const statsOf = (a: Adventurer) => advStats(a);
/** Les stats ramenées à la FORME attendue par `advShapeLabel` (p/e/a) : on nomme
 *  l'orientation à partir des stats RÉELLES, pas des poids d'une seule classe. */
const statWeights = (a: Adventurer) => {
  const st = advStats(a);
  return { p: st.puissance, e: st.endurance, a: st.agilite };
};
/** Le chemin de classes, dans l'ordre où il a été choisi. ⚠️ On filtre les ids inconnus
 *  plutôt que d'afficher « ? » : une classe retirée du vivier ne doit pas laisser un
 *  trou dans l'histoire d'un aventurier existant. */
const pathOf = (a: Adventurer) => a.path.map((id) => advClass(id)).filter((c) => !!c);
const rolesOf = (a: Adventurer) => advRoles(a);
const sigLabelsOf = (a: Adventurer) =>
  advSignatures(a)
    .map((e) => ADV_SIGNATURE_LABEL[e])
    .filter((l): l is string => !!l);
/** Depuis la fiche : on ferme celle-ci avant d'ouvrir la promotion — deux feuilles
 *  empilées sur un téléphone, on ne sait plus laquelle on referme. */
function openPromoFromDetail(a: Adventurer) {
  detailAdv.value = null;
  openPromo(a);
}
function leftOf(at: number): string {
  const m = Math.max(0, Math.round((at - now.value) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
/** « 💪4 ❤️2 ⚡0 » — la FORME de la classe, ce qui permet de composer une équipe. */
const shape = (c: AdvClass) => `💪${c.w.p} ❤️${c.w.e} ⚡${c.w.a}`;

const NAMES = [
  'Aldric',
  'Brenna',
  'Caelum',
  'Dahlia',
  'Eryn',
  'Faelan',
  'Gwen',
  'Hadrien',
  'Ilyana',
  'Joran',
  'Kaela',
  'Lorcan',
  'Maëlys',
  'Nils',
  'Orianne',
  'Perrin',
  'Quilan',
  'Rowena',
  'Soren',
  'Thalia',
  'Ulric',
  'Vesna',
  'Wynn',
  'Yara',
];

async function doRecruit(classId: string) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    const name = NAMES[Math.floor(Math.random() * NAMES.length)]!;
    const ok = await char.recruitAdventurer(uid, recruitSeed.value, classId, name);
    $q.notify(
      ok
        ? { type: 'positive', message: `${name} rejoint la Guilde.` }
        : { type: 'negative', message: 'Recrutement impossible (or, place ou offre).' },
    );
  } finally {
    busy.value = false;
  }
}

const promoOpen = ref(false);
const promoAdv = ref<Adventurer | null>(null);
const promoOffers = computed(() => (promoAdv.value ? classChoices(promoAdv.value) : []));
/** Ce que coûtera la promotion en cours de choix. ⚠️ Toutes les offres visent la MÊME
 *  strate, donc une seule durée — on l'affiche une fois, en tête, plutôt que sur chaque
 *  carte. */
const promoMs = computed(() =>
  promoAdv.value ? trainMsFor(trainingLevel.value, promoAdv.value.path.length) : 0,
);
const fmtMs = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

function openPromo(a: Adventurer) {
  promoAdv.value = a;
  promoOpen.value = true;
}
async function doPromote(classId: string) {
  const uid = auth.user?.id;
  const a = promoAdv.value;
  if (!uid || !a || busy.value) return;
  busy.value = true;
  try {
    const ok = await char.promoteAdventurer(uid, a.id, classId);
    if (ok) promoOpen.value = false;
    $q.notify(
      ok
        ? { type: 'positive', message: `${a.name} progresse.` }
        : { type: 'negative', message: 'Promotion impossible (Centre de formation ?).' },
    );
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
/* ── Fiche d'un aventurier ── */
.adv.hit {
  cursor: pointer;
}
.d-sub {
  font-size: 12.5px;
  color: var(--dim);
  margin: 2px 0 8px;
}
.d-stats {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
.d-stat {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-family: Oswald, sans-serif;
  font-size: 15px;
}
.d-state {
  font-size: 12px;
  color: var(--dim);
  margin: 6px 0 4px;
}
.d-sec {
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dim);
  margin: 10px 0 5px;
}
.d-path {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* Le parcours se lit comme une SUITE : une flèche entre deux étapes, jamais après la
   dernière (sinon elle promet une classe qui n'existe pas encore). */
.d-step {
  font-size: 12.5px;
}
.d-step + .d-step::before {
  content: '›';
  color: var(--dim);
  margin-right: 6px;
}
.d-perks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.d-perk {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text);
}
.d-perk.sig {
  border-color: var(--accent);
}
.guild-card {
  background: var(--surface);
  color: var(--text);
  padding: 16px 14px;
  border-radius: 16px 16px 0 0;
  width: 480px;
  max-width: 100vw;
}
.g-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.g-title {
  font-size: 18px;
  font-weight: 700;
}
.g-count {
  font-size: 13px;
  color: var(--dim);
}
.g-empty,
.g-note {
  font-size: 12.5px;
  color: var(--dim);
  margin: 6px 0 10px;
}
/* Une ligne par aventurier : icône de classe, identité, barre, état. */
.adv {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
}
.adv.busy {
  opacity: 0.62;
}
.adv-emo {
  font-size: 26px;
  line-height: 1.1;
}
.adv-main {
  flex: 1;
  min-width: 0;
}
.adv-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}
.adv-name {
  font-weight: 600;
  font-size: 14.5px;
}
.adv-rank {
  font-size: 12px;
  white-space: nowrap;
}
.adv-sub {
  font-size: 12px;
  color: var(--dim);
}
.adv-rar {
  margin-left: 6px;
  opacity: 0.8;
}
.adv-sig {
  margin-left: 4px;
  color: var(--accent);
}
.adv-bar {
  position: relative;
  height: 5px;
  margin: 5px 0 3px;
  border-radius: 3px;
  background: var(--surface-2, #1d1913);
  overflow: hidden;
}
.adv-fill {
  display: block;
  height: 100%;
  background: var(--accent);
}
.adv-state {
  font-size: 11px;
  color: var(--dim);
}
.adv-promo {
  align-self: center;
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  min-height: 32px;
}
.g-recruit {
  border-top: 1px solid var(--line);
  padding-top: 10px;
  margin-top: 4px;
}
/* Grille fluide : jamais de débordement, les cartes se réorganisent. */
.g-cost {
  margin: 2px 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12.5px;
  color: var(--dim);
}
.g-choices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.g-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  background: #1d1913;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  min-height: 44px;
}
.g-choice:disabled {
  opacity: 0.45;
}
.gc-emo {
  font-size: 24px;
}
.gc-lbl {
  font-size: 12.5px;
  font-weight: 600;
  text-align: center;
}
.gc-w,
.gc-shape {
  font-size: 11.5px;
  color: var(--dim);
}
.gc-perk {
  font-size: 11.5px;
  color: var(--text);
  line-height: 1.3;
}
.gc-perk.sig {
  color: var(--accent, #ffd23f);
}
.gc-perk.none {
  color: var(--dim);
  font-style: italic;
}
.gc-rar {
  font-size: 11px;
  color: var(--dim);
}
.g-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
