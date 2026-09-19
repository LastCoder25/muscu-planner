// combo.ts — logique pure du Défi 360 (défi combiné hebdo full-body). Pur/testable.
// Modèle SÉRIES : l'objectif d'un exo = un nombre de SÉRIES/semaine (repère
// hypertrophie), chaque série enregistrée porte ses reps + son poids. XP façon
// séance : Σ reps×REP_XP×poids-de-rep + tonnage/500 + prime de bouclage.
import { REP_XP, assistMult, XP_MULT, MUSCU_MIN_XP } from './athlete';
// ⚠️ La règle d'arrêt est COMMUNE aux deux familles de défis : un 360 n'est qu'un défi
// d'une autre forme, et l'utilisateur attend le même comportement (« on garde les séries
// faites s'il a été commencé, comme pour les challenges »).
import { stopPlan, type StopPlan } from './challenges';
import { daysBetweenIso } from './loginStreak';
import type { Level, Objective, SportPractice } from './types';
import type { ComboChestRecord } from './comboChest';
import {
  repRangeFor,
  repRangeForExercise,
  prescribedReps,
  TIME_RANGE,
  type RepRange,
} from './repScheme';

export interface ComboSet {
  date: string; // YYYY-MM-DD
  reps: number;
  weight?: number | null; // charge de la série (kg) — poids du corps = vide
  assisted?: boolean; // exo poids du corps fait assisté (élastique/machine) → XP ×0,6
}
// Ancien format (reps cumulées/jour) — lu pour migration des défis existants.
interface ComboLegEntry {
  date: string;
  reps: number;
}
// Mode de comptage d'un exo : par SÉRIES (target = nb de séries/sem, défaut), par
// REPS (target = total de reps/sem) ou par DURÉE (target = total de SECONDES/sem — gainage :
// les secondes sont stockées dans le champ `reps` de chaque série, comme les défis solo).
export type ComboCountMode = 'sets' | 'reps' | 'time';

export interface ComboLeg {
  slot: string;
  exercise_id: string;
  exercise_name: string;
  muscle_primary?: string | null;
  rep_weight: number; // poids de rep de l'exo (pour l'XP)
  target: number; // objectif : SÉRIES (mode 'sets') OU total REPS (mode 'reps') sur la sem
  count_mode?: ComboCountMode; // défaut 'sets' (rétro-compat)
  weight_kg?: number | null; // dernier poids utilisé → préremplissage de la prochaine série
  // Fourchette de reps CONSEILLÉE pour cet exo, FIGÉE à la création depuis l’objectif
  // d’entraînement (force / hypertrophie / endurance…) et corrigée par la nature de
  // l’exo (gainage → secondes, isolation → plancher relevé). Figée, et non relue du
  // profil à l’affichage : un 360 est le contrat de la semaine, il ne doit pas changer
  // sous les pieds du joueur qui édite son objectif en cours de route. Absente des 360
  // créés avant — cf. le repli de legRepRange.
  rep_min?: number;
  rep_max?: number;
  assistable?: boolean; // exo au poids du corps → propose l'option « assisté »
  sets?: ComboSet[]; // séries réalisées (modèle courant)
  progress?: ComboLegEntry[]; // legacy (migration)
}
export interface ComboChallenge {
  id: string;
  name: string;
  start_date: string;
  duration_days: number;
  status: 'active' | 'done' | 'abandoned';
  legs: ComboLeg[];
  /** Contenu du coffre de fin, conservé au bouclage (migr. 0064). */
  chest?: ComboChestRecord | null;
}

// Reps supposées par série pour l'estimation du volume planifié (prime de bouclage).
export const COMBO_PLAN_REPS = 10;

/** Retire UNE série précise (celle qu'on a touchée), pas forcément la dernière.
 *  Rend une NOUVELLE liste ; un index hors limites (négatif, trop grand, décimal) ne
 *  retire rien, par construction du filtre — un double tap sur une case qui vient de
 *  disparaître ne doit pas emporter la voisine. */
export function removeSetAt(sets: readonly ComboSet[], index: number): ComboSet[] {
  return sets.filter((_, i) => i !== index);
}
/** Corrige UNE série (la case touchée) : reps, charge et assistance changent, le JOUR reste
 *  celui où elle a été faite — c’est lui qui décide si elle compte dans les temps. Un index
 *  hors limites ne change rien. */
export function updateSetAt(
  sets: readonly ComboSet[],
  index: number,
  patch: { reps: number; weight: number | null; assisted: boolean },
): ComboSet[] {
  return sets.map((s, i) =>
    i === index
      ? { ...s, reps: patch.reps, weight: patch.weight ?? null, assisted: patch.assisted }
      : s,
  );
}

/** Séries réalisées (avec repli : convertit l'ancien `progress` en séries). */
export function legSets(leg: ComboLeg): ComboSet[] {
  if (leg.sets) return leg.sets;
  if (leg.progress)
    return leg.progress.map((p) => ({ date: p.date, reps: p.reps, weight: leg.weight_kg ?? null }));
  return [];
}
/** Nombre de séries faites. */
export function legSetsDone(leg: ComboLeg): number {
  return legSets(leg).length;
}
/**
 * 🛑 ARRÊTER UN DÉFI 360 : ce que ça doit faire, et comment le dire.
 *
 * ⚠️ DEUX ISSUES, ET LA DIFFÉRENCE COMPTE. Des séries déjà faites ont alimenté l’XP et
 * l’énergie : on ne peut pas les effacer sans retirer au joueur un effort réel, donc le
 * défi passe en **abandonné** et son travail reste compté. Un 360 VIERGE, lui, n’a rien
 * produit — le supprimer ne coûte rien à personne, et le laisser traîner en « abandonné »
 * salit un historique qu’on relit.
 *
 * ⚠️ C’EST EXACTEMENT LE CAS SIGNALÉ : un 360 créé par erreur (pour montrer à quoi ça
 * ressemble) doit **disparaître**, pas s’installer dans les archives.
 *
 * ⚠️ UNE SEULE DÉFINITION, LIBELLÉS COMPRIS. La règle vivait déjà dans l’écran de détail,
 * et elle y était CONTREDITE par le bouton voisin : le 🗑 supprimait un 360 vierge tandis
 * que « Abandonner », juste en dessous, l’archivait toujours. Deux contrôles pour une
 * action, deux résultats — et l’écran où l’on consulte réellement son défi (l’onglet
 * 🎯 Défi 360) n’en proposait aucun.
 */
export function comboStopPlan(c: ComboChallenge): StopPlan {
  // ⚠️ `legSetsDone` et non `legDone` : il compte les ENTRÉES, donc il voit la progression
  // dans les deux modes (séries ET reps, `legSets` repliant l’ancien `progress`). Avec
  // `legDone`, un exo en mode reps dont toutes les entrées valent 0 passerait pour vierge.
  return stopPlan(
    (c.legs ?? []).some((l) => legSetsDone(l) > 0),
    'ce Défi 360',
  );
}

/** Reps totales réalisées (pour l'XP / la séance générée). */
export function legReps(leg: ComboLeg): number {
  return legSets(leg).reduce((a, s) => a + (s.reps || 0), 0);
}
/** Mode de comptage de l'exo (défaut 'sets' pour les défis existants). */
export function legMode(leg: ComboLeg): ComboCountMode {
  return leg.count_mode ?? 'sets';
}

