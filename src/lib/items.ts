// items.ts — équipement RPG (Phase 2c). RÈGLE : l'équipement ne donne PAS de
// stats (elles viennent du sport) — il donne des EFFETS de gameplay. Pur/testable.
import { COMBAT, playerCombatant, combatPower, mulberry32, seedOf, type Combatant } from './combat';
import type { FamiliarSpecies } from '@/data/familiars';
import { PROCEDURAL, refBalancedStat } from '@/lib/proceduralContent';
import {
  CHARACTER_RANKS,
  characterRank,
  rankStarStr,
  rankStartLevel,
  STARS_PER_RANK,
  type CharacterRank,
  type RankTier,
} from './characterRank';
import { levelCost } from './levels';

// `familiar` = 5ᵉ emplacement PARALLÈLE (compagnon) : compté par aggregateEffects
// mais EXCLU de SLOTS (donc des drops normaux / sets / forge). Cf. src/data/familiars.ts.
// `trophy` = 6ᵉ emplacement PARALLÈLE (v0.864) : le TROPHÉE du boss entre amis, qui ne tombe
// que de son coffre. Même traitement que le familier — compté, optimisé, jamais tiré ailleurs.
// ⚠️ REFONTE ÉQUIPEMENT (étape 2) : 7 emplacements portés — arme, armure, BOUCLIER, CASQUE,
// BOTTES, anneau (l'identifiant `accessory` est gardé : les objets déjà possédés restent
// valides sans migration) et relique.
export type ItemSlot =
  | 'weapon'
  | 'armor'
  | 'shield'
  | 'helmet'
  | 'boots'
  | 'accessory'
  | 'relic'
  | 'familiar'
  | 'trophy';
/** Les emplacements d'équipement proprement dits (hors familier et trophée). */
export type GearSlot = Exclude<ItemSlot, 'familiar' | 'trophy'>;
export const FAMILIAR_SLOT: ItemSlot = 'familiar';
export const TROPHY_SLOT: ItemSlot = 'trophy';
/** Emplacements parallèles : portés et comptés, mais hors des drops et des sets. */
const PARALLEL_SLOTS: ItemSlot[] = [FAMILIAR_SLOT, TROPHY_SLOT];
// RARETÉS NOMMÉES (refonte v0.576) : 8 tiers Commun → Primordial, façon Diablo. Chaque
// rareté a un INTERVALLE de stat (le « jet » le balaie, cf. rankRollMult) et une couleur.
// La rareté droppable est gatée par la PROFONDEUR (min(niveau, activité)) via la pyramide
// (rankCeilingForLevel) → le sport gate le niveau qui gate la rareté ; Primordial = graal.
// Légendaire+ portera un EFFET LÉGENDAIRE (proc, Phase 3). RANK_ORDER = du plus bas au plus haut.
// (Le type garde le NOM `Rarity` ; les VALEURS sont les codes de rareté.)
export type Rarity =
  | 'commun'
  | 'inhabituel'
  | 'magique'
  | 'rare'
  | 'epique'
  | 'legendaire'
  | 'mythique'
  | 'primordial';
export const RANK_ORDER: Rarity[] = [
  'commun',
  'inhabituel',
  'magique',
  'rare',
  'epique',
  'legendaire',
  'mythique',
  'primordial',
];
// Couleur par rareté = la couleur du RANG qu'elle représente (v0.895 : les objets gardaient la
// palette des anciennes raretés alors qu'ils se lisent en rangs — Bronze, Argent, Or…).
// DÉRIVÉE de `CHARACTER_RANKS` (source unique JS) ; le CSS miroir pose --rk par classe
// .r-*/.p-* (AventurePage, ExpeditionPage, AventureAvatar) — un test vérifie qu'il suit.
export const RANK_COLOR = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, CHARACTER_RANKS[i]!.color]),
) as Record<Rarity, string>;
/** Variables CSS `--rank-<rareté>` lues par les classes r-* / p-* (app.scss). */
export function rankCssVars(): Record<string, string> {
  return Object.fromEntries(RANK_ORDER.map((r) => [`--rank-${r}`, RANK_COLOR[r]]));
}
// Mapping des ANCIENNES valeurs sauvegardées (10 rangs G→SSS + 5 vieilles raretés) vers les
// 8 nouvelles raretés, par proximité de puissance. `normRank` normalise toute chaîne.
const LEGACY_RANK: Record<string, Rarity> = {
  G: 'commun',
  F: 'inhabituel',
  E: 'magique',
  D: 'magique',
  C: 'rare',
  B: 'epique',
  A: 'legendaire',
  S: 'legendaire',
  SS: 'mythique',
  SSS: 'primordial',
  common: 'commun',
  epic: 'epique',
  legendary: 'legendaire',
  divin: 'primordial',
};
export function normRank(r: string | undefined | null): Rarity {
  if (r && (RANK_ORDER as string[]).includes(r)) return r as Rarity;
  return (r && LEGACY_RANK[r]) || 'commun';
}

// Effets « signature » (un par objet). value en points de %. RÈGLE : tous les
// effets doivent GRANDIR avec le niveau de l'objet (pas d'effet « drapeau »
// binaire — ils ne récompenseraient pas la montée en niveau).
export type EffectType =
  // ── TIER MAJEUR (affixe #1) : stats de combat qui DÉFINISSENT l'objet ──
  | 'damage_pct' // + dégâts
  | 'crit_pct' // + chance de critique
  | 'dmg_reduction_pct' // dégâts reçus réduits
  | 'max_pv_pct' // + PV max
  // ── TIER SECONDAIRE (affixe #2, Magique+) : soutien de combat + signatures ──
  | 'lifesteal_pct' // vol de vie
  | 'thorns_pct' // renvoie une part des dégâts reçus (épines)
  | 'execute_pct' // SIGNATURE : + dégâts quand l'ennemi est bas (< 25 % PV)
  | 'rage_pct' // SIGNATURE : + dégâts quand TU es bas (< 30 % PV)
  | 'momentum_pct' // SIGNATURE : + dégâts à chaque tour du combat (cumul, 4 tours)
  // ── TIER MINEUR (affixe #3, Épique+) : bonus « light » d'éco/confort (hors puissance brute) ──
  | 'gold_pct' // + or gagné par run
  | 'magic_find_pct' // + chance de meilleur loot (luck bornée → ne franchit jamais ta ligue)
  | 'regen_pct' // + PV régénérés entre deux combats d'un donjon/labyrinthe
  | 'initiative_pct' // + initiative (commence le combat en premier plus souvent)
  // ── REFONTE ÉQUIPEMENT (étape 3) : stats liées à ce que fait chaque objet ──
  | 'crit_dmg_pct' // dégâts critiques : un critique frappe plus que ×2 (arme)
  | 'accuracy_pct' // précision : réduit l'esquive de l'ennemi (arme, casque)
  | 'bleed_pct' // saignement : une part des dégâts continue sur les tours suivants (arme)
  | 'block_pct' // blocage : chance qu'un coup reçu ne fasse que 25 % (bouclier)
  | 'parry_pct' // parade : chance d'éviter un coup ET que l'ennemi saute son tour (bouclier)
  | 'riposte_pct' // riposte : chance de contre-attaquer après un coup reçu (bouclier, bottes)
  | 'crit_resist_pct' // résistance aux critiques : les critiques ennemis font moins mal
  | 'start_shield_pct' // bouclier de départ : barrière de X % des PV au début du combat
  | 'dodge_pct' // esquive (bottes) — même canal que l'esquive des talents
  | 'training_pct'; // dressage : + XP gagnée par le familier (hors combat)

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
  effect: ItemEffect; // affixe PRIMAIRE (toujours présent)
  effect2?: ItemEffect; // 2ᵉ affixe (raretés Magique+, cf. affixCountForRarity)
  effect3?: ItemEffect; // 3ᵉ affixe (raretés Épique+)
  setId?: string; // appartenance à un SET (bonus à 2/3/4 pièces) — cf. ITEM_SETS
  locked?: boolean; // 🔒 protégé : exclu de la casse/vente (en masse ET individuelle)
  species?: string; // slot 'familiar' uniquement : id de la RACE (cf. FAMILIAR_SPECIES)
  roll?: number; // qualité du roll de l'effet principal (0..1 dans la bande ±20 %) → étoiles
  fxp?: number; // familier : progression d'INFUSION vers le prochain pas de tier (rang+qualité)
  enchant?: number; // ENCHANT +N (façon L2) — magnitude par-dessus le grade. Défaut 0. (étape 1)
  legendary?: string; // proc LÉGENDAIRE (id, cf. LEGENDARY_PROCS) — Légendaire+ uniquement, non-scalant
  // ── DRESSAGE (familiers uniquement, cf. FAM_TRAIN) : UNE seule expérience (v0.805).
  xp?: number; // gagnée partout où il se bat : donjon (héros), convoi et défense (aventurier)
  // ⚠️ LEGACY : les deux carrières d’avant la v0.805. Relues par `famXp`, jamais écrites.
  atkXp?: number;
  defXp?: number;
  fatigueUntil?: number; // ms epoch : sorti d’un siège, il souffle (effet réduit, jamais perdu)
}

// ── DRESSAGE DES FAMILIERS ──
// Un 4ᵉ axe, VOLONTAIREMENT à part des trois autres (rang, jet, ilvl) : il ne touche
// à aucun d'eux et il est BORNÉ (plafonné au niveau du joueur à l’attribution).
//
// ⚠️ UNE SEULE EXPÉRIENCE, UN SEUL MULTIPLICATEUR (v0.805 ; demandé par l’utilisateur :
// « le familier booste l’aventurier comme le héros, que ce soit en défense ou en
// attaque — une expérience globale, montée par les convois et les défenses »). Il y
// avait DEUX carrières (attaque en donjon, défense au mur) aux pentes différentes :
// le même animal valait deux choses selon le terrain, et le dressage gagné par un
// aventurier au rempart ne servait à rien sur la route.
const FAM_TRAIN = {
  // XP cumulée pour le niveau L = xpPerLevel × L². Calée sur l’ancienne carrière
  // d’ATTAQUE : ~648 XP par séance de sport, donc niveau 5 ≈ 10 séances.
  xpPerLevel: 260,
  // La pente de l’ilvl (LEVEL_MULT_K) — « un familier dressé vaut un familier d'un cran
  // d'ilvl au-dessus ». Avare À DESSEIN : le combat du héros est calibré au serré, et
  // c’est désormais la MÊME formule pour le héros et pour ses aventuriers.
  k: 0.006,
  // Conversion de l’ancienne XP de DÉFENSE (65 par niveau² contre 260) : un familier
  // dressé au mur garde exactement le niveau qu’il avait gagné.
  legacyDefToXp: 4,
} as const;

/** L’expérience d’un familier. ⚠️ Relit les deux carrières d’avant la v0.805 tant qu’il
 *  n’a rien regagné — sans migration, et sans rien perdre de ce qui avait été dressé. */
export function famXp(it: Pick<Item, 'xp' | 'atkXp' | 'defXp'>): number {
  return it.xp ?? (it.atkXp ?? 0) + (it.defXp ?? 0) * FAM_TRAIN.legacyDefToXp;
}
/** XP cumulée nécessaire pour atteindre le niveau `level`. */
export function famXpForLevel(level: number): number {
  return FAM_TRAIN.xpPerLevel * Math.max(0, level) ** 2;
}
/** Niveau de dressage correspondant à une XP. ⚠️ Le PLAFOND (niveau du joueur) est
 *  appliqué à l'ATTRIBUTION de l'XP (`grantFamiliarXp`), pas ici. */
export function famLevel(xp: number | undefined): number {
  return Math.floor(Math.sqrt(Math.max(0, xp ?? 0) / FAM_TRAIN.xpPerLevel));
}
function famTrainMult(level: number): number {
  return 1 + Math.max(0, level) * FAM_TRAIN.k;
}
/**
 * CE QU’UN FAMILIER VAUT, au héros comme à un aventurier : niveau d’objet × dressage.
 * ⚠️ SOURCE UNIQUE — `aggregateEffects` (le héros) et `companionEffects` (l’aventurier,
 * route comme rempart) la lisent tous les deux. C’est ce qui garantit « comme le héros ».
 */
export function familiarMult(fam: Item): number {
  return itemLevelMult(fam.level) * famTrainMult(famLevel(famXp(fam)));
}
/** Crédite de l'XP, PLAFONNÉE au niveau du joueur — « le sport est le plafond » vaut
 *  aussi pour les compagnons. Rend l'objet inchangé si rien ne bouge. Écrit `xp` et
 *  retire les deux champs legacy, déjà comptés par `famXp`. */
export function grantFamiliarXp(it: Item, amount: number, playerLevel: number): Item {
  if (amount <= 0) return it;
  const cur = famXp(it);
  const cap = famXpForLevel(Math.max(0, playerLevel) + 1) - 1;
  // Jamais de recul : un familier dressé avant que le plafond ne descende garde son acquis.
  const out = Math.max(cur, Math.min(cap, cur + amount));
  if (out === it.xp) return it;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { atkXp, defXp, ...rest } = it;
  return { ...rest, xp: out };
}

// JET du roll (0..100 %) — REFONTE v0.574 : fini les qualités ★1-5. Le `roll` (0..1, figé au
// drop) est le « jet » = position CONTINUE de la stat dans l'INTERVALLE du rang (cf.
// rankRollMult). 100 % = haut de l'intervalle (frôle le rang suivant), 0 % = plancher du rang.
// On farme le meilleur jet à son rang. Affiché « jet 79 % ». (objet legacy sans roll → 0.)
export function rollJet(roll: number | undefined): number {
  if (roll == null) return 0;
  return Math.round(Math.min(1, Math.max(0, roll)) * 100);
}

// L'effet grandit de +5 % de la base par niveau au-dessus de 1. Pente VOLONTAIREMENT
// douce (2026‑08‑08) : le gear reste un GATE progressif (plus j'ai de bon gear,
// plus mon % monte) et n'explose pas en multiplicateur ×2 qui trivialise les boss.
// NIVEAU D'OBJET = 3ᵉ axe de magnitude (v0.583) : re-farmer plus profond donne un objet
// de MÊME rareté mais plus fort. `k = 0,006` (×1,6 au niv.100) → assez fort pour qu'un
// donjon ~10-15 niveaux plus profond batte un écart de jet (upgrade réel), assez borné
// pour un recalibrage modéré. Le niveau d'un drop = `min(niveau perso, niveau donjon)`
// tiré sur une PYRAMIDE (cf. rollItemLevel) → chance d'un ilvl un peu au-dessus.
const LEVEL_MULT_K = 0.006;
export function itemLevelMult(level: number): number {
  return 1 + Math.max(0, level - 1) * LEVEL_MULT_K;
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

/** Valeur réelle d'un effet au niveau de l'objet. */
export function effectiveValue(effect: ItemEffect, level: number): number {
  return Math.max(1, Math.round(effect.value * itemLevelMult(level)));
}

// ── Économie d'objets : Poussière (évolution) & or (vente) ──
// Index 0..9 du rang → sert aux barèmes croissants (poussière / or / coûts).
function rankIndex(r: Rarity): number {
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
// Or de vente PAR RANG (v0.614) : base + ratio RELEVÉS pour que vendre ait un VRAI intérêt
// face à l'économie (donjons/bâtiments en milliers d'or). Courbe RAIDE (×1,8/rang) → la
// rareté pèse fort : commun 70 → primordial ≈ 4 300. Le JET et le NIVEAU d'objet ajoutent
// par-dessus (cf. sellValueOf) → deux mêmes rangs ne valent pas pareil.
const GOLD_BY_RARITY: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, Math.round(70 * Math.pow(1.8, i))]),
) as Record<Rarity, number>;
// Le JET (0..1) rapporte jusqu'à +70 % du prix (un jet parfait = objet bien plus vendable).
const SELL_JET_BONUS = 0.7;
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
/** Casser un objet → base de rareté + une FRACTION du coût de construction 1→niveau.
 *  HISTORY-INDEPENDENT (refonte C) : ne dépend QUE de rareté + niveau actuel, donc un
 *  objet DROPPÉ au niv.N se recycle comme un niv.1 INFUSÉ →N (fin de l'incohérence).
 *  Faucet-free car tout drop part du niveau 1 (coût(1→1)=0). */
export function salvageValue(it: Item): number {
  return DUST_BY_RARITY[it.rarity];
}
/** Or de vente d'un drop selon RANG + JET + NIVEAU d'objet (source unique objets/talents/
 *  familiers). Rang = base RAIDE (×1,8/rang) ; jet = jusqu'à +70 % ; ilvl = bonus de niveau
 *  (objet farmé plus profond = plus cher). → deux mêmes rangs ne valent pas pareil, et vendre
 *  du haut rang COMPTE face aux runs/bâtiments. */
export function sellValueOf(rank: Rarity, roll = 0, level = 1): number {
  const jet = 1 + Math.min(1, Math.max(0, roll)) * SELL_JET_BONUS;
  return Math.round(GOLD_BY_RARITY[rank] * jet * itemLevelMult(level));
}
/** Or obtenu en vendant un objet (rang + jet + niveau). */
export function sellValue(it: Item): number {
  return sellValueOf(it.rarity, it.roll ?? 0, it.level);
}

// ── 🪙 VENTE — la seule sortie d'un objet du héros (v0.890) ──────────────────────────
// ⚠️ LE RECYCLAGE EN FERRAILLE EST RETIRÉ (demandé par l’utilisateur : « on a énormément
// trop de ferraille avec le recyclage »). Mesuré au niveau 30 : un joueur qui enchaîne ~40
// descentes par jour recyclait ~320 🔩/jour, soit presque les 870 🔩 d’un cran des six
// structures — le métal tombait tout seul, et la ferraille cessait d’être le second verrou
// de l’enceinte. Elle ne vient plus que de l’épave (héros et convois) et de la Fonderie.
/** Un objet peut-il être vendu ? Jamais un objet 🔒 ; un familier se CÈDE par
 *  `sellFamiliars`, qui garde ses propres garde-fous (confié à un aventurier, etc.). */
export function canSell(it: Item): boolean {
  return !it.locked && it.slot !== FAMILIAR_SLOT;
}
/** Peut-on améliorer cet objet ? (poussière suffisante + pas au plafond). */
export function canUpgrade(it: Item, dust: number, playerLevel: number): boolean {
  return it.level < playerLevel && dust >= upgradeCost(it.level, it.rarity);
}

export type Equipped = Partial<Record<ItemSlot, Item>>;

// Loadout : un « set » d'équipement rangé (les 4 slots gear uniquement — le familier
// n'est jamais rangé). Ranger déplace le stuff équipé dans un loadout (joueur nu) ; les
// objets rangés ne sont ni dans le sac ni pris en compte au combat. 8 loadouts (v0.565) =
// 1 par VOIE → un endroit pour ranger le set de chaque voie à mesure qu'on le collecte.
export interface Loadout {
  items: Equipped;
  /** DOUBLONS du set (v0.839) : les pièces du même set battues à leur emplacement. Elles
   *  restent rangées ici au lieu de partir à la forge (cf. `setFiling.ts`). JSONB → aucune
   *  migration ; absent = aucun doublon. */
  spares?: Item[];
}
export const MAX_LOADOUTS = 8;

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

