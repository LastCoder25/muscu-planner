// friendBoss.ts — le BOSS ENTRE AMIS : un joueur le déclare, invite des amis, et tout le
// groupe l'abat avec les reps d'un exo au poids du corps. Pur/testable, aucune dépendance
// Vue/Supabase.
//
// ⚠️ LE SERVEUR APPLIQUE CES RÈGLES, PAS L'ÉCRAN. Les PV, les fenêtres de temps et les
// plafonds de saisie sont vérifiés par les fonctions de la migration 0067 : un onglet
// périmé ou un appel direct à l'API ne les contourne pas. Cette lib sert à AFFICHER la
// même chose que ce que le serveur décide — un test lit la migration et vérifie que les
// constantes des deux côtés sont les mêmes.
//
// Règles (conçues avec l'utilisateur, 2026-09-14) :
//  • On déclare un boss en choisissant UN exo et les amis à inviter.
//  • Les invités ont 24 h pour répondre. Le boss démarre à la fin de ces 24 h, ou plus tôt
//    dès que tous ont répondu (un refus compte) ; sans invité, il démarre tout de suite.
//    Avant le démarrage, on ne frappe pas.
//  • Il dure 7 jours à partir de son démarrage.
//  • Un joueur n'a qu'UN boss en cours, lancé ou rejoint. On ne quitte pas un boss.
//  • Le lanceur relance 7 jours après la fin (mort du boss, ou bout des 7 jours).
//  • Une rep = un point de dégât, pour tout le monde (égalité). Chaque participant ajoute
//    sa part de PV.
//  • Les reps comptent comme du sport ; une prime de complétion s'ajoute si le boss meurt
//    et qu'on a apporté sa part minimale.
import { REP_XP, XP_MULT } from './athlete';
import { normMuscle } from './muscles';
import { CONDITIONING_CHALLENGE_IDS, isCardioChallengeExercise } from '@/data/cardio';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Famille d'un exo de boss — elle fixe la part de PV et l'affixe du trophée. */
export type BossFamily = 'push' | 'legs' | 'pull' | 'core' | 'conditioning';

export const FRIEND_BOSS = {
  /** Temps laissé aux invités pour répondre. */
  inviteWindowMs: 24 * HOUR,
  /** Durée du combat, à partir du démarrage. */
  durationMs: 7 * DAY,
  /** Délai avant que le LANCEUR puisse relancer, à partir de la fin du boss. */
  cooldownMs: 7 * DAY,
  /** Part de PV d'UN participant, en unités de l'exo (reps, ou secondes pour le gainage).
   *  ⚠️ C'est un volume de SEMAINE, pour un joueur moyen : tenir sa part demande de s'y
   *  mettre plusieurs jours, sans en faire une corvée. La traction est plus dure, sa part
   *  est plus petite ; le gainage se compte en secondes. */
  shareUnits: { push: 300, legs: 400, pull: 150, core: 1200, conditioning: 300 } as Record<
    BossFamily,
    number
  >,
  /** Part minimale à apporter pour toucher le coffre et la prime. Sans elle, un invité
   *  qui ne fait rien profiterait du travail des autres. */
  minShare: 0.5,
  /** Plafond d'UNE saisie, en part de la part d'un joueur. */
  hitMaxShare: 0.5,
  /** Plafond sur 24 h glissantes, en part de la part d'un joueur. ⚠️ Tout est déclaratif :
   *  ce plafond est le garde-fou, le regard des amis (saisies visibles) fait le reste. */
  dayMaxShare: 0.6,
  /** Invités maximum par boss. */
  maxInvites: 9,
  /** Prime de complétion, en part de l'XP gagnée par ses propres reps.
   *  ⚠️ MESURÉE : une part complète vaut peu en XP (300 pompes → 120 XP, soit ~¼ d'une
   *  séance d'une heure), d'où un pourcentage élevé. Un challenge de même volume sur
   *  7 jours paie ~30 % : le boss paie plus, parce qu'il demande de tenir sa part pour
   *  un groupe. */
  bonusPct: 1,
  /** La prime ne compte que les reps jusqu'à N parts : au-delà, les reps paient toujours
   *  leur XP, mais ne gonflent plus la prime. */
  bonusCapShares: 2,
} as const;

