// Catalogue de découpes (splits) proposées selon le nombre de séances/semaine.
// Chaque jour cible des groupes musculaires ; le générateur (buildProgram)
// répartit les exos par appartenance. Un jour « full-body » cible tous les muscles
// (les exos sont alors répartis en round-robin entre les jours full-body).

export type MuscleKey =
  | 'pectoraux' | 'dos' | 'épaules' | 'biceps' | 'triceps'
  | 'quadriceps' | 'ischio-jambiers' | 'mollets' | 'abdominaux';

export const ALL_MUSCLES: MuscleKey[] = [
  'pectoraux', 'dos', 'épaules', 'biceps', 'triceps',
  'quadriceps', 'ischio-jambiers', 'mollets', 'abdominaux',
];
const UPPER: MuscleKey[] = ['pectoraux', 'dos', 'épaules', 'biceps', 'triceps'];
const LOWER: MuscleKey[] = ['quadriceps', 'ischio-jambiers', 'mollets', 'abdominaux'];
const PUSH: MuscleKey[] = ['pectoraux', 'épaules', 'triceps'];
const PULL: MuscleKey[] = ['dos', 'biceps'];
const LEGS: MuscleKey[] = ['quadriceps', 'ischio-jambiers', 'mollets', 'abdominaux'];

export interface SplitDay { name: string; muscles: MuscleKey[] }
export interface SplitOption { id: string; name: string; subtitle: string; days: SplitDay[] }

const fullBody = (n: number): SplitOption => ({
  id: 'full_body',
  name: 'Full-body',
  subtitle: `${n} séances complètes`,
  days: Array.from({ length: n }, (_, i) => ({ name: `Full-body ${String.fromCharCode(65 + i)}`, muscles: ALL_MUSCLES })),
});

// Catalogue par nombre de séances (2 → 6).
export const SPLIT_CATALOG: Record<number, SplitOption[]> = {
  2: [
    fullBody(2),
    { id: 'upper_lower', name: 'Haut / Bas', subtitle: 'Haut du corps puis bas', days: [
      { name: 'Haut', muscles: UPPER }, { name: 'Bas', muscles: LOWER },
    ] },
  ],
  3: [
    fullBody(3),
    { id: 'ppl', name: 'Push / Pull / Legs', subtitle: 'Poussée · Tirage · Jambes', days: [
      { name: 'Push (poussée)', muscles: PUSH }, { name: 'Pull (tirage)', muscles: PULL }, { name: 'Legs (jambes)', muscles: LEGS },
    ] },
    { id: 'pjd', name: 'Pecs+Bras / Jambes / Dos+Épaules', subtitle: 'Découpe par zones', days: [
      { name: 'Pecs + Bras', muscles: ['pectoraux', 'biceps', 'triceps'] },
      { name: 'Jambes', muscles: LEGS },
      { name: 'Dos + Épaules', muscles: ['dos', 'épaules'] },
    ] },
  ],
  4: [
    { id: 'upper_lower_2', name: 'Haut / Bas (×2)', subtitle: 'Haut, Bas, Haut, Bas', days: [
      { name: 'Haut A', muscles: UPPER }, { name: 'Bas A', muscles: LOWER },
      { name: 'Haut B', muscles: UPPER }, { name: 'Bas B', muscles: LOWER },
    ] },
    { id: 'ppl_upper', name: 'Push / Pull / Legs / Haut', subtitle: 'PPL + un haut du corps', days: [
      { name: 'Push (poussée)', muscles: PUSH }, { name: 'Pull (tirage)', muscles: PULL },
      { name: 'Legs (jambes)', muscles: LEGS }, { name: 'Haut', muscles: UPPER },
    ] },
    { id: 'split4', name: 'Pecs / Dos / Jambes / Épaules+Bras', subtitle: 'Découpe par zones', days: [
      { name: 'Pecs', muscles: ['pectoraux'] }, { name: 'Dos', muscles: ['dos'] },
      { name: 'Jambes', muscles: LEGS }, { name: 'Épaules + Bras', muscles: ['épaules', 'biceps', 'triceps'] },
    ] },
  ],
  5: [
    { id: 'ppl_ul', name: 'Push / Pull / Legs / Haut / Bas', subtitle: 'PPL + Haut/Bas', days: [
      { name: 'Push (poussée)', muscles: PUSH }, { name: 'Pull (tirage)', muscles: PULL },
      { name: 'Legs (jambes)', muscles: LEGS }, { name: 'Haut', muscles: UPPER }, { name: 'Bas', muscles: LOWER },
    ] },
    { id: 'split5', name: 'Pecs / Dos / Jambes / Épaules / Bras', subtitle: 'Découpe par zones', days: [
      { name: 'Pecs', muscles: ['pectoraux'] }, { name: 'Dos', muscles: ['dos'] },
      { name: 'Jambes', muscles: LEGS }, { name: 'Épaules', muscles: ['épaules', 'abdominaux'] },
      { name: 'Bras', muscles: ['biceps', 'triceps'] },
    ] },
  ],
  6: [
    { id: 'ppl_2', name: 'Push / Pull / Legs (×2)', subtitle: 'PPL deux fois', days: [
      { name: 'Push A', muscles: PUSH }, { name: 'Pull A', muscles: PULL }, { name: 'Legs A', muscles: LEGS },
      { name: 'Push B', muscles: PUSH }, { name: 'Pull B', muscles: PULL }, { name: 'Legs B', muscles: LEGS },
    ] },
    fullBody(6),
  ],
};

export function splitsFor(sessionsPerWeek: number): SplitOption[] {
  const n = Math.min(6, Math.max(2, sessionsPerWeek));
  return SPLIT_CATALOG[n] ?? [fullBody(n)];
}

// Découpe recommandée par défaut : full-body pour les débutants quand elle existe,
// sinon la première variante du catalogue.
export function defaultSplit(sessionsPerWeek: number, level?: string): SplitOption {
  const opts = splitsFor(sessionsPerWeek);
  if (level === 'debutant') {
    const fb = opts.find((o) => o.id === 'full_body');
    if (fb) return fb;
  }
  return opts[0]!;
}