/** 🔤 L'ORDRE D'AFFICHAGE DES EXOS D'UN DÉFI 360 : ALPHABÉTIQUE (demandé par l'utilisateur).
 *
 *  ⚠️ CE QU'IL REMPLACE, ET POURQUOI C'EST MIEUX : chaque écran triait « les plus proches
 *  de la complétude en haut, les terminés en bas » — donc **la liste se réordonnait pendant
 *  qu'on saisissait ses séries**, et on perdait sa place au milieu d'une séance. Un ordre
 *  alphabétique est STABLE : l'exo qu'on cherche est toujours au même endroit.
 *
 *  ⚠️ ET LES DEUX ÉCRANS TRIAIENT DIFFÉREMMENT (la fiche par fraction faite, l'onglet 🎯 par
 *  restant) : le même défi ne listait pas ses exos dans le même ordre à deux endroits.
 *
 *  ⚠️ NE RÉORDONNE JAMAIS `legs` — la copie est délibérée. La séance générée indexe les
 *  emplacements (`buildComboSessionFromCounts` reçoit un `counts` par exo, le runner
 *  numérote les séries) : trier la source déplacerait ce que le joueur a coché.
 *
 *  `localeCompare` en français : les accents se rangent comme on les lit, et `numeric`
 *  met « Pompes 2 » après « Pompes » plutôt qu'après « Pompes 10 ». */
export function legsByName<T extends { exercise_name: string }>(legs: readonly T[]): T[] {
  return [...legs].sort((a, b) =>
    a.exercise_name.localeCompare(b.exercise_name, 'fr', { numeric: true, sensitivity: 'base' }),
  );
}

/** 📑 L'ORDRE D'UN 360 EN COURS : les exos FINIS passent en bas (demandé par l'utilisateur).
 *
 *  ⚠️ « FINI » = LE PALIER MAXIMAL, jamais l'objectif. La zone bonus jusqu'à 120 % est rendue
 *  visible exprès (cases pointillées, marge hachurée — v0.646/0.647) et une série en plus y
 *  vaut autant qu'une série normale : reléguer à 100 % éteindrait précisément les séries qu'on
 *  veut encore voir faire. D'où `legAllDone`, et pas `legComplete`.
 *
 *  ⚠️ ELLE APPELLE `legsByName` : l'alphabet reste la SEULE règle de tri, appliquée au sein de
 *  chaque groupe. En réécrire une seconde ici ferait deux ordres pour la même liste — le défaut
 *  que la v0.903 venait de fermer.
 *
 *  ⚠️ Ça réordonne une liste rendue stable POUR sa stabilité (v0.903), et c'est acceptable
 *  parce qu'un exo ne bouge QU'UNE FOIS, au franchissement du maximal — pas à chaque série. */
export function legsDoneLast(legs: readonly ComboLeg[]): ComboLeg[] {
  const byName = legsByName(legs);
  return [...byName.filter((l) => !legAllDone(l)), ...byName.filter(legAllDone)];
}
/** Libellé de l'unité de l'objectif (séries / reps / sec) selon le mode.
 *
 *  ⚠️ NE PAS l'unifier avec `challengeValueUnit` (petits défis), malgré la ressemblance :
 *  ici « time » veut TOUJOURS dire des SECONDES au chrono, parce qu'un exo de SORTIE
 *  (marche/course/vélo) ne peut pas être un emplacement du 360 — les slots se mappent sur
 *  `muscle_primary`, et « cardio » n'en est pas un. Le mode vient du LEG, pas de l'unité
 *  de l'exercice : les deux fonctions ne répondent pas à la même question. */
export function legUnitLabel(leg: ComboLeg): string {
  const m = legMode(leg);
  return m === 'reps' ? 'reps' : m === 'time' ? 'sec' : 'séries';
}
/** Avancement réalisé dans l'UNITÉ de l'objectif (séries faites, reps OU secondes cumulées).
 *  reps ET time somment le champ `reps` des séries (= reps, ou secondes en mode durée). */
export function legDone(leg: ComboLeg): number {
  return legMode(leg) === 'sets' ? legSetsDone(leg) : legReps(leg);
}
/** Restant avant l'objectif, dans l'unité du mode (séries ou reps). */
export function legRemaining(leg: ComboLeg): number {
  return Math.max(0, leg.target - legDone(leg));
}
export function legComplete(leg: ComboLeg): boolean {
  return leg.target > 0 && legDone(leg) >= leg.target;
}
/** Poids de préremplissage : dernier poids saisi (sinon poids de l'exo). */
export function legLastWeight(leg: ComboLeg): number | null {
  const s = legSets(leg);
  return s.length ? (s[s.length - 1]!.weight ?? null) : (leg.weight_kg ?? null);
}
/** Reps de préremplissage : reps de la dernière série (sinon défaut). */
export function legLastReps(leg: ComboLeg, fallback = COMBO_PLAN_REPS): number {
  const s = legSets(leg);
  return s.length ? s[s.length - 1]!.reps : fallback;
}
/** État « assisté » de préremplissage : celui de la dernière série. */
export function legLastAssisted(leg: ComboLeg): boolean {
  const s = legSets(leg);
  return s.length ? !!s[s.length - 1]!.assisted : false;
}

/** Fourchette de reps conseillée d’un exo. Repli pour les 360 créés avant qu’elle
 *  existe : on recalcule depuis l’objectif passé en second (sinon le défaut du schéma).
 *  Ne renvoie JAMAIS null → aucun écran n’a de cas particulier à gérer. */
export function legRepRange(leg: ComboLeg, objective?: Objective | null): RepRange {
  const time = legMode(leg) === 'time';
  if (leg.rep_min != null && leg.rep_max != null)
    return {
      min: leg.rep_min,
      max: leg.rep_max,
      rest: (time ? TIME_RANGE : repRangeFor(objective)).rest,
    };
  return repRangeForExercise(objective, { time, muscle_primary: leg.muscle_primary });
}

/** Avancement global = MOYENNE des fractions de complétion par exo (mode-neutre :
 *  chaque exo compte pour 1, quel que soit son unité séries/reps → on peut mélanger).
 *  Au DIXIÈME près (demandé : le % exact). ⚠️ L’arrondi ne ment jamais aux bornes : un
 *  défi incomplet ne s’affiche pas 100 %, un défi entamé ne s’affiche pas 0 %. */
