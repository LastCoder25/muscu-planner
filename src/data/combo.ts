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

// Familles de MOUVEMENT : mêmes gestes déclinés en versions différentes (assistée,
// élastique, sur les genoux, à la barre / aux haltères / au poids du corps…).
// Deux exos d'une même famille = le même mouvement → redondants : on ne les propose
// jamais ensemble (Défi 360 : exclusifs dans un emplacement ; challenges : un seul
// défi par mouvement). Chaque groupe = ids d'un même mouvement.
export const EXERCISE_VARIANT_FAMILIES: string[][] = [
  // Pompes : toutes les variations de pompes au sol.
  ['ex_pushup', 'ex_pushup_knees', 'ex_diamond_pushup', 'ex_pike_pushup'],
  ['ex_dips', 'ex_dips_assisted'], // dips / dips assistés (élastique)
  // Tractions / tirage vertical (tractions, assistées élastique, tirage machine).
  ['ex_pullup', 'ex_pullup_assisted', 'ex_lat_pulldown'],
  // Squat : au poids du corps, chargé, élastique, goblet.
  ['ex_squat_barbell', 'ex_bw_squat', 'ex_band_squat', 'ex_kb_goblet_squat'],
  // Rowing / tirage horizontal (barre, haltère, kettlebell, élastique, machine).
  ['ex_row_barbell', 'ex_row_dumbbell', 'ex_kb_row', 'ex_band_row', 'ex_seated_row'],
  // Curl biceps (barre, haltères, élastique).
  ['ex_curl_barbell', 'ex_curl_dumbbell', 'ex_band_curl'],
  // Extension triceps à la poulie / élastique.
  ['ex_triceps_pushdown', 'ex_band_pushdown'],
  // Développé couché à plat (barre, haltères).
  ['ex_bench_barbell', 'ex_bench_dumbbell'],
  // Développé incliné (haltères, machine).
  ['ex_incline_dumbbell', 'ex_incline_machine'],
  // Développé épaules (haltères, kettlebell, militaire barre).
  ['ex_shoulder_press_db', 'ex_kb_press', 'ex_ohp_barbell'],
  // Mollets debout (machine / poids du corps).
  ['ex_calf_raise', 'ex_calf_raise_bw'],
];

// id de variante → clé de famille (= 1er id du groupe). Absent = pas de variante.
const VARIANT_FAMILY_OF: Record<string, string> = Object.fromEntries(
  EXERCISE_VARIANT_FAMILIES.flatMap((fam) => fam.map((id) => [id, fam[0] as string])),
);

/** Clé de famille de variantes d'un exo (lui-même si pas de variante). Deux exos
 *  de même clé sont le même mouvement à difficultés différentes → exclusifs. */
export function variantFamilyKey(exerciseId: string): string {
  return VARIANT_FAMILY_OF[exerciseId] ?? exerciseId;
}
