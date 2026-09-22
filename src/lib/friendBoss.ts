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
//  • Lancer OU rejoindre coûte des JETONS 🎫 (le prix du cran), gagnés par le sport — au
//    plus 2 par jour, réserve de 6 (v0.1066). Plusieurs boss à la fois, un seul par
//    exercice ; on ne quitte pas un boss. Plus de délai de relance.
//  • Une rep = 1000 points de dégât, pour tout le monde (égalité). Chaque participant
//    ajoute sa part de PV.
//  • Les reps comptent comme du sport ; une prime de complétion s'ajoute si le boss meurt
//    et qu'on a apporté sa part minimale.
import { REP_XP, XP_MULT } from './athlete';
import { normMuscle } from './muscles';
import { mulberry32, seedOf } from './combat';
import { rollTrophy, type EffectType, type Item } from './items';
import { CONDITIONING_CHALLENGE_IDS, isCardioChallengeExercise } from '@/data/cardio';
import { bossGoldForLevel, bossSummonCost } from '@/data/bosses';
import type { HeroLook } from './heroLook';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Famille d'un exo de boss — elle fixe la part de PV et l'affixe du trophée. */
export type BossFamily = 'push' | 'legs' | 'pull' | 'core' | 'conditioning';

export const FRIEND_BOSS = {
  /** Temps laissé aux invités pour répondre. */
  inviteWindowMs: 24 * HOUR,
  /** Durée du combat, à partir du démarrage. */
  durationMs: 7 * DAY,
  /** Part de PV d'UN participant, en unités de l'exo (reps, ou secondes pour le gainage).
   *  ⚠️ C'est un volume EN PLUS de la semaine (v0.869, décision de l'utilisateur) : le Défi
   *  360 est l'entraînement global, le boss un bonus RELATIVEMENT FACILE. Une part vaut
   *  environ la MOITIÉ d'un groupe du 360 intermédiaire (12 séries ≈ 120 reps, 540 s de
   *  gainage) — avant elle en valait 2,5 fois. La traction est plus dure, sa part est plus
   *  petite ; le gainage se compte en secondes. Doit rester égal à `fboss_share` (migr. 0069). */
  shareUnits: { push: 60, legs: 80, pull: 30, core: 300, conditioning: 60 } as Record<
    BossFamily,
    number
  >,
  /** ⚠️ Exposant de la RÉCOMPENSE selon la difficulté (v0.904, MESURÉ ; demandé par
   *  l'utilisateur : « une récompense de plus en plus intéressante avec la difficulté, pour
   *  que ce soit intéressant de lancer un boss dur au lieu d'enchaîner des faciles »).
   *
   *  ⚠️ IL DOIT ÊTRE > 1, ET LA MESURE LE DIT. Or gagné PAR JOUR au niveau 30, en comptant
   *  le CYCLE de chaque cran (durée pour l'abattre + 48 h de délai, règle d'avant les jetons) : à l'exposant **0,5**
   *  le meilleur choix reste ×1 — un boss dur ne paie pas sa peine ; à **1,0** le cran le
   *  plus dur rapporte 14 789/jour contre 4 437 en enchaînant du facile (×3,3) mais l'or PAR
   *  REP est constant ; à **1,2** il rapporte 20 405 contre 3 862 (**×5,3**) ET l'or par rep
   *  monte de 38 % au cran le plus dur — c'est ce que « de plus en plus intéressante » veut
   *  dire.
   *
   *  ⚠️ PAS PLUS HAUT : mesuré, le coffre du cran le plus dur vaut **0,77 à 1,02 jour de
   *  revenu** à 1,2, mais 1,06-1,41 à 1,4 et 1,47-1,95 à 1,6 — au-delà d'une journée, un
   *  seul boss paierait une bonne part d'un niveau de bâtiment (1 à 4 jours, `goldSink`) et
   *  deviendrait la meilleure source d'or du jeu. */
  rewardExp: 1.2,
  /** Dégâts d'UNE rep (ou d'une seconde de gainage), v0.872 : de plus gros chiffres, et
   *  RIEN d'autre. Les PV sont multipliés d'autant, donc le nombre de reps pour abattre un
   *  boss ne bouge pas. Les plafonds de saisie, la part minimale et l'XP restent en reps.
   *  Doit rester égal à `fboss_damage_per_unit` (migr. 0070). */
  damagePerUnit: 1000,
  /** Part minimale à apporter pour toucher le coffre et la prime. Sans elle, un invité
   *  qui ne fait rien profiterait du travail des autres. */
  minShare: 0.5,
  /** Plafond d'UNE saisie, en parts d'un joueur.
   *  ⚠️ 2,5 et 3 parts (v0.889, signalé en urgence : « ça m'a bloqué mes tirs ») : la v0.869 a
   *  divisé les parts par 5 et les plafonds, exprimés en part, ont suivi — 36 pompes par 24 h,
   *  deux joueurs bloqués le premier jour. Ils retrouvent leur valeur absolue d'avant (pompes
   *  150 par saisie). ⚠️ Plus de plafond sur 24 h (v0.892, demandé par l'utilisateur) : ce
   *  plafond de saisie reste un garde-fou contre la faute de frappe, le regard des amis
   *  (saisies visibles) fait le reste. Doit rester égal à `fboss_hit` (migr. 0075). */
  hitMaxShare: 2.5,
  /** Invités maximum par boss. */
  maxInvites: 9,
  /** Prime de complétion, en part de l'XP gagnée par ses propres reps.
   *  ⚠️ MESURÉE : une part complète vaut peu en XP (300 pompes → 120 XP, soit ~¼ d'une
   *  séance d'une heure ; 60 pompes → 24 XP depuis les parts allégées v0.869), d'où un
   *  pourcentage élevé. Un challenge de même volume sur
   *  7 jours paie ~30 % : le boss paie plus, parce qu'il demande de tenir sa part pour
   *  un groupe. */
  bonusPct: 1,
  /** La prime ne compte que les reps jusqu'à N parts : au-delà, les reps paient toujours
   *  leur XP, mais ne gonflent plus la prime. */
  bonusCapShares: 2,
} as const;

