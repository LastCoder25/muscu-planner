// bosses.ts — BOSS DE PALIER (données statiques front). Un boss tous les 5
// niveaux (5/10/15/20/25). Chacun a SON set (cf. ITEM_SETS) au pouvoir
// spécifique ; le battre lâche une pièce de ce set (slot aléatoire, niveau plein
// du palier → seule source de base gear au niveau du palier). Déblocage
// SÉQUENTIEL : il faut avoir vaincu le boss précédent au moins une fois + être
// au niveau requis. Combat SOLO (un seul adversaire, PV/dégâts CALIBRÉS par
// simulation → ~60 % de win pour un build moyen au palier, quasi impossible deux
// niveaux en dessous). Distinct du boss communautaire hebdo (world boss).
import type { Combatant } from '@/lib/combat';

export interface MilestoneBoss {
  id: string;
  name: string;
  emoji: string;
  unlockLevel: number; // palier de niveau requis
  energyCost: number; // coût d'une tentative (win ou lose)
  gold: number; // or de base gagné à la victoire
  setId: string; // set dont il lâche les pièces (cf. ITEM_SETS)
  dropLevel: number; // niveau PLEIN de la pièce lâchée (= palier)
  hint: string; // conseil « coach »
  combatant: Omit<Combatant, 'dmgReduction' | 'lifesteal'>; // stats du boss pour le moteur
}

export const BOSSES: MilestoneBoss[] = [
  {
    id: 'golem_ancestral',
    name: 'Golem ancestral',
    emoji: '🗿',
    unlockLevel: 5,
    energyCost: 30,
    gold: 120,
    setId: 'golem',
    dropLevel: 5,
    hint: 'Un mur de pierre. Il faut des PV (Endurance) pour tenir et cogner longtemps.',
    combatant: {
      name: 'Golem ancestral',
      pv: 380,
      damage: 72,
      crit: 0.05,
      dodge: 0.05,
      initiative: 8,
    },
  },
  {
    id: 'dragon_primordial',
    name: 'Dragon primordial',
    emoji: '🐲',
    unlockLevel: 10,
    energyCost: 60,
    gold: 300,
    setId: 'dragon',
    dropLevel: 10,
    hint: 'Frappe fort et crit souvent → gros dégâts (Puissance) pour l’abattre vite.',
    combatant: {
      name: 'Dragon primordial',
      pv: 1410,
      damage: 286,
      crit: 0.12,
      dodge: 0.08,
      initiative: 22,
    },
  },
  {
    id: 'liche_couronnee',
    name: 'Liche couronnée',
    emoji: '💀',
    unlockLevel: 15,
    energyCost: 100,
    gold: 550,
    setId: 'lich',
    dropLevel: 15,
    hint: 'Esquive beaucoup → Agilité pour la toucher, et des PV pour encaisser ses sorts.',
    combatant: {
      name: 'Liche couronnée',
      pv: 4750,
      damage: 491,
      crit: 0.15,
      dodge: 0.18,
      initiative: 28,
    },
  },
  {
    id: 'titan_du_neant',
    name: 'Titan du Néant',
    emoji: '🌌',
    unlockLevel: 20,
    energyCost: 150,
    gold: 900,
    setId: 'void',
    dropLevel: 20,
    hint: 'Un colosse : dégâts énormes. Build complet, un maximum de PV.',
    combatant: {
      name: 'Titan du Néant',
      pv: 7420,
      damage: 1106,
      crit: 0.1,
      dodge: 0.06,
      initiative: 16,
    },
  },
  {
    id: 'archidemon',
    name: 'Archidémon',
    emoji: '🔥',
    unlockLevel: 25,
    energyCost: 220,
    gold: 1500,
    setId: 'apocalypse',
    dropLevel: 25,
    hint: 'End-game absolu. Tout à fond, PV au max, et un peu de chance.',
    combatant: {
      name: 'Archidémon',
      pv: 16000,
      damage: 1202,
      crit: 0.15,
      dodge: 0.08,
      initiative: 26,
    },
  },
];
