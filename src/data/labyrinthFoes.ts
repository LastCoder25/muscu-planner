// labyrinthFoes.ts — variété du Labyrinthe (pur/testable). Avant : tous les monstres
// étaient un « Rôdeur » 👾 clone (seules les stats montaient) → rébarbatif. Ici :
//  1) un ROSTER THÉMATIQUE par palier (G→SSS) : chaque salle tire une créature nommée ;
//  2) des ARCHÉTYPES DE COMPORTEMENT qui redistribuent la menace autour de la baseline
//     (assassin fragile/crit, brute lente, colosse tank, sangsue qui se soigne, vif
//     multi-frappe) → chaque combat se JOUE différemment, pas seulement des stats en plus ;
//  3) un GARDIEN D'ÉTAGE NOMMÉ par palier (mini-boss).
// Les archétypes se mappent sur `MonsterArchetype` (CombatStage → aura + tag « féroce/
// brutal/colosse/insaisissable »). Seules des stats SUPPORTÉES par le combat côté monstre
// sont utilisées (pv/dégâts/crit/esquive/frappes/vol de vie — thorns/rage sont joueur-only).
import type { MonsterArchetype } from './monsters';

// Un archétype = un profil de combat. Les *Mult s'appliquent à la baseline (pv/dégâts) ;
// crit/dodge sont des valeurs de base (un petit terme de profondeur s'ajoute au runtime).
export interface LabyArchetype {
  id: string;
  label: string; // libellé court (info-bulle / futur affichage)
  arch: MonsterArchetype; // identité visuelle CombatStage (aura + tag)
  pvMult: number;
  dmgMult: number;
  crit: number;
  dodge: number;
  strikes?: number;
  lifesteal?: number;
  weight: number; // pondération de tirage (le Rôdeur reste le plus commun)
}

// Redistribution ~iso-menace : un archétype ne doit pas casser l'équilibrage (calibré
// pour rester dans la même fourchette de difficulté que l'ancien Rôdeur), juste changer
// le FEEL. Somme des poids = 11.
export const LABY_ARCHETYPES: LabyArchetype[] = [
  {
    id: 'rodeur',
    label: 'rôdeur',
    arch: 'normal',
    pvMult: 1,
    dmgMult: 1,
    crit: 0.05,
    dodge: 0.04,
    weight: 3,
  },
  {
    id: 'assassin',
    label: 'assassin',
    arch: 'evasive',
    pvMult: 0.6,
    dmgMult: 1.1,
    crit: 0.2,
    dodge: 0.15,
    weight: 2,
  }, // fragile, crit+esquive → à burst
  {
    id: 'brute',
    label: 'brute',
    arch: 'brute',
    pvMult: 0.9,
    dmgMult: 1.55,
    crit: 0.03,
    dodge: 0,
    weight: 2,
  }, // frappe fort, lent
  {
    id: 'colosse',
    label: 'colosse',
    arch: 'tank',
    pvMult: 2.2,
    dmgMult: 0.5,
    crit: 0.02,
    dodge: 0,
    weight: 2,
  }, // sac à PV, tape mou
  {
    id: 'sangsue',
    label: 'sangsue',
    arch: 'striker',
    pvMult: 1.15,
    dmgMult: 0.9,
    crit: 0.06,
    dodge: 0.04,
    lifesteal: 0.45,
    weight: 1,
  }, // se soigne → tuer vite
  {
    id: 'vif',
    label: 'vif',
    arch: 'evasive',
    pvMult: 0.75,
    dmgMult: 0.7,
    crit: 0.08,
    dodge: 0.12,
    strikes: 2,
    weight: 1,
  }, // multi-frappe, insaisissable
];

// Gardien d'étage : archétype signature (frappeur costaud + crit) — le ×PV de boss est
// déjà appliqué par makeMonster ; ici juste le profil offensif marquant.
export const GUARDIAN_ARCH: LabyArchetype = {
  id: 'gardien',
  label: 'gardien',
  arch: 'striker',
  pvMult: 1,
  dmgMult: 1.15,
  crit: 0.15,
  dodge: 0.05,
  weight: 0,
};

export interface LabyFoeKind {
  name: string;
  emoji: string;
}