/** 🎚️ LES CRANS DE DIFFICULTÉ (v0.904 ; demandés par l'utilisateur : « des crans avec des
 *  noms un peu sympa qui fassent comprendre la difficulté — la difficulté définit le nombre
 *  de reps par personne »).
 *
 *  ⚠️ LE VOCABULAIRE ÉVITE DÉLIBÉRÉMENT CELUI DES RANGS ET DES RARETÉS (Bronze… Divin
 *  ancestral, commun… primordial) : l'app parle en rangs partout depuis la v0.874, et
 *  réutiliser « Légendaire » pour une difficulté ferait lire un effort comme une qualité
 *  d'objet. Ici les mots parlent d'EFFORT, et de rien d'autre.
 *
 *  ⚠️ `luck` NE TOUCHE PAS LE RANG DU TROPHÉE, qui reste celui du joueur (v0.894) : elle
 *  n'agit que sur ses ÉTOILES et son niveau d'objet (`rollStarJet` / `rollItemLevel`). Le
 *  sport reste donc le plafond. Mesuré au niveau 30 sur 4 000 tirages, part de trophées
 *  ★5 : **60 % sans chance · 68 % à 0,25 · 75 % à 0,5 · 90 % à 1** — et ça SATURE au-delà
 *  de 1, d'où une échelle qui s'arrête là. L'écart est réel mais modeste : le trophée était
 *  déjà généreux, on ne le survend pas. */
export interface BossTier {
  id: string;
  label: string;
  emoji: string;
  /** Multiplie le nombre de reps PAR PERSONNE. Doit rester égal à `fboss_tier_mult`. */
  mult: number;
  /** Chance ajoutée au tirage du trophée (étoiles + niveau d'objet). */
  luck: number;
  /** 🎟️ Tickets d'invocation versés dans le coffre (v0.992, « le sport alimente le
   *  gacha »). ⚠️ **L'Échauffement ne paie RIEN** : c'est le cran qu'on enchaînerait pour
   *  farmer (30 pompes, pour un seul jeton). Au-dessus, un ticket par cran — et le plus
   *  dur (4) reste sous un Défi 360 intense (5), qui est une SEMAINE entière. */
  tickets: number;
  /** 🎫 Jetons que coûte ce cran — à LANCER comme à REJOINDRE (v0.1066). Doit rester égal à
   *  `fboss_token_cost` (migr. 0086). ⚠️ Rejoindre coûte autant que lancer : mesuré,
   *  rejoindre à 1 jeton des boss Inhumains donnait jusqu'à +110 % d'or par semaine (un
   *  coffre ×13,8 pour un seul jeton). Au même prix, le rendement par jeton est le même pour
   *  tous, et les coffres restent sous +25 % du revenu d'une semaine. */
  tokens: number;
}

