// dungeons.ts — donjons (données statiques front). Un donjon = une suite de
// monstres pour un coût d'énergie fixe. recoLevel CALIBRÉ par simulation (le
// donjon devient nettoyable ~systématiquement à ce niveau). Le loot SCALE avec
// le donjon : `dropLevel` (niveau de base des objets) et `dropLuck` (biais de
// rareté 0..1) → les donjons durs récompensent mieux.
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
  recoLevel: number; // niveau conseillé (calibré par simulation)
  hintStat: StatKey; // stat clé pour ce donjon
  hint: string; // conseil « coach »
  dropLevel: number; // niveau des objets lâchés (fixé par le donjon, découplé du joueur)
  dropLuck: number; // biais de rareté du butin (0 = normal … 1 = très généreux)
}
// NB : les SETS ne droppent plus sur les donjons — uniquement sur les BOSS de
// palier (cf. src/data/bosses.ts). Les donjons ne lâchent que du butin normal.

export const DUNGEONS: Dungeon[] = [
  {
    id: 'clairiere',
    name: 'Clairière tranquille',
    emoji: '🌿',
    tier: 1,
    energyCost: 25,
    monsterIds: ['slime', 'slime', 'wolf'],
    recoLevel: 2,
    hintStat: 'endurance',
    hint: 'Idéal pour débuter. Un peu d’Endurance suffit à tenir la distance.',
    dropLevel: 1,
    dropLuck: 0,
  },
  {
    id: 'caverne',
    name: 'Caverne sombre',
    emoji: '🕳️',
    tier: 2,
    energyCost: 40,
    monsterIds: ['wolf', 'boar', 'golem'],
    recoLevel: 4,
    hintStat: 'puissance',
    hint: 'Le golem du fond encaisse beaucoup → pousse ta Puissance (muscu).',
    dropLevel: 3,
    dropLuck: 0.1,
  },
  {
    id: 'repaire',
    name: 'Repaire de l’ogre',
    emoji: '🏚️',
    tier: 3,
    energyCost: 55,
    monsterIds: ['golem', 'ogre'],
    recoLevel: 5,
    hintStat: 'endurance',
    hint: 'Ça frappe très fort → il te faut des PV, donc de l’Endurance.',
    dropLevel: 4,
    dropLuck: 0.2,
  },
  {
    id: 'cryptes',
    name: 'Cryptes hantées',
    emoji: '⚰️',
    tier: 4,
    energyCost: 75,
    monsterIds: ['ogre', 'spectre', 'golem'],
    recoLevel: 6,
    hintStat: 'agilite',
    hint: 'Le spectre esquive beaucoup → Agilité pour toucher, PV pour durer.',
    dropLevel: 5,
    dropLuck: 0.35,
  },
  {
    id: 'fournaise',
    name: 'Fournaise du troll',
    emoji: '🌋',
    tier: 5,
    energyCost: 95,
    monsterIds: ['troll', 'ogre', 'spectre'],
    recoLevel: 7,
    hintStat: 'puissance',
    hint: 'Le troll est une montagne de PV → grosse Puissance (muscu) requise.',
    dropLevel: 6,
    dropLuck: 0.5,
  },
  {
    id: 'abime',
    name: 'Abîme du dragon',
    emoji: '🐉',
    tier: 6,
    energyCost: 120,
    monsterIds: ['dragon', 'troll'],
    recoLevel: 8,
    hintStat: 'endurance',
    hint: 'Le dragon frappe et crit fort → build complet, beaucoup de PV.',
    dropLevel: 7,
    dropLuck: 0.7,
  },
  {
    id: 'neant',
    name: 'Néant primordial',
    emoji: '🌌',
    tier: 7,
    energyCost: 150,
    monsterIds: ['titan', 'dragon'],
    recoLevel: 9,
    hintStat: 'puissance',
    hint: 'Le défi ultime : le titan est un mur. Tout à fond, surtout la Puissance.',
    dropLevel: 8,
    dropLuck: 0.9,
  },
  {
    id: 'apocalypse',
    name: 'Trône de l’Apocalypse',
    emoji: '🔥',
    tier: 8,
    energyCost: 190,
    monsterIds: ['archdemon', 'titan'],
    recoLevel: 10,
    hintStat: 'endurance',
    hint: 'End-game absolu : l’Archidémon frappe et crit très fort → build complet, PV au max.',
    dropLevel: 9,
    dropLuck: 1,
  },
  // ── Donjons haut-niveau (reco 12→24) — monstres calibrés par simulation.
  // dropLevel élevé → les objets de donjon peuvent rivaliser avec les pièces de
  // set (dont niveau = palier) : à un moment, un bon drop vaut de casser le set.
  {
    id: 'chimere_den',
    name: 'Antre de la Chimère',
    emoji: '🦁',
    tier: 9,
    energyCost: 230,
    monsterIds: ['chimere', 'chimere', 'chimere'],
    recoLevel: 12,
    hintStat: 'endurance',
    hint: 'Meute de chimères → il faut des PV pour tenir les trois.',
    dropLevel: 11,
    dropLuck: 1,
  },
  {
    id: 'hydre_marais',
    name: 'Marais de l’Hydre',
    emoji: '🐍',
    tier: 10,
    energyCost: 260,
    monsterIds: ['hydre', 'hydre', 'hydre'],
    recoLevel: 14,
    hintStat: 'puissance',
    hint: 'Des murs de PV → grosse Puissance (muscu) pour percer.',
    dropLevel: 13,
    dropLuck: 1,
  },
  {
    id: 'behemoth_caverne',
    name: 'Caverne du Béhémoth',
    emoji: '🦏',
    tier: 11,
    energyCost: 310,
    monsterIds: ['behemoth', 'behemoth', 'behemoth'],
    recoLevel: 16,
    hintStat: 'puissance',
    hint: 'Colosses increvables → Puissance pour percer, PV pour durer.',
    dropLevel: 15,
    dropLuck: 1,
  },
  {
    id: 'leviathan_fosse',
    name: 'Fosse du Léviathan',
    emoji: '🐙',
    tier: 12,
    energyCost: 340,
    monsterIds: ['leviathan', 'leviathan', 'leviathan'],
    recoLevel: 18,
    hintStat: 'endurance',
    hint: 'Ils frappent et encaissent → build complet, beaucoup de PV.',
    dropLevel: 17,
    dropLuck: 1,
  },
  {
    id: 'kraken_abysses',
    name: 'Abysses du Kraken',
    emoji: '🦑',
    tier: 13,
    energyCost: 360,
    monsterIds: ['kraken', 'kraken', 'kraken'],
    recoLevel: 20,
    hintStat: 'endurance',
    hint: 'Tentacules dévastatrices → PV au max obligatoires.',
    dropLevel: 19,
    dropLuck: 1,
  },
  {
    id: 'necropole',
    name: 'Nécropole du Seigneur-liche',
    emoji: '☠️',
    tier: 14,
    energyCost: 400,
    monsterIds: ['liche_seigneur', 'liche_seigneur', 'liche_seigneur'],
    recoLevel: 22,
    hintStat: 'puissance',
    hint: 'Dégâts terribles → gros PV et Puissance pour les abattre vite.',
    dropLevel: 21,
    dropLuck: 1,
  },
  {
    id: 'faille_chaos',
    name: 'Faille du Chaos',
    emoji: '👁️',
    tier: 15,
    energyCost: 440,
    monsterIds: ['chaos', 'chaos', 'chaos'],
    recoLevel: 24,
    hintStat: 'endurance',
    hint: 'Le contenu le plus profond : build complet, tout au max.',
    dropLevel: 23,
    dropLuck: 1,
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
