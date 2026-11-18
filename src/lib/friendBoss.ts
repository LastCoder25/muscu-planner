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
//  • LANCER coûte des JETONS 🎫 (le prix du cran), gagnés par le sport — au plus 2 par jour,
//    réserve de 6 (v0.1066) — et le lanceur attend 48 h après la fin de son dernier boss
//    avant d'en relancer un (v0.1067). REJOINDRE est gratuit. Plusieurs boss à la fois, un
//    seul par exercice ; on ne quitte pas un boss.
//  • Une rep = 1000 points de dégât, pour tout le monde (égalité). Chaque participant
//    ajoute sa part de PV.
//  • Les reps comptent comme du sport ; une prime de complétion s'ajoute si le boss meurt
//    et qu'on a apporté sa part minimale.
//  • Récompenses SÉPARÉES (v1.200.0) : un coffre perso selon SES reps, et un bonus de groupe
//    si le boss tombe (cf. « DEUX RÉCOMPENSES SÉPARÉES » plus bas).
import { REP_XP, XP_MULT } from './athlete';
import { normMuscle } from './muscles';
import { mulberry32, seedOf } from './combat';
import { rollTrophy, type Item } from './items';
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
  /** ⏳ La notification « dernières heures » part ce délai avant la fin (migr. 0107,
   *  programmée par le serveur ; un test vérifie que le SQL dit la même chose). */
  endWarnMs: 6 * HOUR,
  /** Délai avant que le LANCEUR puisse relancer, à partir de la fin (mort ou 7 jours) de
   *  son dernier boss (migr. 0087, par-dessus les jetons). Rejoindre n'est pas concerné. */
  cooldownMs: 48 * HOUR,
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
  /** 🤝 LA PART RÉSERVÉE (v0.1206 ; demandé par l'utilisateur : « pouvoir en faire plus sans
   *  empêcher le pote d'avoir sa récompense ni le frustrer »). Tant qu'un ami accepté n'a pas
   *  apporté sa demi-part, les derniers PV du boss lui sont GARDÉS : le joueur rapide ne peut
   *  plus vider le boss avant lui. Ses reps au-delà ne sont pas perdues — elles comptent en
   *  SURPLUS (XP et coffre), sans dégâts. ⚠️ Les réserves TOMBENT le dernier jour (choix de
   *  l'utilisateur) : un ami qui ne joue pas du tout ne peut pas empêcher la mort du boss.
   *  Doit rester égal à `fboss_hit` (migr. 0092 : `interval '6 days'`). */
  reserveReleaseMs: 1 * DAY,
  /** 🎯 BOSS À PLUSIEURS EXERCICES (v1.320.0). Les parts de famille ramenées à la POUSSÉE : une
   *  rep de tirage (part 30) vaut 2 reps de poussée (60), une rep de jambes (80) 0,75, une seconde
   *  de gainage (300) 0,2. Le serveur compte en « points » = 1/20 de rep de poussée, pour rester en
   *  ENTIERS sans jamais arrondir une frappe (0,75 et 0,2 ne le sont pas, et un arrondi par frappe
   *  se farme). Doit rester égal à `fboss_mixed_scale` (migr. 0118). */
  mixedScale: 20,
  /** Nombre d'exercices d'un boss à choix : de 2 à 5 (un boss d'un exo reste un boss d'un exo). */
  minExercises: 2,
  maxExercises: 5,
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
  /** 🎫 Jetons que coûte ce cran au LANCEUR (v0.1066). Doit rester égal à `fboss_token_cost`
   *  (migr. 0086). ⚠️ Rejoindre est GRATUIT (v0.1067, décision de l'utilisateur) : mesuré,
   *  rejoindre des Inhumains à 1 jeton pouvait déjà doubler l'or d'une semaine ; gratuit, le
   *  rythme n'est plus borné que par les lanceurs (jetons + 48 h chacun), donc un joueur avec
   *  beaucoup d'amis actifs ouvre un coffre par boss d'ami. Assumé. */
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

/** 🎯 Un exercice d'un boss, figé à la déclaration (liste de 2 à 5 pour un boss à choix). */
export interface BossExercise {
  id: string;
  name: string;
  /** Famille RÉELLE de l'exo : elle fixe son poids en équivalent poussée et sa piste d'XP. */
  family: BossFamily;
  /** Poids de rep de l'exo : il ne touche que l'XP. */
  repWeight: number;
}

/** Un boss tel qu'on le lit en base (dates en ms). */
export interface FriendBoss {
  id: string;
  ownerId: string;
  /** Famille qui fixe la PART de PV. ⚠️ Pour un boss à plusieurs exercices c'est toujours
   *  'push' (la monnaie du boss : l'équivalent poussée) ; la vraie famille de chaque exo est
   *  dans `exercises`. */
  family: BossFamily;
  exerciseId: string;
  exerciseName: string;
  /** 🎯 Les exercices du boss (2 à 5), choisis à chaque frappe. ABSENT = boss d'un seul exo
   *  (`exerciseId` / `family`), comportement d'avant. Cf. `bossExercises`. */
  exercises?: BossExercise[] | null;
  /** 🐉 Son NOM (« Gorgath l’Insatiable »), tiré par la base à la création (migr. 0108) :
   *  tout le groupe et les notifications lisent le même. Absent sur une ligne d’avant :
   *  `bossTitle` retombe sur l’exercice. */
  name?: string | null;
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
  /** Reps apportées. ⚠️ Boss à plusieurs exercices : l'ÉQUIVALENT POUSSÉE exact (points ÷ 20,
   *  par exemple 12,75) — la monnaie commune de la part, de la réserve et du coffre. */
  units: number;
  /** Coffre perso pris (côté serveur). */
  claimed: boolean;
  /** Bonus de groupe pris (côté serveur, migr. 0103). */
  bonusClaimed: boolean;
  /** Coffre pris AVANT la séparation coffre perso / bonus de groupe : il comprenait déjà la
   *  victoire, donc aucun bonus en plus (migr. 0103). */
  legacyChest?: boolean;
  /** Apparence de son héros (migr. 0072), pour la scène de combat. Absente tant qu'il n'a
   *  pas ouvert la page du boss. */
  look?: HeroLook | null;
}

export interface FriendBossHit {
  id: string;
  bossId: string;
  userId: string;
  /** Toutes les reps de la saisie — elles paient toutes leur XP. ⚠️ Boss à plusieurs exercices :
   *  en ÉQUIVALENT POUSSÉE exact (points ÷ 20) ; la quantité brute est dans `qty`. */
  units: number;
  /** 🤝 Celles qui n'ont PAS fait de dégâts (parts réservées aux amis, ou au-delà de la mort
   *  du boss), dans la même monnaie que `units`. Absent sur les frappes d'avant la v0.1206 : 0. */
  surplus?: number;
  /** 🎯 L'exercice CHOISI pour cette frappe, et la quantité brute saisie (reps, ou secondes —
   *  bonus de temps compris). Absents sur un boss d'un exo : c'est celui du boss, et `units`. */
  exerciseId?: string | null;
  qty?: number | null;
  createdAt: number;
}

