<template>
  <component :is="embedded ? 'div' : 'q-page'" class="ch-page" :class="{ embedded }">
    <div class="head">
      <div class="head-left">
        <h1 class="p-title font-display">Challenges</h1>
        <button
          v-if="mode === 'solo'"
          class="head-rank"
          aria-label="Voir mes succès"
          @click="tab = 'ach'"
        >
          <span class="head-lvl font-display">Niv. {{ xpInfo.level }}</span>
        </button>
      </div>
      <div class="head-actions">
        <q-btn v-if="mode === 'solo'" flat round dense icon="insights" aria-label="Stats & succès">
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 160px">
              <q-item v-close-popup clickable @click="tab = 'exos'">
                <q-item-section avatar><q-icon name="bar_chart" /></q-item-section>
                <q-item-section>Exercices</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="tab = 'ach'">
                <q-item-section avatar><q-icon name="emoji_events" /></q-item-section>
                <q-item-section>Succès</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
        <q-btn
          no-caps
          unelevated
          color="primary"
          text-color="dark"
          icon="add"
          label="Nouveau"
          @click="mode === 'combo' ? router.push('/combo/new') : goNew()"
        />
      </div>
    </div>

    <div class="seg2">
      <button class="seg2-b" :class="{ on: mode === 'solo' }" @click="mode = 'solo'">Solo</button>
      <button class="seg2-b" :class="{ on: mode === 'combo' }" @click="mode = 'combo'">
        🎯 Défi 360
      </button>
    </div>

    <div v-if="mode === 'solo' && LIST_TABS.includes(tab)" class="tabs">
      <button
        v-for="t in TABS"
        :key="t.value"
        class="tab"
        :class="{ on: tab === t.value }"
        @click="tab = t.value"
      >
        {{ t.label }}
      </button>
    </div>
    <!-- Retour à la liste depuis Exercices / Succès -->
    <button
      v-else-if="mode === 'solo' && (tab === 'exos' || tab === 'ach')"
      class="back-to-list"
      @click="tab = 'active'"
    >
      ‹ Retour aux challenges
    </button>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else-if="mode === 'solo'">
      <!-- EN COURS : en-tête capacité (jetons) + tuiles groupées par voie -->
      <template v-if="tab === 'active'">
        <div class="cap-card">
          <div class="cap-row">
            <span class="cap-lane">💪 Muscu</span>
            <span class="pips">
              <span v-for="n in BUDGET" :key="n" class="pip" :class="{ on: n <= muscuUsed }" />
            </span>
            <span class="cap-num font-display">{{ muscuUsed }}/{{ BUDGET }}</span>
            <span class="cap-acc" :class="{ used: muscuAccUsed }">+1 access.</span>
          </div>
          <div class="cap-row">
            <span class="cap-lane">🏃 Cardio</span>
            <span class="pips">
              <span v-for="n in BUDGET" :key="n" class="pip" :class="{ on: n <= cardioUsed }" />
            </span>
            <span class="cap-num font-display">{{ cardioUsed }}/{{ BUDGET }}</span>
          </div>
          <div class="cap-row">
            <span class="cap-lane">🎾 Tennis</span>
            <span class="pips">
              <span v-for="n in BUDGET" :key="n" class="pip" :class="{ on: n <= tennisUsed }" />
            </span>
            <span class="cap-num font-display">{{ tennisUsed }}/{{ BUDGET }}</span>
          </div>
          <div class="cap-hint">
            Un défi occupe 1 à 3 places selon sa durée. Côté muscu, les petits exos (mollets, abdos,
            bras) sont « accessoires » et gratuits.
          </div>
        </div>

        <div v-if="shown.length === 0" class="empty">Aucun challenge en cours. Lance-en un !</div>

        <template v-for="grp in activeGroups" :key="grp.key">
          <div v-if="grp.list.length" class="lane-group">
            <div class="lane-title">{{ grp.label }}</div>
            <div class="ch-tiles">
              <button
                v-for="c in grp.list"
                :key="c.id"
                class="ch-tile"
                :class="{ expiring: expiring(c) }"
                @click="goDetail(c.id)"
              >
                <div v-if="expiring(c)" class="ct-expire">⏳ Expire bientôt</div>
                <div class="ct-top">
                  <span class="ch-ic">
                    <img
                      v-if="exerciseImage(c.exercise_id)"
                      :src="exerciseImage(c.exercise_id)"
                      alt=""
                    />
                    <q-icon v-else name="fitness_center" size="15px" />
                  </span>
                  <span class="ct-name">{{ c.exercise_name }}</span>
                  <span
                    v-if="noEquipIds.has(c.exercise_id)"
                    class="bw-ic"
                    title="Poids du corps (aucun matériel)"
                    >🤸</span
                  >
                </div>
                <span class="ct-cost" :class="{ accessoire: cardCostLabel(c) === 'accessoire' }">{{
                  cardCostLabel(c)
                }}</span>
                <span class="cc-today" :class="st(c).isDoneToday ? 'done' : 'todo'">{{
                  st(c).isDoneToday ? '✓ À jour' : '● À faire'
                }}</span>
                <div class="seg-line" :style="{ '--n': challengeSegs(c).n }">
                  <span
                    v-for="i in challengeSegs(c).n"
                    :key="i"
                    class="seg-cell"
                    :class="{
                      on: i <= challengeSegs(c).on,
                      behind: i > challengeSegs(c).on && i <= challengeSegs(c).expected,
                    }"
                  />
                </div>
                <div class="ct-sub">
                  {{ st(c).completionPct }}% · j{{
                    Math.min(Math.max(1, st(c).dayIndex + 1), c.duration_days)
                  }}/{{ c.duration_days
                  }}<template v-if="isSetsMode(c)">
                    · {{ totalRepsOf(c) }} {{ repUnitOf(c) }}</template
                  >
                </div>
                <div
                  v-if="balShown(c) !== 0"
                  class="cc-bal"
                  :class="balShown(c) > 0 ? 'ahead' : 'behind'"
                >
                  <template v-if="balShown(c) > 0">▲ +{{ balShown(c) }} {{ balUnit(c) }}</template>
                  <template v-else>▼ −{{ -balShown(c) }} {{ balUnit(c) }}</template>
                </div>
              </button>
            </div>
          </div>
        </template>
      </template>

      <!-- TERMINÉS / ABANDONNÉS : liste classique -->
      <template v-else-if="LIST_TABS.includes(tab)">
        <div v-if="shown.length === 0" class="empty">
          {{
            tab === 'done'
              ? 'Aucun challenge terminé pour l’instant.'
              : 'Aucun challenge abandonné.'
          }}
        </div>
        <button v-for="c in shown" :key="c.id" class="ch-card" @click="goDetail(c.id)">
          <div class="cc-top">
            <span class="ch-ic">
              <img v-if="exerciseImage(c.exercise_id)" :src="exerciseImage(c.exercise_id)" alt="" />
              <q-icon v-else name="fitness_center" size="15px" />
            </span>
            <div class="cc-name">{{ c.exercise_name }}</div>
            <span class="cc-badge" :class="c.status">{{ statusLabel(c) }}</span>
          </div>
          <div class="cc-meta">
            {{ fmtName(c.format) }} · {{ c.duration_days }} j
            <span
              v-if="noEquipIds.has(c.exercise_id)"
              class="bw-ic"
              title="Poids du corps (aucun matériel)"
              >🤸</span
            >
          </div>
          <div class="seg-line" :style="{ '--n': challengeSegs(c).n }">
            <span
              v-for="i in challengeSegs(c).n"
              :key="i"
              class="seg-cell"
              :class="{
                on: i <= challengeSegs(c).on,
                behind: i > challengeSegs(c).on && i <= challengeSegs(c).expected,
              }"
            />
          </div>
          <div class="cc-sub">
            {{ st(c).completionPct }}% · {{ st(c).totalDone }}
            {{ isSetsMode(c) ? 'séries' : unitOf(c)
            }}<template v-if="isSetsMode(c)"> · {{ totalRepsOf(c) }} {{ repUnitOf(c) }}</template>
          </div>
          <div v-if="c.status === 'done'" class="cc-xp">
            <span v-if="effortPaidByOutings(c)" class="xp-pill reps"
              >🏃 effort compté en Cardio</span
            >
            <span v-else-if="xpb(c).reps > 0" class="xp-pill reps"
              >+{{ xpb(c).reps }} XP {{ c.unit === 'time' ? 'durée' : 'reps' }}</span
            >
            <span v-if="xpb(c).bonus > 0" class="xp-pill bonus"
              >+{{ xpb(c).bonus }} XP complétion</span
            >
          </div>
        </button>
      </template>

      <!-- Exercices challengés -->
      <template v-else-if="tab === 'exos'">
        <div class="range-tabs">
          <button
            v-for="r in [
              { v: 'all', l: 'Tout' },
              { v: 'week', l: 'Semaine' },
              { v: 'month', l: 'Mois' },
            ]"
            :key="r.v"
            class="range-tab"
            :class="{ on: statsRange === r.v }"
            @click="setRange(r.v)"
          >
            {{ r.l }}
          </button>
        </div>
        <div v-if="exoAgg.length === 0" class="empty">
          {{
            statsRange === 'all' ? 'Pas encore d’exercice challengé.' : 'Rien sur cette période.'
          }}
        </div>
        <div v-for="e in exoAgg" :key="e.id" class="exo-card">
          <div class="exo-main">
            <div class="exo-name">{{ e.name }}</div>
            <div class="exo-meta">{{ e.count }} défi{{ e.count > 1 ? 's' : '' }} (défis + 360)</div>
          </div>
          <div class="exo-reps">
            <span class="er-v font-display">{{
              e.unit === 'distance' ? e.total.toFixed(1) : Math.round(e.total)
            }}</span
            ><span class="er-l">{{ challengeValueUnit(e.unit, e.id) }}</span>
          </div>
        </div>
      </template>

      <!-- Mur de succès -->
      <template v-else>
        <!-- Niveau des challenges / XP -->
        <div class="level-card">
          <div class="lvl-top">
            <div class="rank-info">
              <div class="rank-label font-display">Niveau {{ xpInfo.level }}</div>
              <div class="lvl-xp">{{ xpInfo.xp.toLocaleString('fr-FR') }} XP</div>
            </div>
          </div>
          <div class="lvl-bar">
            <div class="lvl-fill" :style="{ width: xpInfo.progressPct + '%' }" />
          </div>
          <div class="lvl-next">
            Encore {{ (xpInfo.xpForLevel - xpInfo.xpIntoLevel).toLocaleString('fr-FR') }} XP →
            niveau <b>{{ xpInfo.level + 1 }}</b>
          </div>
        </div>

        <div class="ach-count">
          {{ unlockedCount }} / {{ ACHIEVEMENTS.length }} succès débloqués
        </div>
        <div class="ach-grid">
          <div
            v-for="a in ACHIEVEMENTS"
            :key="a.code"
            class="ach"
            :class="['r-' + a.rarity, { on: unlocked.has(a.code) }]"
          >
            <span class="ach-rarity">{{ RARITY_LABEL[a.rarity] }}</span>
            <q-icon :name="a.icon" size="26px" />
            <div class="ach-t">{{ a.title }}</div>
            <div class="ach-d">{{ a.desc }}</div>
            <q-icon v-if="!unlocked.has(a.code)" name="lock" size="14px" class="ach-lock" />
          </div>
        </div>
      </template>
    </template>

    <!-- DÉFI 360 -->
    <template v-else>
      <div class="tabs">
        <button
          v-for="t in TABS"
          :key="t.value"
          class="tab"
          :class="{ on: comboTab === t.value }"
          @click="comboTab = t.value"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Terminés / Abandonnés : liste récap -->
      <template v-if="comboTab !== 'active'">
        <div v-if="!comboList.length" class="empty">
          {{ comboTab === 'done' ? 'Aucun Défi 360 terminé.' : 'Aucun Défi 360 abandonné.' }}
        </div>
        <button
          v-for="c in comboList"
          :key="c.id"
          class="combo-card"
          @click="router.push(`/combo/${c.id}`)"
        >
          <div class="cc-main">
            <div class="cc-title font-display">🎯 Défi 360</div>
            <div class="cc-sub">
              {{ comboLegsDone(c) }}/{{ c.legs.length }} exos · {{ fmtPct(comboProgressPct(c)) }} %
            </div>
            <div v-if="c.status === 'done'" class="cc-xp">
              <span v-if="comboXpb(c).duration > 0" class="xp-pill dur"
                >+{{ comboXpb(c).duration }} XP séance</span
              >
              <span class="xp-pill reps">+{{ comboXpb(c).reps }} XP reps</span>
              <span v-if="comboXpb(c).bonus > 0" class="xp-pill bonus"
                >+{{ comboXpb(c).bonus }} XP bouclage</span
              >
              <span v-if="comboXpb(c).surpass > 0" class="xp-pill surpass"
                >+{{ comboXpb(c).surpass }} XP dépassement</span
              >
            </div>
            <ComboChestView v-if="c.chest" :combo-id="c.id" :chest="c.chest" compact />
          </div>
          <span class="cc-badge" :class="c.status">{{
            c.status === 'done' ? '✓ terminé' : 'abandonné'
          }}</span>
        </button>
      </template>

      <template v-else>
        <div v-if="!activeCombo" class="combo-empty">
          <p>
            Un défi <b>full-body sur 7 jours</b> : un exo par groupe, tes séries réparties dans la
            semaine.
          </p>
          <q-btn
            color="primary"
            text-color="dark"
            no-caps
            size="lg"
            icon="add"
            label="Lancer un Défi 360"
            @click="router.push('/combo/new')"
          />
        </div>
        <template v-else>
          <div class="combo360-head">
            <div class="c3-top">
              <span class="c3-pct font-display">{{ fmtPct(comboPct) }}%</span>
              <span class="c3-week">📅 {{ comboWeek }}</span>
              <!-- ⚠️ ARRÊTER SON 360 SE FAIT ICI, parce que c'est ici qu'on le regarde.
                   L'action existait, mais uniquement sur /combo/:id — et cet onglet
                   n'y menait même pas : on ne pouvait que « Générer une séance » ou
                   « Exporter » un défi créé par erreur. Le libellé vient de la lib :
                   « Supprimer » sur un 360 vierge, « Abandonner » dès qu'il y a du
                   travail dedans (l'XP est déjà comptée). -->
              <button class="c3-stop" :title="comboStop.ok" @click="confirmStopCombo">🗑</button>
            </div>
            <!-- Dégradé unique : vert (actuel) → rose (théorique si en retard) → piste. -->
            <div class="bar" :style="comboBarStyle">
              <!-- ⚠️ Le TRAIT se cache à 100 % (il se confondrait avec le bout de la
                   barre) ; la ZONE ROSE, elle, reste — le dernier jour, tout ce qui
                   manque est du retard. -->
              <i
                v-if="pace.showMark"
                class="c3-mark"
                :style="{ left: comboOnTimePct + '%' }"
                :title="`Pour être dans les temps : ${comboOnTimePct}%`"
              />
            </div>
          </div>
          <!-- 🏁 CLÔTURER À L'OBJECTIF (v0.964, demandé) : ici aussi, parce que c'est
               ici qu'on regarde son 360 — la leçon du 🗑, qui ne vivait que sur la
               fiche. Même règle, même libellés : ils viennent de la lib. -->
          <button v-if="comboFinish.can" class="c3-finish" @click="confirmFinishCombo">
            🏁 Clôturer mon Défi 360
          </button>
          <div class="c3-cta-row q-mb-sm">
            <q-btn
              class="c3-cta-grow"
              outline
              color="primary"
              no-caps
              icon="fitness_center"
              label="Générer une séance"
              :to="`/combo/${activeCombo.id}/session`"
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
          <ComboTierLegend v-if="activeComboLegs.some((l) => legMode(l) === 'sets')" />
          <div
            v-for="leg in activeComboLegs"
            :key="leg.exercise_id"
            class="combo-leg"
            :class="{ done: legAllDone(leg) }"
          >
            <!-- Même en-tête que la fiche du 360 : c’est souvent ICI qu’on consulte son
                 défi en cours, pas sur /combo/:id. -->
            <ComboLegHead
              :leg="leg"
              :objective="profileStore.profile?.objective"
              :bodyweight="noEquipIds.has(leg.exercise_id)"
              :size="36"
              @history="openHistory(leg)"
            />
            <!-- ⚠️ TOUCHER LA BARRE AJOUTE UNE SÉRIE : les boutons « ＋ 1 » et « ↩ » lui
                 prenaient la largeur, et les cases partaient à la ligne. La prochaine case vide
                 porte le « ＋ » ; le retrait vit dans la fenêtre de saisie. Seul le chrono du
                 mode durée garde ses boutons (il n'a pas de fenêtre de saisie). -->
            <div class="cl-bottom">
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
                  <template v-if="n <= legDone(leg)">{{
                    segSetLabel(legSets(leg)[n - 1])
                  }}</template>
                  <template v-else-if="n === legDone(leg) + 1">＋</template>
                  <template v-else-if="n > leg.target">+</template>
                </span>
              </div>
              <div
                v-else
                class="reps-bar"
                :class="{ tap: legMode(leg) === 'reps' }"
                @click="legMode(leg) === 'reps' && openSet(leg, 1)"
              >
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
              <button
                v-if="legMode(leg) === 'reps'"
                class="cl-add"
                :aria-label="`Ajouter une série : ${leg.exercise_name}`"
                @click="openSet(leg, 1)"
              >
                ＋
              </button>
              <div v-else-if="legMode(leg) === 'time'" class="cl-actions">
                <!-- Mode DURÉE : chrono (Démarrer/Pause → série de la durée réelle). -->
                <button
                  class="cl-chrono"
                  :class="{ running: isChronoOn(leg) }"
                  title="Chrono : Démarrer puis Pause pour enregistrer la durée"
                  @click="toggleChrono(leg)"
                >
                  {{ isChronoOn(leg) ? '⏸' : '▶' }} {{ chronoDisplay(leg) }}
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
                <button
                  class="cl-corr"
                  :disabled="!legSetsDone(leg)"
                  title="Retirer la dernière série"
                  @click="undoSet(leg)"
                >
                  ↩
                </button>
              </div>
            </div>
          </div>
        </template>
        <!-- Le corps entier, toutes sources confondues : ce qui reste en déficit MÊME en
             tenant son 360 se comble par un challenge (toucher le muscle). Affiché aussi
             sans 360 en cours : il aide à composer le prochain. -->
        <BodyBalance />
      </template>
    </template>

    <!-- Saisie d'une série : la fenêtre PARTAGÉE (fiche du 360, séance générée, défis en
         séries). L'onglet portait sa propre copie, sans fourchette conseillée ni correction. -->
    <SetLogDialog
      v-model="setOpen"
      :title="setLeg?.exercise_name ?? ''"
      :desc="
        editIndex !== null
          ? `Série ${editIndex + 1} · corriger`
          : `${setCount > 1 ? setCount + ' séries' : '1 série'} · reps & poids`
      "
      :assistable="setLeg?.assistable"
      :hint="
        setLeg
          ? repRangeLabel(
              legRepRange(setLeg, profileStore.profile?.objective),
              legMode(setLeg) === 'time',
            )
          : undefined
      "
      :initial-reps="setReps"
      :initial-weight="setWeight"
      :initial-assisted="setAssisted"
      :undo-label="undoLabel"
      :save-label="editIndex !== null ? 'Enregistrer' : undefined"
      @save="saveSet"
      @undo="setLeg && undoSet(setLeg, editIndex ?? undefined)"
    />

    <!-- Historique des séries d'un exo -->
    <ComboSetHistory v-model="histOpen" :leg="histLeg" />
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import ComboTierLegend from '@/components/ComboTierLegend.vue';
import HoldGameLauncher from '@/components/HoldGameLauncher.vue';
import ComboChestView from '@/components/ComboChestView.vue';
import BodyBalance from '@/components/BodyBalance.vue';
import ComboSetHistory from '@/components/ComboSetHistory.vue';
import ComboLegHead from '@/components/ComboLegHead.vue';
import SetLogDialog from '@/components/SetLogDialog.vue';
import {
  challengeStats,
  challengeXpPoints,
  challengeXpBreakdown,
  effortPaidByOutings,
  challengeLiveBalance,
  challengeTotalReps,
  evaluateAchievements,
  isNoEquipmentExercise,
  challengeValueUnit,
  type Challenge,
} from '@/lib/challenges';
import { computeLevel } from '@/lib/levels';
import { formatOption } from '@/data/challengeFormats';
import { exerciseImage } from '@/data/exerciseImages';
import { ACHIEVEMENTS, RARITY_LABEL } from '@/data/achievements';
import { useChallengesStore } from '@/stores/challenges';
import { challengeLane, type ChallengeLane } from '@/lib/tennisTraining';
import { useComboStore } from '@/stores/combo';
import { useProfileStore } from '@/stores/profile';
import { repRangeLabel } from '@/lib/repScheme';
import { useGameFx } from '@/composables/useGameFx';
import {
  comboProgressPct,
  fmtPct,
  comboXpBreakdown,
  legSetsDone,
  legDone,
  legComplete,
  legAllDone,
  legsDoneLast,
  legTierMarks,
  legSegZone,
  legBarGeometry,
  legMode,
  legLastReps,
  legLastWeight,
  legLastAssisted,
  legSets,
  legRepRange,
  comboStopPlan,
  comboFinishPlan,
  type ComboFinishPlan,
  comboPace,
  activeCombo as activeComboOf,
  NO_PACE,
  type ComboChallenge,
  comboExportText,
  comboBonusXp,
  comboCompleteInTime,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';
import { logicalToday } from '@/lib/challenges';
import {
  tokenCost,
  isAccessoryMuscle,
  usedTokens,
  accessoryCount,
  CHALLENGE_TOKEN_BUDGET,
  type LaneChallenge,
} from '@/lib/challengeLimits';
import { REP_XP, assistMult } from '@/lib/athlete';
import { useProgress } from '@/composables/useProgress';
import { useCharacterStore } from '@/stores/character';
import { useLibraryStore } from '@/stores/library';
import { dateRangeLabel } from '@/lib/startDate';

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const store = useChallengesStore();
const comboStore = useComboStore();
const profileStore = useProfileStore();
// Fourchette conseillée d’un exo, telle que figée à la création. L’objectif du profil
// ne sert que de repli pour les 360 créés avant qu’elle existe.
const gameFx = useGameFx();
// Grosse animation centrale à la complétion d'un Défi 360 (full-body bouclé).
function celebrateCombo(c: ComboChallenge) {
  gameFx.celebrate({
    kind: 'generic',
    emoji: '🎯',
    title: 'Objectif du Défi 360 atteint !',
    subtitle: `Prime +${comboBonusXp(c)} ⚡ — continue jusqu’au maximal, le coffre tombe à la fin`,
    rarity: 'divin',
  });
}
const progress = useProgress();
const character = useCharacterStore();
const library = useLibraryStore();
const loading = ref(true);

// Exos SANS aucun matériel (poids du corps) → encadrement distinct sur les cartes.
const noEquipIds = ref<Set<string>>(new Set());
async function loadEquip() {
  // Challenges solo + exos du Défi 360 (les legs du combo actif) → une seule requête.
  const comboIds = comboStore.list.flatMap((c) => c.legs.map((l) => l.exercise_id));
  const ids = [...new Set([...store.list.map((c) => c.exercise_id), ...comboIds])];
  if (!ids.length) return;
  try {
    const rows = await library.fetchByIds(ids);
    const set = new Set<string>();
    for (const r of rows) if (isNoEquipmentExercise(r.equipment_required, r.tags)) set.add(r.id);
    noEquipIds.value = set;
  } catch {
    /* non bloquant */
  }
}

// Énergie d'aventure dispo (peut être négative = déficit). ENERGY_PER_XP = 1.
const availableEnergy = computed(
  () =>
    progress.energyEarned.value +
    (character.row?.login_energy ?? 0) -
    (character.row?.energy_spent ?? 0),
);

const mode = ref<'solo' | 'combo'>('solo');
/** 🎯 `?mode=combo` ouvre directement l'onglet Défi 360 — c'est par là que la grande tuile
 *  de l'accueil y mène (v0.961).
 *  ⚠️ IMMÉDIAT : l'écran peut déjà être monté quand la query change (on revient d'un
 *  détail), et un test au montage raterait ce cas — le patron du `?tab=` de l'Aventure.
 *  ⚠️ ET ON RETIRE LE PARAMÈTRE : sans ça, un retour arrière rejouerait le saut d'onglet. */
watch(
  () => route.query.mode,
  (m) => {
    if (m !== 'combo' && m !== 'solo') return;
    mode.value = m;
    const q = { ...route.query };
    delete q.mode;
    void router.replace({ query: q });
  },
  { immediate: true },
);
// Même logique d'états que les défis solo (En cours / Terminés / Abandonnés).
const comboTab = ref<string>('active');
// ⚠️ Même règle que le store et que l'écran d'un ami (`activeCombo`, lib) : ces trois copies
// pouvaient désigner trois 360 différents dès qu'un joueur en a plusieurs d'ouverts.
const activeCombo = computed(() => activeComboOf(comboStore.list, logicalToday()));
/** Ce qu’arrêter le 360 en cours fera — même source que l’écran de détail, donc les deux
 *  ne peuvent pas annoncer deux choses différentes pour le même geste. */
const comboStop = computed(() =>
  comboStopPlan(activeCombo.value ?? ({ legs: [] } as unknown as ComboChallenge)),
);
/** Ce qu'une clôture manuelle ferait — même source que la fiche. */
const comboFinish = computed(() =>
  comboFinishPlan(
    activeCombo.value ?? ({ legs: [], status: 'done' } as unknown as ComboChallenge),
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
function confirmFinishCombo() {
  const cur = activeCombo.value;
  if (!cur) return;
  $q.dialog({
    title: 'Clôturer maintenant ?',
    message: finishMessage(comboFinish.value),
    cancel: { label: 'Continuer le défi', flat: true },
    ok: { label: 'Clôturer', color: 'primary' },
  }).onOk(() => {
    void comboStore.finish(cur.id);
  });
}
function confirmStopCombo() {
  const cur = activeCombo.value;
  if (!cur) return;
  const plan = comboStop.value;
  $q.dialog({
    title: plan.title,
    message: plan.message,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: plan.ok, color: 'negative' },
  }).onOk(() => {
    // Pas de navigation : on est déjà sur la liste, et le store met à jour `list`
    // → l'onglet retombe tout seul sur son état vide (« Lancer un Défi 360 »).
    void (plan.kind === 'abandon'
      ? comboStore.setStatus(cur.id, 'abandoned')
      : comboStore.remove(cur.id));
  });
}
// Ordre d'affichage des exos du Défi 360 : les MOINS avancés d'abord (moins de restant),
// les TERMINÉS relégués en bas → on voit tout de suite ce qu'il reste à faire.
// Nombre de cases affichées : jusqu'au palier MAXIMAL (et au-delà si déjà dépassé).
// Sans ça, la barre s'arrêtait à l'objectif → rien ne montrait qu'on pouvait aller plus loin.
// Géométrie de la barre continue (reps/durée) → montre la marge de dépassement.
function bar(l: ComboLeg): { objPct: number; fillPct: number; overPct: number } {
  return legBarGeometry(l);
}
function segCount(l: ComboLeg): number {
  return Math.max(legTierMarks(l).max, legDone(l));
}
// Ordre ALPHABÉTIQUE, les exos FINIS en bas (`legsDoneLast` — la MÊME règle que la fiche du
// défi ; avant la v0.903 cet onglet triait par RESTANT et la fiche par fraction faite, donc le
// même défi ne listait pas ses exos dans le même ordre aux deux endroits).
const activeComboLegs = computed(() => legsDoneLast(activeCombo.value?.legs ?? []));
const comboList = computed(() =>
  comboStore.list
    .filter((c) => c.status === comboTab.value)
    .sort((a, b) => (b.start_date > a.start_date ? 1 : -1)),
);
const comboLegsDone = (c: (typeof comboStore.list)[number]) =>
  c.legs.filter((l) => legComplete(l)).length;
const comboPct = computed(() => (activeCombo.value ? comboProgressPct(activeCombo.value) : 0));
// Semaine du Défi 360 (début → fin) pour l'afficher clairement.
// ⚠️ `fmtDM`/`addDaysLocal` (privés à cet écran) sont remplacés par `dateRangeLabel` :
// la même plage s'affiche désormais aussi sur l'écran d'un AMI, et deux copies d'une
// règle de date finissent toujours par diverger d'un jour.
const comboWeek = computed(() =>
  activeCombo.value
    ? dateRangeLabel(activeCombo.value.start_date, activeCombo.value.duration_days)
    : '',
);
// Avancement THÉORIQUE « dans les temps » = jours écoulés (aujourd'hui inclus) / durée.
// Affiché en ROSE derrière le vert (actuel) sur la barre globale → on voit le retard.
/** Même source que l’écran de détail — deux copies de cette barre portaient le même
 *  défaut : le rose s’éteignait le DERNIER jour, quand l’attendu vaut 100 %. */
const pace = computed(() =>
  activeCombo.value ? comboPace(activeCombo.value, logicalToday()) : NO_PACE,
);
const comboOnTimePct = computed(() => pace.value.onTimePct);

const comboBarStyle = computed(() => {
  // Un seul dégradé (aucun empilement) : vert (fait) → rose (le RETARD) → piste.
  const { donePct: p, latePct, onTimePct } = pace.value;
  const stops =
    latePct > 0
      ? `var(--accent) 0 ${p}%, #ff6a9c ${p}% ${onTimePct}%, var(--surface-2) ${onTimePct}% 100%`
      : `var(--accent) 0 ${p}%, var(--surface-2) ${p}% 100%`;
  return { background: `linear-gradient(to right, ${stops})` };
});

// Détail d'une série affiché DANS sa cellule jaune : « 12×15kg » (ou « 12 » au poids
// du corps, « 12·a » si assisté). Vide si la série n'existe pas encore.
function segSetLabel(s: ComboSet | undefined): string {
  if (!s) return '';
  const base = s.weight ? `${s.reps}×${s.weight}kg` : `${s.reps}`;
  return s.assisted ? `${base}·a` : base;
}

// Saisie d'une série (reps + poids), préremplie avec la dernière série de l'exo.
const setOpen = ref(false);
const setLeg = ref<ComboLeg | null>(null);
const setCount = ref(1); // nb de séries identiques à ajouter (+1..+4)
const setReps = ref<number>(10);
const setWeight = ref<number | null>(null);
const setAssisted = ref(false);
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
  setReps.value = s.reps;
  setWeight.value = s.weight ?? null;
  setAssisted.value = !!s.assisted;
  setOpen.value = true;
}
/** Libellé du retrait dans la fenêtre : la série ouverte en correction, sinon la dernière. */
const undoLabel = computed(() => {
  if (editIndex.value !== null) return '🗑 Retirer';
  const sets = setLeg.value ? legSets(setLeg.value) : [];
  const last = sets[sets.length - 1];
  return last ? `↩ Retirer la dernière (${segSetLabel(last)})` : undefined;
});
function openSet(leg: ComboLeg, count: number) {
  setLeg.value = leg;
  setCount.value = count;
  editIndex.value = null;
  setReps.value = legLastReps(leg);
  setWeight.value = legLastWeight(leg);
  setAssisted.value = legLastAssisted(leg);
  setOpen.value = true;
}
function saveSet(v: { reps: number; weight: number | null; assisted: boolean }) {
  const leg = setLeg.value;
  // ⚠️ On garde l'OBJET : si la série ferme le défi (maximal partout), `activeCombo`
  // devient null juste après — le relire ici plantait.
  const co = activeCombo.value;
  if (!co || !leg) return;
  const before = comboCompleteInTime(co);
  if (editIndex.value !== null) {
    comboStore.updateSet(co.id, leg.exercise_id, editIndex.value, v.reps, v.weight, v.assisted);
  } else {
    for (let i = 0; i < setCount.value; i++) {
      comboStore.addSet(co.id, leg.exercise_id, logicalToday(), v.reps, v.weight, v.assisted);
    }
  }
  if (!before && comboCompleteInTime(co)) celebrateCombo(co);
}
// Mode DURÉE : ajoute directement N secondes (dans le champ reps, pas de poids).
function doAddSeconds(leg: ComboLeg, sec: number) {
  const co = activeCombo.value;
  if (!co) return;
  const before = comboCompleteInTime(co);
  comboStore.addSet(co.id, leg.exercise_id, logicalToday(), sec, null, false);
  if (!before && comboCompleteInTime(co)) celebrateCombo(co);
}
// ── Chrono des exos de DURÉE (comme les challenges) : Démarrer → décompte ; Pause →
// enregistre une série de la durée RÉELLE écoulée. Un seul chrono actif à la fois. ──
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
  const leg = activeCombo.value?.legs.find((l: ComboLeg) => l.exercise_id === legKey);
  if (leg && chronoSec.value > 0) doAddSeconds(leg, chronoSec.value);
  chronoSec.value = 0;
  chronoLegKey.value = null;
}
function toggleChrono(leg: ComboLeg) {
  if (isChronoOn(leg)) {
    logChrono(leg.exercise_id);
    return;
  }
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
// Exporte le Défi 360 complet détaillé : partage natif (mobile) sinon presse-papier.
async function exportCombo() {
  if (!activeCombo.value) return;
  const text = comboExportText(activeCombo.value, logicalToday());
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
/** Case de série touchée : une case FAITE s’ouvre pour être corrigée ou retirée, une case
 *  vide ajoute une série. */
function onSeg(leg: ComboLeg, n: number) {
  if (n <= legSetsDone(leg)) openEdit(leg, n - 1);
  else openSet(leg, 1);
}
/** Retire UNE série (par défaut la dernière) — celle dont on a touché la case. */
function undoSet(leg: ComboLeg, index = legSets(leg).length - 1) {
  if (!activeCombo.value) return;
  const sets = legSets(leg);
  const last = sets[index];
  if (!last) return;
  // Énergie que cette série a rapportée (≈ son XP, ENERGY_PER_XP=1).
  const setEnergy = last
    ? Math.round((last.reps || 0) * REP_XP * (leg.rep_weight ?? 1) * assistMult(last.assisted))
    : 0;
  const wouldDeficit = availableEnergy.value - setEnergy < 0;
  const doRemove = () => comboStore.removeSet(activeCombo.value!.id, leg.exercise_id, index);
  // Confirmation SYSTÉMATIQUE (évite les retraits par fausse manipulation).
  $q.dialog({
    title: `Retirer la série ${index + 1} ?`,
    message: wouldDeficit
      ? "Tu as déjà dépensé l'énergie gagnée avec cette série. La retirer te mettra en déficit d'énergie : il faudra refaire du sport avant de rejouer à l'aventure."
      : `« ${leg.exercise_name} » — ${segSetLabel(last)}`,
    cancel: { label: 'Annuler', flat: true },
    ok: { label: 'Retirer', color: 'negative' },
  }).onOk(doRemove);
}

// Historique des séries d'un exo.
const histOpen = ref(false);
const histLeg = ref<ComboLeg | null>(null);
function openHistory(leg: ComboLeg) {
  histLeg.value = leg;
  histOpen.value = true;
}

// Barre principale = les 3 ÉTATS d'un challenge (sur une seule ligne).
const TABS = [
  { value: 'active', label: 'En cours' },
  { value: 'done', label: 'Terminés' },
  { value: 'abandoned', label: 'Abandonnés' },
];
// Exercices (stats) & Succès sont accessibles via le bouton dédié (menu), pas la barre.
const ALL_TABS = [...TABS.map((t) => t.value), 'exos', 'ach'];
const tab = ref(ALL_TABS.includes(String(route.query.tab)) ? String(route.query.tab) : 'active');

const LIST_TABS = ['active', 'done', 'abandoned'];
const shown = computed(() => store.list.filter((c) => c.status === tab.value));
const unlocked = computed(() => new Set(store.unlocked));
const unlockedCount = computed(() => ACHIEVEMENTS.filter((a) => unlocked.value.has(a.code)).length);
const xpInfo = computed(() => computeLevel(challengeXpPoints(store.list)));
// Décomposition XP (reps vs prime) affichée sur les défis terminés.
const xpb = (c: Challenge) => challengeXpBreakdown(c);
const comboXpb = (c: ComboChallenge) => comboXpBreakdown(c);

// Capacité (jetons) par voie, pour que l'utilisateur s'organise.
function laneChallenges(lane: ChallengeLane): LaneChallenge[] {
  return store.list
    .filter((c) => c.status === 'active' && challengeLane(c) === lane)
    .map((c) => ({
      accessory: isAccessoryMuscle(c.muscle_primary),
      durationDays: c.duration_days,
    }));
}
const muscuUsed = computed(() => usedTokens(laneChallenges('muscu')));
const cardioUsed = computed(() => usedTokens(laneChallenges('cardio')));
const tennisUsed = computed(() => usedTokens(laneChallenges('tennis')));
const muscuAccUsed = computed(() => accessoryCount(laneChallenges('muscu')) >= 1);
const BUDGET = CHALLENGE_TOKEN_BUDGET;
// Défis actifs groupés par voie (affichage en tuiles).
const LANE_GROUPS: { key: ChallengeLane; label: string }[] = [
  { key: 'muscu', label: '💪 Musculation' },
  { key: 'cardio', label: '🏃 Cardio' },
  { key: 'tennis', label: '🎾 Tennis' },
];
const activeGroups = computed(() =>
  LANE_GROUPS.map((g) => ({
    ...g,
    list: store.list.filter((c) => c.status === 'active' && challengeLane(c) === g.key),
  })),
);
// Coût d'un défi (badge sur la carte).
function cardCostLabel(c: Challenge): string {
  if (isAccessoryMuscle(c.muscle_primary)) return 'accessoire';
  const n = tokenCost(c.duration_days);
  return `${n} jeton${n > 1 ? 's' : ''}`;
}

function st(c: Challenge) {
  return challengeStats(c);
}
// Défi bientôt EXPIRÉ et pas fini → encadré rouge (dernier(s) jour(s), < 100 %).
function expiring(c: Challenge): boolean {
  const s = st(c);
  return s.daysLeft <= 2 && s.completionPct < 100;
}
function bal(c: Challenge) {
  return challengeLiveBalance(c);
}
function unitOf(c: Challenge) {
  return challengeValueUnit(c.unit, c.exercise_id);
}
// Mode Séries : le total est en séries → on affiche AUSSI le total de reps (fa798da3).
function isSetsMode(c: Challenge) {
  return c.config.count_mode === 'sets';
}
// Unité de l'avance/retard : SÉRIES en mode Séries (le solde se compte en séries),
// sinon l'unité de l'exo (reps / sec / min / km).
function balUnit(c: Challenge) {
  return isSetsMode(c) ? 'séries' : unitOf(c);
}
// Badge affiché : RETARD du jour (cible d'aujourd'hui non atteinte) prioritaire,
// sinon l'AVANCE (surplus) de challengeLiveBalance. Cohérent avec le rose de la barre.
function balShown(c: Challenge) {
  const d = challengeDeficit(c);
  return d > 0 ? -d : Math.max(0, bal(c));
}
// Barre de progression SEGMENTÉE (ticket 3c51883b) : découpée par SÉRIES (mode séries) ou
// par JOURS (reps/durée), plafonnée à 30 segments pour rester lisible.
// Mode SÉRIES : le remplissage suit les SÉRIES FAITES / total de séries (ticket 38b10eea) —
// PAS le % de jours complétés (sinon la barre n'était pas divisée par le nb de séries).
// Ce qu'on DEVRAIT avoir fait pour tenir la cible d'AUJOURD'HUI (jour inclus) −
// ce qui est fait. Sert au repère « où je devrais en être » (rose). Contrairement à
// challengeLiveBalance (qui ne pénalise pas la journée en cours), on compte la cible
// du jour tout de suite → le sportif voit son objectif du jour restant.
function challengeDeficit(c: Challenge): number {
  if (c.format === 'cumulative') return Math.max(0, -bal(c)); // cumulé : cible prorata déjà calculée
  const s = st(c);
  const di = Math.min(Math.max(0, s.dayIndex), c.duration_days - 1);
  const expected = c.daily_targets.slice(0, di + 1).reduce((a, b) => a + b, 0);
  return Math.max(0, expected - s.totalDone);
}
// Total de référence du défi (dans l'unité de progression) : cumulé → config.total,
// sinon la somme des cibles quotidiennes.
function challengeRefTotal(c: Challenge): number {
  if (c.format === 'cumulative') return c.config.total ?? 0;
  return c.daily_targets.reduce((a, b) => a + b, 0);
}
// n = nb de cellules, on = cellules FAITES (jaune), expected = cellules où l'on
// DEVRAIT en être pour tenir les temps (le retard, rose : de `on`+1 à `expected`).
// Le retard/le fait sont ramenés à l'échelle du défi ; on force AU MOINS 1 cellule
// dès qu'il y a du fait / du retard pour qu'un petit écart reste VISIBLE.
function challengeSegs(c: Challenge): { n: number; on: number; expected: number } {
  const behind = challengeDeficit(c); // retard du jour, dans l'unité de progression
  const cells = (val: number, total: number, n: number) =>
    val > 0 ? Math.min(n, Math.max(1, Math.round((val / total) * n))) : 0;
  // Cumulé OU défi X/jour : on segmente par UNITÉ (série/rep) tant qu'un total est
  // connu ; sinon (rien de chiffré) on retombe sur une segmentation par JOURS.
  const total = challengeRefTotal(c);
  if (total > 0) {
    const done = st(c).totalDone; // fait, même unité que le total
    const n = Math.min(30, Math.max(1, total));
    const on = cells(done, total, n);
    const expected = Math.min(n, on + cells(behind, total, n));
    return { n, on, expected };
  }
  const n = Math.min(30, Math.max(1, c.duration_days)); // nb de jours
  const on = Math.min(n, Math.round((st(c).completionPct / 100) * n));
  return { n, on, expected: on };
}
/** Unité du CUMUL des séries. ⚠️ Le champ s'appelle `reps` partout, mais il porte une
 *  VALEUR : des secondes sur un défi au chrono (gainage, corde, burpees…), des MINUTES
 *  sur une vraie sortie. Afficher « 240 reps » là où le joueur a tenu 4 minutes, c'est
 *  mentir sur son effort — et cette copie écrivait « sec » en dur, donc elle mentait
 *  aussi sur une marche. `challengeValueUnit`, jamais `unitOf` : un cumul de séries ne
 *  se compte JAMAIS en séries. */
function repUnitOf(c: Challenge) {
  return challengeValueUnit(c.unit, c.exercise_id);
}
function totalRepsOf(c: Challenge) {
  return challengeTotalReps(c);
}
function fmtName(f: string) {
  return formatOption(f)?.name ?? f;
}
function statusLabel(c: Challenge) {
  return c.status === 'active' ? 'en cours' : c.status === 'done' ? 'terminé' : 'abandonné';
}

// Période des stats (Tout / Semaine / Mois) — filtre les jours de progression.
const statsRange = ref<'all' | 'week' | 'month'>('all');
function setRange(v: string) {
  statsRange.value = v as 'all' | 'week' | 'month';
}
function inStatsRange(dateStr: string): boolean {
  if (statsRange.value === 'all') return true;
  const days = statsRange.value === 'week' ? 7 : 30;
  const t = Date.parse(dateStr + 'T00:00:00');
  return !Number.isNaN(t) && t >= Date.now() - days * 86_400_000;
}
// Agrégat par exercice : nb de challenges + itérations cumulées.
const exoAgg = computed(() => {
  const map = new Map<
    string,
    // ⚠️ `unit` porte le type du contrat, pas `string` : c'est lui qui garantit au
    // compilateur que `challengeValueUnit` reçoit une unité valide — élargir à `string`
    // rouvrirait la porte à une unité inventée.
    { id: string; name: string; unit: Challenge['unit']; count: number; total: number }
  >();
  const ok = (d: string) => inStatsRange(d); // filtre période (Tout / Semaine / Mois)
  for (const c of store.list) {
    const total = c.progress.filter((p) => ok(p.date)).reduce((a, p) => a + (p.done || 0), 0);
    if (total <= 0 && statsRange.value !== 'all') continue; // rien sur la période → on masque
    const cur = map.get(c.exercise_id) ?? {
      id: c.exercise_id,
      name: c.exercise_name,
      unit: c.unit,
      count: 0,
      total: 0,
    };
    cur.count += 1;
    cur.total += total;
    map.set(c.exercise_id, cur);
  }
  // CENTRALISE (d8aa8e2b) : inclut aussi les reps des Défi 360 (par exo), pour que
  // les stats couvrent TOUTES les origines, pas seulement les petits défis.
  for (const combo of comboStore.list) {
    for (const leg of combo.legs ?? []) {
      const total = (leg.progress ?? [])
        .filter((p) => ok(p.date))
        .reduce((a, p) => a + (p.reps || 0), 0);
      if (total <= 0 && statsRange.value !== 'all') continue;
      const cur = map.get(leg.exercise_id) ?? {
        id: leg.exercise_id,
        name: leg.exercise_name,
        unit: 'reps',
        count: 0,
        total: 0,
      };
      cur.count += 1;
      cur.total += total;
      map.set(leg.exercise_id, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
});

async function goNew() {
  await router.push('/challenges/new');
}
async function goDetail(id: string) {
  await router.push(`/challenges/${id}`);
}

onMounted(async () => {
  try {
    await store.fetchMine();
    await comboStore.fetchMine().catch(() => undefined);
    await character.fetchMine().catch(() => undefined); // pour l'énergie (garde-fou déficit)
    await store.fetchAchievements();
    void loadEquip();
    // Rattrapage : débloque les succès mérités mais pas encore enregistrés.
    await store.unlock(evaluateAchievements(store.list));
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e instanceof Error ? e.message : 'Chargement impossible.',
    });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.ch-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.ch-page.embedded {
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 14px;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.head-rank {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  flex: none;
}
.p-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
/* Les 3 états sur UNE ligne : contrôle segmenté plein largeur. */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
}
.tab {
  flex: 1;
  padding: 9px 8px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    transform 0.1s;
  &:hover {
    color: var(--text);
  }
  &.on {
    color: var(--accent-ink, #15120e);
    background: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  &.on:active {
    transform: scale(0.97);
  }
}
.back-to-list {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 0;
  margin-bottom: 12px;
}
.empty {
  color: var(--dim);
  padding: 24px 0;
}

/* Bandeau de capacité (jetons) */
.cap-card {
  margin-bottom: 12px;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--surface);
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
.cap-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  min-width: 30px;
}

/* Segmenté Solo / Défi 360 */
.seg2 {
  display: flex;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 14px;
}
.seg2-b {
  flex: 1;
  padding: 9px 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}
.seg2-b.on {
  background: var(--accent);
  color: var(--accent-ink, #15120e);
}

/* Défi 360 (onglet) */
.combo-empty {
  text-align: center;
  color: var(--dim);
  padding: 20px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}
/* Récap d'un Défi 360 terminé / abandonné */
.combo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  color: var(--text);
}
.cc-title {
  font-weight: 700;
  font-size: 15px;
}
.cc-sub {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.cc-xp {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.xp-pill {
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 8px;
  line-height: 1.5;
}
.xp-pill.reps {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}
.xp-pill.dur {
  background: color-mix(in srgb, var(--d2) 20%, transparent);
  color: var(--d2);
}
.xp-pill.bonus {
  background: color-mix(in srgb, var(--d1) 20%, transparent);
  color: var(--d1);
}
.xp-pill.surpass {
  background: color-mix(in srgb, var(--d3) 20%, transparent);
  color: var(--d3);
}
.cc-badge {
  flex: none;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 3px 9px;
}
.cc-badge.done {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.cc-badge.abandoned {
  color: var(--dim);
  background: var(--surface-2, #2b241b);
}
.combo360-head {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.c3-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.c3-pct {
  font-size: 26px;
  font-weight: 800;
  color: var(--accent);
}
.c3-week {
  font-size: 13px;
  font-weight: 600;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  /* La semaine pousse le 🗑 tout à droite : il ne se colle pas au pourcentage. */
  margin-left: auto;
}
/* ⚠️ 44 px de cible tactile (règle mobile du projet), mais un dessin DISCRET : c'est une
   action destructrice qu'on ne doit pas frôler par accident en consultant son défi. */
.c3-stop {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  margin: -10px -8px -10px 2px;
  background: none;
  border: 0;
  color: var(--dim);
  font-size: 15px;
  cursor: pointer;
  opacity: 0.75;
}
.c3-stop:hover,
.c3-stop:focus-visible {
  color: var(--d4);
  opacity: 1;
}
/* Ligne d'actions du Défi 360 : « Générer une séance » (extensible) + « Exporter ». */
/* 🏁 LA CLÔTURE EST UNE ACTION POSITIVE — l'accent, là où l'abandon juste en dessous
   reste gris : deux boutons de même teinte se liraient comme le même geste, et l'un
   des deux est destructeur. Cible tactile 44 px (règle mobile du projet). */
.c3-finish {
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
.c3-cta-row {
  display: flex;
  gap: 8px;
}
.c3-cta-grow {
  flex: 1;
  min-width: 0;
}
.combo-leg {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 7px 10px;
  margin-bottom: 6px;
}
/* ✅ Exo FINI (palier maximal franchi) : renvoyé en bas de liste et grisé — plus rien à y
   gagner. Même langage que la fiche du 360 (`.leg.done`) : le même exo doit se lire pareil
   aux deux endroits. L'opacité ne descend pas plus bas (ça reste du travail accompli, et
   l'historique des séries s'ouvre toujours) et rien n'est rendu inerte : on peut corriger. */
.combo-leg.done {
  background: var(--surface-2);
  opacity: 0.62;
}
/* Barre + actions sur une ligne (compact). */
.cl-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
}
/* Barre segmentée : une case par série (cible + supplémentaires, sur plusieurs lignes) */
/* Grille de cellules UNIFORMES (mêmes dimensions faites/à faire) réparties
   proprement sur plusieurs lignes ; chaque colonne accueille « 12×15kg ». */
.tap {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
/* La prochaine case à faire porte le « ＋ » : c'est là qu'on touche pour ajouter. */
.seg.next {
  color: var(--text);
  font-weight: 800;
  font-size: 14px;
}
.seg-bar {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 4px;
}
/* Mode reps : barre continue (l'objectif en reps peut être élevé → pas de segments). */
.reps-bar {
  flex: 1;
  min-width: 0;
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
  overflow: hidden;
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
   restent des repères vides teintés. */
.seg {
  min-height: 22px;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  /* Série À FAIRE : plus visible (fond légèrement teinté + liseré) au lieu de noir sur noir. */
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
  color: var(--dim);
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
.cl-actions {
  flex: none;
  display: flex;
  gap: 6px;
}
.cl-add {
  padding: 6px 14px;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.cl-add.neg {
  border-color: var(--d4);
  color: var(--d4);
}
/* Chrono d'un exo de durée (Défi 360, liste). */
.cl-chrono {
  padding: 6px 14px;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.cl-chrono.running {
  background: var(--accent);
  color: var(--bg);
}
.cl-corr {
  flex: none;
  width: 38px;
  align-self: stretch;
  border-radius: 9px;
  border: 1px solid var(--d4);
  background: transparent;
  color: var(--d4);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}
.cl-corr:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Tuiles de défis (En cours), groupées par voie */
.lane-group {
  margin-bottom: 16px;
}
.lane-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.ch-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.ch-tile {
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-align: left;
  padding: 11px 12px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  cursor: pointer;
}
.ch-tile:active {
  transform: scale(0.99);
}
/* Défi bientôt expiré et pas fini → encadré rouge d'alerte. */
.ch-tile.expiring {
  border-color: var(--d4);
  box-shadow: 0 0 0 1px var(--d4) inset;
}
.ct-expire {
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 14%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
}
.ct-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
/* Vignette d'exo (identifier l'exo d'un coup d'œil) : image bundlée, sinon icône. */
.ch-ic {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-2, #2b241b);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.ch-ic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ct-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
  line-height: 1.2;
}
/* Coût (jetons / accessoire) : sur sa PROPRE ligne sous le titre, en petite pastille. */
.ct-cost {
  align-self: flex-start;
  margin-top: 1px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}
.ct-cost.accessoire {
  color: var(--dim);
  border-color: var(--line);
}
.ct-sub {
  font-size: 11px;
  color: var(--dim);
}

.ch-card {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
  cursor: pointer;
}
.cc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cc-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
}
.cc-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--dim);
}
.cc-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.cc-badge.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.cc-badge.done {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.cc-badge.abandoned {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}
.cc-today {
  flex: none;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}
.cc-today.done {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 18%, transparent);
}
.cc-today.todo {
  color: var(--d3);
  background: color-mix(in srgb, var(--d3) 18%, transparent);
}
.cc-meta {
  font-size: 12px;
  color: var(--dim);
  text-transform: capitalize;
  margin-top: 4px;
}
/* Badge « poids du corps » (aucun matériel) — cyan, lisible. */
/* Pastille ronde 🤸 (poids du corps, aucun matériel) — challenges + Défi 360. */
.bw-ic {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 11px;
  line-height: 1;
  border-radius: 50%;
  background: rgba(95, 208, 224, 0.15);
  border: 1px solid #5fd0e0;
  vertical-align: middle;
  margin-left: 5px;
}
.bar {
  position: relative;
  height: 8px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
  margin: 9px 0 6px;
}
/* Graduation tous les 5 % (segmente la barre pour lire la position d'un coup d'œil). */
.bar::before {
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
/* Repère « dans les temps » : trait vertical à la position théorique. */
.c3-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
/* Barre SEGMENTÉE : un segment par série (mode séries) ou par jour (reps/durée). */
.seg-line {
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  gap: 2px;
  height: 8px;
  margin: 9px 0 6px;
}
.seg-cell {
  background: var(--surface-2);
  border-radius: 2px;
}
.seg-cell.on {
  background: var(--accent);
}
/* Retard : les cellules où l'on devrait déjà en être (rose). */
.seg-cell.behind {
  background: #ff6a9c;
}
.cc-sub {
  font-size: 11.5px;
  color: var(--dim);
}
.cc-bal {
  margin-top: 6px;
  display: inline-block;
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
.cc-bal.ahead {
  color: var(--d1);
  background: color-mix(in srgb, var(--d1) 16%, transparent);
}
.cc-bal.behind {
  color: var(--d4);
  background: color-mix(in srgb, var(--d4) 16%, transparent);
}
.cc-bal.even {
  color: var(--dim);
  background: color-mix(in srgb, var(--dim) 14%, transparent);
}

.range-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.range-tab {
  flex: 1;
  padding: 7px 0;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.range-tab.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
}
.exo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 8px;
}
.exo-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.exo-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}
.exo-reps {
  text-align: right;
}
.er-v {
  display: block;
  font-size: 22px;
  font-weight: 600;
  color: var(--accent);
}
.er-l {
  font-size: 10px;
  color: var(--dim);
  text-transform: uppercase;
}

.ach-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.ach {
  --rar: var(--dim);
  position: relative;
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 22px 10px 16px;
  color: var(--dim-2);
  opacity: 0.6;
}
.ach.r-common {
  --rar: var(--dim);
}
.ach.r-rare {
  --rar: #5aa9e6;
}
.ach.r-epic {
  --rar: #b57bff;
}
.ach.r-legendary {
  --rar: var(--accent);
}
.ach.on {
  opacity: 1;
  color: var(--text);
  border-color: var(--rar);
}
.ach.on.r-legendary {
  box-shadow: 0 0 18px rgba(255, 210, 63, 0.22);
}
.ach.on .q-icon {
  color: var(--rar);
}
.ach-rarity {
  position: absolute;
  top: 7px;
  left: 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--rar);
  opacity: 0.9;
}
.ach:not(.on) .ach-rarity {
  opacity: 0.5;
}
.ach-t {
  font-weight: 700;
  font-size: 13px;
  margin-top: 6px;
}
.ach-d {
  font-size: 11px;
  color: var(--dim);
  margin-top: 3px;
  line-height: 1.25;
}
.ach-lock {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--dim-2);
}
.ach-count {
  font-size: 12px;
  color: var(--dim);
  margin: 4px 2px 10px;
}

/* Rang global / XP (F → SSS) */
.level-card {
  --rank: var(--dim);
  background: var(--surface-2);
  /* ⚠️ Repli EXPLICITE. Les 9 variantes `.rank-f` … `.rank-sss` qui définissaient
     `--rank` ont été retirées avec les rangs F→SSS ; la variable n'était donc plus
     jamais posée et cette bordure ne s'affichait pas du tout. */
  border: 1px solid var(--rank, var(--accent));
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.lvl-top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rank-info {
  flex: 1;
  min-width: 0;
}
.rank-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.lvl-xp {
  font-size: 13px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.lvl-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  overflow: hidden;
  margin: 12px 0 6px;
}
.lvl-fill {
  height: 100%;
  background: var(--rank);
  border-radius: 999px;
  transition: width 0.4s ease;
}
.lvl-next {
  font-size: 11.5px;
  color: var(--dim);
  b {
    color: var(--rank);
  }
}
</style>
