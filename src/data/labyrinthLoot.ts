// labyrinthLoot.ts — variété du CONTENU des salles du Labyrinthe (pur/testé) :
//  1) COFFRES gradés (bronze → platine) dont le grade DÉRIVE de la même frise glissante
//     que le loot (`rollTier`) → il se décale vers le haut avec le niveau, sans réglage
//     dédié ; le grade fixe le CONTENU (luck / niveau / ressources / objet garanti) ;
//  2) PIÈGES variés (icônes + effets : dégâts modulés, vol d'or/poussière).
import { rollTier, RARITY_RANK, type Rarity } from '@/lib/items';

// ── COFFRES ────────────────────────────────────────────────────────────────
export interface ChestGrade {
  id: string;
  label: string;
  emoji: string;
  color: string;
  luckBonus: number; // ajouté à la luck du drop
  levelBonus: number; // ajouté au niveau du drop
  guaranteed: boolean; // objet garanti (re-tire si vide) ?
  fragBonus: number; // fragments 🧩 en plus
  dustBonus: number; // poussière ✨ en plus
}

// 4 grades. Le contenu monte franchement du bronze au platine (le platine frôle la
// salle secrète). `color` = teinte de l'image de coffre (cuivre / argent / or / diamant).
export const CHEST_GRADES: ChestGrade[] = [
  {
    id: 'bronze',
    label: 'Bronze',
    emoji: '🥉',
    color: '#c8813f',
    luckBonus: 0,
    levelBonus: -1,
    guaranteed: false,
    fragBonus: 0,
    dustBonus: 0,
  },
  {
    id: 'argent',
    label: 'Argent',
    emoji: '🥈',
    color: '#c7ccd6',
    luckBonus: 0.1,
    levelBonus: 0,
    guaranteed: false,
    fragBonus: 1,
    dustBonus: 4,
  },
  {
    id: 'or',
    label: 'Or',
    emoji: '🥇',
    color: '#ffd23f',
    luckBonus: 0.25,
    levelBonus: 0,
    guaranteed: true,
    fragBonus: 2,
    dustBonus: 10,
  },
  {
    id: 'platine',
    label: 'Platine',
    emoji: '💠',
    color: '#5fd0e0',
    luckBonus: 0.45,
    levelBonus: 1,
    guaranteed: true,
    fragBonus: 4,
    dustBonus: 20,
  },
];

/** Rang G→SSS → index de grade (G F E → bronze · D C → argent · B A → or · S SS SSS → platine). */
export function chestGradeIndexForRank(rank: Rarity): number {
  const i = RARITY_RANK[rank];
  if (i <= 2) return 0;
  if (i <= 4) return 1;
  if (i <= 6) return 2;
  return 3;
}

/** Grade d'un coffre : on tire un rang via la MÊME frise glissante que le loot
 *  (`rollTier`), puis on le range en 4 grades → le grade se décale bronze→platine avec
 *  le niveau du palier, exactement comme les rangs de familiers/objets. Seedé. */
export function rollChestGrade(rng: () => number, level: number, luck = 0): ChestGrade {
  const { rank } = rollTier(rng, level, luck);
  return CHEST_GRADES[chestGradeIndexForRank(rank)]!;
}

// ── PIÈGES ─────────────────────────────────────────────────────────────────
export type TrapKind = 'dmg' | 'gold' | 'dust';
export interface LabyTrap {
  id: string;
  emoji: string;
  label: string;
  kind: TrapKind;
  mult: number; // dmg : facteur sur les dégâts de base ; gold/dust : facteur sur la perte
  weight: number; // pondération de tirage
}

// Dégâts modulés (pointes < gaz < flammes) + vols de ressources (or/poussière).
export const LABY_TRAPS: LabyTrap[] = [
  { id: 'spikes', emoji: '🔻', label: 'Pointes', kind: 'dmg', mult: 1.0, weight: 3 },
  { id: 'poison', emoji: '☠️', label: 'Gaz toxique', kind: 'dmg', mult: 1.35, weight: 2 },
  { id: 'flames', emoji: '🔥', label: 'Flammes', kind: 'dmg', mult: 1.7, weight: 2 },
  { id: 'thief', emoji: '🕳️', label: 'Trappe du voleur', kind: 'gold', mult: 1, weight: 2 },
  { id: 'web', emoji: '🕸️', label: 'Toile gluante', kind: 'dust', mult: 1, weight: 1 },
];

const TRAP_WEIGHT = LABY_TRAPS.reduce((a, t) => a + t.weight, 0);

/** Tire un piège pondéré (seedé). */
export function pickLabyTrap(rng: () => number): LabyTrap {
  let r = rng() * TRAP_WEIGHT;
  for (const t of LABY_TRAPS) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return LABY_TRAPS[0]!;
}
