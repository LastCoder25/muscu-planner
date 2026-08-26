<template>
  <q-page class="cn-page">
    <header class="top">
      <button class="iconbtn" aria-label="Retour" @click="prev">‹</button>
      <div class="top-mid">
        <div class="top-title font-display">Nouveau challenge</div>
        <div class="top-step">
          Étape {{ step }}/{{ STEP_TITLES.length }} · {{ STEP_TITLES[step - 1] }}
        </div>
      </div>
      <div class="top-spacer" />
    </header>

    <div class="progress">
      <div class="progress-fill" :style="{ width: (step / STEP_TITLES.length) * 100 + '%' }" />
    </div>

    <div class="scroll">
      <!-- ÉTAPE 1 · Exercice -->
      <template v-if="step === 1">
        <div class="step-h">Choisis un exercice</div>
        <div class="cap-card">
          <div class="cap-row">
            <span class="cap-lane">💪 Muscu</span>
            <span class="pips">
              <span
                v-for="n in CHALLENGE_TOKEN_BUDGET"
                :key="n"
                class="pip"
                :class="{ on: n <= muscuUsed }"
              />
            </span>
            <span class="cap-acc" :class="{ used: muscuAccUsed }"
              >+1 accessoire {{ muscuAccUsed ? '✓' : '' }}</span
            >
          </div>
          <div class="cap-row">
            <span class="cap-lane">🏃 Cardio</span>
            <span class="pips">
              <span
                v-for="n in CHALLENGE_TOKEN_BUDGET"
                :key="n"
                class="pip"
                :class="{ on: n <= cardioUsed }"
              />
            </span>
          </div>
          <div class="cap-hint">
            Un défi occupe 1 à 3 places selon sa durée. Les petits exos (mollets, abdos, bras) ne
            comptent pas — 1 « accessoire » gratuit en plus.
          </div>
        </div>
        <div class="ex-filter">
          <button class="exf" :class="{ on: exFilter === 'all' }" @click="exFilter = 'all'">
            Tous
          </button>
          <button class="exf" :class="{ on: exFilter === 'muscu' }" @click="exFilter = 'muscu'">
            💪 Muscu
          </button>
          <button class="exf" :class="{ on: exFilter === 'cardio' }" @click="exFilter = 'cardio'">
            🏃 Cardio
          </button>
        </div>
        <q-input
          v-model="search"
          filled
          dense
          placeholder="Rechercher (nom ou muscle : triceps, dos…)"
          class="q-mb-sm"
          clearable
        />
        <div v-if="loadingLib" class="row flex-center q-pa-md"><q-spinner color="primary" /></div>
        <div v-else-if="!filteredLib.length" class="ex-empty">
          <template v-if="search">Aucun exercice ne correspond à ta recherche.</template>
          <template v-else
            >Plus d'exercice disponible : tes voies sont pleines ou déjà prises. Termine un défi en
            cours pour en lancer un nouveau.</template
          >
        </div>
        <div v-else class="ex-list">
          <button
            v-for="e in filteredLib"
            :key="e.id"
            type="button"
            class="ex-row"
            :class="{
              sel: exercise?.id === e.id,
              bw: isNoEquipmentExercise(e.equipment_required, e.tags),
            }"
            @click="pickExercise(e)"
          >
            <q-icon v-if="favSet.has(e.id)" name="star" size="16px" color="primary" class="fav" />
            <q-icon
              v-else-if="sugIndex.has(e.id)"
              name="local_fire_department"
              size="15px"
              color="primary"
              class="fav"
            />
            <div class="ex-main">
              <div class="ex-name">
                {{ e.name }}
                <span v-if="isNoEquipmentExercise(e.equipment_required, e.tags)" class="bw-badge"
                  >🤸 Poids du corps</span
                >
              </div>
              <div class="ex-meta">
                {{ e.muscle_primary }} · {{ e.unit === 'time' ? 'temps' : 'reps' }}
              </div>
            </div>
            <q-icon v-if="exercise?.id === e.id" name="check_circle" color="primary" size="20px" />
          </button>
        </div>

        <!-- Exécution + descriptif de l'exo sélectionné -->
        <div v-if="exercise" ref="detailEl" class="ex-detail">
          <div class="exd-head">
            <ExerciseAnim
              v-if="exoAnim"
              :exercise-id="exercise.id"
              :size="72"
              :title="exercise.name"
              class="exd-img"
            />
            <img v-else-if="exoImg" :src="exoImg" :alt="exercise.name" class="exd-img" />
            <div>
              <div class="exd-name font-display">{{ exercise.name }}</div>
              <div class="exd-meta">
                {{ exercise.muscle_primary }} ·
                {{
                  unit === 'distance' ? 'distance (km)' : unit === 'time' ? 'temps' : 'répétitions'
                }}
              </div>
            </div>
          </div>

          <!-- Le choix d'unité (km/durée pour le cardio, reps/durée pour les rythmiques) est
               regroupé à l'étape suivante, avec le mode de comptage Reps/Séries. -->
          <template v-if="guide">
            <div class="exd-sec">Exécution</div>
            <ol class="exd-steps">
              <li v-for="(s, i) in guide.steps" :key="i">{{ s }}</li>
            </ol>
            <div v-if="guide.tip" class="exd-tip">💡 {{ guide.tip }}</div>
          </template>
          <div v-else class="exd-none">Pas de descriptif pour cet exercice.</div>
          <a class="exd-demo" :href="demoUrl" target="_blank" rel="noopener">
            <q-icon name="smart_display" size="18px" /> Voir une démo vidéo
          </a>
        </div>
      </template>

      <!-- ÉTAPE 2 · Format -->
      <template v-else-if="step === 2">
        <!-- Choix d'UNITÉ de l'objectif, regroupé avec le comptage (déplacé depuis l'étape
             Exercice). Cardio : km / durée. Exo rythmique (corde, burpees…) : reps / durée. -->
        <div v-if="isCardio" class="count-toggle">
          <button :class="{ on: cardioUnit === 'distance' }" @click="cardioUnit = 'distance'">
            📏 km
          </button>
          <button :class="{ on: cardioUnit === 'time' }" @click="cardioUnit = 'time'">
            ⏱️ Durée
          </button>
        </div>
        <!-- UN seul choix d'objectif : Reps / Séries / Durée (ticket fa27e9a8). « Durée »
             n'apparaît que pour les exos rythmiques (corde, burpees…) ; le gainage (planche)
             est en durée d'office (aucun toggle) et le cardio a son km/durée au-dessus. -->
        <div v-else-if="isDual || unit === 'reps'" class="count-toggle">
          <button :class="{ on: objMode === 'reps' }" @click="setObjMode('reps')">🔢 Reps</button>
          <button :class="{ on: objMode === 'sets' }" @click="setObjMode('sets')">📚 Séries</button>
          <button v-if="isDual" :class="{ on: objMode === 'time' }" @click="setObjMode('time')">
            ⏱️ Durée
          </button>
        </div>
        <div v-if="objMode === 'sets'" class="count-note">
          Objectif en <b>séries</b> ; à la saisie tu renseignes reps + poids par série (comme le
          Défi 360). Le <b>nombre de séries</b> suit la courbe du format choisi.
        </div>
        <div class="step-h">Quel format ?</div>
        <div class="fmt-grid">
          <button
            v-for="f in availableFormats"
            :key="f.id"
            class="fmt"
            :class="{ sel: format === f.id }"
            @click="selectFormat(f.id)"
          >
            <q-icon :name="f.icon" size="22px" />
            <div class="fmt-name">{{ f.name }}</div>
            <div class="fmt-desc">{{ f.desc }}</div>
          </button>
        </div>
      </template>

      <!-- ÉTAPE 3 · Durée -->
      <template v-else-if="step === 3">
        <div class="step-h">Sur combien de temps ?</div>
        <div class="dur-grid">
          <button
            v-for="d in DURATIONS"
            :key="d"
            class="choice"
            :class="{ active: !customOn && durationDays === d }"
            :disabled="!presetFits(d)"
            @click="setPresetDuration(d)"
          >
            {{ durationLabel(d) }}
            <span v-if="d === 30" class="reco">conseillé</span>
          </button>
          <button class="choice" :class="{ active: customOn }" @click="enableCustom">Perso</button>
        </div>
        <div class="tok-note" :class="{ warn: !candidateFits }">
          <template v-if="selAccessory">
            ✨ Exercice accessoire (exo d'appoint) : ne prend pas de place ({{ laneLabel }}, 1 à la
            fois) et se lance sur <b>1 semaine</b>.
          </template>
          <template v-else-if="candidateFits">
            Ce défi occupe <b>{{ candidateCost }}</b> place{{ candidateCost > 1 ? 's' : '' }} en
            {{ laneLabel }} — il t'en restera {{ laneRemaining - candidateCost }} après.
          </template>
          <template v-else>
            ⚠️ Pas assez de place en {{ laneLabel }} ({{ laneRemaining }} restante{{
              laneRemaining > 1 ? 's' : ''
            }}, ce défi en demande {{ candidateCost }}). Choisis une durée plus courte ou termine un
            défi en cours.
          </template>
        </div>
        <div class="dur-note">
          ~30 jours = idéal pour ancrer une habitude sans forcer. Plus court pour tester, plus long
          pour les confirmés.
        </div>
        <div v-if="customOn" class="custom-dur">
          <q-input
            v-model.number="customDays"
            type="number"
            inputmode="numeric"
            :min="3"
            :max="365"
            filled
            dense
            style="max-width: 120px"
            @update:model-value="applyCustom"
          />
          <span class="lbl" style="margin: 0">jours (3–365)</span>
        </div>
      </template>

      <!-- ÉTAPE 4 · Réglages -->
      <template v-else-if="step === 4">
        <div class="step-h">Difficulté & options</div>

        <!-- Format de la durée (gainage/exo au temps) : saisie en secondes ou m:ss. -->
        <div v-if="isGainageTime" class="row items-center q-mb-md" style="gap: 10px">
          <span class="lbl" style="margin: 0">Saisir la durée en</span>
          <q-btn-toggle
            v-model="timeDisplay"
            no-caps
            dense
            unelevated
            :options="[
              { label: 'secondes', value: 'sec' },
              { label: 'min:sec', value: 'mmss' },
            ]"
            color="grey-9"
            text-color="grey-5"
            toggle-color="primary"
            toggle-text-color="dark"
          />
        </div>

        <div class="auto-card">
          <div class="row items-center" style="gap: 10px">
            <q-toggle v-model="adaptiveMode" />
            <span class="lbl" style="margin: 0">Difficulté automatique</span>
          </div>
          <div class="carry-note">
            On part d'une estimation pour ton niveau ({{ levelLabel }}) et les objectifs des jours
            restants s'ajustent tout seuls selon tes résultats. Laisse décoché pour des objectifs
            fixes que tu règles toi-même.
          </div>
        </div>

        <!-- Objectif de départ (le « min ») réglable même en mode auto. -->
        <template v-if="adaptiveMode">
          <div class="lbl">
            {{ format === 'cumulative' ? 'Objectif total' : 'Objectif de départ' }} ({{
              unitLabel
            }})
          </div>
          <q-input
            v-if="showMmss"
            :model-value="secToMmss(cfgDisplay(format === 'cumulative' ? 'total' : 'start'))"
            mask="##:##"
            fill-mask="0"
            filled
            dense
            suffix="m:ss"
            class="q-mb-md"
            @update:model-value="
              setField(format === 'cumulative' ? 'total' : 'start', mmssToSec($event))
            "
          />
          <q-input
            v-else
            :model-value="cfgDisplay(format === 'cumulative' ? 'total' : 'start')"
            type="number"
            inputmode="numeric"
            filled
            dense
            :suffix="unitLabel"
            class="q-mb-md"
            @update:model-value="setField(format === 'cumulative' ? 'total' : 'start', $event)"
          />
        </template>

        <template v-if="!adaptiveMode">
          <div class="lbl">Difficulté ({{ levelLabel }})</div>
          <div class="cfg-grid q-mb-md">
            <template v-for="field in fields" :key="field">
              <div class="cfg-cell">
                <div class="cfg-lbl">{{ fieldLabel(field) }}</div>
                <div v-if="stepBounds[field]" class="stepper">
                  <button
                    class="st-btn"
                    aria-label="Diminuer"
                    @click="stepField(field, -stepBounds[field].step)"
                  >
                    −
                  </button>
                  <span class="st-val">{{ cfgDisplay(field) }} %</span>
                  <button
                    class="st-btn"
                    aria-label="Augmenter"
                    @click="stepField(field, stepBounds[field].step)"
                  >
                    +
                  </button>
                </div>
                <q-input
                  v-else-if="showMmss && isTimeValueField(field)"
                  :model-value="secToMmss(cfgDisplay(field))"
                  mask="##:##"
                  fill-mask="0"
                  filled
                  dense
                  suffix="m:ss"
                  @update:model-value="setField(field, mmssToSec($event))"
                />
                <q-input
                  v-else
                  :model-value="cfgDisplay(field)"
                  type="number"
                  filled
                  dense
                  :suffix="fieldUnit(field)"
                  @update:model-value="setField(field, $event)"
                />
              </div>
            </template>
          </div>
        </template>

        <div class="lbl">Jours de repos (optionnel)</div>
        <div class="days q-mb-xs">
          <button
            v-for="w in WEEKDAYS"
            :key="w.value"
            class="choice small"
            :class="{ active: restDays.includes(w.value) }"
            @click="toggleRest(w.value)"
          >
            {{ w.label }}
          </button>
        </div>
        <div v-if="durationDays >= 30 && restDays.length === 0" class="rest-reco">
          💡 Défi long : garder <b>1 jour de repos/semaine</b> aide à tenir sans se blesser.
          <button class="rest-add" @click="toggleRest(0)">Ajouter dimanche</button>
        </div>

        <div class="row items-center q-mb-md" style="gap: 10px">
          <q-toggle v-model="reminderOn" />
          <span class="lbl" style="margin: 0">Rappel quotidien</span>
          <q-input
            v-if="reminderOn"
            v-model="reminderTime"
            type="time"
            filled
            dense
            style="max-width: 130px"
          />
        </div>

        <div v-if="showAssist" class="assist q-mb-md">
          <div class="row items-center" style="gap: 10px">
            <q-toggle v-model="assistedMode" />
            <span class="lbl" style="margin: 0">Assisté (élastique / machine)</span>
          </div>
          <div class="assist-note">
            Pour un exo au poids du corps fait en assisté, chaque rep vaut moins (×0,6). Le refaire
            en strict rapportera plus → ta progression.
          </div>
        </div>

        <div v-if="format !== 'cumulative'" class="carry q-mb-md">
          <div class="row items-center" style="gap: 10px">
            <q-toggle v-model="carryOver" />
            <span class="lbl" style="margin: 0">Report réserve / dette</span>
          </div>
          <div class="carry-note">
            Si tu fais plus ou moins que l’objectif un jour, l’écart est reporté : ton avance allège
            les jours suivants, ton retard s’y ajoute.
          </div>
        </div>
      </template>

      <!-- ÉTAPE 5 · Récap -->
      <template v-else>
        <div class="step-h">Récapitulatif</div>
        <div class="recap">
          <div class="recap-row">
            <span>Exercice</span><b>{{ exercise?.name }}</b>
          </div>
          <div class="recap-row">
            <span>Format</span><b>{{ formatOption(format)?.name }}</b>
          </div>
          <div class="recap-row">
            <span>Durée</span><b>{{ durationDays }} jours</b>
          </div>
          <div class="recap-row" v-if="restDays.length">
            <span>Repos</span><b>{{ restDays.length }} j/sem</b>
          </div>
          <div class="recap-row" v-if="reminderOn">
            <span>Rappel</span><b>{{ reminderTime }}</b>
          </div>
          <div class="recap-row" v-if="carryOver && format !== 'cumulative'">
            <span>Report</span><b>activé</b>
          </div>
        </div>

        <div class="preview">
          <div class="prev-h">Aperçu ({{ unitLabel }})</div>
          <div class="prev-bars">
            <div
              v-for="(t, i) in previewTargets"
              :key="i"
              class="prev-bar"
              :style="{ height: barH(t) + '%' }"
              :title="`J${i + 1} : ${t}`"
            />
          </div>
          <div class="prev-sub">
            <template v-if="format === 'cumulative'"
              >Total : <b>{{ config.total }}</b> {{ unitLabel }} en {{ durationDays }} j</template
            >
            <template v-else
              >{{ activeDaysCount }} jours actifs · total ~<b>{{ totalPlanned }}</b>
              {{ unitLabel }}</template
            >
          </div>
        </div>
      </template>
    </div>

    <div class="cta-wrap">
      <button v-if="step < STEP_TITLES.length" class="cta" :disabled="!canNext" @click="next">
        Suivant
      </button>
      <button v-else class="cta" :disabled="creating" @click="createChallenge">
        {{ creating ? 'Création…' : 'Lancer le challenge' }}
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  CHALLENGE_FORMATS,
  DURATIONS,
  CHALLENGE_SUGGESTIONS,
  formatOption,
} from '@/data/challengeFormats';
import {
  computeDailyTargets,
  suggestConfig,
  progressiveApply,
  logicalToday,
  repWeightFromExercise,
  isBodyweightExercise,
  isNoEquipmentExercise,
  type ChallengeFormat,
  type ChallengeConfig,
} from '@/lib/challenges';
import { exerciseInstructions } from '@/data/exerciseInstructions';
import { exerciseImage, exerciseFrames } from '@/data/exerciseImages';
import ExerciseAnim from '@/components/ExerciseAnim.vue';
import { useLibraryStore, type ExerciseRow } from '@/stores/library';
import { useProfileStore } from '@/stores/profile';
import { useChallengesStore, isCardioChallengeRow } from '@/stores/challenges';
import { CONDITIONING_CHALLENGE_IDS } from '@/data/cardio';
import { isDualUnitExercise } from '@/data/exerciseUnits';
import { useComboStore } from '@/stores/combo';
import { variantFamilyKey } from '@/data/combo';
import { useAuthStore } from '@/stores/auth';
import {
  tokenCost,
  isAccessoryMuscle,
  usedTokens,
  accessoryCount,
  remainingTokens,
  CHALLENGE_TOKEN_BUDGET,
  type LaneChallenge,
} from '@/lib/challengeLimits';
import type { Level } from '@/lib/types';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const libraryStore = useLibraryStore();
const profileStore = useProfileStore();
const challenges = useChallengesStore();
const comboStore = useComboStore();
const auth = useAuthStore();

