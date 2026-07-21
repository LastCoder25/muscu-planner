// Catalogue statique des succès (mur de trophées). Seule la date de déblocage
// est stockée en base ; le prédicat de déblocage vit dans lib/challenges.ts.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface AchievementDef {
  code: string;
  title: string;
  desc: string;
  icon: string;
  rarity: Rarity;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Reps cumulées ──
  {
    code: 'reps_1000',
    title: '1 000 reps',
    desc: '1 000 répétitions cumulées.',
    icon: 'fitness_center',
    rarity: 'common',
  },
  {
    code: 'reps_5000',
    title: '5 000 reps',
    desc: '5 000 répétitions cumulées.',
    icon: 'fitness_center',
    rarity: 'common',
  },
  {
    code: 'reps_20000',
    title: '20 000 reps',
    desc: '20 000 répétitions cumulées.',
    icon: 'bolt',
    rarity: 'rare',
  },
  {
    code: 'reps_50000',
    title: '50 000 reps',
    desc: '50 000 répétitions cumulées.',
    icon: 'rocket_launch',
    rarity: 'epic',
  },
  {
    code: 'reps_100000',
    title: '100 000 reps',
    desc: '100 000 répétitions cumulées.',
    icon: 'auto_awesome',
    rarity: 'legendary',
  },

  // ── Série (jours consécutifs) ──
  {
    code: 'streak_3',
    title: '3 jours',
    desc: 'Une série de 3 jours consécutifs.',
    icon: 'local_fire_department',
    rarity: 'common',
  },
  {
    code: 'streak_7',
    title: '7 jours d’affilée',
    desc: 'Une série de 7 jours consécutifs.',
    icon: 'local_fire_department',
    rarity: 'common',
  },
  {
    code: 'streak_30',
    title: '30 jours d’affilée',
    desc: 'Une série de 30 jours consécutifs.',
    icon: 'whatshot',
    rarity: 'rare',
  },
  {
    code: 'streak_100',
    title: 'Inarrêtable',
    desc: 'Une série de 100 jours consécutifs.',
    icon: 'whatshot',
    rarity: 'epic',
  },
  {
    code: 'streak_365',
    title: 'Une année',
    desc: 'Une série de 365 jours consécutifs.',
    icon: 'military_tech',
    rarity: 'legendary',
  },

  // ── Défis terminés ──
  {
    code: 'first_done',
    title: 'Premier défi',
    desc: 'Terminer ton premier challenge.',
    icon: 'emoji_events',
    rarity: 'common',
  },
  {
    code: 'five_done',
    title: 'Assidu',
    desc: 'Terminer 5 challenges.',
    icon: 'military_tech',
    rarity: 'common',
  },
  {
    code: 'ten_done',
    title: 'Machine',
    desc: 'Terminer 10 challenges.',
    icon: 'workspace_premium',
    rarity: 'rare',
  },
  {
    code: 'done_25',
    title: 'Acharné',
    desc: 'Terminer 25 challenges.',
    icon: 'workspace_premium',
    rarity: 'epic',
  },
  {
    code: 'done_50',
    title: 'Titan',
    desc: 'Terminer 50 challenges.',
    icon: 'shield',
    rarity: 'legendary',
  },

  // ── Refaire / régularité ──
  {
    code: 'repeat_3',
    title: 'Habitude',
    desc: 'Terminer 3 défis sur le même exercice.',
    icon: 'repeat',
    rarity: 'common',
  },
  {
    code: 'repeat_5',
    title: 'Spécialiste',
    desc: 'Terminer 5 défis sur le même exercice.',
    icon: 'repeat_on',
    rarity: 'rare',
  },
  {
    code: 'repeat_10',
    title: 'Obsession',
    desc: 'Terminer 10 défis sur le même exercice.',
    icon: 'all_inclusive',
    rarity: 'epic',
  },
  {
    code: 'phoenix',
    title: 'Phénix',
    desc: 'Réussir un défi après en avoir abandonné un.',
    icon: 'local_fire_department',
    rarity: 'rare',
  },

  // ── Variété ──
  {
    code: 'variety_3',
    title: 'Touche-à-tout',
    desc: 'Des défis sur 3 exercices différents.',
    icon: 'category',
    rarity: 'common',
  },
  {
    code: 'variety_5',
    title: 'Polyvalent',
    desc: 'Des défis sur 5 exercices différents.',
    icon: 'diversity_3',
    rarity: 'rare',
  },
  {
    code: 'variety_8',
    title: 'Éclectique',
    desc: 'Des défis sur 8 exercices différents.',
    icon: 'grid_view',
    rarity: 'epic',
  },
  {
    code: 'all_formats',
    title: 'Caméléon',
    desc: 'Terminer un défi de chacun des 7 formats.',
    icon: 'dashboard_customize',
    rarity: 'legendary',
  },
  {
    code: 'multi_active',
    title: 'Multitâche',
    desc: '3 challenges menés en parallèle.',
    icon: 'dashboard',
    rarity: 'rare',
  },

  // ── Formats ──
  {
    code: 'pyramid_done',
    title: 'Pyramide',
    desc: 'Terminer un défi pyramidal.',
    icon: 'change_history',
    rarity: 'rare',
  },
  {
    code: 'pyramid_progressive_done',
    title: 'Architecte',
    desc: 'Terminer un défi pyramidal progressif.',
    icon: 'stacked_line_chart',
    rarity: 'rare',
  },
  {
    code: 'wave_done',
    title: 'Surfeur',
    desc: 'Terminer un défi en vagues.',
    icon: 'waves',
    rarity: 'rare',
  },
  {
    code: 'ramp_done',
    title: 'Ascension',
    desc: 'Terminer un défi en rampe min→max.',
    icon: 'trending_up',
    rarity: 'rare',
  },
  {
    code: 'cumulative_done',
    title: 'Fourmi',
    desc: 'Terminer un défi à objectif cumulé.',
    icon: 'functions',
    rarity: 'rare',
  },

  // ── Dépassement / rigueur ──
  {
    code: 'perfectionist',
    title: 'Perfectionniste',
    desc: 'Terminer un défi à 100 % (aucun jour raté).',
    icon: 'verified',
    rarity: 'rare',
  },
  {
    code: 'perfect_month',
    title: 'Mois parfait',
    desc: 'Un défi d’un mois sans rater un jour.',
    icon: 'verified',
    rarity: 'epic',
  },
  {
    code: 'century',
    title: '100 jours',
    desc: 'Terminer un défi de 100 jours.',
    icon: 'stars',
    rarity: 'epic',
  },
  {
    code: 'marathon',
    title: 'Marathonien',
    desc: 'Terminer un défi de 60 jours ou plus.',
    icon: 'directions_run',
    rarity: 'rare',
  },
  {
    code: 'carry_master',
    title: 'Bon gestionnaire',
    desc: 'Terminer un défi avec report réserve/dette.',
    icon: 'account_balance',
    rarity: 'rare',
  },
  {
    code: 'beat_record',
    title: 'Plus fort qu’hier',
    desc: 'Terminer un défi plus dur qu’un précédent sur le même exo.',
    icon: 'trending_up',
    rarity: 'epic',
  },
  {
    code: 'comeback',
    title: 'Comeback',
    desc: 'Finir un défi malgré des jours ratés.',
    icon: 'replay',
    rarity: 'rare',
  },

  // ── Cachés / fun ──
  {
    code: 'bullseye',
    title: 'Pile poil',
    desc: 'Atteindre exactement la cible d’un jour.',
    icon: 'gps_fixed',
    rarity: 'rare',
  },
  {
    code: 'surregime',
    title: 'Surrégime',
    desc: 'Faire au moins le double de l’objectif un jour.',
    icon: 'speed',
    rarity: 'epic',
  },
  {
    code: 'big_day',
    title: 'Grosse journée',
    desc: 'Faire 200 reps ou plus en une journée.',
    icon: 'whatshot',
    rarity: 'rare',
  },
];

export function achievementDef(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code);
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};
