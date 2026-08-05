// items.ts — équipement RPG (Phase 2c). RÈGLE : l'équipement ne donne PAS de
// stats (elles viennent du sport) — il donne des EFFETS de gameplay. Pur/testable.
import { playerCombatant, type Combatant } from './combat';

export type ItemSlot = 'weapon' | 'armor' | 'accessory' | 'relic';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

// Effets « signature » (un par objet). value en points de % (ou 1 = flag).
export type EffectType =
  | 'damage_pct' // arme : + dégâts
  | 'crit_pct' // arme/relique : + chance de critique
  | 'lifesteal_pct' // arme : vol de vie
  | 'dmg_reduction_pct' // armure : dégâts reçus réduits
  | 'max_pv_pct' // armure : + PV max
  | 'gold_pct' // accessoire : + or gagné
  | 'first_strike'; // relique : frappe toujours en premier

export interface ItemEffect {
  type: EffectType;
  value: number; // % (ou 1 pour un flag)
}

export interface Item {
  id: string;
  slot: ItemSlot;
  name: string;
  emoji: string;
  rarity: Rarity;
  level: number; // niveau ACTUEL de l'objet (grandit en donjon, ≤ niveau du joueur)
  xp: number; // XP accumulée vers le niveau suivant
  effect: ItemEffect; // value = magnitude de BASE (niveau 1) ; l'effet réel grandit avec le niveau
}

// L'effet grandit de +8 % de la base par niveau au-dessus de 1.
export function itemLevelMult(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.08;
}
/** Valeur réelle d'un effet au niveau de l'objet (les flags restent à 1). */
export function effectiveValue(effect: ItemEffect, level: number): number {
  if (effect.type === 'first_strike') return 1;
  return Math.max(1, Math.round(effect.value * itemLevelMult(level)));
}
/** XP nécessaire pour passer du niveau `level` au suivant. */
export function itemXpForLevel(level: number): number {
  return 60 + level * 30;
}
/** Progression (0..1) de l'objet vers son niveau suivant (0 si au plafond). */
export function itemXpPct(item: Item, playerLevel: number): number {
  if (item.level >= playerLevel) return 1;
  return Math.min(1, (item.xp ?? 0) / itemXpForLevel(item.level));
}
/** Ajoute de l'XP à un objet ; monte de niveau, plafonné au niveau du joueur. Pur. */
export function grantItemXp(item: Item, xp: number, playerLevel: number): Item {
  let level = item.level;
  let x = (item.xp ?? 0) + Math.max(0, xp);
  while (level < playerLevel && x >= itemXpForLevel(level)) {
    x -= itemXpForLevel(level);
    level++;
  }
  if (level >= playerLevel) x = 0; // au plafond : pas d'accumulation
  return { ...item, level, xp: x };
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
    { type: 'first_strike', base: 1 },
    { type: 'crit_pct', base: 6 },
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
    case 'first_strike':
      return 'Frappe en premier';
  }
}

/** Puissance indicative d'un objet (valeur réelle au niveau courant) → auto-équipe le meilleur. */
export function itemScore(it: Item): number {
  return it.effect.type === 'first_strike'
    ? RARITY_MULT[it.rarity] * 10
    : effectiveValue(it.effect, it.level);
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function rollRarity(rng: () => number): Rarity {
  const r = rng();
  if (r < 0.02) return 'legendary';
  if (r < 0.12) return 'epic';
  if (r < 0.4) return 'rare';
  return 'common';
}

/**
 * Tire un butin après un run. Renvoie l'objet SANS id (l'appelant en pose un),
 * ou null si pas de drop. `level` est plafonné au niveau du joueur.
 */
export function rollDrop(
  rng: () => number,
  opts: { playerLevel: number; cleared: boolean; defeated: number },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? 0.6 : 0.3;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  const rarity = rollRarity(rng);
  const choices = SLOT_EFFECTS[slot];
  const chosen = pick(rng, choices);
  // value = magnitude de BASE (niveau 1) : pilotée par la rareté ; l'objet grandira ensuite.
  const value =
    chosen.type === 'first_strike' ? 1 : Math.max(1, Math.round(chosen.base * RARITY_MULT[rarity]));
  const noun = pick(rng, NAMES[slot]);
  return {
    slot,
    name: `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level: 1, // les objets démarrent au niveau 1 et montent en donjon
    xp: 0,
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
  firstStrike: boolean;
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
    firstStrike: false,
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
      case 'first_strike':
        a.firstStrike = true;
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
  const firstStrike = e.firstStrike || !!extra.firstStrike;
  return {
    name,
    pv: Math.round(base.pv * (1 + maxPvPct)),
    damage: Math.max(1, Math.round(base.damage * (1 + damagePct))),
    crit: Math.min(0.6, base.crit + critAdd),
    dodge: Math.min(0.4, base.dodge + dodgeAdd),
    initiative: firstStrike ? 9999 : base.initiative,
    dmgReduction,
    lifesteal,
  };
}
