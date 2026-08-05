// dungeons.ts — donjons (données statiques front). Un donjon = une suite de
// monstres (du bestiaire) pour un coût d'énergie fixe. Le `hint` oriente vers
// la stat à travailler (« coach »).
import type { DungeonFoe } from '@/lib/combat';
import { MONSTERS } from '@/data/monsters';

export type StatKey = 'puissance' | 'endurance' | 'agilite';

export interface Dungeon {
  id: string;
  name: string;
  emoji: string;
  tier: number;
  energyCost: number;
  monsterIds: string[];
  recoLevel: number; // niveau conseillé
  hintStat: StatKey; // stat clé pour ce donjon
  hint: string; // conseil « coach »
}

export const DUNGEONS: Dungeon[] = [
  {
    id: 'clairiere',
    name: 'Clairière tranquille',
    emoji: '🌿',
    tier: 1,
    energyCost: 25,
    monsterIds: ['slime', 'slime', 'wolf'],
    recoLevel: 3,
    hintStat: 'endurance',
    hint: 'Idéal pour débuter. Un peu d’Endurance suffit à tenir la distance.',
  },
  {
    id: 'caverne',
    name: 'Caverne sombre',
    emoji: '🕳️',
    tier: 2,
    energyCost: 40,
    monsterIds: ['wolf', 'wolf', 'golem'],
    recoLevel: 6,
    hintStat: 'puissance',
    hint: 'Le golem du fond encaisse beaucoup → pousse ta Puissance (muscu).',
  },
  {
    id: 'repaire',
    name: 'Repaire de l’ogre',
    emoji: '🏚️',
    tier: 3,
    energyCost: 55,
    monsterIds: ['golem', 'ogre'],
    recoLevel: 10,
    hintStat: 'endurance',
    hint: 'Ça frappe très fort → il te faut des PV, donc de l’Endurance.',
  },
];

/** Convertit les ids de monstres d'un donjon en adversaires pour le moteur. */
export function dungeonFoes(d: Dungeon): DungeonFoe[] {
  return d.monsterIds
    .map((id) => MONSTERS.find((m) => m.id === id))
    .filter((m): m is (typeof MONSTERS)[number] => !!m)
    .map((m) => ({ combatant: m, gold: m.gold }));
}

/** Or total possible d'un donjon (tous monstres vaincus). */
export function dungeonGold(d: Dungeon): number {
  return dungeonFoes(d).reduce((a, f) => a + f.gold, 0);
}
