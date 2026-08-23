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

// GEAR-GATÉ (2026‑08‑16) : refonte de philosophie — le but du jeu est de S'ÉQUIPER,
// donc à ton niveau : NU tu ne passes pas, gear basique tu galères, suréquipé tu passes
// tranquille. Avant, les donjons étaient calibrés « nu-clearable » (~90 % nu) → le gear
// ne servait qu'à pousser au-dessus. On applique une RAMPE de difficulté aux monstres
// (PV + dégâts) : ×1 sur le 1er donjon (AMORÇAGE : il faut pouvoir clear nu pour choper
// son 1er stuff → le gear ne vient que des donjons), montée rapide vers ×2 dès reco ~6.
// Calibré par simulation « stuff RÉEL accumulé aux taux de drop actuels » : nu échoue
// dès reco 3-4, stuff basique ~55-70 % (galère), stuff épique/lég ~cruise. La luck et
// l'or NE sont PAS touchés (seuls PV/dégâts scalent). Le 🎯 % live reflète auto la rampe.
// Rampe EARLY (×1 → ×2 de reco 2 à ~5, inchangée) PLUS une composante PROFONDE (reco > 24)
// qui continue de MONTER (2026‑08‑23, ticket bilan #3) : la puissance d'un build équipé
// croît plus vite que ×2 en fin de jeu (double affixe SS/SSS + 12→20 talents + sets) → sans
// ça, le contenu profond devenait trivial (100 % clear). La composante profonde recale la
// difficulté sur un build ÉQUIPÉ-à-son-niveau. (Le contenu NU reste calibré à part, cf.
// proceduralContent.test — la rampe est la couche gear-gated live appliquée par dungeonFoes.)
export function dungeonDifficultyMult(recoLevel: number): number {
  // EARLY (amorçage) : ×1 au 1er donjon → ×1.6 vers reco 5 (assez pour rendre le gear utile,
  // pas assez pour bloquer un build équipé — l'ancien ×2 rendait le early injouable même
  // équipé, cf. bilan). DEEP : monte régulièrement dès reco 20 puis PLATEAU ~×8, calibré
  // par sweep pour maintenir ~70 % de clear d'un build ÉQUIPÉ-à-son-niveau (le gear scale
  // ~×8 sur le nu en fin de jeu → sans ça, le contenu profond était trivial à 100 %).
  const early = 1 + Math.min(0.5, Math.max(0, recoLevel - 2) * 0.15);
  const deep = Math.min(6.5, Math.max(0, recoLevel - 20) * 0.145);
  return early + deep;
}

/** Convertit les ids de monstres d'un donjon en adversaires pour le moteur (PV/dégâts
 *  mis à l'échelle par la rampe gear-gated ; l'or reste inchangé). */
export function dungeonFoes(d: Dungeon): DungeonFoe[] {
  const mult = dungeonDifficultyMult(d.recoLevel);
  return d.monsterIds
    .map((id) => MONSTERS.find((m) => m.id === id))
    .filter((m): m is (typeof MONSTERS)[number] => !!m)
    .map((m) => ({
      combatant:
        mult === 1 ? m : { ...m, pv: Math.round(m.pv * mult), damage: Math.round(m.damage * mult) },
      gold: m.gold,
    }));
}

/** Or total possible d'un donjon (tous monstres vaincus). */
export function dungeonGold(d: Dungeon): number {
  return dungeonFoes(d).reduce((a, f) => a + f.gold, 0);
}
