// Catalogue statique des succès (mur de trophées). Seule la date de déblocage
// est stockée en base ; le prédicat de déblocage vit dans lib/challenges.ts.
export interface AchievementDef {
  code: string;
  title: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: 'first_done',
    title: 'Premier défi',
    desc: 'Terminer ton premier challenge.',
    icon: 'emoji_events',
  },
  { code: 'five_done', title: 'Habitué', desc: 'Terminer 5 challenges.', icon: 'military_tech' },
  {
    code: 'streak_7',
    title: '7 jours d’affilée',
    desc: 'Une série de 7 jours consécutifs.',
    icon: 'local_fire_department',
  },
  {
    code: 'streak_30',
    title: '30 jours d’affilée',
    desc: 'Une série de 30 jours consécutifs.',
    icon: 'whatshot',
  },
  {
    code: 'perfect_month',
    title: 'Mois parfait',
    desc: 'Un défi d’un mois sans rater un jour.',
    icon: 'verified',
  },
  { code: 'century', title: '100 jours', desc: 'Terminer un défi de 100 jours.', icon: 'stars' },
  {
    code: 'reps_5000',
    title: '5 000 reps',
    desc: '5 000 répétitions cumulées.',
    icon: 'fitness_center',
  },
  { code: 'reps_20000', title: '20 000 reps', desc: '20 000 répétitions cumulées.', icon: 'bolt' },
  {
    code: 'variety_3',
    title: 'Touche-à-tout',
    desc: 'Des défis sur 3 exercices différents.',
    icon: 'category',
  },
  {
    code: 'pyramid_done',
    title: 'Pyramide',
    desc: 'Terminer un défi pyramidal.',
    icon: 'change_history',
  },
  { code: 'wave_done', title: 'Surfeur', desc: 'Terminer un défi en vagues.', icon: 'waves' },
  {
    code: 'comeback',
    title: 'Comeback',
    desc: 'Finir un défi malgré des jours ratés.',
    icon: 'replay',
  },
  {
    code: 'ten_done',
    title: 'Machine',
    desc: 'Terminer 10 challenges.',
    icon: 'workspace_premium',
  },
  {
    code: 'streak_100',
    title: 'Inarrêtable',
    desc: 'Une série de 100 jours consécutifs.',
    icon: 'local_fire_department',
  },
  {
    code: 'reps_50000',
    title: '50 000 reps',
    desc: '50 000 répétitions cumulées.',
    icon: 'rocket_launch',
  },
  {
    code: 'variety_5',
    title: 'Polyvalent',
    desc: 'Des défis sur 5 exercices différents.',
    icon: 'diversity_3',
  },
  {
    code: 'ramp_done',
    title: 'Ascension',
    desc: 'Terminer un défi en rampe min→max.',
    icon: 'trending_up',
  },
  {
    code: 'pyramid_progressive_done',
    title: 'Architecte',
    desc: 'Terminer un défi pyramidal progressif.',
    icon: 'stacked_line_chart',
  },
  {
    code: 'cumulative_done',
    title: 'Fourmi',
    desc: 'Terminer un défi à objectif cumulé.',
    icon: 'functions',
  },
  {
    code: 'carry_master',
    title: 'Bon gestionnaire',
    desc: 'Terminer un défi avec report réserve/dette.',
    icon: 'account_balance',
  },
  {
    code: 'marathon',
    title: 'Marathonien',
    desc: 'Terminer un défi de 60 jours ou plus.',
    icon: 'directions_run',
  },
  {
    code: 'multi_active',
    title: 'Multitâche',
    desc: '3 challenges menés en parallèle.',
    icon: 'dashboard',
  },
  {
    code: 'perfectionist',
    title: 'Perfectionniste',
    desc: 'Terminer un défi à 100 % (aucun jour raté).',
    icon: 'verified',
  },
];

export function achievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code);
}
