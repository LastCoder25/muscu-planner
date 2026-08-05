// monsters.ts — bestiaire (données statiques front). Phase 2a : quelques monstres
// pour le combat d'essai. Chaque monstre suggère la stat à travailler (« coach »).
import type { Combatant } from '@/lib/combat';

export interface Monster extends Combatant {
  id: string;
  emoji: string;
  tier: number; // palier de difficulté
  energyCost: number; // énergie dépensée pour le combattre
  gold: number; // or gagné en cas de victoire
  hint: string; // conseil « coach » : quelle stat pousser
}

export const MONSTERS: Monster[] = [
  {
    id: 'slime',
    name: 'Gluant',
    emoji: '🟢',
    tier: 1,
    pv: 60,
    damage: 7,
    crit: 0.02,
    dodge: 0.02,
    initiative: 5,
    energyCost: 10,
    gold: 20,
    hint: 'Un bon échauffement. Presque tout le monde le bat.',
  },
  {
    id: 'wolf',
    name: 'Loup affamé',
    emoji: '🐺',
    tier: 2,
    pv: 130,
    damage: 14,
    crit: 0.08,
    dodge: 0.1,
    initiative: 20,
    energyCost: 15,
    gold: 45,
    hint: 'Rapide et fuyant → pousse ton Agilité (cardio) pour l’esquiver.',
  },
  {
    id: 'golem',
    name: 'Golem de pierre',
    emoji: '🗿',
    tier: 3,
    pv: 260,
    damage: 22,
    crit: 0.03,
    dodge: 0.01,
    initiative: 8,
    energyCost: 20,
    gold: 90,
    hint: 'Énorme sac à PV → monte ta Puissance (muscu) pour l’entamer.',
  },
  {
    id: 'ogre',
    name: 'Ogre brutal',
    emoji: '👹',
    tier: 4,
    pv: 340,
    damage: 34,
    crit: 0.1,
    dodge: 0.03,
    initiative: 12,
    energyCost: 25,
    gold: 150,
    hint: 'Frappe fort → il te faut de l’Endurance (PV) pour encaisser.',
  },
];