export const BOSS_TIERS: readonly BossTier[] = [
  {
    id: 'echauffement',
    label: 'Échauffement',
    emoji: '🌱',
    mult: 0.5,
    luck: 0,
    tickets: 0,
    tokens: 1,
  },
  { id: 'serieux', label: 'Sérieux', emoji: '💪', mult: 1, luck: 0.15, tickets: 1, tokens: 1 },
  { id: 'costaud', label: 'Costaud', emoji: '🔥', mult: 2, luck: 0.4, tickets: 2, tokens: 2 },
  { id: 'brutal', label: 'Brutal', emoji: '⚡', mult: 3, luck: 0.6, tickets: 3, tokens: 3 },
  { id: 'inhumain', label: 'Inhumain', emoji: '💀', mult: 5, luck: 1, tickets: 4, tokens: 4 },
];

/** Le cran par DÉFAUT — et celui des boss d'AVANT les crans. ⚠️ Son `mult` vaut 1 : un boss
 *  déjà lancé garde donc exactement les PV qu'il avait, sans migration de données. */
export const BOSS_TIER_DEFAULT = 'serieux';

export function bossTier(id: string | null | undefined): BossTier {
  return BOSS_TIERS.find((t) => t.id === id) ?? BOSS_TIERS.find((t) => t.id === BOSS_TIER_DEFAULT)!;
}

/** 📏 LA PART D'UN PARTICIPANT, cran compris — la SEULE définition côté client.
 *  ⚠️ Tout ce qui se compte en « parts » passe par elle : PV du boss, plafond d'une saisie,
 *  part minimale du coffre, plafond de la prime d'XP. Une seule lecture, donc les crans ne
 *  peuvent pas n'être appliqués qu'à moitié. */
export function bossShareUnits(family: BossFamily, tier?: string | null): number {
  return Math.round(FRIEND_BOSS.shareUnits[family] * bossTier(tier).mult);
}

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
  /** Cran de difficulté choisi au lancement (`BOSS_TIERS`). ⚠️ Absent sur les boss d'AVANT
   *  les crans → `bossTier` retombe sur « Sérieux », dont le multiplicateur vaut 1 : leurs
   *  PV et leurs plafonds ne bougent pas d'un point, sans migration de données. */
  tier?: string | null;
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
  /** Apparence de son héros (migr. 0072), pour la scène de combat. Absente tant qu'il n'a
   *  pas ouvert la page du boss. */
  look?: HeroLook | null;
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
  tier?: string | null;
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
    tier: r.tier ?? null,
    createdAt: ms(r.created_at) ?? 0,
    startAt: ms(r.start_at),
    defeatedAt: ms(r.defeated_at),
    hpTotal: r.hp_total,
    damage: r.damage,
  };
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
      bossCompletionXp(b.family, m.units, b.repWeight, b.defeatedAt != null, b.tier);
  }
  return out;
}