export function comboProgressPct(c: ComboChallenge): number {
  if (!c.legs.length) return 0;
  const frac = c.legs.reduce((a, l) => {
    if (l.target <= 0) return a;
    return a + Math.min(1, legDone(l) / l.target);
  }, 0);
  const exact = (frac / c.legs.length) * 100;
  const pct = Math.round(exact * 10) / 10;
  if (pct >= 100 && exact < 100) return 99.9;
  if (pct <= 0 && exact > 0) return 0.1;
  return pct;
}
/** Un pourcentage à la française, décimale seulement si besoin : 75 → « 75 », 66,7 → « 66,7 ». */
export function fmtPct(pct: number): string {
  return (Math.round(pct * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
export function comboComplete(c: ComboChallenge): boolean {
  return c.legs.length > 0 && c.legs.every((l) => legComplete(l));
}

// ── 📅 LE DÉLAI ET LA FERMETURE (v0.825 ; décisions de l'utilisateur) ─────────────────
// ⚠️ UN 360 NE SE FERME PLUS À L'OBJECTIF. Il passait en « terminé » dès les séries de base,
// ce qui retirait le défi de l'onglet 🎯 et interdisait les séries bonus (jusqu'à 120 %) —
// précisément la zone que les paliers récompensent. Il se ferme désormais à la DATE DE FIN,
// ou plus tôt quand tous les exos ont atteint le maximal (il n'y a alors plus rien à gagner).
//
// ⚠️ LA SAISIE RESTE OUVERTE APRÈS LA FIN, mais seules les séries FAITES DANS LES TEMPS
// comptent pour la prime et le coffre (choix de l'utilisateur, plutôt que figer la saisie).
// Sans ce filtre, un 360 bouclé en retard était payé comme à l'heure.

/** Dernier jour du défi (inclus), en UTC explicite. */
export function comboEndDate(c: ComboChallenge): string {
  return addDaysUtc(c.start_date, Math.max(1, c.duration_days) - 1);
}
/** Le défi tel qu'il était à sa date de fin : seules les séries faites dans les temps. */
export function comboInDeadline(c: ComboChallenge): ComboChallenge {
  return c.duration_days > 0 ? comboUpTo(c, comboEndDate(c)) : c;
}
/** Objectif atteint partout DANS LES TEMPS — le vrai « bouclé ». */
export function comboCompleteInTime(c: ComboChallenge): boolean {
  return comboComplete(comboInDeadline(c));
}
/** Le défi est-il FERMÉ : date de fin passée, ou tous les exos au maximal dans les temps ? */
export function comboClosed(c: ComboChallenge, today: string): boolean {
  if (c.duration_days > 0 && today > comboEndDate(c)) return true;
  const d = comboInDeadline(c);
  return d.legs.length > 0 && d.legs.every((l) => legTier(l) === 'max');
}
/** Statut qu'un 360 doit porter après une saisie (ou au chargement). Un abandon est définitif. */
export function comboNextStatus(c: ComboChallenge, today: string): ComboChallenge['status'] {
  if (c.status === 'abandoned') return 'abandoned';
  return comboClosed(c, today) ? 'done' : 'active';
}
/** 🎯 LE DÉFI 360 EN COURS d'un joueur — SOURCE UNIQUE (v0.905). La règle vivait en TROIS
 *  exemplaires : le store, l'onglet 🎯 et l'écran d'avancement d'un ami.
 *
 *  ⚠️ `list` doit être triée du PLUS RÉCENT au plus ancien (`created_at desc`, ce que font
 *  les requêtes) : on rend le plus récent encore en cours. C'est ce que le propriétaire voit
 *  sur son propre écran, et un écran qui regarde son voisin doit montrer la même chose.
 *
 *  ⚠️ ON RECALCULE LE STATUT au lieu de lire le champ stocké. Le balayage de fermeture ne
 *  tourne QUE chez le propriétaire (`combo.fetchMine`) : le 360 d'un ami dont la période est
 *  passée reste « actif » en base tant qu'il n'a pas rouvert l'app, et il masque le nouveau.
 *  Signalé : « quand je regarde l'avancement du Défi 360 de Cypher, je ne vois pas son
 *  dernier en date mais l'ancien, déjà à 100 % » — il en avait bien DEUX en base. */
export function activeCombo<T extends ComboChallenge>(list: readonly T[], today: string): T | null {
  return list.find((c) => comboNextStatus(c, today) === 'active') ?? null;
}

/** Le coffre de fin ne récompense qu'un 360 BOUCLÉ dans les temps (choix de l'utilisateur :
 *  pas de coffre pour un 360 partiel) et jamais un abandon. */
export function comboChestEligible(c: ComboChallenge): boolean {
  return c.status !== 'abandoned' && comboCompleteInTime(c);
}

/** Fraction d'avance d'un Défi 360 terminé : jours gagnés / durée (0..~1).
 *  ⚠️ Mesurée au jour où l'objectif a été ATTEINT, pas à la dernière série : depuis que le
 *  360 reste ouvert pour les séries bonus, une série faite deux jours plus tard aurait
 *  fait fondre la prime d'avance — on aurait puni celui qui en fait plus. */
function comboEarlyFraction(c: ComboChallenge): number {
  if (!comboComplete(c) || c.duration_days <= 0) return 0;
  const dates = [...new Set(c.legs.flatMap((l) => legSets(l).map((s) => s.date)))]
    .filter(Boolean)
    .sort();
  if (!dates.length) return 0;
  const last = dates.find((d) => comboComplete(comboUpTo(c, d))) ?? dates[dates.length - 1]!;
  const daysUsed = daysBetweenIso(c.start_date, last) + 1;
  const saved = Math.max(0, c.duration_days - daysUsed);
  return saved / c.duration_days;
}

// Bonus de dépassement : l'XP des séries faites AU-DELÀ de l'objectif est
// re-bonifiée (en plus de son XP de base) → « en faire plus » est valorisé, pas
// juste compté. Pondéré par la part d'exos dépassés (`balance`) pour récompenser
// l'effort RÉPARTI sur le full-body plutôt que le bourrage d'un seul exo.
const COMBO_SURPASS_MULT = 0.5;

/** Détail du dépassement d'un Défi 360 (séries au-delà de l'objectif). */
export function comboOverachievement(c: ComboChallenge): {
  extraXp: number; // XP de base des séries en plus
  legsOver: number; // nb d'exos ayant dépassé leur objectif
  totalLegs: number;
  balance: number; // legsOver / totalLegs (0..1)
  bonusXp: number; // bonus final (déjà × XP_MULT) → affichable
} {
  let extraXp = 0;
  let legsOver = 0;
  const totalLegs = c.legs.length;
  for (const l of c.legs) {
    const sets = legSets(l);
    // « done » dans l'unité du mode : nb de séries ('sets') ou total de reps ('reps').
    const done = legDone(l);
    if (l.target > 0 && done > l.target) {
      const legRepXp = sets.reduce(
        (s, st) => s + (st.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(st.assisted),
        0,
      );
      extraXp += (legRepXp * (done - l.target)) / done; // part de l'effort au-delà de l'objectif
      legsOver++;
    }
  }
  const balance = totalLegs ? legsOver / totalLegs : 0;
  const bonusXp = Math.round(COMBO_SURPASS_MULT * extraXp * balance * XP_MULT);
  return { extraXp, legsOver, totalLegs, balance, bonusXp };
}

// ── Objectifs À PALIERS (secondaire / principal / maximal) ────────────────────
// Un exo a 3 paliers dérivés de sa cible (= le PRINCIPAL) : SECONDAIRE (plancher, une
// semaine chargée) et MAXIMAL (ambition). Chaque palier atteint débloque une part
// CUMULÉE de la prime de bouclage de cet exo → le principal en porte l'essentiel (80 %),
// le secondaire et le maximal motivent (fini le tout-ou-rien ; un exo à la traîne ne
// bloque plus les autres). Le dépassement est FUSIONNÉ dans le maximal.
const COMBO_TIER_SECONDARY = 0.8; // secondaire = 80 % de la cible
const COMBO_TIER_MAX = 1.2; // maximal = 120 % de la cible
// Parts CUMULÉES de la prime d'un exo selon le palier atteint (secondaire 15 %,
// principal +80 % → 95 %, maximal +5 % → 100 %).
// Parts CUMULÉES de la prime de bouclage d'un exo par palier. Le principal (la cible)
// porte l'essentiel ; le maximal dépasse 1 volontairement : franchir 120 % rapporte
// PLUS qu'un bouclage pile — c'est la prime de dépassement, bornée par le palier.
const COMBO_TIER_SHARE = { none: 0, secondary: 0.15, principal: 0.95, max: 1.2 } as const;
export type ComboTier = keyof typeof COMBO_TIER_SHARE;

/** Palier atteint par un exo d'après son avancement (fait / cible). */
export function legTier(l: ComboLeg): ComboTier {
  if (l.target <= 0) return 'none';
  const frac = legDone(l) / l.target;
  if (frac >= COMBO_TIER_MAX) return 'max';
  if (frac >= 1) return 'principal';
  if (frac >= COMBO_TIER_SECONDARY) return 'secondary';
  return 'none';
}
/** Part CUMULÉE de la prime de l'exo débloquée par le palier atteint (0..1). */
export function legTierShare(l: ComboLeg): number {
  return COMBO_TIER_SHARE[legTier(l)];
}

/** Tout est fait sur cet exo : il a franchi son palier MAXIMAL, il n'y a plus rien à y gagner.
 *
 *  Prédicat NOMMÉ pour que les écrans n'écrivent pas chacun `legTier(l) === 'max'` : c'est ce
 *  seuil-là qui décide du grisage ET du renvoi en bas de liste (`legsDoneLast`), et les deux
 *  doivent dire la même chose. À ne pas confondre avec `legComplete` (l'OBJECTIF, 100 %), qui
 *  laisse la zone bonus ouverte. */
export function legAllDone(l: ComboLeg): boolean {
  return legTier(l) === 'max';
}

/** Repères AFFICHÉS des trois paliers d'un exo (nombre de séries/reps à atteindre).
 *
 *  `ceil` et NON `round` : atteindre le nombre affiché doit RÉELLEMENT décrocher le
 *  palier. Avec `round`, 32 objectifs sur 40 mentaient — un objectif de 9 affichait
 *  « Sec. 7 » alors que 7/9 = 78 % < 80 %, donc la pastille restait éteinte alors que
 *  le joueur avait fait le chiffre demandé.
 *
 *  Le maximal garde en plus au moins une série de marge au-dessus de l'objectif :
 *  sinon un objectif de 1 ou 2 affichait un « Max » égal à l'objectif lui-même. */
export function legTierMarks(l: ComboLeg): { sec: number; principal: number; max: number } {
  const t = Math.max(0, l.target);
  return {
    sec: Math.max(1, Math.ceil(t * COMBO_TIER_SECONDARY)),
    principal: t,
    max: Math.max(t + 1, Math.ceil(t * COMBO_TIER_MAX)),
  };
}

/** Palier qu'une CASE de la barre de séries fait avancer (la n-ième série, n ≥ 1).
 *
 *  ⚠️ REMPLACE LES TROIS PASTILLES « Sec. / Principal / Max » (demandé par l'utilisateur,
 *  pour gagner de la place) : c'est la COULEUR des cases qui dit le palier. Il faut donc que
 *  la case colorée « secondaire » soit exactement celle qui débloque le palier secondaire —
 *  sinon la couleur mentirait comme les repères arrondis de la v0.621. D'où l'appui sur
 *  `legTierMarks`, la même source que `legTier`. `beyond` = au-delà du maximal (rien de plus). */
export type SegZone = 'secondary' | 'principal' | 'max' | 'beyond';
export function legSegZone(l: ComboLeg, n: number): SegZone {
  const m = legTierMarks(l);
  if (n > m.max) return 'beyond';
  if (n > m.principal) return 'max';
  // Sur un tout petit objectif le repère secondaire EST l'objectif : pas de zone secondaire.
  if (n > m.sec || m.sec === m.principal) return 'principal';
  return 'secondary';
}

/** Géométrie de la barre continue (modes REPS et DURÉE), rapportée au palier MAXIMAL.
 *
 *  Le mode séries montre ses cases bonus en pointillé ; la barre continue, elle, était
 *  écrêtée à 100 % → un exo de gainage ne laissait RIEN voir de la marge de dépassement,
 *  alors que le dépassement lui rapporte exactement comme aux autres modes (`legTier` et
 *  le crédit-durée sont mode-agnostiques). L'échelle va donc jusqu'au maximal (au-delà si
 *  déjà dépassé) : `fillPct` = la part faite jusqu'à l'objectif, `overPct` = la part faite
 *  au-delà, `objPct` = où se situe l'objectif sur l'échelle. */
/**
 * 📅 OÙ L’ON DEVRAIT EN ÊTRE, et ce que la barre doit en montrer.
 *
 * ⚠️ UN SEUL DRAPEAU SERVAIT À TROIS CHOSES, et il n’était juste que pour une.
 * `showOnTime` exigeait `onTimePct < 100` — écrit pour le TRAIT 🎯 (« à 100 %, il se
 * confond avec le bout de la barre »), puis réutilisé tel quel pour la ZONE ROSE et pour
 * la ligne « en retard ». Or le DERNIER JOUR l’attendu vaut exactement 100 : le rose
 * s’éteignait donc précisément le jour où tout ce qui reste EST du retard, et la ligne qui
 * l’annonce disparaissait avec lui. Signalé par l’utilisateur (« ça affiche bien en rose les
 * autres jours sauf le dernier »).
 *
 * ⚠️ DEUX ÉCRANS PEIGNAIENT LA MÊME BARRE, chacun sa copie (l’onglet 🎯 Défi 360 et
 * `ComboDetailPage`) — donc le même défaut deux fois. La règle vit ici, les écrans peignent.
 *
 * ⚠️ DATES EN UTC EXPLICITE : le projet s’est déjà fait décaler d’un jour en France par un
 * aller-retour local↔UTC (cf. `startDate.ts`).
 */
export interface ComboPace {
  /** Où l’on devrait en être (0..100). Vaut 100 le dernier jour. */
  onTimePct: number;
  /** Part réellement faite (0..100). */
  donePct: number;
  /** Le RETARD, à peindre en rose — 0 dès qu’on est dans les temps. */
  latePct: number;
  /** Le trait 🎯. ⚠️ Caché à 0 ET à 100 : il s’y confondrait avec un bord de barre. */
  showMark: boolean;
  /** La ligne « en avance / en retard ». Elle, doit rester au dernier jour. */
  showPace: boolean;
  state: 'ahead' | 'behind';
}
/** Rien à dire : pas de défi chargé. ⚠️ Dans la LIB, pas recopié par chaque écran —
 *  les deux qui peignent cette barre en avaient déjà chacun leur exemplaire. */
export const NO_PACE: ComboPace = {
  onTimePct: 0,
  donePct: 0,
  latePct: 0,
  showMark: false,
  showPace: false,
  state: 'ahead',
};

export function comboPace(c: ComboChallenge, today: string): ComboPace {
  const donePct = Math.max(0, Math.min(100, comboProgressPct(c)));
  const jours = Math.max(1, c.duration_days);
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`);
  const ecoules = today < c.start_date ? 0 : Math.round(ms / 86400000) + 1;
  const onTimePct = Math.round((Math.max(0, Math.min(jours, ecoules)) / jours) * 100);
  const latePct = Math.max(0, onTimePct - donePct);
  return {
    onTimePct,
    donePct,
    latePct,
    showMark: onTimePct > 0 && onTimePct < 100,
    // ⚠️ Pas de `< 100` ici : c’était le défaut. On se tait quand le défi n’a pas commencé,
    // et quand il est bouclé — plus rien n’est en retard, la barre est pleine.
    showPace: c.status === 'active' && onTimePct > 0 && donePct < 100,
    state: donePct >= onTimePct ? 'ahead' : 'behind',
  };
}

export function legBarGeometry(l: ComboLeg): {
  objPct: number;
  fillPct: number;
  overPct: number;
} {
  const scale = Math.max(legTierMarks(l).max, legDone(l), 1);
  const objPct = Math.min(100, (Math.max(0, l.target) / scale) * 100);
  const donePct = Math.min(100, (Math.max(0, legDone(l)) / scale) * 100);
  return { objPct, fillPct: Math.min(donePct, objPct), overPct: Math.max(0, donePct - objPct) };
}

/** Effort PLANIFIÉ d'un exo jusqu'à sa cible (base de sa part de prime) = reps réelles
 *  des séries comptées × poids-de-rep, plan figé (COMBO_PLAN_REPS) pour les séries
 *  manquantes. Correctif 135fa252 : symétrique avec les petits défis (prime ∝ effort réel). */
function legPlannedEffort(l: ComboLeg): number {
  const sets = legSets(l);
  if (legMode(l) !== 'sets') {
    // Mode REPS/DURÉE : effort = reps (ou secondes) réalisées jusqu'à l'objectif.
    const reps = legReps(l);
    return Math.min(reps, l.target > 0 ? l.target : reps) * (l.rep_weight ?? 1);
  }
  const counted = l.target > 0 ? sets.slice(0, l.target) : sets;
  const reps = counted.reduce((a, s) => a + (s.reps || COMBO_PLAN_REPS), 0);
  const missing = Math.max(0, l.target - counted.length);
  return (reps + missing * COMBO_PLAN_REPS) * (l.rep_weight ?? 1);
}

/** Prime de bouclage À PALIERS (pré-XP_MULT). Par exo : sa part de prime `0,25 ×
 *  effort planifié` × la part CUMULÉE du palier atteint (15 / 95 / 100 %). Remplace
 *  l'ancienne prime tout-ou-rien ET le bonus de dépassement (fusionné dans le maximal).
 *  Un 360 entièrement bouclé « en avance » est amplifié par (1 + fraction d'avance). */
/** Le défi est-il TERMINÉ — bouclé, ou sa période écoulée ? C'est ce moment qui déclenche
 *  le versement de la prime, et lui seul. `today` est passé pour rester pur (le projet
 *  s'est déjà fait piéger par un aller-retour local↔UTC sur les dates de défi). */
export function comboEnded(
  c: ComboChallenge,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (comboCompleteInTime(c)) return true;
  if (c.duration_days <= 0) return false;
  return today > addDaysUtc(c.start_date, c.duration_days - 1);
}

export function comboTieredBonus(
  c: ComboChallenge,
  shareOf: (l: ComboLeg) => number = legTierShare,
  /** ⚠️ Jour courant, EXPLICITE. La prime dépend désormais de la date (elle ne tombe qu'à
   *  la fin du défi) : laisser la fonction lire l'horloge en douce la rendrait impossible
   *  à tester et sensible au fuseau — deux pièges que ce projet a déjà payés. Le défaut
   *  reste la date du jour pour les appelants qui n'ont rien à décider. */
  today = new Date().toISOString().slice(0, 10),
): number {
  // ⚠️ VERSÉE À LA FIN DU DÉFI (v0.717), pas au fil des séries. Avant, la prime tombait
  // par petits bouts à chaque série qui décrochait un palier : l'énergie montait en
  // continu et le bouclage n'était plus un moment, juste la dernière miette d'un
  // versement étalé.
  //
  // ⚠️ « LA FIN » = bouclé OU période écoulée — surtout pas « bouclé » seul. Un premier
  // essai ne payait qu'à la complétion : il rendait la prime TOUT-OU-RIEN et annulait
  // exactement ce que la v0.621 avait corrigé (un exo à la traîne faisait perdre tous les
  // autres). Deux tests l'ont refusé, à juste titre. Le bouclage PARTIEL reste donc
  // récompensé : à la fin de la semaine, on touche la prime des paliers atteints.
  // ⚠️ ABANDONNÉ = PAS DE PRIME (choix de l'utilisateur). L'XP des séries faites reste :
  // c'est du travail réel, et l'énergie qu'elle a donnée ne se reprend pas.
  if (c.status === 'abandoned') return 0;
  if (!comboEnded(c, today)) return 0;
  // Paliers et avance lus sur les séries faites DANS LES TEMPS.
  const d = comboInDeadline(c);
  const early = 1 + comboEarlyFraction(d);
  let sum = 0;
  for (const l of d.legs) {
    sum += 0.25 * legPlannedEffort(l) * shareOf(l);
  }
  return sum * early;
}

// Minutes de séance créditées par SÉRIE comptée (jusqu'à l'objectif). Le Défi 360
// REPRÉSENTE les séances muscu de la semaine, or `sessionXp` fait porter l'essentiel
// de l'XP par la DURÉE (durée×MUSCU_MIN_XP). Sans terme de durée, boucler son volume
// hebdo via le 360 ne rapportait que ~36 % d'une semaine loggée en séances (le même
// volume !). On crédite ~3,5 min de séance par série (exécution + repos), un cran sous
// une séance « pleine » (~4 min/série avec échauffement) → format efficace, honnête.
// PLAFONNÉ à l'objectif (comboCountedSets) : pas de farm de séries vides au-delà du
// plan ; le dépassement passe par le bonus `surpass`, pas par la durée.
export const COMBO_SET_MIN = 3.5;

/** Séries comptées vers l'objectif (mode-aware), plafonnées à la cible par exo. */
export function comboCountedSets(c: ComboChallenge): number {
  let n = 0;
  for (const l of c.legs) {
    const byCount = legMode(l) !== 'sets'; // reps ou durée → convertit en « séries » équivalentes
    const done = byCount ? Math.ceil(legReps(l) / COMBO_PLAN_REPS) : legSetsDone(l);
    // Plafond du crédit-durée = palier MAXIMAL (120 %), et non plus l'objectif. Une
    // série faite en plus est du VRAI travail (même exécution, même repos) : la couper
    // du terme de durée la ramenait à ~1/6 d'une série normale. Le garde-fou contre le
    // farm de séries vides demeure — il se déplace au sommet de la zone récompensée,
    // au-delà de laquelle seules les reps brutes comptent encore.
    const cap = byCount
      ? Math.ceil((l.target * COMBO_TIER_MAX) / COMBO_PLAN_REPS)
      : legTierMarks(l).max;
    n += l.target > 0 ? Math.min(done, cap) : done;
  }
  return n;
}

/** Minutes de séance équivalentes au volume bouclé (terme de durée de l'XP). */
export function comboImpliedMinutes(c: ComboChallenge): number {
  return comboCountedSets(c) * COMBO_SET_MIN;
}

/** Décompose l'XP d'UN Défi 360 : durée (volume bouclé), reps (+ tonnage), prime de
 *  bouclage, dépassement (pour l'affichage sur les défis terminés). Mêmes formules que
 *  comboXpPoints. */
/** Prime de bouclage (paliers) en XP — la MÊME valeur que celle déjà incluse dans
 *  comboXpPoints, isolée pour pouvoir l'AFFICHER (célébration de fin, historique
 *  d'énergie) au lieu de la noyer dans le total. */
export function comboBonusXp(c: ComboChallenge): number {
  return Math.round(comboTieredBonus(c) * XP_MULT);
}

export interface ComboDayXp {
  date: string; // YYYY-MM-DD
  effort: number; // reps + tonnage + durée impliquée, au prorata des séries du jour
  bonus: number; // prime de bouclage — portée par le DERNIER jour actif
}

/** Copie du défi ne gardant que les séries faites JUSQU'AU jour `date` inclus. */
function comboUpTo(c: ComboChallenge, date: string): ComboChallenge {
  return {
    ...c,
    legs: c.legs.map((l) => ({ ...l, sets: legSets(l).filter((s) => s.date <= date) })),
  };
}

/** Ventile l'XP d'un Défi 360 par JOUR (l'historique d'énergie est journalier).
 *  Méthode : on REJOUE l'état du défi jour après jour et on prend le DELTA. C'est la
 *  seule attribution fidèle, car la prime à paliers n'est PAS versée à la fin : chaque
 *  exo débloque sa part dès qu'il franchit un palier (80 % → 15 %, 100 % → 95 %), et le
 *  multiplicateur « fini en avance » ne tombe qu'au bouclage. La somme des jours vaut
 *  donc exactement comboXpPoints([c]).
 *  NB : un delta peut être négatif (une série sous les reps supposées baisse l'effort
 *  planifié) — l'appelant filtre les valeurs ≤ 0 à l'affichage. */
export function comboXpByDay(c: ComboChallenge): ComboDayXp[] {
  const dates = [...new Set(c.legs.flatMap((l) => legSets(l).map((s) => s.date))).values()]
    .filter(Boolean)
    .sort();
  if (!dates.length) return [];
  const out: ComboDayXp[] = [];
  let prevTotal = 0;
  let prevBonus = 0;
  for (const date of dates) {
    const upTo = comboUpTo(c, date);
    const total = comboXpPoints([upTo]);
    const bonus = comboBonusXp(upTo);
    out.push({ date, effort: total - prevTotal - (bonus - prevBonus), bonus: bonus - prevBonus });
    prevTotal = total;
    prevBonus = bonus;
  }
  return out;
}

export function comboXpBreakdown(c: ComboChallenge): {
  reps: number;
  duration: number;
  bonus: number;
  surpass: number;
  total: number;
} {
  let reps = 0;
  let tonnage = 0;
  for (const l of c.legs) {
    for (const s of legSets(l)) {
      reps += (s.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(s.assisted);
      tonnage += (s.reps || 0) * (s.weight ?? l.weight_kg ?? 0);
    }
  }
  // Prime à paliers, dont on ISOLE le premium du palier maximal (part au-delà du
  // principal) → l'UI peut annoncer ce que le dépassement rapporte vraiment.
  const bonusBase = comboTieredBonus(c, (l) =>
    Math.min(legTierShare(l), COMBO_TIER_SHARE.principal),
  );
  const durationXp = Math.round(comboImpliedMinutes(c) * MUSCU_MIN_XP * XP_MULT);
  const repsXp = Math.round((reps + tonnage / 500) * XP_MULT);
  const bonusXp = Math.round(bonusBase * XP_MULT);
  // Soustraction (et non 2 arrondis indépendants) → bonus + surpass = la prime réelle.
  const surpassXp = Math.round(comboTieredBonus(c) * XP_MULT) - bonusXp;
  return {
    reps: repsXp,
    duration: durationXp,
    bonus: bonusXp,
    surpass: surpassXp,
    total: repsXp + durationXp + bonusXp + surpassXp,
  };
}

/** XP d'un ensemble de Défis 360 (façon séance : durée + reps + prime + dépassement). */
export function comboXpPoints(combos: ComboChallenge[]): number {
  return combos.reduce((a, c) => {
    let reps = 0;
    let tonnage = 0;
    for (const l of c.legs) {
      for (const s of legSets(l)) {
        reps += (s.reps || 0) * REP_XP * (l.rep_weight ?? 1) * assistMult(s.assisted);
        tonnage += (s.reps || 0) * (s.weight ?? l.weight_kg ?? 0);
      }
    }
    const duration = comboImpliedMinutes(c) * MUSCU_MIN_XP;
    // Prime À PALIERS (bouclage partiel récompensé + dépassement fusionné dans le maximal).
    const bonus = comboTieredBonus(c);
    return a + Math.round((reps + tonnage / 500 + duration + bonus) * XP_MULT);
  }, 0);
}

export interface ComboSessionExo {
  exercise_id: string;
  exercise_name: string;
  weight_kg?: number | null;
  sets: number[]; // reps par série (ou SECONDES si `time`)
  time?: boolean; // exo de DURÉE (gainage) → chrono au lieu de reps/poids
  rep_min: number; // fourchette conseillée — affichée AVANT la série, sur l’en-tête de l’exo
  rep_max: number;
}

const COMBO_EXEC_SEC = 40; // durée d'exécution moyenne d'une série

/** Nb de séries qui tiennent dans une séance de `minutes` (exécution + repos). */
export function comboSessionSetBudget(minutes: number, restSec: number): number {
  const perSet = COMBO_EXEC_SEC + Math.max(0, restSec);
  return Math.max(1, Math.floor((minutes * 60) / perSet));
}

/** Durée estimée (min) d'une séance de `sets` séries (exécution + repos) → affichage
 *  quand on choisit directement le nombre de séries. */
export function comboSessionDurationMin(sets: number, restSec: number): number {
  const perSet = COMBO_EXEC_SEC + Math.max(0, restSec);
  return Math.max(1, Math.round((sets * perSet) / 60));
}

/**
 * Génère une SÉANCE à partir des SÉRIES restantes : on ne dump pas tout — on
 * remplit un BUDGET de séries (soit choisi directement via `sets`, soit déduit
 * d'un temps `minutes`), réparti en round-robin sur les exos dont il reste des
 * séries. Chaque série reprend les reps de la dernière faite, sinon le HAUT de la
 * fourchette conseillée de l’exo (`legRepRange`) — c’est le seul écran du 360 qui
 * annonce un nombre de reps AVANT l’effort, il ne doit pas annoncer un chiffre
 * arbitraire. `objective` ne sert qu’au repli des 360 créés sans fourchette.
 */
export function buildComboSession(
  c: ComboChallenge,
  opts: {
    minutes?: number;
    restSec: number;
    sets?: number;
    includeIds?: string[];
    objective?: Objective | null;
  },
): ComboSessionExo[] {
  const budget = opts.sets ?? comboSessionSetBudget(opts.minutes ?? 30, opts.restSec);
  // Sélection manuelle éventuelle : ne garder que les exos choisis (sinon tous).
  const include = opts.includeIds ? new Set(opts.includeIds) : null;
  const exos = c.legs
    .filter((l) => !include || include.has(l.exercise_id))
    .map((l) => {
      const range = legRepRange(l, opts.objective);
      // Dernière série faite (cohérence : on continue ce qu’on fait) → sinon la cible.
      const reps = legLastReps(l, prescribedReps(range));
      // Séries restantes à générer : direct en mode 'sets' ; en mode 'reps' on
      // convertit les reps restantes en nb de séries (à ~reps/série).
      const remaining =
        legMode(l) !== 'sets' ? Math.ceil(legRemaining(l) / Math.max(1, reps)) : legRemaining(l);
      return { leg: l, remaining, reps, range, sets: [] as number[] };
    })
    .filter((e) => e.remaining > 0);
  let placed = 0;
  while (placed < budget && exos.some((e) => e.remaining > 0)) {
    for (const e of exos) {
      if (placed >= budget) break;
      if (e.remaining <= 0) continue;
      e.sets.push(e.reps);
      e.remaining -= 1;
      placed++;
    }
  }
  return exos
    .filter((e) => e.sets.length)
    .map((e) => ({
      exercise_id: e.leg.exercise_id,
      exercise_name: e.leg.exercise_name,
      weight_kg: legLastWeight(e.leg),
      sets: e.sets,
      time: legMode(e.leg) === 'time',
      rep_min: e.range.min,
      rep_max: e.range.max,
    }));
}

/** Construit une séance à partir d'un nombre de séries CHOISI PAR EXO (indépendant).
 *  `counts` = { exercise_id: nb de séries }. Chaque série reprend les reps de la
 *  dernière faite, sinon le haut de la fourchette conseillée. Ordre = celui des legs
 *  du défi. Pur/testable. */
export function buildComboSessionFromCounts(
  c: ComboChallenge,
  counts: Record<string, number>,
  objective?: Objective | null,
): ComboSessionExo[] {
  const out: ComboSessionExo[] = [];
  for (const l of c.legs) {
    const n = Math.max(0, Math.floor(counts[l.exercise_id] ?? 0));
    if (n <= 0) continue;
    const range = legRepRange(l, objective);
    const reps = legLastReps(l, prescribedReps(range));
    out.push({
      exercise_id: l.exercise_id,
      exercise_name: l.exercise_name,
      weight_kg: legLastWeight(l),
      sets: Array.from({ length: n }, () => reps),
      time: legMode(l) === 'time',
      rep_min: range.min,
      rep_max: range.max,
    });
  }
  return out;
}

// ── ORDRE DES SÉRIES D'UNE SÉANCE (v0.861 ; demandé par l'utilisateur) ──
// « standard » : toutes les séries d'un exo, puis le suivant (A A A B B B).
// « alterné » : une série de chaque exo à tour de rôle (A B C A B C).
// « aléatoire » : alterné, mais l'ordre des exos est RE-MÉLANGÉ À CHAQUE TOUR (choix de
// l'utilisateur), sans jamais deux séries du même exo à la suite — y compris à la jonction
// entre deux tours. ⚠️ Seule exception, inévitable : quand il ne reste qu'UN exo (il avait
// plus de séries que les autres), ses dernières séries s'enchaînent, en alterné aussi.
export type ComboSessionOrder = 'standard' | 'alternate' | 'shuffle';

export const COMBO_SESSION_ORDERS: { id: ComboSessionOrder; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'Toutes les séries d’un exo, puis le suivant' },
  { id: 'alternate', label: 'Alterné', hint: 'Une série de chaque exo, à tour de rôle' },
  {
    id: 'shuffle',
    label: 'Aléatoire',
    hint: 'À tour de rôle, dans un ordre mélangé à chaque tour',
  },
];

/** Une série à faire : l'exo (index dans la séance) et le numéro de série dans cet exo. */
export interface ComboSessionStep {
  exo: number;
  set: number;
}

/** Tirage seedé (mulberry32) — la même graine redonne le même ordre : la séance ne se
 *  re-mélange pas à chaque rendu, ni quand on ajoute une série en cours de route. */
function orderRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** L'ordre dans lequel faire les séries d'une séance. `sets[i]` = nombre de séries de
 *  l'exo `i`. ⚠️ Un tour ne dépend que des exos qui y participent : ajouter une série à un
 *  exo en pleine séance ne change pas l'ordre des tours déjà commencés. */
export function comboSessionSteps(
  sets: readonly number[],
  order: ComboSessionOrder,
  seed = 1,
): ComboSessionStep[] {
  const steps: ComboSessionStep[] = [];
  if (order === 'standard') {
    sets.forEach((n, exo) => {
      for (let set = 0; set < n; set++) steps.push({ exo, set });
    });
    return steps;
  }
  const rng = orderRng(seed);
  const rounds = Math.max(0, ...sets);
  for (let r = 0; r < rounds; r++) {
    const round = sets.map((n, exo) => (n > r ? exo : -1)).filter((exo) => exo >= 0);
    if (order === 'shuffle') {
      for (let i = round.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [round[i], round[j]] = [round[j]!, round[i]!];
      }
      // Jonction : le tour ne commence pas par l'exo qui vient de finir le précédent.
      const last = steps.at(-1)?.exo;
      if (round.length > 1 && round[0] === last) [round[0], round[1]] = [round[1]!, round[0]!];
    }
    for (const exo of round) steps.push({ exo, set: r });
  }
  return steps;
}

/** Objectif de SÉRIES/semaine suggéré pour un emplacement (repère hypertrophie
 *  ~10-15 séries/muscle/sem). Essentiel ~12, optionnel ~9, ajusté au niveau. */
export function suggestComboTarget(level: Level, essential: boolean): number {
  const base = essential ? 12 : 9;
  const f = level === 'debutant' ? 0.75 : level === 'avance' ? 1.3 : 1;
  return Math.max(4, Math.round(base * f));
}

/** Suggère un objectif pour un exo à partir de l'HISTORIQUE : reprend le `target`
 *  du dernier Défi 360 contenant cet exo (converti si le mode diffère : séries↔reps
 *  via ~COMBO_PLAN_REPS reps/série). `null` si aucun historique. Pur/testable. */
export function suggestComboTargetFromHistory(
  exerciseId: string,
  mode: ComboCountMode,
  history: ComboChallenge[],
): number | null {
  // Le plus récent d'abord (start_date décroissant).
  const sorted = [...history].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  for (const c of sorted) {
    const leg = c.legs.find((l) => l.exercise_id === exerciseId && l.target > 0);
    if (!leg) continue;
    const pastMode = legMode(leg);
    if (pastMode === mode) return leg.target;
    // Conversion approx entre unités (séries ↔ reps/secondes, ~COMBO_PLAN_REPS/série).
    return mode !== 'sets'
      ? leg.target * COMBO_PLAN_REPS
      : Math.max(1, Math.round(leg.target / COMBO_PLAN_REPS));
  }
  return null;
}

// --- Dimensionnement FULL-BODY par volume + variété ------------------------
// Le Défi 360 renforce TOUT le corps (tous les groupes), sans notion de séances
// ni de split (on fait ses séries quand on veut dans la semaine). Deux réglages
// honnêtes : le VOLUME (léger/modéré/intense → séries/groupe) et la VARIÉTÉ
// (peu/moyen/beaucoup → nb d'exos/groupe). Débutant : variété forcée à 1 exo et
// groupes accessoires exclus (le plus simple) ; inter/avancé : tout est ouvert.

export type ComboVolume = 'light' | 'moderate' | 'intense';
export type ComboVariety = 'low' | 'med' | 'high';
const VOLUME_MULT: Record<ComboVolume, number> = { light: 0.6, moderate: 1, intense: 1.4 };
// La variété est un PLAFOND d'exos/groupe ; le nombre réel découle du volume
// (on vise ~SETS_PER_EXO séries par exo → un gros volume = plus d'exos, jamais
// 13 séries d'un seul mouvement).
const VARIETY_CAP: Record<ComboVariety, number> = { low: 1, med: 2, high: 3 };
const SETS_PER_EXO = 5;

/** Volume hebdo de base par muscle (séries) selon le niveau (repère hypertrophie). */
function comboBaseWeekly(level: Level): number {
  return level === 'debutant' ? 9 : level === 'avance' ? 15 : 12;
}
/** Séries/sem cible pour un groupe selon niveau + volume (essentiel ×1, accessoire ×0.7). */
export function comboWeeklySets(level: Level, volume: ComboVolume, essential = true): number {
  return Math.max(
    3,
    Math.round(comboBaseWeekly(level) * VOLUME_MULT[volume] * (essential ? 1 : 0.7)),
  );
}

// Zone du corps ciblée (pour les blessés ou ceux qui zappent une partie).
export type ComboZone = 'full' | 'haut' | 'bas';
const HAUT_MUSCLES = new Set(['pectoraux', 'dos', 'épaules', 'biceps', 'triceps']);
const BAS_MUSCLES = new Set(['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers']);
/** Un muscle est-il dans la zone choisie ? Le tronc (abdos/lombaires) compte dans
 *  les deux (haut = tout sauf le bas ; bas = tout sauf le haut). */
export function comboMuscleInZone(muscle: string | null | undefined, zone: ComboZone): boolean {
  if (zone === 'full') return true;
  const m = muscle ?? '';
  return zone === 'haut' ? !BAS_MUSCLES.has(m) : !HAUT_MUSCLES.has(m);
}

export interface ComboSlotSpec {
  key: string;
  muscles: string[];
  essential: boolean;
}
export interface ComboSlotPlan {
  slot: string;
  active: boolean; // groupe inclus dans le défi
  nExos: number; // nb d'exos suggérés (variété)
  weeklySets: number; // séries/sem pour le groupe (total)
  setsPerExo: number; // séries/sem par exo (= weeklySets / nExos)
}

// ── Emphase par groupe : objectif physique + complémentarité avec les sports ──
// Le Défi 360 s'adapte : un objectif « sculpter » booste les groupes esthétiques ;
// les sports d'endurance (course/trail…) matraquant déjà les jambes, on RÉDUIT leur
// volume muscu (anti-surmenage) et on renforce le haut + fessiers/gainage. Pur.
export type ComboGoal = 'sculpt' | 'perf' | 'balanced';

// muscle_primary → emplacement du 360.
const MUSCLE_SLOT: Record<string, string> = {
  pectoraux: 'push',
  dos: 'pull',
  quadriceps: 'squat',
  'ischio-jambiers': 'hinge',
  fessiers: 'hinge',
  abdominaux: 'core',
  lombaires: 'core',
  biceps: 'arms',
  triceps: 'arms',
  épaules: 'shoulders',
  mollets: 'shoulders',
};
// Multiplicateur de volume par emplacement selon l'objectif.
const GOAL_SLOT_MULT: Record<ComboGoal, Record<string, number>> = {
  // Esthétique : haut du corps + fessiers + abdos ; jambes un cran plus bas.
  sculpt: {
    push: 1.15,
    pull: 1.15,
    squat: 0.9,
    hinge: 1.15,
    core: 1.1,
    arms: 1.2,
    shoulders: 1.15,
  },
  // Perf/fonctionnel : chaîne postérieure + gainage + composés ; moins d'isolation.
  perf: { push: 1.0, pull: 1.1, squat: 1.1, hinge: 1.2, core: 1.2, arms: 0.8, shoulders: 0.95 },
  balanced: {},
};
// Groupes musculaires déjà sollicités par un sport (nom → muscle_primary).
const SPORT_LOADS: Record<string, string[]> = {
  Course: ['quadriceps', 'ischio-jambiers', 'mollets'],
  Trail: ['quadriceps', 'ischio-jambiers', 'mollets'],
  Marche: ['quadriceps', 'mollets'],
  Randonnée: ['quadriceps', 'mollets'],
  Vélo: ['quadriceps'],
  "Vélo d'appart": ['quadriceps'],
  Tennis: ['épaules', 'abdominaux', 'quadriceps'],
  Padel: ['épaules', 'abdominaux'],
  Squash: ['épaules', 'abdominaux', 'quadriceps'],
  Badminton: ['épaules', 'abdominaux'],
  Natation: ['dos', 'épaules'],
  Football: ['quadriceps', 'ischio-jambiers'],
  Basket: ['quadriceps', 'mollets'],
  Aviron: ['dos', 'ischio-jambiers'],
  Escalade: ['dos', 'biceps'],
};

/** Objectif de profil → objectif de défi (préréglage). */
export function objectiveToGoal(o?: Objective | null): ComboGoal {
  if (o === 'force' || o === 'endurance') return 'perf';
  if (o === 'remise_en_forme') return 'balanced';
  return 'sculpt'; // hypertrophie / perte_de_gras / défaut
}

/** Poids de volume par emplacement : objectif × complémentarité sports × prioritaires.
 *  Borné [0.6, 1.45] pour rester raisonnable. Pur/testable. */
export function comboEmphasis(
  goal: ComboGoal,
  sports?: SportPractice[] | null,
  priorityMuscles?: string[] | null,
): Record<string, number> {
  const slots = ['push', 'pull', 'squat', 'hinge', 'core', 'arms', 'shoulders'];
  const w: Record<string, number> = {};
  for (const s of slots) w[s] = GOAL_SLOT_MULT[goal][s] ?? 1;
  // Sports : réduit les emplacements déjà chargés (∝ fréquence × intensité).
  for (const sp of sports ?? []) {
    const factor =
      (sp.sessions_per_week || 1) *
      (sp.intensity === 'elevee' ? 1.3 : sp.intensity === 'faible' ? 0.6 : 1);
    for (const m of SPORT_LOADS[sp.name] ?? []) {
      const slot = MUSCLE_SLOT[m];
      if (slot) w[slot]! *= 1 - Math.min(0.28, 0.05 * factor);
    }
  }
  // Muscles prioritaires (profil) : boost.
  for (const m of priorityMuscles ?? []) {
    const slot = MUSCLE_SLOT[m.trim().toLowerCase()];
    if (slot) w[slot]! *= 1.2;
  }
  for (const s of slots) w[s] = Math.round(Math.max(0.6, Math.min(1.45, w[s]!)) * 100) / 100;
  return w;
}

/**
 * Plan FULL-BODY : tous les groupes essentiels sont actifs (+ les accessoires,
 * hors débutant). Le VOLUME (séries/groupe) vient de `volume`, la VARIÉTÉ (nb
 * d'exos/groupe) de `variety` ; `emphasis` (optionnel) module le volume par
 * emplacement (objectif + sports). Pur/testable.
 */
export function suggestFullBodyPlan(
  level: Level,
  volume: ComboVolume,
  variety: ComboVariety,
  slots: ComboSlotSpec[],
  emphasis?: Record<string, number>,
): ComboSlotPlan[] {
  const cap = VARIETY_CAP[variety];
  return slots.map((s) => {
    // Le BRAS est TOUJOURS proposé (même en débutant) — les bras sont un groupe
    // motivant qu'on ne veut pas laisser tomber en silence (ticket adbc5ff4). Les
    // autres accessoires (épaules/mollets) restent réservés à inter/avancé.
    const active = s.essential || s.key === 'arms' || level !== 'debutant';
    if (!active) return { slot: s.key, active: false, nExos: 0, weeklySets: 0, setsPerExo: 0 };
    const mult = emphasis?.[s.key] ?? 1;
    const weeklySets = Math.max(3, Math.round(comboWeeklySets(level, volume, s.essential) * mult));
    // Nb d'exos = volume / ~5 séries, borné par le plafond de variété (accessoires : 1).
    const wanted = Math.max(1, Math.round(weeklySets / SETS_PER_EXO));
    const nExos = s.essential ? Math.min(cap, wanted) : 1;
    const setsPerExo = Math.max(1, Math.round(weeklySets / nExos));
    return { slot: s.key, active: true, nExos, weeklySets, setsPerExo };
  });
}

// ── Export TEXTE détaillé d'un Défi 360 complet (partagé par ComboDetailPage ET
//    l'onglet Défi 360 de ChallengesPage → une seule source, pas de divergence). ──
function fmtDM(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function addDaysUtc(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}
/** Texte détaillé du défi complet : entête (semaine, %, théorique) + chaque exo
 *  (cible/réalisé, paliers) avec le détail de chaque série faite (reps×poids / secondes).
 *  `today` = jour logique courant (pour l'avancement théorique). */
export function comboExportText(c: ComboChallenge, today: string): string {
  const end = addDaysUtc(c.start_date, c.duration_days - 1);
  const pct = comboProgressPct(c);
  let onTime = 0;
  if (today >= c.start_date && c.duration_days > 0) {
    const elapsed =
      Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.start_date}T00:00:00Z`)) / 86400000,
      ) + 1;
    onTime = Math.round((Math.max(0, Math.min(c.duration_days, elapsed)) / c.duration_days) * 100);
  }
  const showOnTime = c.status === 'active' && onTime > 0 && onTime < 100;
  const L: string[] = [];
  L.push(`🎯 Défi 360 — Semaine du ${fmtDM(c.start_date)} → ${fmtDM(end)}`);
  L.push(
    `Progression : ${fmtPct(pct)}%` +
      (showOnTime ? ` (théorique ${onTime}%)` : '') +
      (c.status === 'done' ? ' — bouclé ✅' : ''),
  );
  L.push('');
  for (const leg of c.legs) {
    const done = legDone(leg);
    const sec = Math.round(leg.target * COMBO_TIER_SECONDARY);
    const max = Math.round(leg.target * COMBO_TIER_MAX);
    L.push(
      `• ${leg.exercise_name}${leg.weight_kg ? ` (${leg.weight_kg} kg)` : ''} — ` +
        `${done}/${leg.target} ${legUnitLabel(leg)}${legComplete(leg) ? ' ✓' : ''}` +
        (done > leg.target ? ` (+${done - leg.target} en plus)` : ''),
    );
    L.push(`   paliers : sec. ${sec} · principal ${leg.target} · max ${max}`);
    const sets = legSets(leg);
    if (sets.length) {
      const detail =
        legMode(leg) === 'time'
          ? sets.map((s) => `${s.reps}s`).join(', ')
          : sets
              .map((s) => {
                const b = s.weight ? `${s.reps}×${s.weight}kg` : `${s.reps}`;
                return s.assisted ? `${b}·a` : b;
              })
              .join(', ');
      L.push(`   séries : ${detail}`);
    }
  }
  return L.join('\n');
}