/** Reps d'une frappe qui ont vraiment entamé le boss. */
export const hitDamageUnits = (h: Pick<FriendBossHit, 'units' | 'surplus'>): number =>
  Math.max(0, h.units - (h.surplus ?? 0));

const ms = (iso: string | null | undefined): number | null =>
  iso ? Date.parse(iso) || null : null;

// ── 🎯 Boss à plusieurs exercices ────────────────────────────────────────────────────
//
// Un boss a de 2 à 5 exercices ; à CHAQUE frappe on choisit librement lequel. Tout se convertit
// en ÉQUIVALENT POUSSÉE grâce aux parts de famille déjà en place : une rep de tirage (part 30)
// = 2 reps de poussée (60), une rep de jambes (80) = 0,75, une seconde de gainage (300) = 0,2.
// Les PV valent donc ceux d'un boss de poussée du même cran, et « l'unité » du boss (part,
// plafond, réserve, coffre, XP de prime) est la rep de poussée — qui peut être fractionnaire
// (12,75). Un boss d'UN exo n'est pas concerné : rien ne change pour lui.
//
// ⚠️ Le serveur compte en POINTS entiers (1/20 de rep de poussée, `mixedScale`) : aucun arrondi
// par frappe, donc rien à farmer en découpant ses séries. Le client les lit divisés par 20.

/** Points (1/20 de rep de poussée) d'UNE unité (rep, ou seconde de gainage) d'une famille :
 *  1200 ÷ sa part — poussée 20 · jambes 15 · tirage 40 · gainage 4 · conditionnement 20. Entier
 *  pour les cinq familles (un test l'exige). Doit rester égal à `fboss_mixed_weight`. */
export function mixedWeight(family: BossFamily): number {
  return (FRIEND_BOSS.mixedScale * FRIEND_BOSS.shareUnits.push) / FRIEND_BOSS.shareUnits[family];
}

/** Équivalent poussée d'UNE unité d'un exo de cette famille (1 · 2 · 0,75 · 0,2 · 1) — pour
 *  l'AFFICHAGE : le calcul reste en points entiers. */
export const eqPerUnit = (family: BossFamily): number =>
  mixedWeight(family) / FRIEND_BOSS.mixedScale;

/** Les exercices d'un boss : sa liste (2 à 5), sinon son unique exo. */
export function bossExercises(
  b: Pick<FriendBoss, 'exerciseId' | 'exerciseName' | 'family' | 'repWeight' | 'exercises'>,
): BossExercise[] {
  if (b.exercises && b.exercises.length >= FRIEND_BOSS.minExercises) return b.exercises;
  return [{ id: b.exerciseId, name: b.exerciseName, family: b.family, repWeight: b.repWeight }];
}

/** Le boss a-t-il plusieurs exercices au choix ? */
export const isMixedBoss = (b: Pick<FriendBoss, 'exercises'>): boolean =>
  (b.exercises?.length ?? 0) >= FRIEND_BOSS.minExercises;

/** Les ids d'exercice qu'un boss OCCUPE (règle « un seul boss en cours par exercice »). */
export const bossExerciseIds = (
  b: Pick<FriendBoss, 'exerciseId' | 'exercises'>,
): readonly string[] => (isMixedBoss(b) ? b.exercises!.map((e) => e.id) : [b.exerciseId]);

/** L'exercice d'une frappe : celui qu'elle porte, sinon le premier du boss (frappe d'avant, ou
 *  d'un ancien client). */
export function hitExercise(
  b: Pick<FriendBoss, 'exerciseId' | 'exerciseName' | 'family' | 'repWeight' | 'exercises'>,
  h: Pick<FriendBossHit, 'exerciseId'>,
): BossExercise {
  const list = bossExercises(b);
  return list.find((e) => e.id === h.exerciseId) ?? list[0]!;
}

/** Reps d'une ligne de base : les POINTS d'un boss à plusieurs exercices (1/20 de rep de poussée)
 *  ramenés en équivalent poussée, sinon la valeur d'avant — boss d'un exo, ligne d'avant, base pas
 *  encore migrée. ⚠️ `units` n'est, sur un boss à choix, que l'arrondi lu par les anciens clients :
 *  le compte EXACT est `points`. */
export const unitsFromRow = (points: number | null | undefined, units: number): number =>
  points == null ? units : points / FRIEND_BOSS.mixedScale;

/** Quantité BRUTE d'une frappe (reps, ou secondes — bonus de temps compris). */
export const hitQty = (h: Pick<FriendBossHit, 'units' | 'qty'>): number => h.qty ?? h.units;

/** Relit défensivement la liste `friend_bosses.exercises` (JSON écrit par le serveur) : null si
 *  ce n'est pas une liste d'au moins 2 exercices valides. */
export function parseBossExercises(raw: unknown): BossExercise[] | null {
  if (!Array.isArray(raw)) return null;
  const families = Object.keys(FRIEND_BOSS.shareUnits);
  const out: BossExercise[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.family !== 'string' || !families.includes(r.family))
      continue;
    out.push({
      id: r.id,
      name: typeof r.name === 'string' ? r.name : r.id,
      family: r.family as BossFamily,
      repWeight: Number(r.rep_weight ?? 1) || 1,
    });
  }
  return out.length >= FRIEND_BOSS.minExercises ? out : null;
}