export const SLOTS: ItemSlot[] = [
  'weapon',
  'armor',
  'shield',
  'helmet',
  'boots',
  'accessory',
  'relic',
];
/** TOUT ce que le héros peut porter : les 4 emplacements de gear + les parallèles.
 *  ⚠️ Source unique : les copies `[...SLOTS, FAMILIAR_SLOT]` auraient oublié le trophée. */
export const WORN_SLOTS: ItemSlot[] = [...SLOTS, ...PARALLEL_SLOTS];
export const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  shield: 'Bouclier',
  helmet: 'Casque',
  boots: 'Bottes',
  accessory: 'Anneau',
  relic: 'Relique',
  familiar: 'Familier',
  trophy: 'Trophée',
};
export const SLOT_EMOJI: Record<ItemSlot, string> = {
  weapon: '⚔️',
  armor: '🥋',
  shield: '🛡️',
  helmet: '⛑️',
  boots: '🥾',
  accessory: '💍',
  relic: '🔮',
  familiar: '🐾',
  trophy: '🏆',
};
// Libellé FR de la rareté (Commun, Épique, Légendaire, Primordial…).
export const RARITY_LABEL: Record<Rarity, string> = {
  commun: 'Commun',
  inhabituel: 'Inhabituel',
  magique: 'Magique',
  rare: 'Rare',
  epique: 'Épique',
  legendaire: 'Légendaire',
  mythique: 'Mythique',
  primordial: 'Primordial',
};

// Index numérique (0..7) pour comparer deux objets (potentiel à niveau égal).
export const RARITY_RANK: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, i]),
) as Record<Rarity, number>;

/** 🏅 LA RARETÉ D’UN FAMILIER OU D’UN TALENT, LUE COMME UN RANG (v0.833 ; demandé par
 *  l’utilisateur : « pour les familiers et talents, affiche-les en rang »).
 *
 *  ⚠️ LE CRAN i DE RARETÉ EST LE RANG i DE L’ÉCHELLE DE PRESTIGE — et ce n’est pas un
 *  choix esthétique : une classe d’aventurier se gagne à chaque rang (`PROMO_LEVELS` =
 *  `rankStartLevel`), et une pièce ne dépasse pas la rareté de la classe de son porteur
 *  (`canWearAdvGear`). Donc un aventurier **Bronze** porte du **Bronze**, un **Argent** de
 *  l’**Argent** : la règle se lit sans table de conversion.
 *  ⚠️ DEPUIS LA v0.874, LES OBJETS AUSSI (demandé par l’utilisateur) : tout ce qui se porte
 *  se lit en rang. `RARITY_LABEL` (Commun → Primordial) ne sert plus qu’au code interne. */
export function rarityRank(r: Rarity): RankTier {
  return CHARACTER_RANKS[Math.min(CHARACTER_RANKS.length - 1, RARITY_RANK[r] ?? 0)]!;
}
/** Le libellé à afficher pour une pièce, quelle qu’elle soit : son RANG (Bronze → Divin
 *  ancestral). Source unique : aucun écran ne doit relire `RARITY_LABEL`. */
export function gradeLabel(it: { rarity: Rarity; roll?: number }): string {
  const name = rarityRank(it.rarity).name;
  // ⚠️ TOUT CE QUI PORTE UN JET se lit en rang ET étoiles (v0.907, demandé par l'utilisateur) :
  // objets, trophées, FAMILIERS et TALENTS. Les familiers en étaient exclus (v0.895) au motif
  // que leur jet n'est pas tiré par l'étoile du joueur (`rollJetValue`, biaisé bas, contre
  // `rollStarJet`) — mais mesuré, les 5 étoiles restent discriminantes pour eux : ★1 48 % →
  // ★5 9,7 % sans chance, ★5 24 % à chance pleine, stable du niveau 10 au 90. Deux façons de
  // lire une qualité dans le même jeu coûtaient plus que cette nuance de distribution.
  // Un objet d'avant le jet (legacy, pas de `roll`) garde son rang seul.
  return it.roll != null ? `${name} ${rankStarStr(jetStar(it.roll))}` : name;
}

/** Les 5 crans d’intensité de `useGameFx` — du discret à l’explosion. */
export type FxRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'divin';

/**
 * Rareté → intensité de l’animation centrale.
 *
 * ⚠️ ELLE VIVAIT EN DEUX EXEMPLAIRES (`AventurePage` et `ExpeditionPage`), et j’allais
 * en écrire un troisième. Deux copies d’une règle finissent toujours par diverger —
 * ici elles avaient POURRI ENSEMBLE, ce qui est encore plus discret.
 *
 * ⚠️ LE DÉFAUT QU’ELLES PORTAIENT : leurs seuils (`i >= 9`, 7, 5, 3) étaient calés sur les
 * DIX rangs G→SSS de la v0.438. Depuis la refonte en 8 raretés nommées (v0.576),
 * `RARITY_RANK` ne monte plus qu’à 7 : la branche « divin » — l’explosion, le sommet de
 * l’échelle — était devenue **INATTEIGNABLE**, et tout le reste décalé d’un cran vers le
 * bas. Un drop **primordial**, le graal, jouait l’animation d’un légendaire.
 *
 * On raisonne donc en FRACTION de l’échelle, jamais en index absolu : ajouter ou
 * retirer une rareté ne peut plus décrocher les seuils. ⚠️ Les fractions retenues
 * REPRODUISENT EXACTEMENT l’intention d’origine sur les 10 rangs (SSS→divin, S/SS→
 * legendary, A/B→epic, C/D→rare, G/F/E→common) : on répare la dérive, on ne
 * réinvente pas le barème.
 */
export function fxRarity(r: Rarity): FxRarity {
  const f = (RARITY_RANK[r] ?? 0) / Math.max(1, RANK_ORDER.length - 1);
  if (f >= 0.95) return 'divin';
  if (f >= 0.7) return 'legendary';
  if (f >= 0.5) return 'epic';
  if (f >= 0.3) return 'rare';
  return 'common';
}

// NOMBRE D'AFFIXES (stats) par rareté (Phase 2, v0.577, façon Diablo) : plus la rareté est
// haute, plus l'objet porte de stats. Commun/Inhabituel 1 · Magique/Rare 2 · Épique+ 3.
/** Complète une pièce de set LEGACY (tirée avant le correctif multi-affixe) avec les
 *  affixes qui lui manquent pour sa rareté. Déterministe : la graine vient de l'id de
 *  l'objet → même objet, mêmes affixes à chaque chargement (pas de re-tirage au refresh).
 *  Idempotent : une pièce déjà complète est renvoyée telle quelle. Ne touche QUE les
 *  pièces de set — les drops normaux se renouvellent naturellement par le farm, alors
 *  qu'un set est rare, gaté par les boss et patiemment constitué. */
export function fillSetPieceAffixes(it: Item): Item {
  if (!it.setId) return it;
  const want = affixCountForRarity(normRank(it.rarity));
  const have = [it.effect, it.effect2, it.effect3].filter(Boolean).length;
  if (have >= want) return it;
  const rng = mulberry32(seedOf(it.id)); // graine stable tirée de l'id
  const rarity = normRank(it.rarity);
  const roll = it.roll ?? 0.5;
  const affixes: ItemEffect[] = [it.effect, it.effect2, it.effect3].filter(
    (e): e is ItemEffect => !!e,
  );
  for (let a = affixes.length; a < want; a++) {
    const pool = slotPool(it.slot, a === 0 ? 'major' : 'support', it.level ?? 1).filter(
      (t) => !affixes.some((x) => x.type === t),
    );
    if (!pool.length) continue;
    const t = pick(rng, pool);
    affixes.push({
      type: t,
      value: Math.max(1, round1((EFFECT_BASE[t] ?? 8) * rankRollMult(rarity, roll))),
    });
  }
  return {
    ...it,
    effect: affixes[0]!,
    ...(affixes[1] ? { effect2: affixes[1] } : {}),
    ...(affixes[2] ? { effect3: affixes[2] } : {}),
  };
}

export function affixCountForRarity(rarity: Rarity): number {
  const i = RARITY_RANK[rarity] ?? 0;
  return i <= 1 ? 1 : i <= 3 ? 2 : 3;
}

// ─── EFFETS LÉGENDAIRES (Phase 3, façon Diablo) ──────────────────────────────
// Procs NON-scalants (une valeur fixe, pas d'axe niveau/jet), 1 par objet Légendaire+,
// thématisés par SLOT. Ils s'appliquent dans simulateCombat (cf. combat.ts). C'est la
// 2ᵉ voie d'end-game à côté du set de voie : mixer pièces de set + objets légendaires.
export interface LegendaryProc {
  id: string;
  name: string;
  emoji: string;
  slots: ItemSlot[];
  desc: string;
  /** ⚠️ ÉCHO — la ou les stats que ce proc PROLONGE mécaniquement. C'est ce champ, et non
   *  un jugement au cas par cas, qui permet à une pièce de set de tirer un proc COHÉRENT
   *  avec son thème (cf. `rollSetLegendaryProc`). Le renseigner est OBLIGATOIRE : un proc
   *  sans écho ne pourra jamais tomber sur une pièce de set. */
  echo: EffectType[];
}
export const LEGENDARY_PROCS: LegendaryProc[] = [
  {
    id: 'initiative',
    name: 'Initiative',
    emoji: '⚡',
    slots: ['weapon'],
    desc: 'Les coups de ton 1er tour sont inesquivables et infligent le double.',
    echo: ['crit_pct', 'damage_pct'],
  },
  {
    id: 'executioner',
    name: 'Bourreau',
    emoji: '🪓',
    slots: ['weapon'],
    desc: 'Un ennemi tombé sous 15 % PV est exécuté sur-le-champ.',
    echo: ['execute_pct', 'damage_pct'],
  },
  {
    id: 'aegis',
    name: 'Égide',
    emoji: '🛡️',
    slots: ['armor'],
    desc: 'La 1re attaque ennemie qui te touche perd 45 % de ses dégâts.',
    echo: ['dmg_reduction_pct'],
  },
  {
    id: 'retort',
    name: 'Rétorsion',
    emoji: '🔁',
    slots: ['armor'],
    desc: 'Les 3 premiers coups que tu reçois retirent chacun 7 % des PV max de l’ennemi.',
    echo: ['thorns_pct'],
  },
  {
    id: 'vampiric',
    name: 'Vampirisme',
    emoji: '🩸',
    slots: ['accessory'],
    desc: 'Tes coups critiques te soignent de la moitié de leurs dégâts.',
    echo: ['lifesteal_pct', 'crit_pct'],
  },
  {
    id: 'predator_eye',
    name: 'Œil du prédateur',
    emoji: '👁️',
    slots: ['accessory'],
    desc: 'Les coups de tes 3 premiers tours sont des critiques garantis.',
    echo: ['crit_pct'],
  },
  {
    id: 'phoenix',
    name: 'Phénix',
    emoji: '🔥',
    slots: ['relic'],
    desc: 'La 1re fois qu’un coup te tuerait, il perd la moitié de ses dégâts.',
    echo: ['max_pv_pct'],
  },
  {
    id: 'secondwind',
    name: 'Second souffle',
    emoji: '💨',
    slots: ['relic'],
    desc: 'La 1re fois que tu passes sous 30 % PV, récupère 25 % de tes PV max.',
    echo: ['max_pv_pct', 'rage_pct'],
  },
  // ── Ajoutés en v0.701 pour que les pièces de SET portent un proc cohérent avec leur
  // thème. La matrice voie × emplacement comptait 16 trous sur 32, et deux stats de set
  // n'avaient AUCUN proc : `damage_pct` (présent dans 7 sets sur 8) et `momentum_pct`
  // (l'identité même du Frénétique). ⚠️ Aucun de ces procs ne consomme de `rng` — la règle
  // « sans proc, rng byte-identique » doit valoir aussi ENTRE deux procs différents.
  {
    id: 'charge',
    name: 'Charge',
    emoji: '🐗',
    slots: ['weapon'],
    desc: 'Les coups de tes 3 premiers tours infligent +30 %.',
    echo: ['damage_pct'],
  },
  {
    id: 'cadence',
    name: 'Cadence',
    emoji: '🌀',
    slots: ['weapon'],
    desc: 'À partir de ton 3ᵉ tour, tes coups infligent +18 %.',
    echo: ['momentum_pct'],
  },
  {
    id: 'thirst',
    name: 'Soif',
    emoji: '🩸',
    slots: ['armor'],
    desc: 'La 1re fois que tu passes sous 50 % PV, tu retires 5 % des PV max de l’ennemi et récupères 15 % des tiens.',
    echo: ['lifesteal_pct'],
  },
  {
    id: 'whetted',
    name: 'Riposte affûtée',
    emoji: '⚔️',
    slots: ['armor'],
    desc: 'Après la 1re attaque ennemie encaissée, tes 3 tours suivants sont entièrement critiques.',
    echo: ['crit_pct'],
  },
  {
    id: 'endurance',
    name: 'Endurance',
    emoji: '🪨',
    slots: ['accessory'],
    desc: 'Sous 50 % PV, tu réduis de 35 % supplémentaires les dégâts subis.',
    echo: ['max_pv_pct', 'dmg_reduction_pct'],
  },
  {
    id: 'quarry',
    name: 'Curée',
    emoji: '⚖️',
    slots: ['relic'],
    desc: 'Quand l’ennemi passe sous 30 % PV, tu récupères 22 % de tes PV max (1× par combat).',
    echo: ['execute_pct', 'lifesteal_pct'],
  },
];
const LEGENDARY_BY_ID: Record<string, LegendaryProc> = Object.fromEntries(
  LEGENDARY_PROCS.map((p) => [p.id, p]),
);
// Rang minimal pour porter un proc légendaire (Légendaire = index 5).
export const LEGENDARY_MIN_RANK = RARITY_RANK.legendaire;

/** Tire un proc légendaire adapté au slot (undefined si aucun pour ce slot). */
export function rollLegendaryProc(rng: () => number, slot: ItemSlot): string | undefined {
  const pool = LEGENDARY_PROCS.filter((p) => p.slots.includes(slot));
  if (!pool.length) return undefined;
  return pool[Math.floor(rng() * pool.length)]!.id;
}
/** Tire un proc légendaire pour une PIÈCE DE SET — cohérent avec le thème du set.
 *
 *  ⚠️ Pourquoi ce tirage existe : jusqu'en v0.700 une pièce de set tirait comme un drop
 *  ordinaire, en ne regardant que son EMPLACEMENT. Mesuré : au niveau 70, **94 % des pièces
 *  de set sont Légendaire+** (le proc est donc la norme) et **34 % seulement** prolongeaient
 *  réellement le thème de leur set. On voyait des procs offensifs sur du Gardien et l'inverse.
 *
 *  ⚠️ LA LIAISON AU SLOT EST CONSERVÉE, et ce n’est pas un détail. Laisser le thème primer
 *  sur l’emplacement donnait bien 100 % de cohérence, mais **87 % des sets complets se
 *  retrouvaient avec un DOUBLON** (2,78 procs distincts sur 4) — or `aggregateLegendaries`
 *  dédoublonne, donc les copies s’annulent : un nerf déguisé en amélioration. Les pools étant
 *  disjoints par emplacement, garder le slot GARANTIT 4 procs distincts sur un set complet.
 *  La cohérence vient donc du CATALOGUE (un proc par famille de stats et par emplacement),
 *  pas d’un assouplissement du tirage.
 *
 *  Repli sur le pool du slot si aucun proc n’échoue le thème — impossible avec le catalogue
 *  actuel (test dédié), mais un set ajouté plus tard ne doit pas se retrouver sans proc. */
export function rollSetLegendaryProc(
  rng: () => number,
  slot: ItemSlot,
  setStats: EffectType[],
): string | undefined {
  const pool = LEGENDARY_PROCS.filter((p) => p.slots.includes(slot));
  if (!pool.length) return undefined;
  const onTheme = pool.filter((p) => p.echo.some((t) => setStats.includes(t)));
  const use = onTheme.length ? onTheme : pool;
  return use[Math.floor(rng() * use.length)]!.id;
}
/** Les 3 stats du thème d’un set (source unique : ses paliers). */
function setThemeStats(setId: string | undefined): EffectType[] {
  const s = setId ? SET_BY_ID[setId] : undefined;
  return s ? s.tiers.map((t) => t.type) : [];
}
/** Métadonnée du proc légendaire d'un objet (undefined si pas légendaire). */
export function legendaryOf(it: { legendary?: string }): LegendaryProc | undefined {
  return it.legendary ? LEGENDARY_BY_ID[it.legendary] : undefined;
}
/** Ensemble des procs légendaires actifs de l'équipement (pour le combattant), plus la
 *  SIGNATURE du set complet porté dans sa voie. */
export function aggregateLegendaries(equipped: Equipped, voie?: string | null): Set<string> {
  const s = new Set<string>();
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.legendary) s.add(it.legendary);
  }
  const fam = equipped[FAMILIAR_SLOT];
  if (fam?.legendary) s.add(fam.legendary);
  const sig = setSignatureOf(equipped, voie);
  if (sig) s.add(sig.id);
  return s;
}

/** ⭐ La signature active : les QUATRE pièces du set de ta voie, portées. Même règle que le
 *  capstone de stat (`setEffects`) — hors de sa voie, un set complet n’en donne pas. */
export function setSignatureOf(equipped: Equipped, voie?: string | null): SetSignature | undefined {
  if (!voie) return undefined;
  const id = voieSetId(voie);
  const n = SLOTS.filter((sl) => equipped[sl]?.setId === id).length;
  return n >= 4 ? SET_BY_ID[id]?.signature : undefined;
}

// PLANCHER de magnitude par RANG. Géométrique (ratio 1,166). REFONTE v0.574 : plus de
// qualité ★1-5 — chaque rang a un INTERVALLE de stat COMPLET, du plancher du rang au
// plancher du rang SUIVANT (`rankRollMult`), parcouru par le « jet » (roll 0..1). Un jet
// parfait d'un rang frôle donc le plancher du rang au-dessus (chevauchement voulu : on
// peut avoir un excellent bas-rang ≈ un mauvais rang supérieur → farm du meilleur jet).
// 8 tiers : ratio 1,219 → Primordial ≈ ×4,05 (plafond de puissance préservé).
export const RARITY_MULT: Record<Rarity, number> = Object.fromEntries(
  RANK_ORDER.map((r, i) => [r, Math.round(0.9 * Math.pow(1.219, i) * 1000) / 1000]),
) as Record<Rarity, number>;
// Multiplicateur de magnitude = interpolation dans l'intervalle du RANG selon le jet (roll).
// [plancher du rang → plancher du rang suivant] (SSS extrapolé d'un cran). Remplace
// RARITY_MULT[rang] × starQualityMult(qualité) : le roll balaie tout l'intervalle du rang.
export function rankRollMult(rank: Rarity, roll = 0): number {
  const i = Math.max(0, RANK_ORDER.indexOf(rank));
  const lo = RARITY_MULT[rank];
  const hi = i < RANK_ORDER.length - 1 ? RARITY_MULT[RANK_ORDER[i + 1]!] : lo * 1.166;
  return lo + (hi - lo) * Math.min(1, Math.max(0, roll));
}

// Niveau minimum pour qu'une stat « exotique/signature » puisse tomber (pool
// progressif → il reste des choses à découvrir en profondeur). Les stats de base
// (majeures + soutien de base + mineures) tombent dès le niveau 1. Depuis le
// passage aux TIERS d'affixe, seules les SIGNATURES et les épines restent gatées
// (chaque tier garde toujours des options non gatées → jamais de tier vide).
const EFFECT_MIN_LEVEL: Partial<Record<EffectType, number>> = {
  execute_pct: 12,
  momentum_pct: 18,
  rage_pct: 15,
  thorns_pct: 9, // épines : build défensif « qui pique » → débloqué en profondeur
};

