// tennis.ts — libellés FR et presets pour les drills de tennis (côté UI).
// La logique de génération vit dans src/lib/drills.ts (pure). Ici : traductions
// des énumérations du contrat + liste des thèmes proposés dans le wizard.
import type { DrillCategory, DrillShot } from '@/lib/types';

export const DRILL_CATEGORY_LABELS: Record<DrillCategory, string> = {
  echauffement: 'Échauffement',
  fond_de_court: 'Fond de court',
  service_retour: 'Service / retour',
  volee: 'Volée',
  deplacement: 'Déplacement',
  jeu: 'Jeu',
  retour_au_calme: 'Retour au calme',
};

export const DRILL_SHOT_LABELS: Record<DrillShot, string> = {
  coup_droit: 'Coup droit',
  revers: 'Revers',
  service: 'Service',
  volee: 'Volée',
  smash: 'Smash',
  mixte: 'Mixte',
};

export const DRILL_PATTERN_LABELS: Record<string, string> = {
  diagonale: 'Diagonale',
  longue_ligne: 'Longue ligne',
  croise: 'Croisé',
  decroise: 'Décroisé',
  montee_volee: 'Montée-volée',
};

export const DRILL_FOCUS_LABELS: Record<string, string> = {
  technique: 'Technique',
  tactique: 'Tactique',
  physique: 'Physique',
  regularite: 'Régularité',
  puissance: 'Puissance',
};

// Thèmes proposés au wizard. `id` doit correspondre à THEME_SPECS (src/lib/drills.ts).
export interface ThemeOption {
  id: string;
  label: string;
  icon: string; // material icon
  desc: string;
}

export const TENNIS_THEMES: ThemeOption[] = [
  {
    id: 'complet',
    label: 'Séance complète',
    icon: 'all_inclusive',
    desc: 'Un peu de tout : fond de court, service, volée, jeu.',
  },
  {
    id: 'coup_droit',
    label: 'Coup droit',
    icon: 'sports_tennis',
    desc: 'Diagonales, longue ligne, décroisés en coup droit.',
  },
  {
    id: 'revers',
    label: 'Revers',
    icon: 'sports_tennis',
    desc: 'Diagonales et longue ligne en revers.',
  },
  {
    id: 'service',
    label: 'Service',
    icon: 'sports_tennis',
    desc: 'Service par zones, effets, service + 1er coup.',
  },
  {
    id: 'volee',
    label: 'Volée / filet',
    icon: 'sports_tennis',
    desc: 'Volées, montée-volée, smash, passing.',
  },
  {
    id: 'jeu',
    label: 'Jeu / match',
    icon: 'emoji_events',
    desc: 'Points et situations de match (avec partenaire).',
  },
  {
    id: 'physique',
    label: 'Physique',
    icon: 'directions_run',
    desc: 'Déplacements, sprints, intensité sur le court.',
  },
];

export function formatDrillTarget(mode: string, value: number, sets: number): string {
  if (mode === 'balls') return `${value} balles${sets > 1 ? ` × ${sets}` : ''}`;
  if (mode === 'time') {
    const m = Math.round(value / 60);
    return `${m} min${sets > 1 ? ` × ${sets}` : ''}`;
  }
  return `${value} reps${sets > 1 ? ` × ${sets}` : ''}`;
}
