<template>
  <component :is="embedded ? 'div' : 'q-page'" class="agenda-page" :class="{ embedded }">
    <h1 class="page-title font-display">Agenda</h1>
    <div class="week-nav">
      <button class="wk-btn" aria-label="Semaine précédente" @click="weekOffset--">‹</button>
      <div class="wk-mid">
        <div class="wk-label">{{ weekOffset === 0 ? 'Cette semaine' : weekLabel }}</div>
        <div class="wk-sub text-dim">{{ total }} activité{{ total > 1 ? 's' : '' }}</div>
      </div>
      <button
        class="wk-btn"
        aria-label="Semaine suivante"
        :disabled="weekOffset >= 0"
        @click="weekOffset++"
      >
        ›
      </button>
    </div>

    <!-- Filtre par sport : consulter l'historique d'un sport dans l'agenda. -->
    <div class="filters">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        class="flt"
        :class="{ on: filter === f.key }"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="loading" class="column items-center q-mt-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <template v-else>
      <div v-for="d in days" :key="d.iso" class="day" :class="{ today: d.iso === todayIso }">
        <div class="day-head">
          <span class="day-name">{{ d.label }}</span>
          <span v-if="d.iso === todayIso" class="day-today">aujourd'hui</span>
        </div>
        <div v-if="!d.entries.length" class="day-empty">—</div>
        <!-- 📅 REGROUPÉ PAR SOURCE (v0.967, demandé). Un jour de Défi 360 produit une
             entrée par EXO : la pastille de provenance se répétait sept fois au lieu de
             titrer le bloc une seule fois. L'en-tête porte en plus le TOTAL du groupe —
             ce que le regroupement rend possible, et qu'aucune ligne ne disait.
             ⚠️ Les entrées gardent leur liseré `k-*` : une même source peut porter deux
             natures (un challenge de sortie est un `kind` cardio), et l'en-tête ne doit
             pas trancher à leur place. -->
        <template v-else>
          <div v-for="g in d.groups" :key="g.source" class="src-group">
            <div class="src-head">
              <q-icon :name="g.icon" size="16px" />
              <span class="src-name">{{ g.source }}</span>
              <span v-if="g.entries.length > 1" class="src-n">{{ g.entries.length }}</span>
              <span v-if="g.xp > 0" class="src-xp font-display">+{{ g.xp }} XP</span>
            </div>
            <div class="day-entries">
              <component
                :is="e.link ? 'button' : 'div'"
                v-for="(e, i) in g.entries"
                :key="i"
                class="entry"
                :class="['k-' + e.kind, { clickable: !!e.link }]"
                @click="goEntry(e)"
              >
                <q-icon :name="e.icon" size="20px" class="entry-ic" />
                <div class="entry-main">
                  <div class="entry-top">
                    <span class="entry-title">{{ e.title }}</span>
                    <q-icon v-if="e.link" name="chevron_right" size="16px" class="entry-go" />
                  </div>
                  <div v-if="e.meta" class="entry-meta">{{ e.meta }}</div>
                  <div v-if="e.xp > 0" class="entry-gain">
                    <span class="eg-xp">+{{ e.xp }} XP</span>
                    <span v-if="e.energy > 0" class="eg-en">+{{ e.energy }} ⚡</span>
                  </div>
                </div>
              </component>
            </div>
          </div>
        </template>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
defineProps<{ embedded?: boolean }>();
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLogsStore } from '@/stores/logs';
import { useTennisStore } from '@/stores/tennis';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import { useFriendBossStore } from '@/stores/friendBoss';
import { useAuthStore } from '@/stores/auth';
import { bossAgendaEntries } from '@/lib/friendBoss';
import { groupBySource } from '@/lib/agendaGroups';
import { challengeDayXp, challengeValueUnit } from '@/lib/challenges';
import { legSets, legMode, type ComboSet } from '@/lib/combo';
import {
  sessionXp,
  otherSportXp,
  cardioSessionXp,
  drillSessionXp,
  estimateKm,
  REP_XP,
  assistMult,
} from '@/lib/athlete';
import { ACTIVITY_LABELS, ACTIVITY_ICONS, paceLabel, isCardioOutingChallenge } from '@/data/cardio';

