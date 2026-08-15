// bosses.ts — BOSS DE PALIER (données statiques front). Un boss tous les 5
// niveaux (5/10/15/20/25). Chacun a SON set (cf. ITEM_SETS) au pouvoir
// spécifique ; le battre lâche une pièce de ce set (slot aléatoire, niveau plein
// du palier → seule source de base gear au niveau du palier). Déblocage
// SÉQUENTIEL : il faut avoir vaincu le boss précédent au moins une fois (plus de
// gate de niveau — cf. déblocage découplé). Combat SOLO (un seul adversaire).
// PV/dégâts RE-CALIBRÉS par simulation pour le MODÈLE DE COMBAT 3-piliers
// (2026‑08‑09, cf. combat.ts) : profils calés en gear de donjon au palier →
// l'ÉQUILIBRÉ (muscu+cardio) est le meilleur (~90 %), le muscu pur viable
// (~55-90 %), le coureur pur viable au début et plus juste en fin de jeu
// (rattrapable via gear/niveau — le 🎯 % de victoire prévient). PV modéré /
// dégâts élevés = check de SURVIE (pas un mur de PV qui tuerait le coureur).
// Distinct du boss communautaire hebdo (world boss).
import type { Combatant } from '@/lib/combat';
import { PROCEDURAL } from '@/lib/proceduralContent';

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

const HAND_BOSSES: MilestoneBoss[] = [
  {
    id: 'golem_ancestral',
    name: 'Golem ancestral',
    emoji: '🗿',
    unlockLevel: 5,
    energyCost: 36,
    gold: 120,
    setId: 'golem',
    dropLevel: 5,
    hint: 'Un mur de pierre. Il faut des PV (Endurance) pour tenir et cogner longtemps.',
    combatant: {
      name: 'Golem ancestral',
      pv: 700,
      damage: 130,
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
    energyCost: 68,
    gold: 300,
    setId: 'dragon',
    dropLevel: 10,
    hint: 'Frappe fort et crit souvent → gros dégâts (Puissance) pour l’abattre vite.',
    combatant: {
      name: 'Dragon primordial',
      pv: 2700,
      damage: 620,
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
    energyCost: 82,
    gold: 550,
    setId: 'lich',
    dropLevel: 15,
    hint: 'Esquive beaucoup → Agilité pour la toucher, et des PV pour encaisser ses sorts.',
    combatant: {
      name: 'Liche couronnée',
      pv: 11500,
      damage: 1100,
      crit: 0.15,
      dodge: 0.12,
      initiative: 28,
    },
  },
  {
    id: 'titan_du_neant',
    name: 'Titan du Néant',
    emoji: '🌌',
    unlockLevel: 20,
    energyCost: 90,
    gold: 900,
    setId: 'void',
    dropLevel: 20,
    hint: 'Un colosse : dégâts énormes. Build complet, un maximum de PV.',
    combatant: {
      name: 'Titan du Néant',
      // Dégâts relevés (1800→2600) : il était trivialisé une fois équipé (dmg trop
      // bas pour menacer un joueur en gear du palier, cf. simulation globale 2026‑08‑15).
      pv: 32000,
      damage: 2600,
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
    energyCost: 100,
    gold: 1500,
    setId: 'apocalypse',
    dropLevel: 25,
    hint: 'End-game absolu. Tout à fond, PV au max, et un peu de chance.',
    combatant: {
      name: 'Archidémon',
      pv: 45000,
      damage: 2900,
      crit: 0.15,
      dodge: 0.08,
      initiative: 26,
    },
  },
];

// Boss complets = écrits à la main (paliers 5→25) + PROCÉDURAUX (30→100).
export const BOSSES: MilestoneBoss[] = [...HAND_BOSSES, ...PROCEDURAL.bosses];
