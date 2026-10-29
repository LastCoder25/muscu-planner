<template>
  <!-- 🪄 LE PLANIFICATEUR D'EXPÉDITIONS (2026-10-11, demandé) : on règle la chance de réussite
       voulue et ce qu'on optimise, il propose les départs possibles avec les effectifs libres ;
       on en lance un, ou tous. Le calcul est fait par `useExpeditionPlanner`.
       ⚠️ DEUX PANNEAUX (2026-10-11, demandé) : `section="plan"` propose les expéditions,
       `section="repart"` répartit l'effectif sur la base et les lieux tenus. Même composable
       (réglages partagés : réussite visée, héros), deux calculs et deux résultats distincts. -->
  <div class="xp-plan">
    <p v-if="section === 'repart'" class="pl-note">
      Redistribue ton héros et tes champions de zéro pour attaquer au mieux : les plus forts là d’où
      ils rejoignent le plus vite le reste de l’île en attaque combinée. La garde des lieux reste
      aux miliciens.
    </p>
    <!-- 🎯 Les objectifs du jour : la progression se lit ici, là où l'on lance ses vagues. -->
    <DailyObjectives
      v-if="section === 'plan' && daily?.length"
      :states="daily"
      :reward="dailyReward ?? undefined"
    />
    <!-- 🔁 LA DERNIÈRE VAGUE (demandé) : les mêmes équipes sur des lieux du même type, sans rien
         recalculer. Le store refuse ce que l'envoi manuel refuserait ; ce qui ne repart pas est
         listé avec sa raison. -->
    <div v-if="section === 'plan' && lastWave" class="pl-wave" data-test="wave">
      <button type="button" class="pl-all" :disabled="!!launching" @click="relaunchWave">
        {{
          launching === 'wave'
            ? '⏳ Départs…'
            : `🔁 Relancer la dernière vague (${lastWave.trips.length})`
        }}
      </button>
      <div class="pl-sum">
        <span class="pl-pill dim">il y a {{ waveAge }}</span>
        <span v-for="c in waveChips" :key="c.key" class="pl-pill">{{ c.label }} ×{{ c.n }}</span>
      </div>
      <div v-if="waveResult" class="pl-sum" data-test="wave-result">
        <span class="pl-pill ok"
          >✅ {{ waveResult.sent }} parti{{ waveResult.sent > 1 ? 's' : '' }}</span
        >
        <span v-for="(s, i) in waveResult.skipped" :key="i" class="pl-pill warn">
          ⚠️ {{ s.label }} : {{ s.reason }}
        </span>
      </div>
    </div>
    <div v-if="section === 'plan'" class="pl-modes" role="radiogroup" aria-label="Optimiser">
      <button
        v-for="m in MODES"
        :key="m.id"
        type="button"
        class="pl-mode"
        :class="{ on: mode === m.id }"
        role="radio"
        :aria-checked="mode === m.id"
        @click="mode = m.id"
      >
        <span class="pm-emo">{{ m.emo }}</span>
        <span class="pm-title">{{ m.title }}</span>
        <span class="pm-sub">{{ m.sub }}</span>
      </button>
    </div>

    <div v-if="section === 'plan'" class="pl-row">
      <span class="pl-lab">🎯 Réussite au moins</span>
      <div class="pl-chips">
        <button
          v-for="t in THRESHOLDS"
          :key="t"
          type="button"
          class="pl-chip"
          :class="{ on: threshold === t }"
          @click="threshold = t"
        >
          {{ t }} %
        </button>
      </div>
    </div>
    <div v-if="section === 'plan'" class="pl-row">
      <span class="pl-lab">Qui peut partir</span>
      <div class="pl-chips">
        <button
          type="button"
          class="pl-chip"
          :class="{ on: withHero && heroFree, off: !heroFree }"
          :disabled="!heroFree"
          :title="heroFree ? '' : 'Ton héros n’est pas disponible'"
          @click="withHero = !withHero"
        >
          🧝 Héros{{ heroFree ? '' : ' (pris)' }}
        </button>
        <button
          v-if="section === 'plan'"
          type="button"
          class="pl-chip"
          :class="{ on: withGarrisons }"
          title="Faire sortir les champions en garnison sur tes lieux fixes"
          @click="withGarrisons = !withGarrisons"
        >
          🏰 Garnisons
        </button>
      </div>
    </div>

    <!-- 🎒 LES CONSOMMABLES DANS LES SIMULATIONS (demandé) : on coche ceux qu'on accepte
         d'engager ; une expédition n'en emporte que si son effectif ne passe pas le seuil
         (attaque et embuscades), et alors le minimum, tant qu'il en reste en stock — son
         🎯 % et son trajet les comptent. Rien de coché = aucun. -->
    <div v-if="section === 'plan' && supplyStock.length" class="pl-row">
      <span class="pl-lab">🎒 Consommables à engager</span>
      <div class="pl-chips">
        <button
          v-for="s in supplyStock"
          :key="s.id"
          type="button"
          class="pl-chip"
          :class="{ on: s.on }"
          :aria-pressed="s.on"
          :title="`${s.def.name} — ${s.def.what}`"
          @click="toggleSupply(s.id)"
        >
          {{ s.def.emoji }} {{ s.def.name }} <span class="pl-n">×{{ s.n }}</span>
        </button>
      </div>
    </div>
    <p v-if="section === 'plan'" class="pl-pool">
      👥 {{ poolInfo.base }} champion{{ poolInfo.base > 1 ? 's' : '' }} libre{{
        poolInfo.base > 1 ? 's' : ''
      }}
      à la base<template v-if="withGarrisons">
        · {{ poolInfo.garrison }} en garnison prêt{{ poolInfo.garrison > 1 ? 's' : '' }}</template
      ><template v-if="withHero && heroFree"> · 🧝 héros</template>
    </p>
    <div class="pl-gos">
      <button
        v-if="section === 'plan'"
        type="button"
        class="pl-go"
        :disabled="running"
        @click="compute"
      >
        <span v-if="running">⏳ Calcul… {{ Math.round(progress * 100) }} %</span>
        <span v-else>🪄 {{ rows ? 'Recalculer' : 'Proposer des expéditions' }}</span>
      </button>
      <!-- 🧭 RÉPARTIR : placer tout l’effectif (base, lieux tenus, forteresse) pour couvrir
           l’île ; le 🪄 part ensuite de ces garnisons. -->
      <button
        v-else
        type="button"
        class="pl-go"
        :disabled="repoRunning"
        title="Répartir tout ton effectif sur la base et tes lieux tenus pour couvrir l’île"
        @click="onRepartir"
      >
        <span v-if="repoRunning">⏳ Calcul…</span>
        <span v-else>👥 {{ repoTeams ? 'Recalculer' : 'Répartir l’effectif' }}</span>
      </button>
    </div>
    <!-- 🏥 Des champions à l'infirmerie : on propose de les soigner pour les inclure (demandé). -->
    <div v-if="section === 'repart' && healAsk && repoHealable.advs.length" class="pl-heal">
      <p class="ph-txt">
        🏥 À l’infirmerie : {{ repoHealable.advs.map((a) => a.name).join(', ') }}. Les soigner pour
        les inclure dans la répartition ?
      </p>
      <div class="ph-btns">
        <button
          type="button"
          class="pl-go"
          :disabled="!repoHealable.afford || repoRunning"
          :title="
            repoHealable.afford ? '' : `Il te manque ${repoHealable.cost - repoHealable.gold} 🪙`
          "
          @click="chooseHeal(true)"
        >
          ⛑️ Soigner et répartir · {{ repoHealable.cost }} 🪙
        </button>
        <button type="button" class="pl-chip" @click="chooseHeal(false)">
          Les laisser à l’infirmerie
        </button>
      </div>
      <p v-if="!repoHealable.afford" class="ph-miss">
        Pas assez d’or : il te manque {{ repoHealable.cost - repoHealable.gold }} 🪙.
      </p>
    </div>
    <div v-if="section === 'plan' && running" class="pl-bar">
      <div class="pl-fill" :style="{ width: Math.round(progress * 100) + '%' }" />
    </div>

    <template v-if="section === 'plan' && rows && !running">
      <p v-if="!rows.length && mode === 'rifts' && !riftCount" class="pl-empty">
        Aucune faille ouverte à attaquer sur la carte.
      </p>
      <p v-else-if="!rows.length" class="pl-empty">
        Aucune expédition n’atteint {{ threshold }} % avec les effectifs libres.
      </p>
      <template v-else>
        <div class="pl-sum">
          <span class="pl-pill">{{ rows.length }} expédition{{ rows.length > 1 ? 's' : '' }}</span>
          <span class="pl-pill">👥 {{ engaged }}</span>
          <span class="pl-pill">⏱️ {{ fmt(longest) }} au plus</span>
          <span v-if="totalXp" class="pl-pill">⭐ {{ totalXp }} XP</span>
        </div>
        <button type="button" class="pl-all" :disabled="!!launching" @click="launchAll">
          {{ launching === '*' ? '⏳ Départs…' : `🚀 Tout lancer (${rows.length})` }}
        </button>
        <div class="pl-list">
          <div v-for="r in rows" :key="r.key" class="pl-tile">
            <div class="pt-head">
              <span class="pt-emo" aria-hidden="true">{{ poiEmo(r.poi) }}</span>
              <span class="pt-name">{{ poiLabel(r.poi) }}</span>
              <span class="pt-rank" :style="{ '--rk': rankOf(r.poi).color }">
                {{ rankOf(r.poi).name }} ★{{ rankOf(r.poi).star }}
              </span>
            </div>
            <!-- ⚔️ Attaque combinée : un groupe par point de départ, tous arrivent ensemble. -->
            <template v-if="r.wings">
              <span class="pt-comb">⚔️ Attaque combinée — tout le monde arrive ensemble</span>
              <div v-for="(w, i) in r.wings" :key="i" class="pt-team">
                <span class="pt-from">{{ placeOf(w.from) }}</span>
                <span v-if="w.hero" class="pt-mem hero">🧝 Héros</span>
                <span v-for="a in w.advs" :key="a.id" class="pt-mem">
                  {{ advTitle(a)?.emoji ?? '🗡️' }} {{ a.name }}
                  <span v-if="skillsOf(a)" class="pt-sk" :title="skillsTitle(a)">{{
                    skillsOf(a)
                  }}</span>
                </span>
              </div>
            </template>
            <div v-else class="pt-team">
              <span v-if="r.from" class="pt-from">🏰 depuis {{ poiLabel(r.from) }}</span>
              <span v-if="r.hero" class="pt-mem hero">🧝 Héros</span>
              <span v-for="a in r.advs" :key="a.id" class="pt-mem">
                {{ advTitle(a)?.emoji ?? '🗡️' }} {{ a.name }}
                <span v-if="skillsOf(a)" class="pt-sk" :title="skillsTitle(a)">{{
                  skillsOf(a)
                }}</span>
              </span>
            </div>
            <div class="pt-foot">
              <span class="pt-stat" :class="winClass(r.win)"
                >🎯 {{ Math.round(r.win * 100) }} %</span
              >
              <span class="pt-stat">⏱️ {{ fmt(r.tripMin) }}</span>
              <span v-if="r.xp" class="pt-stat">⭐ {{ r.xp }}</span>
              <span
                v-if="r.supplies.length"
                class="pt-stat pt-sup"
                :title="r.supplies.map((id) => SUPPLIES[id].name).join(' · ')"
                >🎒 {{ r.supplies.map((id) => SUPPLIES[id].emoji).join('') }}</span
              >
              <!-- 🔎 OUVRIR (demandé) : le lieu s'affiche comme un envoi manuel, l'équipe proposée
                   déjà cochée — on y choisit les consommables, puis on lance d'ici-là. -->
              <button
                type="button"
                class="pt-open"
                :disabled="!!launching"
                title="Ouvrir comme un envoi manuel : ajuster l’équipe et les consommables"
                @click="emit('open', r)"
              >
                🔎 Ouvrir
              </button>
              <button type="button" class="pt-go" :disabled="!!launching" @click="launch(r)">
                {{ launching === r.key ? '⏳' : 'Lancer' }}
              </button>
            </div>
          </div>
        </div>
      </template>
      <p v-if="unreachable.length" class="pl-note">
        {{ unreachable.length }} lieu{{ unreachable.length > 1 ? 'x' : '' }} hors de portée à
        {{ threshold }} % avec ce qui reste.
      </p>
    </template>
    <p v-if="section === 'repart' && (repoMissing.hero || repoMissing.advs.length)" class="pl-miss">
      ⏳ Pas encore disponibles :
      <template v-if="repoMissing.hero"
        >🧝 héros<template v-if="repoMissing.advs.length">, </template></template
      >{{ repoMissing.advs.map((a) => a.name).join(', ') }} — ils restent là où ils sont attendus
      (⏳), et « Répartir » place les autres autour d’eux.
    </p>
    <template v-if="section === 'repart' && repoTeams && !repoRunning">
      <p v-if="!repoTeams.length" class="pl-empty">Personne n’est disponible à répartir.</p>
      <template v-else>
        <div class="pl-list">
          <div v-for="g in repoTeams" :key="g.key" class="pl-tile spot">
            <div class="pt-head">
              <span class="pt-name">{{ placeOf(g.spot) }}</span>
            </div>
            <div class="pt-team">
              <span
                v-if="g.hero"
                class="pt-mem hero"
                :class="{ fixed: g.fixed.has(DEPLOY_HERO_ID) }"
                :title="g.fixed.has(DEPLOY_HERO_ID) ? FIXED_TITLE : undefined"
              >
                <template v-if="g.fixed.has(DEPLOY_HERO_ID)">⏳ </template>🧝 Héros
              </span>
              <span
                v-for="a in g.advs"
                :key="a.id"
                class="pt-mem"
                :class="{ fixed: g.fixed.has(a.id) }"
                :title="g.fixed.has(a.id) ? FIXED_TITLE : undefined"
              >
                <template v-if="g.fixed.has(a.id)">⏳ </template>{{ advTitle(a)?.emoji ?? '🗡️' }}
                {{ a.name }}
                <span v-if="skillsOf(a)" class="pt-sk" :title="skillsTitle(a)">{{
                  skillsOf(a)
                }}</span>
              </span>
            </div>
          </div>
        </div>
        <p v-if="!repoMoves.length" class="pl-empty">✅ Tout le monde est déjà à sa place.</p>
        <template v-else>
          <p class="pl-lab">Les trajets à faire</p>
          <button type="button" class="pl-all" :disabled="!!launching" @click="launchAllMoves">
            {{ launching === '*' ? '⏳ En route…' : '✅ Valider : tout le monde part' }}
          </button>
          <p class="pl-note">
            Tout le monde part d’un coup : les lieux se libèrent avant que les autres arrivent.
          </p>
          <div class="pl-list">
            <div v-for="m in repoMoves" :key="m.key" class="pl-tile mv">
              <div class="pt-head">
                <span class="pt-route">
                  {{ placeOf(m.from) }} <span class="pt-arrow">→</span> {{ placeOf(m.to) }}
                </span>
              </div>
              <div class="pt-team">
                <span v-if="m.hero" class="pt-mem hero">🧝 Héros</span>
                <span v-for="a in m.advs" :key="a.id" class="pt-mem">
                  {{ advTitle(a)?.emoji ?? '🗡️' }} {{ a.name }}
                </span>
              </div>
              <div class="pt-foot">
                <span class="pt-stat">🚶 {{ fmt(m.min) }}</span>
              </div>
            </div>
          </div>
        </template>
        <p class="pl-note">
          Une fois en place, ouvre 🪄 et coche 🏰 Garnisons : les expéditions partiront de ces
          endroits.
        </p>
      </template>
    </template>
    <p v-if="section === 'plan'" class="pl-note">
      Lieux fixes ennemis et armées en marche ne sont pas proposés : ce sont des choix à faire lieu
      par lieu.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PlannerRow, useExpeditionPlanner } from '@/composables/useExpeditionPlanner';