/** Ligne `friend_bosses` → boss (dates en ms). Un poids de rep absent vaut 1. */
export function bossFromRow(r: {
  id: string;
  owner_id: string;
  family: string;
  exercise_id: string;
  exercise_name: string;
  name?: string | null;
  rep_weight: number | string | null;
  tier?: string | null;
  created_at: string;
  start_at: string | null;
  defeated_at: string | null;
  hp_total: number;
  damage: number;
  exercises?: unknown;
}): FriendBoss {
  const exercises = parseBossExercises(r.exercises);
  return {
    id: r.id,
    ownerId: r.owner_id,
    family: r.family as BossFamily,
    exerciseId: r.exercise_id,
    exerciseName: r.exercise_name,
    ...(exercises ? { exercises } : {}),
    name: r.name ?? null,
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
  /** ⚠️ REQUIS : un boss à plusieurs exercices se paie frappe par frappe (la famille, le poids et
   *  la piste d'XP sont ceux de l'exo choisi) — sans les frappes il rendrait 0 XP en silence. */
  hits: readonly FriendBossHit[],
): { muscu: number; cardio: number } {
  const out = { muscu: 0, cardio: 0 };
  const byId = new Map(bosses.map((b) => [b.id, b]));
  for (const m of members) {
    if (m.userId !== userId || m.status !== 'accepted' || m.units <= 0) continue;
    const b = byId.get(m.bossId);
    if (!b) continue;
    if (isMixedBoss(b)) {
      mixedBossXp(b, m, hits, out);
      continue;
    }
    out[bossXpTrack(b.family)] +=
      bossRepsXp(b.family, m.units, b.repWeight) +
      bossCompletionXp(b.family, m.units, b.repWeight, b.defeatedAt != null, b.tier);
  }
  return out;
}

/** 🎯 XP d'un membre sur un boss à plusieurs exercices, ajoutée à `out`. Ses reps : celles de
 *  CHAQUE frappe, à la famille, au poids et à la piste de l'exo choisi (un burpee nourrit le cardio,
 *  des pompes la muscu). La prime de complétion suit la règle d'un boss d'un exo (boss mort ET
 *  part minimale), plafonnée à 2 parts d'équivalent poussée : elle s'applique à la part des reps
 *  qui tient dans ce plafond, sur chaque piste. */
function mixedBossXp(
  b: FriendBoss,
  m: FriendBossMember,
  hits: readonly FriendBossHit[],
  out: { muscu: number; cardio: number },
) {
  const raw = { muscu: 0, cardio: 0 };
  for (const h of hits) {
    if (h.bossId !== b.id || h.userId !== m.userId) continue;
    const ex = hitExercise(b, h);
    raw[bossXpTrack(ex.family)] += repsXpRaw(ex.family, hitQty(h), ex.repWeight);
  }
  const done = b.defeatedAt != null && metMinShare(b.family, m.units, b.tier);
  const kept = done
    ? Math.min(1, (bossShareUnits(b.family, b.tier) * FRIEND_BOSS.bonusCapShares) / m.units)
    : 0;
  for (const t of ['muscu', 'cardio'] as const)
    out[t] += Math.round(raw[t] * XP_MULT * (1 + kept * FRIEND_BOSS.bonusPct));
}

/** Libellé français d'un refus du serveur (codes levés par la migration 0067). */
export function bossErrorMessage(code: string): string {
  const table: Record<string, string> = {
    no_tokens: 'Pas assez de jetons 🎫 : ils se gagnent en faisant du sport.',
    same_exercise: 'Tu as déjà un boss en cours sur cet exercice — choisis-en un autre.',
    // Codes d'avant les jetons (migr. 0078) : un onglet resté ouvert peut encore les voir.
    busy: 'Tu as déjà un boss en cours — recharge la page.',
    cooldown: 'Tu pourras lancer un nouveau boss 48 h après la fin du dernier que tu as lancé.',
    not_friend: 'Tu ne peux inviter que tes amis.',
    too_many_invites: `Au plus ${FRIEND_BOSS.maxInvites} amis par boss.`,
    closed: 'Les invitations sont closes : le combat a commencé.',
    not_invited: 'Cette invitation n’existe plus.',
    not_member: 'Tu ne participes pas à ce boss.',
    not_active: 'Le combat n’est pas en cours.',
    capped: 'Plafond atteint : reviens plus tard pour frapper encore.',
    no_character: 'Crée d’abord ton aventurier dans l’Aventure.',
    no_altar: 'Construis l’Autel des boss dans ta base pour lancer un boss.',
    // ⚠️ `bad_exercises` AVANT `bad_exercise` : la recherche se fait par sous-chaîne, le premier gagne.
    bad_exercises: 'Un boss à choix a de 2 à 5 exercices, tous différents.',
    bad_exercise: 'Cet exercice ne peut pas servir de boss.',
    bad_tier: 'Cette difficulté n’existe pas — recharge la page.',
    not_owner: 'Seul le lanceur peut annuler ce boss.',
    not_alone: 'Un ami a rejoint ton boss : il ne peut plus être annulé.',
    defeated: 'Le boss est déjà tombé.',
    not_found: 'Ce boss n’existe plus.',
    not_defeated: 'Le boss n’est pas encore tombé.',
    nothing: 'Ton coffre a déjà été ouvert.',
    not_ended: 'Ton coffre s’ouvre quand ta part est faite, ou à la fin du combat.',
    min_share: 'Le bonus de groupe demande au moins la moitié de ta part.',
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

/** Dégâts infligés par des reps (ou des secondes de gainage). ⚠️ Un boss à plusieurs exercices
 *  compte en équivalent poussée FRACTIONNAIRE (12,75 → 12 750) : arrondi, jamais tronqué. Pour
 *  des reps entières, c'est exactement ce que c'était. */
export function bossDamage(units: number): number {
  return Math.round(Math.max(0, units) * FRIEND_BOSS.damagePerUnit);
}

/** Reps qu'il reste à faire pour abattre le boss (arrondi au-dessus, comme `fboss_hit`). */
export function bossUnitsLeft(b: Pick<FriendBoss, 'hpTotal' | 'damage'>): number {
  return Math.ceil(Math.max(0, b.hpTotal - b.damage) / FRIEND_BOSS.damagePerUnit);
}

/** 🎯 Même chose pour un boss à plusieurs exercices : l'équivalent poussée restant, au point
 *  (1/20) près — comme `fboss_hit_exo`, qui compte en points de 50 dégâts. */
export function bossUnitsLeftExact(b: Pick<FriendBoss, 'hpTotal' | 'damage'>): number {
  const pointDamage = FRIEND_BOSS.damagePerUnit / FRIEND_BOSS.mixedScale;
  return Math.ceil(Math.max(0, b.hpTotal - b.damage) / pointDamage) / FRIEND_BOSS.mixedScale;
}

// ── Scène de combat ───────────────────────────────────────────────────────────────

export const BOSS_EMOJIS = ['🐉', '👹', '🦖', '🐙', '🦂', '🧌', '🐲', '👾'] as const;

/** 🐉 Le nom à afficher : celui du boss, sinon (ligne d’avant la migr. 0108) son exercice. */
export function bossTitle(b: Pick<FriendBoss, 'name' | 'exerciseName'>): string {
  return b.name?.trim() || b.exerciseName;
}

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

/** Partage `total` en `n` impacts entiers dont la somme vaut exactement `total`. */
function splitExact(total: number, n: number): number[] {
  const per = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - per * (n - 1) : per));
}

/** 🎆 LES PALIERS D'UNE FRAPPE — plus on envoie de reps d'un coup, plus l'attaque est
 *  spectaculaire, SANS que l'animation s'allonge : au-delà de 10 reps, on ne tire plus un
 *  projectile par rep mais un nombre FIXE d'impacts (leur somme vaut toujours la frappe).
 *  `count` = nombre d'impacts, `-1` = un par rep ; `gapMs` = écart entre deux impacts. */
export type StrikeStyle = 'orb' | 'fire' | 'storm' | 'laser' | 'meteor';
export const STRIKE_TIERS: readonly {
  style: StrikeStyle;
  from: number;
  count: number;
  gapMs: number;
  name: string;
  emoji: string;
}[] = [
  { style: 'orb', from: 1, count: -1, gapMs: BOSS_SHOT_MS, name: 'Orbe', emoji: '✨' },
  { style: 'fire', from: 5, count: -1, gapMs: 260, name: 'Boules de feu', emoji: '🔥' },
  { style: 'storm', from: 10, count: 5, gapMs: 360, name: "Tempête d'éclairs", emoji: '⚡' },
  { style: 'laser', from: 20, count: 10, gapMs: 210, name: 'Rayon dévastateur', emoji: '🔆' },
  { style: 'meteor', from: 40, count: 1, gapMs: 0, name: 'Météore', emoji: '☄️' },
];

/** Secondes de gainage qui valent une rep pour choisir le palier (le barème des challenges). */
const STRIKE_SEC_PER_REP = 4;

/** Reps « équivalentes » d'une frappe : un boss de gainage se compte en secondes. */
export function strikeReps(damage: number, family?: BossFamily | null): number {
  const units = Math.max(0, Math.round(damage / FRIEND_BOSS.damagePerUnit));
  return family === 'core' ? Math.round(units / STRIKE_SEC_PER_REP) : units;
}

export interface StrikePlan {
  style: StrikeStyle;
  name: string;
  emoji: string;
  /** Dégâts de chaque impact, dans l'ordre ; leur somme vaut la frappe. */
  hits: number[];
  gapMs: number;
}

/** Le palier et les impacts d'une frappe. Orbes et boules de feu : un projectile par rep
 *  (« boules = reps »), donc au plus 9 ; au-delà, un nombre fixe d'impacts. */
export function strikePlan(damage: number, family?: BossFamily | null): StrikePlan {
  const reps = strikeReps(damage, family);
  const tier = [...STRIKE_TIERS].reverse().find((t) => reps >= t.from) ?? STRIKE_TIERS[0]!;
  const total = Math.max(0, Math.round(damage));
  const hits = splitExact(total, tier.count < 0 ? Math.max(1, reps) : tier.count);
  return { style: tier.style, name: tier.name, emoji: tier.emoji, hits, gapMs: tier.gapMs };
}

/** Les cris du boss, du plus léger au dernier souffle. Une frappe = UN cri. */
export const BOSS_CRIES = {
  light: [
    'Aïe !',
    'Grrr…',
    'Ouch !',
    'Hmpf !',
    'Ça pique…',
    'Argh !',
    'Hé !',
    'Grmbl…',
    'Même pas mal !',
    'Tss…',
    'Encore ?!',
    'Rhaaa…',
  ],
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

/** Nombre de cris récents qu'une frappe évite de répéter (une série de reps = une frappe). */
export const BOSS_CRY_MEMORY = 4;

/** Le cri d'une frappe : un dernier souffle si elle l'abat, un grand cri si elle retire au
 *  moins `BOSS_HEAVY_SHARE` de ses PV, sinon un petit — tiré au hasard (`rng` ∈ [0, 1)).
 *  `recent` = les derniers cris affichés (le plus récent en dernier) : on en évite les
 *  `BOSS_CRY_MEMORY` derniers, au moins le précédent quand le registre est trop court. */
export function bossCry(
  damage: number,
  hpBefore: number,
  hpTotal: number,
  rng: number,
  recent?: string | readonly string[] | null,
): string {
  const pool =
    damage >= hpBefore && hpBefore > 0
      ? BOSS_CRIES.death
      : damage >= hpTotal * BOSS_HEAVY_SHARE
        ? BOSS_CRIES.heavy
        : BOSS_CRIES.light;
  const past = recent == null ? [] : typeof recent === 'string' ? [recent] : recent;
  const avoid = past.slice(-Math.min(BOSS_CRY_MEMORY, pool.length - 1));
  const choices = avoid.length ? pool.filter((c) => !avoid.includes(c)) : pool;
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
    .map((h) => ({ id: h.id, userId: h.userId, damage: bossDamage(hitDamageUnits(h)) }))
    // Une frappe tout en surplus n'entame rien : pas de projectile à rejouer.
    .filter((s) => s.damage > 0);
  const hpLeft = Math.max(0, b.hpTotal - b.damage);
  const replayed = fresh.reduce((a, s) => a + s.damage, 0);
  return { strikes: fresh, startHp: Math.min(b.hpTotal, hpLeft + replayed) };
}

/** PV lisibles : « 120 000 ». */
export function fmtBossPv(n: number): string {
  // Espace INSÉCABLE (U+00A0) quelle que soit la version d'ICU : « 21 000 » ne se coupe jamais.
  return Math.max(0, Math.round(n))
    .toLocaleString('fr-FR')
    .replace(/[\s\u202f]/g, '\u00a0');
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

/** Coût d'un cran — payé par le LANCEUR seul (rejoindre est gratuit, v0.1067). */
export function bossTokenCost(tier: string | null | undefined): number {
  return bossTier(tier).tokens;
}

type BossTimes = Pick<FriendBoss, 'createdAt' | 'startAt' | 'defeatedAt'>;
type MyBoss = Pick<FriendBoss, 'exerciseId' | 'createdAt' | 'startAt' | 'defeatedAt'> &
  Partial<Pick<FriendBoss, 'exercises'>>;

/** Exercice(s) du boss qu'on veut lancer ou rejoindre : `exerciseIds` (boss à choix) ou
 *  `exerciseId` (un seul exo, comme avant). */
type WantedExercises = { exerciseId: string } | { exerciseIds: readonly string[] };
const wantedIds = (o: WantedExercises): readonly string[] =>
  'exerciseIds' in o ? o.exerciseIds : [o.exerciseId];

/** 🎯 Un boss EN COURS occupe TOUS ses exercices : tout chevauchement avec ceux qu'on veut
 *  engager le bloque (même règle que `fboss_ids_busy`, migr. 0118). Boss d'un exo : inchangé. */
const sameExerciseBusy = (mine: readonly MyBoss[], ids: readonly string[], now: number) =>
  mine.some((b) => bossInProgress(b, now) && bossExerciseIds(b).some((id) => ids.includes(id)));

/** Pourquoi on ne peut pas REJOINDRE ce boss (null = on peut). Même règle que
 *  `fboss_respond` : gratuit, mais un seul boss en cours par exercice (sinon une même série
 *  frapperait deux boss). */
export function bossJoinBlocker(
  opts: { mine: readonly MyBoss[] } & WantedExercises,
  now: number,
): 'same_exercise' | null {
  return sameExerciseBusy(opts.mine, wantedIds(opts), now) ? 'same_exercise' : null;
}

/** Instant où le LANCEUR pourra déclarer à nouveau (null = tout de suite) : 48 h après la
 *  fin du dernier boss qu'il a lancé. Un boss lancé encore en cours rend un instant futur. */
export function nextDeclareAt(owned: readonly BossTimes[]): number | null {
  if (!owned.length) return null;
  return Math.max(...owned.map(bossEndedAt)) + FRIEND_BOSS.cooldownMs;
}

/** Pourquoi on ne peut pas LANCER ce boss (null = on peut). Même règle et même ordre que
 *  `fboss_declare` : un seul boss par exercice, le délai de 48 h, puis les jetons. */
export function bossLaunchBlocker(
  opts: {
    tokens: number;
    tier: string | null | undefined;
    mine: readonly MyBoss[];
    /** Les boss que j'ai lancés (pour le délai). */
    owned: readonly BossTimes[];
  } & WantedExercises,
  now: number,
): 'same_exercise' | 'cooldown' | 'no_tokens' | null {
  if (sameExerciseBusy(opts.mine, wantedIds(opts), now)) return 'same_exercise';
  const next = nextDeclareAt(opts.owned);
  if (next != null && now < next) return 'cooldown';
  if (opts.tokens < bossTokenCost(opts.tier)) return 'no_tokens';
  return null;
}

/** Pourquoi on ne peut pas ANNULER ce boss (null = on peut). Même règle que `fboss_cancel`
 *  (migr. 0114) : c'est le lanceur, le boss n'est pas fini, et aucun autre membre n'a accepté
 *  (des invitations sans réponse ou refusées ne comptent pas). */
export function bossCancelBlocker(
  b: Pick<FriendBoss, 'ownerId' | 'createdAt' | 'startAt' | 'defeatedAt'>,
  members: readonly Pick<FriendBossMember, 'userId' | 'status'>[],
  me: string | null,
  now: number,
): 'not_owner' | 'not_in_progress' | 'not_alone' | null {
  if (!me || b.ownerId !== me) return 'not_owner';
  if (!bossInProgress(b, now)) return 'not_in_progress';
  if (members.some((m) => m.userId !== me && m.status === 'accepted')) return 'not_alone';
  return null;
}

/** Jetons rendus à l'annulation : la mise, SEULEMENT si personne n'a encore frappé (sinon on
 *  garderait l'XP et récupérerait la mise), et dans la limite de la réserve. */
export function bossCancelRefund(
  tier: string | null | undefined,
  hasHits: boolean,
  tokens: number,
): number {
  if (hasHits) return 0;
  return Math.max(0, Math.min(BOSS_TOKENS.stockMax, tokens + bossTokenCost(tier)) - tokens);
}

/** Reps d'une demi-part (le minimum pour le coffre), arrondies au-dessus : c'est le plus
 *  petit entier qui passe `metMinShare` (et le `v_units < part × 0,5` de `fboss_claim`). */
export function minShareUnits(family: BossFamily, tier?: string | null): number {
  return Math.ceil(bossShareUnits(family, tier) * FRIEND_BOSS.minShare);
}

/** ⏱️ CHRONO ET BONUS DE TEMPS (v1.319.0). Les PV du boss sont calés sur des séries de 30 s :
 *  `HOLD_BONUS.baseS`. Au-delà, chaque tranche de 15 s est MAJORÉE de +0,1 de plus que la
 *  précédente (×1,1 de 30 à 45 s, ×1,2 de 45 à 60 s…), plafonnée à ×2 : seules les secondes
 *  au-delà de 30 sont majorées. */
export const HOLD_BONUS = { baseS: 30, stepS: 15, perTier: 0.1, capMult: 2 } as const;

const holdSecs = (seconds: number): number => (Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
const holdTenths = (tier: number): number =>
  Math.min(Math.round(HOLD_BONUS.capMult * 10), 10 + Math.round(HOLD_BONUS.perTier * 10) * tier);

/** Un exo chronométré ? Seul un boss de gainage ET un exo en secondes (`unit === 'time'`) ouvre
 *  le chrono et le bonus : un exo de gainage compté en reps garde la saisie manuelle. */
export function isHoldBoss(family: BossFamily, exerciseUnit?: string | null): boolean {
  return family === 'core' && exerciseUnit === 'time';
}

/** Palier de bonus atteint après `seconds` de tenue : 0 avant 30 s, puis +1 toutes les 15 s
 *  (30 s → 1 = ×1,1, 45 s → 2 = ×1,2…). Non borné : le plafond ne vaut que pour le multiplicateur. */
export function holdBonusTier(seconds: number): number {
  const s = holdSecs(seconds);
  return s < HOLD_BONUS.baseS ? 0 : Math.floor((s - HOLD_BONUS.baseS) / HOLD_BONUS.stepS) + 1;
}

/** Multiplicateur de la tranche en cours (1 avant 30 s, 2 au plafond). */
export function holdBonusMult(seconds: number): number {
  return holdTenths(holdBonusTier(seconds)) / 10;
}

/** « Secondes équivalentes » d'une tenue : les 30 premières telles quelles, puis chaque tranche
 *  de 15 s au multiplicateur de son palier (plafonné à ×2). Arrondi à l'entier : le serveur
 *  stocke des entiers (`fboss_hit(p_units integer)`). Calcul en dixièmes, sans erreur de flottant.
 *  Valeurs de contrôle : 30 → 30 · 45 → 46,5 → 47 · 60 → 64,5 → 65 · 90 → 105 · 120 → 151,5 → 152
 *  · 180 → 262,5 → 263. */
export function holdEffectiveSeconds(seconds: number): number {
  const s = holdSecs(seconds);
  if (s <= HOLD_BONUS.baseS) return Math.round(s);
  let tenths = HOLD_BONUS.baseS * 10;
  let from: number = HOLD_BONUS.baseS;
  for (let tier = 1; from < s; tier++) {
    const to = Math.min(s, from + HOLD_BONUS.stepS);
    tenths += (to - from) * holdTenths(tier);
    from = to;
  }
  return Math.round(tenths / 10);
}

/** Avancement de l'anneau du chrono (0 → 1) : 30 s pour le premier tour, puis chaque tranche de
 *  15 s qui mène au palier suivant ; `left` = secondes avant ce palier. */
export function holdRing(seconds: number): { fraction: number; left: number } {
  const s = holdSecs(seconds);
  const span = s < HOLD_BONUS.baseS ? HOLD_BONUS.baseS : HOLD_BONUS.stepS;
  const into = s < HOLD_BONUS.baseS ? s : (s - HOLD_BONUS.baseS) % HOLD_BONUS.stepS;
  return { fraction: into / span, left: span - into };
}

/** 🤝 Reps GARDÉES pour les autres : la demi-part qui manque encore à chaque ami accepté.
 *  Zéro le dernier jour (`reserveReleaseMs`). La règle exacte de `fboss_hit` (migr. 0092). */
export function bossReservedUnits(
  b: Pick<FriendBoss, 'id' | 'family' | 'tier' | 'createdAt' | 'startAt'>,
  members: readonly Pick<FriendBossMember, 'bossId' | 'userId' | 'status' | 'units'>[],
  userId: string,
  now: number,
): number {
  if (now >= bossEndsAt(b) - FRIEND_BOSS.reserveReleaseMs) return 0;
  const half = minShareUnits(b.family, b.tier);
  return members
    .filter((m) => m.bossId === b.id && m.status === 'accepted' && m.userId !== userId)
    .reduce((s, m) => s + Math.max(0, half - m.units), 0);
}

/** Ce que devient une saisie, plafonds compris : `accepted` = les reps retenues (plafond
 *  d'UNE saisie, 2,5 parts), dont `damage` entame le boss et `surplus` non — celles qui
 *  mordraient sur les parts réservées aux amis (`reserved`) ou dépasseraient la mort du boss
 *  (`unitsLeft`, cf. `bossUnitsLeft`). Le surplus paie son XP et grossit le coffre : rien
 *  n'est perdu. ⚠️ Aucun plafond sur 24 h (v0.892). La règle exacte de `fboss_hit`. */
export function splitHit(
  family: BossFamily,
  asked: number,
  unitsLeft: number,
  reserved: number,
  tier?: string | null,
): { accepted: number; damage: number; surplus: number } {
  const perHit = Math.floor(bossShareUnits(family, tier) * FRIEND_BOSS.hitMaxShare);
  const accepted = Math.max(0, Math.min(Math.floor(asked), perHit));
  const free = Math.max(0, Math.max(0, unitsLeft) - Math.max(0, reserved));
  const damage = Math.min(accepted, free);
  return { accepted, damage, surplus: accepted - damage };
}

/** 🎯 La même règle pour UN exo d'un boss à plusieurs exercices — la règle exacte de
 *  `fboss_hit_exo`. Tout se calcule en POINTS entiers (1/20 de rep de poussée) :
 *   · plafond d'une saisie : 2,5 parts en points, ramené en quantité de l'exo choisi
 *     (au cran Sérieux : pompes 150, tractions 75, jambes 200, gainage 750 s) ;
 *   · `unitsLeft` et `reserved` sont en équivalent poussée (la monnaie du boss), lus au point près ;
 *   · le reste devient du surplus, comme `splitHit`.
 *  Rend `accepted` = la quantité retenue de l'exo ; `damage`, `surplus` et `units` en équivalent
 *  poussée (points ÷ 20). */
export function splitHitMixed(
  exFamily: BossFamily,
  asked: number,
  unitsLeft: number,
  reserved: number,
  tier?: string | null,
): { accepted: number; damage: number; surplus: number; units: number } {
  const scale = FRIEND_BOSS.mixedScale;
  const w = mixedWeight(exFamily);
  const sharePts = bossShareUnits('push', tier) * scale;
  const capQty = Math.floor(Math.floor(sharePts * FRIEND_BOSS.hitMaxShare) / w);
  const accepted = Math.max(0, Math.min(Math.floor(asked), capQty));
  const pts = accepted * w;
  const freePts = Math.max(0, Math.round(unitsLeft * scale) - Math.round(reserved * scale));
  const dmgPts = Math.min(pts, freePts);
  return {
    accepted,
    damage: dmgPts / scale,
    surplus: (pts - dmgPts) / scale,
    units: pts / scale,
  };
}

/** 🎁 Parts apportées AU-DELÀ de la sienne (0 si on n'a pas dépassé sa part). */
export function surplusShares(family: BossFamily, units: number, tier?: string | null): number {
  const share = bossShareUnits(family, tier);
  return share > 0 ? Math.max(0, units - share) / share : 0;
}

/** A-t-on apporté sa part minimale ? */
export function metMinShare(family: BossFamily, units: number, tier?: string | null): boolean {
  return units >= bossShareUnits(family, tier) * FRIEND_BOSS.minShare;
}

/** XP de ses reps sur un boss — même barème que les challenges (`challenges.effortXpRaw`) :
 *  une rep × REP_XP × poids de rep, une seconde de gainage vaut ¼ de rep. */
export function bossRepsXp(family: BossFamily, units: number, repWeight: number): number {
  return Math.round(repsXpRaw(family, units, repWeight) * XP_MULT);
}

/** XP des reps AVANT multiplicateur ni arrondi : un boss à plusieurs exercices additionne celles
 *  de toutes ses frappes puis arrondit UNE fois (une seconde de gainage seule arrondirait à 0). */
const repsXpRaw = (family: BossFamily, units: number, repWeight: number): number => {
  const u = Math.max(0, units);
  return family === 'core' ? (u / 4) * REP_XP : u * REP_XP * repWeight;
};

/** Le tableau des frappes d'un boss : une ligne par participant, une colonne par JOUR DU
 *  COMBAT (J1 → J7), et dans chaque case ses reps (ou secondes) de ce jour.
 *
 *  ⚠️ LES JOURS SONT DES TRANCHES DE 24 H DEPUIS LE DÉPART DU BOSS, pas des jours du
 *  calendrier : un boss qui démarre un mardi à 15 h couvrirait sinon HUIT dates (deux
 *  bouts de journée), et « J1 » ne voudrait plus rien dire. Le combat dure 7 tranches, le
 *  tableau en a 7, toujours.
 *
 *  ⚠️ Les frappes de TOUT LE MONDE (c'est l'écran du groupe), et un participant accepté
 *  qui n'a encore rien fait a sa ligne : la voir vide, c'est l'information. Une frappe d'un
 *  non-membre (impossible côté serveur) a quand même sa ligne : le tableau ne doit rien
 *  perdre de ce qui a frappé le boss.
 *
 *  Ordre : du plus gros apport au plus petit, le pseudo départage (un ordre stable). */
export interface BossGridDay {
  /** 0 → 6. */
  index: number;
  start: number;
  state: 'past' | 'today' | 'future';
  /** Reps du groupe ce jour-là. */
  total: number;
}
export interface BossGridRow {
  userId: string;
  pseudo: string;
  /** Reps par jour, 7 cases. */
  cells: number[];
  /** Jours où une partie des reps est partie en surplus (🤝). */
  surplus: boolean[];
  total: number;
}
export function bossHitGrid(
  b: Pick<FriendBoss, 'id' | 'createdAt' | 'startAt'>,
  members: readonly Pick<FriendBossMember, 'bossId' | 'userId' | 'pseudo' | 'status'>[],
  hits: readonly FriendBossHit[],
  now: number,
): { days: BossGridDay[]; rows: BossGridRow[]; total: number } {
  const start = bossStartAt(b);
  const n = Math.round(FRIEND_BOSS.durationMs / DAY);
  const days: BossGridDay[] = Array.from({ length: n }, (_, i) => {
    const s = start + i * DAY;
    return {
      index: i,
      start: s,
      state: now >= s + DAY ? 'past' : now >= s ? 'today' : 'future',
      total: 0,
    };
  });
  const rows = new Map<string, BossGridRow>();
  const rowOf = (userId: string, pseudo: string) => {
    let r = rows.get(userId);
    if (!r) {
      r = { userId, pseudo, cells: Array(n).fill(0), surplus: Array(n).fill(false), total: 0 };
      rows.set(userId, r);
    }
    return r;
  };
  for (const m of members)
    if (m.bossId === b.id && m.status === 'accepted') rowOf(m.userId, m.pseudo);
  for (const h of hits) {
    if (h.bossId !== b.id || h.units <= 0) continue;
    // Bornée aux 7 tranches : une frappe pile à la fin compte au dernier jour.
    const i = Math.min(n - 1, Math.max(0, Math.floor((h.createdAt - start) / DAY)));
    const r = rowOf(h.userId, members.find((m) => m.userId === h.userId)?.pseudo ?? 'Un ami');
    r.cells[i]! += h.units;
    r.total += h.units;
    if ((h.surplus ?? 0) > 0) r.surplus[i] = true;
    days[i]!.total += h.units;
  }
  const list = [...rows.values()].sort(
    (x, y) => y.total - x.total || x.pseudo.localeCompare(y.pseudo, 'fr'),
  );
  return { days, rows: list, total: list.reduce((t, r) => t + r.total, 0) };
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
    // 🎯 Une ligne par (jour, EXERCICE de la frappe) : sur un boss à plusieurs exercices, la
    // famille, l'unité et le muscle sont ceux de l'exo CHOISI, pas ceux du boss. Boss d'un exo :
    // un seul exo, donc exactement une ligne par jour comme avant.
    const byDay = new Map<string, { ex: BossExercise; units: number[] }>();
    for (const h of hits) {
      if (h.bossId !== b.id || h.userId !== userId || h.units <= 0) continue;
      const ex = hitExercise(b, h);
      const key = `${dayKey(h.createdAt)}\u0000${ex.id}`;
      const qty = hitQty(h);
      const entry = byDay.get(key);
      if (entry) entry.units.push(qty);
      else byDay.set(key, { ex, units: [qty] });
    }
    for (const [key, { ex, units }] of byDay) {
      const total = units.reduce((a, u) => a + u, 0);
      out.push({
        bossId: b.id,
        exerciseId: ex.id,
        family: ex.family,
        day: key.slice(0, key.indexOf('\u0000')),
        title: ex.name,
        units,
        total,
        xp: bossRepsXp(ex.family, total, ex.repWeight),
        unit: bossUnitLabel(ex.family),
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

/** ⚠️ Les tables de stats du trophée par famille d'exercice (`TROPHY_MAINS`,
 *  `TROPHY_SUPPORT`, `TROPHY_FAMILY_K`) sont RETIRÉES : un trophée ne porte plus de stats
 *  mais un POUVOIR à quête, tiré au hasard parmi les huit (décidé — aucun lien entre l'exo
 *  et le pouvoir). Cf. `TROPHY_POWERS` dans items.ts.
 */

// 🎁 DEUX RÉCOMPENSES SÉPARÉES (v1.200.0 ; conçu avec l'utilisateur : « que celui qui fait son
// quota ne soit pas pénalisé si ses potes lâchent l'affaire »).
//  1. Le COFFRE PERSO suit TES reps, que le boss tombe ou non (`personalShare`) :
//       moins de la demi-part → lot de consolation (0 à 25 %, or et pierres seulement) ;
//       la demi-part → 50 %, et la moitié des tickets ; ta part entière → 100 %, tous les
//       tickets ET le trophée. Il s'ouvre dès que ta part est faite (sans attendre la fin),
//       sinon à la fin du combat (mort ou 7 jours) avec ce que tu as fait.
//  2. Le BONUS DE GROUPE tombe si le boss meurt, pour chacun de ceux qui ont fait au moins
//     leur demi-part : or et pierres en plus, le « tué tôt », et l'ENTRAIDE — les reps faites
//     au-delà de ta part qui ont vraiment entamé le boss, donc couvert un ami.
// ⚠️ PAS DE COMBINE PAR LE CRAN : le coffre perso suit tes reps, pas le cran choisi. Lancer un
// Inhumain sans le finir ne paie que les pompes faites.

export const FRIEND_BOSS_CHEST = {
  /** Or et pierres d'un coffre COMPLET, en boss de palier du niveau du joueur. */
  bosses: 2,
  /** Lot de consolation : jusqu'à cette part du coffre, juste sous la demi-part. */
  consolationMax: 0.25,
  /** Bonus de groupe (boss abattu) : cette part d'un coffre complet… */
  groupBase: 0.25,
  /** … plus la part du combat restante × ce facteur (« tué tôt »). */
  earlyMult: 0.5,
  /** 🤝 Entraide : chaque part faite au-delà de la sienne et qui a entamé le boss ajoute
   *  cette part d'un coffre, plafonnée — jamais rien pris aux autres. */
  helpPerShare: 0.15,
  helpMax: 0.3,
} as const;

/** Où en est un joueur par rapport à sa part (0..1+). */
const partFraction = (family: BossFamily, units: number, tier?: string | null): number => {
  const share = bossShareUnits(family, tier);
  return share > 0 ? Math.max(0, units) / share : 0;
};

/** 🎁 Part du coffre perso que vaut ce que TU as fait : 0 → 25 % juste sous la demi-part
 *  (consolation), 50 % à la demi-part, puis proportionnel jusqu'à 100 % à ta part entière. */
export function personalShare(family: BossFamily, units: number, tier?: string | null): number {
  const f = partFraction(family, units, tier);
  const half = FRIEND_BOSS.minShare;
  if (f <= 0) return 0;
  if (f < half) return (FRIEND_BOSS_CHEST.consolationMax * f) / half;
  return Math.min(1, f);
}

/** Tickets du coffre perso : tous à ta part entière, la moitié (arrondie en dessous) à la
 *  demi-part, aucun en dessous — ils paient une étape de sport franchie. */
export function personalTickets(family: BossFamily, units: number, tier?: string | null): number {
  const f = partFraction(family, units, tier);
  const t = bossTier(tier).tickets;
  if (f >= 1) return t;
  if (f >= FRIEND_BOSS.minShare) return Math.floor(t / 2);
  return 0;
}

/** Le coffre perso peut-il s'ouvrir ? Dès que ta part est faite ; sinon à la fin du combat,
 *  avec ce que tu as fait (au moins une rep). La règle exacte de `fboss_claim` (migr. 0103). */
export function personalChestReady(
  b: Pick<FriendBoss, 'family' | 'tier' | 'createdAt' | 'startAt' | 'defeatedAt'>,
  units: number,
  now: number,
): boolean {
  if (units <= 0) return false;
  if (partFraction(b.family, units, b.tier) >= 1) return true;
  return b.defeatedAt != null || now >= bossEndsAt(b);
}

/** Or et pierres d'un coffre COMPLET de ce boss au niveau du joueur, avant toute part. */
function fullChestValue(tier: string | null | undefined, level: number) {
  // ⚠️ SUPER-LINÉAIRE en difficulté (`rewardExp` 1,2) : c'est ce qui rend un boss dur plus
  // payant qu'une enfilade de faciles — mesuré, l'or PAR REP monte de 38 % au cran le plus
  // dur. Proportionnel (exposant 1), « de plus en plus intéressante » ne voudrait rien dire.
  const mult = FRIEND_BOSS_CHEST.bosses * bossTier(tier).mult ** FRIEND_BOSS.rewardExp;
  return { gold: bossGoldForLevel(level) * mult, stones: bossSummonCost(level) * mult };
}

export interface FriendBossChest {
  gold: number;
  stones: number;
  /** Part du coffre complet que vaut ce qu'il a fait (cf. `personalShare`). */
  share: number;
  /** 🎟️ Tickets (cf. `personalTickets`). */
  tickets: number;
  /** Niveau auquel le coffre a été tiré (le trophée peut manquer). */
  level: number;
  /** Le trophée — seulement si la part entière est faite. */
  trophy: Omit<Item, 'id'> | null;
}

/**
 * COFFRE PERSO d'un joueur. Tiré côté client (le serveur ne connaît pas le jeu), avec une
 * graine FIXE boss + joueur : rouvrir la page, ou le récupérer après un échec, rend
 * exactement le même coffre. Le serveur, lui, garantit qu'il est dû et pris une fois.
 * ⚠️ DÉTERMINISTE même ouvert en cours de combat : au-delà de ta part il plafonne à 100 %, et
 * en dessous il ne s'ouvre qu'une fois le combat fini (reps figées). Le trophée ne dépend donc
 * que du cran (pas du « tué tôt », qui va au bonus de groupe).
 */
export function friendBossChest(
  b: Pick<FriendBoss, 'id' | 'family' | 'exerciseName' | 'tier'>,
  userId: string,
  playerLevel: number,
  /** ⚠️ REQUIS : SES reps sur ce boss (`FriendBossMember.units`). */
  units: number,
): FriendBossChest {
  const level = Math.max(1, Math.floor(playerLevel));
  const tier = bossTier(b.tier);
  const share = personalShare(b.family, units, b.tier);
  const full = fullChestValue(b.tier, level);
  const rng = mulberry32(seedOf(`${b.id}:${userId}`));
  return {
    gold: Math.round((full.gold * share) / 10) * 10,
    stones: Math.round(full.stones * share),
    share,
    tickets: personalTickets(b.family, units, b.tier),
    level,
    trophy:
      partFraction(b.family, units, b.tier) >= 1
        ? rollTrophy(rng, { title: b.exerciseName, level, luck: tier.luck })
        : null,
  };
}

export interface FriendBossBonus {
  gold: number;
  stones: number;
  /** Part du combat restante à la mort (0..1) : ce qu'a rapporté le fait de le tuer tôt. */
  early: number;
  /** 🤝 Parts faites au-delà de la sienne qui ont entamé le boss (0..). */
  help: number;
}

/** 🤝 Parts faites au-delà de la sienne qui ont VRAIMENT entamé le boss (`dealt` = reps qui
 *  ont fait des dégâts, surplus exclu) : elles ont forcément couvert un ami, puisque les PV
 *  valent la somme des parts. */
export function helpShares(family: BossFamily, dealt: number, tier?: string | null): number {
  const share = bossShareUnits(family, tier);
  return share > 0 ? Math.max(0, dealt - share) / share : 0;
}

/** BONUS DE GROUPE d'un joueur (boss abattu). Aucun tirage : or et pierres seulement. */
export function friendBossBonus(
  b: Pick<FriendBoss, 'family' | 'tier' | 'createdAt' | 'startAt' | 'defeatedAt'>,
  playerLevel: number,
  /** Ses reps qui ont fait des dégâts (`hitDamageUnits` sommé) — figées à la mort. */
  dealt: number,
): FriendBossBonus {
  const level = Math.max(1, Math.floor(playerLevel));
  const early = earlyKillFraction(b);
  const help = helpShares(b.family, dealt, b.tier);
  const part =
    FRIEND_BOSS_CHEST.groupBase +
    early * FRIEND_BOSS_CHEST.earlyMult +
    Math.min(FRIEND_BOSS_CHEST.helpMax, help * FRIEND_BOSS_CHEST.helpPerShare);
  const full = fullChestValue(b.tier, level);
  return {
    gold: Math.round((full.gold * part) / 10) * 10,
    stones: Math.round(full.stones * part),
    early,
    help,
  };
}

/** Marque posée sur le personnage quand le coffre perso est versé (dans `cleared_dungeons`,
 *  comme les paliers du Labyrinthe) : le serveur dit « pris », cette marque dit « crédité ». */
export const chestMark = (bossId: string) => `fboss:${bossId}`;
/** Même chose pour le bonus de groupe. */
export const bonusMark = (bossId: string) => `fbossb:${bossId}`;

type ChestState = 'none' | 'open' | 'recover';

/** État du coffre perso : rien à faire, à ouvrir (appel serveur), ou à récupérer (le serveur
 *  l'a donné mais le crédit n'a pas eu lieu — réseau coupé entre les deux). */
export function chestState(
  b: Pick<FriendBoss, 'id' | 'family' | 'tier' | 'createdAt' | 'startAt' | 'defeatedAt'>,
  m: Pick<FriendBossMember, 'status' | 'units' | 'claimed'> | null | undefined,
  credited: readonly string[],
  now: number,
): ChestState {
  if (!m || m.status !== 'accepted' || credited.includes(chestMark(b.id))) return 'none';
  if (m.claimed) return 'recover';
  return personalChestReady(b, m.units, now) ? 'open' : 'none';
}

/** État du bonus de groupe : boss abattu ET demi-part faite. */
export function bonusState(
  b: Pick<FriendBoss, 'id' | 'family' | 'tier' | 'defeatedAt'>,
  m: Pick<FriendBossMember, 'status' | 'units' | 'bonusClaimed' | 'legacyChest'> | null | undefined,
  credited: readonly string[],
): ChestState {
  // ⚠️ Un coffre d'AVANT la séparation comprenait déjà la victoire : pas de bonus en plus.
  if (b.defeatedAt == null || !m || m.status !== 'accepted' || m.legacyChest) return 'none';
  if (!metMinShare(b.family, m.units, b.tier) || credited.includes(bonusMark(b.id))) return 'none';
  return m.bonusClaimed ? 'recover' : 'open';
}
