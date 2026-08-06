// items.ts — équipement RPG (Phase 2c). RÈGLE : l'équipement ne donne PAS de
// stats (elles viennent du sport) — il donne des EFFETS de gameplay. Pur/testable.
import { playerCombatant, type Combatant } from './combat';

export type ItemSlot = 'weapon' | 'armor' | 'accessory' | 'relic';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

// Effets « signature » (un par objet). value en points de %. RÈGLE : tous les
// effets doivent GRANDIR avec le niveau de l'objet (pas d'effet « drapeau »
// binaire — ils ne récompenseraient pas la montée en niveau).
export type EffectType =
  | 'damage_pct' // arme : + dégâts
  | 'crit_pct' // arme/relique : + chance de critique
  | 'lifesteal_pct' // arme : vol de vie
  | 'dmg_reduction_pct' // armure : dégâts reçus réduits
  | 'max_pv_pct' // armure : + PV max
  | 'gold_pct'; // accessoire : + or gagné

export interface ItemEffect {
  type: EffectType;
  value: number; // %
}

export interface Item {
  id: string;
  slot: ItemSlot;
  name: string;
  emoji: string;
  rarity: Rarity;
  level: number; // niveau ACTUEL (monté via la Poussière d'évolution, ≤ niveau du joueur)
  baseLevel: number; // niveau à l'obtention (drop) → sert au remboursement au recyclage
  effect: ItemEffect; // value = magnitude de BASE (niveau 1) ; l'effet réel grandit avec le niveau
}

// L'effet grandit de +10 % de la base par niveau au-dessus de 1.
export function itemLevelMult(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.1;
}
/** Valeur réelle d'un effet au niveau de l'objet. */
export function effectiveValue(effect: ItemEffect, level: number): number {
  return Math.max(1, Math.round(effect.value * itemLevelMult(level)));
}

// ── Économie d'objets : Poussière (évolution) & or (vente) ──
const DUST_BY_RARITY: Record<Rarity, number> = { common: 5, rare: 12, epic: 25, legendary: 50 };
const GOLD_BY_RARITY: Record<Rarity, number> = { common: 10, rare: 25, epic: 60, legendary: 140 };
// Le coût d'amélioration monte avec la rareté (un légendaire = plus gros puits).
const RARITY_COST_MULT: Record<Rarity, number> = { common: 1, rare: 1.5, epic: 2, legendary: 3 };

/** Coût en poussière pour passer du niveau `level` au suivant, selon la rareté. */
export function upgradeCost(level: number, rarity: Rarity): number {
  return Math.round((10 + level * 6) * RARITY_COST_MULT[rarity]);
}
/** Poussière déjà investie dans un objet (des niveaux payés : baseLevel → level). */
export function investedDust(it: Item): number {
  let sum = 0;
  for (let k = it.baseLevel ?? 1; k < it.level; k++) sum += upgradeCost(k, it.rarity);
  return sum;
}
/** Casser un objet → base de rareté + TOUTE la poussière investie (remboursée). */
export function salvageValue(it: Item): number {
  return DUST_BY_RARITY[it.rarity] + investedDust(it);
}
/** Or obtenu en vendant un objet. */
export function sellValue(it: Item): number {
  return GOLD_BY_RARITY[it.rarity] + (it.level - 1) * 8;
}
/** Peut-on améliorer cet objet ? (poussière suffisante + pas au plafond). */
export function canUpgrade(it: Item, dust: number, playerLevel: number): boolean {
  return it.level < playerLevel && dust >= upgradeCost(it.level, it.rarity);
}

export type Equipped = Partial<Record<ItemSlot, Item>>;

export const SLOTS: ItemSlot[] = ['weapon', 'armor', 'accessory', 'relic'];
export const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  accessory: 'Accessoire',
  relic: 'Relique',
};
export const SLOT_EMOJI: Record<ItemSlot, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  accessory: '💍',
  relic: '🔮',
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.6, epic: 2.4, legendary: 3.5 };

// Effet possible par slot + valeur de base (avant rareté/niveau).
const SLOT_EFFECTS: Record<ItemSlot, { type: EffectType; base: number }[]> = {
  weapon: [
    { type: 'damage_pct', base: 8 },
    { type: 'crit_pct', base: 4 },
    { type: 'lifesteal_pct', base: 6 },
  ],
  armor: [
    { type: 'dmg_reduction_pct', base: 6 },
    { type: 'max_pv_pct', base: 10 },
  ],
  accessory: [{ type: 'gold_pct', base: 15 }],
  relic: [
    { type: 'crit_pct', base: 6 },
    { type: 'max_pv_pct', base: 8 },
  ],
};

// Noms d'objets par slot (saveur).
const NAMES: Record<ItemSlot, string[]> = {
  weapon: ['Lame', 'Hache', 'Masse', 'Dague', 'Fléau'],
  armor: ['Plastron', 'Cotte', 'Cuirasse', 'Harnois'],
  accessory: ['Anneau', 'Amulette', 'Talisman', 'Bracelet'],
  relic: ['Éclat', 'Totem', 'Sceau', 'Idole'],
};
const RARITY_ADJ: Record<Rarity, string> = {
  common: 'usé',
  rare: 'affûté',
  epic: 'runique',
  legendary: 'mythique',
};

