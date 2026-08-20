// exerciseUnits.ts — classification de l'UNITÉ la plus LOGIQUE d'un exercice.
//
// La colonne `exercises.unit` encode déjà le cas mono-unité :
//   • reps  → force / hypertrophie (développé, curl, crunch, burpees…) — jamais en durée.
//   • time  → gainage / isométrie (planche, chaise) — jamais en reps.
//
// Il reste les exos « rythmiques » de conditionnement où **les DEUX** sont naturels :
// on peut compter les répétitions OU tenir une durée (corde à sauter, jumping jacks,
// montées de genoux, mountain climbers). Pour EUX, l'UI propose un choix reps / durée.
// (cf. tickets f2fb146c « unité la plus logique » + 56c9f532 « pas de durée sur la corde ».)

/** Exos faisables aussi bien en RÉPÉTITIONS qu'en DURÉE (choix proposé à l'utilisateur). */
export const DUAL_UNIT_EXERCISE_IDS = new Set<string>([
  'ex_jump_rope', // corde à sauter
  'ex_jumping_jacks', // jumping jacks
  'ex_high_knees', // montées de genoux
  'ex_mountain_climbers', // mountain climbers
  'ex_burpees', // burpees (AMRAP ou « X min »)
  'ex_squat_jump', // squats sautés (pliométrie au temps)
]);

/** Cet exo se fait-il logiquement en reps OU en durée (→ proposer le choix) ? */
export function isDualUnitExercise(id: string | undefined): boolean {
  return !!id && DUAL_UNIT_EXERCISE_IDS.has(id);
}
