<template>
  <q-page class="combo-detail">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="backOr(router, '/challenges')">‹</button>
      <div class="top-title font-display">Défi 360</div>
      <button class="iconbtn danger" aria-label="Supprimer" @click="confirmStop">🗑</button>
    </header>

    <div v-if="!c" class="row flex-center q-pa-lg"><q-spinner color="primary" /></div>

    <template v-else>
      <div class="head-card" :class="{ done: c.status === 'done' }">
        <div class="hc-top">
          <span class="hc-pct font-display">{{ fmtPct(pct) }}%</span>
          <span class="hc-days">{{ daysLeftLabel }}</span>
        </div>
        <div class="hc-week">📅 Semaine du {{ comboWeek }}</div>
        <!-- Barre = dégradé unique (bulletproof, pas d'empilement) : vert (actuel) → rose
             (avancement THÉORIQUE = où l'on devrait en être) → piste. Le rose n'apparaît
             que si l'on est en retard (théorique > actuel). Trait 🎯 par-dessus. -->
        <div class="hc-bar" :style="barStyle">
          <!-- ⚠️ Le TRAIT se cache à 100 % (il se confondrait avec le bout de la barre) ;
               la zone ROSE et la ligne « en retard », elles, doivent RESTER le dernier
               jour — c'est là que tout ce qui manque devient du retard. Un seul drapeau
               servait aux trois, et il n'était juste que pour le trait. -->
          <i
            v-if="pace.showMark"
            class="hc-ontime"
            :style="{ left: onTimePct + '%' }"
            :title="`Pour être dans les temps : ${onTimePct}%`"
          />
        </div>
        <div v-if="notStarted" class="not-started">
          <span>📅</span>
          <span
            >Démarre <b>{{ startTxt }}</b></span
          >
          <span class="ns-sub">rien à faire d'ici là</span>
        </div>
        <div v-if="showOnTime" class="hc-pace" :class="onTimeState">
          🎯 Dans les temps : <b>{{ onTimePct }}%</b>
          <span class="hc-pace-tag">{{
            onTimeState === 'ahead' ? '✓ en avance' : `⏳ en retard (tu es à ${fmtPct(pct)}%)`
          }}</span>
        </div>
        <div v-if="c.status === 'done'" class="hc-done">
          {{ completeInTime ? '🎉 Défi 360 bouclé — bravo !' : '⏱ Défi 360 terminé' }}
        </div>
        <!-- Objectif atteint mais défi encore ouvert : on DIT pourquoi il ne se ferme pas,
             sinon « encore en cours à 100 % » se lit comme un oubli. -->
        <div v-else-if="c.status === 'active' && completeInTime" class="hc-done">
          🎉 Objectif atteint ! Les séries bonus comptent jusqu’au {{ endLabel }} — le coffre tombe
          à la fin, ou dès que tout est au maximal.
        </div>
        <ComboChestView v-if="c.chest" :combo-id="c.id" :chest="c.chest" />
        <div v-if="legsAtMax > 0" class="hc-over">
          🔥 {{ legsAtMax }} exo{{ legsAtMax > 1 ? 's' : '' }} au <b>maximal</b> !
          <span class="hc-over-sub">prime de dépassement débloquée</span>
        </div>
      </div>

      <div v-if="c.status === 'active'" class="cta-row q-mb-md">
        <q-btn
          class="cta-grow"
          outline
          color="primary"
          no-caps
          icon="fitness_center"
          label="Générer une séance"
          :to="`/combo/${c.id}/session`"
        />
        <q-btn
          outline
          color="primary"
          no-caps
          icon="ios_share"
          label="Exporter"
          title="Exporter le Défi 360 complet détaillé"
          @click="exportCombo"
        />
      </div>

      <ComboLegFilter v-model="legFilter" :legs="c.legs" />
      <ComboTierLegend v-if="c.legs.some((l) => legMode(l) === 'sets')" />
      <div
        v-for="leg in shownLegs"
        :key="leg.exercise_id"
        class="leg"
        :class="{ ok: legComplete(leg), done: legAllDone(leg) }"
      >
        <!-- Même en-tête que l'onglet 🎯 Défi 360. La vignette d'exécution remplace l'emoji
             du groupe quand l'exo a une illustration. -->
        <ComboLegHead
          :leg="leg"
          :objective="profileStore.profile?.objective"
          :bodyweight="noEquipIds.has(leg.exercise_id)"
          :fallback="slotEmoji(leg.slot)"
          :history="combo.list"
          @history="openHistory(leg)"
        />
        <!-- Mode séries : segments par série ; mode reps : barre de progression simple.
             ⚠️ TOUCHER LA BARRE AJOUTE UNE SÉRIE : les boutons « ＋ 1 série » et « ↩ »
             prenaient une ligne entière par exo. La prochaine case vide porte le « ＋ »,
             et le retrait vit dans la fenêtre de saisie. -->
        <div
          v-if="legMode(leg) === 'sets'"
          class="seg-bar tap"
          role="button"
          tabindex="0"
          :aria-label="`Ajouter une série : ${leg.exercise_name}`"
          @click="openSet(leg, 1)"
          @keydown.enter="openSet(leg, 1)"
        >
          <span
            v-for="n in segCount(leg)"
            :key="n"
            class="seg"
            :class="[
              'tier-' + legSegZone(leg, n),
              { on: n <= legDone(leg), next: n === legDone(leg) + 1 },
            ]"
            :aria-label="n <= legDone(leg) ? `Corriger la série ${n}` : undefined"
            @click.stop="onSeg(leg, n)"
          >
            <template v-if="n <= legDone(leg)">{{ segSetLabel(legSets(leg)[n - 1]) }}</template>
            <template v-else-if="n === legDone(leg) + 1">＋</template>
            <template v-else-if="n > leg.target">+</template>
          </span>
        </div>
        <div
          v-else-if="legMode(leg) === 'reps'"
          class="bar-tap"
          role="button"
          tabindex="0"
          :aria-label="`Ajouter une série : ${leg.exercise_name}`"
          @click="openSet(leg, 1)"
          @keydown.enter="openSet(leg, 1)"
        >
          <div class="reps-bar">
            <span class="reps-bonus" :style="{ left: bar(leg).objPct + '%' }" />
            <span class="reps-fill" :style="{ width: bar(leg).fillPct + '%' }" />
            <span
              class="reps-over"
              :style="{ left: bar(leg).objPct + '%', width: bar(leg).overPct + '%' }"
            />
            <span class="reps-mark" :style="{ left: bar(leg).objPct + '%' }" />
          </div>
          <span class="bar-plus" aria-hidden="true">＋</span>
        </div>
        <div v-else class="reps-bar">
          <!-- Zone BONUS encore possible (de l'objectif au palier maximal) : hachures vertes.
               Équivalent des cases pointillées du mode séries — la marge se voit AVANT d'être
               prise, alors qu'avant la barre était écrêtée à 100 % et ne montrait rien. -->
          <span class="reps-bonus" :style="{ left: bar(leg).objPct + '%' }" />
          <span class="reps-fill" :style="{ width: bar(leg).fillPct + '%' }" />
          <span
            class="reps-over"
            :style="{ left: bar(leg).objPct + '%', width: bar(leg).overPct + '%' }"
          />
          <span class="reps-mark" :style="{ left: bar(leg).objPct + '%' }" />
        </div>
        <!-- Mode DURÉE (gainage) : chrono OU ajout manuel d'une durée (ticket 9ecad885). -->
        <div v-if="legMode(leg) === 'time'" class="leg-actions">
          <button
            class="chrono-cta"
            :class="{ running: isChronoOn(leg) }"
            @click="toggleChrono(leg)"
          >
            <q-icon :name="isChronoOn(leg) ? 'pause' : 'play_arrow'" size="18px" />
            {{ isChronoOn(leg) ? 'Pause' : 'Démarrer' }}
            <span class="cc-time">{{ chronoDisplay(leg) }}</span>
          </button>
          <HoldGameLauncher
            compact
            :exercise-id="leg.exercise_id"
            :target-sec="holdTargetSec(leg)"
            :elapsed-sec="isChronoOn(leg) ? chronoSec : 0"
            :running="isChronoOn(leg)"
            @start="toggleChrono(leg)"
            @stop="toggleChrono(leg)"
          />
          <button class="add corr" :disabled="!legSetsDone(leg)" @click="undoSet(leg)">↩</button>
        </div>
        <!-- Ajout manuel d'une durée sans chrono — caché pendant que ce chrono tourne. -->
        <div v-if="legMode(leg) === 'time' && !isChronoOn(leg)" class="dur-adds">
          <span class="da-lbl">Ajouter :</span>
          <button v-for="s in DUR_QUICK_ADDS" :key="s" class="da-btn" @click="doAddSeconds(leg, s)">
            +{{ fmtDurShort(s) }}
          </button>
        </div>
        <!-- Détail des séries faites (secondes en durée / reps en mode reps). En mode
             séries, le détail est DANS les cellules jaunes → on ne le répète pas ici. -->
        <div v-if="legSets(leg).length && legMode(leg) !== 'sets'" class="leg-sets">
          <span v-for="(s, i) in legSets(leg)" :key="i" class="leg-set-chip">
            <template v-if="legMode(leg) === 'time'">{{ s.reps }} s</template>
            <template v-else
              >{{ s.reps }}<template v-if="s.weight">×{{ s.weight }} kg</template
              ><template v-if="s.assisted"> ·a</template></template
            >
          </span>
        </div>
      </div>

      <div class="foot">
        Fais tes séries quand tu veux dans la semaine. Toutes les séries prévues pour
        <b>tous</b> les exos = Défi 360 bouclé. Chaque série alimente ta piste Muscu (reps + poids).
      </div>

      <!-- ⚠️ MÊME ACTION QUE LE 🗑 DE L'EN-TÊTE, et il le DIT. Ce bouton abandonnait
           TOUJOURS, même un 360 vierge, pendant que le 🗑 le supprimait : deux contrôles,
           deux résultats, sur le même écran. Un 360 créé par erreur finissait donc archivé
           à vie selon le bouton qu'on avait sous les yeux. -->
      <!-- 🏁 CLÔTURER À L'OBJECTIF (v0.964, demandé) — il n'apparaît QUE quand il a un
           sens : objectif atteint et 360 encore ouvert. Avant l'objectif, clôturer ne
           veut rien dire ; après le maximal, il se ferme tout seul. -->
      <button v-if="finishPlan.can" class="finish" @click="confirmFinish">
        🏁 Clôturer mon Défi 360
      </button>
      <button v-if="c.status !== 'abandoned'" class="abandon" @click="confirmStop">
        {{ stopPlan.ok }}
      </button>
    </template>

    <ComboSetHistory v-model="histOpen" :leg="histLeg" />

    <!-- Saisie d'une série (reps + poids + assisté), dialogue partagé -->
    <SetLogDialog
      v-model="setOpen"
      :title="setLeg?.exercise_name ?? ''"
      :desc="
        editIndex !== null
          ? `Série ${editIndex + 1} · corriger`
          : `${setCount > 1 ? setCount + ' séries' : '1 série'} · reps & poids`
      "
      :assistable="setLeg?.assistable"
      :hint="setLeg ? rangeLabel(setLeg) : undefined"
      :initial-reps="setInitReps"
      :initial-weight="setInitWeight"
      :initial-assisted="setInitAssisted"
      :undo-label="undoLabel"
      :save-label="editIndex !== null ? 'Enregistrer' : undefined"
      @save="onSetSave"
      @undo="setLeg && undoSet(setLeg, editIndex ?? undefined)"
    />
  </q-page>
</template>

<script setup lang="ts">
import { startLabel } from '@/lib/startDate';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { backOr } from '@/lib/nav';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useComboStore } from '@/stores/combo';
import { useGameFx } from '@/composables/useGameFx';
import {
  comboProgressPct,
  fmtPct,
  legTierMarks,
  legSegZone,
  legBarGeometry,
  legSetsDone,
  comboStopPlan,
  comboFinishPlan,
  type ComboFinishPlan,
  comboPace,
  NO_PACE,
  type ComboChallenge,
  legDone,
  legComplete,
  legAllDone,
  legsDoneLast,
  legStage,
  legMode,
  legSets,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  legRepRange,
  comboExportText,
  comboBonusXp,
  comboCompleteInTime,
  comboEndDate,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';
import { comboSlot } from '@/data/combo';
import ComboTierLegend from '@/components/ComboTierLegend.vue';
import ComboLegFilter, { type LegFilter } from '@/components/ComboLegFilter.vue';
import ComboChestView from '@/components/ComboChestView.vue';
import ComboSetHistory from '@/components/ComboSetHistory.vue';
import ComboLegHead from '@/components/ComboLegHead.vue';
import {
  logicalToday,
  addDaysIso,
  suggestSetFromHistory,
  isNoEquipmentExercise,
} from '@/lib/challenges';
import SetLogDialog from '@/components/SetLogDialog.vue';
import HoldGameLauncher from '@/components/HoldGameLauncher.vue';
import { recallWeight, rememberWeight } from '@/lib/weightMemory';
import { useLibraryStore } from '@/stores/library';
import { repRangeLabel, prescribedReps } from '@/lib/repScheme';
import { useProfileStore } from '@/stores/profile';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const auth = useAuthStore();
const combo = useComboStore();
const library = useLibraryStore();
const profileStore = useProfileStore();
const gameFx = useGameFx();
// Séries faites d'un exo (toucher l'avancement « 2/12 séries »).
const histOpen = ref(false);
const histLeg = ref<ComboLeg | null>(null);
function openHistory(leg: ComboLeg) {
  histLeg.value = leg;
  histOpen.value = true;
}

const id = String(route.params.id);
const c = computed(() => combo.list.find((x) => x.id === id) ?? null);
const pct = computed(() => (c.value ? comboProgressPct(c.value) : 0));
// Paliers (secondaire / principal / maximal) par exo — repères + motivation.
// Nombre de cases affichées : jusqu'au palier MAXIMAL (et au-delà si déjà dépassé).
// Sans ça, la barre s'arrêtait à l'objectif → rien ne montrait qu'on pouvait aller plus loin.
// Géométrie de la barre continue (reps/durée) → montre la marge de dépassement.
function bar(l: ComboLeg): { objPct: number; fillPct: number; overPct: number } {
  return legBarGeometry(l);
}
function segCount(l: ComboLeg): number {
  return Math.max(legTierMarks(l).max, legDone(l));
}
const legsAtMax = computed(() => c.value?.legs.filter(legAllDone).length ?? 0);
// Ordre d'affichage : ALPHABÉTIQUE, les exos FINIS en bas (`legsDoneLast` — la MÊME règle
// que l'onglet 🎯 ; avant la v0.903 chaque écran triait autrement, et un tri par avancement
// réordonnait la liste PENDANT la saisie). « Fini » = palier MAXIMAL, pas l'objectif.
const orderedLegs = computed(() => legsDoneLast(c.value?.legs ?? []));
// 🔎 Filtre par étape en cours (Secondaire / Objectif / Bonus / Terminés) — ne déplace rien.
const legFilter = ref<LegFilter>('all');
const shownLegs = computed(() =>
  legFilter.value === 'all'
    ? orderedLegs.value
    : orderedLegs.value.filter((l) => legStage(l) === legFilter.value),
);

function fmtDM(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}
// Semaine concernée (début → fin) du Défi 360.
/** Bouclé dans les temps — la seule chose qui dit « bravo » et ouvre un coffre. */
const completeInTime = computed(() => (c.value ? comboCompleteInTime(c.value) : false));
const endLabel = computed(() => (c.value ? fmtDM(comboEndDate(c.value)) : ''));
const comboWeek = computed(() => {
  if (!c.value) return '';
  return `${fmtDM(c.value.start_date)} → ${fmtDM(addDaysIso(c.value.start_date, c.value.duration_days - 1))}`;
});

const daysLeftLabel = computed(() => {
  if (!c.value) return '';
  const end = addDaysIso(c.value.start_date, c.value.duration_days - 1);
  const today = logicalToday();
  if (today > end) return 'semaine terminée';
  // jours restants inclus aujourd'hui
  let n = 0;
  for (let d = 0; d < c.value.duration_days; d++) {
    if (addDaysIso(c.value.start_date, d) >= today) n++;
  }
  return `${n} j restant${n > 1 ? 's' : ''}`;
});

// % THÉORIQUE « dans les temps » : à un rythme régulier, la part que tu devrais avoir faite
// pour finir pile le dernier jour = jours écoulés (aujourd'hui inclus) / durée. Marqueur 🎯
// sur la barre → tu vois d'un coup d'œil si tu es en avance (barre au-delà) ou en retard.
// Un 360 peut être programmé pour plus tard (départ choisi à la création).
const notStarted = computed(() => !!c.value && logicalToday() < c.value.start_date);
const startTxt = computed(() => (c.value ? startLabel(c.value.start_date, logicalToday()) : ''));
/** Où l’on devrait en être — règle et bornes dans la lib, partagées avec l’onglet
 *  🎯 Défi 360 : les deux écrans peignaient la même barre, chacun sa copie. */
const pace = computed(() => (c.value ? comboPace(c.value, logicalToday()) : NO_PACE));
const onTimePct = computed(() => pace.value.onTimePct);
const showOnTime = computed(() => pace.value.showPace);
const onTimeState = computed(() => pace.value.state);

const barStyle = computed(() => {
  // Un seul dégradé (aucun empilement) : vert (fait) → rose (le RETARD) → piste.
  const { donePct: p, latePct, onTimePct } = pace.value;
  const stops =
    latePct > 0
      ? `var(--accent) 0 ${p}%, #ff6a9c ${p}% ${onTimePct}%, var(--surface-2) ${onTimePct}% 100%`
      : `var(--accent) 0 ${p}%, var(--surface-2) ${p}% 100%`;
  return { background: `linear-gradient(to right, ${stops})` };
});

// Fourchette de reps conseillée d’un exo, telle qu’elle a été figée à la création du
// défi. L’objectif du profil ne sert que de repli pour les 360 créés avant qu’elle existe.
function legRange(leg: ComboLeg) {
  return legRepRange(leg, profileStore.profile?.objective);
}
function rangeLabel(leg: ComboLeg): string {
  return repRangeLabel(legRange(leg), legMode(leg) === 'time');
}

function slotEmoji(key: string) {
  return comboSlot(key)?.emoji ?? '💪';
}
// Détail d'une série affiché DANS sa cellule jaune : « 12×15kg » (ou « 12 » au poids
// du corps, « 12·a » si assisté). Vide si la série n'existe pas (cellule à faire).
/** Libellé du retrait dans la fenêtre de saisie : dit QUELLE série part (« 12×20kg »),
 *  absent s'il n'y a rien à retirer. En correction, c’est la série ouverte qui part. */
const undoLabel = computed(() => {
  if (editIndex.value !== null) return '🗑 Retirer';
  const sets = setLeg.value ? legSets(setLeg.value) : [];
  const last = sets[sets.length - 1];
  return last ? `↩ Retirer la dernière (${segSetLabel(last)})` : undefined;
});

function segSetLabel(s: ComboSet | undefined): string {
  if (!s) return '';
  const base = s.weight ? `${s.reps}×${s.weight}kg` : `${s.reps}`;
  return s.assisted ? `${base}·a` : base;
}

// Saisie d'une série via le dialogue partagé, préremplie avec la dernière série.
const setOpen = ref(false);
const setLeg = ref<ComboLeg | null>(null);
const setCount = ref(1);
const setInitReps = ref(10);
const setInitWeight = ref<number | null>(null);
const setInitAssisted = ref(false);
/** Série en cours de CORRECTION (index), ou null quand on en ajoute une. */
const editIndex = ref<number | null>(null);
/** Case FAITE touchée : la fenêtre s’ouvre sur CETTE série, préremplie, pour la corriger
 *  ou la retirer (avant, on ne pouvait que la retirer). */
function openEdit(leg: ComboLeg, index: number) {
  const s = legSets(leg)[index];
  if (!s) return;
  setLeg.value = leg;
  setCount.value = 1;
  editIndex.value = index;
  setInitReps.value = s.reps;
  setInitWeight.value = s.weight ?? null;
  setInitAssisted.value = !!s.assisted;
  setOpen.value = true;
}
function openSet(leg: ComboLeg, count: number) {
  setLeg.value = leg;
  setCount.value = count;
  editIndex.value = null;
  const last = legSets(leg);
  if (last.length) {
    setInitReps.value = legLastReps(leg);
    setInitWeight.value = legLastWeight(leg) ?? recallWeight(leg.exercise_id);
    setInitAssisted.value = legLastAssisted(leg);
  } else {
    // Aucune série encore sur cet exo dans ce 360 → poids mémorisé pour cet exo (toutes
    // activités, ticket efa49f4f), sinon conseil dérivé de l'historique (ticket 5f5bad0f).
    const hist = combo.list
      .flatMap((cc) => cc.legs)
      .filter((l) => l.exercise_id === leg.exercise_id)
      .flatMap((l) => legSets(l));
    const sug = suggestSetFromHistory(hist);
    setInitReps.value = sug?.repMax ?? legLastReps(leg, prescribedReps(legRange(leg)));
    setInitWeight.value = recallWeight(leg.exercise_id) ?? sug?.weight ?? legLastWeight(leg);
    setInitAssisted.value = false;
  }
  setOpen.value = true;
}
/** L'objectif vient d'être atteint dans les temps : on célèbre TOUT DE SUITE, mais le
 *  défi reste ouvert pour les séries bonus et le coffre tombera à la fermeture. */
function celebrateObjective(co: ComboChallenge) {
  gameFx.celebrate({
    kind: 'generic',
    emoji: '🎯',
    title: 'Objectif du Défi 360 atteint !',
    subtitle: `Prime +${comboBonusXp(co)} ⚡ — continue jusqu’au maximal, le coffre tombe à la fin`,
    rarity: 'divin',
  });
}
function onSetSave(v: { reps: number; weight: number | null; assisted: boolean }) {
  const leg = setLeg.value;
  if (!auth.user?.id || !c.value || !leg) return;
  rememberWeight(leg.exercise_id, v.weight); // mémorise le poids pour cet exo (ticket efa49f4f)
  const before = comboCompleteInTime(c.value);
  if (editIndex.value !== null) {
    combo.updateSet(id, leg.exercise_id, editIndex.value, v.reps, v.weight, v.assisted);
  } else {
    for (let i = 0; i < setCount.value; i++) {
      combo.addSet(id, leg.exercise_id, logicalToday(), v.reps, v.weight, v.assisted);
    }
  }
  if (!before && comboCompleteInTime(c.value)) celebrateObjective(c.value);
}
// Ajouts rapides de durée (gainage) sans chrono (ticket 9ecad885).
const DUR_QUICK_ADDS = [15, 30, 60] as const;
function fmtDurShort(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`;
}
// Mode DURÉE (gainage) : ajoute directement une « série » de N secondes (stockées dans
// le champ reps ; pas de poids) → pas de dialogue reps+poids inadapté au gainage.
function doAddSeconds(leg: ComboLeg, sec: number) {
  if (!auth.user?.id || !c.value) return;
  const before = comboCompleteInTime(c.value);
  combo.addSet(id, leg.exercise_id, logicalToday(), sec, null, false);
  if (!before && comboCompleteInTime(c.value)) celebrateObjective(c.value);
}
/** Retire UNE série (par défaut la dernière) — celle dont on a touché la case.
 *  La confirmation dit laquelle (numéro + contenu) : un tap raté ne coûte rien. */
function undoSet(leg: ComboLeg, index = legSets(leg).length - 1) {
  const s = legSets(leg)[index];
  if (!s) return;
  $q.dialog({
    title: `Retirer la série ${index + 1} ?`,
    message: `« ${leg.exercise_name} » — ${segSetLabel(s)}`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Retirer', color: 'negative' },
  }).onOk(() => combo.removeSet(id, leg.exercise_id, index));
}
/** Case de série touchée : une case FAITE s’ouvre pour être corrigée ou retirée, une case
 *  vide ajoute une série. */
function onSeg(leg: ComboLeg, n: number) {
  if (n <= legSetsDone(leg)) openEdit(leg, n - 1);
  else openSet(leg, 1);
}

// Exporte : partage natif (mobile) si dispo, sinon copie dans le presse-papier.
// Le texte détaillé est construit par la lib partagée (même rendu sur les 2 écrans).
async function exportCombo() {
  if (!c.value) return;
  const text = comboExportText(c.value, logicalToday());
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Défi 360', text });
    } catch {
      /* partage annulé */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    $q.notify({ type: 'positive', message: 'Défi 360 copié dans le presse-papier.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Copie impossible sur cet appareil.' });
  }
}

// ── Chrono des exos de DURÉE (gainage) — comme dans les challenges ──
// Démarrer → décompte (mm:ss) ; Pause → enregistre une SÉRIE de N secondes et remet à 0.
// Un seul chrono actif à la fois (démarrer un autre exo enregistre d'abord le décompte courant).
const chronoLegKey = ref<string | null>(null);
const chronoSec = ref(0);
const chronoRunning = ref(false);
let chronoTick: ReturnType<typeof setInterval> | undefined;
// 🎮 La durée d'une série de gainage (haut de la fourchette) cale la difficulté du jeu.
function holdTargetSec(leg: ComboLeg): number {
  return Math.max(30, legRepRange(leg, profileStore.profile?.objective).max);
}
function isChronoOn(leg: ComboLeg): boolean {
  return chronoRunning.value && chronoLegKey.value === leg.exercise_id;
}
function chronoDisplay(leg: ComboLeg): string {
  const s = chronoLegKey.value === leg.exercise_id ? chronoSec.value : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function logChrono(legKey: string) {
  clearInterval(chronoTick);
  chronoTick = undefined;
  chronoRunning.value = false;
  const leg = c.value?.legs.find((l) => l.exercise_id === legKey);
  if (leg && chronoSec.value > 0) doAddSeconds(leg, chronoSec.value);
  chronoSec.value = 0;
  chronoLegKey.value = null;
}
function toggleChrono(leg: ComboLeg) {
  if (isChronoOn(leg)) {
    logChrono(leg.exercise_id); // Pause → enregistre la série
    return;
  }
  // Démarrer : enregistre d'abord un décompte laissé en cours sur un AUTRE exo.
  if (chronoLegKey.value && chronoLegKey.value !== leg.exercise_id) logChrono(chronoLegKey.value);
  chronoLegKey.value = leg.exercise_id;
  chronoSec.value = 0;
  chronoRunning.value = true;
  chronoTick = setInterval(() => (chronoSec.value += 1), 1000);
}
onBeforeUnmount(() => {
  if (chronoLegKey.value) logChrono(chronoLegKey.value);
  else clearInterval(chronoTick);
});
/** Ce qu’arrêter ce 360 fera — la règle ET ses mots viennent de la lib, pour que les
 *  deux contrôles de cette page et l’onglet 🎯 Défi 360 ne puissent pas se contredire. */
const stopPlan = computed(() =>
  comboStopPlan(c.value ?? ({ legs: [] } as unknown as ComboChallenge)),
);
/** Ce qu'une clôture manuelle ferait — la règle vit en lib, les deux écrans la lisent. */
const finishPlan = computed(() =>
  comboFinishPlan(
    c.value ?? ({ legs: [], status: 'done' } as unknown as ComboChallenge),
    logicalToday(),
  ),
);
/** 🏁 La confirmation de clôture : elle DIT ce qu'on laisse (les paliers maximaux
 *  encore atteignables, les jours restants) et ce qu'on gagne (la place pour un
 *  nouveau 360). Sans ça, « Clôturer » ressemble à un raccourci alors que c'est un
 *  arbitrage : une série au-delà de l'objectif vaut autant qu'une série normale. */
function finishMessage(plan: ComboFinishPlan): string {
  const reste = plan.bonusLeft
    ? `${plan.bonusLeft} exo${plan.bonusLeft > 1 ? 's' : ''} ${plan.bonusLeft > 1 ? 'peuvent' : 'peut'} encore monter jusqu'au palier maximal`
    : 'tous tes exos sont déjà au palier maximal';
  const jours = plan.daysLeft
    ? `, et il te reste ${plan.daysLeft} jour${plan.daysLeft > 1 ? 's' : ''}`
    : ', et c’est ton dernier jour';
  return `Ton objectif est atteint : ${reste}${jours}. Clôturer fige ta prime et ton coffre à ce qui est fait — mais tu pourras lancer un nouveau Défi 360 tout de suite.`;
}
function confirmFinish() {
  $q.dialog({
    title: 'Clôturer maintenant ?',
    message: finishMessage(finishPlan.value),
    cancel: { label: 'Continuer le défi', flat: true },
    ok: { label: 'Clôturer', color: 'primary' },
  }).onOk(() => {
    void combo.finish(id);
  });
}
function confirmStop() {
  const plan = stopPlan.value;
  $q.dialog({
    title: plan.title,
    message: plan.message,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: plan.ok, color: 'negative' },
  }).onOk(() => {
    void (plan.kind === 'abandon' ? combo.setStatus(id, 'abandoned') : combo.remove(id)).then(() =>
      backOr(router, '/challenges'),
    );
  });
}

// Exos SANS AUCUN matériel (poids du corps pur : pompes, gainage…) → liseré distinct.
const noEquipIds = ref<Set<string>>(new Set());
async function loadEquip() {
  const ids = [...new Set((c.value?.legs ?? []).map((l) => l.exercise_id))];
  if (!ids.length) return;
  const rows = await library.fetchByIds(ids).catch(() => []);
  noEquipIds.value = new Set(
    rows.filter((r) => isNoEquipmentExercise(r.equipment_required, r.tags)).map((r) => r.id),
  );
}
onMounted(async () => {
  if (!combo.loaded) await combo.fetchMine().catch(() => undefined);
  await loadEquip();
});
</script>

<style scoped lang="scss">
/* Défi pas encore commencé : sans ça, il ressemble à un défi en panne (0 %, rien à
   faire, aucune explication). */
.not-started {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  font-size: 13px;
}
.ns-sub {
  margin-left: auto;
  color: var(--dim);
  font-size: 12px;
}

.combo-detail {
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
  font-size: 26px;
  cursor: pointer;
  width: 32px;
}
.iconbtn.danger {
  font-size: 18px;
}
.top-title {
  flex: 1;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
}
.head-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
}
.head-card.done {
  border-color: var(--accent);
}
.hc-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.hc-pct {
  font-size: 30px;
  font-weight: 800;
  color: var(--accent);
}
.hc-days {
  font-size: 12.5px;
  color: var(--dim);
}
.hc-week {
  font-size: 12.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  margin: 2px 0 8px;
}
.hc-bar {
  position: relative;
  height: 10px;
  background: var(--surface-2);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
}
/* Graduation tous les 5 % (segmente la barre pour lire la position d'un coup d'œil). */
.hc-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to right,
    transparent 0,
    transparent calc(5% - 1.5px),
    rgba(0, 0, 0, 0.32) calc(5% - 1.5px),
    rgba(0, 0, 0, 0.32) 5%
  );
}
/* Repère « dans les temps » : trait vertical à la position théorique attendue. */
.hc-ontime {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 2;
}
.hc-pace {
  margin-top: 6px;
  font-size: 12px;
  color: var(--dim);
}
.hc-pace b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.hc-pace-tag {
  margin-left: 6px;
  font-weight: 700;
}
.hc-pace.ahead .hc-pace-tag {
  color: var(--d1);
}
.hc-pace.behind .hc-pace-tag {
  color: var(--d3);
}
.hc-done {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}
.hc-over {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--d1);
}
.hc-over-sub {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--dim);
  margin-top: 1px;
}
/* Ligne d'actions : « Générer une séance » (extensible) + « Exporter ». */
.cta-row {
  display: flex;
  gap: 8px;
}
.cta-grow {
  flex: 1;
  min-width: 0;
}
.leg {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 9px 12px;
  margin-bottom: 8px;
}
.leg.ok {
  border-color: var(--d1);
}
/* ✅ Exo FINI (palier maximal franchi) : il descend en bas de liste (`legsDoneLast`) et se
   grise — plus rien à y gagner. Déclaré APRÈS `.ok` : un exo au maximal est aussi complet,
   donc le vert « objectif atteint » ne doit pas continuer de l'appeler.
   ⚠️ L'opacité ne descend pas plus bas : ça reste du travail accompli, qu'on doit pouvoir
   relire (l'historique des séries s'ouvre toujours). Et la CARTE seule est atténuée, pas ses
   boutons en `pointer-events` : on peut encore corriger une série saisie par erreur. */
