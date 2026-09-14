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

/** Les 6 RÉGIONS du radar d'équilibre (façon stats de RPG), muscles normalisés. */
export const MUSCLE_REGIONS: readonly { key: string; muscles: readonly string[] }[] = [
  { key: 'Poitrine', muscles: ['pectoraux'] },
  { key: 'Épaules', muscles: ['épaules'] },
  { key: 'Bras', muscles: ['biceps', 'triceps', 'avant-bras'] },
  { key: 'Jambes', muscles: ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers'] },
  { key: 'Core', muscles: ['abdominaux'] },
  { key: 'Dos', muscles: ['dos'] },
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
