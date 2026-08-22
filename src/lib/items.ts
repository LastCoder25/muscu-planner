// items.ts — équipement RPG (Phase 2c). RÈGLE : l'équipement ne donne PAS de
// stats (elles viennent du sport) — il donne des EFFETS de gameplay. Pur/testable.
import { playerCombatant, combatPower, type Combatant } from './combat';
import type { FamiliarSpecies } from '@/data/familiars';
import { PROCEDURAL } from '@/lib/proceduralContent';

// `familiar` = 5ᵉ emplacement PARALLÈLE (compagnon) : compté par aggregateEffects
// mais EXCLU de SLOTS (donc des drops normaux / sets / forge). Cf. src/data/familiars.ts.
export type ItemSlot = 'weapon' | 'armor' | 'accessory' | 'relic' | 'familiar';
export const FAMILIAR_SLOT: ItemSlot = 'familiar';
// RANGS façon manga (2026‑08‑18) : 10 rangs G (le plus bas) → SSS (le graal), qui
// remplacent les 5 anciennes raretés. Chaque rang a une bande de valeur DISJOINTE
// (un rang supérieur est TOUJOURS meilleur) et une couleur propre. La QUALITÉ (1→5,
// cf. rollStars) est un SOUS-RANG dans la bande — petite progression continue avant
// le saut de rang. Le rang droppable est gaté par la PROFONDEUR du contenu (le sport
// gate le niveau → le niveau gate le rang), SSS réservé au très long terme.
// NB : on garde le NOM de type `Rarity` et le champ `rarity` (moins de churn) ; ce
// sont désormais des rangs. RANK_ORDER = du plus bas au plus haut.
export type Rarity = 'G' | 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
export const RANK_ORDER: Rarity[] = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
// Couleur par rang (source unique JS ; le CSS miroir pose --rk par classe .r-*/.p-*).
export const RANK_COLOR: Record<Rarity, string> = {
  G: '#9a8f7e',
  F: '#8f9c86',
  E: '#6bd18a',
  D: '#4ec6d6',
  C: '#5a9bff',
  B: '#b07cff',
  A: '#ffd23f',
  S: '#ff9a3f',
  SS: '#ff5b5b',
  SSS: '#ff5cd8',
};
// Mapping des ANCIENNES raretés (objets sauvegardés en JSONB) vers les nouveaux rangs,
// calé sur la proximité de multiplicateur (divin≈SSS, légendaire≈S, épique≈B, rare≈D,
// commun≈F). `normRank` normalise n'importe quelle chaîne en un rang valide.
const LEGACY_RANK: Record<string, Rarity> = {
  common: 'F',
  rare: 'D',
  epic: 'B',
  legendary: 'S',
  divin: 'SSS',
};
export function normRank(r: string | undefined | null): Rarity {
  if (r && (RANK_ORDER as string[]).includes(r)) return r as Rarity;
  return (r && LEGACY_RANK[r]) || 'G';
}

// Effets « signature » (un par objet). value en points de %. RÈGLE : tous les
// effets doivent GRANDIR avec le niveau de l'objet (pas d'effet « drapeau »
// binaire — ils ne récompenseraient pas la montée en niveau).
export type EffectType =
  | 'damage_pct' // arme : + dégâts
  | 'crit_pct' // arme/relique : + chance de critique
  | 'lifesteal_pct' // arme : vol de vie
  | 'dmg_reduction_pct' // armure : dégâts reçus réduits
  | 'max_pv_pct' // armure : + PV max
  | 'gold_pct' // accessoire : + or gagné
  // Effets SIGNATURE (conditionnels, débloqués tard → nouveauté de haut niveau).
  | 'execute_pct' // arme : + dégâts quand l'ennemi est bas (< 25 % PV)
  | 'rage_pct' // relique : + dégâts quand TU es bas (< 30 % PV)
  | 'momentum_pct' // arme : + dégâts par coup consécutif porté (cumul)
  | 'thorns_pct'; // armure : renvoie une part des dégâts reçus à l'attaquant (épines)

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
  locked?: boolean; // 🔒 protégé : exclu de la casse/vente (en masse ET individuelle)
  species?: string; // slot 'familiar' uniquement : id de la RACE (cf. FAMILIAR_SPECIES)
  roll?: number; // qualité du roll de l'effet principal (0..1 dans la bande ±20 %) → étoiles
  fxp?: number; // familier : progression d'INFUSION vers le prochain pas de tier (rang+qualité)
  enchant?: number; // ENCHANT +N (façon L2) — magnitude par-dessus le grade. Défaut 0. (étape 1)
}

// Qualité de roll → nombre d'ÉTOILES (1..5) : où l'effet est tombé dans la bande de
// variance ±20 %. 5★ = roll quasi max (proche du +20 %), 1★ = bas de fourchette.
// Aide le joueur à juger « bon roll ou pas » sans calcul.
export function rollStars(roll: number | undefined): number {
  if (roll == null) return 0; // objet legacy sans roll → pas d'étoiles
  return Math.min(5, 1 + Math.floor(Math.max(0, Math.min(1, roll)) * 5));
}
// QUALITÉ = SOUS-RANG (1→5) dans la bande du rang. Multiplicateur DISCRET, de 1,0
// (qualité 1 = plancher du rang) à 1,10 (qualité 5 = presque le rang suivant). La
// bande NE DÉBORDE JAMAIS sur le rang au-dessus : l'écart entre rangs est +16,6 %
// (RANK_MULT), la qualité n'en consomme que ~10 % → il reste un saut de rang ressenti
// (+6 %). Ainsi qualité 1→5 = petite montée continue, et le passage de rang = vrai
// palier. La qualité est figée au drop puis suit le niveau (effectiveValue).
export function starQualityMult(stars: number): number {
  const s = Math.min(5, Math.max(1, Math.round(stars)));
  return 1 + (s - 1) * 0.025; // Q1 1,000 · Q2 1,025 · Q3 1,050 · Q4 1,075 · Q5 1,100
}