/** Ce qu'un exo doit porter pour être classé. */
export interface BossExerciseInfo {
  id: string;
  unit?: string | null;
  muscle_primary?: string | null;
}

const LEGS = new Set(['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers']);
const PULL = new Set(['dos', 'biceps', 'avant-bras']);

/** Famille d'un exo. Le conditionnement passe en premier (un burpee travaille les jambes,
 *  mais c'est un effort métabolique), puis le temps (gainage), puis le muscle. */
export function bossFamily(ex: BossExerciseInfo): BossFamily {
  if (CONDITIONING_CHALLENGE_IDS.has(ex.id)) return 'conditioning';
  const m = normMuscle(ex.muscle_primary);
  if (ex.unit === 'time' || m === 'abdominaux') return 'core';
  if (LEGS.has(m)) return 'legs';
  if (PULL.has(m)) return 'pull';
  return 'push';
}

/** Nom et emoji d'une famille, pour l'écran. */
export const BOSS_FAMILY_LABEL: Record<BossFamily, { emoji: string; name: string }> = {
  push: { emoji: '💪', name: 'Poussée' },
  legs: { emoji: '🦵', name: 'Jambes' },
  pull: { emoji: '🧗', name: 'Tirage' },
  core: { emoji: '🧱', name: 'Gainage' },
  conditioning: { emoji: '🔥', name: 'Conditionnement' },
};

