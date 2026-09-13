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
        <!-- ⚠️ LE RECRUTEMENT EN TÊTE, et dans sa propre feuille (signalé). Il vivait
             tout au FOND du panneau, sous la liste : à dix aventuriers, le choix de la
             première classe — celui qui engage une LIGNÉE entière — se trouvait hors
             écran et se lisait mal. Il suit désormais le patron de la promotion : un
             bouton, puis une feuille qui ne montre QUE ce choix.
             ⚠️ Déplacé dans le DOM, PAS par `order` : `.guild-card` n'est pas un
             conteneur flex, donc un `order: -1` n'aurait rien fait — et la rendre flex
             aurait déplacé la mise en page des quatre feuilles qui partagent la classe. -->
        <button
          v-if="roster.length < maxRoster"
          class="voie-btn g-hire"
          :disabled="busy || gold < cost"
          @click="recruitOpen = true"
        >
          ➕ Recruter un aventurier — {{ cost }} 🪙
        </button>
        <div v-else class="g-note g-full">
          Guilde pleine ({{ roster.length }}/{{ maxRoster }}). <b>Monte-la d’un niveau</b> pour
          loger quelqu’un de plus.
        </div>
        <!-- ── Le vivier ── -->
        <div v-if="!roster.length" class="g-empty">
          Personne encore. Recrute ton premier aventurier — il escortera tes caravanes.
        </div>
        <!-- 🖼️ LE VIVIER EN PORTRAITS (v0.807 ; demandé par l'utilisateur) : chaque
             aventurier est présenté comme le héros à l'entrée de l'Aventure — avatar au
             centre selon sa classe, étoiles de rang sur l'anneau, quatre ronds aux coins.
             Toucher le portrait ouvre sa FICHE ; toucher le familier ou le talent de
             l'avatar ouvre directement leur sélecteur. -->
        <div v-if="roster.length" class="adv-grid">
          <AdventurerPortrait
            v-for="a in roster"
            :key="a.id"
            :adv="a"
            :familiar="famOf(a)"
            :talent-icon="talIconOf(a)"
            :power="powerOf(a)"
            :state="stateOf(a)"
            :promotable="canPromoteOne(a)"
            :disabled="busy"
            @open="detailAdv = a"
            @familiar="pairFor = a"
            @talent="talFor = a"
            @promote="openPromo(a)"
          />
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
          <span v-if="promoHorizon(c.id).length" class="gc-horizon">
            mène à {{ promoHorizon(c.id).join(' · ') }}
          </span>
          <span class="gc-rar">{{ RARITY_LABEL[classRarity(c)] }}</span>
        </button>
      </div>
      <div class="g-actions">
        <q-btn flat no-caps label="Plus tard" @click="promoOpen = false" />
      </div>
    </q-card>
  </q-dialog>

  <!-- ── RECRUTER : une feuille qui ne montre QUE ce choix ──────────────────
       ⚠️ La classe de DÉPART engage toute la lignée (la filiation est stricte), donc
       elle mérite le même traitement qu'une promotion : un écran à elle. -->
  <q-dialog v-model="recruitOpen" position="bottom">
    <q-card class="guild-card">
      <div class="g-title font-display">⚔️ Une nouvelle recrue</div>
      <p class="g-note">
        Choisis sa <b>voie de départ</b>. Elle décide de ce qui lui sera proposé ensuite — un
        Guerrier ne se verra <b>jamais</b> offrir la voie d’un Clerc.
      </p>
      <div class="g-cost">
        💰 Recrutement : <b>{{ cost }} 🪙</b> — le prix monte avec l’effectif.
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
          <!-- ⚠️ Le recrutement se faisait À L'AVEUGLE : il n'annonçait que
                     « 💪3 ❤️2 ⚡1 », quand la promotion nomme déjà l'orientation, le rôle
                     de convoi et la signature. On choisissait une LIGNÉE sans savoir ce
                     qu'elle donne. Même lecture des deux côtés. -->
          <span class="gc-shape">{{ advShapeLabel(c.w) }} · {{ shape(c) }}</span>
          <span v-if="c.role" class="gc-perk">{{ ADV_ROLE_LABEL[c.role] }}</span>
          <span v-if="c.signature && ADV_SIGNATURE_LABEL[c.signature]" class="gc-perk sig">
            {{ ADV_SIGNATURE_LABEL[c.signature] }}
          </span>
          <!-- « Où il va » : ce que la voie peut encore débloquer plus tard. -->
          <span v-if="horizonOf(c.id).length" class="gc-horizon">
            mène à {{ horizonOf(c.id).join(' · ') }}
          </span>
        </button>
      </div>
      <div class="g-actions">
        <q-btn flat no-caps label="Plus tard" @click="recruitOpen = false" />
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
        {{ titleOf(detailAdv)?.label ?? '—' }} ·
        <b :style="{ color: rarColor(detailAdv) }">{{ rarOf(detailAdv) }}</b> ·
        {{ advShapeLabel(statWeights(detailAdv)) }}
      </div>

      <!-- ⚔️ La puissance, et ce que la PAIRE y ajoute : sans l’écart, on ne sait pas si
           le compagnon et le talent confiés servent à quelque chose. -->
      <div class="d-pow">
        <span class="d-pow-val font-display">⚔️ {{ fmtPow(powerOf(detailAdv)) }}</span>
        <span v-if="pairBonusOf(detailAdv) > 0" class="d-pow-gain">
          dont +{{ fmtPow(pairBonusOf(detailAdv)) }} grâce à son compagnon et son talent
        </span>
        <span v-else class="d-pow-gain">sans compagnon ni talent qui compte</span>
      </div>

      <!-- Les STATS, qui n'étaient lisibles nulle part une fois la promotion faite. -->
      <div class="d-stats">
        <span class="d-stat">💪 {{ statsOf(detailAdv).puissance }}</span>
        <span class="d-stat">❤️ {{ statsOf(detailAdv).endurance }}</span>
        <span class="d-stat">⚡ {{ statsOf(detailAdv).agilite }}</span>
      </div>

      <div class="adv-bar" :title="barTitle(detailAdv)">
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

      <!-- ⚠️ Une compétence apprise DEUX FOIS n'est pas listée deux fois : elle monte
           d'un NIVEAU, et son effet suit. Répétée, elle se lisait comme un bug. -->
      <div v-if="rolesOf(detailAdv).length" class="d-sec">🐫 Sur les convois</div>
      <div v-if="rolesOf(detailAdv).length" class="d-perks">
        <span v-for="s in rolesOf(detailAdv)" :key="s.what" class="d-perk">
          {{ ADV_ROLE_LABEL[s.what] }}
          <b v-if="s.level > 1" class="d-lvl">Nv {{ s.level }}</b>
        </span>
      </div>

      <div v-if="sigLabelsOf(detailAdv).length" class="d-sec">⚔️ Au combat</div>
      <div v-if="sigLabelsOf(detailAdv).length" class="d-perks">
        <span v-for="s in sigLabelsOf(detailAdv)" :key="s.label" class="d-perk sig">
          {{ s.label }}
          <b v-if="s.level > 1" class="d-lvl">Nv {{ s.level }}</b>
        </span>
      </div>

      <p v-if="!rolesOf(detailAdv).length && !sigLabelsOf(detailAdv).length" class="g-note">
        Ni rôle de convoi ni signature — de la stat brute.
      </p>

      <!-- ── 🐾🧠 SA PAIRE ────────────────────────────────────────────────────
           ⚠️ C’est ICI que l’on confie un familier et un talent, pas au Chenil :
           ils appartiennent à un HOMME et le suivent partout — convoi comme
           rempart. Le Chenil ne fait que plafonner combien et jusqu’à quel rang. -->
      <div class="d-sec">🐾 Sa paire</div>
      <button type="button" class="d-pair" @click="pairFor = detailAdv">
        <span class="d-pair-emo">{{ detailFam?.emoji ?? '＋' }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ detailFam?.name ?? 'Aucun compagnon' }}
            <span v-if="detailFam" class="d-rk" :style="{ '--rk': famColor(detailFam) }">{{
              RARITY_LABEL[detailFam.rarity]
            }}</span>
          </span>
          <span v-for="(g, i) in detailFamGain" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ famNote(detailAdv) }}</span>
        </span>
      </button>
      <button type="button" class="d-pair" @click="talFor = detailAdv">
        <span class="d-pair-emo">{{ detailTal ? '🧠' : '＋' }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ talLabel(detailAdv) }}
            <span v-if="detailTal" class="d-rk" :style="{ '--rk': talColor(detailTal) }">{{
              RARITY_LABEL[talentRankOf(detailTal)]
            }}</span>
          </span>
          <span v-for="(g, i) in detailTalGain" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ talNote(detailAdv) }}</span>
        </span>
      </button>

      <div class="g-actions">
        <q-btn
          v-if="canPromoteOne(detailAdv)"
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

  <!-- ── SÉLECTEUR DE COMPAGNON ───────────────────────────────────────────
       ⚠️ On montre TOUT ce qu’on possède, en DISANT pourquoi un familier n’est pas
       disponible (porté par le héros, hors de portée du Chenil) plutôt qu’en le
       cachant : masquer donne l’impression de l’avoir perdu. -->
  <q-dialog :model-value="!!pairFor" position="bottom" @update:model-value="pairFor = null">
    <q-card class="sheet">
      <div class="g-head">
        <div class="g-title font-display">🐾 Son compagnon</div>
        <button class="iconbtn" aria-label="Fermer" @click="pairFor = null">✕</button>
      </div>
      <p class="g-note">
        Chenil niveau {{ kennelLevel }} — rang max <b>{{ rankCapLabel }}</b> · {{ pairedCount }}/{{
          slots
        }}
        compagnons confiés
      </p>
      <!-- ⚠️ On le dit UNE fois, en tête : le chiffre listé n’est pas celui de la fiche du
           familier. Sans ça, lire « +4,2% » ici et « +10,5% » sur le même loup dans
           l’inventaire se lit comme un bug. -->
      <p class="g-note">{{ GAIN_NOTE }}</p>
      <button v-if="pairFor && famOf(pairFor)" class="cta ghost" @click="assignFam(null)">
        Reprendre son compagnon
      </button>
      <p v-if="!famPool.length" class="g-note">
        Aucun familier en réserve — le Labyrinthe en donne un à chaque palier nettoyé.
      </p>
      <button
        v-for="r in famRows"
        :key="r.f.id"
        type="button"
        class="d-pick"
        :class="{ barred: !r.ok, here: pairFor && famOf(pairFor)?.id === r.f.id }"
        :disabled="!r.ok"
        @click="assignFam(r.f.id)"
      >
        <span class="d-pair-emo">{{ r.f.emoji }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ r.f.name }}
            <span class="d-rk" :style="{ '--rk': r.color }">{{ RARITY_LABEL[r.f.rarity] }}</span>
            <span
              v-if="r.train"
              class="d-train"
              title="Dressage de défense, et ce que ton Chenil en retient"
              >{{ r.train }}</span
            >
          </span>
          <span v-for="(g, i) in r.gains" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ r.meta }}</span>
          <span v-if="r.why" class="d-pair-sub warn">{{ r.why }}</span>
        </span>
      </button>
      <div class="g-actions"><q-btn flat no-caps label="Fermer" @click="pairFor = null" /></div>
    </q-card>
  </q-dialog>

  <!-- ── SÉLECTEUR DE TALENT ─────────────────────────────────────────────── -->
  <q-dialog :model-value="!!talFor" position="bottom" @update:model-value="talFor = null">
    <q-card class="sheet">
      <div class="g-head">
        <div class="g-title font-display">🧠 Son talent</div>
        <button class="iconbtn" aria-label="Fermer" @click="talFor = null">✕</button>
      </div>
      <button v-if="talFor && talOf(talFor)" class="cta ghost" @click="assignTal(null)">
        Reprendre son talent
      </button>
      <p class="g-note">{{ GAIN_NOTE }}</p>
      <p v-if="!talPool.length" class="g-note">Aucun talent libre — les tiens sont équipés.</p>
      <button
        v-for="r in talRows"
        :key="r.t.id"
        type="button"
        class="d-pick"
        :class="{ barred: !r.ok, here: talFor && talOf(talFor)?.id === r.t.id }"
        :disabled="!r.ok"
        @click="assignTal(r.t.id)"
      >
        <span class="d-pair-emo">{{ r.icon }}</span>
        <span class="d-pair-main">
          <span class="d-pair-name">
            {{ r.name }}
            <span class="d-rk" :style="{ '--rk': r.color }">{{ RARITY_LABEL[r.rank] }}</span>
          </span>
          <span v-for="(g, i) in r.gains" :key="i" class="d-gain">{{ g }}</span>
          <span class="d-pair-sub">{{ r.meta }}</span>
          <span v-if="r.taken" class="d-pair-sub warn">{{ r.taken }}</span>
        </span>
      </button>
      <div class="g-actions"><q-btn flat no-caps label="Fermer" @click="talFor = null" /></div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
