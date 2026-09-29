// 🗓️ QUÊTES DE LA SEMAINE (v0.1209 ; décisions de l'utilisateur, 2026-09-27 : « quête qui
// paie », « 3 objectifs chaque lundi », « objectifs de SPORT seulement », « 2 tickets »).
//
// Des objectifs de sport renouvelés chaque lundi (jour logique, bascule à 4 h), valables
// jusqu'au dimanche, payés en **tickets d'invocation 🎟️** par paliers. Ce qui n'est pas fait
// est perdu, sans pénalité : il n'y a rien à rattraper, la semaine suivante repart à zéro.
//
// ⚠️ OBJECTIFS DE SPORT SEULEMENT, et c'est ce qui garde la règle des tickets intacte : ils
// ne se gagnent QUE par le sport (les pierres de mana 💠 se gagnent en jouant). Un objectif de
// jeu (failles, sièges) aurait cassé cette séparation.
//
// ⚠️ ON PAIE UNE ÉTAPE, PAS LE VOLUME (doctrine des tickets, v0.992) : les objectifs se
// comptent en JOURS et en minutes de sortie — ils ne repaient pas l'XP déjà versée par chaque
// séance, ils disent « ta semaine est bouclée ».
//
// ⚠️ LES CIBLES SONT CALÉES SUR TON HISTORIQUE (les 4 semaines complètes AVANT ce lundi) :
// une cible fixe serait triviale pour un joueur très actif et hors de portée pour celui qui
// vient une fois par semaine. Elles ne dépendent que du passé, donc elles ne bougent pas
// pendant la semaine — et rien n'est à stocker.
//
// 🎟️ PALIERS : TOUS LES OBJECTIFS, TU FAIS CE QUE TU VEUX (v0.1361 ; demandé par l'utilisateur :
// « faire plus d'objectifs et on fait ce qu'on veut avec des paliers de récompenses »). Plus
// de tirage : les six objectifs sont affichés (ceux de tes sports en tête), et chaque palier
// d'objectifs atteints paie. Ça règle aussi « choisir son objectif » sans rien à verrouiller —
// un choix fait le dimanche aurait pris l'objectif déjà atteint. Le paragraphe suivant (le
// tirage selon ta pratique) ne décrit plus que l'ORDRE et la marque « tes sports ».
//
// ⚠️ LES QUÊTES SUIVENT CE QUE TU PRATIQUES (v0.1357 ; demandé par l'utilisateur : « adapter
// les quêtes à l'activité sportive de l'utilisateur »). Le tirage était aveugle : un joueur
// 100 % muscu recevait « 30 min de sortie cardio » ou « 2 sports différents », c'est-à-dire
// un objectif hors de sa pratique, donc une semaine impossible à boucler sans changer de
// sport. Depuis les paliers, TES pratiques (`practicedKinds`, sur les mêmes 4 semaines que les
// cibles, donc stable toute la semaine) décident de l'ORDRE et de la marque « tes sports » ;
// la RÉGULARITÉ (une moitié de semaine après l'autre) vaut pour n'importe quelle pratique.
//
// Module pur : les dates sont des chaînes `YYYY-MM-DD` comparées en chaînes, l'aujourd'hui est
// PASSÉ par l'appelant (leçon `activityDays.ts`).

import { legSets, type ComboChallenge } from './combo';
import { isCardioTrackChallenge } from '@/data/cardio';

export type QuestKind =
  | 'active_days'
  | 'strength_days'
  | 'cardio_minutes'
  | 'tennis_days'
  | 'variety'
  | 'regularity';
/** `other` = « autre sport » (yoga, escalade…) : il rend actif et compte pour la variété, mais
 *  ce n'est pas de la muscu. */
type SportKind = 'muscu' | 'cardio' | 'tennis' | 'other';

export const WEEKLY_QUESTS = {
  /** 🎟️ Paliers : autant d'objectifs atteints → autant de tickets AU TOTAL (pas en plus).
   *  3 objectifs rendent les 2 tickets d'avant ; le dernier palier demande de sortir de sa
   *  routine, et paie un ticket de plus. */
  tiers: [
    { at: 2, tickets: 1 },
    { at: 3, tickets: 2 },
    { at: 5, tickets: 3 },
  ],
  /** Tickets déjà pris par une marque d'avant les paliers (un lundi seul = semaine payée). */
  legacyClaimed: 2,
  /** Semaines d'historique qui calent les cibles. */
  historyWeeks: 4,
  /** Minutes de sortie : cible = moyenne × cette marge, bornée. */
  cardioPush: 1.15,
  cardioMin: 30,
  cardioMax: 300,
  /** Une pratique est « la tienne » à partir de ce nombre de jours sur les 4 semaines
   *  d'historique (≈ un jour toutes les deux semaines) : une sortie isolée il y a un mois ne
   *  suffit pas à t'imposer une quête de ce sport. */
  practiceMinDays: 2,
} as const;