// Roster par palier (index 0..9 = G..SSS), thème croissant : nuisibles → bêtes →
// morts-vivants → abysses → élémentaires → démons → horreurs → astral → néant → cauchemars.
export const LABY_ROSTERS: LabyFoeKind[][] = [
  [
    { name: 'Rat des galeries', emoji: '🐀' },
    { name: 'Araignée grise', emoji: '🕷️' },
    { name: 'Chauve-souris', emoji: '🦇' },
    { name: 'Serpent des ombres', emoji: '🐍' },
  ],
  [
    { name: 'Loup errant', emoji: '🐺' },
    { name: 'Sanglier furieux', emoji: '🐗' },
    { name: 'Scorpion venimeux', emoji: '🦂' },
    { name: 'Varan mordant', emoji: '🦎' },
  ],
  [
    { name: 'Squelette', emoji: '💀' },
    { name: 'Goule affamée', emoji: '🧟' },
    { name: 'Tisseuse d’os', emoji: '🕸️' },
    { name: 'Revenant', emoji: '🦴' },
  ],
  [
    { name: 'Rampant des abysses', emoji: '🦑' },
    { name: 'Étreigneur', emoji: '🐙' },
    { name: 'Essaim grouillant', emoji: '🦟' },
    { name: 'Vase corrosive', emoji: '🫧' },
  ],
  [
    { name: 'Élémentaire de feu', emoji: '🔥' },
    { name: 'Golem de pierre', emoji: '🪨' },
    { name: 'Fulgur', emoji: '⚡' },
    { name: 'Spectre glacial', emoji: '🌫️' },
  ],
  [
    { name: 'Oni', emoji: '👹' },
    { name: 'Diablotin', emoji: '😈' },
    { name: 'Sangsue d’ombre', emoji: '🩸' },
    { name: 'Liche mineure', emoji: '🕯️' },
  ],
  [
    { name: 'Tengu du chaos', emoji: '👺' },
    { name: 'Wyverne', emoji: '🐉' },
    { name: 'Œil du chaos', emoji: '🧿' },
    { name: 'Mère-couvée', emoji: '🕷️' },
  ],
  [
    { name: 'Séraphin déchu', emoji: '🌟' },
    { name: 'Sentinelle astrale', emoji: '👁️' },
    { name: 'Aberration', emoji: '🌀' },
    { name: 'Comète vivante', emoji: '☄️' },
  ],
  [
    { name: 'Dévoreur du néant', emoji: '🕳️' },
    { name: 'Vide rampant', emoji: '🌌' },
    { name: 'Horreur informe', emoji: '👾' },
    { name: 'Fragment brisé', emoji: '🔮' },
  ],
  [
    { name: 'Léviathan', emoji: '🐲' },
    { name: 'Tyran déchu', emoji: '👑' },
    { name: 'Cataclysme', emoji: '💥' },
    { name: 'Fléau final', emoji: '☠️' },
  ],
];

// Gardien d'étage nommé, un par palier.
export const LABY_GUARDIANS: LabyFoeKind[] = [
  { name: 'Matriarche des galeries', emoji: '🕷️' },
  { name: 'Alpha de la meute', emoji: '🐺' },
  { name: 'Roi ossuaire', emoji: '💀' },
  { name: 'Étreigneur des abysses', emoji: '🐙' },
  { name: 'Colosse du gouffre', emoji: '🪨' },
  { name: 'Seigneur oni', emoji: '👹' },
  { name: 'Wyverne ancienne', emoji: '🐉' },
  { name: 'Veilleur astral', emoji: '👁️' },
  { name: 'Gueule du néant', emoji: '🕳️' },
  { name: 'Tyran de l’infini', emoji: '👑' },
];

const TOTAL_WEIGHT = LABY_ARCHETYPES.reduce((a, x) => a + x.weight, 0);

/** Tire un archétype pondéré (le Rôdeur reste le plus fréquent). */
export function pickLabyArchetype(rng: () => number): LabyArchetype {
  let r = rng() * TOTAL_WEIGHT;
  for (const a of LABY_ARCHETYPES) {
    r -= a.weight;
    if (r < 0) return a;
  }
  return LABY_ARCHETYPES[0]!;
}

export interface LabyFoe {
  name: string;
  emoji: string;
  arch: LabyArchetype;
}

/** Choisit la créature d'une salle : gardien nommé (boss) ou monstre du roster du palier
 *  + un archétype de comportement. `tierIndex` = rang du palier (0=G … 9=SSS). Seedé. */
export function pickLabyFoe(rng: () => number, tierIndex: number, isBoss: boolean): LabyFoe {
  const ti = Math.max(0, Math.min(9, Math.round(tierIndex)));
  if (isBoss) {
    const g = LABY_GUARDIANS[ti]!;
    return { name: g.name, emoji: g.emoji, arch: GUARDIAN_ARCH };
  }
  const roster = LABY_ROSTERS[ti]!;
  const kind = roster[Math.floor(rng() * roster.length)]!;
  return { name: kind.name, emoji: kind.emoji, arch: pickLabyArchetype(rng) };
}