// Le panneau de la Guilde : le vivier, son rang, sa BARRE, le recrutement et les
// promotions. ⚠️ On n'affiche JAMAIS le niveau d'un aventurier — seulement son rang et
// l'avancement vers l'étoile suivante. C'est la règle posée dès la conception (« un
// aventurier de manga »), et c'est aussi ce qui rend la barre indispensable.
import { computed, onUnmounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import {
  ADV_CLASSES,
  ADV_STARS,
  advNextPromoLevel,
  advRarity,
  advRank,
  advRankProgress,
  advTitle,
  advClass,
  advRoleLevels,
  reachableSkills,
  advSignatureLevels,
  advStats,
  canPromoteNow,
  classChoices,
  classRarity,
  advShapeLabel,
  ADV_ROLE_LABEL,
  ADV_SIGNATURE_LABEL,
  type AdvClass,
  type Adventurer,
} from '@/lib/adventurers';
import { rankStarStr } from '@/lib/characterRank';
import {
  RARITY_LABEL,
  RANK_COLOR,
  FAMILIAR_SLOT,
  aggregateLines,
  famLevel,
  famXp,
  rollJet,
  type Item,
} from '@/lib/items';
import {
  normalizeTalents,
  talentByCode,
  talentJetOf,
  talentRankOf,
  type TalentInstance,
} from '@/lib/talents';
import {
  companionSlots,
  companionRankLabel,
  companionPairs,
  canCompanion,
  adventurerPowers,
  type CompanionCtx,
} from '@/lib/raid';
import { fmtPow } from '@/lib/combat';
import AdventurerPortrait from '@/components/AdventurerPortrait.vue';
import { trainMsFor, companionEffects, advTalentEffects, canAdvTalent } from '@/lib/caravan';

const props = defineProps<{
  open: boolean;
  /** Ouvrir DIRECTEMENT la feuille de promotion de CET aventurier. Posé au retour
   *  d’un convoi dont la mission vient de rendre la promotion possible : l’information
   *  arrive au moment où elle est actionnable, au lieu d’attendre qu’on repasse par la
   *  Guilde. ⚠️ La feuille s’ouvre PAR-DESSUS la carte de Guilde, pas à sa place : on
   *  promeut, puis on est déjà là où l’on gère son vivier. */
  promoteId?: string | null;
  /** `'recruit'` : ouvrir DIRECTEMENT sur le choix de classe. Posé quand un niveau
   *  de Guilde vient d’ouvrir une place — le seul moment où l’on recrute, et celui où
   *  le joueur refermait la feuille sans savoir qu’une recrue l’attendait. */
  mode?: 'recruit' | null;
}>();
const emit = defineEmits<{ close: [] }>();
const $q = useQuasar();
const auth = useAuthStore();
const char = useCharacterStore();

// ── 🐾🧠 LA PAIRE : un compagnon et un talent, confiés à un HOMME ───────────────
// ⚠️ Ils le suivent PARTOUT (convoi comme rempart) : c’est pour ça que l’appariement
// vit sur SA fiche et pas au Chenil. Le Chenil ne fait que plafonner combien et
// jusqu’à quel rang — comme la Guilde pour les aventuriers, sauf qu’il ne les crée pas.
const pairFor = ref<Adventurer | null>(null);
const talFor = ref<Adventurer | null>(null);
const kennelLevel = computed(() => char.kennelLevel);
const slots = computed(() => companionSlots(kennelLevel.value));
const rankCapLabel = computed(() => companionRankLabel(kennelLevel.value));
const heroFamId = computed(() => char.row?.equipped?.[FAMILIAR_SLOT]?.id ?? null);
const famPool = computed(() =>
  (char.row?.inventory ?? []).filter((it: Item) => it.slot === FAMILIAR_SLOT),
);
/** Les talents LIBRES : ceux que le héros n’a pas équipés. Un talent ne peut pas être
 *  à deux endroits — c’est la même règle que le compagnon. */
const talPool = computed(() =>
  normalizeTalents(char.row?.talents ?? []).filter((t) => t.equipped !== true),
);
/** Le contexte d’appariement. ⚠️ UN seul objet pour le compteur ET la puissance : deux
 *  copies finiraient par ne pas retenir les mêmes paires. */
const compCtx = computed<CompanionCtx>(() => ({
  familiars: famPool.value,
  talents: talPool.value,
  kennelLevel: kennelLevel.value,
  // L’horloge du panneau : la fatigue d’un compagnon compte, et elle passe.
  now: now.value,
  heroFamiliarId: heroFamId.value,
}));
const pairedCount = computed(() => companionPairs(char.advList, compCtx.value).size);
/** ⚔️ Puissances calculées par la LIB (`combatPower`, celle du héros) — jamais ici. La
 *  version NUE sert à dire ce que la paire ajoute. */
const powers = computed(() => adventurerPowers(char.advList, compCtx.value));
const barePowers = computed(() => adventurerPowers(char.advList));
const powerOf = (a: Adventurer) => powers.value.get(a.id) ?? 0;
const pairBonusOf = (a: Adventurer) => powerOf(a) - (barePowers.value.get(a.id) ?? 0);
const famById = computed(() => new Map(famPool.value.map((f) => [f.id, f])));
const talById = computed(() => new Map(talPool.value.map((t) => [t.id, t])));
const famOf = (a: Adventurer) => (a.familiarId ? (famById.value.get(a.familiarId) ?? null) : null);
const talOf = (a: Adventurer) => (a.talentId ? (talById.value.get(a.talentId) ?? null) : null);
const famOk = (f: Item) => f.id !== heroFamId.value && canCompanion(f, kennelLevel.value);
/**
 * CE QUE L’AVENTURIER EN TIRE — calculé par la fonction du COMBAT, jamais réécrite.
 *
 * ⚠️ Depuis la v0.805 c’est la formule du HÉROS (niveau d’objet × dressage), sans bridage
 * ni terrain. On appelle quand même `companionEffects` sur CE seul familier plutôt que
 * de relire la fiche : une étiquette qui refait le calcul à sa façon finit par diverger.
 *
 * ⚠️ Valeur au REPOS : un familier fatigué compte de moitié au rempart, mais la
 * fatigue passe en quelques heures et l’appariement, lui, dure.
 */
const famGain = (f: Item) => aggregateLines(companionEffects([f]));
const talGain = (t: TalentInstance) => aggregateLines(advTalentEffects([t]));
/** Les trois axes de magnitude du projet : rang, jet, niveau d’objet. */
// ⚠️ La rareté n'est PAS répétée ici : elle vit dans la pastille colorée, où elle est
// accentuée (« Épique », pas « EPIQUE » — la pastille affichait la CLÉ de l'énumération).
const famMeta = (f: Item) =>
  `jet ${rollJet(f.roll)}% · niv ${f.level}${f.effect2 ? ' · ✦ signature' : ''}`;
const talMeta = (t: TalentInstance) => `jet ${talentJetOf(t)}% · niv ${t.level ?? 1}`;
const famColor = (f: Item) => RANK_COLOR[f.rarity];
const talColor = (t: TalentInstance) => RANK_COLOR[talentRankOf(t)];
/** Le DRESSAGE, unique depuis la v0.805 (donjon, convoi, défense).
 *  ⚠️ Un familier NEUF est à zéro, et c'est le cas le plus courant : « 🎓 0 » se lirait
 *  comme une erreur plutôt que comme « pas encore dressé ». On ne dit rien tant qu'il
 *  n'y a rien à dire. */
function famTrain(f: Item): string {
  const n = famLevel(famXp(f));
  return n ? `🎓 ${n}` : '';
}
/** ⚠️ VIDE quand il n'y a rien à signaler : répété sur chaque ligne, « Libre » n'apprend
 *  rien et noie la seule chose qui compte — le gain. On ne parle que d'un empêchement. */
function famWhy(f: Item): string {
  if (f.id === heroFamId.value) return 'Ton héros le porte — il se bat ailleurs.';
  if (!canCompanion(f, kennelLevel.value))
    return `Hors de portée de ton Chenil (rang max ${rankCapLabel.value}).`;
  const autre = char.advList.find((a) => a.familiarId === f.id && a.id !== pairFor.value?.id);
  return autre ? `Confié à ${autre.name} — le prendre le lui retirera.` : '';
}
function famNote(a: Adventurer): string {
  const f = famOf(a);
  if (!f) return 'Aucun familier confié.';
  return famMeta(f);
}
const talName = (t: TalentInstance) => talentByCode(t.code)?.name ?? t.code;
function talTaken(t: TalentInstance): string {
  const pour = talFor.value;
  // ⚠️ La règle vient de la LIB (`canAdvTalent`, celle que le combat et le store appliquent).
  if (pour && !canAdvTalent(pour, t))
    return `Trop rare : sa classe est ${RARITY_LABEL[advRarity(pour)]} — promeus-le d’abord.`;
  const autre = char.advList.find((a) => a.talentId === t.id && a.id !== talFor.value?.id);
  return autre ? `Confié à ${autre.name} — le prendre le lui retirera.` : '';
}
function talLabel(a: Adventurer): string {
  const t = talOf(a);
  return t ? talName(t) : 'Aucun talent confié';
}
function talNote(a: Adventurer): string {
  const t = talOf(a);
  return t
    ? talMeta(t)
    : `Un talent, bridé et jusqu’à la rareté de sa classe (${RARITY_LABEL[advRarity(a)]}).`;
}
/** L'avertissement des deux sélecteurs. ⚠️ Écrit UNE fois : deux copies mot pour mot se
 *  reformulent séparément, et l'une des deux finit par mentir. */
const GAIN_NOTE = 'Les gains listés sont ce que l’aventurier en tire.';

/**
 * LES LIGNES DU SÉLECTEUR, pré-calculées.
 *
 * ⚠️ Le composant a un tick de 30 s (fatigue, convalescences, formations), donc TOUT ce
 * que le template appelle est ré-évalué à chaque battement — et chaque helper y était
 * appelé deux fois par ligne (une fois en `v-if`, une fois en interpolation), `famWhy`
 * et `talTaken` balayant `advList` à chacun. Mesuré sur un compte réel : ~74 talents en
 * réserve, soit ~150 balayages et ~2 800 allocations par battement, pour reproduire des
 * chaînes strictement identiques.
 *
 * ⚠️ Aucune dépendance de ces `computed` n'inclut `now` : le tick ne les recalcule donc
 * plus du tout.
 */
const famRows = computed(() =>
  famPool.value.map((f) => ({
    f,
    ok: famOk(f),
    gains: famGain(f),
    meta: famMeta(f),
    train: famTrain(f),
    why: famWhy(f),
    color: famColor(f),
  })),
);
const talRows = computed(() =>
  talPool.value.map((t) => ({
    t,
    name: talName(t),
    icon: talentByCode(t.code)?.icon ?? '🧠',
    rank: talentRankOf(t),
    gains: talGain(t),
    meta: talMeta(t),
    ok: !talFor.value || canAdvTalent(talFor.value, t),
    taken: talTaken(t),
    color: talColor(t),
  })),
);
/** Le compagnon et le talent de l'aventurier ouvert. ⚠️ Un `computed` plutôt que huit
 *  appels et cinq `!` non-null dans le template : chaque `!` est une assertion que le
 *  lecteur doit re-vérifier contre le `v-if` du parent, et le lien casse en silence dès
 *  qu'on déplace une ligne. */
const detailFam = computed(() => (detailAdv.value ? famOf(detailAdv.value) : null));
const detailTal = computed(() => (detailAdv.value ? talOf(detailAdv.value) : null));
const detailFamGain = computed(() => (detailFam.value ? famGain(detailFam.value) : []));
const detailTalGain = computed(() => (detailTal.value ? talGain(detailTal.value) : []));
/** ⚠️ Le store REFUSE ce qui est impossible (héros porteur, rang hors d’école) : on
 *  affiche son message plutôt que d’en réécrire un second qui pourrait diverger. */
async function pair(fn: (uid: string) => Promise<unknown>) {
  const uid = auth.user?.id;
  if (!uid || busy.value) return;
  busy.value = true;
  try {
    await fn(uid);
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  } finally {
    busy.value = false;
  }
}
function assignFam(id: string | null) {
  const a = pairFor.value;
  if (!a) return;
  pairFor.value = null;
  void pair((uid) => char.setCompanion(uid, a.id, id));
}
function assignTal(id: string | null) {
  const a = talFor.value;
  if (!a) return;
  talFor.value = null;
  void pair((uid) => char.setAdvTalent(uid, a.id, id));
}

const busy = ref(false);
const now = ref(Date.now());
// ⚠️ NETTOYÉE au démontage. Posée au niveau du setup et jamais arrêtée, elle continuait de
// battre après la fermeture du panneau en retenant la ref ET le composant — exactement la
// fuite corrigée sur la carte d’expédition en v0.732, jamais répercutée ici.
const clock = setInterval(() => (now.value = Date.now()), 30_000);
onUnmounted(() => clearInterval(clock));

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
// La RARETÉ de sa classe — distincte du rang, mais elle monte du même pas (une classe
// par rang gagné), donc les deux ne peuvent plus se contredire.
const rarOf = (a: Adventurer) => RARITY_LABEL[advRarity(a)];
const rarColor = (a: Adventurer) => RANK_COLOR[advRarity(a)];
const titleOf = (a: Adventurer) => advTitle(a);
const progressOf = (a: Adventurer) => advRankProgress(a);
// ⚠️ La barre annonce la PROMOTION, plus « l’étoile suivante » : ce niveau-là ne
// déclenchait rien. Au sommet elle dit pourquoi il n’y a plus d’échéance, au lieu de se
// taire — un titre vide se lit comme un oubli.
const barTitle = (a: Adventurer) => {
  const n = advNextPromoLevel(a);
  return n === null
    ? 'Au sommet de l’arbre — les étoiles suivent son entraînement'
    : `Promotion suivante à ${stars(ADV_STARS)}`;
};
const stars = (s: number) => rankStarStr(s);
const busyOf = (a: Adventurer) => ((a.busyUntil ?? 0) > now.value ? a.busyUntil! : 0);
const hurtOf = (a: Adventurer) => ((a.hurtUntil ?? 0) > now.value ? a.hurtUntil! : 0);
/** Formation en cours (0 si aucune). ⚠️ Elle IMMOBILISE : c'est tout le coût d'une
 *  promotion, et le Centre de formation est ce qui l'abrège. */
const trainOf = (a: Adventurer) => ((a.training?.until ?? 0) > now.value ? a.training!.until : 0);
const trainNameOf = (a: Adventurer) =>
  a.training ? (ADV_CLASSES.find((c) => c.id === a.training!.classId)?.label ?? '?') : '';
/** ⚠️ LA RÈGLE COMPLÈTE, une seule fois. Elle vivait ici en TROIS morceaux collés dans
 *  le template (`canPromote` + pas en formation + pas en convoi) et il en manquait un
 *  quatrième — l’existence du Centre de formation, que seul le store exigeait. */
/** Ce qu’il fait en ce moment, en une ligne. ⚠️ La formation passe AVANT la convalescence :
 *  les deux peuvent courir ensemble, et c’est celle qu’on vient de lancer qu’on cherche. */
function stateOf(a: Adventurer): string {
  if (trainOf(a)) return `🎓 en formation · ${leftOf(trainOf(a))}`;
  if (hurtOf(a)) return `🛏️ à l’infirmerie · ${leftOf(hurtOf(a))}`;
  if (busyOf(a)) return `🐫 en route · ${leftOf(busyOf(a))}`;
  return '✅ disponible';
}
const talIconOf = (a: Adventurer) => {
  const t = talOf(a);
  return t ? (talentByCode(t.code)?.icon ?? '🧠') : undefined;
};
const canPromoteOne = (a: Adventurer) =>
  canPromoteNow(a, {
    guildLevel: guildLevel.value,
    trainingLevel: trainingLevel.value,
    now: now.value,
  });

// ── Fiche d'un aventurier ──
const recruitOpen = ref(false);

// ⚠️ Un `watch` IMMÉDIAT : le panneau peut être DÉJÀ MONTÉ quand le mode change — on
// revient de la cour sans jamais le démonter. Un test au montage raterait ce cas, qui
// est précisément le seul qui se produise.
watch(
  () => [props.open, props.mode] as const,
  ([open, mode]) => {
    if (open && mode === 'recruit' && roster.value.length < maxRoster.value)
      recruitOpen.value = true;
  },
  { immediate: true },
);
// ⚠️ Même patron que `mode` ci-dessus, et pour la même raison : `immediate`, parce que le
// panneau peut être déjà monté quand la prop change. On attend que le vivier soit
// chargé — sinon l’id ne désigne encore personne et l’ouverture est perdue.
watch(
  () => [props.promoteId, roster.value] as const,
  ([id]) => {
    if (!id || promoOpen.value) return;
    const a = roster.value.find((x) => x.id === id);
    if (a) openPromo(a);
  },
  { immediate: true },
);
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
const rolesOf = (a: Adventurer) => advRoleLevels(a);
/** Les signatures NOMMÉES, avec leur niveau. On écarte celles sans libellé plutôt que
 *  d'afficher un code brut : un effet qu'on ne sait pas nommer n'aide personne. */
const sigLabelsOf = (a: Adventurer) =>
  advSignatureLevels(a)
    .map((s) => ({ label: ADV_SIGNATURE_LABEL[s.what], level: s.level }))
    .filter((s): s is { label: string; level: number } => !!s.label);
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

/** Les compétences qu'une voie peut ENCORE débloquer — celles de la classe choisie
 *  exclues (elle les annonce déjà juste au-dessus, les répéter serait du bruit).
 *  ⚠️ Mémoïsé : la liste est rendue pour chaque offre, et l'énumération des chemins
 *  n'est pas gratuite. Le catalogue étant figé, un cache par clé suffit. */
const horizonCache = new Map<string, string[]>();
function horizonFor(path: string[], own: AdvClass | undefined): string[] {
  const key = path.join('>');
  const hit = horizonCache.get(key);
  if (hit) return hit;
  const reach = reachableSkills(path);
  const out = [
    ...reach.roles.filter((r) => r !== own?.role).map((r) => ADV_ROLE_LABEL[r].split(' ')[0] ?? ''),
    ...reach.signatures
      .filter((sg) => sg !== own?.signature)
      .map((sg) => ADV_SIGNATURE_LABEL[sg]?.split(' ')[0] ?? ''),
  ].filter(Boolean);
  horizonCache.set(key, out);
  return out;
}
/** Au RECRUTEMENT, le chemin ne contient que la classe choisie. */
const horizonOf = (id: string) => horizonFor([id], advClass(id));
/** À la PROMOTION, il faut le chemin DÉJÀ parcouru : l'éligibilité dépend des tags
 *  accumulés, donc partir de la seule classe visée annoncerait un horizon faux. */
const promoHorizon = (id: string) =>
  horizonFor([...(promoAdv.value?.path ?? []), id], advClass(id));

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
    // ⚠️ On ne referme QUE sur un succès : un refus (or manquant, place prise) doit
    // laisser la feuille ouverte, sinon le joueur ne voit pas pourquoi rien ne s'est passé.
    if (ok) recruitOpen.value = false;
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
.g-hire,
.g-full {
  margin-bottom: 10px;
}
/* ── Fiche d'un aventurier ── */
.adv.hit {
  cursor: pointer;
}
.d-sub {
  font-size: 12.5px;
  color: var(--dim);
  margin: 2px 0 8px;
}
.adv-pow {
  margin-left: auto;
  font-family: 'Oswald', sans-serif;
  font-size: 13px;
  white-space: nowrap;
}
.d-pow {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-bottom: 8px;
}
.d-pow-val {
  font-size: 20px;
}
.d-pow-gain {
  font-size: 12px;
  color: var(--dim);
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
/* 🐾🧠 LA PAIRE — une ligne par chose confiée, cible tactile pleine largeur.
   ⚠️ Préfixe `d-` (detail) comme le reste de la fiche : des classes génériques
   écraseraient celles d’un autre écran (la leçon des `fp-*`, v0.751). */
.d-pair,
.d-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  margin-bottom: 6px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
}
.d-pick.here {
  border-color: var(--q-primary);
}
/* Indisponible : il reste LISIBLE — on doit pouvoir lire POURQUOI — il n’est
   simplement plus cliquable. Pointillé en plus de l’opacité : la couleur seule ne
   suffit pas. */
.d-pick.barred {
  opacity: 0.55;
  border-style: dashed;
  cursor: default;
}
.d-pair-emo {
  font-size: 22px;
  width: 26px;
  text-align: center;
}
.d-pair-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.d-pair-name {
  font-size: 13.5px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.d-pair-sub {
  font-size: 11.5px;
  color: var(--dim);
}
/* Le GAIN : c’est la seule chose qui départage deux compagnons, donc la seule ligne en
   pleine couleur — le reste (rang, jet, niveau) ne fait que l’expliquer. */
.d-gain {
  font-size: 12px;
  color: var(--text);
}
/* Le rang prend sa couleur de RANK_COLOR, la source unique — pas une 4ᵉ copie des huit
   classes .p-*, qui vivent dans trois autres composants et finiraient par diverger. */
.d-rk {
  font-size: 10px;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 999px;
  color: var(--rk);
  border: 1px solid var(--rk);
  margin-left: 6px;
  white-space: nowrap;
}
/* Un empêchement n’est pas une métadonnée : il se distingue du jet et du niveau. */
.d-pair-sub.warn {
  color: var(--d3, #ffb23f);
}
.d-train {
  font-size: 10.5px;
  color: var(--dim);
  margin-left: 6px;
  white-space: nowrap;
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
/* Le NIVEAU d'une compétence : discret mais lisible — c'est un attribut du libellé,
   pas une seconde information à côté. */
.d-lvl {
  margin-left: 4px;
  color: var(--accent);
  font-family: Oswald, sans-serif;
}
/* L'HORIZON d'une voie : en retrait, parce que c'est un possible, pas une promesse. */
.gc-horizon {
  font-size: 10.5px;
  color: var(--dim);
  opacity: 0.85;
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
.adv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
@media (min-width: 520px) {
  .adv-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
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
/* La rareté de la classe, à côté du métier : discrète, elle explique le rang sans
   lui faire concurrence. */
.adv-rar {
  margin-left: 6px;
  font-size: 11px;
  text-transform: capitalize;
}
.adv-sub {
  font-size: 12px;
  color: var(--dim);
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
