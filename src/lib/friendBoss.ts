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
  createdAt: number;
  /** Posé quand tous les invités ont répondu avant la fin de la fenêtre (ou sans invité). */
  startAt: number | null;
  defeatedAt: number | null;
  hpTotal: number;
  damage: number;
}

/** Démarrage effectif : la fin de la fenêtre d'invitation, ou plus tôt si tout le monde a
 *  répondu. ⚠️ `least` : un `startAt` posé après la fenêtre ne peut pas la repousser. */
export function bossStartAt(b: Pick<FriendBoss, 'createdAt' | 'startAt'>): number {
  const windowEnd = b.createdAt + FRIEND_BOSS.inviteWindowMs;
  return b.startAt == null ? windowEnd : Math.min(b.startAt, windowEnd);
}

function bossEndsAt(b: Pick<FriendBoss, 'createdAt' | 'startAt'>): number {
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