// L'effet grandit de +5 % de la base par niveau au-dessus de 1. Pente VOLONTAIREMENT
// douce (2026‑08‑08) : le gear reste un GATE progressif (plus j'ai de bon gear,
// plus mon % monte) et n'explose pas en multiplicateur ×2 qui trivialise les boss.
export function itemLevelMult(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.05;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENCHANT — VESTIGE DE MIGRATION UNIQUEMENT. L'axe enchant des OBJETS est retiré
// (ticket 7acb1e7c) : ne restent que les 2 helpers appelés au CHARGEMENT pour baker
// l'ancien enchant / niveau dans `effect.value` (character.normalizeRow), plus `enchantMult`
// réutilisé par l'échelle des talents (talents.ts). Le moteur « gamble » (attemptEnchant/
// canEnchant/enchantSuccessRate/enchantedValue) a été supprimé avec l'UI d'enchant.
export const ENCHANT_MAX = 12; // plafond historique (préserve l'échelle à la migration)
const ENCHANT_STEP = 0.33; // +N → × (1 + 0,33·N)
/** Multiplicateur de magnitude d'un +N (migration des sauvegardes + échelle des talents). */
export function enchantMult(enchant: number): number {
  return 1 + Math.max(0, Math.min(ENCHANT_MAX, enchant)) * ENCHANT_STEP;
}
/** MIGRATION : ancien NIVEAU d'objet → ENCHANT équivalent (magnitude préservée). */
export function levelToEnchant(level: number): number {
  const target = itemLevelMult(Math.max(1, level)) - 1; // gain relatif de l'ancien niveau
  return Math.max(0, Math.min(ENCHANT_MAX, Math.round(target / ENCHANT_STEP)));
}

// CHASSE AU LOOT (2026‑08‑15, ticket 355753d2) : la MAGNITUDE DE BASE d'un drop
// croît avec le niveau du DONJON/palier où il tombe → un objet d'un donjon profond
// est objectivement meilleur (une fois les deux infusés) qu'un objet peu profond →
// on veut remplacer son stuff en farmant plus profond. L'infusion (niveau) reste la
// grinde ; la SOURCE fixe le plafond de qualité. Modeste (~+1,5×/niv de fond) pour
// ne pas casser l'équilibrage nu.
const MAGNITUDE_PER_LEVEL = 0.015;
export function dropMagnitude(dropLevel: number): number {
  return 1 + Math.max(0, dropLevel - 1) * MAGNITUDE_PER_LEVEL;
}
/** Valeur réelle d'un effet au niveau de l'objet. */
export function effectiveValue(effect: ItemEffect, level: number): number {
  return Math.max(1, Math.round(effect.value * itemLevelMult(level)));
}

// ── Économie d'objets : Poussière (évolution) & or (vente) ──
// Index 0..9 du rang → sert aux barèmes croissants (poussière / or / coûts).
export function rankIndex(r: Rarity): number {
  return Math.max(0, RANK_ORDER.indexOf(r));
}
/** Arrondit une magnitude d'effet à 1 décimale (au lieu d'un entier) → la qualité
 *  (+2,5 %/★) reste visible sur les petites stats (ticket df3feade). Partagé avec la
 *  migration des sauvegardes (character.normalizeRow) pour une précision cohérente. */
export const round1 = (x: number): number => Math.round(x * 10) / 10;
// Poussière/or de base par rang (croissance géométrique douce, ~×1,5 et ×1,6 par rang).
const DUST_BY_RARITY: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, Math.round(4 * Math.pow(1.5, i))]),
) as Record<Rarity, number>;
// Or de vente : base + ratio relevés (ticket b63f2211) → vendre un doublon de haut rang
// rapporte une somme qui COMPTE face aux runs (A ≈ 730, SSS ≈ 3550), pas 134.
const GOLD_BY_RARITY: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, Math.round(30 * Math.pow(1.7, i))]),
) as Record<Rarity, number>;
// Le coût d'amélioration monte avec le rang (un rang haut = puits plus profond).
// ADOUCI (infusion = progression verticale obligatoire, pas un luxe) : sans ça, tout
// monter à son niveau serait un mur de grind. Linéaire léger sur 10 rangs.
const RARITY_COST_MULT: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, 1 + i * 0.28]),
) as Record<Rarity, number>;

/** Coût en poussière pour passer du niveau `level` au suivant, selon la rareté.
 *  SUPER-LINÉAIRE (terme quadratique 2026‑08‑18) : le robinet de poussière suit le
 *  volume de runs (∝ niveau), donc un coût linéaire laissait la poussière déborder et
 *  le stuff toujours maxé → l'infusion cesse d'être un objectif. `level²×0.4` fait de
 *  l'infusion un vrai puits qui reste un but en fin de partie. */
export function upgradeCost(level: number, rarity: Rarity): number {
  return Math.round((5 + level * 3 + level * level * 0.4) * RARITY_COST_MULT[rarity]);
}
/** Coût TOTAL pour construire un objet du niveau 1 jusqu'à `level` (sous C, tout
 *  drop part du niveau 1). Sert au recyclage history-independent + à l'affichage. */
export function fullInfuseCost(level: number, rarity: Rarity): number {
  let sum = 0;
  for (let k = 1; k < level; k++) sum += upgradeCost(k, rarity);
  return sum;
}
/** Coût pour infuser un objet de son niveau ACTUEL jusqu'au cap `playerLevel`. */
export function infuseToMaxCost(it: Item, playerLevel: number): number {
  let sum = 0;
  for (let k = it.level; k < playerLevel; k++) sum += upgradeCost(k, it.rarity);
  return sum;
}
/** Poussière déjà investie dans un objet (des niveaux payés : baseLevel → level). */
export function investedDust(it: Item): number {
  let sum = 0;
  for (let k = it.baseLevel ?? 1; k < it.level; k++) sum += upgradeCost(k, it.rarity);
  return sum;
}
/** Casser un objet → base de rareté + une FRACTION du coût de construction 1→niveau.
 *  HISTORY-INDEPENDENT (refonte C) : ne dépend QUE de rareté + niveau actuel, donc un
 *  objet DROPPÉ au niv.N se recycle comme un niv.1 INFUSÉ →N (fin de l'incohérence).
 *  Faucet-free car tout drop part du niveau 1 (coût(1→1)=0). */
export function salvageValue(it: Item): number {
  return DUST_BY_RARITY[it.rarity];
}
/** Or obtenu en vendant un objet (∝ rang). */
export function sellValue(it: Item): number {
  return GOLD_BY_RARITY[it.rarity];
}
/** Peut-on améliorer cet objet ? (poussière suffisante + pas au plafond). */
export function canUpgrade(it: Item, dust: number, playerLevel: number): boolean {
  return it.level < playerLevel && dust >= upgradeCost(it.level, it.rarity);
}

export type Equipped = Partial<Record<ItemSlot, Item>>;

// Loadout : un « set » d'équipement rangé (les 4 slots gear uniquement — le familier
// n'est jamais rangé). Ranger déplace le stuff équipé dans un loadout (joueur nu) ; les
// objets rangés ne sont ni dans le sac ni pris en compte au combat. Max 3 loadouts.
export interface Loadout {
  items: Equipped;
}
export const MAX_LOADOUTS = 3;

/** Échange les 4 slots gear (weapon/armor/accessory/relic) entre l'équipement et un
 *  loadout → renvoie le nouvel équipement + les items du loadout. Le familier reste
 *  équipé (non touché). Sert au « ranger » (loadout vide) comme au swap de sets. */
export function swapLoadoutGear(
  equipped: Equipped,
  loadoutItems: Equipped,
): { equipped: Equipped; loadoutItems: Equipped } {
  const eq: Equipped = { ...equipped };
  const lo: Equipped = { ...loadoutItems };
  for (const slot of SLOTS) {
    const held = eq[slot];
    const stored = lo[slot];
    if (stored) eq[slot] = stored;
    else delete eq[slot];
    if (held) lo[slot] = held;
    else delete lo[slot];
  }
  return { equipped: eq, loadoutItems: lo };
}

