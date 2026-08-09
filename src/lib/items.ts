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
  effect: ItemEffect; // effet UNIQUE. value = magnitude de BASE (niv.1) ; grandit avec le niveau
  effect2?: ItemEffect; // LEGACY : anciens objets 2-stats (les nouveaux n'en ont plus) — encore appliqué
  setId?: string; // appartenance à un SET (bonus à 2/3/4 pièces) — cf. ITEM_SETS
}

// L'effet grandit de +5 % de la base par niveau au-dessus de 1. Pente VOLONTAIREMENT
// douce (2026‑08‑08) : le gear reste un GATE progressif (plus j'ai de bon gear,
// plus mon % monte) et n'explose pas en multiplicateur ×2 qui trivialise les boss.
export function itemLevelMult(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.05;
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

// Récompense « au choix » d'un boss : 3 candidats tirés, le joueur en garde 1.
export type RewardCandidate =
  | { kind: 'item'; item: Item }
  | { kind: 'gold'; gold: number; dust: number };
export interface PendingReward {
  source: string; // ex. 'boss:dragon_primordial' (traçabilité)
  candidates: RewardCandidate[];
}

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

// Rang de rareté (0..3) pour comparer deux objets (potentiel à niveau égal).
export const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
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
  // L'accessoire peut rouler de l'or OU un effet de combat (crit / vol de vie) :
  // en modèle 1-stat, éviter qu'un slot soit « mort » au combat.
  accessory: [
    { type: 'gold_pct', base: 15 },
    { type: 'crit_pct', base: 5 },
    { type: 'lifesteal_pct', base: 5 },
  ],
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

/** Puissance indicative d'un objet (2 stats au niveau courant) → compare deux objets. */
export function itemScore(it: Item): number {
  return (
    effectiveValue(it.effect, it.level) + (it.effect2 ? effectiveValue(it.effect2, it.level) : 0)
  );
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
 * Tire un butin après un run de donjon. Renvoie l'objet SANS id (l'appelant en
 * pose un), ou null si pas de drop.
 * RÈGLE (2026‑08‑08) : le niveau du drop est fixé par le DONJON, **découplé du
 * niveau du joueur** — un perso niv.10 dans un donjon niv.1 ne trouve QUE du
 * niv.1 (on monte ensuite les objets à la Poussière). Les drops peuvent même
 * tomber un peu SOUS le niveau du donjon (`spread`) → fourrage à améliorer ; le
 * niveau plein d'un palier ne s'obtient qu'auprès des BOSS (cf. rollSetPiece).
 *  - `level` : niveau de base de l'objet (selon le donjon) ;
 *  - `spread` : combien de niveaux SOUS `level` le drop peut descendre (0 = pile au niveau) ;
 *  - `luck` : biais de rareté (donjon + fiole de chance), 0..1.
 */
export function rollDrop(
  rng: () => number,
  opts: {
    cleared: boolean;
    defeated: number;
    level?: number;
    spread?: number;
    luck?: number;
  },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? 0.6 : 0.3;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  let rarity = rollRarity(rng, opts.luck ?? 0);
  // Au-delà du niveau 5, plus de butin COMMUN (fin du fourrage gris) → planché à rare.
  if ((opts.level ?? 1) > 5 && rarity === 'common') rarity = 'rare';
  const choices = SLOT_EFFECTS[slot];
  const chosen = pick(rng, choices);
  // value = magnitude de BASE (niveau 1) : pilotée par la rareté ; grandit avec le niveau.
  const value = Math.max(1, Math.round(chosen.base * RARITY_MULT[rarity]));
  const noun = pick(rng, NAMES[slot]);
  // Niveau = niveau du donjon, moins une dispersion vers le bas (jamais au-dessus).
  const base = Math.max(1, Math.round(opts.level ?? 1));
  const spread = Math.max(0, Math.round(opts.spread ?? 0));
  const level = Math.max(1, base - Math.floor(rng() * (spread + 1)));
  return {
    slot,
    name: `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value }, // 1 seule stat (le set fait la différence par sa synergie)
  };
}

/**
 * Tire une PIÈCE DE SET pour une victoire de boss. Toujours une pièce (drop
 * garanti), au niveau PLEIN du palier du boss. **Anti-doublon (pity)** : si
 * `preferSlot` est fourni (un slot du set que le joueur n'a pas encore), on le
 * force → on complète le set avant de risquer un doublon ; sinon slot aléatoire.
 */
export function rollSetPiece(
  rng: () => number,
  opts: { setId: string; level: number; luck?: number; preferSlot?: ItemSlot },
): Omit<Item, 'id'> {
  const set = SET_BY_ID[opts.setId];
  const slot = opts.preferSlot ?? pick(rng, SLOTS);
  const rarity = rollRarity(rng, opts.luck ?? 0);
  const chosen = pick(rng, SLOT_EFFECTS[slot]);
  const value = Math.max(1, Math.round(chosen.base * RARITY_MULT[rarity]));
  const noun = pick(rng, NAMES[slot]);
  const level = Math.max(1, Math.round(opts.level));
  return {
    slot,
    name: set ? `${noun} · ${set.name}` : `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: set ? set.emoji : SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value }, // 1 stat + la synergie de set (bonus 2/3/4 pièces)
    ...(set ? { setId: opts.setId } : {}),
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

/** Applique une valeur (fraction) d'un EffectType donné à un agrégat. */
function applyEffect(a: AggregatedEffects, type: EffectType, v: number): void {
  switch (type) {
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

// ── Sets d'équipement (bonus à 2 / 3 / 4 pièces) ──
// RÈGLE respectée : le bonus GRANDIT avec le niveau (moyen) des pièces du set.
// Les pièces de set droppent sur les donjons de fin (cf. dungeons.ts).
export interface SetTier {
  pieces: number; // 2, 3 ou 4
  type: EffectType;
  base: number; // magnitude de base (niveau 1), scalée par le niveau moyen des pièces
}
export interface ItemSet {
  id: string;
  name: string;
  emoji: string;
  theme: string; // résumé « coach »
  tiers: SetTier[];
}

// Un set PAR boss de palier (cf. src/data/bosses.ts). Chaque set a un pouvoir
// spécifique. Les pièces ne droppent QUE sur le boss correspondant.
// Modèle 1-STAT (2026‑08‑08) : chaque objet (donjon ou set) porte UNE stat ; le
// BONUS de set RENFORCE le thème → un set = un build focalisé et désirable. Assez
// fort pour valoir le coup, assez modéré pour qu'un légendaire de donjon (stat
// unique très élevée) puisse tenter de casser le set → vraie chasse ARPG.
export const ITEM_SETS: ItemSet[] = [
  {
    id: 'golem',
    name: 'Rempart du Golem',
    emoji: '🗿',
    theme: 'Le mur increvable : encaisse tout, ne tombe jamais.',
    tiers: [
      { pieces: 2, type: 'max_pv_pct', base: 8 },
      { pieces: 3, type: 'dmg_reduction_pct', base: 6 },
      { pieces: 4, type: 'max_pv_pct', base: 10 },
    ],
  },
  {
    id: 'dragon',
    name: 'Écailles du Dragon',
    emoji: '🐲',
    theme: 'Offensif : frappe fort et se soigne en tapant.',
    tiers: [
      { pieces: 2, type: 'damage_pct', base: 8 },
      { pieces: 3, type: 'crit_pct', base: 6 },
      { pieces: 4, type: 'lifesteal_pct', base: 8 },
    ],
  },
  {
    id: 'lich',
    name: 'Voile de la Liche',
    emoji: '💀',
    theme: 'Vampirique : vole la vie à chaque coup critique.',
    tiers: [
      { pieces: 2, type: 'lifesteal_pct', base: 8 },
      { pieces: 3, type: 'crit_pct', base: 6 },
      { pieces: 4, type: 'damage_pct', base: 10 },
    ],
  },
  {
    id: 'void',
    name: 'Sceau du Néant',
    emoji: '🌌',
    theme: 'Défensif-punisseur : encaisse, dure, puis frappe juste.',
    tiers: [
      { pieces: 2, type: 'max_pv_pct', base: 8 },
      { pieces: 3, type: 'dmg_reduction_pct', base: 6 },
      { pieces: 4, type: 'crit_pct', base: 10 },
    ],
  },
  {
    id: 'apocalypse',
    name: 'Braise de l’Apocalypse',
    emoji: '🔥',
    theme: 'Hybride cupide : dégâts, survie et montagnes d’or.',
    tiers: [
      { pieces: 2, type: 'damage_pct', base: 8 },
      { pieces: 3, type: 'max_pv_pct', base: 10 },
      { pieces: 4, type: 'gold_pct', base: 40 },
    ],
  },
];
export const SET_BY_ID: Record<string, ItemSet> = Object.fromEntries(
  ITEM_SETS.map((s) => [s.id, s]),
);

/** Nombre de pièces équipées par set. */
export function setCounts(equipped: Equipped): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.setId) out[it.setId] = (out[it.setId] ?? 0) + 1;
  }
  return out;
}

/** Effets cumulés des SETS actifs (≥2 pièces), scalés par le niveau moyen des pièces. */
export function setEffects(equipped: Equipped): AggregatedEffects {
  const a = emptyEffects();
  const groups: Record<string, Item[]> = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.setId) (groups[it.setId] ??= []).push(it);
  }
  for (const [id, items] of Object.entries(groups)) {
    const def = SET_BY_ID[id];
    if (!def || items.length < 2) continue;
    const avgLvl = Math.round(items.reduce((s, i) => s + i.level, 0) / items.length);
    const mult = itemLevelMult(avgLvl);
    for (const t of def.tiers) {
      if (items.length < t.pieces) continue;
      applyEffect(a, t.type, Math.max(1, Math.round(t.base * mult)) / 100);
    }
  }
  a.dmgReduction = Math.min(0.5, a.dmgReduction);
  return a;
}

