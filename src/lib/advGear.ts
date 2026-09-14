// advGear.ts — ÉQUIPEMENT DES AVENTURIERS (pur/testé). Spec :
// docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md (étape 1).
//
// ⚠️ Stock SÉPARÉ du sac du héros, pièces PROPRES À CHAQUE CLASSE DE BASE, rareté plafonnée
// par la classe du porteur. Aucune nouvelle stat : on puise dans les EffectType existants.
import {
  effectAsAggregate,
  effectBase,
  emptyEffects,
  itemLevelMult,
  mergeEffects,
  rankRollMult,
  RARITY_RANK,
  rollItemLevel,
  rollTier,
  scrapValueOf,
  sellValueOf,
  type AggregatedEffects,
  type EffectType,
  type ItemEffect,
  type Rarity,
} from './items';
import { advRarity, type Adventurer } from './adventurers';

export const LINEAGES = [
  'guerrier',
  'archer',
  'mage',
  'homme_armes',
  'eclaireur',
  'caravanier',
] as const;
export type Lineage = (typeof LINEAGES)[number];
export type AdvGearSlot = 'weapon' | 'armor' | 'accessory';
export const ADV_GEAR_SLOTS: AdvGearSlot[] = ['weapon', 'armor', 'accessory'];

export interface AdvGear {
  id: string;
  lineage: Lineage;
  slot: AdvGearSlot;
  name: string;
  emoji: string;
  rarity: Rarity;
  roll: number;
  level: number;
  effect: ItemEffect;
  effect2?: ItemEffect;
  /** Lignées civiles uniquement, sur l'accessoire : trajet raccourci / cargaison (fraction). */
  role?: { kind: 'speed' | 'haul'; value: number };
  locked?: boolean;
}

interface PieceDef {
  name: string;
  emoji: string;
  /** Stats possibles ; la 1ʳᵉ tirée est l'affixe principal, une AUTRE le 2ᵉ (Magique+). */
  pool: EffectType[];
}
export interface LineageGearDef {
  role?: 'speed' | 'haul';
  pieces: Record<AdvGearSlot, PieceDef>;
}

