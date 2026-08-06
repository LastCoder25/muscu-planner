// combo.ts — données du Défi 360 (défi combiné hebdo full-body).
// Emplacements par PATTERN musculaire → couverture complète (= 3-4 séances/sem).
// Les composés couvrent plusieurs muscles ; les optionnels ajoutent de l'isolation.

export interface ComboSlot {
  key: string;
  label: string;
  emoji: string;
  muscles: string[]; // valeurs muscle_primary éligibles pour cet emplacement
  essential: boolean; // true = emplacement du full-body de base
  hint: string;
}

export const COMBO_SLOTS: ComboSlot[] = [
  {
    key: 'push',
    label: 'Poussée',
    emoji: '🙌',
    muscles: ['pectoraux'],
    essential: true,
    hint: 'Pecto, triceps, épaules — pompes, dips, développés.',
  },
  {
    key: 'pull',
    label: 'Tirage',
    emoji: '🧗',
    muscles: ['dos'],
    essential: true,
    hint: 'Dos, biceps — tractions, rowing.',
  },
  {
    key: 'squat',
    label: 'Squat',
    emoji: '🦵',
    muscles: ['quadriceps'],
    essential: true,
    hint: 'Quadriceps, fessiers — squats, fentes.',
  },
  {
    key: 'hinge',
    label: 'Charnière',
    emoji: '🍑',
    muscles: ['ischio-jambiers'],
    essential: true,
    hint: 'Ischios, fessiers — hip thrust, good morning.',
  },
  {
    key: 'core',
    label: 'Gainage',
    emoji: '🧘',
    muscles: ['abdominaux'],
    essential: true,
    hint: 'Abdos, gainage — planche, crunch.',
  },
  {
    key: 'arms',
    label: 'Bras',
    emoji: '💪',
    muscles: ['biceps', 'triceps'],
    essential: false,
    hint: 'Isolation bras — curls, extensions.',
  },
  {
    key: 'shoulders',
    label: 'Épaules & mollets',
    emoji: '🏋️',
    muscles: ['épaules', 'mollets'],
    essential: false,
    hint: 'Finitions — élévations, mollets.',
  },
];

export function comboSlot(key: string): ComboSlot | undefined {
  return COMBO_SLOTS.find((s) => s.key === key);
}