import { advRuneSkills, advTitle, type Adventurer } from '@/lib/adventurers';
import { SKILLS, skillLevelTag } from '@/lib/skillRunes';
import { characterRank } from '@/lib/characterRank';
import { formatDurationMin } from '@/lib/duration';
import { poiDifficultyLevel, poiEmo, poiLabel, type Poi } from '@/lib/expedition';
import type { PlanMode } from '@/lib/expeditionPlanner';
import { DEPLOY_HERO_ID } from '@/lib/deployPlan';
import { SUPPLIES, type SupplyId } from '@/lib/supplies';
import { waveCounts } from '@/lib/lastWave';
import DailyObjectives from '@/components/DailyObjectives.vue';
import type { ObjectiveState } from '@/lib/dailyObjectives';
import { absenceDuration } from '@/lib/absenceSummary';

const props = defineProps<{
  planner: ReturnType<typeof useExpeditionPlanner>;
  /** Le panneau affiché : proposer des expéditions, ou répartir l'effectif. */
  section: 'plan' | 'repart';
  /** 🎯 Les objectifs du jour (état dérivé par la page) ; absent ou vide = pas de tuile. */
  daily?: ObjectiveState[];
  /** Le consommable du jour (versé quand les trois sont atteints). */
  dailyReward?: SupplyId | null;
}>();
const emit = defineEmits<{ open: [row: PlannerRow] }>();
const {
  threshold,
  mode,
  riftCount,
  withGarrisons,
  withHero,
  supplyStock,
  toggleSupply,
  heroFree,
  poolInfo,
  running,
  progress,
  rows,
  unreachable,
  launching,
  compute,
  launch,
  launchAll,
  lastWave,
  waveResult,
  relaunchWave,
  repoTeams,
  repoMoves,
  repoRunning,
  repoMissing,
  repoHealable,
  healThenRepartir,
  repartir,
  launchAllMoves,
} = props.planner;