/** Tout ce qui témoigne d'une pratique, avec ce qu'il faut pour la CLASSER. Même famille que
 *  `ActivitySources` (chaque champ requis : oublier une source ne compile pas). */
export interface QuestSources {
  /** `session_logs` : muscu, séance libre, prépa physique, autre sport. La discipline dit
   *  laquelle (absente = musculation). */
  sessions: { performed_at?: string | null; payload?: { discipline?: string | null } | null }[];
  /** Sorties cardio (miroirs compris : ils reflètent une vraie sortie de défi). */
  cardio: { performed_at?: string | null; payload?: { duration_min?: number | null } | null }[];
  /** Séances sur le court. */
  tennis: { performed_at?: string | null }[];
  /** Défis solo. */
  challenges: {
    unit: string;
    exercise_id: string;
    config?: { discipline?: string | null } | null;
    progress: { date: string; done: number }[];
  }[];
  /** Défi 360. */
  combos: ComboChallenge[];
  /** Boss entre amis : mes saisies. */
  bossHits: { createdAt: number }[];
}

export interface QuestEntry {
  day: string;
  kind: SportKind;
  /** Minutes de sortie cardio (0 pour le reste). */
  minutes: number;
}

const dayOf = (iso: string | null | undefined): string | null =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : null;

/** ⚠️ Une séance n'est pas toujours de la muscu : la prépa physique est du TENNIS (son hub
 *  est la page Tennis, son XP va à la piste Tennis) et un « autre sport » (yoga…) n'est pas
 *  une séance de force. Avant, les deux comptaient comme un jour de muscu. */
function sessionKind(discipline: string | null | undefined): SportKind {
  if (discipline === 'autre_sport') return 'other';
  if (discipline === 'prepa_physique') return 'tennis';
  return 'muscu';
}

/** Toutes les pratiques, datées et classées. */
export function questEntries(src: QuestSources): QuestEntry[] {
  const out: QuestEntry[] = [];
  const push = (iso: string | null | undefined, kind: SportKind, minutes = 0) => {
    const d = dayOf(iso);
    if (d) out.push({ day: d, kind, minutes });
  };
  for (const r of src.sessions) push(r.performed_at, sessionKind(r.payload?.discipline));
  for (const r of src.cardio)
    push(r.performed_at, 'cardio', Math.max(0, Number(r.payload?.duration_min) || 0));
  for (const r of src.tennis) push(r.performed_at, 'tennis');
  for (const c of src.challenges) {
    // ⚠️ La VOIE du défi (`challengeLane`) : une sortie reste du cardio, un défi tennis du tennis.
    const kind: SportKind = isCardioTrackChallenge(c)
      ? 'cardio'
      : c.config?.discipline === 'tennis'
        ? 'tennis'
        : 'muscu';
    // ⚠️ `done > 0` : les journées d'un défi existent d'avance, une journée vide ne compte pas.
    // Pas de minutes : les minutes d'un défi de sortie sont DÉJÀ dans sa sortie miroir.
    for (const p of c.progress) if (p.done > 0) push(p.date, kind);
  }
  for (const c of src.combos)
    for (const leg of c.legs) for (const s of legSets(leg)) if (s.reps > 0) push(s.date, 'muscu');
  for (const h of src.bossHits)
    if (h.createdAt > 0) push(new Date(h.createdAt).toISOString(), 'muscu');
  return out;
}

const DAY_MS = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fmt(parse(d) + n * DAY_MS);

/** Le lundi de la semaine qui contient `day` (UTC explicite : pas d'aller-retour de fuseau). */
export function weekStart(day: string): string {
  const dow = new Date(parse(day)).getUTCDay(); // 0 = dimanche
  return addDays(day, -((dow + 6) % 7));
}

interface WeekStats {
  activeDays: number;
  strengthDays: number;
  tennisDays: number;
  cardioMinutes: number;
  kinds: number;
  /** Moitiés de semaine actives : lundi-mercredi, puis jeudi-dimanche (0 à 2). */
  halves: number;
}