// Récompense « au choix » d'un boss : 3 candidats tirés, le joueur en garde 1.
export type RewardCandidate = { kind: 'item'; item: Item } | { kind: 'gold'; gold: number };
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
  familiar: 'Familier',
};
export const SLOT_EMOJI: Record<ItemSlot, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  accessory: '💍',
  relic: '🔮',
  familiar: '🐾',
};
// Libellé = la lettre du rang elle-même (identité manga : « G », « SSS »).
export const RARITY_LABEL: Record<Rarity, string> = Object.fromEntries(
  RANK_ORDER.map((r) => [r, r]),
) as Record<Rarity, string>;

// Rang numérique (0..9) pour comparer deux objets (potentiel à niveau égal).
export const RARITY_RANK: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, i]),
) as Record<Rarity, number>;

// Multiplicateur de magnitude par RANG (plancher de la bande = qualité 1). Géométrique
// (ratio 1,166) : SSS×qualité5 (×1,10) ≈ 3,98 → plafond de puissance ≈ divin d'avant,
// et les bandes restent DISJOINTES (1,166 > qualité max 1,10 → un rang > toujours
// meilleur, avec un saut de +6 % au passage). Calibré par simulation (2026‑08‑18).
export const RARITY_MULT: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, Math.round(0.908 * Math.pow(1.166, i) * 1000) / 1000]),
) as Record<Rarity, number>;

// Effet possible par slot + valeur de base (avant rareté/niveau).
// Niveau minimum pour qu'une stat « exotique » puisse tomber sur un drop (pool
// progressif) : le début est simple (dégâts/PV/or), la profondeur ajoute crit,
// vol de vie puis réduction. Les stats absentes d'ici tombent dès le niveau 1.
const EFFECT_MIN_LEVEL: Partial<Record<EffectType, number>> = {
  crit_pct: 5,
  lifesteal_pct: 8,
  dmg_reduction_pct: 10,
  // Effets SIGNATURE : débloqués TARD → il reste des choses à découvrir passé le
  // niv.10 (le pool basique se tarissait sinon). Rares (haut niveau de donjon).
  execute_pct: 12,
  momentum_pct: 18,
  rage_pct: 15,
  thorns_pct: 9, // épines : build défensif « qui pique » → débloqué en profondeur
};

const SLOT_EFFECTS: Record<ItemSlot, { type: EffectType; base: number }[]> = {
  weapon: [
    { type: 'damage_pct', base: 8 },
    { type: 'crit_pct', base: 4 },
    { type: 'lifesteal_pct', base: 6 },
    { type: 'execute_pct', base: 12 }, // signature : achève les ennemis bas
    { type: 'momentum_pct', base: 3 }, // signature : monte en puissance dans le combat
  ],
  armor: [
    { type: 'dmg_reduction_pct', base: 6 },
    { type: 'max_pv_pct', base: 10 },
    { type: 'thorns_pct', base: 12 }, // épines : renvoie des dégâts (build tanky offensif)
  ],
  // L'accessoire roule un effet de COMBAT (l'or ne servait à rien en combat → un
  // accessoire +or était un slot « mort », personne ne le prenait ; retiré).
  accessory: [
    { type: 'crit_pct', base: 5 },
    { type: 'lifesteal_pct', base: 5 },
    { type: 'dmg_reduction_pct', base: 5 },
  ],
  relic: [
    { type: 'crit_pct', base: 6 },
    { type: 'max_pv_pct', base: 8 },
    { type: 'rage_pct', base: 12 }, // signature : fureur quand tu es au bord de la mort
  ],
  // Familier : l'effet vient de la RACE (cf. rollFamiliar), pas de ce pool (jamais
  // tiré par pick(rng, SLOTS)). Entrée requise par le type Record<ItemSlot,…>.
  familiar: [{ type: 'damage_pct', base: 6 }],
};

/** Base canonique par type d'effet (1re occurrence dans SLOT_EFFECTS) → sert à valoriser
 *  une stat de SET choisie par THÈME (indépendante du slot). Dérivée pour éviter la dérive. */
const EFFECT_BASE: Record<EffectType, number> = (() => {
  const m = {} as Record<EffectType, number>;
  for (const slot of Object.keys(SLOT_EFFECTS) as ItemSlot[])
    for (const e of SLOT_EFFECTS[slot]) if (m[e.type] === undefined) m[e.type] = e.base;
  return m;
})();

/** Effets réellement disponibles pour un slot À CE NIVEAU (pool progressif — les
 *  effets exotiques/signature ne se débloquent qu'en profondeur via EFFECT_MIN_LEVEL).
 *  Fallback PV si rien n'est débloqué. Partagé par rollDrop / forge / reroll. */
function availableEffects(slot: ItemSlot, level: number): { type: EffectType; base: number }[] {
  const avail = SLOT_EFFECTS[slot].filter((e) => (EFFECT_MIN_LEVEL[e.type] ?? 1) <= level);
  return avail.length ? avail : [{ type: 'max_pv_pct', base: 6 }];
}

// Noms ÉVOCATEURS des objets à effet signature (« légendaires nommés » → le drop
// devient un événement, pas un « Lame mythique » de plus).
const SIGNATURE_NAMES: Partial<Record<EffectType, string[]>> = {
  execute_pct: ['Guillotine', 'Couperet du Bourreau', 'Faux des Âmes'],
  momentum_pct: ['Déferlante', 'Crescendo', 'Élan Implacable'],
  rage_pct: ['Cœur du Berserk', 'Fureur Écarlate', 'Rage du Damné'],
};

// Noms d'objets par slot (saveur).
const NAMES: Record<ItemSlot, string[]> = {
  weapon: ['Lame', 'Hache', 'Masse', 'Dague', 'Fléau'],
  armor: ['Plastron', 'Cotte', 'Cuirasse', 'Harnois'],
  accessory: ['Anneau', 'Amulette', 'Talisman', 'Bracelet'],
  relic: ['Éclat', 'Totem', 'Sceau', 'Idole'],
  familiar: ['Compagnon'], // nom réel = nom de la race (cf. rollFamiliar)
};
const RARITY_ADJ: Record<Rarity, string> = {
  G: 'brut',
  F: 'usé',
  E: 'affûté',
  D: 'aiguisé',
  C: 'runique',
  B: 'enchanté',
  A: 'héroïque',
  S: 'mythique',
  SS: 'légendaire',
  SSS: 'divin',
};

/** Formate une valeur d'effet avec 1 décimale au plus (trim .0) → la qualité (+2,5 %/★)
 *  reste visible même sur les petites stats (ex. B★1 vs B★5, ticket df3feade). */