const STEP_TITLES = ['Exercice', 'Format', 'Durée', 'Réglages', 'Récap'];
const step = ref(1);

const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

const lib = ref<ExerciseRow[]>([]);
const loadingLib = ref(true);
const search = ref('');
const exercise = ref<ExerciseRow | null>(null);
// Panneau de détail de l'exo sélectionné → on l'amène dans le champ de vision à la
// sélection (sinon, sous une longue liste sur mobile, on rate le choix reps/durée).
const detailEl = ref<HTMLElement | null>(null);
const format = ref<ChallengeFormat>('fixed');
const durationDays = ref(30);
const customOn = ref(false);
const customDays = ref(45);
const config = ref<ChallengeConfig>({ start: 50 });
const restDays = ref<number[]>([]);
// Compter en Reps (défaut) ou en Séries (saisie par série façon Défi 360). Le mode Séries
// accepte TOUS les formats (ticket 9c7316a7) : le nombre de SÉRIES suit la courbe du format
// (progressif, pyramidal…), juste à une échelle de séries (cf. scaleForSeries).
const countMode = ref<'reps' | 'sets'>('reps');
const availableFormats = computed(() => CHALLENGE_FORMATS);
function setCountMode(m: 'reps' | 'sets') {
  countMode.value = m;
  reset();
}
// UN seul choix d'objectif (fusion unité + comptage, ticket fa27e9a8) : Reps / Séries /
// Durée. « Durée » n'existe que pour les exos rythmiques dual-unit (corde, burpees…) ;
// le cardio garde son propre choix km/durée. Les séries n'ont pas de sens en durée.
const objMode = computed<'reps' | 'sets' | 'time'>(() =>
  unit.value === 'time' ? 'time' : countMode.value === 'sets' ? 'sets' : 'reps',
);
function setObjMode(m: 'reps' | 'sets' | 'time') {
  if (m === 'time') {
    if (isDual.value) dualUnit.value = 'time';
    setCountMode('reps'); // pas de séries en durée
    return;
  }
  if (isDual.value) dualUnit.value = 'reps';
  setCountMode(m);
}
const reminderOn = ref(false);
const reminderTime = ref('18:00');
const carryOver = ref(false);
const adaptiveMode = ref(false); // difficulté auto OFF par défaut (ticket b17d933d) — opt-in
const creating = ref(false);