export const LINEAGE_GEAR: Record<Lineage, LineageGearDef> = {
  guerrier: {
    pieces: {
      weapon: { name: 'Épée', emoji: '🗡️', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuirasse', emoji: '🥋', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Gantelets', emoji: '🧤', pool: ['crit_pct', 'damage_pct'] },
    },
  },
  archer: {
    pieces: {
      weapon: { name: 'Arc', emoji: '🏹', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuir', emoji: '🦺', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Carquois', emoji: '🎯', pool: ['crit_pct', 'momentum_pct'] },
    },
  },
  mage: {
    pieces: {
      weapon: { name: 'Bâton', emoji: '🪄', pool: ['damage_pct', 'execute_pct'] },
      armor: { name: 'Robe', emoji: '👘', pool: ['max_pv_pct', 'lifesteal_pct'] },
      accessory: { name: 'Grimoire', emoji: '📖', pool: ['damage_pct', 'lifesteal_pct'] },
    },
  },
  homme_armes: {
    pieces: {
      weapon: { name: 'Masse', emoji: '🔨', pool: ['damage_pct', 'thorns_pct'] },
      armor: { name: 'Plates', emoji: '🛡️', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
      accessory: { name: 'Bouclier', emoji: '🔰', pool: ['dmg_reduction_pct', 'thorns_pct'] },
    },
  },
  eclaireur: {
    role: 'speed',
    pieces: {
      weapon: { name: 'Dague', emoji: '🔪', pool: ['crit_pct', 'damage_pct'] },
      armor: { name: 'Cape', emoji: '🧣', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Longue-vue', emoji: '🔭', pool: ['crit_pct', 'damage_pct'] },
    },
  },
  caravanier: {
    role: 'haul',
    pieces: {
      weapon: { name: 'Bâton de marche', emoji: '🦯', pool: ['max_pv_pct', 'damage_pct'] },
      armor: { name: 'Manteau', emoji: '🧥', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Bât', emoji: '🎒', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
    },
  },
};

/** Réglages. ⚠️ `k` est LE levier d'équilibrage de l'équipement (mesuré en Task 4). */
export const ADV_GEAR = {
  /** ⚠️ MESURÉ à 0,15 — l'équipement est un BONUS, pas un péage. À 1, un trio sans pièces
   *  tombait à 22-28 % de ses embuscades calmes dès le niveau 26 face à une route calibrée
   *  sur une escorte équipée : la plupart des joueurs, équipés partiellement pendant des
   *  semaines, auraient payé l'absence d'équipement. Même précédent que les familiers
   *  (un gain modeste). Mesuré sur 2000 graines, niveaux 12/20/26/45/70/85 : trio équipé
   *  calme 92/89/76/74/85/89 %, périlleux 26/27/35/25/29/34 % ; le même SANS pièces
   *  90/86/72/63/67/65 % en calme. Ne pas remonter sans re-mesurer les deux. */
  k: 0.15,
  /** Bonus de rôle d'un accessoire civil commun, jet 0 (rareté et jet le font monter). */
  roleBase: { speed: 0.03, haul: 0.04 },
  /** Revente : un objet d'aventurier vaut la moitié d'un objet du héros de même grade. */
  sellK: 0.5,
} as const;

export function lineageOf(adv: Adventurer): Lineage | null {
  const root = adv.path[0];
  return root && (LINEAGES as readonly string[]).includes(root) ? (root as Lineage) : null;
}

/** ⚠️ Même règle que `canAdvTalent` : la rareté ne dépasse pas celle de la classe. */
export function canWearAdvGear(adv: Adventurer, g: AdvGear): boolean {
  return lineageOf(adv) === g.lineage && RARITY_RANK[g.rarity] <= RARITY_RANK[advRarity(adv)];
}

/** Une lignée présente dans le vivier — sinon le stock se remplirait d'objets importables. */
export function pickLineage(rng: () => number, advs: Adventurer[]): Lineage | null {
  const present = [...new Set(advs.map(lineageOf).filter((l): l is Lineage => !!l))];
  if (!present.length) return null;
  return present[Math.floor(rng() * present.length)]!;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Valeur d'une stat d'équipement à ce grade. ⚠️ SOURCE UNIQUE : le tirage ET l'escorte de
 *  référence de la route (`refAdvGear`) la lisent — deux copies divergeraient au premier
 *  réglage de `ADV_GEAR.k`, et la route se calibrerait sur un équipement qui n'existe pas.
 *  ⚠️ PLANCHER à 0,1, pas à 1 : à k 0,15 un plancher à 1 écrasait rareté ET jet sur les
 *  petites bases (crit base 4 → 0,6 → 1 en commun comme au jet parfait). */
export function advGearValue(t: EffectType, rank: Rarity, roll: number): number {
  return Math.max(0.1, round1(effectBase(t) * rankRollMult(rank, roll) * ADV_GEAR.k));
}

/** Bonus de rôle d'un accessoire civil à ce grade (même source unique que `advGearValue`). */
export function advGearRoleValue(kind: 'speed' | 'haul', rank: Rarity, roll: number): number {
  const scale = rankRollMult(rank, roll) / rankRollMult('commun', 0);
  return Math.round(ADV_GEAR.roleBase[kind] * scale * 1000) / 1000;
}

export function rollAdvGear(
  rng: () => number,
  opts: { lineage: Lineage; slot?: AdvGearSlot; level: number; luck?: number; playerLevel: number },
): Omit<AdvGear, 'id'> {
  const luck = opts.luck ?? 0;
  const slot = opts.slot ?? ADV_GEAR_SLOTS[Math.floor(rng() * ADV_GEAR_SLOTS.length)]!;
  const { rank, roll } = rollTier(rng, opts.level, luck, 0, opts.playerLevel);
  const level = rollItemLevel(rng, Math.max(1, Math.min(opts.level, opts.playerLevel)), luck);
  const def = LINEAGE_GEAR[opts.lineage];
  const piece = def.pieces[slot];
  const i1 = Math.floor(rng() * piece.pool.length);
  const t1 = piece.pool[i1]!;
  const value = (t: EffectType) => advGearValue(t, rank, roll);
  const out: Omit<AdvGear, 'id'> = {
    lineage: opts.lineage,
    slot,
    name: piece.name,
    emoji: piece.emoji,
    rarity: rank,
    roll,
    level,
    effect: { type: t1, value: value(t1) },
  };
  if (RARITY_RANK[rank] >= RARITY_RANK.magique) {
    const others = piece.pool.filter((t) => t !== t1);
    const t2 = others[Math.floor(rng() * others.length)]!;
    out.effect2 = { type: t2, value: value(t2) };
  }
  if (def.role && slot === 'accessory') {
    out.role = { kind: def.role, value: advGearRoleValue(def.role, rank, roll) };
  }
  return out;
}

/** Ce que des pièces apportent au combat — valeur × niveau d'objet, comme un objet du héros. */
export function advGearEffects(gear: AdvGear[]): AggregatedEffects {
  const parts = gear.flatMap((g) => {
    const m = itemLevelMult(g.level);
    const out = [effectAsAggregate(g.effect.type, g.effect.value * m)];
    if (g.effect2) out.push(effectAsAggregate(g.effect2.type, g.effect2.value * m));
    return out;
  });
  return parts.length ? mergeEffects(...parts) : emptyEffects();
}

/**
 * Qui porte quoi, règles appliquées. ⚠️ Lu par le COMBAT, pas seulement l'écran : une pièce
 * portée deux fois ne compte qu'une, une pièce sur le mauvais emplacement ou devenue trop
 * rare est ignorée, un id qui ne désigne plus rien (vendu, recyclé) aussi.
 */
export function wornGear(advs: Adventurer[], stock: AdvGear[]): Map<string, AdvGear[]> {
  const byId = new Map(stock.map((g) => [g.id, g]));
  const taken = new Set<string>();
  const out = new Map<string, AdvGear[]>();
  for (const a of advs) {
    const list: AdvGear[] = [];
    for (const slot of ADV_GEAR_SLOTS) {
      const id = a.gear?.[slot];
      if (!id || taken.has(id)) continue;
      const g = byId.get(id);
      if (!g || g.slot !== slot || !canWearAdvGear(a, g)) continue;
      taken.add(id);
      list.push(g);
    }
    if (list.length) out.set(a.id, list);
  }
  return out;
}

/** Bonus de rôle PORTÉS par une escorte (fractions, non plafonnées — la route plafonne). */
export function advGearRoles(
  escort: Adventurer[],
  stock: AdvGear[],
): { speed: number; haul: number } {
  const out = { speed: 0, haul: 0 };
  for (const list of wornGear(escort, stock).values())
    for (const g of list) if (g.role) out[g.role.kind] += g.role.value;
  return out;
}

/** Ce que le sélecteur d'un emplacement propose, et combien de pièces sont masquées. */
export function advGearOptions(
  adv: Adventurer,
  advs: Adventurer[],
  stock: AdvGear[],
  slot: AdvGearSlot,
): { options: AdvGear[]; otherLineage: number; tooRare: number; taken: number } {
  const takenIds = new Set(
    advs.filter((o) => o.id !== adv.id).flatMap((o) => Object.values(o.gear ?? {})),
  );
  const res = { options: [] as AdvGear[], otherLineage: 0, tooRare: 0, taken: 0 };
  const lineage = lineageOf(adv);
  for (const g of stock) {
    if (g.slot !== slot) continue;
    if (g.lineage !== lineage) res.otherLineage++;
    else if (RARITY_RANK[g.rarity] > RARITY_RANK[advRarity(adv)]) res.tooRare++;
    else if (takenIds.has(g.id)) res.taken++;
    else res.options.push(g);
  }
  return res;
}

/** L'état persisté (jsonb `characters.adv_gear`, colonne à venir) : le stock et une
 *  forge éventuellement en cours. ⚠️ Séparé du sac du héros (`inventory`). */
export interface AdvGearState {
  stock: AdvGear[];
  forge?: { until: number; advId: string; piece: Omit<AdvGear, 'id'> } | null;
}

export function advGearSellValue(g: AdvGear): number {
  return Math.max(1, Math.round(sellValueOf(g.rarity, g.roll, g.level) * ADV_GEAR.sellK));
}
export function advGearScrap(g: AdvGear): number {
  return scrapValueOf(g.slot, g.rarity, g.level);
}
