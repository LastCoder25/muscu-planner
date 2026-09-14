// tennisTraining.ts — ENTRAÎNEMENT TENNIS en solo : Défi 360 Tennis et challenges tennis
// (pur/testable). Conçu avec l'utilisateur : exos faisables SEUL, à la maison ou sur le
// court, avec ou sans matériel ; un Défi 360 Tennis autorisé EN PLUS du 360 muscu ; XP
// versée à la piste Tennis ; challenges tennis dans une 3ᵉ voie de jetons.
//
// ⚠️ UN EXO TENNIS SE RECONNAÎT À SES DONNÉES, PAS À SON ID : catégorie `prepa_physique`
// + tag `tennis`. Son GROUPE (emplacement du 360) et ses LIEUX sont aussi des tags
// (`t360:<groupe>`, `maison`, `court`) : ajouter un exo ne demande qu'une ligne en base.
import { isCardioTrackChallenge } from '@/data/cardio';
import { variantFamilyKey } from '@/data/combo';
import type { ComboChallenge } from './combo';
import type { Challenge } from './challenges';
import type { RepRange } from './repScheme';

export type TennisSlotKey =
  | 'explosivite'
  | 'reactivite'
  | 'rotation'
  | 'gainage'
  | 'jambes'
  | 'prevention';

export interface TennisSlot {
  key: TennisSlotKey;
  label: string;
  emoji: string;
  /** Emplacement obligatoire du 360 Tennis (les deux derniers sont optionnels). */
  essential: boolean;
  hint: string;
  /** Aucun muscle : un groupe tennis se définit par son TAG (contrat de `ComboSlotSpec`). */
  muscles: string[];
  /** Fourchette par série quand l'exo se compte en reps. */
  reps: RepRange;
  /** Fourchette par série (secondes) quand l'exo est au temps. */
  seconds: RepRange;
}

/** Les 6 groupes, dans l'ordre du draft. Fourchettes calées sur la qualité d'exécution :
 *  l'explosivité et la réactivité se travaillent COURT et FRAIS (repos complet), la
 *  prévention léger et long. */
export const TENNIS_SLOTS: readonly TennisSlot[] = [
  {
    key: 'explosivite',
    label: 'Explosivité',
    emoji: '💥',
    essential: true,
    hint: 'Sauts et bonds : la première impulsion vers la balle.',
    muscles: [],
    reps: { min: 4, max: 6, rest: 90 },
    seconds: { min: 10, max: 15, rest: 90 },
  },
  {
    key: 'reactivite',
    label: 'Réactivité & appuis',
    emoji: '⚡',
    essential: true,
    hint: 'Split-step, pas chassés, départs : réagir et se replacer.',
    muscles: [],
    reps: { min: 6, max: 8, rest: 60 },
    seconds: { min: 15, max: 20, rest: 60 },
  },
  {
    key: 'rotation',
    label: 'Rotation',
    emoji: '🌀',
    essential: true,
    hint: 'La puissance du tronc derrière le coup droit et le revers.',
    muscles: [],
    reps: { min: 8, max: 10, rest: 60 },
    seconds: { min: 20, max: 30, rest: 60 },
  },
  {
    key: 'gainage',
    label: 'Gainage & stabilité',
    emoji: '🧱',
    essential: true,
    hint: 'Transmettre la force des jambes au bras sans la perdre.',
    muscles: [],
    reps: { min: 8, max: 12, rest: 45 },
    seconds: { min: 30, max: 45, rest: 45 },
  },
  {
    key: 'jambes',
    label: 'Jambes & équilibre',
    emoji: '🦵',
    essential: false,
    hint: 'Force sur une jambe : fentes, appuis décalés, frappe en déséquilibre.',
    muscles: [],
    reps: { min: 8, max: 12, rest: 60 },
    seconds: { min: 30, max: 45, rest: 60 },
  },
  {
    key: 'prevention',
    label: 'Prévention épaule & poignet',
    emoji: '🩹',
    essential: false,
    hint: 'Léger et contrôlé : rotateurs de l’épaule, avant-bras, poignet.',
    muscles: [],
    reps: { min: 12, max: 15, rest: 45 },
    seconds: { min: 30, max: 40, rest: 45 },
  },
];