/** Durée restante lisible sur une semaine : « 3 j 4 h », « 5 h 38 », « 42 min ». */
export function fmtBossSpan(msLeft: number): string {
  const m = Math.max(0, Math.round(msLeft / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} j ${h % 24} h` : `${d} j`;
}

/** Unité affichée d'une famille. */
export function bossUnitLabel(family: BossFamily): 'reps' | 's' {
  return family === 'core' ? 's' : 'reps';
}

/** Un exo peut-il servir de boss ? Au poids du corps, jamais une sortie cardio. */
export function isBossExercise(ex: {
  id: string;
  equipment_required?: readonly string[] | null;
  category?: string | null;
}): boolean {
  if (isCardioChallengeExercise(ex.id)) return false;
  if (ex.category === 'prepa_physique') return false;
  // La barre de traction est tolérée : sans elle, la famille « tirage » n'aurait aucun exo.
  return (ex.equipment_required ?? []).every((e) => e === 'pullup_bar');
}

/** Un boss tel qu'on le lit en base (dates en ms). */
export interface FriendBoss {
  id: string;
  ownerId: string;
  family: BossFamily;
  exerciseId: string;
  exerciseName: string;
  /** Poids de rep figé à la déclaration : il ne touche que l'XP. */
  repWeight: number;
  createdAt: number;
  /** Posé quand tous les invités ont répondu avant la fin de la fenêtre (ou sans invité). */
  startAt: number | null;
  defeatedAt: number | null;
  hpTotal: number;
  damage: number;
}

type BossMemberStatus = 'accepted' | 'invited' | 'declined';

export interface FriendBossMember {
  bossId: string;
  userId: string;
  pseudo: string;
  status: BossMemberStatus;
  units: number;
  claimed: boolean;
}

export interface FriendBossHit {
  id: string;
  bossId: string;
  userId: string;
  units: number;
  createdAt: number;
}

const ms = (iso: string | null | undefined): number | null =>
  iso ? Date.parse(iso) || null : null;

/** Ligne `friend_bosses` → boss (dates en ms). Un poids de rep absent vaut 1. */
export function bossFromRow(r: {
  id: string;
  owner_id: string;
  family: string;
  exercise_id: string;
  exercise_name: string;
  rep_weight: number | string | null;
  created_at: string;
  start_at: string | null;
  defeated_at: string | null;
  hp_total: number;
  damage: number;
}): FriendBoss {
  return {
    id: r.id,
    ownerId: r.owner_id,
    family: r.family as BossFamily,
    exerciseId: r.exercise_id,
    exerciseName: r.exercise_name,
    repWeight: Number(r.rep_weight ?? 1) || 1,
    createdAt: ms(r.created_at) ?? 0,
    startAt: ms(r.start_at),
    defeatedAt: ms(r.defeated_at),
    hpTotal: r.hp_total,
    damage: r.damage,
  };
}

/** Ce que CE joueur a saisi sur ce boss pendant les 24 dernières heures — la même fenêtre
 *  glissante que `fboss_hit` (`created_at > now() - 24 h`, borne exclue). */
export function lastDayUnits(
  hits: readonly FriendBossHit[],
  bossId: string,
  userId: string,
  now: number,
): number {
  const from = now - DAY;
  return hits
    .filter((h) => h.bossId === bossId && h.userId === userId && h.createdAt > from)
    .reduce((a, h) => a + h.units, 0);
}

/** Piste d'XP d'un boss : le conditionnement est un effort cardio (comme ses challenges),
 *  tout le reste nourrit la muscu. */
export function bossXpTrack(family: BossFamily): 'muscu' | 'cardio' {
  return family === 'conditioning' ? 'cardio' : 'muscu';
}

/** XP gagnée par un joueur sur tous ses boss, par piste : ses reps (toujours) + la prime
 *  de complétion (boss mort ET part minimale apportée). Seules les participations
 *  ACCEPTÉES comptent : un invité qui a refusé n'a rien saisi. */
export function friendBossXp(
  bosses: readonly FriendBoss[],
  members: readonly FriendBossMember[],
  userId: string,
): { muscu: number; cardio: number } {
  const out = { muscu: 0, cardio: 0 };
  const byId = new Map(bosses.map((b) => [b.id, b]));
  for (const m of members) {
    if (m.userId !== userId || m.status !== 'accepted' || m.units <= 0) continue;
    const b = byId.get(m.bossId);
    if (!b) continue;
    out[bossXpTrack(b.family)] +=
      bossRepsXp(b.family, m.units, b.repWeight) +
      bossCompletionXp(b.family, m.units, b.repWeight, b.defeatedAt != null);
  }
  return out;
}

/** Libellé français d'un refus du serveur (codes levés par la migration 0067). */
export function bossErrorMessage(code: string): string {
  const table: Record<string, string> = {
    busy: 'Tu as déjà un boss en cours — on n’en mène qu’un à la fois.',
    cooldown: 'Tu pourras lancer un nouveau boss 7 jours après la fin du précédent.',
    not_friend: 'Tu ne peux inviter que tes amis.',
    too_many_invites: `Au plus ${FRIEND_BOSS.maxInvites} amis par boss.`,
    closed: 'Les invitations sont closes : le combat a commencé.',
    not_invited: 'Cette invitation n’existe plus.',
    not_member: 'Tu ne participes pas à ce boss.',
    not_active: 'Le combat n’est pas en cours.',
    capped: 'Plafond atteint : reviens plus tard pour frapper encore.',
    no_character: 'Crée d’abord ton aventurier dans l’Aventure.',
    bad_exercise: 'Cet exercice ne peut pas servir de boss.',
    not_defeated: 'Le boss n’est pas encore tombé.',
    nothing: 'Ton coffre a déjà été ouvert.',
    min_share: 'Il fallait apporter au moins la moitié de ta part pour le coffre.',
  };
  const key = Object.keys(table).find((k) => code.includes(k));
  return key ? table[key]! : 'Action impossible pour le moment.';
}

/** Démarrage effectif : la fin de la fenêtre d'invitation, ou plus tôt si tout le monde a
 *  répondu. ⚠️ `least` : un `startAt` posé après la fenêtre ne peut pas la repousser. */
export function bossStartAt(b: Pick<FriendBoss, 'createdAt' | 'startAt'>): number {
  const windowEnd = b.createdAt + FRIEND_BOSS.inviteWindowMs;
  return b.startAt == null ? windowEnd : Math.min(b.startAt, windowEnd);
}

/** Fin prévue du combat (7 jours après le démarrage). */
export function bossEndsAt(b: Pick<FriendBoss, 'createdAt' | 'startAt'>): number {
  return bossStartAt(b) + FRIEND_BOSS.durationMs;
}

/** Fin RÉELLE : la mort du boss, sinon le bout des 7 jours. */
export function bossEndedAt(b: Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>): number {
  return b.defeatedAt ?? bossEndsAt(b);
}

export type BossPhase = 'recruiting' | 'active' | 'defeated' | 'expired';

export function bossPhase(
  b: Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>,
  now: number,
): BossPhase {
  if (b.defeatedAt != null) return 'defeated';
  if (now < bossStartAt(b)) return 'recruiting';
  if (now < bossEndsAt(b)) return 'active';
  return 'expired';
}

/** Le boss est-il encore « en cours » (il occupe le joueur) ? */
function bossInProgress(
  b: Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>,
  now: number,
): boolean {
  const p = bossPhase(b, now);
  return p === 'recruiting' || p === 'active';
}

/** PV d'un boss : une part par participant (le lanceur compris). */
export function bossHpTotal(family: BossFamily, participants: number): number {
  return FRIEND_BOSS.shareUnits[family] * Math.max(1, Math.floor(participants));
}

/** Instant où le LANCEUR pourra déclarer à nouveau (null = tout de suite). */
export function nextDeclareAt(
  ownedBosses: readonly Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>[],
): number | null {
  if (!ownedBosses.length) return null;
  const lastEnd = Math.max(...ownedBosses.map(bossEndedAt));
  return lastEnd + FRIEND_BOSS.cooldownMs;
}

/** Peut-on déclarer un boss maintenant ? Aucun boss en cours (lancé ou rejoint), et le
 *  délai de relance écoulé pour les boss qu'on a lancés. */
export function canDeclareBoss(
  opts: {
    owned: readonly Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>[];
    joined: readonly Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>[];
  },
  now: number,
): boolean {
  if ([...opts.owned, ...opts.joined].some((b) => bossInProgress(b, now))) return false;
  const next = nextDeclareAt(opts.owned);
  return next == null || now >= next;
}

/** Ce qu'une saisie peut encore apporter, plafonds compris.
 *  `lastDayUnits` = ce que CE joueur a déjà saisi sur ce boss pendant les 24 dernières heures. */
export function acceptedUnits(
  family: BossFamily,
  asked: number,
  lastDayUnits: number,
  hpLeft: number,
): number {
  const share = FRIEND_BOSS.shareUnits[family];
  const perHit = Math.floor(share * FRIEND_BOSS.hitMaxShare);
  const dayLeft = Math.floor(share * FRIEND_BOSS.dayMaxShare) - Math.max(0, lastDayUnits);
  return Math.max(0, Math.min(Math.floor(asked), perHit, dayLeft, Math.max(0, hpLeft)));
}

/** A-t-on apporté sa part minimale ? */
export function metMinShare(family: BossFamily, units: number): boolean {
  return units >= FRIEND_BOSS.shareUnits[family] * FRIEND_BOSS.minShare;
}

/** XP de ses reps sur un boss — même barème que les challenges (`challenges.effortXpRaw`) :
 *  une rep × REP_XP × poids de rep, une seconde de gainage vaut ¼ de rep. */
export function bossRepsXp(family: BossFamily, units: number, repWeight: number): number {
  const u = Math.max(0, units);
  const raw = family === 'core' ? (u / 4) * REP_XP : u * REP_XP * repWeight;
  return Math.round(raw * XP_MULT);
}

/** Prime de complétion : versée si le boss est mort et la part minimale apportée. */
export function bossCompletionXp(
  family: BossFamily,
  units: number,
  repWeight: number,
  defeated: boolean,
): number {
  if (!defeated || !metMinShare(family, units)) return 0;
  const capped = Math.min(units, FRIEND_BOSS.shareUnits[family] * FRIEND_BOSS.bonusCapShares);
  return Math.round(bossRepsXp(family, capped, repWeight) * FRIEND_BOSS.bonusPct);
}

/** Part du combat restante à la mort du boss (0..1) — porte le bonus « tué tôt ». */
export function earlyKillFraction(
  b: Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>,
): number {
  if (b.defeatedAt == null) return 0;
  const left = bossEndsAt(b) - b.defeatedAt;
  return Math.max(0, Math.min(1, left / FRIEND_BOSS.durationMs));
}
