// muscles.ts — VOCABULAIRE des groupes musculaires (pur). Source unique pour savoir si
// deux noms désignent le même muscle, et quel rôle un muscle joue dans un exercice :
// le graphe d'équilibre et le filtre du wizard de challenge doivent reconnaître les
// MÊMES exos, sinon le muscle signalé en déficit ne proposerait pas ceux qui le comblent.

// Variantes de nom présentes en base (vérifié), rattachées au muscle qui porte la cible.
const MUSCLE_ALIASES: Record<string, string> = {
  'deltoïde antérieur': 'épaules',
  'deltoide anterieur': 'épaules',
  avant_bras: 'avant-bras',
};

/** LIBELLÉS des muscles (clés normalisées) — UNE seule table, lue par la silhouette, le graphe
 *  d'équilibre, le radar et les priorités du profil : un même muscle porte le même nom partout.
 *  ⚠️ « Abdos » (court) : il tient sur l'axe du radar à 344 px, et c'est la valeur déjà
 *  enregistrée dans les profils (priority_muscles). */
export const MUSCLE_LABELS: Readonly<Record<string, string>> = {
  pectoraux: 'Pectoraux',
  épaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  'avant-bras': 'Avant-bras',
  dos: 'Dos',
  abdominaux: 'Abdos',
  quadriceps: 'Quadriceps',
  'ischio-jambiers': 'Ischio / fessiers',
  fessiers: 'Fessiers',
  mollets: 'Mollets',
};

/** Libellés des GROUPES de plusieurs muscles (radar, priorités du profil). */
export const GROUP_LABELS = { arms: 'Bras', legs: 'Jambes' } as const;

/** Libellé d'un muscle (nom brut ou normalisé) ; à défaut, le nom tel quel. */
export function muscleLabel(m: string | null | undefined): string {
  const k = normMuscle(m);
  return MUSCLE_LABELS[k] ?? m ?? '';
}

/** Les 6 RÉGIONS du radar d'équilibre (façon stats de RPG), muscles normalisés. */
export const MUSCLE_REGIONS: readonly { key: string; muscles: readonly string[] }[] = [
  { key: MUSCLE_LABELS.pectoraux!, muscles: ['pectoraux'] },
  { key: MUSCLE_LABELS['épaules']!, muscles: ['épaules'] },
  { key: GROUP_LABELS.arms, muscles: ['biceps', 'triceps', 'avant-bras'] },
  {
    key: GROUP_LABELS.legs,
    muscles: ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers'],
  },
  { key: MUSCLE_LABELS.abdominaux!, muscles: ['abdominaux'] },
  { key: MUSCLE_LABELS.dos!, muscles: ['dos'] },
];

/** Séries par région, dans l'ordre de `MUSCLE_REGIONS` (clés du relevé normalisées). */
export function regionTotals(byMuscle: Readonly<Record<string, number>>): number[] {
  const norm: Record<string, number> = {};
  for (const [m, v] of Object.entries(byMuscle)) {
    const k = normMuscle(m);
    norm[k] = (norm[k] ?? 0) + v;
  }
  return MUSCLE_REGIONS.map((r) => r.muscles.reduce((a, m) => a + (norm[m] ?? 0), 0));
}

/** Nom de muscle normalisé : minuscules, espaces retirés, variantes rattachées. */
export function normMuscle(m: string | null | undefined): string {
  const k = (m ?? '').trim().toLowerCase();
  return MUSCLE_ALIASES[k] ?? k;
}

/** Rôle d'un muscle dans un exercice : principal, secondaire, ou absent. */
export function muscleRole(
  exo: { muscle_primary?: string | null; muscle_secondary?: readonly string[] | null },
  muscle: string,
): 'primary' | 'secondary' | null {
  const m = normMuscle(muscle);
  if (!m) return null;
  if (normMuscle(exo.muscle_primary) === m) return 'primary';
  return (exo.muscle_secondary ?? []).some((s) => normMuscle(s) === m) ? 'secondary' : null;
}