const MODES: { id: PlanMode; emo: string; title: string; sub: string }[] = [
  { id: 'events', emo: '🗺️', title: 'Événements', sub: 'le plus possible, le plus vite' },
  { id: 'xp', emo: '⭐', title: 'XP des champions', sub: 'le plus d’XP par heure' },
  { id: 'rifts', emo: '🕳️', title: 'Failles', sub: 'les plus proches, la plus urgente d’abord' },
];
const THRESHOLDS = [70, 80, 90, 95, 99];
const FIXED_TITLE = 'Pas disponible : compté ici, il n’est pas déplacé';

/** 🏥 Avant de répartir : des blessés qu'un soin rendrait disponibles ? On demande d'abord. */
const healAsk = ref(false);
function onRepartir() {
  if (repoHealable.value.advs.length) healAsk.value = true;
  else void repartir();
}
function chooseHeal(heal: boolean) {
  healAsk.value = false;
  void (heal ? healThenRepartir() : repartir());
}

/** 🔮 Ses compétences, en pictogrammes (🎓 Mentor, 🧭 Vitesse…) : elles comptent dans le
 *  pronostic, le trajet et l'XP proposés — on voit pourquoi il est dans l'équipe. */
const skillsOf = (a: Adventurer) =>
  advRuneSkills(a)
    .map((k) => SKILLS[k.id].emoji)
    .join('');