// ── STATS PAR EMPLACEMENT (refonte équipement, étape 2) ──────────────────────────
// Un objet donne ce qu'il FAIT : l'arme agit sur le coup porté, les protections sur les
// coups reçus, l'anneau sur des choses indirectes. L'affixe #1 est tiré dans `major`, les
// #2 et #3 dans `support`, sans doublon. ⚠️ Une stat vit sur DEUX emplacements au plus
// (test dédié), sinon plus aucun emplacement n'a d'identité.
// ⚠️ Remplace les listes COMMUNES d'avant (AFFIX_TIERS) : un drop tirait ses stats sans
// regarder son emplacement — mesuré, une arme sur deux avait des PV ou de la réduction en
// stat principale, et l'optimiseur en mettait sur 4 armes sur 4 aux niveaux 50 et 90.
export const SLOT_AFFIXES: Record<GearSlot, { major: EffectType[]; support: EffectType[] }> = {
  weapon: {
    major: ['damage_pct', 'crit_dmg_pct'],
    support: ['accuracy_pct', 'momentum_pct', 'execute_pct', 'bleed_pct', 'lifesteal_pct'],
  },
  armor: {
    major: ['max_pv_pct', 'dmg_reduction_pct'],
    support: ['thorns_pct', 'regen_pct', 'start_shield_pct'],
  },
  shield: {
    major: ['block_pct', 'parry_pct'],
    support: ['riposte_pct', 'thorns_pct', 'crit_resist_pct'],
  },
  helmet: {
    major: ['max_pv_pct', 'accuracy_pct'],
    support: ['initiative_pct', 'crit_resist_pct', 'magic_find_pct'],
  },
  boots: {
    major: ['dodge_pct', 'initiative_pct'],
    support: ['riposte_pct', 'regen_pct'],
  },
  accessory: {
    major: ['crit_pct', 'rage_pct'],
    support: ['lifesteal_pct', 'gold_pct', 'magic_find_pct', 'training_pct'],
  },
  // ⚠️ TRANSITOIRE : la relique devient une attaque spéciale à jauge (étape 4) et perd ses
  // stats. D'ici là elle garde des stats de survie, hors de la règle des deux emplacements.
  relic: {
    major: ['max_pv_pct'],
    support: ['rage_pct', 'regen_pct'],
  },
};

/** POIDS de chaque emplacement dans le budget de puissance (valeur × poids). L'arme porte
 *  seule les dégâts directs : elle pèse plus, pour que l'attaque et la survie reçoivent
 *  autant l'une que l'autre. ⚠️ Point de départ : réglé à la mesure à l'étape 7 (budget). */
export const SLOT_WEIGHT: Record<GearSlot, number> = {
  weapon: 1.5,
  armor: 1,
  shield: 0.75,
  helmet: 0.75,
  boots: 0.5,
  accessory: 1,
  relic: 1,
};

/** Le poids d'un emplacement (1 pour le familier et le trophée, qui ne sont pas tirés). */
function slotWeight(slot: ItemSlot): number {
  return slot in SLOT_WEIGHT ? SLOT_WEIGHT[slot as GearSlot] : 1;
}

/** Stats tirables pour un emplacement À CE NIVEAU (verrous de niveau des signatures).
 *  Jamais vide : chaque liste garde au moins une stat sans verrou (test dédié). */
function slotPool(slot: ItemSlot, kind: 'major' | 'support', level: number): EffectType[] {
  const lists = slot in SLOT_AFFIXES ? SLOT_AFFIXES[slot as GearSlot] : SLOT_AFFIXES.weapon;
  return lists[kind].filter((t) => (EFFECT_MIN_LEVEL[t] ?? 1) <= level);
}

/** Valeur de la stat principale d’une pièce de set, relative à un drop de même rareté.
 *  ⚠️ < 1 PARCE QU’ELLE PORTE UNE STAT QU’UN DROP N’A PAS À CET EMPLACEMENT (des dégâts sur un
 *  accessoire) et que les paliers s’y ajoutent. Mesuré, set complet de sa voie contre les 4
 *  meilleurs drops (40 tirages par emplacement), moyenne des 8 voies aux niveaux 30/60/90 :
 *  ×1 → +23/+30/+23 % · **×0,7 → +10/+12/+5 %** (cible de l’utilisateur : +5 à +10 %) ·
 *  ×0,55 → +3/+4/−4 %. */
const SET_PIECE_MAJOR_K = 0.7;

/** Stat PRINCIPALE d’une pièce de set, par emplacement : dégâts ou PV.
 *  ⚠️ JAMAIS UNE STAT PLAFONNÉE (critique, réduction). Mesuré : dès le niveau 30 le
 *  personnage de référence est au plafond du critique (50 % sur 60 avec l’équipement) et
 *  presque à celui de la réduction (45 % sur 50) — une pièce qui IMPOSE ces stats gaspille
 *  deux emplacements sur quatre, là où un drop en choisit une autre. Avec critique et
 *  réduction imposés sur l’accessoire et l’armure, un set complet décrochait de +8 % au
 *  niveau 30 à −1 % au niveau 90 ; en dégâts/PV l’écart est PLAT avec le niveau. */
const SET_SLOT_MAJORS: Partial<Record<ItemSlot, EffectType[]>> = {
  weapon: ['damage_pct'],
  armor: ['max_pv_pct'],
  shield: ['block_pct'],
  helmet: ['max_pv_pct'],
  boots: ['dodge_pct'],
  // ⚠️ L'anneau passe des dégâts au critique : les dégâts ne sont plus une stat d'anneau
  // (refonte équipement). Le plafond sec du critique n'existe plus (`CHANCE_CURVES`).
  accessory: ['crit_pct'],
  relic: ['max_pv_pct'],
};

/** Base de chaque effet, avant rareté, jet, niveau d'objet et poids d'emplacement.
 *  ⚠️ ÉCRITE EN CLAIR ET EXHAUSTIVE (refonte équipement) : elle était déduite de la 1re
 *  occurrence dans la table des stats par emplacement, donc une retouche pouvait
 *  changer en silence la magnitude de TOUS les objets. Les 13 valeurs d'avant sont
 *  reprises à l'identique (test dédié). */
const EFFECT_BASE: Record<EffectType, number> = {
  damage_pct: 8,
  crit_pct: 4,
  lifesteal_pct: 6,
  execute_pct: 12,
  momentum_pct: 3,
  dmg_reduction_pct: 6,
  max_pv_pct: 10,
  thorns_pct: 12,
  rage_pct: 12,
  gold_pct: 14,
  magic_find_pct: 6,
  regen_pct: 8,
  initiative_pct: 10,
  // Nouvelles (étape 3) — premières valeurs, réglées à l'étape 7 (budget).
  crit_dmg_pct: 20,
  accuracy_pct: 10,
  bleed_pct: 10,
  block_pct: 8,
  parry_pct: 5,
  riposte_pct: 8,
  crit_resist_pct: 15,
  start_shield_pct: 8,
  dodge_pct: 5,
  training_pct: 15,
};

/** Base d'un effet (avant rareté, jet et niveau d'objet) — celle d'un drop du héros. */
export function effectBase(t: EffectType): number {
  return EFFECT_BASE[t];
}

/** Effets tirables par la FORGE (code mort, testé) : la stat principale de l'emplacement. */
function availableEffects(slot: ItemSlot, level: number): { type: EffectType; base: number }[] {
  return slotPool(slot, 'major', level).map((type) => ({ type, base: EFFECT_BASE[type] }));
}

// Noms ÉVOCATEURS des objets à effet signature (« légendaires nommés » → le drop
// devient un événement, pas un « Lame mythique » de plus).
const SIGNATURE_NAMES: Partial<Record<EffectType, string[]>> = {
  execute_pct: ['Guillotine', 'Couperet du Bourreau', 'Faux des Âmes'],
  momentum_pct: ['Déferlante', 'Crescendo', 'Élan Implacable'],
  rage_pct: ['Cœur du Berserk', 'Fureur Écarlate', 'Rage du Damné'],
};

/** 🪓 LA FORME D’UNE ARME, pour l’avatar (v0.832 ; signalé par l’utilisateur : « j’ai une hache
 *  mais ça affiche une épée »). Aucun champ ne la stockait : elle vivait seulement dans le NOM.
 *  ⚠️ La table est la SOURCE des noms d’armes (`NAMES.weapon` en dérive) : ajouter un nom sans
 *  dire sa forme est impossible, et l’avatar ne peut pas retomber en silence sur l’épée. */
/** ⚠️ `arc` et `baton` n'ont pas de nom d'objet du héros : ce sont les armes de lignée des
 *  aventuriers (`LINEAGE_WEAPON_KIND`, advGear.ts), dessinées dans leur portrait (v0.865). */
export type WeaponKind = 'lame' | 'hache' | 'masse' | 'dague' | 'fleau' | 'faux' | 'arc' | 'baton';
const WEAPON_NOUN_KIND = {
  Lame: 'lame',
  Hache: 'hache',
  Masse: 'masse',
  Dague: 'dague',
  Fléau: 'fleau',
} as const satisfies Record<string, WeaponKind>;
/** Les noms ÉVOCATEURS d’arme (affixes signature) portent aussi leur forme. */
const SIGNATURE_WEAPON_KIND: Record<string, WeaponKind> = {
  Guillotine: 'hache',
  'Couperet du Bourreau': 'hache',
  'Faux des Âmes': 'faux',
  Déferlante: 'lame',
  Crescendo: 'lame',
  'Élan Implacable': 'lame',
};
/** La forme d’une arme, lue sur son nom (« Hache runique », « Hache · Carapace… »,
 *  « Guillotine »). Sans nom reconnu — un objet d’apparence, un nom d’avant — c’est une lame. */
export function weaponKind(it: { name?: string } | null | undefined): WeaponKind {
  const name = it?.name ?? '';
  for (const [sig, kind] of Object.entries(SIGNATURE_WEAPON_KIND)) {
    if (name.startsWith(sig)) return kind;
  }
  const noun = name.split(/[\s·]/)[0] ?? '';
  return ALL_WEAPON_NOUN_KIND[noun] ?? 'lame';
}
/** Le nom d’une arme signature (v0.888) : la faux n’est pas tirée comme arme ordinaire, mais
 *  une « Faux « Faux des Âmes » » doit rester une faux pour l’avatar. */
const ALL_WEAPON_NOUN_KIND: Record<string, WeaponKind> = { ...WEAPON_NOUN_KIND, Faux: 'faux' };
const KIND_NOUN: Partial<Record<WeaponKind, string>> = {
  lame: 'Lame',
  hache: 'Hache',
  masse: 'Masse',
  dague: 'Dague',
  fleau: 'Fléau',
  faux: 'Faux',
};

/** 🏷️ LE NOM D’UN OBJET SIGNATURE DIT CE QU’EST L’OBJET (v0.888 ; signalé par l’utilisateur :
 *  « dans le sac les icônes et les noms sont bizarres »). Le nom évocateur REMPLAÇAIT le
 *  nom d’objet : une cuirasse s’appelait « Élan Implacable », un anneau « Déferlante », et
 *  depuis que les drops tombent au rang du joueur (v0.875) presque tout le sac était ainsi.
 *  Désormais « Cuirasse « Élan Implacable » » : l’objet d’abord, l’épithète ensuite.
 *  ⚠️ AUCUN TIRAGE en plus : l’arme prend le nom de la forme de son épithète (Guillotine →
 *  Hache), les autres emplacements le lisent sur le JET déjà tiré — les combats seedés ne
 *  bougent pas. */
function signatureNoun(slot: ItemSlot, sig: string, roll: number): string {
  if (slot === 'weapon') return KIND_NOUN[SIGNATURE_WEAPON_KIND[sig] ?? 'lame'] ?? 'Lame';
  const pool = NAMES[slot];
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, roll) * pool.length))]!;
}
const ALL_SIGNATURE_NAMES = new Set(Object.values(SIGNATURE_NAMES).flat());

/** Le NOM D’OBJET (premier mot) : « Hache », « Anneau »… — c’est lui qui donne l’icône. */
export function itemNoun(it: { name?: string; slot?: ItemSlot } | null | undefined): string {
  return (it?.name ?? '').split(/[\s·]/)[0] ?? '';
}

// Noms d'objets par slot (saveur).
const NAMES: Record<ItemSlot, string[]> = {
  weapon: Object.keys(WEAPON_NOUN_KIND),
  armor: ['Plastron', 'Cotte', 'Cuirasse', 'Harnois'],
  shield: ['Écu', 'Pavois', 'Rondache', 'Targe'],
  helmet: ['Heaume', 'Casque', 'Bassinet', 'Morion'],
  boots: ['Bottes', 'Grèves', 'Solerets', 'Jambières'],
  // Anneau : « Amulette », « Talisman » et « Bracelet » restent reconnus (objets déjà
  // possédés, cf. NOUN_ICON) mais ne tombent plus.
  accessory: ['Anneau', 'Chevalière', 'Bague', 'Jonc'],
  relic: ['Éclat', 'Totem', 'Sceau', 'Idole'],
  familiar: ['Compagnon'], // nom réel = nom de la race (cf. rollFamiliar)
  trophy: ['Trophée'], // nom réel = l'exo du boss (cf. rollTrophy)
};
// Complément de nom selon le RANG (v0.874) : « Lame d’or », « Cuirasse des dieux ». Des
// compléments et pas des adjectifs : les noms mêlent masculin et féminin.
const RARITY_ADJ: Record<Rarity, string> = {
  commun: 'de bronze',
  inhabituel: 'd’argent',
  magique: 'd’or',
  rare: 'd’or noir',
  epique: 'légendaire',
  legendaire: 'des demi-dieux',
  mythique: 'des dieux',
  primordial: 'des anciens dieux',
};
/** Adjectifs d’AVANT la v0.874, qui nommaient la rareté (« Cuirasse mythique ») — un nom qui
 *  contredirait le rang affiché à côté. */
const LEGACY_RARITY_ADJ: Record<Rarity, string> = {
  commun: 'brut',
  inhabituel: 'affûté',
  magique: 'runique',
  rare: 'enchanté',
  epique: 'héroïque',
  legendaire: 'légendaire',
  mythique: 'mythique',
  primordial: 'primordial',
};

/** Renomme un objet déjà possédé dont le nom finit par l’ancien adjectif de SA rareté.
 *  Idempotent (l’ancien et le nouveau complément diffèrent pour chaque rareté) ; les noms
 *  signature (« Guillotine ») et les pièces de set ne portent pas d’adjectif : intacts. */
export function renameLegacyItem<
  T extends { name: string; rarity: Rarity; slot?: ItemSlot; roll?: number },
>(it: T): T {
  // Nom signature SEUL (« Déferlante ») d’avant la v0.888 : on remet l’objet devant.
  if (it.slot && it.slot in NAMES && ALL_SIGNATURE_NAMES.has(it.name))
    return { ...it, name: `${signatureNoun(it.slot, it.name, it.roll ?? 0)} « ${it.name} »` };
  const old = ` ${LEGACY_RARITY_ADJ[it.rarity]}`;
  if (!it.name.endsWith(old)) return it;
  return { ...it, name: it.name.slice(0, -old.length) + ` ${RARITY_ADJ[it.rarity]}` };
}

/** Formate une valeur d'effet avec 1 décimale au plus (trim .0) → la qualité (+2,5 %/★)
 *  reste visible même sur les petites stats (ex. B★1 vs B★5, ticket df3feade). */
function fmtEffectValue(v: number): string {
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
    case 'magic_find_pct':
      return `+${s}% butin (loot)`;
    case 'regen_pct':
      return `+${s}% régén entre combats`;
    case 'initiative_pct':
      return `+${s}% initiative`;
    case 'execute_pct':
      return `+${s}% dégâts (ennemi < 25% PV)`;
    case 'rage_pct':
      return `+${s}% dégâts (toi < 30% PV)`;
    case 'momentum_pct':
      return `+${s}% dégâts par tour (cumul, 4 tours)`;
    case 'thorns_pct':
      return `renvoie ${s}% des dégâts reçus`;
    case 'crit_dmg_pct':
      return `+${s}% dégâts critiques`;
    case 'accuracy_pct':
      return `+${s}% précision`;
    case 'bleed_pct':
      return `${s}% des dégâts en saignement`;
    case 'block_pct':
      return `+${s}% blocage`;
    case 'parry_pct':
      return `+${s}% parade`;
    case 'riposte_pct':
      return `+${s}% riposte`;
    case 'crit_resist_pct':
      return `+${s}% résistance aux critiques`;
    case 'start_shield_pct':
      return `+${s}% bouclier de départ`;
    case 'dodge_pct':
      return `+${s}% esquive`;
    case 'training_pct':
      return `+${s}% dressage du familier`;
  }
}
/** Comment se LIT chaque canal d’un agrégat.
 *
 * ⚠️ EXHAUSTIVE PAR CONSTRUCTION (`Record<keyof AggregatedEffects, …>`) : ajouter un
 * canal sans dire comment il se lit **casse la compilation** au lieu de le faire
 * disparaître en silence de tous les écrans.
 *
 * ⚠️ L’esquive n’a PAS d’`EffectType` — aucun objet ne la donne, elle ne vient que des
 * talents et des voies — d’où son cas propre plutôt qu’un canal muet.
 *
 * Au niveau MODULE, et pré-« entrée » : la table est constante, la reconstruire à
 * chaque appel coûtait ~16 allocations jetables pour lire des littéraux.
 */
const AGGREGATE_AS: Record<keyof AggregatedEffects, EffectType> = {
  // Ordre de LECTURE : ce qui pèse d'abord, les stats de confort en dernier.
  damagePct: 'damage_pct',
  maxPvPct: 'max_pv_pct',
  dmgReduction: 'dmg_reduction_pct',
  critAdd: 'crit_pct',
  dodgeAdd: 'dodge_pct',
  lifesteal: 'lifesteal_pct',
  thornsPct: 'thorns_pct',
  executePct: 'execute_pct',
  ragePct: 'rage_pct',
  momentumPct: 'momentum_pct',
  goldPct: 'gold_pct',
  magicFindPct: 'magic_find_pct',
  regenPct: 'regen_pct',
  initiativePct: 'initiative_pct',
  critDmgPct: 'crit_dmg_pct',
  accuracyPct: 'accuracy_pct',
  bleedPct: 'bleed_pct',
  blockPct: 'block_pct',
  parryPct: 'parry_pct',
  ripostePct: 'riposte_pct',
  critResistPct: 'crit_resist_pct',
  startShieldPct: 'start_shield_pct',
  trainingPct: 'training_pct',
};
/** Le pictogramme de chaque canal — repris de la fiche Héros, qui les affichait déjà. */
const AGGREGATE_EMOJI: Record<keyof AggregatedEffects, string> = {
  damagePct: '⚔️',
  maxPvPct: '❤️',
  dmgReduction: '🛡️',
  critAdd: '🎯',
  dodgeAdd: '💨',
  lifesteal: '🩸',
  thornsPct: '🌵',
  executePct: '🪓',
  ragePct: '💢',
  momentumPct: '🌀',
  goldPct: '🪙',
  magicFindPct: '🍀',
  regenPct: '💧',
  initiativePct: '⚡',
  critDmgPct: '💥',
  accuracyPct: '👁️',
  bleedPct: '🩸',
  blockPct: '🛡️',
  parryPct: '🤺',
  ripostePct: '↩️',
  critResistPct: '🪖',
  startShieldPct: '🔰',
  trainingPct: '🐾',
};
const AGGREGATE_KEYS = Object.keys(AGGREGATE_AS) as (keyof AggregatedEffects)[];