/** Libellé français d'un refus du serveur (codes levés par la migration 0067). */
export function bossErrorMessage(code: string): string {
  const table: Record<string, string> = {
    no_tokens: 'Pas assez de jetons 🎫 : ils se gagnent en faisant du sport.',
    same_exercise: 'Tu as déjà un boss en cours sur cet exercice — choisis-en un autre.',
    // Codes d'avant les jetons (migr. 0078) : un onglet resté ouvert peut encore les voir.
    busy: 'Tu as déjà un boss en cours — recharge la page.',
    cooldown: 'Tu pourras lancer un nouveau boss plus tard — recharge la page.',
    not_friend: 'Tu ne peux inviter que tes amis.',
    too_many_invites: `Au plus ${FRIEND_BOSS.maxInvites} amis par boss.`,
    closed: 'Les invitations sont closes : le combat a commencé.',
    not_invited: 'Cette invitation n’existe plus.',
    not_member: 'Tu ne participes pas à ce boss.',
    not_active: 'Le combat n’est pas en cours.',
    capped: 'Plafond atteint : reviens plus tard pour frapper encore.',
    no_character: 'Crée d’abord ton aventurier dans l’Aventure.',
    no_altar: 'Construis l’Autel des boss dans ta base pour lancer un boss.',
    bad_exercise: 'Cet exercice ne peut pas servir de boss.',
    bad_tier: 'Cette difficulté n’existe pas — recharge la page.',
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

/** PV d'un boss : une part par participant (le lanceur compris), en points de dégât. */
export function bossHpTotal(
  family: BossFamily,
  participants: number,
  tier?: string | null,
): number {
  return bossDamage(bossShareUnits(family, tier) * Math.max(1, Math.floor(participants)));
}

/** Dégâts infligés par des reps (ou des secondes de gainage). */
export function bossDamage(units: number): number {
  return Math.max(0, Math.floor(units)) * FRIEND_BOSS.damagePerUnit;
}

/** Reps qu'il reste à faire pour abattre le boss (arrondi au-dessus, comme `fboss_hit`). */
export function bossUnitsLeft(b: Pick<FriendBoss, 'hpTotal' | 'damage'>): number {
  return Math.ceil(Math.max(0, b.hpTotal - b.damage) / FRIEND_BOSS.damagePerUnit);
}

// ── Scène de combat ───────────────────────────────────────────────────────────────

const BOSS_EMOJIS = ['🐉', '👹', '🦖', '🐙', '🦂', '🧌', '🐲', '👾'] as const;

/** Silhouette du boss : tirée de son id, donc la même pour tout le groupe et à chaque visite. */
export function bossEmoji(bossId: string): string {
  return BOSS_EMOJIS[seedOf(bossId) % BOSS_EMOJIS.length]!;
}

export interface BossStrike {
  id: string;
  userId: string;
  damage: number;
}

/** Écart entre deux projectiles d'une même frappe : une rep = un projectile. */
export const BOSS_SHOT_MS = 500;

/** Dégâts de chaque projectile d'une frappe : un par rep, et leur somme vaut exactement les
 *  dégâts de la frappe (la barre retombe pile sur ce que dit le serveur). */
export function strikeShots(damage: number): number[] {
  const total = Math.max(0, Math.round(damage));
  const n = Math.max(1, Math.round(total / FRIEND_BOSS.damagePerUnit));
  const per = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - per * (n - 1) : per));
}

/** Les cris du boss, du plus léger au dernier souffle. Une frappe = UN cri. */
export const BOSS_CRIES = {
  light: ['Aïe !', 'Grrr…', 'Ouch !', 'Hmpf !', 'Ça pique…', 'Argh !', 'Hé !', 'Grmbl…'],
  heavy: [
    'AAARGH !',
    'Ça fait mal !!',
    'Non… pas ça !',
    'Vous allez le payer !',
    'Mes côtes !',
    'ARRÊTEZ !',
    'Impossible !',
  ],
  death: ['Nooooon…', 'Je… reviendrai…', 'Pas… comme ça…'],
} as const;

/** Part des PV du boss à partir de laquelle une frappe arrache un GRAND cri. */
export const BOSS_HEAVY_SHARE = 0.1;

/** Le cri d'une frappe : un dernier souffle si elle l'abat, un grand cri si elle retire au
 *  moins `BOSS_HEAVY_SHARE` de ses PV, sinon un petit — tiré au hasard (`rng` ∈ [0, 1)),
 *  jamais le même que le cri précédent quand le registre en offre un autre. */
export function bossCry(
  damage: number,
  hpBefore: number,
  hpTotal: number,
  rng: number,
  previous?: string | null,
): string {
  const pool =
    damage >= hpBefore && hpBefore > 0
      ? BOSS_CRIES.death
      : damage >= hpTotal * BOSS_HEAVY_SHARE
        ? BOSS_CRIES.heavy
        : BOSS_CRIES.light;
  const choices = pool.length > 1 ? pool.filter((c) => c !== previous) : pool;
  const r = Math.min(0.999999, Math.max(0, rng));
  return choices[Math.floor(r * choices.length)]!;
}

/** Frappes des AUTRES depuis ma dernière visite, à rejouer à l'ouverture (les plus récentes,
 *  au plus `max`, dans l'ordre chronologique), et les PV AVANT ces frappes pour que la barre
 *  parte de là où je l'avais laissée. Les frappes plus anciennes que la fenêtre sont déjà
 *  comptées dans la barre de départ. */
export function strikesToReplay(
  b: Pick<FriendBoss, 'id' | 'hpTotal' | 'damage'>,
  hits: readonly FriendBossHit[],
  me: string,
  since: number,
  max = 6,
): { strikes: BossStrike[]; startHp: number } {
  const fresh = hits
    .filter((h) => h.bossId === b.id && h.userId !== me && h.createdAt > since)
    .sort((x, y) => x.createdAt - y.createdAt)
    .slice(-max)
    .map((h) => ({ id: h.id, userId: h.userId, damage: bossDamage(h.units) }));
  const hpLeft = Math.max(0, b.hpTotal - b.damage);
  const replayed = fresh.reduce((a, s) => a + s.damage, 0);
  return { strikes: fresh, startHp: Math.min(b.hpTotal, hpLeft + replayed) };
}

