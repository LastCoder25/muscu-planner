// dungeons.ts — donjons (données statiques front). Un donjon = une suite de
// monstres pour un coût d'énergie fixe. recoLevel CALIBRÉ par simulation (le
// donjon devient nettoyable ~systématiquement à ce niveau). Le loot SCALE avec
// le donjon : `dropLevel` (niveau de base des objets) et `dropLuck` (biais de
// rareté 0..1) → les donjons durs récompensent mieux.
import type { DungeonFoe } from '@/lib/combat';
import { MONSTERS } from '@/data/monsters';
import { PROCEDURAL } from '@/lib/proceduralContent';

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

const HAND_DUNGEONS: Dungeon[] = [
  {
    id: 'clairiere',
    name: 'Clairière tranquille',
    emoji: '🌿',
    tier: 1,
    energyCost: 20,
    // Donjon TUTORIEL : clearable NU par un débutant (retrait du Loup) → amorce la
    // boucle de gear (le gear ne vient que des donjons). 2 Gluants seulement.
    monsterIds: ['slime', 'slime'],
    recoLevel: 1,
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
    energyCost: 26,
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
    energyCost: 32,
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
    energyCost: 40,
    monsterIds: ['ogre', 'spectre', 'golem'],
    recoLevel: 7,
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
    energyCost: 46,
    monsterIds: ['troll', 'ogre', 'spectre'],
    recoLevel: 8,
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
    energyCost: 52,
    monsterIds: ['dragon', 'troll'],
    recoLevel: 9,
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
    energyCost: 58,
    monsterIds: ['titan', 'dragon'],
    recoLevel: 10,
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
    energyCost: 64,
    monsterIds: ['archdemon', 'titan'],
    recoLevel: 11,
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
    energyCost: 70,
    // Trio ESCALADANT (variété + montée en tension) au lieu de 3× le même monstre.
    monsterIds: ['archdemon', 'chimere', 'hydre'],
    recoLevel: 13,
    hintStat: 'endurance',
    hint: 'Ça monte crescendo jusqu’à l’hydre → des PV (Endurance) pour tenir la fin.',
    dropLevel: 11,
    dropLuck: 1,
  },
  {
    id: 'hydre_marais',
    name: 'Marais de l’Hydre',
    emoji: '🐍',
    tier: 10,
    energyCost: 76,
    monsterIds: ['chimere', 'hydre', 'behemoth'],
    recoLevel: 15,
    hintStat: 'puissance',
    hint: 'Des murs de PV de plus en plus épais → grosse Puissance (muscu) pour percer.',
    dropLevel: 13,
    dropLuck: 1,
  },
  {
    id: 'behemoth_caverne',
    name: 'Caverne du Béhémoth',
    emoji: '🦏',
    tier: 11,
    energyCost: 80,
    monsterIds: ['hydre', 'behemoth', 'leviathan'],
    recoLevel: 17,
    hintStat: 'puissance',
    hint: 'Colosses increvables, du plus rapide au plus lourd → Puissance pour percer, PV pour durer.',
    dropLevel: 15,
    dropLuck: 1,
  },
  {
    id: 'leviathan_fosse',
    name: 'Fosse du Léviathan',
    emoji: '🐙',
    tier: 12,
    energyCost: 84,
    monsterIds: ['behemoth', 'leviathan', 'kraken'],
    recoLevel: 19,
    hintStat: 'endurance',
    hint: 'Ils frappent et encaissent, de pire en pire → build complet, beaucoup de PV.',
    dropLevel: 17,
    dropLuck: 1,
  },
  {
    id: 'kraken_abysses',
    name: 'Abysses du Kraken',
    emoji: '🦑',
    tier: 13,
    energyCost: 88,
    monsterIds: ['leviathan', 'kraken', 'liche_seigneur'],
    recoLevel: 20,
    hintStat: 'endurance',
    hint: 'Tentacules puis nécromancie → PV au max obligatoires jusqu’au bout.',
    dropLevel: 19,
    dropLuck: 1,
  },
  {
    id: 'necropole',
    name: 'Nécropole du Seigneur-liche',
    emoji: '☠️',
    tier: 14,
    energyCost: 92,
    monsterIds: ['kraken', 'liche_seigneur', 'chaos'],
    recoLevel: 21,
    hintStat: 'puissance',
    hint: 'Jusqu’à l’Avatar du Chaos → gros PV et Puissance pour l’abattre vite.',
    dropLevel: 21,
    dropLuck: 1,
  },
  {
    id: 'faille_chaos',
    name: 'Faille du Chaos',
    emoji: '👁️',
    tier: 15,
    energyCost: 96,
    monsterIds: ['liche_seigneur', 'chaos', 'chaos'],
    recoLevel: 22,
    hintStat: 'endurance',
    hint: 'Le contenu le plus profond, deux Avatars du Chaos au bout : build complet, tout au max.',
    dropLevel: 23,
    dropLuck: 1,
  },
];

// Coût d'énergie d'un run PLAFONNÉ (2026‑08‑16) : un run coûte ~pareil quel que soit
// le niveau du donjon. Le coût énergie n'a qu'un rôle — lier le jeu au volume
// d'entraînement (~10 runs/séance) — et ce lien doit être CONSTANT, pas punir la
// progression (le coût brut montait 20→96→384 en procédural → ~1 run/séance en
// end-game). La difficulté vient du CONTENU (monstres), pas du prix d'entrée. Early
// garde sa rampe douce (20→40) ; tout ce qui dépasse est ramené à 40.
export const DUNGEON_ENERGY_CAP = 40;

// Biais de rareté du butin (`dropLuck`) DÉRIVÉ de la profondeur, montée PROGRESSIVE
// sur toute la plage (2026‑08‑16) : avant, il atteignait 1,0 dès reco 11 (apocalypse)
// → un joueur niv.11-15 croulait déjà sous l'épique. Désormais `(reco-1)/45` → reco1=0,
// reco15≈0,31, reco20≈0,42, luck 1,0 seulement vers reco 46. Combiné à `rollRarity`
// (avare en bas), une passe jusqu'au niv.15 donne ~surtout du commun + un peu de rare +
// épique rare ; l'épique/légendaire devient une chasse de mi/fin de partie.
const DROP_LUCK_DIVISOR = 45;

// Donjons complets = écrits à la main (reco 1→22) + PROCÉDURAUX (reco 25→94). Le coût
// d'énergie est plafonné et le dropLuck re-dérivé de la profondeur (courbe douce).
export const DUNGEONS: Dungeon[] = [...HAND_DUNGEONS, ...PROCEDURAL.dungeons].map((d) => ({
  ...d,
  energyCost: Math.min(DUNGEON_ENERGY_CAP, d.energyCost),
  dropLuck: Math.min(1, Math.max(0, (d.recoLevel - 1) / DROP_LUCK_DIVISOR)),
}));

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
