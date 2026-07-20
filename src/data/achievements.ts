// Catalogue statique des succès (mur de trophées). Seule la date de déblocage
// est stockée en base ; le prédicat de déblocage vit dans lib/challenges.ts.
export interface AchievementDef {
  code: string;
  title: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_done', title: 'Premier défi', desc: "Terminer ton premier challenge.", icon: 'emoji_events' },
  { code: 'five_done', title: 'Habitué', desc: "Terminer 5 challenges.", icon: 'military_tech' },
  { code: 'streak_7', title: '7 jours d’affilée', desc: "Une série de 7 jours consécutifs.", icon: 'local_fire_department' },
  { code: 'streak_30', title: '30 jours d’affilée', desc: "Une série de 30 jours consécutifs.", icon: 'whatshot' },
  { code: 'perfect_month', title: 'Mois parfait', desc: "Un défi d’un mois sans rater un jour.", icon: 'verified' },
  { code: 'century', title: '100 jours', desc: "Terminer un défi de 100 jours.", icon: 'stars' },
  { code: 'reps_5000', title: '5 000 reps', desc: "5 000 répétitions cumulées.", icon: 'fitness_center' },
  { code: 'reps_20000', title: '20 000 reps', desc: "20 000 répétitions cumulées.", icon: 'bolt' },
  { code: 'variety_3', title: 'Touche-à-tout', desc: "Des défis sur 3 exercices différents.", icon: 'category' },
  { code: 'pyramid_done', title: 'Pyramide', desc: "Terminer un défi pyramidal.", icon: 'change_history' },
  { code: 'wave_done', title: 'Surfeur', desc: "Terminer un défi en vagues.", icon: 'waves' },
  { code: 'comeback', title: 'Comeback', desc: "Finir un défi malgré des jours ratés.", icon: 'replay' },
];

export function achievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code);
}