.leg.done {
  border-color: var(--line-soft);
  background: var(--surface-2);
  opacity: 0.62;
}
.bar {
  height: 8px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
  margin: 9px 0;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}
/* Grille de cellules UNIFORMES (mêmes dimensions pour faites/à faire) qui se
   répartissent proprement sur plusieurs lignes ; chaque colonne accueille « 12×15kg ». */
.tap,
.bar-tap {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
/* Mode reps : la barre + un « ＋ » sur la même ligne, toute la hauteur tactile. */
.bar-tap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}
.bar-tap .reps-bar {
  flex: 1;
  margin: 0;
}
.bar-plus {
  flex: none;
  width: 28px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-weight: 800;
}
/* La prochaine case à faire porte le « ＋ » : c'est là qu'on touche pour ajouter. */
.seg.next {
  color: var(--text);
  font-weight: 800;
  font-size: 14px;
}
.seg-bar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 4px;
  margin: 7px 0 0;
}
/* Mode reps : barre de progression continue (l'objectif en reps peut être élevé). */
.reps-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
  margin: 9px 0;
  position: relative; /* les repères de dépassement sont positionnés dessus */
}
/* Repères de dépassement de la barre continue (reps / durée). */
.reps-bonus {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--d1) 26%, transparent) 0 3px,
    transparent 3px 6px
  );
}
/* Part réalisée AU-DELÀ de l'objectif → vert plein, comme les cases bonus des séries. */
.reps-over {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--d1);
}
/* Trait de l'objectif : on voit où finit la cible et où commence le bonus. */
.reps-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--text);
  opacity: 0.5;
}