type TennisPlace = 'maison' | 'court';
export type TennisPlaceChoice = TennisPlace | 'both';

type Tagged = { category?: string | null; tags?: readonly string[] | null };

const SLOT_TAG = 't360:';

/** Exo d'entraînement tennis (bibliothèque prépa physique, tag `tennis`). */
export function isTennisExercise(e: Tagged): boolean {
  return e.category === 'prepa_physique' && !!e.tags?.includes('tennis');
}

/** Groupe du 360 Tennis d'un exo, ou null (échauffement, exo muscu…). */
export function tennisSlotOf(e: Tagged): TennisSlotKey | null {
  if (!isTennisExercise(e)) return null;
  for (const t of e.tags ?? []) {
    if (!t.startsWith(SLOT_TAG)) continue;
    const key = t.slice(SLOT_TAG.length);
    if (TENNIS_SLOTS.some((s) => s.key === key)) return key as TennisSlotKey;
  }
  return null;
}

/** L'exo se fait-il à cet endroit ? « Les deux » accepte tout exo qui a au moins un lieu. */
export function fitsPlace(e: Tagged, place: TennisPlaceChoice): boolean {
  const tags = e.tags ?? [];
  if (place === 'both') return tags.includes('maison') || tags.includes('court');
  return tags.includes(place);
}

/** Fourchette par série d'un exo tennis, selon son groupe et son unité. */
export function tennisRange(slot: TennisSlotKey, time: boolean): RepRange {
  const s = TENNIS_SLOTS.find((x) => x.key === slot) ?? TENNIS_SLOTS[0]!;
  return time ? s.seconds : s.reps;
}

// ── Deux sortes de Défi 360 ─────────────────────────────────────────────────────

export type ComboKind = 'muscu' | 'tennis';

/** Sorte d'un 360 : absente = muscu (tous les 360 d'avant ce changement). */
export function comboKind(c: Pick<ComboChallenge, 'kind'>): ComboKind {
  return c.kind === 'tennis' ? 'tennis' : 'muscu';
}

/** Peut-on lancer un 360 de cette sorte ? UN actif par sorte : un 360 muscu et un 360
 *  Tennis coexistent, jamais deux de la même sorte. */
export function canStartCombo(
  combos: readonly Pick<ComboChallenge, 'kind' | 'status'>[],
  kind: ComboKind,
): boolean {
  return !combos.some((c) => c.status === 'active' && comboKind(c) === kind);
}

// ── Trois voies de jetons pour les challenges ───────────────────────────────────

export type ChallengeLane = 'muscu' | 'cardio' | 'tennis';

/** Voie d'un challenge. ⚠️ Le cardio passe en premier : une sortie reste une sortie. */
export function challengeLane(
  c: Pick<Challenge, 'unit' | 'exercise_id'> & { config?: Pick<Challenge['config'], 'discipline'> },
): ChallengeLane {
  if (isCardioTrackChallenge(c)) return 'cardio';
  return c.config?.discipline === 'tennis' ? 'tennis' : 'muscu';
}

/** Voie d'un exo qu'on s'apprête à mettre en challenge (sans ligne en base). */
export function exerciseLane(e: Tagged & { id: string }, cardio: boolean): ChallengeLane {
  if (cardio) return 'cardio';
  return isTennisExercise(e) ? 'tennis' : 'muscu';
}

// ── Exclusivité ─────────────────────────────────────────────────────────────────

/** Familles d'exos déjà PRISES : challenges actifs (hors sorties cardio) et exos de tous
 *  les 360 actifs. Un exo est dans UN seul défi à la fois, quelle que soit la sorte. */
export function takenFamilies(
  challenges: readonly Pick<Challenge, 'status' | 'unit' | 'exercise_id'>[],
  combos: readonly Pick<ComboChallenge, 'status' | 'legs'>[],
): Set<string> {
  const keys = new Set<string>();
  for (const c of challenges)
    if (c.status === 'active' && !isCardioTrackChallenge(c))
      keys.add(variantFamilyKey(c.exercise_id));
  for (const c of combos)
    if (c.status === 'active')
      for (const leg of c.legs ?? []) keys.add(variantFamilyKey(leg.exercise_id));
  return keys;
}