export function aggregateEffects(equipped: Equipped): AggregatedEffects {
  const a = emptyEffects();
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    applyEffect(a, it.effect.type, effectiveValue(it.effect, it.level) / 100);
    if (it.effect2) applyEffect(a, it.effect2.type, effectiveValue(it.effect2, it.level) / 100);
  }
  // Bonus de set (2/3/4 pièces) — ajoutés par-dessus les effets d'objet.
  const s = setEffects(equipped);
  a.damagePct += s.damagePct;
  a.critAdd += s.critAdd;
  a.dodgeAdd += s.dodgeAdd;
  a.lifesteal += s.lifesteal;
  a.dmgReduction += s.dmgReduction;
  a.maxPvPct += s.maxPvPct;
  a.goldPct += s.goldPct;
  a.dmgReduction = Math.min(0.5, a.dmgReduction); // plafond 50 %
  return a;
}

/** Combattant du joueur = stats (sport) + effets de l'équipement + `extra` (talents). */
export function playerWithGear(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  equipped: Equipped,
  extra: Partial<AggregatedEffects> = {},
  level = 1,
): Combatant {
  const base = playerCombatant(name, stats, level);
  const e = aggregateEffects(equipped);
  const damagePct = e.damagePct + (extra.damagePct ?? 0);
  const maxPvPct = e.maxPvPct + (extra.maxPvPct ?? 0);
  const critAdd = e.critAdd + (extra.critAdd ?? 0);
  const dodgeAdd = e.dodgeAdd + (extra.dodgeAdd ?? 0);
  // La Défense de la Puissance se cumule à la réduction du gear (plafond 50 %).
  const dmgReduction = Math.min(0.5, (base.dmgReduction ?? 0) + e.dmgReduction + (extra.dmgReduction ?? 0));
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
    strikes: base.strikes ?? 1,
  };
}