// Disciplines « spécifiques » (tennis/prépa…) : comptent leur XP mais N'alimentent
// PAS l'énergie d'aventure (fond = muscu + cardio + autre sport uniquement).
const SPECIFIQUE_DISC = new Set(['crossfit', 'hyrox', 'mobilite', 'prepa_physique']);

const router = useRouter();
const logs = useLogsStore();
const tennis = useTennisStore();
const cardio = useCardioStore();
const challenges = useChallengesStore();
const combo = useComboStore();
const friendBoss = useFriendBossStore();
const auth = useAuthStore();
const loading = ref(true);

interface Entry {
  ts: number;
  kind: 'muscu' | 'tennis' | 'cardio' | 'challenge' | 'combo' | 'boss';
  icon: string;
  title: string;
  meta: string;
  xp: number; // XP gagnée par l'activité
  energy: number; // énergie d'aventure gagnée (= XP si activité de fond, 0 sinon)
  source: string; // libellé de la provenance (chip) : Séance / Cardio / Challenge / Défi 360…
  link?: string; // route ouverte au clic (le défi/la séance correspondante)
}

function goEntry(e: Entry): void {
  if (e.link) void router.push(e.link);
}

function fmtDur(min?: number): string {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m}`;
  if (h) return `${h} h`;
  return `${m} min`;
}
/**
 * Une liste de valeurs qui TIENT dans la largeur (« 10 / 9 / 11 »).
 *
 * ⚠️ `join('/')` produisait une chaîne SANS ESPACE, donc **sans aucun point de césure** :
 * `min-width: 0` laisse rétrécir la BOÎTE, il ne coupe pas le TEXTE — une douzaine de
 * séries débordait donc vers la droite. Les espaces autour du séparateur rendent la
 * coupure possible ENTRE deux valeurs.
 *
 * ⚠️ Et jamais `overflow-wrap: anywhere` SEUL sur ces listes : il couperait au milieu
 * d'un nombre, et « 1 » en fin de ligne puis « 0 » au début de la suivante se lit comme
 * deux valeurs au lieu d'une. Ici la coupure ne peut tomber qu'entre deux séries.
 */
function numList(v: readonly number[]): string {
  return v.join(' / ');
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const now = new Date();
const todayIso = isoDay(now);
// Lundi de la semaine courante (00:00).
const baseMonday = new Date(now);
baseMonday.setHours(0, 0, 0, 0);
baseMonday.setDate(baseMonday.getDate() - ((now.getDay() + 6) % 7));

// Navigation d'historique : 0 = semaine en cours, négatif = semaines passées.
const weekOffset = ref(0);
const weekStart = computed(() => baseMonday.getTime() + weekOffset.value * 7 * 86400000);
const weekEnd = computed(() => weekStart.value + 7 * 86400000);

const weekLabel = computed(() => {
  const f = (t: number) =>
    new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return `${f(weekStart.value)} – ${f(weekStart.value + 6 * 86400000)}`;
});

const entries = computed<Entry[]>(() => {
  const out: Entry[] = [];
  for (const r of logs.all) {
    const exos = r.payload.exercises?.length ?? 0;
    const bits = [fmtDur(r.payload.duration_min), exos ? `${exos} exos` : ''].filter(Boolean);
    const disc = r.payload.discipline ?? 'musculation';
    const xp =
      disc === 'autre_sport'
        ? otherSportXp(r.payload.duration_min ?? 0, r.payload.name)
        : sessionXp(r.payload);
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'muscu',
      icon: 'fitness_center',
      title: r.payload.name || 'Séance',
      meta: bits.join(' · '),
      xp,
      energy: SPECIFIQUE_DISC.has(disc) ? 0 : xp, // spécifique = XP mais pas d'énergie
      source:
        disc === 'autre_sport' ? 'Autre sport' : disc === 'prepa_physique' ? 'Prépa' : 'Séance',
      link: `/bilan/${r.id}?h=1`,
    });
  }
  for (const r of tennis.logs) {
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'tennis',
      icon: 'sports_tennis',
      title: r.payload.name || 'Tennis',
      meta: fmtDur(r.payload.duration_min),
      xp: drillSessionXp(r.payload),
      energy: 0, // tennis exclu de l'énergie d'aventure
      source: 'Tennis',
      link: `/court/bilan/${r.id}?h=1`,
    });
  }
  // DÉDUP anti-doublon : une sortie MIROIR (créée depuis un défi) ne s'affiche pas
  // s'il existe déjà une saisie MANUELLE du même jour+activité (elle la couvre), et
  // au plus UN miroir par (défi, jour). (Sinon marches en double dans l'agenda.)
  const dayOf = (iso: string) => iso.slice(0, 10);
  const manualDayAct = new Set(
    cardio.logs
      .filter((r) => !r.payload.challenge_id)
      .map((r) => `${r.payload.activity}|${dayOf(r.performed_at)}`),
  );
  const seenMirror = new Set<string>();
  for (const r of cardio.logs) {
    const p = r.payload;
    const day = dayOf(r.performed_at);
    // km affiché (arrondi ; à défaut de distance saisie, estimé depuis les pas).
    const km = estimateKm(p);
    if (p.challenge_id) {
      // Miroir SANS contenu réel (0 km ET 0 min) = artefact (jour auto-clos à target 0)
      // → jamais affiché (ticket 72996f3b : marche fantôme le lundi).
      if (!km && !(p.duration_min ?? 0)) continue;
      if (manualDayAct.has(`${p.activity}|${day}`)) continue; // couvert par une saisie manuelle
      const key = `${p.challenge_id}|${p.challenge_day ?? day}`;
      if (seenMirror.has(key)) continue; // déjà un miroir pour ce (défi, jour)
      seenMirror.add(key);
    }
    const bits = [
      km ? `${km.toFixed(1)} km` : '',
      fmtDur(p.duration_min),
      paceLabel(p.distance_km, p.duration_min) ?? '',
    ].filter(Boolean);
    const xp = p.challenge_id ? 0 : cardioSessionXp(p); // sortie miroir = 0 (déjà comptée par le défi)
    out.push({
      ts: Date.parse(r.performed_at),
      kind: 'cardio',
      icon: ACTIVITY_ICONS[p.activity] ?? 'directions_run',
      title: ACTIVITY_LABELS[p.activity] ?? 'Cardio',
      meta: bits.join(' · '),
      xp,
      energy: xp,
      // Sortie miroir (issue d'un défi) → ouvre le défi ; sinon la page Cardio.
      source: p.challenge_id ? 'Challenge' : 'Cardio',
      link: p.challenge_id ? `/challenges/${p.challenge_id}` : '/cardio',
    });
  }
  // Reps de défis jour par jour, SAUF les vraies sorties cardio (marche/course/
  // vélo) déjà couvertes par les sorties miroir. Le conditionnement (jumping
  // jacks…) n'a pas de miroir → il reste affiché ici.
  for (const c of challenges.list) {
    if (isCardioOutingChallenge(c)) continue;
    // ⚠️ Cette copie était juste, mais SEULEMENT grâce au `continue` ci-dessus (qui
    // écarte distance et sorties) : elle ne le disait pas, et sa branche « km » était
    // morte. La lib donne la même réponse sans dépendre d'une ligne située plus haut.
    const uLabel = challengeValueUnit(c.unit, c.exercise_id);
    for (const p of c.progress) {
      if (!(p.done > 0)) continue;
      const [y, m, dd] = p.date.split('-').map(Number);
      const ts = new Date(y!, (m ?? 1) - 1, dd ?? 1, 12).getTime();
      const xp = challengeDayXp(c, p);
      // Détail par série si saisi (ex. « 10/9/11 reps ») ; sinon le total du jour.
      const setReps = (p.sets ?? []).map((s) => s.reps).filter((r) => r > 0);
      const meta =
        c.unit === 'reps' && setReps.length > 1
          ? `${numList(setReps)} ${uLabel}`
          : `${p.done} ${uLabel}`;
      out.push({
        ts,
        kind: 'challenge',
        icon: 'emoji_events',
        title: c.exercise_name,
        meta,
        xp,
        energy: xp, // défis muscu/cardio → comptent dans le fond → énergie
        source: 'Challenge',
        link: `/challenges/${c.id}`,
      });
    }
  }
  // Défi 360 (combo) : les séries/reps de CHAQUE exo, jour par jour → visibles dans
  // l'agenda et cliquables vers le détail du 360.
  for (const c of combo.list) {
    for (const leg of c.legs) {
      const sets = legSets(leg);
      if (!sets.length) continue;
      const mode = legMode(leg);
      const byDay = new Map<string, ComboSet[]>();
      for (const s of sets) {
        if (!s.date) continue;
        (byDay.get(s.date) ?? byDay.set(s.date, []).get(s.date)!).push(s);
      }
      for (const [date, daySets] of byDay) {
        const [y, m, dd] = date.split('-').map(Number);
        const ts = new Date(y!, (m ?? 1) - 1, dd ?? 1, 12).getTime();
        const reps = daySets.reduce((a, s) => a + (s.reps || 0), 0);
        // XP « détail » du jour (façon séance) : reps × poids-de-rep (assisté ×0,6) + tonnage.
        let xp = 0;
        for (const s of daySets) {
          const r = s.reps || 0;
          xp += r * REP_XP * (leg.rep_weight || 1) * assistMult(s.assisted);
          if (s.weight) xp += (r * s.weight) / 500;
        }
        xp = Math.round(xp);
        const repsList = daySets.map((s) => s.reps).filter((r) => r > 0);
        const meta =
          mode === 'time'
            ? `${reps} s`
            : mode === 'reps'
              ? `${reps} reps`
              : `${daySets.length} série${daySets.length > 1 ? 's' : ''}${
                  repsList.length ? ' · ' + numList(repsList) + ' reps' : ''
                }`;
        out.push({
          ts,
          kind: 'combo',
          icon: 'track_changes',
          title: leg.exercise_name,
          meta,
          xp,
          energy: xp, // le Défi 360 alimente la piste Muscu → énergie
          source: 'Défi 360',
          link: `/combo/${c.id}`,
        });
      }
    }
  }
  // Boss entre amis : les reps de MES frappes, jour par jour. La règle (qui compte, quelle
  // XP, quelle unité) vit dans la lib — ici on ne fait que la traduire en entrée d'agenda.
  for (const e of bossAgendaEntries(
    friendBoss.bosses,
    friendBoss.members,
    friendBoss.hits,
    auth.user?.id ?? '',
    (ms) => isoDay(new Date(ms)),
  )) {
    const [y, m, dd] = e.day.split('-').map(Number);
    out.push({
      ts: new Date(y!, (m ?? 1) - 1, dd ?? 1, 12).getTime(),
      kind: 'boss',
      icon: 'local_fire_department',
      title: e.title,
      meta:
        e.units.length > 1
          ? `${e.units.length} frappes · ${numList(e.units)} ${e.unit}`
          : `${e.total} ${e.unit}`,
      xp: e.xp,
      energy: e.xp, // muscu (ou cardio pour un boss de conditionnement) → fond → énergie
      source: 'Boss amis',
      link: '/boss-amis',
    });
  }
  return out.filter((e) => e.ts >= weekStart.value && e.ts < weekEnd.value);
});

// Filtre par sport → consulter l'historique d'un sport dans l'agenda.
type FilterKey = 'all' | Entry['kind'];
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'muscu', label: '💪 Muscu' },
  { key: 'cardio', label: '🏃 Cardio' },
  { key: 'tennis', label: '🎾 Tennis' },
  { key: 'challenge', label: '🏆 Défis' },
  { key: 'combo', label: '🎯 360' },
  { key: 'boss', label: '🐉 Boss' },
];
const filter = ref<FilterKey>('all');
const filteredEntries = computed(() =>
  filter.value === 'all' ? entries.value : entries.value.filter((e) => e.kind === filter.value),
);
const total = computed(() => filteredEntries.value.length);

const days = computed(() => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.value + i * 86400000);
    const iso = isoDay(d);
    const dayEntries = filteredEntries.value
      .filter((e) => isoDay(new Date(e.ts)) === iso)
      .sort((a, b) => a.ts - b.ts);
    return {
      iso,
      label: d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short' }),
      entries: dayEntries,
      // ⚠️ La règle vit en LIB : cet écran n'est vu par aucune porte, et « rien ne se
      // perd au regroupement » est le genre de garantie qui casse en silence.
      groups: groupBySource(dayEntries),
    };
  });
});

onMounted(async () => {
  try {
    await Promise.all([
      logs.fetchAll().catch(() => undefined),
      tennis.fetchLogs().catch(() => undefined),
      cardio.fetchLogs().catch(() => undefined),
      challenges.list.length ? Promise.resolve() : challenges.fetchMine().catch(() => undefined),
      combo.list.length ? Promise.resolve() : combo.fetchMine().catch(() => undefined),
      friendBoss.loaded ? Promise.resolve() : friendBoss.fetchMine().catch(() => undefined),
    ]);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped lang="scss">
.agenda-page {
  background: var(--bg);
  min-height: 100vh;
  padding: 20px 16px 32px;
}
.agenda-page.embedded {
  min-height: 0;
}
.page-title {
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.text-dim {
  color: var(--dim);
}
.week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 12px;
}
/* Filtres par sport : puces défilables horizontalement. */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
}
.flt {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.flt.on {
  border-color: var(--accent);
  background: var(--surface-2);
  color: var(--text);
}
.wk-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font-size: 22px;
  cursor: pointer;
}
.wk-btn:disabled {
  color: var(--dim);
  opacity: 0.4;
  cursor: not-allowed;
}
.wk-mid {
  flex: 1;
  text-align: center;
}
.wk-label {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  color: var(--text);
}
.wk-sub {
  font-size: 12px;
}
.day {
  margin-bottom: 16px;
}
.day-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.day-name {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text);
  text-transform: capitalize;
}
.day.today .day-name {
  color: var(--accent);
}
.day-today {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--accent-ink);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 8px;
}
.day-empty {
  color: var(--dim);
  font-size: 13px;
  padding-left: 2px;
}
/* 📅 L'EN-TÊTE DE SOURCE : il TITRE le bloc, il ne concurrence pas les entrées — d'où
   une taille de note et l'accent réservé au seul chiffre qui compte (l'XP du groupe). */
.src-group + .src-group {
  margin-top: 10px;
}
.src-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px 4px;
  color: var(--dim);
  font-size: 11.5px;
}
.src-name {
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Combien d'exos dans ce bloc — affiché SEULEMENT s'il y en a plusieurs : « 1 » serait
   du bruit. */
.src-n {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 10.5px;
}
.src-xp {
  margin-left: auto;
  color: var(--accent);
  font-size: 12px;
}
.day-entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
}
.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--src-c, var(--accent));
  border-radius: 12px;
  background: var(--surface);
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
}
.entry.clickable {
  cursor: pointer;
}
.entry.clickable:active {
  transform: scale(0.99);
}
/* Couleur de source (liseré + puce + icône) par provenance. */
.entry.k-muscu {
  --src-c: var(--accent);
}
.entry.k-tennis {
  --src-c: #5fd0e0;
}
.entry.k-cardio {
  --src-c: #ff9d4d;
}
.entry.k-challenge {
  --src-c: var(--d2, #c6d24a);
}
.entry.k-combo {
  --src-c: #b98cff;
}
/* Rouge franc : distinct de l'orange du cardio (#ff9d4d) et du violet du 360 (#b98cff). */
.entry.k-boss {
  --src-c: #ff5d73;
}
.entry-ic {
  color: var(--src-c, var(--accent));
}
.entry-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 1px;
}
.entry-src {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--src-c, var(--accent));
  border: 1px solid var(--src-c, var(--accent));
  border-radius: 999px;
  padding: 1px 7px;
  line-height: 1.5;
}
.entry-go {
  color: var(--dim);
  flex: none;
}
.entry-main {
  flex: 1;
  min-width: 0;
}
/* CEINTURE : `min-width: 0` sur le parent laisse rétrécir la BOÎTE, jamais le TEXTE — un
   mot sans espace (nom d'exercice à rallonge) déborderait encore. Les listes de séries,
   elles, se coupent déjà entre deux valeurs (cf. `numList`) : `anywhere` ne s'y déclenche
   donc jamais, il ne sert que de dernier recours. */
.entry-title {
  font-weight: 600;
  color: var(--text);
  overflow-wrap: anywhere;
}
.entry-meta {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
  overflow-wrap: anywhere;
}
.entry-gain {
  display: flex;
  gap: 8px;
  margin-top: 3px;
  font-size: 12px;
  font-weight: 700;
}
.eg-xp {
  color: var(--accent);
}
.eg-en {
  color: var(--text);
  opacity: 0.75;
}
</style>
