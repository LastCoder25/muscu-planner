// shop.ts — boutique (dépenser l'or). Deux natures d'objets :
//  - « energy » : effet instantané (ajoute de l'énergie d'aventure) ;
//  - « consumable » : stocké, dépensé au lancement d'un donjon (buff du run).
import type { AggregatedEffects } from '@/lib/items';

export type ShopItemId =
  | 'energy_small'
  | 'energy_big'
  | 'potion_heal'
  | 'vial_luck'
  | 'elixir_force';

export interface ShopItem {
  id: ShopItemId;
  name: string;
  emoji: string;
  desc: string;
  cost: number; // en or
  kind: 'energy' | 'consumable';
  energy?: number; // pour kind 'energy'
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'energy_small',
    name: 'Boule d’énergie',
    emoji: '⚡',
    desc: '+30 énergie pour explorer les donjons.',
    cost: 60,
    kind: 'energy',
    energy: 30,
  },
  {
    id: 'energy_big',
    name: 'Sphère d’énergie',
    emoji: '🔆',
    desc: '+100 énergie (plus avantageux).',
    cost: 180,
    kind: 'energy',
    energy: 100,
  },
  {
    id: 'potion_heal',
    name: 'Potion de soin',
    emoji: '❤️',
    desc: '+50 % PV max sur ton prochain donjon.',
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
    desc: '+25 % dégâts sur ton prochain donjon.',
    cost: 100,
    kind: 'consumable',
  },
];

export const CONSUMABLE_ITEMS = SHOP_ITEMS.filter((i) => i.kind === 'consumable');

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/** Effet d'un consommable sur un run de donjon (buff via `extra` + chance de butin). */
export function consumableEffect(id: string): {
  extra?: Partial<AggregatedEffects>;
  lucky?: boolean;
} {
  if (id === 'potion_heal') return { extra: { maxPvPct: 0.5 } };
  if (id === 'elixir_force') return { extra: { damagePct: 0.25 } };
  if (id === 'vial_luck') return { lucky: true };
  return {};
}