.reps-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}
/* Cellules « série » : chaque cellule faite (jaune) affiche son détail « 12×15kg ».
   Elles s'élargissent selon le contenu et passent à la ligne ; les cases à faire
   restent des repères vides. */
.seg {
  min-height: 24px;
  padding: 3px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
}
/* PALIERS PAR COULEUR (remplace les pastilles Sec./Principal/Max, cf. ComboTierLegend) :
   la case dit quel palier elle fait avancer. Faite = pleine, à faire = liseré de la même teinte. */
.seg.tier-secondary {
  border-color: color-mix(in srgb, var(--tier-sec) 55%, var(--line));
}
.seg.tier-principal {
  border-color: color-mix(in srgb, var(--accent) 70%, var(--line));
}
.seg.tier-max,
.seg.tier-beyond {
  background: transparent;
  border-style: dashed;
  border-color: color-mix(in srgb, var(--d1) 55%, var(--line));
  color: color-mix(in srgb, var(--d1) 75%, var(--dim));
}
.seg.on.tier-secondary {
  background: var(--tier-sec);
  border-color: var(--tier-sec);
  color: var(--tier-sec-ink);
}
.seg.on.tier-principal {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.seg.on.tier-max,
.seg.on.tier-beyond {
  background: var(--d1);
  border-style: solid;
  border-color: var(--d1);
  color: #10231a;
}
.leg-actions {
  display: flex;
  gap: 6px;
}
/* Ajout manuel de durée (gainage) sans chrono — pastilles compactes. */
.dur-adds {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.da-lbl {
  font-size: 11px;
  color: var(--dim);
}
.da-btn {
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.da-btn:active {
  background: var(--accent);
  color: var(--accent-ink);
}
/* Chrono des exos de durée (gainage) — cohérent avec le chrono des challenges. */
.chrono-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 6px;
  padding: 11px 0;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
}
.chrono-cta.running {
  background: var(--accent);
  color: var(--bg);
}
.chrono-cta .cc-time {
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
  opacity: 0.9;
}
/* Détail des séries faites : petites puces reps×poids sous les boutons. */
.leg-sets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.leg-set-chip {
  font-size: 11px;
  color: var(--dim);
  background: var(--surface-2);
  border-radius: 6px;
  padding: 1px 6px;
  font-variant-numeric: tabular-nums;
}
.add {
  flex: 1;
  padding: 9px 0;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.add.neg {
  border-color: var(--d4);
  color: var(--d4);
}
.add.corr {
  flex: none;
  width: 48px;
  border-color: var(--d4);
  color: var(--d4);
  font-size: 16px;
}
.add.corr:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.add.chal {
  flex: 1 1 100%;
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.foot {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.5;
  margin: 14px 0;
}
/* 🏁 LA CLÔTURE EST UNE ACTION POSITIVE — l'accent, là où l'abandon juste en dessous
   reste gris : deux boutons de même teinte se liraient comme le même geste, et l'un
   des deux est destructeur. Cible tactile 44 px (règle mobile du projet). */
.finish {
  width: 100%;
  min-height: 44px;
  margin-bottom: 8px;
  padding: 10px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  border-radius: 10px;
  color: var(--accent);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.abandon {
  width: 100%;
  padding: 10px;
  background: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--dim);
  cursor: pointer;
}
</style>