/** PV lisibles : « 120 000 ». */
export function fmtBossPv(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('fr-FR');
}

// ── 🎫 Jetons de boss (v0.1066) ─────────────────────────────────────────────────────
//
// On LANCE et on REJOINT un boss en dépensant des jetons, qui se GAGNENT PAR LE SPORT : au
// plus deux par jour, selon l'XP gagnée ce jour-là. Plus de délai de 48 h ni de « un seul
// boss à la fois » : c'est la réserve de jetons qui borne le rythme.
//
// ⚠️ MESURÉ SUR LES COMPTES RÉELS (2026-09-22) : un sportif « normal » fait 100 à 700 XP
// par jour actif, le plus actif ~1 100. Une règle PROPORTIONNELLE à l'XP donnait 0,8 jeton
// par semaine au joueur qui vient souvent mais en petites séances (il l'écrasait) ; un jeton
// par jour actif en donnait un pour 10 XP (quelques reps de défi). Les SEUILS donnent
// 2 à 12,5 jetons par semaine selon le profil : le gros sportif gagne plus, mais au plus
// deux fois plus, jamais dix.

export const BOSS_TOKENS = {
  /** XP du jour à partir de laquelle on gagne le 1er jeton : une vraie petite séance. */
  firstAt: 80,
  /** …et le 2e : une grosse journée (un jour sur trois pour un sportif régulier). */
  secondAt: 500,
  /** Réserve maximale : on épargne pour un Inhumain (4), jamais une montagne. Doit rester
   *  égal à la contrainte de `characters.boss_tokens` (migr. 0086). */
  stockMax: 6,
  /** Un trou de plus de 7 jours sans observation ne rapporte pas plus que 7 jours. */
  gapMaxDays: 7,
} as const;

/** Jetons que vaut une journée à `xp` points. */
export function tokensForDayXp(xp: number): number {
  if (!(xp >= BOSS_TOKENS.firstAt)) return 0;
  return xp >= BOSS_TOKENS.secondAt ? 2 : 1;
}

/** Ce qui est retenu entre deux observations (JSONB `characters.boss_token_state`). */
export interface BossTokenState {
  /** Jour observé en dernier (AAAA-MM-JJ). */
  day: string;
  /** XP totale au début de ce jour : l'XP du jour = total − base. */
  base: number;
  /** Jetons déjà versés pour ce jour. */
  credited: number;
  /** Dernière XP totale observée. */
  lastXp: number;
}

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Fait avancer les jetons jusqu'à `today`, à partir de l'XP TOTALE de sport observée.
 *
 * ⚠️ L'XP du jour se lit par DIFFÉRENCE (total − XP au début du jour) : c'est la seule
 * mesure qui compte toutes les sources (séances, sorties, défis, Défi 360, boss) sans
 * refaire leurs calculs. Première observation : on part de zéro, aucun rattrapage.
 *
 * ⚠️ JOURS NON OBSERVÉS : l'app n'a pas été ouverte, donc on ne sait pas quel jour l'XP a
 * été gagnée. Elle est RÉPARTIE à parts égales sur les jours écoulés (7 au plus) — sinon
 * trois jours de sport sans ouvrir l'app ne vaudraient qu'une journée, plafonnée à 2.
 *
 * Jamais de reprise : une XP qui baisse (séance supprimée) ne retire aucun jeton déjà versé.
 */
export function advanceBossTokens(
  state: BossTokenState | null,
  totalXp: number,
  today: string,
  stock: number,
): { state: BossTokenState; stock: number; gained: number } {
  const total = Math.max(0, Math.round(totalXp));
  if (!state) {
    return { state: { day: today, base: total, credited: 0, lastXp: total }, stock, gained: 0 };
  }
  let gained = 0;
  let next: BossTokenState;
  const gap = dayDiff(state.day, today);
  if (gap <= 0) {
    // Même jour (ou horloge reculée) : on complète ce jour.
    const earned = tokensForDayXp(total - state.base);
    gained = Math.max(0, earned - state.credited);
    next = { ...state, credited: Math.max(state.credited, earned), lastXp: total };
  } else {
    // 1) On clôt le dernier jour observé avec ce qu'on en savait.
    gained += Math.max(0, tokensForDayXp(state.lastXp - state.base) - state.credited);
    // 2) L'XP apparue depuis est répartie sur les jours écoulés (aujourd'hui compris).
    const days = Math.min(gap, BOSS_TOKENS.gapMaxDays);
    const per = Math.max(0, total - state.lastXp) / days;
    gained += (days - 1) * tokensForDayXp(per);
    const todayTokens = tokensForDayXp(per);
    gained += todayTokens;
    next = { day: today, base: total - per, credited: todayTokens, lastXp: total };
  }
  const room = Math.max(0, BOSS_TOKENS.stockMax - stock);
  const kept = Math.min(gained, room);
  return { state: next, stock: stock + kept, gained: kept };
}

