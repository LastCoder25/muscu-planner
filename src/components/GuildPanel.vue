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
        <div v-for="a in roster" :key="a.id" class="adv" :class="{ busy: !isFree(a) }">
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
            v-if="canPromoteOne(a) && !trainOf(a)"
            class="adv-promo"
            :disabled="busy"
            @click="openPromo(a)"
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
        ensuite.
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
          <span class="gc-w">{{ shape(c) }}</span>
          <span class="gc-rar">{{ RARITY_LABEL[classRarity(c)] }}</span>
        </button>
      </div>
      <div class="g-actions">
        <q-btn flat no-caps label="Plus tard" @click="promoOpen = false" />
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
  canPromote,
  classChoices,
  classRarity,
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