const skillsTitle = (a: Adventurer) =>
  advRuneSkills(a)
    .map((k) => `${SKILLS[k.id].name} ${skillLevelTag(k.level)}`)
    .join(' · ');
const rankOf = (p: Poi) => characterRank(poiDifficultyLevel(p));
const fmt = (min: number) => formatDurationMin(min);
const winClass = (w: number) => (w >= 0.9 ? 'good' : w >= 0.7 ? 'ok' : 'bad');
const engaged = computed(() =>
  (rows.value ?? []).reduce((s, r) => s + r.advs.length + (r.hero ? 1 : 0), 0),
);
const longest = computed(() => Math.max(0, ...(rows.value ?? []).map((r) => r.tripMin)));
const totalXp = computed(() => (rows.value ?? []).reduce((s, r) => s + r.xp, 0));

/** 🔁 La dernière vague en pastilles (un par type de lieu) et son âge. */
const waveChips = computed(() => (lastWave.value ? waveCounts(lastWave.value) : []));
const waveAge = computed(() =>
  lastWave.value ? absenceDuration(Date.now() - lastWave.value.at) : '',
);

/** 🧭 Un endroit : la base ou le lieu fixe. */
const placeOf = (p: Poi | null) => (p ? `${poiEmo(p)} ${poiLabel(p)}` : '🏠 Base');
</script>