/** Coût d'un cran, à lancer comme à rejoindre. */
export function bossTokenCost(tier: string | null | undefined): number {
  return bossTier(tier).tokens;
}

/** Pourquoi on ne peut pas lancer ou rejoindre CE boss (null = on peut). Même règle que
 *  `fboss_declare` / `fboss_respond` : les jetons, et un seul boss en cours par exercice
 *  (sinon une même série frapperait deux boss). */
export function bossJoinBlocker(
  opts: {
    tokens: number;
    tier: string | null | undefined;
    exerciseId: string;
    /** Mes boss en cours (lancés ou rejoints). */
    mine: readonly Pick<FriendBoss, 'exerciseId' | 'createdAt' | 'startAt' | 'defeatedAt'>[];
  },
  now: number,
): 'no_tokens' | 'same_exercise' | null {
  if (opts.mine.some((b) => bossInProgress(b, now) && b.exerciseId === opts.exerciseId))
    return 'same_exercise';
  if (opts.tokens < bossTokenCost(opts.tier)) return 'no_tokens';
  return null;
}

/** Ce qu'une saisie peut encore apporter, plafonds compris, en reps : le plafond d'une
 *  saisie et `unitsLeft`, les reps qui restent avant la mort du boss (`bossUnitsLeft`).
 *  ⚠️ Aucun plafond sur 24 h (v0.892). */
export function acceptedUnits(
  family: BossFamily,
  asked: number,
  unitsLeft: number,
  tier?: string | null,
): number {
  const perHit = Math.floor(bossShareUnits(family, tier) * FRIEND_BOSS.hitMaxShare);
  return Math.max(0, Math.min(Math.floor(asked), perHit, Math.max(0, unitsLeft)));
}

/** A-t-on apporté sa part minimale ? */
export function metMinShare(family: BossFamily, units: number, tier?: string | null): boolean {
  return units >= bossShareUnits(family, tier) * FRIEND_BOSS.minShare;
}

/** XP de ses reps sur un boss — même barème que les challenges (`challenges.effortXpRaw`) :
 *  une rep × REP_XP × poids de rep, une seconde de gainage vaut ¼ de rep. */
export function bossRepsXp(family: BossFamily, units: number, repWeight: number): number {
  const u = Math.max(0, units);
  const raw = family === 'core' ? (u / 4) * REP_XP : u * REP_XP * repWeight;
  return Math.round(raw * XP_MULT);
}

/** Les frappes d'un boss, groupées PAR JOUR — du jour le plus récent au plus ancien, et
 *  dans chaque jour de la frappe la plus récente à la plus ancienne.
 *
 *  ⚠️ Distincte de `bossAgendaEntries` : celle-ci garde le DÉTAIL et prend les frappes de
 *  TOUT LE MONDE (l'écran du boss montre le groupe), là où l'agenda ne retient que les
 *  miennes et les convertit en XP. Elles ne répondent pas à la même question.
 *
 *  ⚠️ `dayKey` est INJECTÉE : « quel jour est-ce ? » dépend du fuseau de l'appelant, et
 *  cette lib reste pure. */
export function bossHitsByDay(
  hits: readonly FriendBossHit[],
  bossId: string,
  dayKey: (ms: number) => string,
): { day: string; at: number; total: number; hits: FriendBossHit[] }[] {
  const byDay = new Map<string, FriendBossHit[]>();
  for (const h of hits) {
    if (h.bossId !== bossId || h.units <= 0) continue;
    const day = dayKey(h.createdAt);
    const list = byDay.get(day);
    if (list) list.push(h);
    else byDay.set(day, [h]);
  }
  return [...byDay.entries()]
    .map(([day, list]) => {
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
      return {
        day,
        // Le plus récent du jour : c'est lui qui date la ligne (« il y a 2 h »).
        at: sorted[0]!.createdAt,
        total: sorted.reduce((n, h) => n + h.units, 0),
        hits: sorted,
      };
    })
    .sort((a, b) => b.at - a.at);
}

