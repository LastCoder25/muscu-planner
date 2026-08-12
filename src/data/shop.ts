// shop.ts — boutique (dépenser l'or). Deux natures d'objets :
//  - « energy » : effet instantané (ajoute de l'énergie d'aventure) ;
//  - « consumable » : stocké, dépensé au lancement d'un donjon (buff du run).
import type { AggregatedEffects } from '@/lib/items';

export type ShopItemId =
  | 'energy_small'
  | 'energy_big'
  | 'potion_heal'
  | 'vial_luck'
  | 'elixir_force'
  | 'potion_heal_big'
  | 'scroll_crit'
  | 'scroll_guard';

export interface ShopItem {
  id: ShopItemId;
  name: string;
  emoji: string;
  desc: string;
  cost: number; // en or
  kind: 'energy' | 'consumable';
  energy?: number; // pour kind 'energy'
}

// ÉQUILIBRAGE ÉNERGIE : l'énergie doit coûter PLUS que le meilleur ratio de farm
// (Néant = 1180 or / 150 ⚡ ≈ 7,9 or/⚡) pour que racheter l'énergie d'un run avec
// son or soit toujours NET-NÉGATIF → pas de mouvement perpétuel. Ici ~10 or/⚡.
export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'energy_small',
    name: 'Boule d’énergie',
    emoji: '⚡',
    desc: '+25 énergie (dépannage — coûteux exprès).',
    cost: 250,
    kind: 'energy',
    energy: 25,
  },
  {
    id: 'energy_big',
    name: 'Sphère d’énergie',
    emoji: '🔆',
    desc: '+80 énergie (léger rabais au volume).',
    cost: 760,
    kind: 'energy',
    energy: 80,
  },
  {
    id: 'potion_heal',
    name: 'Potion de soin',
    emoji: '❤️',
    desc: '+35 % PV max sur ton prochain donjon.',
    cost: 80,
    kind: 'consumable',
  },
  {
    id: 'vial_luck',
    name: 'Fiole de chance',
    emoji: '🍀',
    desc: 'Butin de meilleure rareté sur ton prochain donjon.',
    cost: 110,
    kind: 'consumable',
  },
  {
    id: 'elixir_force',
    name: 'Élixir de force',
    emoji: '💥',
    desc: '+18 % dégâts sur ton prochain donjon.',
    cost: 100,
    kind: 'consumable',
  },
  // Sinks d'or supplémentaires (achat à l'or uniquement, non droppables).
  {
    id: 'potion_heal_big',
    name: 'Grande potion',
    emoji: '❤️‍🔥',
    desc: '+50 % PV max sur ton prochain donjon.',
    cost: 200,
    kind: 'consumable',
  },
  {
    id: 'scroll_crit',
    name: 'Parchemin de précision',
    emoji: '🎯',
    desc: '+10 % de critique sur ton prochain donjon.',
    cost: 150,
    kind: 'consumable',
  },
  {
    id: 'scroll_guard',
    name: 'Parchemin de garde',
    emoji: '🛡️',
    desc: '+10 % de réduction des dégâts sur ton prochain donjon.',
    cost: 150,
    kind: 'consumable',
  },
];

export const CONSUMABLE_ITEMS = SHOP_ITEMS.filter((i) => i.kind === 'consumable');

// Consommables pouvant tomber en butin de donjon.
export const DROPPABLE_CONSUMABLES: ShopItemId[] = ['potion_heal', 'vial_luck', 'elixir_force'];

/** Tire un éventuel consommable en butin d'un run (en plus de l'équipement). */
export function rollConsumableDrop(rng: () => number, cleared: boolean): ShopItemId | null {
  if (rng() >= (cleared ? 0.28 : 0.1)) return null;
  return DROPPABLE_CONSUMABLES[Math.floor(rng() * DROPPABLE_CONSUMABLES.length)] ?? null;
}

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/** Effet d'un consommable sur un run de donjon (buff via `extra` + chance de butin). */
export function consumableEffect(id: string): {
  extra?: Partial<AggregatedEffects>;
  lucky?: boolean;
} {
  // Forces réduites (2026‑08‑12) : cumulées au gear/set/talents elles faisaient
  // sauter des tiers de contenu (cf. simulation). Restent un coup de pouce, pas un ×2.
  if (id === 'potion_heal') return { extra: { maxPvPct: 0.35 } };
  if (id === 'potion_heal_big') return { extra: { maxPvPct: 0.5 } };
  if (id === 'elixir_force') return { extra: { damagePct: 0.18 } };
  if (id === 'scroll_crit') return { extra: { critAdd: 0.1 } };
  if (id === 'scroll_guard') return { extra: { dmgReduction: 0.1 } };
  if (id === 'vial_luck') return { lucky: true };
  return {};
}