/**
 * UN AGRÉGAT D’EFFETS, PRÊT À LIRE : « +4,2% dégâts », « −1,8% dégâts reçus »…
 *
 * ⚠️ `AggregatedEffects` EST EN FRACTIONS (0,042), `effectLabelFor` ATTEND DES
 * POURCENTS. La conversion vit donc ICI, une fois : c’est exactement le piège qui a
 * déjà coûté un facteur CENT au projet, et le laisser à chaque écran c’est le rejouer
 * — la fiche Héros le rejouait d’ailleurs sur quatre canaux.
 *
 * Les canaux à zéro — et ceux qui s’afficheraient « +0% » une fois arrondis — sont
 * tus : mieux vaut ne rien dire que promettre un gain nul.
 */
export function aggregateLines(fx: AggregatedEffects, opts?: { emoji?: boolean }): string[] {
  return AGGREGATE_KEYS.flatMap((key) => {
    const pct = fx[key] * 100;
    if (Math.round(pct * 10) === 0) return [];
    const type = AGGREGATE_AS[key];
    const txt = effectLabelFor(type, pct);
    return [opts?.emoji ? `${AGGREGATE_EMOJI[key]} ${txt}` : txt];
  });
}
/** Libellé de l'effet à un niveau d'objet donné (valeur réelle) — legacy (familiers). */
export function effectLabel(e: ItemEffect, level = 1): string {
  // ⚠️ Délègue : c'était une COPIE de `effectLabelFor`, qui aurait divergé au premier ajout.
  return effectLabelFor(e.type, effectiveValue(e, level));
}