export function fmtEffectValue(v: number): string {
  return (Math.round(v * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
/** Libellé d'un effet à partir de sa VALEUR déjà calculée. */
export function effectLabelFor(type: EffectType, v: number): string {
  const s = fmtEffectValue(v);
  switch (type) {
    case 'damage_pct':
      return `+${s}% dégâts`;
    case 'crit_pct':
      return `+${s}% critique`;
    case 'lifesteal_pct':
      return `+${s}% vol de vie`;
    case 'dmg_reduction_pct':
      return `−${s}% dégâts reçus`;
    case 'max_pv_pct':
      return `+${s}% PV`;
    case 'gold_pct':
      return `+${s}% or`;
    case 'execute_pct':
      return `+${s}% dégâts (ennemi < 25% PV)`;
    case 'rage_pct':
      return `+${s}% dégâts (toi < 30% PV)`;
    case 'momentum_pct':
      return `+${s}% dégâts/coup (cumul)`;
    case 'thorns_pct':
      return `renvoie ${s}% des dégâts reçus`;
  }
}
/** Libellé de l'effet à un niveau d'objet donné (valeur réelle) — legacy (familiers). */
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
    case 'execute_pct':
      return `+${v}% dégâts (ennemi < 25% PV)`;
    case 'rage_pct':
      return `+${v}% dégâts (toi < 30% PV)`;
    case 'momentum_pct':
      return `+${v}% dégâts/coup (cumul)`;
    case 'thorns_pct':
      return `renvoie ${v}% des dégâts reçus`;
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

// ── Tirage de RANG (gaté par la profondeur) ──
// Plafond de rang selon le NIVEAU du contenu (racine → RAPIDE tôt, LENT tard) : le
// 1er mois on traverse G→D, puis chaque rang haut coûte de plus en plus de niveaux
// (SSS ≈ niv.90 → graal long terme). Calibré par simulation (2026‑08‑18).
export function rankCeilingForLevel(level: number): number {
  return Math.min(9, Math.max(0, Math.floor(Math.sqrt(Math.max(0, level)) * 1.03)));
}
/** CRAN de grade MAX DROPPABLE (0..49 = rang×5 + qualité−1) à un niveau donné = rang √-gaté,
 *  qualité 5. (L'infusion, elle, plafonne à ★5 du rang de DROP — cf. `gradeCapForTier`.) */
export function maxGradeCran(level: number): number {
  return rankCeilingForLevel(level) * 5 + 4;
}
// Gaussienne seedée (Box-Muller) — 2 tirages rng, déterministe.
function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── FRISE CONTINUE de crans (2026‑08‑19) ──
// Rangs + qualités forment UNE seule échelle de 50 crans (tier = rang×5 + (qualité−1)).
// Le drop est une FENÊTRE GLISSANTE sur cette frise : son centre avance CONTINÛMENT avec
// le niveau (≈ 1 cran/niveau tôt, ralentit en √ → SSS reste end‑game) → la QUALITÉ monte
// à l'intérieur d'un rang à mesure qu'on progresse (ex. F★1 tôt → F★5 en fin de bande),
// puis on bascule sur le rang suivant avec chevauchement (encore un peu de l'ancien rang,
// du bas du nouveau). Asymétrique : longue traîne BASSE (fourrage à infuser), courte
// pointe HAUTE (drop chanceux) que la `luck` épaissit et pousse vers le haut.
// NB : c'est un changement de DISTRIBUTION de tirage — la valeur d'un cran (RARITY_MULT ×
// starQualityMult) est inchangée → équilibrage combat intact.

/** Plafond de cran CONTINU (0..49) — version fine du plafond de rang (même courbe √). */
export function tierCeilForLevel(level: number): number {
  return Math.min(49, Math.max(0, Math.sqrt(Math.max(0, level)) * 1.03 * 5 + 4));
}

const TIER_LO_WIDTH = 4; // traîne basse ≈ 0,8 rang (fourrage à infuser)

/** Paramètres de la fenêtre glissante pour un contenu donné (source UNIQUE partagée par
 *  `rollTier` et `dropBand` → l'affichage de la bande de drop suit toujours le tirage réel).
 *  - `mode` : pic, calé sur le BAS du rang courant + fraction (PAS de +4) → au bas d'un rang
 *    le pic est à ★1, en haut de bande à ★5 (la qualité monte dans la bande), avance ≈ 1
 *    cran/niveau tôt puis ralentit en √ ; petit coup de pouce luck ;
 *  - `hiWidth` : pointe haute, épaissie par la luck (re-pondère vers la droite) ;
 *  - `hardCap` : plafond DUR de rang (√) — ni la luck ni la traîne ne le passent. */
function tierWindow(level: number, luck: number, floorBonus: number) {
  const l = Math.min(1, Math.max(0, luck));
  const hardCap = rankCeilingForLevel(level) * 5 + 4;
  const center = Math.sqrt(Math.max(0, level)) * 1.03 * 5;
  const mode = Math.min(hardCap, center + l * 1.2 + Math.max(0, floorBonus));
  return { mode, loWidth: TIER_LO_WIDTH, hiWidth: 1.6 + l * 2.2, hardCap };
}

/** Tire un PALIER (0..49) = rang×5 + (qualité-1) via la fenêtre glissante ci‑dessus.
 *  - `level` : niveau du CONTENU (donjon/boss/labyrinthe) → position de la fenêtre ;
 *  - `luck` (0..1) : épaissit la pointe haute (favorise la droite), sans passer le plafond ;
 *  - `floorBonus` : décale le pic vers le haut (Autel des boss), en crans.
 *  Renvoie { rank, quality, roll } où roll∈[0,1] encode la qualité (rollStars le relit). */
export function rollTier(
  rng: () => number,
  level: number,
  luck = 0,
  floorBonus = 0,
): { rank: Rarity; quality: number; roll: number } {
  const { mode, loWidth, hiWidth, hardCap } = tierWindow(level, luck, floorBonus);
  const g = gaussian(rng);
  let tier = Math.round(mode + (g >= 0 ? g * hiWidth : g * loWidth));
  tier = Math.min(hardCap, Math.max(0, tier)); // plafond dur + plancher mou (0)
  return tierToRankQ(tier);
}

/** Convertit un cran 0..49 → { rank, quality, roll } (roll encode la qualité). */
export function tierToRankQ(tier: number): { rank: Rarity; quality: number; roll: number } {
  const t = Math.min(49, Math.max(0, Math.round(tier)));
  const quality = (t % 5) + 1;
  return { rank: RANK_ORDER[Math.floor(t / 5)]!, quality, roll: (quality - 0.5) / 5 };
}

/** Bande de drop TYPIQUE d'un contenu (≈ 10e→90e centile de la fenêtre) → pour afficher
 *  « ce donjon drop E★3 → D★1 ». Déterministe (analytique, pas de rng). */
export function dropBand(
  level: number,
  luck = 0,
  floorBonus = 0,
): { lo: { rank: Rarity; quality: number }; hi: { rank: Rarity; quality: number } } {
  const { mode, loWidth, hiWidth, hardCap } = tierWindow(level, luck, floorBonus);
  const clamp = (t: number) => Math.min(hardCap, Math.max(0, Math.round(t)));
  const lo = tierToRankQ(clamp(mode - 1.3 * loWidth));
  const hi = tierToRankQ(clamp(mode + 1.3 * hiWidth));
  return { lo: { rank: lo.rank, quality: lo.quality }, hi: { rank: hi.rank, quality: hi.quality } };
}

/** Libellé compact de la bande de drop : « E★3 → D★1 » (ou « E★2 → E★5 » même rang). */
export function dropBandLabel(level: number, luck = 0, floorBonus = 0): string {
  const { lo, hi } = dropBand(level, luck, floorBonus);
  const f = (x: { rank: Rarity; quality: number }) => `${x.rank}★${x.quality}`;
  return lo.rank === hi.rank && lo.quality === hi.quality ? f(lo) : `${f(lo)} → ${f(hi)}`;
}
/** Rang seul (utilitaires forge/familier qui n'ont pas besoin de la qualité fine). */
export function rollRarity(rng: () => number, luck = 0, level = 1): Rarity {
  return rollTier(rng, level, luck).rank;
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
    rollFloor?: number; // 0..1 : plancher de qualité de roll (Autel des boss) → meilleures étoiles
  },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? 0.6 : 0.3;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  const lvl = opts.level ?? 1;
  // RANG + QUALITÉ gatés par la PROFONDEUR du contenu (rollTier) : le donjon plafonne
  // le rang droppable, la `luck` (profondeur/fiole) et `rollFloor` (Autel) remontent la
  // cloche. Un perso haut niveau dans un donjon bas ne trouve QUE du bas rang.
  const floorTiers = Math.round(Math.min(1, Math.max(0, opts.rollFloor ?? 0)) * 8); // 0..8 paliers
  const { rank: rarity, quality, roll } = rollTier(rng, lvl, opts.luck ?? 0, floorTiers);
  // Pool de stats PROGRESSIF : au début, seules les stats basiques (dégâts/PV)
  // tombent ; les stats exotiques se débloquent en montant (cf. EFFECT_MIN_LEVEL).
  const pool = availableEffects(slot, lvl);
  const chosen = pick(rng, pool);
  // value = base × RANG × QUALITÉ. La PROFONDEUR est encodée par le RANG (gate) → plus
  // de multiplicateur de magnitude par niveau ici (sinon deux objets même rang mais
  // profondeurs différentes auraient des valeurs différentes → chevauchement).
  const vf = starQualityMult(quality);
  const rollValue = (b: number) => Math.max(1, round1(b * RARITY_MULT[rarity] * vf));
  const value = rollValue(chosen.base);
  // Objet à effet SIGNATURE → nom évocateur (« Guillotine ») ; sinon nom + adjectif.
  const sigNames = SIGNATURE_NAMES[chosen.type];
  const name = sigNames ? pick(rng, sigNames) : `${pick(rng, NAMES[slot])} ${RARITY_ADJ[rarity]}`;
  // REFONTE C : tout drop part du NIVEAU 1 (identité pure = rang + affixe). Toute la
  // puissance se construit ensuite à la poussière jusqu'au niveau du joueur.
  const level = 1;
  // PAYOFF HAUT-RANG : SS/SSS (index ≥ 8) roulent un DEUXIÈME effet distinct → un objet
  // de très haut rang est « waouh » (double affixe), pas juste un ×magnitude de plus.
  let effect2: ItemEffect | undefined;
  if (rankIndex(rarity) >= 8) {
    const others = pool.filter((e) => e.type !== chosen.type);
    if (others.length) {
      const second = pick(rng, others);
      effect2 = { type: second.type, value: rollValue(second.base) };
    }
  }
  return {
    slot,
    name,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value }, // 1 stat (le set fait la synergie) — sauf haut rang (2 effets)
    ...(effect2 ? { effect2 } : {}),
    roll,
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
  opts: { setId: string; level: number; luck?: number; preferSlot?: ItemSlot; rollFloor?: number },
): Omit<Item, 'id'> {
  const set = SET_BY_ID[opts.setId];
  const slot = opts.preferSlot ?? pick(rng, SLOTS);
  // Le RANG d'une pièce de set est gaté par le niveau du PALIER du boss (rollTier),
  // remonté d'un cran (les boss sont une source solide) + `rollFloor` (Autel). La
  // qualité vient du même tirage → un set haut palier bat un set bas palier.
  const floorTiers = Math.round(Math.min(1, Math.max(0, opts.rollFloor ?? 0)) * 8) + 3; // +3 : boss généreux
  const { rank: rarity, quality, roll } = rollTier(rng, opts.level, opts.luck ?? 0, floorTiers);
  const vf = starQualityMult(quality);
  // STAT DE LA PIÈCE = tirée dans le THÈME DU SET (types de ses paliers), pas dans le pool
  // générique du slot → un set a des stats COHÉRENTES avec son identité (ex. Écailles du
  // Dragon = dégâts/crit/vol de vie sur toutes ses pièces), au lieu de stats aléatoires
  // hors-thème. Déterministe par slot (chaque emplacement du set = une stat stable du thème).
  const theme = set ? [...new Set(set.tiers.map((t) => t.type))] : [];
  const chosenType: EffectType = theme.length
    ? theme[SLOTS.indexOf(slot) % theme.length]!
    : pick(rng, SLOT_EFFECTS[slot]).type;
  const base = EFFECT_BASE[chosenType] ?? 8;
  const value = Math.max(1, round1(base * RARITY_MULT[rarity] * vf));
  const noun = pick(rng, NAMES[slot]);
  const level = 1; // REFONTE C : la pièce de set arrive niv.1 (identité) → à infuser
  return {
    slot,
    name: set ? `${noun} · ${set.name}` : `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: set ? set.emoji : SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosenType, value }, // 1 stat COHÉRENTE au set + synergie (bonus 2/3/4 pièces)
    ...(set ? { setId: opts.setId } : {}),
    roll,
  };
}

// ── Familiers (compagnons) — slot parallèle, monté aux PIERRES MAGIQUES 💎 ──

/** `true` si l'objet est un familier (slot compagnon). */
export function isFamiliar(it: Item | null | undefined): boolean {
  return !!it && it.slot === FAMILIAR_SLOT;
}

/** Coût en PIERRES MAGIQUES pour monter un familier du niveau `level` au suivant
 *  (plus cher que la poussière d'un objet : les pierres sont rares). Cap = niveau joueur. */
export function familiarStoneCost(level: number, rarity: Rarity): number {
  return Math.round((3 + level * 2) * RARITY_COST_MULT[rarity]);
}

// Ordre des rangs (fusion : 3 d'un rang → 1 du rang juste au-dessus).
const RARITY_ORDER: Rarity[] = RANK_ORDER;
/** Rang juste au-dessus, ou `null` si déjà au maximum (SSS). */
export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITY_ORDER.indexOf(r);
  return i >= 0 && i < RARITY_ORDER.length - 1 ? RARITY_ORDER[i + 1]! : null;
}

// Effets SIGNATURE possibles sur un familier (2ᵉ effet conditionnel, en plus du bonus
// de race). Bases modestes → une cerise, pas un doublon d'objet ; grandit à l'infusion.
const FAMILIAR_SIGNATURE: { type: EffectType; base: number }[] = [
  { type: 'execute_pct', base: 10 },
  { type: 'rage_pct', base: 10 },
  { type: 'momentum_pct', base: 3 },
];
// Chance de rouler un effet signature selon le RANG : nulle en bas, croissante vers
// le haut → un familier SIGNATURE est une trouvaille désirable (« option »).
function familiarSigChance(rarity: Rarity): number {
  return Math.min(0.65, Math.max(0, (rankIndex(rarity) - 1) * 0.08));
}

/** Tire un FAMILIER d'une race donnée. L'effet = le bonus de la race, magnitude
 *  variable (rareté × niveau × variance ±20 %), comme un objet. En plus, selon la
 *  rareté, une CHANCE de rouler un effet SIGNATURE (execute/rage/momentum) en `effect2`
 *  → familier « buff constant + option signature ». `opts.rarity` force la rareté
 *  (fusion) ; sinon tirée au hasard. Pur/testable. */
export function rollFamiliar(
  rng: () => number,
  species: FamiliarSpecies,
  opts: { level: number; luck?: number; rarity?: Rarity },
): Omit<Item, 'id'> {
  // RANG + QUALITÉ comme les objets : tous deux via rollTier → la LUCK (élevée dans les
  // labyrinthes profonds) pousse aussi la QUALITÉ vers le haut (avant : rang biaisé par la
  // luck mais qualité uniforme 20 %). Rareté forcée (fusion) → qualité uniforme.
  let rarity: Rarity;
  let quality: number;
  if (opts.rarity) {
    rarity = opts.rarity;
    quality = 1 + Math.floor(rng() * 5); // 1..5 uniforme
  } else {
    const t = rollTier(rng, opts.level, opts.luck ?? 0);
    rarity = t.rank;
    quality = t.quality;
  }
  const vf = starQualityMult(quality);
  const value = Math.max(1, round1(species.base * RARITY_MULT[rarity] * vf));
  const level = 1; // REFONTE C : le familier arrive niv.1 (identité de race) → à infuser
  let effect2: ItemEffect | undefined;
  if (rng() < familiarSigChance(rarity)) {
    const sig = FAMILIAR_SIGNATURE[Math.floor(rng() * FAMILIAR_SIGNATURE.length)]!;
    effect2 = {
      type: sig.type,
      value: Math.max(1, round1(sig.base * RARITY_MULT[rarity] * vf)),
    };
  }
  return {
    slot: FAMILIAR_SLOT,
    name: species.name,
    emoji: species.emoji,
    rarity,
    level,
    baseLevel: level,
    effect: { type: species.effect, value },
    ...(effect2 ? { effect2 } : {}),
    species: species.id,
    roll: (quality - 0.5) / 5, // qualité relue par rollStars (comme les objets)
  };
}

// ── Infusion des familiers : monte le TIER (rang + qualité) en sacrifiant d'autres
// familiers (le tier grimpe = qualité d'abord, puis saut de rang). Le NIVEAU reste
// piloté par les pierres 💎 (familiarStoneCost). Cf. ticket f93c219b. ──

/** Tier 0..49 d'un familier/objet = rang×5 + (qualité−1). */
export function tierIndexOf(it: { rarity: Rarity; roll?: number }): number {
  return rankIndex(it.rarity) * 5 + (Math.max(1, rollStars(it.roll)) - 1);
}
// ── Infusion de grade (talents & familiers), modèle « polissage de qualité » (2026‑08‑21) ──
// L'infusion ne fait plus QUE monter la QUALITÉ à l'intérieur du rang de DROP (★1→★5) ; le
// RANG vient uniquement des drops (contenu plus profond). Coûts/gains adossés à la valeur
// d'un cran (RARITY_MULT × qualité) avec une PERTE 2:1 : bâtir ★1→★5 coûte 200 mais un ★5
// sacrifié ne rend que ~la moitié → pas d'infusion sans perte (on nourrit un gardé avec du
// surplus, on ne recycle jamais un objet monté pour du profit).
const QUALITY_STEP_COST = [30, 45, 60, 65]; // ★1→2, ★2→3, ★3→4, ★4→5 (cumul = 200, à mult 1)
const QUALITY_BUILD = [0, 30, 75, 135, 200]; // coût cumulé de build par qualité (★1..★5)
const RECYCLE_FLOOR = 15; // gain plancher d'un ★1 brut (matière première)
const RECYCLE_LOSS = 0.5; // on ne récupère que la moitié de l'investissement qualité

/** Plafond de cran atteignable par infusion = ★5 du rang COURANT (= rang de drop, car
 *  l'infusion ne franchit jamais un rang). `floor(tier/5)*5 + 4`. */
export function gradeCapForTier(tier: number): number {
  return Math.floor(Math.max(0, tier) / 5) * 5 + 4;
}
/** Coût (ink_dust/fragments) d'UN pas de qualité depuis `tier`, scalé par le rang (polir un
 *  rang haut coûte plus). ★5 (plafond) → renvoie le coût du dernier pas (jamais dépensé : le
 *  garde-fou de plafond bloque avant). */
export function gradeStepCost(tier: number): number {
  const t = Math.max(0, tier);
  const p = t % 5; // 0..4 = position de qualité (0 = ★1)
  const step = QUALITY_STEP_COST[Math.min(3, p)]!;
  return Math.round(step * RARITY_MULT[RANK_ORDER[Math.floor(t / 5)]!]);
}
/** XP d'infusion rendue en RECYCLANT un talent/familier de `tier` = plancher + moitié de son
 *  investissement qualité, scalé par le rang. → perte 2:1 vs le coût de build. */
export function gradeRecycleYield(tier: number): number {
  const t = Math.max(0, tier);
  const q = t % 5; // 0..4 = qualité-1
  return Math.round(
    RARITY_MULT[RANK_ORDER[Math.floor(t / 5)]!] *
      (RECYCLE_FLOOR + RECYCLE_LOSS * QUALITY_BUILD[q]!),
  );
}
/** XP d'infusion qu'un familier SACRIFIÉ rend (valeur du cran, perte 2:1). */
export function familiarInfuseXp(fam: { rarity: Rarity; roll?: number }): number {
  return gradeRecycleYield(tierIndexOf(fam));
}
/** Coût en fragments d'un pas de GRADE (qualité) d'un familier — cf. `gradeStepCost`. */
export function tierStepCost(tier: number): number {
  return gradeStepCost(tier);
}
/** XP totale déjà accumulée + le seuil du prochain pas → barre de progression. */
export function familiarTierProgress(fam: Item): { xp: number; cost: number } {
  return { xp: fam.fxp ?? 0, cost: tierStepCost(tierIndexOf(fam)) };
}
/** Applique `addXp` d'infusion à un familier : monte son tier (qualité → rang),
 *  plafonné au rang d'index `maxRankIndex` (Incubateur). La magnitude de l'effet
 *  (et de la signature) est re-scalée par le ratio des multiplicateurs de tier →
 *  un familier infusé = un familier droppé au même tier. Renvoie le familier à jour. */
export function infuseFamiliar(fam: Item, addXp: number, maxTierIndex: number): Item {
  let fxp = (fam.fxp ?? 0) + Math.max(0, addXp);
  let rank = fam.rarity;
  let quality = Math.max(1, rollStars(fam.roll));
  let effVal = fam.effect.value;
  let eff2Val = fam.effect2?.value;
  const cap = Math.min(49, maxTierIndex); // CRAN max débloqué par l'Incubateur (rang+qualité)
  for (;;) {
    const tier = rankIndex(rank) * 5 + (quality - 1);
    if (tier >= cap) break; // cran cible non débloqué (ou SSS★5 max)
    const nextRankIdx = Math.floor((tier + 1) / 5);
    const cost = tierStepCost(tier);
    if (fxp < cost) break;
    fxp -= cost;
    const oldMult = RARITY_MULT[rank] * starQualityMult(quality);
    rank = RANK_ORDER[nextRankIdx]!;
    quality = ((tier + 1) % 5) + 1;
    const ratio = (RARITY_MULT[rank] * starQualityMult(quality)) / oldMult;
    // Valeur gardée en FLOAT (pas d'arrondi par pas) : un pas de qualité (+2,5 %) est petit et
    // s'arrondissait à « aucun changement » sur les petites stats → la valeur restait BLOQUÉE
    // (ticket 71dfd9da). En float, chaque pas s'accumule (visible sur la puissance de combat).
    effVal = Math.max(1, effVal * ratio);
    if (eff2Val != null) eff2Val = Math.max(1, eff2Val * ratio);
  }
  return {
    ...fam,
    rarity: rank,
    roll: (quality - 0.5) / 5,
    fxp,
    // Accumulation en float (anti-blocage), mais valeur FINALE à 1 décimale comme un drop
    // (`round1`) → un familier infusé ≈ un familier droppé au même tier (ticket cohérence).
    effect: { ...fam.effect, value: round1(effVal) },
    ...(fam.effect2 && eff2Val != null
      ? { effect2: { ...fam.effect2, value: round1(eff2Val) } }
      : {}),
  };
}

// ── Atelier de poussière (dust sinks) : forge / reroll / craft de set ──
// (La SUBLIMATION de rareté a été retirée le 2026‑08‑10 : trop puissante — elle
// permettait de fabriquer du divin bien avant d'y avoir droit. La rareté ne monte
// plus que par les DROPS/forge, pas au craft.)

// Coûts de l'atelier VOLONTAIREMENT élevés (2026‑08‑10) : la poussière s'accumule
// vite (farm) → sans un vrai coût, on forge à l'infini. Base + composante NIVEAU +
// facteur de RANG quasi-exponentiel (`rerollCost`) → altérer reste un investissement.
function rarityStep(rarity: Rarity): number {
  return Math.pow(1.5, rankIndex(rarity)); // 1 · 1,5 · 2,25 … ≈ 25 au SSS
}

// A. FORGE — créer un objet neuf. Ciblé (choisir l'emplacement) = plus cher que l'aléatoire.
export function forgeCost(level: number, targeted: boolean): number {
  const base = 50 + Math.max(1, level) * 20;
  return targeted ? Math.round(base * 1.8) : base;
}
export function forgeItem(
  rng: () => number,
  opts: { level: number; slot?: ItemSlot; luck?: number },
): Omit<Item, 'id'> {
  const slot = opts.slot ?? pick(rng, SLOTS);
  const level = Math.max(1, Math.round(opts.level));
  // Rang gaté par le NIVEAU de forge (comme les drops) : forger à ton niveau donne des
  // rangs cohérents avec ta profondeur, jamais du SSS gratuit.
  const rarity = rollRarity(rng, opts.luck ?? 0.25, level);
  const chosen = pick(rng, availableEffects(slot, level));
  const value = Math.max(1, round1(chosen.base * RARITY_MULT[rarity]));
  return {
    slot,
    name: `${pick(rng, NAMES[slot])} forgé`,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value },
  };
}

// B. REROLL d'effet — change la stat (même rareté/niveau), un autre effet du slot.
export function rerollCost(item: Item): number {
  return Math.round((40 + item.level * 15) * rarityStep(item.rarity));
}
// Reroll de QUALITÉ (étoiles) : re-tire la QUALITÉ de l'objet en gardant le TYPE
// d'effet, la RARETÉ et le NIVEAU. Ne touche JAMAIS la rareté → aucun risque de perdre
// un divin ; sert à retenter une meilleure qualité (ex. un 1★). On rescale la valeur
// par le rapport des multiplicateurs de qualité (préserve base × rareté × magnitude),
// et on met à jour `roll` → les étoiles restent cohérentes avec la valeur.
export function rerolledQuality(
  rng: () => number,
  item: Item,
): { effect: ItemEffect; effect2?: ItemEffect; roll: number } {
  const oldStars = rollStars(item.roll);
  const oldVf = oldStars ? starQualityMult(oldStars) : 1; // legacy sans roll → base
  const stars = rollStars(rng());
  const newVf = starQualityMult(stars);
  const ratio = newVf / oldVf;
  const scale = (e: ItemEffect): ItemEffect => ({
    type: e.type,
    value: Math.max(1, Math.round(e.value * ratio)),
  });
  return {
    effect: scale(item.effect),
    ...(item.effect2 ? { effect2: scale(item.effect2) } : {}),
    roll: (stars - 0.5) / 5, // roll cohérent avec les étoiles (rollStars le relit)
  };
}

// D. CRAFT de pièce de set ciblée — coût élevé (réutilise rollSetPiece pour l'objet).
export function craftSetCost(level: number): number {
  return 300 + Math.max(1, level) * 60;
}

export interface AggregatedEffects {
  damagePct: number;
  critAdd: number; // fraction 0..1
  dodgeAdd: number; // fraction 0..1
  lifesteal: number; // fraction
  dmgReduction: number; // fraction, plafonnée
  maxPvPct: number; // fraction
  goldPct: number; // fraction
  executePct: number; // signature : + dégâts si ennemi bas
  ragePct: number; // signature : + dégâts si joueur bas
  momentumPct: number; // signature : + dégâts/coup cumulé
  thornsPct: number; // épines : fraction des dégâts reçus renvoyée à l'attaquant
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
    executePct: 0,
    ragePct: 0,
    momentumPct: 0,
    thornsPct: 0,
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
    case 'execute_pct':
      a.executePct += v;
      break;
    case 'rage_pct':
      a.ragePct += v;
      break;
    case 'momentum_pct':
      a.momentumPct += v;
      break;
    case 'thorns_pct':
      a.thornsPct += v;
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
const HAND_SETS: ItemSet[] = [
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
    theme: 'Hybride offensif : dégâts, survie et vol de vie.',
    tiers: [
      { pieces: 2, type: 'damage_pct', base: 8 },
      { pieces: 3, type: 'max_pv_pct', base: 10 },
      { pieces: 4, type: 'lifesteal_pct', base: 10 },
    ],
  },
];
// Sets complets = écrits à la main (5 boss de palier) + PROCÉDURAUX (boss 30→100).
export const ITEM_SETS: ItemSet[] = [...HAND_SETS, ...PROCEDURAL.sets];
export const SET_BY_ID: Record<string, ItemSet> = Object.fromEntries(
  ITEM_SETS.map((s) => [s.id, s]),
);

/** Multiplicateur de bonus de set scalé par le RANG moyen des pièces (#3, ticket 8bfe5130) :
 *  les pièces d'un boss plus profond ont un rang plus haut → bonus de set plus fort → on
 *  veut faire les boss suivants. Ancré au rang C (RARITY_MULT.C) → un set C ≈ base d'origine,
 *  les sets plus hauts montent, les plus bas baissent un peu. */
export function setBonusMult(pieces: Item[]): number {
  if (!pieces.length) return 1;
  const avg =
    pieces.reduce((s, i) => s + (RARITY_MULT[i.rarity] ?? RARITY_MULT.C), 0) / pieces.length;
  return avg / RARITY_MULT.C;
}
/** Libellé d'un palier de set, scalé par le rang des pièces équipées de ce set. */
export function setTierLabel(type: EffectType, base: number, pieces: Item[]): string {
  return effectLabelFor(type, base * setBonusMult(pieces));
}

/** Nombre de pièces équipées par set. */
export function setCounts(equipped: Equipped): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.setId) out[it.setId] = (out[it.setId] ?? 0) + 1;
  }
  return out;
}

/** Effets cumulés des SETS actifs (≥2 pièces), scalés par le niveau moyen des pièces.
 *  `capLevel` (optionnel) plafonne le niveau effectif des pièces au niveau du joueur. */
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
    const mult = setBonusMult(items);
    for (const t of def.tiers) {
      if (items.length < t.pieces) continue;
      applyEffect(a, t.type, Math.max(1, round1(t.base * mult)) / 100);
    }
  }
  a.dmgReduction = Math.min(0.5, a.dmgReduction);
  return a;
}

// `capLevel` plafonne le niveau EFFECTIF de chaque objet au niveau du joueur (comme
// l'upgrade) → un objet sur-leveled ne donne que la puissance de TON niveau (anti
// « bas niveau en gear trop haut qui punch 3 tiers au-dessus », cf. simulation 2026‑08‑12).
export function aggregateEffects(equipped: Equipped): AggregatedEffects {
  const a = emptyEffects();
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    // OBJETS : magnitude 100 % définie par le DROP (rang × qualité, déjà bakée dans
    // effect.value). Plus d'axe enchant (retiré, ticket 7acb1e7c) — les objets sont des
    // drops purs. Valeur PRÉCISE (float, pas d'arrondi par objet) → les petits gains de
    // qualité (+2,5 %/★) comptent vraiment dans la puissance (ticket 71dfd9da).
    applyEffect(a, it.effect.type, it.effect.value / 100);
    if (it.effect2) applyEffect(a, it.effect2.type, it.effect2.value / 100);
  }
  // Familier (slot parallèle, hors SLOTS) : magnitude bakée (grade × qualité, re-scalée
  // à l'infusion). Pas d'enchant non plus.
  const fam = equipped[FAMILIAR_SLOT];
  if (fam) {
    applyEffect(a, fam.effect.type, fam.effect.value / 100);
    if (fam.effect2) applyEffect(a, fam.effect2.type, fam.effect2.value / 100);
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
  a.executePct += s.executePct;
  a.ragePct += s.ragePct;
  a.momentumPct += s.momentumPct;
  a.thornsPct += s.thornsPct;
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
  // Plafonne le niveau effectif du gear au niveau du joueur (anti sur-leveling).
  const e = aggregateEffects(equipped);
  const damagePct = e.damagePct + (extra.damagePct ?? 0);
  const maxPvPct = e.maxPvPct + (extra.maxPvPct ?? 0);
  const critAdd = e.critAdd + (extra.critAdd ?? 0);
  const dodgeAdd = e.dodgeAdd + (extra.dodgeAdd ?? 0);
  // La Défense de la Puissance se cumule à la réduction du gear (plafond 50 %).
  const dmgReduction = Math.min(
    0.5,
    (base.dmgReduction ?? 0) + e.dmgReduction + (extra.dmgReduction ?? 0),
  );
  // Vol de vie PLAFONNÉ à 50 % (comme la réduction de dégâts) : il stacke (arme +
  // talent + set + familier) et, avec le multi-frappe, rendait le sustain quasi
  // infini. Borné → build sustain fort mais pas increvable (ticket adab525d).
  const lifesteal = Math.min(0.5, e.lifesteal + (extra.lifesteal ?? 0));
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
    execute: e.executePct + (extra.executePct ?? 0),
    rage: e.ragePct + (extra.ragePct ?? 0),
    momentum: e.momentumPct + (extra.momentumPct ?? 0),
    thorns: e.thornsPct + (extra.thornsPct ?? 0),
  };
}

/** OPTIMISEUR D'ÉQUIPEMENT (ticket 6d69c2fc) : cherche, parmi l'équipé + le sac, la
 *  meilleure combinaison des 4 slots de gear (bonus de SET inclus) qui maximise la
 *  puissance de combat. Le familier équipé est conservé (slot parallèle, choisi à part).
 *  Brute-force BORNÉ : top-K candidats/slot par puissance solo + TOUTES les pièces de set
 *  (pour permettre la complétion, cap 12 + slot vide = ≤13/slot) → au plus ~13⁴ combos
 *  évalués sur un clic (combatPower est bon marché), pas un chemin chaud.
 *  Retourne la map d'équipement optimale (les 4 slots gear + le familier actuel). */
export function bestGearLoadout(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  equipped: Equipped,
  inventory: Item[],
  level = 1,
): Equipped {
  const familiar = equipped[FAMILIAR_SLOT];
  const bySlot: Record<ItemSlot, Item[]> = {
    weapon: [],
    armor: [],
    accessory: [],
    relic: [],
    familiar: [],
  };
  for (const s of SLOTS) {
    const cur = equipped[s];
    if (cur) bySlot[s].push(cur);
  }
  for (const it of inventory) if (SLOTS.includes(it.slot)) bySlot[it.slot].push(it);
  const soloPower = (it: Item): number => {
    const one: Equipped = {};
    one[it.slot] = it;
    return combatPower(playerWithGear(name, stats, one, {}, level));
  };
  // Candidats retenus par slot : top-K solo + toutes les pièces de set (cap 12) + slot vide.
  const K = 6;
  const trim = (arr: Item[]): (Item | undefined)[] => {
    const scored = arr.map((it) => ({ it, p: soloPower(it) })).sort((a, b) => b.p - a.p);
    const keep = new Map<string, Item>();
    for (const { it } of scored.slice(0, K)) keep.set(it.id, it);
    for (const { it } of scored) if (it.setId && keep.size < 12) keep.set(it.id, it);
    return [...keep.values(), undefined];
  };
  const cand: Record<'weapon' | 'armor' | 'accessory' | 'relic', (Item | undefined)[]> = {
    weapon: trim(bySlot.weapon),
    armor: trim(bySlot.armor),
    accessory: trim(bySlot.accessory),
    relic: trim(bySlot.relic),
  };
  let best: Equipped = { ...equipped };
  let bestP = -1;
  for (const w of cand.weapon)
    for (const a of cand.armor)
      for (const ac of cand.accessory)
        for (const r of cand.relic) {
          const combo: Equipped = {};
          if (w) combo.weapon = w;
          if (a) combo.armor = a;
          if (ac) combo.accessory = ac;
          if (r) combo.relic = r;
          if (familiar) combo.familiar = familiar;
          const p = combatPower(playerWithGear(name, stats, combo, {}, level));
          if (p > bestP) {
            bestP = p;
            best = combo;
          }
        }
  return best;
}