/** Ce qu'une semaine [monday, monday+6] a produit. */
function weekStats(entries: QuestEntry[], monday: string): WeekStats {
  const end = addDays(monday, 6);
  const secondHalf = addDays(monday, 3);
  const active = new Set<string>();
  const strength = new Set<string>();
  const tennis = new Set<string>();
  const kinds = new Set<SportKind>();
  const halves = new Set<number>();
  let minutes = 0;
  for (const e of entries) {
    if (e.day < monday || e.day > end) continue;
    active.add(e.day);
    kinds.add(e.kind);
    halves.add(e.day < secondHalf ? 0 : 1);
    if (e.kind === 'muscu') strength.add(e.day);
    if (e.kind === 'tennis') tennis.add(e.day);
    minutes += e.minutes;
  }
  return {
    activeDays: active.size,
    strengthDays: strength.size,
    tennisDays: tennis.size,
    cardioMinutes: Math.round(minutes),
    kinds: kinds.size,
    halves: halves.size,
  };
}

/** Les pratiques qui sont les tiennes : présentes au moins `practiceMinDays` jours sur les
 *  semaines d'historique (la semaine en cours n'y entre pas — le tirage ne bouge pas en
 *  route). Le cardio compte ses jours de sortie, pas ses minutes. */
function practicedKinds(entries: QuestEntry[], monday: string): Set<SportKind> {
  const from = addDays(monday, -7 * WEEKLY_QUESTS.historyWeeks);
  const days: Record<SportKind, Set<string>> = {
    muscu: new Set(),
    cardio: new Set(),
    tennis: new Set(),
    other: new Set(),
  };
  for (const e of entries) if (e.day >= from && e.day < monday) days[e.kind].add(e.day);
  const out = new Set<SportKind>();
  for (const k of Object.keys(days) as SportKind[])
    if (days[k].size >= WEEKLY_QUESTS.practiceMinDays) out.add(k);
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Les cibles de la semaine, calées sur les `historyWeeks` semaines complètes d'avant. */
export function questTargets(entries: QuestEntry[], monday: string): Record<QuestKind, number> {
  const n = WEEKLY_QUESTS.historyWeeks;
  let a = 0;
  let s = 0;
  let c = 0;
  let t = 0;
  for (let w = 1; w <= n; w++) {
    const st = weekStats(entries, addDays(monday, -7 * w));
    a += st.activeDays;
    s += st.strengthDays;
    c += st.cardioMinutes;
    t += st.tennisDays;
  }
  a /= n;
  s /= n;
  c /= n;
  t /= n;
  return {
    // Un cran au-dessus de sa moyenne tant qu'elle est modeste ; pas plus de 6 (un jour de repos).
    active_days: clamp(Math.round(a) + (a < 4 ? 1 : 0), 2, 6),
    strength_days: clamp(Math.round(s) + (s < 3 ? 1 : 0), 1, 4),
    cardio_minutes: clamp(
      Math.ceil((c * WEEKLY_QUESTS.cardioPush) / 10 - 1e-9) * 10,
      WEEKLY_QUESTS.cardioMin,
      WEEKLY_QUESTS.cardioMax,
    ),
    // Tennis (court + prépa physique) : même règle que la muscu, sur un rythme plus lent.
    tennis_days: clamp(Math.round(t) + (t < 2 ? 1 : 0), 1, 3),
    // Deux pratiques différentes : la découverte, côté sport.
    variety: 2,
    // Les deux moitiés de la semaine : l'objectif de régularité, valable pour tout sport.
    regularity: 2,
  };
}

/** Ordre d'affichage : « jours actifs » en tête (le cœur de la semaine), puis les objectifs
 *  de TES pratiques, puis les autres — proposés, jamais imposés (paliers). */
const PRACTICE_OF: Partial<Record<QuestKind, SportKind>> = {
  strength_days: 'muscu',
  cardio_minutes: 'cardio',
  tennis_days: 'tennis',
};
const ALL_KINDS: QuestKind[] = [
  'active_days',
  'strength_days',
  'cardio_minutes',
  'tennis_days',
  'regularity',
  'variety',
];
function questOrder(practiced: Set<SportKind>): QuestKind[] {
  const [first, ...rest] = ALL_KINDS;
  const mine = (k: QuestKind) => isMine(k, practiced);
  return [first!, ...rest.filter(mine), ...rest.filter((k) => !mine(k))];
}

/** Objectif d'un de TES sports ? Régularité et variété n'appartiennent à aucun sport : la
 *  régularité vaut pour tous, la variété pour qui en pratique déjà deux. */
function isMine(k: QuestKind, practiced: Set<SportKind>): boolean {
  if (k === 'active_days' || k === 'regularity') return true;
  if (k === 'variety') return practiced.size >= 2;
  return practiced.has(PRACTICE_OF[k]!);
}

export const QUEST_INFO: Record<QuestKind, { emoji: string; label: (t: number) => string }> = {
  active_days: { emoji: '📅', label: (t) => `Fais du sport ${t} jours` },
  strength_days: {
    emoji: '💪',
    label: (t) => `Muscu ${t} jour${t > 1 ? 's' : ''} (séance, défi ou 360)`,
  },
  cardio_minutes: { emoji: '🏃', label: (t) => `${t} min de sortie cardio` },
  tennis_days: {
    emoji: '🎾',
    label: (t) => `Tennis ${t} jour${t > 1 ? 's' : ''} (court ou prépa physique)`,
  },
  variety: { emoji: '🔀', label: (t) => `${t} sports différents cette semaine` },
  // ⚠️ Les jours sont écrits : « début / fin de semaine » laissait deviner où passe la coupure.
  regularity: {
    emoji: '🔁',
    label: () => '1 jour de sport du lundi au mercredi, et 1 du jeudi au dimanche',
  },
};

interface WeeklyQuest {
  kind: QuestKind;
  target: number;
  done: number;
  complete: boolean;
  /** Objectif d'un de TES sports (sinon : proposé, pour qui veut varier). */
  mine: boolean;
}

export interface WeeklyQuestBoard {
  monday: string;
  sunday: string;
  quests: WeeklyQuest[];
  /** Objectifs atteints. */
  doneCount: number;
  /** Les paliers, avec leur état. */
  tiers: { at: number; tickets: number; reached: boolean }[];
  /** Tickets gagnés par les paliers atteints / déjà récupérés / à récupérer maintenant. */
  earned: number;
  claimedTickets: number;
  claimable: number;
  /** Tous les paliers atteints et récupérés : rien de plus cette semaine. */
  complete: boolean;
}

/** 🎟️ La marque stockée (`characters.quest_week`) : le lundi de la semaine, suivi du nombre de
 *  tickets déjà récupérés (`2026-09-28:1`). ⚠️ Un lundi SEUL vient d'avant les paliers : il
 *  voulait dire « les 2 tickets de la semaine sont pris » — on le relit comme tel, sinon une
 *  semaine déjà payée paierait une seconde fois. */
export function parseQuestMark(mark: string | null, monday: string): number {
  if (!mark) return 0;
  const [week, n] = mark.split(':');
  if (week !== monday) return 0;
  if (n === undefined) return WEEKLY_QUESTS.legacyClaimed;
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
export const questMark = (monday: string, tickets: number) => `${monday}:${tickets}`;

/** Les objectifs de la semaine de `today` : TOUS, et tu fais ceux que tu veux. Chaque palier
 *  d'objectifs atteints (`WEEKLY_QUESTS.tiers`) paie ses tickets, récupérables au fil de la
 *  semaine. `mark` = la marque stockée (cf. `parseQuestMark`). */
export function weeklyQuests(
  src: QuestSources,
  today: string,
  mark: string | null,
): WeeklyQuestBoard {
  const entries = questEntries(src);
  const monday = weekStart(today);
  const targets = questTargets(entries, monday);
  const now = weekStats(entries, monday);
  const practiced = practicedKinds(entries, monday);
  const doneOf: Record<QuestKind, number> = {
    active_days: now.activeDays,
    strength_days: now.strengthDays,
    cardio_minutes: now.cardioMinutes,
    tennis_days: now.tennisDays,
    variety: now.kinds,
    regularity: now.halves,
  };
  const quests = questOrder(practiced).map((kind) => {
    const target = targets[kind];
    const done = doneOf[kind];
    return {
      kind,
      target,
      done,
      complete: done >= target,
      mine: isMine(kind, practiced),
    };
  });
  const doneCount = quests.filter((q) => q.complete).length;
  const tiers = WEEKLY_QUESTS.tiers.map((t) => ({ ...t, reached: doneCount >= t.at }));
  const earned = tiers.reduce((best, t) => (t.reached ? Math.max(best, t.tickets) : best), 0);
  const claimedTickets = parseQuestMark(mark, monday);
  const claimable = Math.max(0, earned - claimedTickets);
  const top = WEEKLY_QUESTS.tiers[WEEKLY_QUESTS.tiers.length - 1]!.tickets;
  return {
    monday,
    sunday: addDays(monday, 6),
    quests,
    doneCount,
    tiers,
    earned,
    claimedTickets,
    claimable,
    complete: claimedTickets >= top,
  };
}
