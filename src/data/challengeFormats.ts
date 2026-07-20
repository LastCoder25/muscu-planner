// Catalogue des formats de challenge + durées proposées.
import type { ChallengeFormat } from '@/lib/challenges';

export interface FormatOption {
  id: ChallengeFormat;
  name: string;
  desc: string;
  icon: string;
  fields: string[]; // champs de config à régler
}

export const CHALLENGE_FORMATS: FormatOption[] = [
  { id: 'fixed', name: 'Fixe', desc: "Même objectif chaque jour.", icon: 'drag_handle', fields: ['start'] },
  { id: 'progressive', name: 'Progressif', desc: "Basé sur ton MAX : +3 à 15 % par jour.", icon: 'trending_up', fields: ['max', 'start_coef', 'inc_pct'] },
  { id: 'pyramid', name: 'Pyramide', desc: "Montée jusqu'à un pic au milieu puis redescente.", icon: 'change_history', fields: ['start', 'peak'] },
  { id: 'pyramid_progressive', name: 'Pyramidal progressif', desc: "Pyramides répétées dont le pic monte à chaque cycle.", icon: 'stacked_line_chart', fields: ['start', 'peak', 'increment', 'cycle_days'] },
  { id: 'wave', name: 'Vagues', desc: "Cycles de montée avec un jour de décharge.", icon: 'waves', fields: ['start', 'increment', 'cycle_days', 'deload_pct'] },
  { id: 'cumulative', name: 'Objectif cumulé', desc: "Un total à atteindre sur la durée, à ton rythme.", icon: 'functions', fields: ['total'] },
];

export function formatOption(id: string): FormatOption | undefined {
  return CHALLENGE_FORMATS.find((f) => f.id === id);
}

export const DURATIONS = [7, 14, 21, 30, 100];

// Exos proposés en premier pour un challenge (poids du corps, faciles/cardio).
export const CHALLENGE_SUGGESTIONS = [
  'ex_jump_rope', 'ex_pushup', 'ex_dips', 'ex_bw_squat', 'ex_burpees', 'ex_jumping_jacks',
  'ex_mountain_climbers', 'ex_high_knees', 'ex_squat_jump', 'ex_bw_lunge', 'ex_wall_sit',
  'ex_crunch', 'ex_plank', 'ex_diamond_pushup', 'ex_superman', 'ex_pullup',
];