const level = computed<Level>(() => profileStore.profile?.experience?.level ?? 'intermediaire');
const levelLabel = computed(() => level.value);
const favSet = computed(() => new Set(profileStore.profile?.favorite_exercises ?? []));
// SORTIE cardio (tag 'cardio' = marche/course/vélo) : pilote le sélecteur
// d'unité distance/temps. Le conditionnement (jumping jacks…) n'en est PAS (reps).
const isCardio = computed(() => !!exercise.value?.tags?.includes('cardio'));
// VOIE cardio (budget + onglet) : sorties cardio ET exos de conditionnement
// (jumping jacks, burpees…) → leur XP va au Cardio, ils vivent donc côté cardio,
// pas muscu. (Distinct de `isCardio` qui, lui, ne gère que le type d'unité.)
function exIsCardio(e: ExerciseRow): boolean {
  return !!e.tags?.includes('cardio') || CONDITIONING_CHALLENGE_IDS.has(e.id);
}
function laneChallenges(cardio: boolean): LaneChallenge[] {
  return challenges.list
    .filter((c) => c.status === 'active' && isCardioChallengeRow(c) === cardio)
    .map((c) => ({
      accessory: isAccessoryMuscle(c.muscle_primary),
      durationDays: c.duration_days,
    }));
}
// Nom de l'accessoire actif qui occupe le slot d'une voie (pour un message clair).
function activeAccessoryName(cardio: boolean): string | null {
  return (
    challenges.list.find(
      (c) =>
        c.status === 'active' &&
        isCardioChallengeRow(c) === cardio &&
        isAccessoryMuscle(c.muscle_primary),
    )?.exercise_name ?? null
  );
}
// Exercice « bloquant » dès la sélection : accessoire dont le slot est pris, ou
// exo normal dont la voie n'a plus aucun jeton (même un court ne rentrerait pas).
function exFull(e: ExerciseRow): boolean {
  const lane = laneChallenges(exIsCardio(e));
  if (isAccessoryMuscle(e.muscle_primary)) return accessoryCount(lane) >= 1;
  return remainingTokens(lane) <= 0;
}
const selectedFull = computed(() => (exercise.value ? exFull(exercise.value) : false));
const cardioUnit = ref<'distance' | 'time'>('distance');
// Exos « rythmiques » de conditionnement (corde à sauter…) : reps OU durée, au choix.
const isDual = computed(() => isDualUnitExercise(exercise.value?.id));
const dualUnit = ref<'reps' | 'time'>('reps');
const unit = computed<'reps' | 'time' | 'distance'>(() => {
  if (isCardio.value) return cardioUnit.value;
  if (isDual.value) return dualUnit.value; // choix utilisateur pour les exos dual
  return exercise.value?.unit === 'time' ? 'time' : 'reps';
});
// TEMPS au chrono = SECONDES (avec affichage min:sec au choix) : gainage (planche…) ET
// conditionnement (corde, burpees…). Seules les VRAIES sorties cardio (marche/course/vélo,
// `isCardio`) restent en minutes/km (ticket 6fdff311).
const isGainageTime = computed(() => unit.value === 'time' && !isCardio.value);
const timeDisplay = ref<'sec' | 'mmss'>('sec');
// Saisie de la durée AU FORMAT choisi (ticket e6c51fc9) : quand min:sec est sélectionné,
// les champs de durée s'affichent/se saisissent en m:ss (converti en secondes en interne).
const showMmss = computed(() => isGainageTime.value && timeDisplay.value === 'mmss');
function secToMmss(sec: number | string): string {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function mmssToSec(str: unknown): number {
  const [mm, ss] = String(str).split(':');
  return (parseInt(mm ?? '0', 10) || 0) * 60 + (parseInt(ss ?? '0', 10) || 0);
}
// Un champ de VALEUR temporelle (objectif, pic…) — à saisir en m:ss quand showMmss.
function isTimeValueField(f: string): boolean {
  return f === 'start' || f === 'peak' || f === 'total' || f === 'increment';
}
// Option « assisté » : exos poids du corps en reps (tractions, dips…).
const showAssist = computed(
  () =>
    unit.value === 'reps' &&
    !isCardio.value &&
    isBodyweightExercise(exercise.value?.equipment_required, exercise.value?.name),
);
const assistedMode = ref(false);
const unitLabel = computed(() =>
  countMode.value === 'sets'
    ? 'séries' // mode Séries : l'objectif se compte en SÉRIES (pas en reps)
    : unit.value === 'distance'
      ? 'km'
      : unit.value === 'time'
        ? isCardio.value
          ? 'min' // seules les vraies sorties cardio = minutes ; gainage/conditionnement = secondes
          : 'sec'
        : 'reps',
);
const fields = computed(() => formatOption(format.value)?.fields ?? ['start']);

// Jetons : voie de l'exo choisi, coût du défi (selon durée), place restante.
const selAccessory = computed(() => isAccessoryMuscle(exercise.value?.muscle_primary));
const selIsCardioLane = computed(() => (exercise.value ? exIsCardio(exercise.value) : false));
const laneActive = computed(() => laneChallenges(selIsCardioLane.value));
const laneUsed = computed(() => usedTokens(laneActive.value));
const laneRemaining = computed(() => remainingTokens(laneActive.value));
const candidateCost = computed(() => (selAccessory.value ? 0 : tokenCost(durationDays.value)));
// Accessoire = exo d'appoint : gratuit en jeton MAIS limité à 1 semaine.
const ACCESSORY_MAX_DAYS = 7;
const candidateFits = computed(() =>
  selAccessory.value
    ? accessoryCount(laneActive.value) < 1 && durationDays.value <= ACCESSORY_MAX_DAYS
    : laneUsed.value + candidateCost.value <= CHALLENGE_TOKEN_BUDGET,
);
const laneLabel = computed(() => (selIsCardioLane.value ? 'cardio' : 'muscu'));
// Une durée preset rentre-t-elle dans la place restante de la voie ?
function presetFits(d: number): boolean {
  if (selAccessory.value) return d <= ACCESSORY_MAX_DAYS; // accessoire : 1 sem. max
  return laneUsed.value + tokenCost(d) <= CHALLENGE_TOKEN_BUDGET;
}
// Jauge d'espace (bannière) : usage des deux voies.
const muscuUsed = computed(() => usedTokens(laneChallenges(false)));
const cardioUsed = computed(() => usedTokens(laneChallenges(true)));
const muscuAccUsed = computed(() => accessoryCount(laneChallenges(false)) >= 1);

const guide = computed(() =>
  exercise.value ? exerciseInstructions(exercise.value.id) : undefined,
);
const exoImg = computed(() => (exercise.value ? exerciseImage(exercise.value.id) : undefined));
const exoAnim = computed(() => (exercise.value ? !!exerciseFrames(exercise.value.id) : false));
const demoUrl = computed(
  () =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent((exercise.value?.name ?? '') + ' exécution technique musculation')}`,
);

const canNext = computed(() => {
  if (step.value === 1) return !!exercise.value && !selectedFull.value;
  if (step.value === 3) return candidateFits.value; // étape Durée : le défi doit rentrer
  return true;
});

const sugIndex = new Map(CHALLENGE_SUGGESTIONS.map((id, i) => [id, i]));
function exRank(id: string): number {
  return (favSet.value.has(id) ? 100 : 0) + (sugIndex.has(id) ? 50 - (sugIndex.get(id) ?? 0) : 0);
}
// Marche/course séparées masquées : on ne propose plus que « Marche ou course »
// (une seule piste → une sortie course compte aussi, pas de doublon).
const HIDDEN_EX_IDS = new Set(['ex_ch_marche', 'ex_ch_course']);
// FAMILLES d'exos déjà utilisées par un défi ACTIF (solo) OU par le Défi 360 actif
// → on ne les propose pas. On dédup par FAMILLE DE VARIANTE (`variantFamilyKey`) :
// prendre « dips » bloque aussi « dips assistés », « pompes » bloque « pompes sur
// genoux », etc. (même mouvement, version assistée/élastique = doublon).
const activeExoFamilies = computed(() => {
  const keys = new Set<string>();
  for (const c of challenges.list.filter((c) => c.status === 'active'))
    keys.add(variantFamilyKey(c.exercise_id));
  // EXCLUSIVITÉ PAR EXERCICE : un exo est soit dans le Défi 360, soit dans un challenge,
  // jamais les deux → on masque aussi les familles du 360 actif (pour TOUS, admin inclus).
  // Un 360 et des challenges peuvent coexister, tant qu'ils ne partagent PAS d'exercice.
  for (const combo of comboStore.list.filter((c) => c.status === 'active'))
    for (const leg of combo.legs ?? []) keys.add(variantFamilyKey(leg.exercise_id));
  return keys;
});
const exFilter = ref<'all' | 'muscu' | 'cardio'>('all');
const filteredLib = computed(() => {
  const n = search.value.trim().toLowerCase();
  // On retire : les exos masqués, ceux déjà en défi actif, et ceux qui ne
  // rentrent plus dans le quota de leur voie (jetons pleins / accessoire pris).
  // Filtre voie (Tous / Muscu / Cardio) pour accélérer la recherche.
  const visible = lib.value.filter(
    (e) =>
      !HIDDEN_EX_IDS.has(e.id) &&
      !activeExoFamilies.value.has(variantFamilyKey(e.id)) &&
      !exFull(e) &&
      (exFilter.value === 'all' || exIsCardio(e) === (exFilter.value === 'cardio')),
  );
  // Recherche par NOM ou par MUSCLE (primaire OU secondaire) → taper « triceps »
  // remonte aussi les exos qui le travaillent en secondaire (ex. développé couché).
  const base = n
    ? visible.filter(
        (e) =>
          e.name.toLowerCase().includes(n) ||
          (e.muscle_primary ?? '').toLowerCase().includes(n) ||
          (e.muscle_secondary ?? []).some((m) => m.toLowerCase().includes(n)),
      )
    : visible;
  return [...base].sort((a, b) => exRank(b.id) - exRank(a.id)).slice(0, 60);
});

function next() {
  if (canNext.value && step.value < STEP_TITLES.length) step.value++;
}
async function prev() {
  if (step.value > 1) step.value--;
  else if (window.history.state?.back) router.back();
  else await router.push('/challenges');
}

function durationLabel(d: number) {
  return d === 100
    ? '100 j'
    : d === 30
      ? '1 mois'
      : d === 21
        ? '3 sem'
        : d === 14
          ? '2 sem'
          : '1 sem';
}

function fieldLabel(f: string) {
  if (format.value === 'ramp') {
    if (f === 'start') return 'Min (jour 1)';
    if (f === 'peak') return 'Max (dernier jour)';
  }
  if (format.value === 'progressive' && f === 'start') return 'Départ (reps)';
  return (
    {
      start: 'Départ',
      increment: '+/jour',
      peak: 'Pic',
      cycle_days: 'Cycle (j)',
      deload_pct: 'Décharge %',
      total: 'Total',
      max: 'Ta perf max',
      start_coef: 'Départ (×MAX)',
      inc_pct: '+ %/jour',
      variation: 'Variation %',
    }[f] ?? f
  );
}
// Unité affichée à côté d'un champ de difficulté (km/reps/sec selon l'exo).
function fieldUnit(f: string): string {
  if (f === 'start' || f === 'peak' || f === 'total' || f === 'increment') return unitLabel.value;
  if (f === 'cycle_days') return 'j';
  return '';
}
const stepBounds: Record<string, { min: number; max: number; step: number }> = {
  inc_pct: { min: 3, max: 15, step: 1 },
  variation: { min: 0, max: 40, step: 5 },
};
function stepField(f: string, delta: number) {
  const b = stepBounds[f];
  if (!b) return;
  const nextVal = Math.min(b.max, Math.max(b.min, cfgDisplay(f) + delta));
  setField(f, nextVal);
}
function cfgDisplay(f: string): number {
  if (f === 'deload_pct') return Math.round((config.value.deload_pct ?? 0.5) * 100);
  return Number((config.value as unknown as Record<string, unknown>)[f] ?? 0);
}
// Le départ est saisi en reps absolues ; seul l'incrément dérive du % de MAX.
function applyProgressiveIncrement() {
  const c = config.value;
  const { increment } = progressiveApply(c.max ?? 0, c.start_coef ?? 1, c.inc_pct ?? 3);
  config.value = { ...c, increment };
}
function setField(f: string, v: unknown) {
  const n = Number(v) || 0;
  if (f === 'deload_pct')
    config.value = { ...config.value, deload_pct: Math.min(1, Math.max(0, n / 100)) };
  else config.value = { ...config.value, [f]: n };
  if (format.value === 'progressive' && (f === 'max' || f === 'inc_pct'))
    applyProgressiveIncrement();
}
function reset() {
  if (!exercise.value) return;
  config.value = suggestConfig(
    unit.value,
    level.value,
    format.value,
    durationDays.value,
    exercise.value.id,
  );
  // Mode Séries : l'objectif est un petit nombre de SÉRIES (pas des reps) → on ramène les
  // magnitudes (générées en reps) à une échelle de séries, en gardant la courbe du format.
  if (unit.value === 'reps' && countMode.value === 'sets')
    config.value = scaleForSeries(config.value, durationDays.value);
  restDays.value = config.value.rest_weekdays ?? [];
}
// Reps → séries : ~12 reps par série. Divise les magnitudes (start/pic/max/increment/pic
// courant), plancher 2 ; total cumulé = ≥ 2 séries/jour. Les ratios (%, coef) sont conservés.
function scaleForSeries(cfg: ChallengeConfig, days: number): ChallengeConfig {
  const s = (v: number) => Math.max(2, Math.round(v / 12));
  const out: ChallengeConfig = { ...cfg };
  for (const k of ['start', 'peak', 'max', 'increment', 'capacity'] as const)
    if (out[k] != null) out[k] = s(out[k]);
  if (out.total != null) out.total = Math.max(2 * days, Math.round(out.total / 12));
  return out;
}
// Durée par défaut à la sélection : le conseillé (30 j) s'il rentre dans la place
// restante de la voie, sinon 1 semaine → on ne tombe jamais sur une durée refusée.
function defaultDurationFor(e: ExerciseRow): number {
  if (isAccessoryMuscle(e.muscle_primary)) return 7; // accessoire = exo d'appoint, 1 sem. max
  const rem = remainingTokens(laneChallenges(exIsCardio(e)));
  return tokenCost(30) <= rem ? 30 : 7;
}
function pickExercise(e: ExerciseRow) {
  if (exFull(e)) {
    const lane = exIsCardio(e) ? 'cardio' : 'muscu';
    $q.notify({
      type: 'warning',
      message: isAccessoryMuscle(e.muscle_primary)
        ? `Tu as déjà un accessoire ${lane} en cours${activeAccessoryName(exIsCardio(e)) ? ` (${activeAccessoryName(exIsCardio(e))})` : ''} — termine-le pour en lancer un autre (1 accessoire à la fois).`
        : `Plus de place pour un défi ${lane}. Termine un défi en cours pour en lancer un autre.`,
    });
    return;
  }
  exercise.value = e;
  customOn.value = false;
  durationDays.value = defaultDurationFor(e);
  reset();
  // Amène le panneau de détail (choix reps/durée, exécution) dans le champ de vision.
  void nextTick(() => detailEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}
// Recalcule les objectifs quand on bascule km ↔ durée (défauts différents).
watch(cardioUnit, () => {
  if (exercise.value && isCardio.value) reset();
});
function selectFormat(f: ChallengeFormat) {
  format.value = f;
  reset();
}
function setPresetDuration(d: number) {
  customOn.value = false;
  durationDays.value = d;
  reset();
}
function enableCustom() {
  customOn.value = true;
  applyCustom();
}
// Un défi implique une répétition sur plusieurs jours : durée mini = 3 j.
const MIN_CUSTOM_DAYS = 3;
function applyCustom() {
  const max = selAccessory.value ? ACCESSORY_MAX_DAYS : 365; // accessoire : 1 sem. max
  const d = Math.min(max, Math.max(MIN_CUSTOM_DAYS, Math.round(customDays.value || 0)));
  customDays.value = d;
  durationDays.value = d;
  reset();
}
function toggleRest(w: number) {
  const i = restDays.value.indexOf(w);
  if (i >= 0) restDays.value.splice(i, 1);
  else restDays.value.push(w);
}

const startDate = logicalToday();
const previewTargets = computed(() =>
  computeDailyTargets(
    format.value,
    { ...config.value, rest_weekdays: restDays.value },
    durationDays.value,
    startDate,
  ),
);
const maxTarget = computed(() => Math.max(1, ...previewTargets.value));
function barH(t: number) {
  return Math.round((t / maxTarget.value) * 100);
}
const activeDaysCount = computed(() => previewTargets.value.filter((t) => t > 0).length);
const totalPlanned = computed(() => previewTargets.value.reduce((a, t) => a + t, 0));

async function createChallenge() {
  const userId = auth.user?.id;
  if (!userId || !exercise.value) return;
  // EXCLUSIVITÉ PAR EXERCICE : un exo déjà dans le Défi 360 actif ne peut pas être aussi
  // en challenge (et inversement). On bloque uniquement le CHEVAUCHEMENT d'exercice (le
  // picker les masque déjà ; ceci couvre la pré-sélection par tuile/deep-link). Un 360 et
  // des challenges sur d'AUTRES exos coexistent sans souci.
  const famKey = variantFamilyKey(exercise.value.id);
  const inActiveCombo = comboStore.list
    .filter((c) => c.status === 'active')
    .some((c) => (c.legs ?? []).some((leg) => variantFamilyKey(leg.exercise_id) === famKey));
  if (!isCardio.value && inActiveCombo) {
    $q.notify({
      type: 'warning',
      message:
        'Cet exercice est déjà dans ton Défi 360 : un exo est soit en 360, soit en challenge — pas les deux.',
    });
    return;
  }
  creating.value = true;
  try {
    const cfg: ChallengeConfig = { ...config.value, rest_weekdays: restDays.value };
    if (reminderOn.value) cfg.reminder_time = reminderTime.value;
    if (carryOver.value && format.value !== 'cumulative') cfg.carry_over = true;
    if (isGainageTime.value && timeDisplay.value === 'mmss') cfg.time_display = 'mmss';
    if (showAssist.value && assistedMode.value) cfg.assisted = true;
    // Mode Séries (reps uniquement) : objectif en nombre de séries, saisie par
    // série (reps+poids+assisté). Le flag bodyweight active le toggle « assisté ».
    if (unit.value === 'reps' && countMode.value === 'sets') cfg.count_mode = 'sets';
    if (isBodyweightExercise(exercise.value.equipment_required, exercise.value.name))
      cfg.bodyweight = true;
    const daily = computeDailyTargets(format.value, cfg, durationDays.value, startDate);
    if (adaptiveMode.value) {
      cfg.adaptive = true;
      cfg.capacity = format.value === 'cumulative' ? (cfg.total ?? 0) : Math.max(1, ...daily);
    }
    const ch = await challenges.create({
      exercise_id: exercise.value.id,
      exercise_name: exercise.value.name,
      muscle_primary: exercise.value.muscle_primary,
      rep_weight: repWeightFromExercise(
        exercise.value.muscle_secondary,
        exercise.value.equipment_required,
        exercise.value.name,
      ),
      unit: unit.value,
      format: format.value,
      duration_days: durationDays.value,
      start_date: startDate,
      config: cfg,
      daily_targets: daily,
    });
    $q.notify({ type: 'positive', message: 'Challenge lancé 💪' });
    await router.replace(`/challenges/${ch.id}`);
  } catch (e) {
    $q.notify({ type: 'negative', message: e instanceof Error ? e.message : 'Échec.' });
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  const userId = auth.user?.id;
  try {
    if (userId && !profileStore.profile) await profileStore.fetch(userId);
    if (challenges.list.length === 0) await challenges.fetchMine();
    if (comboStore.list.length === 0) await comboStore.fetchMine().catch(() => undefined);
    lib.value = await libraryStore.fetchAll();
    // Pré-sélection depuis l'URL (?ex=<id>) : « reprendre en challenge » un exo de
    // Défi 360 (d073a26b). On pré-sélectionne et on avance à l'étape suivante.
    const exId = typeof route.query.ex === 'string' ? route.query.ex : null;
    if (exId) {
      const e = lib.value.find((x) => x.id === exId);
      if (e && !exFull(e)) {
        pickExercise(e);
        if (exercise.value) step.value = 2;
      }
    }
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loadingLib.value = false;
  }
});
</script>

<style scoped lang="scss">
.cn-page {
  background: var(--bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  padding: 14px 16px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--line-soft);
}
.iconbtn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: none;
}
.top-mid {
  flex: 1;
  min-width: 0;
}
.top-title {
  font-weight: 600;
  font-size: 18px;
  text-transform: uppercase;
  color: var(--text);
}
.top-step {
  font-size: 12px;
  color: var(--dim);
  margin-top: 1px;
}
.top-spacer {
  width: 40px;
  flex: none;
}
.progress {
  height: 3px;
  background: var(--line-soft);
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.25s ease;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 110px;
}
.step-h {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 4px 2px 16px;
}
.lbl {
  font-size: 12px;
  color: var(--dim);
  margin-bottom: 8px;
}

.ex-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ex-empty {
  padding: 18px 14px;
  text-align: center;
  font-size: 13px;
  line-height: 1.45;
  color: var(--dim);
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 12px;
}
.ex-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  cursor: pointer;
  &.sel {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  &.full {
    opacity: 0.5;
    cursor: not-allowed;
  }
  /* Exo 100 % poids du corps (aucun matériel) → liseré cyan à gauche. */
  &.bw {
    border-left-width: 3px;
    border-left-color: #5fd0e0;
  }
}
.ex-lock {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
/* Jauge d'espace des défis (bannière étape 1) */
.cap-card {
  margin-bottom: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
}
.cap-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.cap-lane {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  min-width: 74px;
}
.pips {
  display: flex;
  gap: 4px;
}
.pip {
  width: 14px;
  height: 8px;
  border-radius: 3px;
  background: var(--line);
}
.pip.on {
  background: var(--accent);
}
.cap-acc {
  font-size: 11px;
  color: var(--dim);
}
.cap-acc.used {
  color: var(--accent);
}
.cap-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--dim);
  margin-top: 4px;
}
/* Filtre de voie (Tous / Muscu / Cardio) */
.ex-filter {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.exf {
  flex: 1;
  padding: 8px 6px;
  border-radius: 9px;
  border: 1px solid var(--line-soft);
  background: var(--surface);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.exf.on {
  border-color: var(--accent);
  background: var(--surface-2);
  color: var(--text);
}
/* Note de coût en jetons (étape Durée) */
.tok-note {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--dim);
}
.tok-note b {
  color: var(--text);
}
.tok-note.warn {
  border-color: var(--d4);
  color: var(--d4);
}
.ex-main {
  flex: 1;
  min-width: 0;
}
.ex-name {
  font-weight: 600;
  font-size: 14.5px;
  color: var(--text);
}
.ex-meta {
  font-size: 11.5px;
  color: var(--dim);
  text-transform: capitalize;
}
/* Badge « poids du corps » (aucun matériel) — cyan, lisible. */
.bw-badge {
  display: inline-block;
  font-size: 9.5px;
  font-weight: 700;
  color: #5fd0e0;
  border: 1px solid #5fd0e0;
  border-radius: 999px;
  padding: 0 6px;
  margin-left: 6px;
  line-height: 1.5;
  white-space: nowrap;
  vertical-align: middle;
}
.fav {
  flex: none;
}

.ex-detail {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--accent);
  background: var(--surface-2);
}
.exd-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.exd-img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 10px;
  flex: none;
  background: var(--surface);
}
.exd-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.exd-meta {
  font-size: 12px;
  color: var(--dim);
  text-transform: capitalize;
  margin-top: 2px;
}
.exd-sec {
  margin-top: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--dim);
}
.exd-steps {
  margin: 8px 0 0;
  padding-left: 18px;
  li {
    font-size: 13.5px;
    color: var(--text);
    line-height: 1.4;
    margin-bottom: 6px;
  }
}
.exd-tip {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
}
.exd-none {
  margin-top: 10px;
  font-size: 13px;
  color: var(--dim);
}
.exd-demo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.count-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.count-toggle button {
  flex: 1;
  padding: 10px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.count-toggle button.on {
  border-color: var(--accent);
  background: var(--surface-2);
  color: var(--text);
}
.count-note {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
  margin-bottom: 14px;
}
.count-note b {
  color: var(--text);
}
.fmt-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.fmt {
  text-align: left;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  color: var(--text);
  &.sel {
    border-color: var(--accent);
    background: var(--surface-2);
  }
}
.fmt-name {
  font-weight: 600;
  font-size: 14px;
  margin-top: 6px;
}
.fmt-desc {
  font-size: 11px;
  color: var(--dim);
  margin-top: 2px;
  line-height: 1.25;
}

.dur-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.reco {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--accent);
  margin-top: 2px;
}
.dur-note {
  margin-top: 10px;
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
}
.rest-reco {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.4;
  margin-bottom: 14px;
  b {
    color: var(--text);
  }
}
.rest-add {
  display: inline-block;
  margin-left: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.custom-dur {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.cfg-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.cfg-lbl {
  font-size: 11px;
  color: var(--dim);
  margin-bottom: 3px;
}
.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 4px;
}
.st-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 9px;
  background: var(--surface);
  color: var(--accent);
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.st-btn:active {
  background: var(--accent);
  color: var(--accent-ink);
}
.st-val {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--text);
}
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.choice {
  min-height: 44px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  &.active {
    border-color: var(--accent);
    background: var(--surface-2);
  }
  &.small {
    min-height: 40px;
    font-size: 12px;
    padding: 0 2px;
  }
}

.carry,
.assist,
.auto-card {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 10px 12px;
}
.auto-card {
  border-color: var(--accent);
  margin-bottom: 14px;
}
.carry-note,
.assist-note {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.35;
  margin-top: 6px;
}

.recap {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 6px 14px;
  margin-bottom: 14px;
}
.recap-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 14px;
  &:last-child {
    border-bottom: none;
  }
  span {
    color: var(--dim);
  }
  b {
    color: var(--text);
  }
}
.preview {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 12px;
}
.prev-h {
  font-size: 11px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.prev-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 70px;
}
.prev-bar {
  flex: 1;
  min-width: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  opacity: 0.85;
}
.prev-sub {
  font-size: 12px;
  color: var(--dim);
  margin-top: 8px;
  b {
    color: var(--text);
  }
}

.cta-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 600px;
  margin: 0 auto;
  padding: 14px 16px 24px;
  background: linear-gradient(180deg, transparent, var(--bg) 30%);
}
.cta {
  width: 100%;
  height: 56px;
  border: none;
  border-radius: 16px;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
  }
}
</style>