/** Une ligne d'agenda : ce qu'un joueur a fait sur UN boss, UN jour donné. */
export interface BossAgendaEntry {
  bossId: string;
  /** Exo du boss — la clé de ses muscles (principal et secondaires). */
  exerciseId: string;
  /** Famille du boss : elle décide de la piste (`bossXpTrack`) et de l’unité. */
  family: BossFamily;
  /** Clé de jour rendue par `dayKey` (l'agenda y range ses entrées). */
  day: string;
  /** Nom de l'exo du boss — le titre affiché. */
  title: string;
  /** Reps (ou secondes) de chaque frappe de ce jour, dans l'ordre. */
  units: number[];
  total: number;
  /** XP de ces reps — `bossRepsXp`, jamais une seconde formule. */
  xp: number;
  /** 'reps' ou 's' selon la famille (`bossUnitLabel`). */
  unit: 'reps' | 's';
}

/** Ce qu'un joueur a fait sur ses boss, groupé par (boss, jour) — de quoi bâtir l'agenda.
 *
 *  ⚠️ On ne retient que les boss où il est ACCEPTÉ, la règle exacte de `friendBossXp` :
 *  l'agenda ne doit jamais afficher une XP que le total ignore. (Le serveur refuse déjà une
 *  frappe sans adhésion, mais c'est lui qui le garantit, pas l'écran.)
 *
 *  ⚠️ La PRIME de complétion n'est PAS ici : elle tombe à la mort du boss et ne se rattache
 *  à aucun jour d'effort — même choix que `challengeDayXp`, qui l'omet aussi. Le total
 *  (`friendBossXp`) la compte, l'agenda montre l'effort.
 *
 *  ⚠️ `dayKey` est INJECTÉE : « quel jour est-ce ? » dépend du fuseau de l'appelant, et
 *  cette lib reste pure. L'agenda passe la même fonction que pour ses autres sources. */
export function bossAgendaEntries(
  bosses: readonly FriendBoss[],
  members: readonly FriendBossMember[],
  hits: readonly FriendBossHit[],
  userId: string,
  dayKey: (ms: number) => string,
): BossAgendaEntry[] {
  const out: BossAgendaEntry[] = [];
  const accepted = new Set(
    members.filter((m) => m.userId === userId && m.status === 'accepted').map((m) => m.bossId),
  );
  for (const b of bosses) {
    if (!accepted.has(b.id)) continue;
    const byDay = new Map<string, number[]>();
    for (const h of hits) {
      if (h.bossId !== b.id || h.userId !== userId || h.units <= 0) continue;
      const day = dayKey(h.createdAt);
      const list = byDay.get(day);
      if (list) list.push(h.units);
      else byDay.set(day, [h.units]);
    }
    for (const [day, units] of byDay) {
      const total = units.reduce((a, u) => a + u, 0);
      out.push({
        bossId: b.id,
        exerciseId: b.exerciseId,
        family: b.family,
        day,
        title: b.exerciseName,
        units,
        total,
        xp: bossRepsXp(b.family, total, b.repWeight),
        unit: bossUnitLabel(b.family),
      });
    }
  }
  return out;
}

/** Prime de complétion : versée si le boss est mort et la part minimale apportée.
 *  ⚠️ Le CRAN passe par `bossShareUnits` des deux côtés (part minimale ET plafond de la
 *  prime) : un boss plus dur demande plus pour la toucher, et en plafonne davantage. */