<style scoped lang="scss">
.xp-plan {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 2px 8px;
}
.pl-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.pl-mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 64px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
}
.pm-emo {
  font-size: 18px;
}
.pm-title {
  font-weight: 700;
  font-size: 13px;
}
.pm-sub {
  font-size: 11px;
  color: var(--dim);
}
.pl-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pl-lab {
  font-size: 12px;
  color: var(--dim);
}
.pl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pl-chip {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  &.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }
  &.off,
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.pl-go,
.pl-all {
  min-height: 46px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
.pl-all {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--text);
  border: 1.5px solid var(--accent);
}
.pl-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}
.pl-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.pl-sum {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pl-pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 600;
  &.dim {
    color: var(--dim);
  }
  &.ok {
    border-color: #7bc86c;
  }
  &.warn {
    border-color: #ffb23f;
    line-height: 1.3;
  }
}
.pl-wave {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pl-tile {
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pt-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.pt-emo {
  font-size: 18px;
}
.pt-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pt-rank {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1.5px solid var(--rk);
  color: var(--rk);
  font-size: 11px;
  font-weight: 700;
}
.pt-team {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pt-comb {
  font-size: 11px;
  font-weight: 700;
  color: #5fd0ff;
}
.pt-sk {
  margin-left: 3px;
  font-size: 11px;
}
.pt-from {
  width: 100%;
  font-size: 11px;
  color: var(--dim);
}
.pt-mem {
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, #5fd0ff 14%, transparent);
  border: 1px solid color-mix(in srgb, #5fd0ff 45%, transparent);
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &.hero {
    background: color-mix(in srgb, #2f6bff 20%, transparent);
    border-color: #2f6bff;
  }
  // ⏳ Immobile (en route, à l'infirmerie…) : compté là, pas déplacé.
  &.fixed {
    border-style: dashed;
    opacity: 0.7;
  }
}
.pt-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pt-stat {
  font-size: 12px;
  font-weight: 700;
  &.good {
    color: var(--d1);
  }
  &.ok {
    color: var(--d3);
  }
  &.bad {
    color: var(--d4);
  }
}
.pt-open {
  margin-left: auto;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1.5px solid var(--line);
  background: transparent;
  color: var(--text);
  font-weight: 700;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
}
.pt-go {
  min-height: 40px;
  min-width: 72px;
  padding: 0 14px;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: #15120e;
  font-weight: 800;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
}
.pl-gos {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
.pl-tile.mv {
  border-color: color-mix(in srgb, #5fd0ff 55%, var(--line));
}
.pt-route {
  font-weight: 700;
  font-size: 13px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.pt-arrow {
  color: #5fd0ff;
}
.pt-old {
  color: var(--dim);
  font-weight: 600;
}
.pl-miss {
  margin: 0;
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12px;
  background: color-mix(in srgb, var(--d3) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--d3) 55%, var(--line));
}
.pl-heal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--d4) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--d4) 50%, var(--line));
}
.ph-txt,
.ph-miss {
  margin: 0;
  font-size: 12.5px;
}
.ph-miss {
  color: var(--d4);
}
.ph-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  > * {
    min-height: 44px;
  }
}
.pl-tile.spot {
  border-color: color-mix(in srgb, #5fd0ff 45%, var(--line));
}
.pt-sup {
  letter-spacing: 1px;
}
.pl-n {
  font-size: 11px;
  color: var(--dim);
  font-weight: 700;
}
.pl-pool,
.pl-empty,
.pl-note {
  font-size: 12px;
  color: var(--dim);
  margin: 0;
}
</style>