/** Libellé de l'effet à un niveau d'objet donné (valeur réelle). */
export function effectLabel(e: ItemEffect, level = 1): string {
  const v = effectiveValue(e, level);
  switch (e.type) {
    case 'damage_pct':
      return `+${v}% dégâts`;
    case 'crit_pct':
      return `+${v}% critique`;
    case 'lifesteal_pct':
      return `+${v}% vol de vie`;
    case 'dmg_reduction_pct':
      return `−${v}% dégâts reçus`;
    case 'max_pv_pct':
      return `+${v}% PV`;
    case 'gold_pct':
      return `+${v}% or`;
  }
}

/** Puissance indicative d'un objet (valeur réelle au niveau courant) → compare deux objets. */
export function itemScore(it: Item): number {
  return effectiveValue(it.effect, it.level);
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// `luck` 0..1 décale progressivement les seuils vers le haut (donjons durs +
// fiole de chance). 0 = odds de base, 1 = très généreux.
function rollRarity(rng: () => number, luck = 0): Rarity {
  const l = Math.min(1, Math.max(0, luck));
  const r = rng();
  if (r < 0.02 + l * 0.08) return 'legendary';
  if (r < 0.12 + l * 0.2) return 'epic';
  if (r < 0.4 + l * 0.32) return 'rare';
  return 'common';
}

/**
 * Tire un butin après un run. Renvoie l'objet SANS id (l'appelant en pose un),
 * ou null si pas de drop.
 *  - `level` : niveau de base de l'objet (selon le donjon), plafonné au niveau du joueur ;
 *  - `luck` : biais de rareté (donjon + fiole de chance), 0..1.
 */
export function rollDrop(
  rng: () => number,
  opts: {
    playerLevel: number;
    cleared: boolean;
    defeated: number;
    level?: number;
    luck?: number;
  },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? 0.6 : 0.3;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  const rarity = rollRarity(rng, opts.luck ?? 0);
  const choices = SLOT_EFFECTS[slot];
  const chosen = pick(rng, choices);
  // value = magnitude de BASE (niveau 1) : pilotée par la rareté ; grandit avec le niveau.
  const value = Math.max(1, Math.round(chosen.base * RARITY_MULT[rarity]));
  const noun = pick(rng, NAMES[slot]);
  // Niveau de l'objet = niveau de base du donjon, borné [1, niveau joueur].
  const level = Math.min(Math.max(1, opts.playerLevel), Math.max(1, Math.round(opts.level ?? 1)));
  return {
    slot,
    name: `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value },
  };
}

export interface AggregatedEffects {
  damagePct: number;
  critAdd: number; // fraction 0..1
  dodgeAdd: number; // fraction 0..1
  lifesteal: number; // fraction
  dmgReduction: number; // fraction, plafonnée
  maxPvPct: number; // fraction
  goldPct: number; // fraction
}

export function emptyEffects(): AggregatedEffects {
  return {
    damagePct: 0,
    critAdd: 0,
    dodgeAdd: 0,
    lifesteal: 0,
    dmgReduction: 0,
    maxPvPct: 0,
    goldPct: 0,
  };
}

export function aggregateEffects(equipped: Equipped): AggregatedEffects {
  const a = emptyEffects();
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    const v = effectiveValue(it.effect, it.level) / 100; // effet réel au niveau de l'objet
    switch (it.effect.type) {
      case 'damage_pct':
        a.damagePct += v;
        break;
      case 'crit_pct':
        a.critAdd += v;
        break;
      case 'lifesteal_pct':
        a.lifesteal += v;
        break;
      case 'dmg_reduction_pct':
        a.dmgReduction += v;
        break;
      case 'max_pv_pct':
        a.maxPvPct += v;
        break;
      case 'gold_pct':
        a.goldPct += v;
        break;
    }
  }
  a.dmgReduction = Math.min(0.5, a.dmgReduction); // plafond 50 %
  return a;
}

/** Combattant du joueur = stats (sport) + effets de l'équipement + `extra` (talents). */
export function playerWithGear(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  equipped: Equipped,
  extra: Partial<AggregatedEffects> = {},
): Combatant {
  const base = playerCombatant(name, stats);
  const e = aggregateEffects(equipped);
  const damagePct = e.damagePct + (extra.damagePct ?? 0);
  const maxPvPct = e.maxPvPct + (extra.maxPvPct ?? 0);
  const critAdd = e.critAdd + (extra.critAdd ?? 0);
  const dodgeAdd = e.dodgeAdd + (extra.dodgeAdd ?? 0);
  const dmgReduction = Math.min(0.5, e.dmgReduction + (extra.dmgReduction ?? 0));
  const lifesteal = e.lifesteal + (extra.lifesteal ?? 0);
  return {
    name,
    pv: Math.round(base.pv * (1 + maxPvPct)),
    damage: Math.max(1, Math.round(base.damage * (1 + damagePct))),
    crit: Math.min(0.6, base.crit + critAdd),
    dodge: Math.min(0.4, base.dodge + dodgeAdd),
    initiative: base.initiative,
    dmgReduction,
    lifesteal,
  };
}