export function bossCompletionXp(
  family: BossFamily,
  units: number,
  repWeight: number,
  defeated: boolean,
  tier?: string | null,
): number {
  if (!defeated || !metMinShare(family, units, tier)) return 0;
  const capped = Math.min(units, bossShareUnits(family, tier) * FRIEND_BOSS.bonusCapShares);
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

// ── Coffre ─────────────────────────────────────────────────────────────────────────

/** Affixe PRINCIPAL du trophée selon la famille de l'exo (choisi avec l'utilisateur).
 *  ⚠️ Tirage et gainage portent DEUX stats (v0.880, mesuré) : le critique et la réduction
 *  sont PLAFONNÉS, et un héros équipé en est déjà presque au plafond — seuls, ils valaient
 *  0 à 1,3 % de puissance avant le niveau 50, contre 1,6 à 3,7 % pour poussée et jambes.
 *  Dégâts + critique et PV + réduction ramènent ces familles au niveau des autres. */
export const TROPHY_MAINS: Record<BossFamily, readonly EffectType[]> = {
  push: ['damage_pct'],
  legs: ['max_pv_pct'],
  pull: ['damage_pct', 'crit_pct'],
  core: ['max_pv_pct', 'dmg_reduction_pct'],
  conditioning: ['momentum_pct', 'initiative_pct'],
};

export const FRIEND_BOSS_CHEST = {
  /** Or et pierres du coffre, en boss de palier du niveau du joueur : un boss entre amis
   *  demande une semaine d'effort à plusieurs, il paie comme deux boss de palier. */
  bosses: 2,
  /** Bonus « tué tôt » : or et pierres × (1 + part du combat restante × ce facteur). */
  earlyMult: 1,
  /** Chance du trophée ajoutée par la part du combat restante. */
  earlyLuck: 0.5,
} as const;

export interface FriendBossChest {
  gold: number;
  stones: number;
  /** Part du combat restante à la mort (0..1) : ce qu'a rapporté le fait de le tuer tôt. */
  early: number;
  /** 🎟️ Tickets d'invocation — ceux du cran (`BossTier.tickets`). ⚠️ Le « tué tôt » n'en
   *  ajoute pas : il paie déjà en or, en pierres et en chance du trophée. */
  tickets: number;
  trophy: Omit<Item, 'id'>;
}

/**
 * Contenu du coffre d'UN joueur. Tiré côté client (le serveur ne connaît pas le jeu), avec
 * une graine FIXE boss + joueur : rouvrir la page, ou le récupérer après un échec, rend
 * exactement le même coffre. Le serveur, lui, garantit qu'il est dû et pris une fois.
 */
export function friendBossChest(
  b: Pick<
    FriendBoss,
    'id' | 'family' | 'exerciseName' | 'createdAt' | 'startAt' | 'defeatedAt' | 'tier'
  >,
  userId: string,
  playerLevel: number,
): FriendBossChest {
  const level = Math.max(1, Math.floor(playerLevel));
  const early = earlyKillFraction(b);
  const tier = bossTier(b.tier);
  // ⚠️ SUPER-LINÉAIRE en difficulté (`rewardExp` 1,2) : c'est ce qui rend un boss dur plus
  // payant qu'une enfilade de faciles — mesuré, ×5,3 d'or par jour, et l'or PAR REP monte
  // de 38 % au cran le plus dur. Proportionnel (exposant 1), l'or par rep serait plat et
  // « de plus en plus intéressante » ne voudrait rien dire.
  const mult =
    FRIEND_BOSS_CHEST.bosses *
    (1 + early * FRIEND_BOSS_CHEST.earlyMult) *
    tier.mult ** FRIEND_BOSS.rewardExp;
  const rng = mulberry32(seedOf(`${b.id}:${userId}`));
  return {
    gold: Math.round((bossGoldForLevel(level) * mult) / 10) * 10,
    stones: Math.round(bossSummonCost(level) * mult),
    early,
    tickets: tier.tickets,
    trophy: rollTrophy(rng, {
      mains: TROPHY_MAINS[b.family],
      title: b.exerciseName,
      level,
      // ⚠️ La chance du CRAN s'AJOUTE à celle du « tué tôt » : les deux disent « tu as fait
      // plus que le minimum ». Elle ne touche que les étoiles et le niveau d'objet — le rang
      // reste celui du joueur (v0.894), donc le sport demeure le plafond.
      luck: early * FRIEND_BOSS_CHEST.earlyLuck + tier.luck,
    }),
  };
}

/** Marque posée sur le personnage quand le coffre est versé (dans `cleared_dungeons`,
 *  comme les paliers du Labyrinthe) : le serveur dit « pris », cette marque dit « crédité ». */
export const chestMark = (bossId: string) => `fboss:${bossId}`;

/** État du coffre d'un joueur : rien à faire, à ouvrir (appel serveur), ou à récupérer
 *  (le serveur l'a donné mais le crédit n'a pas eu lieu — réseau coupé entre les deux). */
export function chestState(
  b: Pick<FriendBoss, 'id' | 'family' | 'defeatedAt' | 'tier'>,
  m: Pick<FriendBossMember, 'status' | 'units' | 'claimed'> | null | undefined,
  credited: readonly string[],
): 'none' | 'open' | 'recover' {
  if (b.defeatedAt == null || !m || m.status !== 'accepted') return 'none';
  if (!metMinShare(b.family, m.units, b.tier) || credited.includes(chestMark(b.id))) return 'none';
  return m.claimed ? 'recover' : 'open';
}