/** Puissance indicative d'un objet (somme des affixes au niveau courant) → compare deux objets. */
export function itemScore(it: Item): number {
  return (
    effectiveValue(it.effect, it.level) +
    (it.effect2 ? effectiveValue(it.effect2, it.level) : 0) +
    (it.effect3 ? effectiveValue(it.effect3, it.level) : 0)
  );
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// ── Tirage de RARETÉ (gatée par la profondeur) ──
// ⚠️ PLUS UTILISÉ PAR LES DROPS depuis la v0.875 (règle des familiers, `rollTier`) : ne sert
// plus qu'au plafond de grade `maxGradeCran`. Plafond de rareté selon le NIVEAU du contenu (racine → RAPIDE tôt, LENT tard) : Commun→Rare
// le 1er mois, puis chaque tier coûte de plus en plus (Légendaire ≈ niv.36, Primordial ≈ niv.64
// → graal long terme). 8 tiers (index 0..7). Calibré par simulation.
export function rankCeilingForLevel(level: number): number {
  return Math.min(7, Math.max(0, Math.floor(Math.sqrt(Math.max(0, level)) * 0.9)));
}
/** CRAN de grade MAX DROPPABLE (0..49 = rang×5 + qualité−1) à un niveau donné = rang √-gaté,
 *  qualité 5. (Talents/familiers sont des drops purs — plus d'infusion de grade.) */
export function maxGradeCran(level: number): number {
  return rankCeilingForLevel(level) * 5 + 4;
}
// Gaussienne seedée (Box-Muller) — 2 tirages rng, déterministe.
function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── RANG DES OBJETS : LA RÈGLE DES FAMILIERS (v0.875), AFFINÉE EN v0.894-0.895 ──
// Remplace la PYRAMIDE centrée sur le plafond √ du niveau (v0.564→0.874) : jamais au-dessus
// du rang de prestige du joueur (`rollCompanionTier`). La règle en vigueur est plus bas
// (« TON RANG S'OUVRE SUR LA DURÉE DU RANG »).

/** Un bonus de rang (Autel des boss, générosité des boss) exprimé en CHANCE : sous cette règle,
 *  il ne décale plus le pic : il resserre la traîne basse et améliore le jet. */
const FLOOR_LUCK = 0.5;
/** Chance ajoutée par un plancher d'Autel `rollFloor` (0..1) — ce que l'écran annonce. */
export function altarLuckBonus(rollFloor: number): number {
  return Math.min(1, Math.max(0, rollFloor)) * ROLL_FLOOR_RANKS * FLOOR_LUCK;
}

// JET biaisé vers le BAS (comme la rareté : un HAUT jet se mérite). Transformation puissance
// `rng()^exp` (exp > 1 → hauts jets rares). La `luck` (magic find/profondeur/Autel) réduit
// l'exposant → aplatit puis favorise les hauts jets (3ᵉ loterie dopée par la luck, avec le
// rang et l'ilvl). Impact magnitude MODÉRÉ (le jet ne couvre qu'une bande de +21,9 % dans le
// rang) : jet moyen ~0,31 (luck 0) → ~0,56 (luck 1) vs 0,5 uniforme.
const BASE_JET_EXP = 2.2;
export function jetExp(luck = 0): number {
  return Math.max(0.8, BASE_JET_EXP - Math.min(1, Math.max(0, luck)) * 1.6);
}
/** Jet continu [0,1] biaisé bas (haut jet rare), dopé par la luck. */
export function rollJetValue(rng: () => number, luck = 0): number {
  return Math.pow(rng(), jetExp(luck));
}
// ── TON RANG S'OUVRE SUR LA DURÉE DU RANG, EN PART ET EN ÉTOILES (v0.894-0.895, utilisateur) ──
// ⚠️ SOURCE DE VÉRITÉ, affine la v0.876. Mesuré avant : les 4 emplacements tombaient à ton
// rang en 7 à 9 donjons nettoyés, alors qu'un rang dure dix niveaux. Deux règles, voulues
// ensemble (« on ne drop pas QUE de son rang, mais il y a une possibilité de drop du nouveau
// rang même au début, surtout 1 étoile — il faut la motivation de changer de rang ») :
// (1) LA PART de ton rang (`ownRankChance`) est BASSE en début de rang — jamais nulle — et
// monte avec la position dans le rang ; le reste tombe au rang d'en dessous.
// ⚠️ LE BON REPÈRE EST LE NIVEAU, PAS LE JOUR : l'énergie d'aventure EST l'XP de sport, donc
// ce qu'on joue pendant un niveau est fixé par le coût de ce niveau, quel que soit le rythme.
// La part se rapporte aux drops qu'un niveau finance (`dropsPerLevel`) : la même durée en
// NIVEAUX au niveau 15 et au niveau 70.
// (2) LES ÉTOILES d'un objet DE TON RANG (1 à 5, tranches de son jet) suivent TON étoile dans
// ton rang (un rang = 10 niveaux = 5 étoiles) — jamais au-dessus, `STAR_JET.top` à ton
// étoile, le reste réparti en dessous (la moitié à chaque cran). La chance (profondeur,
// Autel, boss tué tôt) relève la part de ton étoile.
// Pourquoi ça motive : les tranches de jet des rangs se suivent (`rankRollMult`), donc une ★1
// du nouveau rang vaut au moins une ★5 de l'ancien — et elle peut porter un affixe, voire un
// effet légendaire, de plus. Le stuff ★5 de ton rang n'arrive qu'en fin de rang.
// Les objets d'un rang INFÉRIEUR au tien gardent le jet d'avant (biaisé bas, dopé par la
// chance). Même règle d'étoiles pour le TROPHÉE (dont le rang est toujours le tien).
export const OWN_RANK = {
  /** Objets de ton rang attendus au k-ième niveau du rang, en plus de `atStart`, en multiple
   *  de k. Réglé par simulation : les 4 emplacements à ton rang vers la mi-rang. */
  perPos: 0.5,
  /** Objets de ton rang attendus dès le PREMIER niveau du rang : une possibilité réelle, basse. */
  atStart: 1,
};
/** Chance d'un objet quand ses monstres sont tous vaincus / partiellement (`rollDrop`). */
export const DROP_CHANCE = { cleared: 0.6, partial: 0.3 };
/** Modèle du volume de drops d'un niveau (lu par `dropsPerLevel`). */
const SET_PIECES_PER_CLEAR = 0.4;
const DROP_VOLUME = {
  /** Pièces de boss (de set) que les pierres d'invocation d'un donjon nettoyé financent. */
  setPiecesPerClear: SET_PIECES_PER_CLEAR,
  /** Objets par donjon nettoyé : 3 monstres × `DROP_CHANCE.cleared`, plus les pièces de boss. */
  perClear: 3 * DROP_CHANCE.cleared + SET_PIECES_PER_CLEAR,
  /** Énergie d'un donjon — `DUNGEON_ENERGY_CAP` de data/dungeons.ts, recopiée : l'importer
   *  ici créerait un cycle (dungeons → proceduralContent → items). */
  energyPerClear: 40,
  /** Énergie en plus de l'XP de sport (connexion, Dynamo, puits). */
  energyExtra: 1.3,
};
/** Drops qu'un niveau finance en moyenne : coût du niveau (l'énergie EST l'XP de sport). */
export function dropsPerLevel(level: number): number {
  return (
    (levelCost(level) * DROP_VOLUME.energyExtra * DROP_VOLUME.perClear) / DROP_VOLUME.energyPerClear
  );
}
/** Pièces d'UN set de voie qu'un niveau finance : les pièces de boss du niveau, réparties sur
 *  les sets de voie (un boss tire son set au hasard, `randomVoieSetId`). C'est le VOLUME
 *  auquel se rapporte la part de ton rang d'une pièce de set (cf. `ownChanceOf`). */
export function setPiecesPerLevel(level: number): number {
  return (
    (dropsPerLevel(level) * DROP_VOLUME.setPiecesPerClear) / DROP_VOLUME.perClear / VOIE_SETS.length
  );
}
/** Au-delà des 8 raretés (rangs de prestige 9-10) : plus de rang d'objet nouveau. */
const beyondItemRanks = (c: CharacterRank) => c.rankIndex > RANK_ORDER.length - 1;
/** Part de ton rang, rapportée au VOLUME de la source (objets qu'un niveau en fournit).
 *  ⚠️ « AUTANT D'OBJETS DE TON RANG PAR NIVEAU, QUELLE QUE SOIT LA SOURCE » (v0.1024, mesuré).
 *  Rapportée au volume des DROPS, elle s'appliquait telle quelle aux pièces de set, dont un
 *  niveau ne fournit que ~5 par set (contre ~220 drops au niveau 30) : une pièce de set
 *  tombait à son rang ~40 fois moins souvent qu'un drop — 0 à 2 % des pièces du niveau 25 au
 *  75 — et un set complet ne valait presque rien (×1,00 à ×1,07) avant le niveau 81. */
function ownChanceOf(
  c: CharacterRank,
  playerLevel: number,
  volume: (level: number) => number = dropsPerLevel,
): number {
  if (c.rankIndex === 0 || beyondItemRanks(c)) return 1;
  const pos = Math.max(1, Math.floor(playerLevel)) - rankStartLevel(c.rankIndex);
  return Math.min(1, (OWN_RANK.atStart + OWN_RANK.perPos * pos) / volume(playerLevel));
}
/** Chance qu'un objet tombe au rang DU JOUEUR (0..1). 1 au rang Bronze (rien en dessous) et
 *  au-delà des 8 raretés. */
export function ownRankChance(playerLevel: number): number {
  return ownChanceOf(characterRank(playerLevel), playerLevel);
}
/** Rang de référence d'un contenu, rang du joueur, et part de son rang : gatée seulement quand
 *  la référence EST le rang du joueur (un contenu moins profond garde l'ancienne règle).
 *  `characterRank` n'est lu qu'une fois (appelé à chaque drop). */
function rankGate(level: number, playerLevel?: number, volume?: (level: number) => number) {
  const player = playerLevel ?? level;
  const c = characterRank(player);
  const mine = Math.min(RANK_ORDER.length - 1, c.rankIndex);
  const ref = prestigeRankIndex(Math.min(level, player));
  return { c, mine, ref, own: ref === mine ? ownChanceOf(c, player, volume) : 1 };
}

export const STAR_JET = { top: 0.6, topLuck: 0.3, topMax: 0.9 };

/** Étoile (1..5) d'un objet dont le jet vaut `roll`. */
export function jetStar(roll: number | undefined): number {
  const r = Math.min(1, Math.max(0, roll ?? 0));
  return Math.min(STARS_PER_RANK, Math.floor(r * STARS_PER_RANK) + 1);
}

/** Étoile du joueur plafonnant ses objets : la sienne, ou ★5 au-delà des 8 raretés. */
const starCap = (c: CharacterRank) => (beyondItemRanks(c) ? STARS_PER_RANK : c.star);

/** Poids (non normalisé) de l'étoile `j` < `s` : la moitié à chaque cran sous `s`. La somme
 *  des crans 1..s−1 vaut 1 − 0,5^(s−1). */
const lowerStarShare = (j: number, s: number) => Math.pow(0.5, s - j) / (1 - Math.pow(0.5, s - 1));

function topShare(luck: number): number {
  return Math.min(STAR_JET.topMax, STAR_JET.top + STAR_JET.topLuck * Math.max(0, luck));
}

/** Chances de chaque étoile (index 0 = ★1) d'un objet de son rang, pour un joueur de niveau
 *  `level`. */
export function starOdds(level: number, luck = 0): number[] {
  const s = starCap(characterRank(level));
  const top = s <= 1 ? 1 : topShare(luck);
  return Array.from({ length: STARS_PER_RANK }, (_, k) =>
    k + 1 === s ? top : k + 1 < s ? (1 - top) * lowerStarShare(k + 1, s) : 0,
  );
}

/** Tire le jet (0..1) d'un objet de son rang : une étoile (`starOdds`), puis uniforme dans sa
 *  tranche. Sans allocation (appelé à chaque drop de son rang).
 *
 *  ⚠️ NE PAS le remplacer par un `pick` pondéré générique (celui de `skirmish.ts`, par
 *  exemple) — proposé par une revue `/simplify`, VÉRIFIÉ puis REFUSÉ. Trois différences
 *  portantes : (1) il n'alloue AUCUN tableau de poids, sur un chemin appelé à chaque drop ;
 *  (2) il descend depuis l'étoile HAUTE (la part `topShare` d'abord, puis s−1 … 1) quand un
 *  `pick` générique parcourt la liste EN AVANT — donc, pour le même `u`, il ne désigne pas
 *  la même étoile ; (3) tous les tirages d'objets sont SEEDÉS, donc changer cette
 *  correspondance `u → étoile` changerait le butin de chaque graine du jeu. Deux sélections
 *  pondérées ne sont pas pour autant la même fonction. */
function rollStarJet(rng: () => number, c: CharacterRank, luck: number): number {
  const s = starCap(c);
  let u = rng();
  let star = s;
  if (s > 1) {
    const top = topShare(luck);
    if (u >= top) {
      u = (u - top) / (1 - top);
      star = 1;
      for (let j = s - 1; j >= 1; j--) {
        const w = lowerStarShare(j, s);
        if (u < w) {
          star = j;
          break;
        }
        u -= w;
      }
    }
  }
  return (star - 1 + rng()) / STARS_PER_RANK;
}

/** Tire le { rank, roll } d'un OBJET : rang de référence = rang de prestige de min(contenu,
 *  joueur), jamais au-dessus. Quand c'est le rang du joueur, il ne tombe qu'avec
 *  `ownRankChance` (sinon le rang d'en dessous et sa traîne), et son jet se tire par étoiles
 *  (`starOdds`) ; un objet d'un rang inférieur garde le jet d'avant. `floorBonus` (en rangs)
 *  devient de la chance. */
export function rollTier(
  rng: () => number,
  level: number,
  luck = 0,
  floorBonus = 0,
  playerLevel?: number,
  /** Objets que cette SOURCE fournit par niveau (défaut : les drops, `dropsPerLevel`). */
  volume?: (level: number) => number,
): { rank: Rarity; roll: number } {
  const l = Math.min(1, Math.max(0, luck) + Math.max(0, floorBonus) * FLOOR_LUCK);
  const g = rankGate(level, playerLevel, volume);
  if (g.own < 1 && rng() < g.own)
    return { rank: RANK_ORDER[g.ref]!, roll: rollStarJet(rng, g.c, l) };
  const t = rollCompanionTier(rng, g.own < 1 ? g.ref - 1 : g.ref, l);
  return RARITY_RANK[t.rank] === g.mine ? { rank: t.rank, roll: rollStarJet(rng, g.c, l) } : t;
}

// ── RANG DES COMPAGNONS : familiers et talents plafonnés au RANG DU JOUEUR (v0.857) ──
// ⚠️ Depuis la v0.875 les OBJETS suivent la même règle (`rollTier`). Un
// familier ou un talent se lit en RANG (v0.833) — Bronze, Argent, Or… — comme le héros et ses
// aventuriers. Mesuré avant ce changement, au niveau 30 (rang Or) au Labyrinthe du Sans-fond :
// 12 % de familiers de son rang, 36 % deux rangs au-dessus, 23 % trois rangs au-dessus. Trois
// causes cumulées : le plafond √ court devant le rang du joueur (Épique au niveau 30, soit deux
// rangs d’avance) ; la chance du Labyrinthe vaut toujours 1 (palier 0,9 + Porte) et élargit la
// pointe haute ; et la borne douce laisse passer deux rangs de plus.
// ⚠️ v0.876 (demandé par l’utilisateur : « limite les drops partout au rang du joueur max, pas
// plus haut ») : la très rare chance d’un rang AU-DESSUS (1 à 3 %) est SUPPRIMÉE. Aucun tirage
// — objet, pièce de set, trophée, familier, talent, pièce d’aventurier — ne dépasse le rang du
// joueur. La chance (contenu, Autel, magic find) ne fait plus que resserrer la traîne basse et
// améliorer le jet.
export const COMPANION_RANK = {
  /** Étalement des rangs EN DESSOUS (gaussienne repliée) : la chance le resserre → on farme
   *  surtout des familiers de SON rang. */
  loWidth: 0.66,
  loWidthLuck: 0.18,
};

/** Rang (index de rareté) d’un niveau sur l’échelle de PRESTIGE — 1 rang tous les 10 niveaux,
 *  celle du héros et des classes d’aventurier. Bornée aux 8 raretés (les deux derniers rangs de
 *  prestige n’ont pas de rareté propre). */
export function prestigeRankIndex(level: number): number {
  return Math.min(RANK_ORDER.length - 1, characterRank(level).rankIndex);
}

/** Rang de référence d’un compagnon tombé d’un contenu : celui de min(contenu, joueur). */
export function companionDropRank(level: number, playerLevel?: number): number {
  return prestigeRankIndex(playerLevel == null ? level : Math.min(level, playerLevel));
}

/** Rang de référence d’un familier. Sans `rankCap` : min(contenu, joueur). Avec `rankCap` (le
 *  rang d’un palier du Labyrinthe), c’est LUI qui borne le contenu, à la place du niveau du
 *  palier : un palier « Niv 40 » vaut le rang Or noir, et le joueur qui passe Légendaire au
 *  niveau 41 n’y aurait plus trouvé son rang avant d’affronter un palier de niveau 52 — or son
 *  rang doit se décaler dès qu’il le gagne. */
export function familiarRankRef(opts: {
  level: number;
  playerLevel?: number;
  rankCap?: number;
}): number {
  if (opts.rankCap == null) return companionDropRank(opts.level, opts.playerLevel);
  return Math.min(opts.rankCap, prestigeRankIndex(opts.playerLevel ?? opts.level));
}

/** Tire le { rank, roll } de tout ce qui se porte : SON rang le plus souvent, en dessous
 *  parfois, JAMAIS au-dessus. `rankCap` = rang de référence (le rang du joueur, déjà borné par
 *  le contenu) — c’est un PLAFOND. Le JET garde la chance : c’est lui qu’on farme. */
export function rollCompanionTier(
  rng: () => number,
  rankCap: number,
  luck = 0,
): { rank: Rarity; roll: number } {
  const l = Math.min(1, Math.max(0, luck));
  const c = Math.min(RANK_ORDER.length - 1, Math.max(0, Math.round(rankCap)));
  const width = COMPANION_RANK.loWidth - COMPANION_RANK.loWidthLuck * l;
  const idx = c - Math.round(Math.abs(gaussian(rng)) * width);
  return {
    rank: RANK_ORDER[Math.max(0, idx)]!,
    roll: rollJetValue(rng, luck),
  };
}

// NIVEAU D'OBJET = pyramide centrée sur `center = min(niveau perso, niveau donjon)` (v0.583).
// Traîne BASSE (fourrage, objets un peu sous ton niveau), pointe HAUTE chanceuse dopée par la
// `luck`/magic find (ilvl un peu AU-DESSUS = beau drop), BORNÉE (anti-runaway : jamais loin
// au-dessus de ton niveau → le multiplicateur de niveau reste sous contrôle).
const ILVL_LO_WIDTH = 2.5; // écart-type bas (fourrage)
export function rollItemLevel(rng: () => number, center: number, luck = 0): number {
  const l = Math.min(1, Math.max(0, luck));
  const g = gaussian(rng);
  const hiWidth = 1.2 + l * 2.5; // pointe haute (chance), épaissie par le magic find
  const raw = center + (g >= 0 ? g * hiWidth : g * ILVL_LO_WIDTH);
  const hi = center + Math.round(4 + l * 5); // borne haute : +4 (luck 0) → +9 (luck 1)
  const lo = Math.max(1, center - 6);
  return Math.max(lo, Math.min(hi, Math.round(raw)));
}

/** Bande de rang TYPIQUE d'un contenu : du rang typiquement en dessous au rang de référence
 *  (jamais au-dessus). Déterministe. */
export function dropBand(
  level: number,
  luck = 0,
  playerLevel?: number,
): { lo: { rank: Rarity; quality: number }; hi: { rank: Rarity; quality: number } } {
  const ref = companionDropRank(level, playerLevel);
  const peak = RARITY_RANK[dropPeakRank(level, playerLevel)];
  const l = Math.min(1, Math.max(0, luck));
  const width = COMPANION_RANK.loWidth - COMPANION_RANK.loWidthLuck * l;
  const loI = Math.max(0, peak - Math.round(1.3 * width));
  return { lo: { rank: RANK_ORDER[loI]!, quality: 3 }, hi: { rank: RANK_ORDER[ref]!, quality: 3 } };
}

/** Libellé compact de la bande de drop, en RANGS : « Argent → Or » (ou « Or » seul). */
export function dropBandLabel(level: number, luck = 0, playerLevel?: number): string {
  const { lo, hi } = dropBand(level, luck, playerLevel);
  const name = (r: Rarity) => rarityRank(r).name;
  return lo.rank === hi.rank ? name(lo.rank) : `${name(lo.rank)} → ${name(hi.rank)}`;
}
/** Rang le PLUS PROBABLE d'un drop : le rang de référence (min contenu, joueur), ou celui
 *  d'en dessous tant que le rang du joueur ne s'est pas assez ouvert (`ownRankChance`). */
export function dropPeakRank(level: number, playerLevel?: number): Rarity {
  const g = rankGate(level, playerLevel);
  return RANK_ORDER[g.own < 0.5 ? g.ref - 1 : g.ref]!;
}
/** Rang seul (utilitaires forge/familier qui n'ont pas besoin de la qualité fine). */
function rollRarity(rng: () => number, luck = 0, level = 1): Rarity {
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
/**
 * DE COMBIEN DE RANGS un plancher `rollFloor` plein (1) décale la pyramide de rareté.
 *
 * ⚠️ MALGRÉ SON NOM, LE « PLANCHER DE JET » AGIT SUR LA RARETÉ, PAS SUR LE JET : il est
 * ajouté au `floorBonus` de `rollTier`. Mesuré (v0.799) — l’Autel des boss monté au
 * niveau du joueur donnait un jet moyen inchangé (~45 %) mais **54 à 56 %** de pièces
 * DEUX raretés au-dessus de sa ligue. Nommée pour que les écrans puissent afficher ce que
 * le bonus fait VRAIMENT (des rangs), plutôt qu’un pourcentage de « jet » qui ment.
 */
const ROLL_FLOOR_RANKS = 1.6;

export function rollDrop(
  rng: () => number,
  opts: {
    cleared: boolean;
    defeated: number;
    level?: number;
    spread?: number;
    luck?: number;
    rollFloor?: number; // 0..1 : plancher de qualité de roll (Autel des boss) → meilleures étoiles
    playerLevel?: number; // cap anti-runaway : le rang est plafonné à playerLevel + marge
  },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? DROP_CHANCE.cleared : DROP_CHANCE.partial;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  // NIVEAU D'OBJET (ilvl) = PYRAMIDE centrée sur min(niveau donjon, niveau perso) → mostly
  // à ton niveau, parfois un peu au-dessus (chance, dopée magic find), borné (anti-runaway).
  const ilvlCenter =
    opts.playerLevel != null ? Math.min(opts.level ?? 1, opts.playerLevel) : (opts.level ?? 1);
  const lvl = rollItemLevel(rng, ilvlCenter, opts.luck ?? 0);
  // RANG = ton rang de prestige (min contenu, joueur) au plus, jamais au-dessus (v0.876) ;
  // traîne basse (fourrage) resserrée par la `luck` et `rollFloor` (Autel). Le JET est un roll
  // continu → farm du meilleur jet.
  const floorRanks = Math.min(1, Math.max(0, opts.rollFloor ?? 0)) * ROLL_FLOOR_RANKS;
  const { rank: rarity, roll } = rollTier(
    rng,
    opts.level ?? 1,
    opts.luck ?? 0,
    floorRanks,
    opts.playerLevel,
  );
  // value = base × intervalle du RANG selon le JET (rankRollMult). La PROFONDEUR est encodée
  // par le RANG (pyramide) ; le jet (roll) balaie tout l'intervalle du rang → chasse au bon jet.
  const w = slotWeight(slot);
  const rollValue = (t: EffectType) =>
    Math.max(0.1, round1(EFFECT_BASE[t] * rankRollMult(rarity, roll) * w));
  // MULTI-AFFIXE PAR TIER (v0.581, façon Diablo) : la rareté donne 1→3 affixes, tirés
  // UN PAR TIER (majeur → secondaire → mineur). Plus la rareté est haute, plus on descend
  // l'échelle d'impact (une grosse stat + du soutien + un bonus light). Tiers disjoints →
  // pas de doublon de type. Tirage UNIFORME dans chaque tier (la voie n'oriente PAS les drops).
  const affixCount = affixCountForRarity(rarity);
  const affixes: ItemEffect[] = [];
  for (let a = 0; a < affixCount; a++) {
    // Gate des affixes = ton NIVEAU RÉEL (ilvlCenter), pas l'ilvl chanceux → un drop lucky
    // gagne de la MAGNITUDE (levelMult), pas des affixes exotiques hors de ta ligue.
    const p = slotPool(slot, a === 0 ? 'major' : 'support', ilvlCenter).filter(
      (t) => !affixes.some((x) => x.type === t),
    );
    if (!p.length) continue; // plus de stat libre dans la liste → on saute cet affixe
    const type = pick(rng, p);
    affixes.push({ type, value: rollValue(type) });
  }
  const chosen = affixes[0]!;
  const effect2 = affixes[1];
  const effect3 = affixes[2];
  // Objet portant un affixe SIGNATURE (n'importe quel tier) → nom évocateur (« Guillotine ») ;
  // sinon nom + adjectif de rareté.
  const sigAffix = affixes.find((e) => SIGNATURE_NAMES[e.type]);
  const sig = sigAffix ? pick(rng, SIGNATURE_NAMES[sigAffix.type]!) : null;
  const name = sig
    ? `${signatureNoun(slot, sig, roll)} « ${sig} »`
    : `${pick(rng, NAMES[slot])} ${RARITY_ADJ[rarity]}`;
  // NIVEAU D'OBJET (v0.583) = ilvl tiré ci-dessus → 3ᵉ axe de magnitude (itemLevelMult).
  // La valeur des affixes reste level-indépendante ; le multiplicateur de niveau est appliqué
  // en aval (aggregateEffects/effectiveValue) → un même objet à ilvl plus haut est plus fort.
  const level = lvl;
  // PROC LÉGENDAIRE (Phase 3) : un objet Légendaire+ porte un effet non-scalant (thème du slot).
  const legendary =
    RARITY_RANK[rarity] >= LEGENDARY_MIN_RANK ? rollLegendaryProc(rng, slot) : undefined;
  return {
    slot,
    name,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: chosen, // affixe primaire (multi-affixe selon la rareté, cf. affixCountForRarity)
    ...(effect2 ? { effect2 } : {}),
    ...(effect3 ? { effect3 } : {}),
    ...(legendary ? { legendary } : {}),
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
  opts: {
    setId: string;
    level: number;
    luck?: number;
    preferSlot?: ItemSlot;
    rollFloor?: number;
    playerLevel?: number; // cap anti-runaway : rang plafonné à playerLevel + marge
  },
): Omit<Item, 'id'> {
  const set = SET_BY_ID[opts.setId];
  const slot = opts.preferSlot ?? pick(rng, SLOTS);
  // ⚠️ Depuis la v0.875 le rang suit la règle des familiers (`rollTier`) : le +0,35 et l'Autel
  // ne décalent plus le pic, ils deviennent de la chance (meilleur jet, un peu plus de +1 rang).
  // Historique : le RANG d'une pièce de set = pyramide centrée sur le PALIER du boss, LÉGÈREMENT remontée
  // (+0,35 rang : les boss restent une source solide, un cran au-dessus des donjons) + `rollFloor`
  // (Autel). Baisse v0.604 (+0,6 → +0,35) : à +0,6, un boss de bas niveau centrait ses drops
  // à mi-chemin du rang SUPÉRIEUR → ~50 % de Légendaires (donc de PROCS légendaires) dès le
  // niv.20, bien avant que Légendaire soit ton rang naturel (~niv.31). Désormais le boss donne
  // surtout TON rang, Légendaire restant un beau +1 (aligné sur la courbe de rareté).
  const floorRanks = Math.min(1, Math.max(0, opts.rollFloor ?? 0)) * ROLL_FLOOR_RANKS + 0.35;
  const { rank: rarity, roll } = rollTier(
    rng,
    opts.level,
    opts.luck ?? 0,
    floorRanks,
    opts.playerLevel,
    setPiecesPerLevel,
  );
  // ⚠️ L’AFFIXE #1 EST LA STAT MAJEURE NATURELLE DE L’EMPLACEMENT, comme un drop (v0.803,
  // mesuré). Il était tiré dans le THÈME du set selon l’emplacement : les voies défensives
  // tombaient sur des PV et de la réduction, les voies offensives sur de l’exécution, de la
  // rage, de l’élan ou du vol de vie — des stats conditionnelles en PREMIER affixe. Mesuré,
  // set complet contre 4 bons drops au niveau 90 : épineux +13 %, assassin **−42 %**.
  // ⚠️ DEUX VARIANTES MESURÉES PUIS ÉCARTÉES : (1) « la stat majeure DU THÈME » — un thème
  // qui n’en a qu’une (critique pour l’assassin, dégâts pour le berserker) l’empilait sur
  // les quatre pièces, et la puissance étant MULTIPLICATIVE l’assassin tombait à −57 % ;
  // (2) « la majeure du thème si l’emplacement la propose » : assassin encore −45 %.
  // L’IDENTITÉ DU SET VIT DÉSORMAIS DANS SES PALIERS (2/3/4 pièces), plus dans ses pièces.
  const chosenType: EffectType = SET_SLOT_MAJORS[slot]?.[0] ?? 'max_pv_pct';
  const base = EFFECT_BASE[chosenType] ?? 8;
  const w = slotWeight(slot);
  const value = Math.max(0.1, round1(base * rankRollMult(rarity, roll) * SET_PIECE_MAJOR_K * w));
  const noun = pick(rng, NAMES[slot]);
  // NIVEAU D'OBJET (ilvl) de la pièce de set = pyramide centrée sur min(palier, perso).
  const setCenter = opts.playerLevel != null ? Math.min(opts.level, opts.playerLevel) : opts.level;
  const level = rollItemLevel(rng, setCenter, opts.luck ?? 0);
  // MULTI-AFFIXE (correctif) : une pièce de set porte le MÊME NOMBRE d'affixes qu'un drop
  // de sa rareté (1→3). Sans ça, la refonte multi-affixe (v0.577-0.581) avait laissé les
  // sets à UNE stat pendant que les drops en gagnaient trois → un set complet (4 stats +
  // paliers) perdait systématiquement contre du stuff mixte (12 stats), et les bonus de
  // set ne rattrapaient pas l'écart. Les affixes suivants viennent des tiers secondaire/
  // mineur, comme un drop.
  const affixes: ItemEffect[] = [{ type: chosenType, value }];
  for (let a = 1; a < affixCountForRarity(rarity); a++) {
    const pool = slotPool(slot, 'support', setCenter).filter(
      (t) => !affixes.some((x) => x.type === t),
    );
    if (!pool.length) continue;
    // ⚠️ LIBRE, comme un drop. Préférer le thème ici a été mesuré puis retiré : les stats
    // conditionnelles en affixe #2 creusaient l’écart de 6 à 27 points selon la voie.
    const t = pick(rng, pool);
    affixes.push({
      type: t,
      value: Math.max(0.1, round1((EFFECT_BASE[t] ?? 8) * rankRollMult(rarity, roll) * w)),
    });
  }
  // Une pièce de set Légendaire+ porte AUSSI un proc légendaire (rareté orthogonale au set).
  const legendary =
    RARITY_RANK[rarity] >= LEGENDARY_MIN_RANK
      ? rollSetLegendaryProc(rng, slot, setThemeStats(opts.setId))
      : undefined;
  return {
    slot,
    name: set ? `${noun} · ${set.name}` : `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: set ? set.emoji : SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: affixes[0]!, // majeure de l’emplacement ; l’identité du set vit dans ses paliers
    ...(affixes[1] ? { effect2: affixes[1] } : {}),
    ...(affixes[2] ? { effect3: affixes[2] } : {}),
    ...(set ? { setId: opts.setId } : {}),
    ...(legendary ? { legendary } : {}),
    roll,
  };
}

/** Valeur des affixes d'un TROPHÉE, relative à un drop de même rareté et même jet.
 *  ⚠️ C'est un 6ᵉ emplacement QUI S'AJOUTE à un build complet : à la valeur pleine il
 *  vaudrait une pièce d'équipement entière, et toute la calibration du contenu
 *  (`gearExpect`, renforts procéduraux) suppose cinq emplacements. Mesuré (v0.864) — cf.
 *  `test/trophy.test.ts`. */
export const TROPHY_K = 0.4;

/**
 * Tire le TROPHÉE d'un boss entre amis. Son RANG est toujours celui du joueur (une
 * récompense de sport, pas de chasse) et ses ÉTOILES suivent la sienne (`starOdds`, v0.894) ;
 * ses stats PRINCIPALES sont imposées par la famille de l'exo (`mains`), les suivantes
 * tirées dans sa liste de SOUTIEN (`support`). Jamais de proc légendaire.
 */
export function rollTrophy(
  rng: () => number,
  opts: {
    mains: readonly EffectType[];
    /** Stats de SOUTIEN de la famille : les affixes suivants sont tirés ici, jamais ailleurs. */
    support: readonly EffectType[];
    title: string;
    level: number;
    luck?: number;
  },
): Omit<Item, 'id'> {
  const luck = opts.luck ?? 0;
  const rarity = RANK_ORDER[prestigeRankIndex(opts.level)]!;
  const roll = rollStarJet(rng, characterRank(opts.level), luck);
  const level = rollItemLevel(rng, opts.level, luck);
  // Plancher à 0,1 et non à 1 : à TROPHY_K < 1, un plancher entier écraserait rareté et jet
  // des petites stats (même leçon que l'équipement des aventuriers).
  const value = (t: EffectType) =>
    Math.max(0.1, round1(EFFECT_BASE[t] * rankRollMult(rarity, roll) * TROPHY_K));
  const affixes: ItemEffect[] = opts.mains.map((t) => ({ type: t, value: value(t) }));
  for (let a = affixes.length; a < affixCountForRarity(rarity); a++) {
    const pool = opts.support
      .filter((t) => (EFFECT_MIN_LEVEL[t] ?? 1) <= opts.level)
      .filter((t) => !affixes.some((x) => x.type === t));
    if (!pool.length) continue;
    const t = pick(rng, pool);
    affixes.push({ type: t, value: value(t) });
  }
  return {
    slot: TROPHY_SLOT,
    name: `Trophée · ${opts.title}`,
    emoji: SLOT_EMOJI.trophy,
    rarity,
    level,
    baseLevel: level,
    effect: affixes[0]!,
    ...(affixes[1] ? { effect2: affixes[1] } : {}),
    ...(affixes[2] ? { effect3: affixes[2] } : {}),
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
  opts: { level: number; luck?: number; rarity?: Rarity; playerLevel?: number; rankCap?: number },
): Omit<Item, 'id'> {
  // RANG plafonné au RANG DU JOUEUR (v0.857, `rollCompanionTier`) ; `rankCap` le borne en plus
  // (palier du Labyrinthe). Le JET garde la luck : on farme le meilleur familier de son rang.
  let rarity: Rarity;
  let roll: number;
  if (opts.rarity) {
    rarity = opts.rarity;
    roll = rollJetValue(rng, opts.luck ?? 0); // jet biaisé bas (comme les drops)
  } else {
    const t = rollCompanionTier(rng, familiarRankRef(opts), opts.luck ?? 0);
    rarity = t.rank;
    roll = t.roll;
  }
  const value = Math.max(1, round1(species.base * rankRollMult(rarity, roll)));
  // NIVEAU D'OBJET (ilvl) comme les objets : pyramide centrée sur min(contenu, joueur) →
  // un familier farmé plus profond est plus fort même à rareté/jet égale. (v0.592)
  const center = opts.playerLevel != null ? Math.min(opts.level, opts.playerLevel) : opts.level;
  const level = rollItemLevel(rng, center, opts.luck ?? 0);
  let effect2: ItemEffect | undefined;
  if (rng() < familiarSigChance(rarity)) {
    const sig = FAMILIAR_SIGNATURE[Math.floor(rng() * FAMILIAR_SIGNATURE.length)]!;
    effect2 = {
      type: sig.type,
      value: Math.max(1, round1(sig.base * rankRollMult(rarity, roll))),
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
    roll, // jet CONTINU (rankRollMult / rollJet), comme les objets
  };
}

// ── Infusion des familiers : monte le TIER (rang + qualité) en sacrifiant d'autres
// familiers (le tier grimpe = qualité d'abord, puis saut de rang). Le NIVEAU reste
// piloté par les pierres 💎 (familiarStoneCost). Cf. ticket f93c219b. ──

/** Score de tri d'un familier/objet : rang DOMINANT puis jet (rang×100 + jet 0..100). */
export function tierIndexOf(it: { rarity: Rarity; roll?: number }): number {
  return rankIndex(it.rarity) * 100 + rollJet(it.roll);
}

/**
 * Ordre d'affichage d'une réserve de FAMILIERS : la stat RÉELLEMENT PORTÉE tranche.
 *
 * ⚠️ `tierIndexOf` (rareté puis jet) ne suffit pas, et c'est un angle mort : il ignore le
 * NIVEAU D'OBJET, pourtant 3ᵉ axe de magnitude depuis la v0.583. Deux familiers de même
 * rareté et de même jet mais d'ilvl différents portent des stats différentes — et le plus
 * fort se retrouvait EN BAS de liste, derrière un homonyme plus faible départagé au nom
 * (signalé par l'utilisateur : deux faucons, même perte de puissance affichée, stats
 * différentes). On classe donc sur `effectiveValue`, exactement le nombre que la carte
 * affiche : le tri ne peut plus contredire ce qu'on lit.
 *
 * ⚠️ La RARETÉ reste devant. Ses bandes sont disjointes par construction et le groupement
 * par rareté est ce qui rend la grille lisible ; la stat départage À L'INTÉRIEUR d'un rang,
 * là où le jet seul laissait des égalités que l'ordre alphabétique tranchait au hasard.
 */
export function compareFamiliars(a: Item, b: Item): number {
  return (
    rankIndex(b.rarity) - rankIndex(a.rarity) ||
    effectiveValue(b.effect, b.level) - effectiveValue(a.effect, a.level) ||
    // Une SIGNATURE ✦ ne se remplace par rien : à stat égale, elle passe devant.
    (b.effect2?.value ?? 0) - (a.effect2?.value ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

/** Stat RÉELLEMENT portée par un familier : sa valeur × niveau d'objet × dressage — la
 *  même formule que le combat (`aggregateEffects`), donc ce qu'on garde est ce qui se bat. */
function familiarStat(f: Item): number {
  return f.effect.value * familiarMult(f);
}

/**
 * 🪙 LES FAMILIERS EN TROP — ce que la vente automatique cède (demandé par l'utilisateur :
 * « ne garder que le meilleur de chaque catégorie et vendre les autres automatiquement »).
 *
 * Par RACE (à défaut, par effet) on garde **le meilleur** — la plus forte stat réelle, la
 * signature ✦ départageant à stat égale — et **celui qu'on porte**, même moins bon : c'est
 * le seul doublon toléré, et il n'est jamais remplacé d'office (l'équipement reste un choix).
 * ⚠️ Un 🔒 n'est jamais rendu : le verrou protège de toute vente, automatique comprise.
 * Rend les ids du SAC à vendre ; le familier porté vit dans `equipped`, hors d'atteinte.
 */
export function familiarSurplus(
  equipped: Item | null | undefined,
  inventory: readonly Item[],
): string[] {
  const keyOf = (f: Item) => f.species ?? f.effect.type;
  const better = (a: Item, b: Item) =>
    familiarStat(a) - familiarStat(b) || (a.effect2?.value ?? 0) - (b.effect2?.value ?? 0);
  const best = new Map<string, Item>();
  for (const f of [...(equipped ? [equipped] : []), ...inventory]) {
    if (!isFamiliar(f)) continue;
    const cur = best.get(keyOf(f));
    if (!cur || better(f, cur) > 0) best.set(keyOf(f), f);
  }
  return inventory
    .filter((f) => isFamiliar(f) && !f.locked && best.get(keyOf(f))?.id !== f.id)
    .map((f) => f.id);
}

/**
 * Range une collection en GROUPES d’exemplaires identiques (même talent, même race de
 * familier), chaque groupe du meilleur au pire, les groupes eux-mêmes ordonnés par leur
 * meilleur exemplaire (v0.862 ; demandé par l’utilisateur : « qu’on voie tous les talents
 * ou familiers identiques du meilleur au pire »).
 *
 * ⚠️ Remplace la vente des doublons : les aventuriers emploient ce que le héros ne porte
 * pas, donc un exemplaire moins bon n’est plus un déchet — on le range, on ne le jette pas.
 * Stable : à égalité parfaite, l’ordre d’entrée est conservé.
 */
export function groupBestFirst<T>(
  items: readonly T[],
  keyOf: (it: T) => string,
  compare: (a: T, b: T) => number,
): { item: T; groupStart: boolean; groupSize: number; groupKey: string }[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const g = groups.get(k);
    if (g) g.push(it);
    else groups.set(k, [it]);
  }
  // ⚠️ La CLÉ voyage avec chaque ligne : sans elle, un écran qui replie les groupes devrait
  // la recalculer de son côté (donc deux définitions de « quel type ? » pour la même liste).
  const sorted = [...groups.entries()].map(([key, g]) => [key, [...g].sort(compare)] as const);
  sorted.sort((a, b) => compare(a[1][0]!, b[1][0]!));
  return sorted.flatMap(([key, g]) =>
    g.map((item, i) => ({ item, groupStart: i === 0, groupSize: g.length, groupKey: key })),
  );
}

/**
 * 🗂️ Une ligne d'un groupe est-elle VISIBLE quand les types sont repliés ?
 *
 * ⚠️ ON NE CACHE JAMAIS CE QU'ON PORTE (`keepAnyway`) : l'exemplaire équipé n'est pas
 * toujours le meilleur du groupe — un talent gardé pour son effet, un familier posté —, et
 * le replier ferait disparaître de l'écran la seule ligne qui compte vraiment.
 *
 * ⚠️ Le MEILLEUR reste toujours là (`groupStart`) : replié, on voit donc un type par ligne
 * avec son meilleur exemplaire, pas un titre nu — le rang, la stat et le gain restent
 * lisibles sans rien déplier.
 */
export function groupRowVisible(
  row: { groupStart: boolean; groupSize: number; groupKey: string },
  opened: ReadonlySet<string>,
  keepAnyway = false,
): boolean {
  return row.groupSize <= 1 || row.groupStart || keepAnyway || opened.has(row.groupKey);
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
// Reroll du JET : re-tire le `roll` de l'objet en gardant le TYPE d'effet, le RANG et le
// NIVEAU. Ne touche JAMAIS le rang ; sert à retenter un meilleur jet. On rescale la valeur
// par le rapport des multiplicateurs d'intervalle (rankRollMult) → la valeur reste cohérente
// avec le nouveau jet.
export function rerolledQuality(
  rng: () => number,
  item: Item,
): { effect: ItemEffect; effect2?: ItemEffect; effect3?: ItemEffect; roll: number } {
  const oldRoll = item.roll ?? 0.5;
  const newRoll = rng();
  const ratio = rankRollMult(item.rarity, newRoll) / rankRollMult(item.rarity, oldRoll);
  const scale = (e: ItemEffect): ItemEffect => ({
    type: e.type,
    value: Math.max(1, Math.round(e.value * ratio)),
  });
  return {
    effect: scale(item.effect),
    ...(item.effect2 ? { effect2: scale(item.effect2) } : {}),
    ...(item.effect3 ? { effect3: scale(item.effect3) } : {}),
    roll: newRoll,
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
  // Stats MINEURES (light) — hors puissance de combat brute.
  magicFindPct: number; // fraction : + luck de drop (bornée en aval → jamais hors ligue)
  regenPct: number; // fraction : + PV régénérés entre combats de donjon
  initiativePct: number; // fraction : + initiative (qui commence)
  // ── Refonte équipement (étape 3) ──
  critDmgPct: number; // fraction ajoutée au multiplicateur de critique (×2 → ×2 + x)
  accuracyPct: number; // note de précision (→ chance, courbe) : réduit l'esquive ennemie
  bleedPct: number; // fraction des dégâts infligés qui saigne sur les tours suivants
  blockPct: number; // note de blocage (→ chance, courbe)
  parryPct: number; // note de parade (→ chance, courbe)
  ripostePct: number; // note de riposte (→ chance, courbe)
  critResistPct: number; // note de résistance aux critiques (→ part retirée, courbe)
  startShieldPct: number; // note de bouclier de départ (→ part des PV, courbe)
  trainingPct: number; // fraction : + XP de dressage du familier (hors combat)
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
    magicFindPct: 0,
    regenPct: 0,
    initiativePct: 0,
    critDmgPct: 0,
    accuracyPct: 0,
    bleedPct: 0,
    blockPct: 0,
    parryPct: 0,
    ripostePct: 0,
    critResistPct: 0,
    startShieldPct: 0,
    trainingPct: 0,
  };
}

/** LE CANAL de chaque effet. ⚠️ EXHAUSTIVE PAR CONSTRUCTION : ajouter un `EffectType` sans
 *  dire où il s'agrège ne compile plus (l'ancien `switch` l'aurait ignoré en silence). */
const EFFECT_CHANNEL: Record<EffectType, keyof AggregatedEffects> = {
  damage_pct: 'damagePct',
  crit_pct: 'critAdd',
  lifesteal_pct: 'lifesteal',
  dmg_reduction_pct: 'dmgReduction',
  max_pv_pct: 'maxPvPct',
  gold_pct: 'goldPct',
  execute_pct: 'executePct',
  rage_pct: 'ragePct',
  momentum_pct: 'momentumPct',
  thorns_pct: 'thornsPct',
  magic_find_pct: 'magicFindPct',
  regen_pct: 'regenPct',
  initiative_pct: 'initiativePct',
  crit_dmg_pct: 'critDmgPct',
  accuracy_pct: 'accuracyPct',
  bleed_pct: 'bleedPct',
  block_pct: 'blockPct',
  parry_pct: 'parryPct',
  riposte_pct: 'ripostePct',
  crit_resist_pct: 'critResistPct',
  start_shield_pct: 'startShieldPct',
  dodge_pct: 'dodgeAdd',
  training_pct: 'trainingPct',
};

/** Applique une valeur (fraction) d'un EffectType donné à un agrégat. */
function applyEffect(a: AggregatedEffects, type: EffectType, v: number): void {
  a[EFFECT_CHANNEL[type]] += v;
}

/** Agrégat ne contenant qu'un effet (pct → fraction) — pour un passif ponctuel (ex. Voie). */
export function effectAsAggregate(type: EffectType, pct: number): AggregatedEffects {
  const a = emptyEffects();
  applyEffect(a, type, pct / 100);
  return a;
}
/** Somme de plusieurs agrégats d'effets (réduction de dégâts NON re-plafonnée ici : le
 *  plafond 50 % est appliqué en aval par playerWithGear). */
export function mergeEffects(...list: AggregatedEffects[]): AggregatedEffects {
  const a = emptyEffects();
  // ⚠️ En boucle sur les canaux : la liste écrite à la main oubliait tout canal ajouté.
  for (const e of list) for (const k of AGGREGATE_KEYS) a[k] += e[k] ?? 0;
  return a;
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
  /** Couleur du set PORTÉ sur l’avatar (sets de voie seulement). */
  color?: string;
  /** ⭐ L’effet SIGNATURE du set complet porté dans SA voie (sets de voie seulement). */
  signature?: SetSignature;
}

/** Un EFFET SIGNATURE de set (v0.835) : un comportement de combat, pas une stat.
 *  ⚠️ Ses ids (`sig_<voie>`) sont lus par `simulateCombat` au même titre que les procs
 *  légendaires — mais aucun objet ne les porte : seul le set complet, dans sa voie. */
export interface SetSignature {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}
/** Les 8 signatures, une par voie. ⚠️ Toutes DISTINCTES des procs d’objets : sinon un set
 *  complet porté avec l’objet légendaire du même proc n’apporterait rien (les procs se
 *  dédoublonnent). */
export const SET_SIGNATURES: Record<string, SetSignature> = {
  berserker: {
    id: 'sig_berserker',
    name: 'Carnage',
    emoji: '🪓',
    desc: 'Plus l’ennemi saigne, plus tu frappes fort : jusqu’à +300 % de dégâts quand il est à terre.',
  },
  gardien: {
    id: 'sig_gardien',
    name: 'Bastion',
    emoji: '🏰',
    desc: 'Les 3 premières attaques ennemies qui te touchent sont réduites d’un quart.',
  },
  assassin: {
    id: 'sig_assassin',
    name: 'Coup de grâce',
    emoji: '🗡️',
    desc: 'Tes coups critiques infligent ×3,35 au lieu de ×2.',
  },
  vampire: {
    id: 'sig_vampire',
    name: 'Soif éternelle',
    emoji: '🦇',
    desc: 'Le soin que tu peux voler en un tour est multiplié par 3,5.',
  },
  colosse: {
    id: 'sig_colosse',
    name: 'Inébranlable',
    emoji: '⛰️',
    desc: 'Aucun coup ne peut te retirer plus de 40 % de tes PV max.',
  },
  duelliste: {
    id: 'sig_duelliste',
    name: 'Botte secrète',
    emoji: '🤺',
    desc: 'Un coup porté sur 3 est un critique garanti, qui inflige ×2,9.',
  },
  epineux: {
    id: 'sig_epineux',
    name: 'Ronces',
    emoji: '🥀',
    desc: 'Chaque coup que tu reçois retire à l’ennemi 9 % de ses PV max.',
  },
  frenetique: {
    id: 'sig_frenetique',
    name: 'Transe',
    emoji: '🌪️',
    desc: 'Ton élan se cumule jusqu’à 8 coups au lieu de 6.',
  },
};

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
// ── SETS DE VOIE (v0.565, 2026‑08‑23) : 1 set PAR VOIE, thème = ses stats. ──
// Refonte : un set = l'expression LONG-TERME d'une voie (plus « 1 set par boss » qui
// devenait obsolète au palier suivant). Le MÊME set existe de G à SSS → on monte le RANG
// de son set en battant des boss plus profonds, on ne le jette jamais. Le 4-pièces est un
// CAPSTONE gaté par la voie (cf. setEffects) : il ne s'applique QUE si la voie du joueur
// correspond au set → « set complet de ta voie » = accomplir l'archétype. Les 2/3-pièces
// (stats brutes) s'appliquent pour tout le monde. id = `voie:<voieId>` (lien avec voies.ts
// par convention, garanti par un test — pas d'import pour éviter le cycle voies↔items).
// stats = [PRIMAIRE (=capstone 4pc), secondaire (3pc), tertiaire (2pc)].
const VOIE_SET_DEFS: {
  voie: string;
  name: string;
  emoji: string;
  theme: string;
  stats: [EffectType, EffectType, EffectType];
  /** ⚠️ ÉCHELLE DES PALIERS (v0.837, mesuré) : ce qui rend les 8 sets ÉQUIVALENTS. Les mêmes
   *  valeurs de base ne valent pas pareil en combat selon la stat (un palier de PV et de
   *  réduction pesait bien plus qu'un palier d'exécution et de vol de vie) : un set complet
   *  dans sa voie allait de +10 % (Berserker) à +41 % (Gardien) contre les meilleurs drops.
   *  Calibrée avec la signature et son poids de puissance pour ~+24 % partout. */
  tierScale: number;
  /** 🎨 v0.832 (demandé : « épines = vert ») — une teinte par set, lisible sur l’avatar,
   *  choisie hors du jaune voltage de l’interface. */
  color: string;
}[] = [
  {
    voie: 'berserker',
    name: 'Fureur du Berserker',
    emoji: '💥',
    theme: 'Dégâts bruts et exécution — le set qui frappe.',
    stats: ['damage_pct', 'execute_pct', 'lifesteal_pct'],
    tierScale: 1.6,
    color: '#ff5a3c',
  },
  {
    voie: 'gardien',
    name: 'Rempart du Gardien',
    emoji: '🛡️',
    theme: 'Le mur qui frappe : encaisse tout et tient.',
    stats: ['dmg_reduction_pct', 'max_pv_pct', 'damage_pct'],
    tierScale: 0.6,
    color: '#4ea3ff',
  },
  {
    voie: 'assassin',
    name: 'Ombre de l’Assassin',
    emoji: '🗡️',
    theme: 'Critiques qui achèvent, un vol de vie pour durer.',
    stats: ['crit_pct', 'execute_pct', 'lifesteal_pct'],
    tierScale: 1,
    color: '#9b7bff',
  },
  {
    voie: 'vampire',
    name: 'Soif du Vampire',
    emoji: '🩸',
    theme: 'Vole la vie et se déchaîne au bord de la mort.',
    stats: ['lifesteal_pct', 'damage_pct', 'rage_pct'],
    tierScale: 1.6,
    color: '#e0325f',
  },
  {
    voie: 'colosse',
    name: 'Carcasse du Colosse',
    emoji: '🪨',
    theme: 'Réservoir de PV qui cogne dans la durée.',
    stats: ['max_pv_pct', 'dmg_reduction_pct', 'damage_pct'],
    tierScale: 0.7,
    color: '#b08d5b',
  },
  {
    voie: 'duelliste',
    name: 'Élégance du Duelliste',
    emoji: '🎯',
    theme: 'Précision létale adossée à des PV.',
    stats: ['crit_pct', 'damage_pct', 'max_pv_pct'],
    tierScale: 0.8,
    color: '#3fd0e0',
  },
  {
    voie: 'epineux',
    name: 'Carapace de l’Épineux',
    emoji: '🌵',
    theme: 'Encaisse, renvoie les coups, frappe en retour.',
    stats: ['thorns_pct', 'max_pv_pct', 'damage_pct'],
    tierScale: 0.8,
    color: '#5fcf4f',
  },
  {
    voie: 'frenetique',
    name: 'Transe du Frénétique',
    emoji: '🌀',
    theme: 'Monte en puissance au fil du combat.',
    stats: ['momentum_pct', 'damage_pct', 'lifesteal_pct'],
    tierScale: 0.9,
    color: '#ff5cd8',
  },
];
export const VOIE_SETS: ItemSet[] = VOIE_SET_DEFS.map((d) => ({
  id: `voie:${d.voie}`,
  name: d.name,
  emoji: d.emoji,
  theme: d.theme,
  color: d.color,
  ...(SET_SIGNATURES[d.voie] ? { signature: SET_SIGNATURES[d.voie] } : {}),
  tiers: [
    {
      pieces: 2,
      type: d.stats[2],
      base: Math.max(1, round1((EFFECT_BASE[d.stats[2]] ?? 8) * 0.7 * d.tierScale)),
    },
    {
      pieces: 3,
      type: d.stats[1],
      base: Math.max(1, round1((EFFECT_BASE[d.stats[1]] ?? 8) * 1.0 * d.tierScale)),
    },
    // 4-pièces = CAPSTONE (gaté par la voie) : la stat IDENTITÉ, amplifiée.
    {
      pieces: 4,
      type: d.stats[0],
      base: Math.max(1, round1((EFFECT_BASE[d.stats[0]] ?? 8) * 1.6 * d.tierScale)),
    },
  ],
}));
const VOIE_SET_IDS: string[] = VOIE_SETS.map((s) => s.id);
/** id du set d'une voie (`voie:<id>`) — source unique du lien voie↔set. */
export function voieSetId(voie: string | null | undefined): string {
  return `voie:${voie ?? ''}`;
}
/** Tire un set de voie AU HASARD (les boss droppent tous les sets, pas seulement le tien). */
export function randomVoieSetId(rng: () => number): string {
  return VOIE_SET_IDS[Math.floor(rng() * VOIE_SET_IDS.length)]!;
}

// ITEM_SETS = les sets DROPPABLES/affichés (les 8 voie-sets). SET_BY_ID résout AUSSI les
// anciens sets (boss/procéduraux) → les pièces legacy gardent leurs 2/3-pièces (jamais le
// capstone, faute de voie correspondante) le temps d'être remplacées par des sets de voie.
/** @alias */
export const ITEM_SETS: ItemSet[] = VOIE_SETS;
export const SET_BY_ID: Record<string, ItemSet> = Object.fromEntries(
  [...VOIE_SETS, ...HAND_SETS, ...PROCEDURAL.sets].map((s) => [s.id, s]),
);

/** Multiplicateur de bonus de set scalé par le RANG moyen des pièces (#3, ticket 8bfe5130) :
 *  les pièces d'un boss plus profond ont un rang plus haut → bonus de set plus fort → on
 *  veut faire les boss suivants. Ancré au rang MOYEN (Rare) → un set Rare ≈ base d'origine,
 *  les sets plus hauts montent, les plus bas baissent un peu. */
function setBonusMult(pieces: Item[]): number {
  if (!pieces.length) return 1;
  const anchor = RARITY_MULT.rare;
  // ⚠️ RARETÉ × NIVEAU D’OBJET (v0.803, mesuré). Le bonus ne suivait que la rareté, alors
  // que les stats des pièces suivent aussi leur niveau d’objet (+53 % au niveau 90) : le
  // poids relatif des paliers FONDAIT en montant, et un set complet passait de +4 à +8 %
  // au niveau 30 à −6 % en moyenne au niveau 90.
  const avg =
    pieces.reduce(
      (s, i) => s + (RARITY_MULT[i.rarity] ?? anchor) * itemLevelMult(i.level ?? 1),
      0,
    ) / pieces.length;
  return avg / anchor;
}
/** Libellé d'un palier de set, scalé par le rang des pièces équipées de ce set. */
export function setTierLabel(type: EffectType, base: number, pieces: Item[]): string {
  return effectLabelFor(type, base * setBonusMult(pieces));
}

/** 🎨 LE SET QUE L’ON PORTE, pour l’avatar : celui qui a le plus de pièces équipées, à
 *  partir de 2 (le seuil où il donne quelque chose). À égalité, celui de la voie. Rien sans
 *  couleur (sets d’avant les voies). */
export function wornSet(
  equipped: Equipped,
  voie?: string | null,
): { set: ItemSet; pieces: number; color: string } | null {
  const mine = voieSetId(voie);
  let best: { set: ItemSet; pieces: number; color: string } | null = null;
  for (const [id, n] of Object.entries(setCounts(equipped))) {
    const set = SET_BY_ID[id];
    if (!set?.color || n < 2) continue;
    if (!best || n > best.pieces || (n === best.pieces && id === mine)) {
      best = { set, pieces: n, color: set.color };
    }
  }
  return best;
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

/** Effets cumulés des SETS actifs (≥2 pièces), scalés par le rang moyen des pièces.
 *  Le CAPSTONE (4-pièces) ne s'applique QUE si `voie` correspond au set (`voie:<voie>`) →
 *  compléter le set de SA voie = accomplir l'archétype. Les 2/3-pièces valent pour tous. */
/** AFFINITÉ DE VOIE (v0.811) : porter la voie d'un set DOUBLE ses bonus 2 et 3 pièces.
 *
 *  ⚠️ LE DÉFAUT (signalé par l'utilisateur) : avec 3 pièces d'un set, le 4-pièces ne
 *  s'applique pas, et les 2/3-pièces valent pour TOUTES les voies. La voie ne décidait donc
 *  plus que de son PASSIF — et les passifs ne se valent pas (5 % de réduction pèse bien plus
 *  que 8 % d'épines dans la puissance). L'optimiseur proposait « porte le set Épineux, mais
 *  sois Gardien ». Mesuré : avec 3 pièces du set d'une voie, CETTE voie n'était la meilleure
 *  que 4 à 6 fois sur 32 ; sur le compte réel, Épineux arrivait avant-dernière (−3,4 %).
 *
 *  Balayage (3 pièces + un accessoire hors set, 8 voies × 4 tirages, niveaux 30/60/90) :
 *  ×1,5 → 12 à 28/32 · ×1,75 → 32/32 mais 0,2 % de marge · **×2 → 32/32, marge ≥ 1,2 %**.
 *  Réservé au palier 3 seul : 20 à 28/32 — insuffisant.
 *  ⚠️ PORTER UN SET HORS DE SA VOIE NE PERD RIEN (un bonus, pas une pénalité) : les demi-sets
 *  croisés gardent exactement leur valeur. Le capstone 4-pièces n'est pas touché.
 *  ⚠️ COÛT ASSUMÉ : un set de sa voie gagne 7 à 11 points de plus face aux meilleurs drops.
 *  ⚠️ PAS « seulement sur un set incomplet » : la 4ᵉ pièce aurait alors RETIRÉ l'affinité,
 *  et devenait inutile 5 fois sur 8 (mesuré). */
const SET_AFFINITY_K = 1;

export function setEffects(equipped: Equipped, voie?: string | null): AggregatedEffects {
  const a = emptyEffects();
  const groups: Record<string, Item[]> = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.setId) (groups[it.setId] ??= []).push(it);
  }
  const capstoneId = voieSetId(voie);
  for (const [id, items] of Object.entries(groups)) {
    const def = SET_BY_ID[id];
    if (!def || items.length < 2) continue;
    const mult = setBonusMult(items);
    const affinity = id === capstoneId ? 1 + SET_AFFINITY_K : 1;
    for (const t of def.tiers) {
      if (items.length < t.pieces) continue;
      // 4-pièces = CAPSTONE : gaté par la voie (l'archétype). Un set complet HORS voie
      // ne donne que ses 2/3-pièces (stats brutes), pas la signature amplifiée.
      if (t.pieces >= 4 && id !== capstoneId) continue;
      const k = t.pieces < 4 ? affinity : 1;
      applyEffect(a, t.type, Math.max(1, round1(t.base * mult * k)) / 100);
    }
  }
  a.dmgReduction = Math.min(0.5, a.dmgReduction);
  return a;
}

// `capLevel` plafonne le niveau EFFECTIF de chaque objet au niveau du joueur (comme
// l'upgrade) → un objet sur-leveled ne donne que la puissance de TON niveau (anti
// « bas niveau en gear trop haut qui punch 3 tiers au-dessus », cf. simulation 2026‑08‑12).
export function aggregateEffects(equipped: Equipped, voie?: string | null): AggregatedEffects {
  const a = emptyEffects();
  // Le TROPHÉE se lit comme un objet (valeur × niveau d'objet) : sa retenue est déjà dans
  // ses valeurs (`TROPHY_K`), pas dans un multiplicateur à part.
  for (const slot of [...SLOTS, TROPHY_SLOT]) {
    const it = equipped[slot];
    if (!it) continue;
    // OBJETS : magnitude = valeur bakée (rareté × jet) × MULTIPLICATEUR DE NIVEAU (ilvl,
    // v0.583) → un même objet farmé plus profond est plus fort. Valeur PRÉCISE (float).
    const lm = itemLevelMult(it.level);
    applyEffect(a, it.effect.type, (it.effect.value * lm) / 100);
    if (it.effect2) applyEffect(a, it.effect2.type, (it.effect2.value * lm) / 100);
    if (it.effect3) applyEffect(a, it.effect3.type, (it.effect3.value * lm) / 100);
  }
  // Familier (slot parallèle, hors SLOTS) : magnitude = grade × jet × MULTIPLICATEUR DE
  // NIVEAU (ilvl, v0.592) → comme les objets, un familier plus haut niveau est plus fort.
  const fam = equipped[FAMILIAR_SLOT];
  if (fam) {
    // × son DRESSAGE (4ᵉ axe, borné) — la même formule que pour un aventurier.
    const flm = familiarMult(fam);
    applyEffect(a, fam.effect.type, (fam.effect.value * flm) / 100);
    if (fam.effect2) applyEffect(a, fam.effect2.type, (fam.effect2.value * flm) / 100);
  }
  // Bonus de set (2/3 pièces pour tous ; 4-pièces capstone si la voie correspond).
  const s = setEffects(equipped, voie);
  for (const k of AGGREGATE_KEYS) a[k] += s[k];
  // ⚠️ Plus de plafond sec sur la réduction ici : la courbe de chance (`CHANCE_CURVES`)
  // s'en charge en aval, et les aventuriers gardent leur plafond dans `playerWithGear`.
  return a;
}

/** 🎯 COURBES DE CHANCE À RENDEMENT DÉCROISSANT (refonte équipement, étape 1).
 *
 *  ⚠️ LE DÉFAUT MESURÉ : critique, esquive et réduction étaient des sommes plafonnées, et
 *  le SPORT SEUL remplissait le plafond dès le niveau 20 (critique 51 %, réduction 46 %,
 *  esquive 40 % = son plafond). Une stat d'objet de ces trois canaux ne rapportait donc
 *  plus RIEN, et l'optimiseur mettait des PV sur les armes (4 armes sur 4 aux niveaux 50
 *  et 90). Ici la chance APPROCHE un plafond sans jamais l'atteindre :
 *  chance = plafond × x / (x + K), où x = part du sport (rapportée au joueur de référence
 *  du niveau) + part de l'équipement.
 *
 *  ⚠️ TROIS PROPRIÉTÉS, toutes testées :
 *  1. **Le joueur de référence NU garde exactement sa chance d'avant** (K est choisi pour
 *     ça, à chaque niveau) → le contenu, calibré sur lui, ne bouge pas.
 *  2. **Au point de référence, un point d'équipement vaut ce qu'il valait** (pente 1, via
 *     G) : les magnitudes d'objets restent dans leur ordre de grandeur.
 *  3. **Aucun plafond n'est jamais atteint** : chaque point compte, un peu moins que le
 *     précédent.
 *
 *  Réservé au HÉROS : les aventuriers (convois, sièges, camps, failles) gardent l'ancienne
 *  règle (`legacyCaps`), leur calibration est mesurée à part et hors de cette refonte. */
export const CHANCE_CURVES = {
  crit: { cap: 0.75, perStat: COMBAT.critPerAgilite, legacyCap: COMBAT.critCap, gearCap: 0.6 },
  dodge: { cap: 0.5, perStat: COMBAT.dodgePerAgilite, legacyCap: COMBAT.dodgeCap, gearCap: 0.4 },
  reduction: {
    cap: 0.65,
    perStat: COMBAT.defPerPuissance,
    legacyCap: COMBAT.defCap,
    gearCap: 0.5,
  },
} as const;
type ChanceCurve = (typeof CHANCE_CURVES)[keyof typeof CHANCE_CURVES];
/** En dessous, le joueur de référence n'a presque rien de ce canal (tout début de partie) :
 *  la courbe n'a pas de sens, on garde la somme d'avant. */
const CURVE_MIN_REF = 0.02;

/** Chance d'un canal : `sportRaw` = valeur brute du sport (stat × coefficient, sans
 *  plafond), `gear` = somme des bonus d'équipement, talents, familier et sets (fraction). */
export function curveChance(
  ch: ChanceCurve,
  sportRaw: number,
  gear: number,
  level: number,
): number {
  const refRaw = refBalancedStat(Math.max(1, level)) * ch.perStat;
  const t = Math.min(ch.legacyCap, refRaw);
  if (t < CURVE_MIN_REF) return Math.max(0, Math.min(ch.gearCap, sportRaw + gear));
  const K = ch.cap / t - 1;
  // Pente de la courbe en x = 1 : cap·K/(1+K)². G la ramène à 1 → un point d'équipement
  // vaut, AU POINT DE RÉFÉRENCE, ce qu'il valait en somme simple.
  const G = (1 + K) ** 2 / (ch.cap * K);
  const x = Math.max(0, sportRaw / refRaw + gear * G);
  return (ch.cap * x) / (x + K);
}

/** Les stats nouvelles d'un combattant : présentes seulement si non nulles, pour qu'un
 *  combattant sans elles reste strictement identique à celui d'avant. */
function newStats(e: AggregatedEffects, x: Partial<AggregatedEffects>): Partial<Combatant> {
  const g = (k: keyof AggregatedEffects) => e[k] + (x[k] ?? 0);
  const o: Partial<Combatant> = {};
  if (g('critDmgPct') > 0) o.critDmg = g('critDmgPct');
  if (g('bleedPct') > 0) o.bleed = g('bleedPct');
  if (g('accuracyPct') > 0) o.accuracy = ratingChance(RATING_CAPS.accuracy, g('accuracyPct'));
  if (g('blockPct') > 0) o.block = ratingChance(RATING_CAPS.block, g('blockPct'));
  if (g('parryPct') > 0) o.parry = ratingChance(RATING_CAPS.parry, g('parryPct'));
  if (g('ripostePct') > 0) o.riposte = ratingChance(RATING_CAPS.riposte, g('ripostePct'));
  if (g('critResistPct') > 0)
    o.critResist = ratingChance(RATING_CAPS.critResist, g('critResistPct'));
  if (g('startShieldPct') > 0)
    o.startShield = ratingChance(RATING_CAPS.startShield, g('startShieldPct'));
  return o;
}

/** Plafonds des stats NOUVELLES, qui ne viennent que de l'équipement (aucune part du sport).
 *  Même idée que `CHANCE_CURVES` : on approche le plafond sans l'atteindre, et le premier
 *  point vaut 1 (chance = plafond × note / (note + plafond)). */
export const RATING_CAPS = {
  accuracy: 0.8,
  block: 0.6,
  parry: 0.25,
  riposte: 0.5,
  critResist: 0.8,
  startShield: 0.6,
} as const;
/** Une note d'équipement (fraction) convertie en chance, à rendement décroissant. */
export function ratingChance(cap: number, note: number): number {
  const g = Math.max(0, note);
  return (cap * g) / (g + cap);
}

/** Combattant du joueur = stats (sport) + effets de l'équipement + `extra` (talents).
 *  `opts.legacyCaps` : anciens plafonds secs (aventuriers uniquement, cf. `CHANCE_CURVES`). */
export function playerWithGear(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  equipped: Equipped,
  extra: Partial<AggregatedEffects> = {},
  level = 1,
  voie?: string | null,
  opts: { legacyCaps?: boolean } = {},
): Combatant {
  const base = playerCombatant(name, stats, level);
  // `voie` gate le capstone (4-pièces) du set de la voie (cf. setEffects).
  const e = aggregateEffects(equipped, voie);
  const damagePct = e.damagePct + (extra.damagePct ?? 0);
  const maxPvPct = e.maxPvPct + (extra.maxPvPct ?? 0);
  const critAdd = e.critAdd + (extra.critAdd ?? 0);
  const dodgeAdd = e.dodgeAdd + (extra.dodgeAdd ?? 0);
  const redAdd = e.dmgReduction + (extra.dmgReduction ?? 0);
  const legacy = !!opts.legacyCaps;
  const crit = legacy
    ? Math.min(0.6, base.crit + critAdd)
    : curveChance(CHANCE_CURVES.crit, stats.agilite * COMBAT.critPerAgilite, critAdd, level);
  const dodge = legacy
    ? Math.min(0.4, base.dodge + dodgeAdd)
    : curveChance(CHANCE_CURVES.dodge, stats.agilite * COMBAT.dodgePerAgilite, dodgeAdd, level);
  const dmgReduction = legacy
    ? Math.min(0.5, (base.dmgReduction ?? 0) + redAdd)
    : curveChance(CHANCE_CURVES.reduction, stats.puissance * COMBAT.defPerPuissance, redAdd, level);
  // Vol de vie PLAFONNÉ à 50 % (comme la réduction de dégâts) : il stacke (arme +
  // talent + set + familier) et, avec le multi-frappe, rendait le sustain quasi
  // infini. Borné → build sustain fort mais pas increvable (ticket adab525d).
  const lifesteal = Math.min(0.5, e.lifesteal + (extra.lifesteal ?? 0));
  // Procs LÉGENDAIRES (non-scalants) portés par l'équipement.
  const procs = aggregateLegendaries(equipped, voie);
  // Stats MINEURES de combat : initiative (multiplicatif, léger) + régén de donjon (borné +30 %).
  const initiativePct = e.initiativePct + (extra.initiativePct ?? 0);
  const regen = Math.min(0.3, e.regenPct + (extra.regenPct ?? 0));
  return {
    name,
    pv: Math.round(base.pv * (1 + maxPvPct)),
    damage: Math.max(1, Math.round(base.damage * (1 + damagePct))),
    crit,
    dodge,
    initiative: base.initiative * (1 + initiativePct),
    dmgReduction,
    lifesteal,
    strikes: base.strikes ?? 1,
    execute: e.executePct + (extra.executePct ?? 0),
    rage: e.ragePct + (extra.ragePct ?? 0),
    momentum: e.momentumPct + (extra.momentumPct ?? 0),
    thorns: e.thornsPct + (extra.thornsPct ?? 0),
    ...(regen > 0 ? { regen } : {}),
    ...(procs.size ? { procs } : {}),
    ...(legacy ? { momentumPerHit: true } : {}),
    ...newStats(e, extra),
  };
}
/** Bonus de LUCK apporté par le magic find de l'équipement (borné → jamais hors ligue).
 *  À ajouter à la `luck` passée à rollDrop au moment du butin d'un run. */
export function magicFindLuck(equipped: Equipped, voie?: string | null): number {
  // magicFindPct est une fraction (ex. 0,30 = +30 %). On la convertit en luck avec un
  // facteur faible et un plafond → au mieux ~+0,25 de luck (épaissit un peu la pointe
  // haute de la pyramide, ne peut PAS franchir le cap +2 rangs de ta ligue).
  return Math.min(0.25, aggregateEffects(equipped, voie).magicFindPct * 0.5);
}
/** Multiplicateur de l'XP de dressage du familier porté (stat « dressage », refonte
 *  équipement). Hors combat : il ne change ni la puissance ni un combat. */
export function trainingMult(equipped: Equipped, voie?: string | null): number {
  return 1 + Math.max(0, aggregateEffects(equipped, voie).trainingPct);
}

/** OPTIMISEUR D'ÉQUIPEMENT (ticket 6d69c2fc) : cherche, parmi l'équipé + le sac, la
 *  meilleure combinaison des 4 slots de gear (bonus de SET inclus) qui maximise la
 *  puissance de combat. Le familier équipé est conservé (slot parallèle, choisi à part).
 *  Brute-force BORNÉ : top-K candidats/slot par puissance solo + TOUTES les pièces de set
 *  (pour permettre la complétion, cap 12 + slot vide = ≤13/slot) → au plus ~13⁴ combos
 *  évalués sur un clic (combatPower est bon marché), pas un chemin chaud.
 *  Retourne la map d'équipement optimale (les 4 slots gear + le familier actuel). */
/** Écarte les objets DOMINÉS : un objet qu'un autre bat sur TOUS ses axes ne peut jamais
 *  gagner, donc l'essayer est du temps perdu.
 *
 *  ⚠️ ÉLAGAGE SÛR, et c'est toute la différence avec un top-K. Le filtre par score gardait
 *  « les N meilleurs » et a JETÉ UN GAGNANT (mesuré : une arme qui valait +143) : classer,
 *  c'est déjà supposer qu'on sait comparer deux objets de natures différentes. La
 *  dominance, elle, ne compare que le comparable et ne peut rien perdre.
 *
 *  ⚠️ On ne compare QU'À SET ÉGAL : une pièce plus faible d'un AUTRE set peut gagner par
 *  son bonus de set. Et jamais entre porteurs d'effets légendaires différents : un proc
 *  ne se met pas sur la même échelle qu'un pourcentage. */
export function elagueDomines(items: Item[]): Item[] {
  const groupes = new Map<string, Item[]>();
  for (const it of items) {
    const k = `${it.slot}|${it.setId ?? ''}|${it.legendary ?? ''}`;
    (groupes.get(k) ?? groupes.set(k, []).get(k)!).push(it);
  }
  const vecteur = (it: Item): Record<string, number> => {
    const v: Record<string, number> = {};
    // ⚠️ LA VALEUR PRÉCISE, celle qu’applique `aggregateEffects` — jamais `effectiveValue`,
    // qui ARRONDIT : deux pièces à 63,07 et 62,6 y valent toutes deux 63, et la moins forte
    // pouvait « dominer » la plus forte (v0.803, trouvé par le test d’optimalité locale).
    const lm = itemLevelMult(it.level);
    for (const e of [it.effect, it.effect2, it.effect3])
      if (e) v[e.type] = (v[e.type] ?? 0) + e.value * lm;
    // ⚠️ UNE PIÈCE DE SET PORTE UN AXE DE PLUS : ce qu’elle apporte aux PALIERS du set
    // (`setBonusMult` = rareté × niveau d’objet). Sans lui, une pièce aux stats un peu
    // plus faibles mais de niveau plus haut était jugée dominée — et elle gagnait pourtant
    // par le bonus (v0.803, trouvé par le test d’optimalité locale).
    if (it.setId) v['__set'] = (RARITY_MULT[it.rarity] ?? 1) * itemLevelMult(it.level ?? 1);
    return v;
  };
  const out: Item[] = [];
  for (const grp of groupes.values()) {
    const vs = grp.map(vecteur);
    for (let i = 0; i < grp.length; i++) {
      let domine = false;
      for (let j = 0; j < grp.length && !domine; j++) {
        if (i === j) continue;
        const a = vs[j]!;
        const b = vs[i]!;
        // j domine i s'il est ≥ partout ET strictement meilleur quelque part.
        let mieux = false;
        let ok = true;
        for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const va = a[t] ?? 0;
          const vb = b[t] ?? 0;
          if (va < vb) {
            ok = false;
            break;
          }
          if (va > vb) mieux = true;
        }
        // ⚠️ À égalité PARFAITE, on n'écarte que le plus grand index : sinon deux clones
        // se domineraient l'un l'autre et TOUS LES DEUX disparaîtraient.
        if (ok && (mieux || j < i)) domine = true;
      }
      if (!domine) out.push(grp[i]!);
    }
  }
  return out;
}

export function bestGearLoadout(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  equipped: Equipped,
  inventory: Item[],
  level = 1,
  extra: Partial<AggregatedEffects> = {}, // talents + passif de voie → optimise POUR ton build réel
  voie?: string | null, // gate le capstone du set de voie → l'optimiseur valorise ton set complet
  /** Emplacements IMPOSÉS : ces pièces sont portées, l'optimisation ne touche que le reste.
   *  ⚠️ C'est ce qui distingue « Porter ce set » (un CHOIX du joueur, qui peut coûter de la
   *  puissance) de l'équipement conseillé (une recherche du maximum). Sans ce paramètre,
   *  « Porter ce set » lançait l'optimiseur avec la voie forcée mais le stuff libre : il
   *  rendait le meilleur build sur cette voie, souvent SANS aucune pièce du set demandé —
   *  un bouton qui ne fait pas ce qu'il annonce. */
  pin?: Partial<Record<ItemSlot, Item>>,
  /** Passe finale d'amélioration locale. ⚠️ Elle est COÛTEUSE (elle reparcourt tout le
   *  vivier) : mesuré, 498 ms sur un sac de 767 objets. `computeGearPlan` explore une
   *  dizaine de voies × 2 passes — la polir à chaque fois coûtait **9 secondes**, et
   *  l'écran paraissait mort. La garantie n'a besoin de tenir que pour le plan RETENU,
   *  donc l'exploration passe `false` et seul le gagnant est poli. */
  polish = true,
): Equipped {
  const bySlot: Record<ItemSlot, Item[]> = {
    weapon: [],
    armor: [],
    shield: [],
    helmet: [],
    boots: [],
    accessory: [],
    relic: [],
    familiar: [],
    trophy: [],
  };
  // Les emplacements PARALLÈLES (familier, trophée) sont alimentés comme les autres, sinon
  // ils restaient figés sur la pièce portée et n'étaient jamais comparés à celles du sac.
  for (const s of WORN_SLOTS) {
    const cur = equipped[s];
    if (cur) bySlot[s].push(cur);
  }
  for (const it of inventory) bySlot[it.slot]?.push(it);
  // ⚠️ On classe les candidats EN CONTEXTE (la pièce posée sur le build actuel), pas
  // SEULE. Porté seul, un objet perd tout ce qui le rend bon : les bonus de set de ses
  // compagnons, et les stats qui se multiplient entre elles. Mesuré sur un compte réel :
  // le tri en solo écartait une arme qui valait **+143** une fois en place, et
  // l'optimiseur annonçait « déjà optimal » pendant que la pastille du sac, elle, la
  // signalait. Deux écrans se contredisaient, et c'était celui-ci qui avait tort.
  const ctxPower = (it: Item): number =>
    combatPower(playerWithGear(name, stats, { ...equipped, [it.slot]: it }, extra, level, voie));
  // Candidats par slot : la MEILLEURE pièce de CHAQUE set + les top-K SANS set + l'objet
  // actuel + le slot vide.
  //
  // ⚠️ Le « meilleur de chaque set » n'est pas un détail de perf : c'est LUI qui rend les
  // demi-sets trouvables. Le balayage des 4 emplacements est exhaustif, donc toute
  // combinaison 1/2/3/4 pièces, mono-set, bi-set (2+2, 3+1) ou mixte avec des objets hors
  // set est évaluée AVEC ses bonus de set — mais seulement parmi les candidats retenus.
  // L'ancien filtre gardait « jusqu'à 12 pièces de set » dans l'ordre de puissance SOLO :
  // au-delà de 12, des sets entiers pouvaient ne jamais être représentés sur un slot, donc
  // certains demi-sets étaient inatteignables sans qu'on le sache.
  //
  // On garde TOUJOURS l'objet actuel du slot (même médiocre en solo mais fort en combo) →
  // l'optimiseur ne peut jamais retirer une pièce sans candidat qui fait mieux, donc jamais
  // de PERTE de puissance (bug auto-équip).
  const K = 6;
  /** Pièces retenues PAR SET et par emplacement (cf. `trim`).
   *  ⚠️ REVENU À 1 : le balayage a QUATRE boucles imbriquées sur les candidats, donc
   *  passer de 1 à 3 pièces par set les multipliait par ~16 — mesuré, l’optimisation
   *  passait à 9 SECONDES sur un sac réel et l’écran paraissait mort. Ce filtre n’est
   *  plus qu’un ACCÉLÉRATEUR : c’est la passe d’amélioration locale qui porte la
   *  garantie, et elle reparcourt TOUT le vivier de toute façon. */
  const SET_K = 1;
  const trim = (arr: Item[], keepCur?: Item): (Item | undefined)[] => {
    // ⚠️ On élague d’abord les DOMINÉS : c’est gratuit en qualité (un objet battu sur
    // tous ses axes ne peut jamais gagner) et ça réduit le balayage, qui a QUATRE
    // boucles imbriquées — donc un gain au cube sur le temps total.
    const scored = elagueDomines(arr)
      .map((it) => ({ it, p: ctxPower(it) }))
      .sort((a, b) => b.p - a.p);
    const keep = new Map<string, Item>();
    if (keepCur) keep.set(keepCur.id, keepCur);
    // ⚠️ SET_K par set et par emplacement, plus une seule pièce : deux pièces du même set
    // peuvent viser des rôles opposés (PV contre dégâts), et la meilleure « en contexte
    // actuel » n'est pas forcément celle qui gagne une fois TOUT le build recomposé.
    const parSet = new Map<string, number>();
    for (const { it } of scored) {
      if (!it.setId) continue;
      const n = parSet.get(it.setId) ?? 0;
      if (n >= SET_K) continue;
      parSet.set(it.setId, n + 1);
      keep.set(it.id, it);
    }
    let n = 0;
    for (const { it } of scored)
      if (!it.setId && n < K) {
        keep.set(it.id, it);
        n++;
      }
    return [...keep.values(), undefined];
  };
  const listFor = (s: 'weapon' | 'armor' | 'accessory' | 'relic'): (Item | undefined)[] =>
    pin?.[s] ? [pin[s]] : trim(bySlot[s], equipped[s]);
  const cand: Record<'weapon' | 'armor' | 'accessory' | 'relic', (Item | undefined)[]> = {
    weapon: listFor('weapon'),
    armor: listFor('armor'),
    accessory: listFor('accessory'),
    relic: listFor('relic'),
  };
  /** Ce qui est porté sur les emplacements PARALLÈLES d'un équipement. */
  const parallelOf = (e: Equipped): Equipped => {
    const o: Equipped = {};
    for (const s of PARALLEL_SLOTS) if (e[s]) o[s] = e[s];
    return o;
  };
  const parallelKey = (e: Equipped) => PARALLEL_SLOTS.map((s) => e[s]?.id ?? '').join('|');
  const curPar = parallelOf(equipped);

  // Base = le loadout ACTUEL : l'optimiseur ne le remplace que par STRICTEMENT mieux.
  // ⚠️ SAUF si des emplacements sont IMPOSÉS : la base actuelle ne les respecte pas, donc
  // la garder comme référence ferait échouer l'imposition dès qu'elle est plus puissante.
  let best: Equipped = pin ? {} : { ...equipped };
  let bestP = pin ? -Infinity : combatPower(playerWithGear(name, stats, best, extra, level, voie));
  // Recherche exhaustive sur les 4 slots de gear, emplacements parallèles FIXÉS ; ceux-ci
  // sont optimisés entre deux passes (ascension par coordonnées). Un produit à 6 dimensions
  // exploserait, alors que 2 passes convergent : un familier ou un trophée dépend très peu
  // du gear (ses effets s'additionnent au reste).
  const sweepGear = (par: Equipped) => {
    for (const w of cand.weapon)
      for (const a of cand.armor)
        for (const ac of cand.accessory)
          for (const r of cand.relic) {
            const combo: Equipped = { ...par };
            if (w) combo.weapon = w;
            if (a) combo.armor = a;
            if (ac) combo.accessory = ac;
            if (r) combo.relic = r;
            const p = combatPower(playerWithGear(name, stats, combo, extra, level, voie));
            if (p > bestP) {
              bestP = p;
              best = combo;
            }
          }
  };
  sweepGear(curPar);
  // Meilleure pièce de chaque emplacement parallèle POUR ce gear (le porté + les meilleurs
  // du sac ; pas de synergie de set → un top-K solo suffit ; `undefined` = rien, si c'est
  // mieux), puis re-balayage du gear si l'une a changé.
  for (const s of PARALLEL_SLOTS) {
    for (const it of trim(bySlot[s], equipped[s])) {
      const combo: Equipped = { ...best };
      if (it) combo[s] = it;
      else delete combo[s];
      const p = combatPower(playerWithGear(name, stats, combo, extra, level, voie));
      if (p > bestP) {
        bestP = p;
        best = combo;
      }
    }
  }
  if (parallelKey(best) !== parallelKey(curPar)) sweepGear(parallelOf(best));

  // ⚠️ PASSE FINALE D'AMÉLIORATION LOCALE, et elle n'est pas cosmétique : le balayage
  // ci-dessus ne voit que les candidats RETENUS (top-K par emplacement). Sur un sac
  // réel — 735 objets, 167 armes — le filtre écarte forcément des pièces, et il en a
  // écarté une qui valait +143. L'optimiseur annonçait alors « déjà optimal » pendant
  // que la pastille du sac signalait la même pièce : deux écrans en contradiction, et
  // c'était celui-ci qui avait tort.
  //
  // Cette passe reparcourt TOUT le vivier, un emplacement à la fois, jusqu’à ce
  // qu'aucun échange simple ne gagne. Elle rend VRAIE la propriété que la pastille
  // annonce, au lieu de l’approcher. Elle ne peut jamais faire perdre de puissance
  // (on ne remplace que sur un gain strict) et converge (le score croît, borné).
  if (!polish) return best;
  const tous: Item[] = elagueDomines([
    ...inventory,
    ...WORN_SLOTS.map((s) => equipped[s]).filter((x): x is Item => !!x),
  ]);
  for (const s of WORN_SLOTS) if (equipped[s]) tous.push(equipped[s]);
  for (let tour = 0; tour < 4; tour++) {
    let gagne = false;
    for (const it of tous) {
      // ⚠️ On NE TOUCHE PAS aux emplacements IMPOSÉS : « Porter ce set » promet ces
      // pièces-là. Les remplacer parce qu’elles sont moins fortes ferait mentir le
      // bouton — c’est très exactement le défaut corrigé en v0.688.
      if (pin?.[it.slot]) continue;
      if (best[it.slot]?.id === it.id) continue;
      const essai: Equipped = { ...best, [it.slot]: it };
      const p = combatPower(playerWithGear(name, stats, essai, extra, level, voie));
      if (p > bestP) {
        bestP = p;
        best = essai;
        gagne = true;
      }
    }
    if (!gagne) break; // point fixe atteint : plus aucun échange simple ne paie
  }
  return best;
}

/** Une pièce du roster d'un set, et OÙ elle se trouve. */
export interface SetRosterEntry {
  /** La MEILLEURE pièce possédée pour cet emplacement. */
  item: Item;
  /** `item` est-elle celle qu'on porte ? */
  worn: boolean;
  /** ⚠️ La pièce de ce set RÉELLEMENT PORTÉE sur cet emplacement, quand ce n'est PAS la
   *  meilleure. Sans ce champ, une meilleure pièce en réserve faisait DISPARAÎTRE de
   *  l'écran celle qu'on a sur le dos (constaté sur un compte réel : plastron Légendaire
   *  porté, Cotte Mythique en réserve → le set affichait une pièce non marquée et le
   *  joueur ne retrouvait plus son objet équipé). Un écran qui montre la collection doit
   *  pouvoir dire « tu portes ceci, tu as mieux là » — pas escamoter l'un des deux. */
  wornItem?: Item;
}

/** ROSTER d'un set de voie : la MEILLEURE pièce possédée pour chaque emplacement, qu'elle
 *  soit portée, rangée en réserve ou au sac.
 *
 *  ⚠️ Pourquoi ça existe (v0.707). « Mes sets » listait uniquement la RÉSERVE — donc,
 *  très exactement, les pièces qu'on ne portait PAS. Un joueur équipé de deux pièces de
 *  sa voie voyait un set amputé de ce qu'il avait de mieux, et une épée de réserve à côté
 *  d'une meilleure épée portée : impossible de lire sa collection. Pire, le compteur
 *  « x/4 » à côté, lui, comptait DÉJÀ partout — la liste et le chiffre se contredisaient
 *  ouvertement (4/4 affiché au-dessus de deux objets).
 *
 *  Le roster est donc la source UNIQUE des deux : le compte, c'est le nombre d'entrées.
 *  Ils ne peuvent plus diverger.
 *
 *  ⚠️ Ceci ne change RIEN au combat : le bonus de set ne compte que `equipped`
 *  (cf. `setEffects`). Le drapeau `worn` sert à le dire à l'écran, pas à l'altérer. */
/**
 * CE QUE « RECYCLER CE SET » FOND — le lot exact, lu par le store ET par l’écran.
 *
 * ⚠️ DÉFAUT CORRIGÉ (v0.806 ; signalé par l’utilisateur : « j’ai recyclé tout le set mais
 * ça m’a laissé un item dedans »). La carte d’un set montre son ROSTER — portées, réserve
 * ET sac — mais le bouton ne fondait que la RÉSERVE : les pièces du set restées au sac
 * survivaient et restaient affichées. Le lot couvre désormais réserve + sac.
 *
 * Restent, et l’écran le DIT : ce qu’on PORTE (on ne fond pas ce qu’on a sur soi) et les
 * pièces 🔒 (le verrou protège de toutes les sorties), qui repartent au sac.
 */
export function setSellLot(
  setId: string,
  stored: Loadout | undefined,
  inventory: Item[],
): { sold: Item[]; keep: Item[] } {
  const pool = [
    ...SLOTS.map((s) => stored?.items?.[s]).filter((it): it is Item => !!it),
    // Les DOUBLONS du set sont fondus avec lui (v0.839) : « tout ce set » veut dire tout.
    ...(stored?.spares ?? []),
    ...inventory.filter((it) => it.setId === setId && SLOTS.includes(it.slot)),
  ];
  return { sold: pool.filter((it) => canSell(it)), keep: pool.filter((it) => !canSell(it)) };
}

export function voieSetRoster(
  setId: string,
  equipped: Equipped,
  stored: Equipped | undefined,
  inventory: Item[] = [],
  /** Barème de comparaison. ⚠️ Par défaut `itemScore` — une somme d'affixes — mais le
   *  jeu tranche PARTOUT à `combatPower` (« l'arbitre unique »), et les deux peuvent se
   *  contredire : constaté sur un compte réel, une Lame à 107 d'itemScore était portée par
   *  l'optimiseur À LA PLACE d'une Hache à 115, parce qu'elle vaut davantage EN COMBAT.
   *  La carte affichait donc la Hache, et la pièce réellement portée semblait absente du
   *  set. L'écran doit se ranger derrière le même arbitre que le jeu : il lui passe un
   *  barème fondé sur la puissance. */
  score: (it: Item) => number = itemScore,
): Partial<Record<ItemSlot, SetRosterEntry>> {
  const out: Partial<Record<ItemSlot, SetRosterEntry>> = {};
  const consider = (it: Item | undefined, worn: boolean) => {
    if (!it || it.setId !== setId || !SLOTS.includes(it.slot)) return;
    const cur = out[it.slot];
    // Strictement meilleure pour remplacer : à score égal on garde la première vue, et
    // l'ordre de balayage commence par l'ÉQUIPÉ — un doublon exact reste donc marqué porté.
    if (!cur || score(it) > score(cur.item)) out[it.slot] = { item: it, worn };
  };
  for (const s of SLOTS) consider(equipped[s], true);
  for (const s of SLOTS) consider(stored?.[s], false);
  for (const it of inventory) consider(it, false);
  // La pièce PORTÉE ne disparaît jamais : si une meilleure l'a supplantée dans l'affichage,
  // elle reste attachée à l'entrée. C'est ce couple qui rend l'écart LISIBLE.
  for (const sl of SLOTS) {
    const w = equipped[sl];
    const e = out[sl];
    if (e && !e.worn && w && w.setId === setId) e.wornItem = w;
  }
  return out;
}
