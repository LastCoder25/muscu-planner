// items.ts — équipement RPG (Phase 2c). RÈGLE : l'équipement ne donne PAS de
// stats (elles viennent du sport) — il donne des EFFETS de gameplay. Pur/testable.
import { playerCombatant, combatPower, mulberry32, type Combatant } from './combat';
import type { FamiliarSpecies } from '@/data/familiars';
import { PROCEDURAL } from '@/lib/proceduralContent';

// `familiar` = 5ᵉ emplacement PARALLÈLE (compagnon) : compté par aggregateEffects
// mais EXCLU de SLOTS (donc des drops normaux / sets / forge). Cf. src/data/familiars.ts.
export type ItemSlot = 'weapon' | 'armor' | 'accessory' | 'relic' | 'familiar';
export const FAMILIAR_SLOT: ItemSlot = 'familiar';
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
// Couleur par rareté (source unique JS ; le CSS miroir pose --rk par classe .r-*/.p-*).
export const RANK_COLOR: Record<Rarity, string> = {
  commun: '#9a8f7e',
  inhabituel: '#c7ccd6',
  magique: '#4ea3ff',
  rare: '#ffd23f',
  epique: '#b07cff',
  legendaire: '#ff9a3f',
  mythique: '#ff5b5b',
  primordial: '#ffcf5c',
};
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
  | 'momentum_pct' // SIGNATURE : + dégâts par coup consécutif porté (cumul)
  // ── TIER MINEUR (affixe #3, Épique+) : bonus « light » d'éco/confort (hors puissance brute) ──
  | 'gold_pct' // + or gagné par run
  | 'magic_find_pct' // + chance de meilleur loot (luck bornée → ne franchit jamais ta ligue)
  | 'regen_pct' // + PV régénérés entre deux combats d'un donjon/labyrinthe
  | 'initiative_pct'; // + initiative (commence le combat en premier plus souvent)

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
export const LEVEL_MULT_K = 0.006;
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
/** Or de vente pour un RANG seul (rétro-compat ; préférer sellValueOf avec jet + niveau). */
export function sellValueForRarity(rank: Rarity): number {
  return GOLD_BY_RARITY[rank];
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
  let h = 2166136261 >>> 0; // FNV-1a sur l'id → graine stable
  for (let i = 0; i < it.id.length; i++) {
    h ^= it.id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rng = mulberry32(h || 1);
  const rarity = normRank(it.rarity);
  const roll = it.roll ?? 0.5;
  const affixes: ItemEffect[] = [it.effect, it.effect2, it.effect3].filter(
    (e): e is ItemEffect => !!e,
  );
  for (let a = affixes.length; a < want; a++) {
    const pool = tierPool(TIER_ORDER[a]!, it.level ?? 1).filter(
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
}
export const LEGENDARY_PROCS: LegendaryProc[] = [
  {
    id: 'initiative',
    name: 'Initiative',
    emoji: '⚡',
    slots: ['weapon'],
    desc: 'Ton 1er coup du combat est inesquivable et inflige le double.',
  },
  {
    id: 'executioner',
    name: 'Bourreau',
    emoji: '🪓',
    slots: ['weapon'],
    desc: 'Un ennemi tombé sous 15 % PV est exécuté sur-le-champ.',
  },
  {
    id: 'aegis',
    name: 'Égide',
    emoji: '🛡️',
    slots: ['armor'],
    desc: 'Annule entièrement la 1re attaque ennemie du combat.',
  },
  {
    id: 'retort',
    name: 'Rétorsion',
    emoji: '🔁',
    slots: ['armor'],
    desc: 'Renvoie intégralement le 1er coup ennemi reçu.',
  },
  {
    id: 'vampiric',
    name: 'Vampirisme',
    emoji: '🩸',
    slots: ['accessory'],
    desc: 'Tes coups critiques te soignent de la moitié de leurs dégâts.',
  },
  {
    id: 'predator_eye',
    name: 'Œil du prédateur',
    emoji: '👁️',
    slots: ['accessory'],
    desc: 'Ton 1er coup du combat est un critique garanti.',
  },
  {
    id: 'phoenix',
    name: 'Phénix',
    emoji: '🔥',
    slots: ['relic'],
    desc: 'La 1re fois qu’un coup te tuerait, tu survis à 1 PV.',
  },
  {
    id: 'secondwind',
    name: 'Second souffle',
    emoji: '💨',
    slots: ['relic'],
    desc: 'La 1re fois que tu passes sous 30 % PV, récupère 25 % de tes PV max.',
  },
];
export const LEGENDARY_BY_ID: Record<string, LegendaryProc> = Object.fromEntries(
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
/** Métadonnée du proc légendaire d'un objet (undefined si pas légendaire). */
export function legendaryOf(it: { legendary?: string }): LegendaryProc | undefined {
  return it.legendary ? LEGENDARY_BY_ID[it.legendary] : undefined;
}
/** Ensemble des procs légendaires actifs de l'équipement (pour le combattant). */
export function aggregateLegendaries(equipped: Equipped): Set<string> {
  const s = new Set<string>();
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.legendary) s.add(it.legendary);
  }
  const fam = equipped[FAMILIAR_SLOT];
  if (fam?.legendary) s.add(fam.legendary);
  return s;
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

// ── TIERS D'AFFIXE (multi-affixe façon Diablo, v0.581) ──────────────────────────
// Un drop tire 1 stat par TIER selon sa rareté (affixCountForRarity) : #1 = majeur,
// #2 = secondaire, #3 = mineur. Du plus IMPACTANT (dégâts/PV) au plus LIGHT (or/loot).
export type AffixTier = 'major' | 'secondary' | 'minor';
const AFFIX_TIERS: Record<AffixTier, EffectType[]> = {
  // Majeur : la grosse stat de combat qui définit l'objet.
  major: ['damage_pct', 'max_pv_pct', 'dmg_reduction_pct', 'crit_pct'],
  // Secondaire : soutien de combat + signatures conditionnelles (gatées en profondeur).
  secondary: ['lifesteal_pct', 'thorns_pct', 'execute_pct', 'rage_pct', 'momentum_pct'],
  // Mineur : bonus « light » d'éco/confort — n'augmentent PAS la puissance de combat brute.
  minor: ['gold_pct', 'magic_find_pct', 'regen_pct', 'initiative_pct'],
};
const TIER_ORDER: AffixTier[] = ['major', 'secondary', 'minor'];

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

/** Base canonique par type d'effet (1re occurrence dans SLOT_EFFECTS + bases explicites
 *  des stats MINEURES, absentes des pools de slot). Sert à valoriser un affixe (tier) et
 *  une stat de SET choisie par THÈME. */
const EFFECT_BASE: Record<EffectType, number> = (() => {
  // Bases explicites des stats mineures (light) — volontairement basses vs les stats de
  // combat pour ne pas gonfler itemScore ni voler la vedette aux affixes majeurs.
  const m = {
    gold_pct: 14,
    magic_find_pct: 6,
    regen_pct: 8,
    initiative_pct: 10,
  } as Record<EffectType, number>;
  for (const slot of Object.keys(SLOT_EFFECTS) as ItemSlot[])
    for (const e of SLOT_EFFECTS[slot]) if (m[e.type] === undefined) m[e.type] = e.base;
  return m;
})();

/** Stats d'un TIER réellement disponibles à ce niveau (gate des signatures). Jamais vide
 *  (chaque tier a des options non gatées) → un affixe de tier trouve toujours une stat. */
function tierPool(tier: AffixTier, level: number): EffectType[] {
  return AFFIX_TIERS[tier].filter((t) => (EFFECT_MIN_LEVEL[t] ?? 1) <= level);
}

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
  commun: 'brut',
  inhabituel: 'affûté',
  magique: 'runique',
  rare: 'enchanté',
  epique: 'héroïque',
  legendaire: 'légendaire',
  mythique: 'mythique',
  primordial: 'primordial',
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
    case 'magic_find_pct':
      return `+${v}% butin (loot)`;
    case 'regen_pct':
      return `+${v}% régén entre combats`;
    case 'initiative_pct':
      return `+${v}% initiative`;
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
// Plafond de rareté selon le NIVEAU du contenu (racine → RAPIDE tôt, LENT tard) : Commun→Rare
// le 1er mois, puis chaque tier coûte de plus en plus (Légendaire ≈ niv.36, Primordial ≈ niv.64
// → graal long terme). 8 tiers (index 0..7). Calibré par simulation.
export function rankCeilingForLevel(level: number): number {
  return Math.min(7, Math.max(0, Math.floor(Math.sqrt(Math.max(0, level)) * 0.9)));
}
/** MARGE d'avance : on peut farmer/obtenir du rang jusqu'à `niveauJoueur + LEVEL_MARGIN`.
 *  Au-delà, le rang d'un drop est CAPÉ par ton niveau → le sport reste le vrai plafond,
 *  mais un overshoot modéré (récompense du farm) reste possible. Ticket anti-runaway. */
export const LEVEL_MARGIN = 5;
/** Niveau EFFECTIF d'un drop = min(niveau du contenu, niveau joueur + marge). Si `playerLevel`
 *  n'est pas fourni (contexte legacy/tests), pas de cap. Centralise la règle pour TOUS les tirages. */
export function cappedDropLevel(contentLevel: number, playerLevel?: number): number {
  return playerLevel == null ? contentLevel : Math.min(contentLevel, playerLevel + LEVEL_MARGIN);
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

// ── DISTRIBUTION de RANG : PYRAMIDE centrée sur le NIVEAU (2026‑08‑23) ──
// Le rang d'un drop suit une CLOCHE dont le PIC = le rang de min(niveauContenu, niveauJoueur)
// (rankCeilingForLevel). Traîne BASSE large (LO_WIDTH_RANK → fourrage/or, rangs inférieurs à
// revendre), pointe HAUTE raide (hiWidth → jackpot rare d'un rang supérieur, façon ARPG « on
// peut drop plus haut que sa ligue »), épaissie et poussée par la `luck` (profondeur/fiole)
// et le `floorBonus` (Autel des boss). Plus de « frise » à cran ni de cap dur systématique :
// l'anti-runaway vient (1) du centre calé sur ton NIVEAU (min contenu/joueur → le sport reste
// le plafond) et (2) d'un plafond de rang à niveauJoueur+marge quand `playerLevel` est fourni.
// Le « jet » est un roll CONTINU [0,1] (rankRollMult) qui balaie TOUT l'intervalle du rang →
// on farme le meilleur jet à son rang. Plus de qualité ★ : un jet parfait frôle le rang
// au-dessus (chevauchement voulu).

const LO_WIDTH_RANK = 1.8; // écart-type BAS (rangs sous le pic) — large : fourrage

/** Paramètres de la cloche de rang pour un contenu (source UNIQUE : rollTier + dropBand →
 *  l'affichage de la bande suit toujours le tirage réel).
 *  - `center` : rang-pic = rankCeilingForLevel(min(contenu, joueur)) + floorBonus (Autel) ;
 *  - `loWidth`/`hiWidth` : écarts-types bas (large, fourrage) / haut (raide, jackpot, dopé luck) ;
 *  - `cap` : clamp DOUX (+2 rangs) qui borne le jackpot sans créer d'empilement disgracieux.
 *  ANTI-RUNAWAY : c'est le `center = min(contenu, joueur)` qui garantit qu'un bas-niveau ne
 *  drope jamais du rang très supérieur (un pic sur SON rang, +1 rare, +2 exceptionnel) — pas
 *  un plafond dur (qui empilait toute la traîne haute sur un rang → 61 % + jackpot incohérent). */
function rankBell(level: number, luck: number, floorBonus: number, playerLevel?: number) {
  const l = Math.min(1, Math.max(0, luck));
  const eff = playerLevel == null ? level : Math.min(level, playerLevel);
  // Pic NATUREL = rang de ton niveau (min contenu/joueur). Le `floorBonus` (Autel/générosité
  // boss) DÉCALE le centre vers le haut (meilleures ODDS dans ta ligue) mais NE relève PAS le
  // plafond (cf. plus bas) → il améliore la chance d'un bon roll, il ne fait pas leapfrog.
  const baseCeil = rankCeilingForLevel(eff);
  const center = baseCeil + Math.max(0, floorBonus);
  // Pointe haute RESSERRÉE (v0.579) : le « +1 rang » au-dessus de ton niveau tombe de ~22 %
  // à ~9 % → les hauts rangs (dont Légendaire+) redeviennent un vrai score, pas la moitié des
  // drops. La luck l'épaissit encore (jackpot façon ARPG). Baisser encore (0,16+0,4·l) = ~4 %.
  const hiWidth = 0.22 + l * 0.5;
  // ANTI-RUNAWAY (v0.598) : le plafond est ANCRÉ au pic NATUREL (baseCeil + 2), PAS au centre
  // gonflé par `floorBonus`. Avant, la générosité boss (+0,6) et l'Autel poussaient le cap →
  // un joueur niv.20 (ceiling épique) dropait du Primordial (+3 rangs). Désormais floorBonus/luck
  // ne biaisent QUE la distribution sous ce plafond : le sport reste le vrai plafond (+2 max).
  const cap = Math.min(RANK_ORDER.length - 1, baseCeil + 2); // borne douce : +2 rangs sur le pic naturel
  return { center, loWidth: LO_WIDTH_RANK, hiWidth, cap };
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
/** Tire un { rank, roll } : rang via la cloche (pyramide centrée niveau), `roll` = JET CONTINU
 *  [0,1] BIAISÉ BAS (haut jet rare, cf. rollJetValue). `level` = niveau du CONTENU ; `playerLevel`
 *  (optionnel) cale le centre sur min(contenu, joueur) et plafonne le rang. `floorBonus` en RANGS. */
export function rollTier(
  rng: () => number,
  level: number,
  luck = 0,
  floorBonus = 0,
  playerLevel?: number,
): { rank: Rarity; roll: number } {
  const { center, loWidth, hiWidth, cap } = rankBell(level, luck, floorBonus, playerLevel);
  const g = gaussian(rng);
  let idx = Math.round(center + (g >= 0 ? g * hiWidth : g * loWidth));
  idx = Math.min(RANK_ORDER.length - 1, Math.max(0, Math.min(cap, idx)));
  return { rank: RANK_ORDER[idx]!, roll: rollJetValue(rng, luck) }; // jet biaisé bas
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

/** Bande de rang TYPIQUE d'un contenu (≈ 10e→90e centile de la cloche) → affiche « D → A ».
 *  Déterministe (analytique, pas de rng). La qualité affichée est indicative (roll continu). */
export function dropBand(
  level: number,
  luck = 0,
  floorBonus = 0,
  playerLevel?: number,
): { lo: { rank: Rarity; quality: number }; hi: { rank: Rarity; quality: number } } {
  const { center, loWidth, hiWidth, cap } = rankBell(level, luck, floorBonus, playerLevel);
  const clamp = (x: number) =>
    Math.min(RANK_ORDER.length - 1, Math.max(0, Math.min(cap, Math.round(x))));
  const loI = clamp(center - 1.3 * loWidth);
  const hiI = clamp(center + 1.3 * hiWidth);
  return { lo: { rank: RANK_ORDER[loI]!, quality: 3 }, hi: { rank: RANK_ORDER[hiI]!, quality: 3 } };
}

/** Libellé compact de la bande de drop : « D → A » (ou « C » si un seul rang). */
export function dropBandLabel(
  level: number,
  luck = 0,
  floorBonus = 0,
  playerLevel?: number,
): string {
  const { lo, hi } = dropBand(level, luck, floorBonus, playerLevel);
  return lo.rank === hi.rank ? lo.rank : `${lo.rank} → ${hi.rank}`;
}
/** Rang le PLUS PROBABLE d'un drop (pic de la pyramide) — pour l'affichage : TOUS les rangs
 *  restent droppables, seuls les % varient (cf. rarityOdds), donc on montre le pic, pas une
 *  fausse borne min→max. */
export function dropPeakRank(
  level: number,
  luck = 0,
  floorBonus = 0,
  playerLevel?: number,
): Rarity {
  const { center, cap } = rankBell(level, luck, floorBonus, playerLevel);
  return RANK_ORDER[
    Math.min(RANK_ORDER.length - 1, Math.max(0, Math.min(cap, Math.round(center))))
  ]!;
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
    playerLevel?: number; // cap anti-runaway : le rang est plafonné à playerLevel + marge
  },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? 0.6 : 0.3;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  // NIVEAU D'OBJET (ilvl) = PYRAMIDE centrée sur min(niveau donjon, niveau perso) → mostly
  // à ton niveau, parfois un peu au-dessus (chance, dopée magic find), borné (anti-runaway).
  const ilvlCenter =
    opts.playerLevel != null ? Math.min(opts.level ?? 1, opts.playerLevel) : (opts.level ?? 1);
  const lvl = rollItemLevel(rng, ilvlCenter, opts.luck ?? 0);
  // RANG = PYRAMIDE centrée sur min(niveau contenu, niveau joueur) : le pic est ton rang,
  // traîne basse (fourrage) et pointe haute rare (jackpot d'un rang au-dessus) dopée par la
  // `luck` (profondeur/fiole) et `rollFloor` (Autel). Un bas-niveau en donjon profond reste
  // centré sur SON rang (anti-runaway). La QUALITÉ est un roll continu → farm du meilleur jet.
  const floorRanks = Math.min(1, Math.max(0, opts.rollFloor ?? 0)) * 1.6; // 0..1,6 rang
  const { rank: rarity, roll } = rollTier(
    rng,
    opts.level ?? 1,
    opts.luck ?? 0,
    floorRanks,
    opts.playerLevel,
  );
  // value = base × intervalle du RANG selon le JET (rankRollMult). La PROFONDEUR est encodée
  // par le RANG (pyramide) ; le jet (roll) balaie tout l'intervalle du rang → chasse au bon jet.
  const rollValue = (t: EffectType) =>
    Math.max(1, round1(EFFECT_BASE[t] * rankRollMult(rarity, roll)));
  // MULTI-AFFIXE PAR TIER (v0.581, façon Diablo) : la rareté donne 1→3 affixes, tirés
  // UN PAR TIER (majeur → secondaire → mineur). Plus la rareté est haute, plus on descend
  // l'échelle d'impact (une grosse stat + du soutien + un bonus light). Tiers disjoints →
  // pas de doublon de type. Tirage UNIFORME dans chaque tier (la voie n'oriente PAS les drops).
  const affixCount = affixCountForRarity(rarity);
  const affixes: ItemEffect[] = [];
  for (let a = 0; a < affixCount; a++) {
    // Gate des affixes = ton NIVEAU RÉEL (ilvlCenter), pas l'ilvl chanceux → un drop lucky
    // gagne de la MAGNITUDE (levelMult), pas des affixes exotiques hors de ta ligue.
    const p = tierPool(TIER_ORDER[a]!, ilvlCenter);
    if (!p.length) continue; // tier vide (ne devrait pas arriver) → on saute cet affixe
    const type = pick(rng, p);
    affixes.push({ type, value: rollValue(type) });
  }
  const chosen = affixes[0]!;
  const effect2 = affixes[1];
  const effect3 = affixes[2];
  // Objet portant un affixe SIGNATURE (n'importe quel tier) → nom évocateur (« Guillotine ») ;
  // sinon nom + adjectif de rareté.
  const sigAffix = affixes.find((e) => SIGNATURE_NAMES[e.type]);
  const name = sigAffix
    ? pick(rng, SIGNATURE_NAMES[sigAffix.type]!)
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
  // Le RANG d'une pièce de set = pyramide centrée sur le PALIER du boss, LÉGÈREMENT remontée
  // (+0,35 rang : les boss restent une source solide, un cran au-dessus des donjons) + `rollFloor`
  // (Autel). Baisse v0.604 (+0,6 → +0,35) : à +0,6, un boss de bas niveau centrait ses drops
  // à mi-chemin du rang SUPÉRIEUR → ~50 % de Légendaires (donc de PROCS légendaires) dès le
  // niv.20, bien avant que Légendaire soit ton rang naturel (~niv.31). Désormais le boss donne
  // surtout TON rang, Légendaire restant un beau +1 (aligné sur la courbe de rareté).
  const floorRanks = Math.min(1, Math.max(0, opts.rollFloor ?? 0)) * 1.6 + 0.35;
  const { rank: rarity, roll } = rollTier(
    rng,
    opts.level,
    opts.luck ?? 0,
    floorRanks,
    opts.playerLevel,
  );
  // STAT DE LA PIÈCE = tirée dans le THÈME DU SET (types de ses paliers), pas dans le pool
  // générique du slot → un set a des stats COHÉRENTES avec son identité (ex. Écailles du
  // Dragon = dégâts/crit/vol de vie sur toutes ses pièces), au lieu de stats aléatoires
  // hors-thème. Déterministe par slot (chaque emplacement du set = une stat stable du thème).
  const theme = set ? [...new Set(set.tiers.map((t) => t.type))] : [];
  const chosenType: EffectType = theme.length
    ? theme[SLOTS.indexOf(slot) % theme.length]!
    : pick(rng, SLOT_EFFECTS[slot]).type;
  const base = EFFECT_BASE[chosenType] ?? 8;
  const value = Math.max(1, round1(base * rankRollMult(rarity, roll)));
  const noun = pick(rng, NAMES[slot]);
  // NIVEAU D'OBJET (ilvl) de la pièce de set = pyramide centrée sur min(palier, perso).
  const setCenter = opts.playerLevel != null ? Math.min(opts.level, opts.playerLevel) : opts.level;
  const level = rollItemLevel(rng, setCenter, opts.luck ?? 0);
  // MULTI-AFFIXE (correctif) : une pièce de set porte le MÊME NOMBRE d'affixes qu'un drop
  // de sa rareté (1→3). Sans ça, la refonte multi-affixe (v0.577-0.581) avait laissé les
  // sets à UNE stat pendant que les drops en gagnaient trois → un set complet (4 stats +
  // paliers) perdait systématiquement contre du stuff mixte (12 stats), et les bonus de
  // set ne rattrapaient pas l'écart. L'affixe #1 reste le THÈME du set (identité), les
  // suivants viennent des tiers secondaire/mineur comme un drop.
  const affixes: ItemEffect[] = [{ type: chosenType, value }];
  for (let a = 1; a < affixCountForRarity(rarity); a++) {
    const pool = tierPool(TIER_ORDER[a]!, setCenter).filter(
      (t) => !affixes.some((x) => x.type === t),
    );
    if (!pool.length) continue;
    const t = pick(rng, pool);
    affixes.push({
      type: t,
      value: Math.max(1, round1((EFFECT_BASE[t] ?? 8) * rankRollMult(rarity, roll))),
    });
  }
  // Une pièce de set Légendaire+ porte AUSSI un proc légendaire (rareté orthogonale au set).
  const legendary =
    RARITY_RANK[rarity] >= LEGENDARY_MIN_RANK ? rollLegendaryProc(rng, slot) : undefined;
  return {
    slot,
    name: set ? `${noun} · ${set.name}` : `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: set ? set.emoji : SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: affixes[0]!, // stat COHÉRENTE au set (identité) + synergie (bonus 2/3/4 pièces)
    ...(affixes[1] ? { effect2: affixes[1] } : {}),
    ...(affixes[2] ? { effect3: affixes[2] } : {}),
    ...(set ? { setId: opts.setId } : {}),
    ...(legendary ? { legendary } : {}),
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
  opts: { level: number; luck?: number; rarity?: Rarity; playerLevel?: number },
): Omit<Item, 'id'> {
  // RANG + QUALITÉ comme les objets : tous deux via rollTier → la LUCK (élevée dans les
  // labyrinthes profonds) pousse aussi la QUALITÉ vers le haut (avant : rang biaisé par la
  // luck mais qualité uniforme 20 %). Rareté forcée (fusion) → qualité uniforme.
  let rarity: Rarity;
  let roll: number;
  if (opts.rarity) {
    rarity = opts.rarity;
    roll = rollJetValue(rng, opts.luck ?? 0); // jet biaisé bas (comme les drops)
  } else {
    const t = rollTier(rng, opts.level, opts.luck ?? 0, 0, opts.playerLevel);
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
    case 'magic_find_pct':
      a.magicFindPct += v;
      break;
    case 'regen_pct':
      a.regenPct += v;
      break;
    case 'initiative_pct':
      a.initiativePct += v;
      break;
  }
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
  for (const e of list) {
    a.damagePct += e.damagePct;
    a.critAdd += e.critAdd;
    a.dodgeAdd += e.dodgeAdd;
    a.lifesteal += e.lifesteal;
    a.dmgReduction += e.dmgReduction;
    a.maxPvPct += e.maxPvPct;
    a.goldPct += e.goldPct;
    a.executePct += e.executePct;
    a.ragePct += e.ragePct;
    a.momentumPct += e.momentumPct;
    a.thornsPct += e.thornsPct;
    a.magicFindPct += e.magicFindPct;
    a.regenPct += e.regenPct;
    a.initiativePct += e.initiativePct;
  }
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
}[] = [
  {
    voie: 'berserker',
    name: 'Fureur du Berserker',
    emoji: '💥',
    theme: 'Dégâts bruts et exécution — le set qui frappe.',
    stats: ['damage_pct', 'execute_pct', 'lifesteal_pct'],
  },
  {
    voie: 'gardien',
    name: 'Rempart du Gardien',
    emoji: '🛡️',
    theme: 'Le mur qui frappe : encaisse tout et tient.',
    stats: ['dmg_reduction_pct', 'max_pv_pct', 'damage_pct'],
  },
  {
    voie: 'assassin',
    name: 'Ombre de l’Assassin',
    emoji: '🗡️',
    theme: 'Critiques qui achèvent, un vol de vie pour durer.',
    stats: ['crit_pct', 'execute_pct', 'lifesteal_pct'],
  },
  {
    voie: 'vampire',
    name: 'Soif du Vampire',
    emoji: '🩸',
    theme: 'Vole la vie et se déchaîne au bord de la mort.',
    stats: ['lifesteal_pct', 'damage_pct', 'rage_pct'],
  },
  {
    voie: 'colosse',
    name: 'Carcasse du Colosse',
    emoji: '🪨',
    theme: 'Réservoir de PV qui cogne dans la durée.',
    stats: ['max_pv_pct', 'dmg_reduction_pct', 'damage_pct'],
  },
  {
    voie: 'duelliste',
    name: 'Élégance du Duelliste',
    emoji: '🎯',
    theme: 'Précision létale adossée à des PV.',
    stats: ['crit_pct', 'damage_pct', 'max_pv_pct'],
  },
  {
    voie: 'epineux',
    name: 'Carapace de l’Épineux',
    emoji: '🌵',
    theme: 'Encaisse, renvoie les coups, frappe en retour.',
    stats: ['thorns_pct', 'max_pv_pct', 'damage_pct'],
  },
  {
    voie: 'frenetique',
    name: 'Transe du Frénétique',
    emoji: '🌀',
    theme: 'Monte en puissance au fil du combat.',
    stats: ['momentum_pct', 'damage_pct', 'lifesteal_pct'],
  },
];
export const VOIE_SETS: ItemSet[] = VOIE_SET_DEFS.map((d) => ({
  id: `voie:${d.voie}`,
  name: d.name,
  emoji: d.emoji,
  theme: d.theme,
  tiers: [
    {
      pieces: 2,
      type: d.stats[2],
      base: Math.max(1, round1((EFFECT_BASE[d.stats[2]] ?? 8) * 0.7)),
    },
    {
      pieces: 3,
      type: d.stats[1],
      base: Math.max(1, round1((EFFECT_BASE[d.stats[1]] ?? 8) * 1.0)),
    },
    // 4-pièces = CAPSTONE (gaté par la voie) : la stat IDENTITÉ, amplifiée.
    {
      pieces: 4,
      type: d.stats[0],
      base: Math.max(1, round1((EFFECT_BASE[d.stats[0]] ?? 8) * 1.6)),
    },
  ],
}));
export const VOIE_SET_IDS: string[] = VOIE_SETS.map((s) => s.id);
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
export const ITEM_SETS: ItemSet[] = VOIE_SETS;
export const SET_BY_ID: Record<string, ItemSet> = Object.fromEntries(
  [...VOIE_SETS, ...HAND_SETS, ...PROCEDURAL.sets].map((s) => [s.id, s]),
);

/** Multiplicateur de bonus de set scalé par le RANG moyen des pièces (#3, ticket 8bfe5130) :
 *  les pièces d'un boss plus profond ont un rang plus haut → bonus de set plus fort → on
 *  veut faire les boss suivants. Ancré au rang MOYEN (Rare) → un set Rare ≈ base d'origine,
 *  les sets plus hauts montent, les plus bas baissent un peu. */
export function setBonusMult(pieces: Item[]): number {
  if (!pieces.length) return 1;
  const anchor = RARITY_MULT.rare;
  const avg = pieces.reduce((s, i) => s + (RARITY_MULT[i.rarity] ?? anchor), 0) / pieces.length;
  return avg / anchor;
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

/** Effets cumulés des SETS actifs (≥2 pièces), scalés par le rang moyen des pièces.
 *  Le CAPSTONE (4-pièces) ne s'applique QUE si `voie` correspond au set (`voie:<voie>`) →
 *  compléter le set de SA voie = accomplir l'archétype. Les 2/3-pièces valent pour tous. */
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
    for (const t of def.tiers) {
      if (items.length < t.pieces) continue;
      // 4-pièces = CAPSTONE : gaté par la voie (l'archétype). Un set complet HORS voie
      // ne donne que ses 2/3-pièces (stats brutes), pas la signature amplifiée.
      if (t.pieces >= 4 && id !== capstoneId) continue;
      applyEffect(a, t.type, Math.max(1, round1(t.base * mult)) / 100);
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
  for (const slot of SLOTS) {
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
    const flm = itemLevelMult(fam.level);
    applyEffect(a, fam.effect.type, (fam.effect.value * flm) / 100);
    if (fam.effect2) applyEffect(a, fam.effect2.type, (fam.effect2.value * flm) / 100);
  }
  // Bonus de set (2/3 pièces pour tous ; 4-pièces capstone si la voie correspond).
  const s = setEffects(equipped, voie);
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
  a.magicFindPct += s.magicFindPct;
  a.regenPct += s.regenPct;
  a.initiativePct += s.initiativePct;
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
  voie?: string | null,
): Combatant {
  const base = playerCombatant(name, stats, level);
  // `voie` gate le capstone (4-pièces) du set de la voie (cf. setEffects).
  const e = aggregateEffects(equipped, voie);
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
  // Procs LÉGENDAIRES (non-scalants) portés par l'équipement.
  const procs = aggregateLegendaries(equipped);
  // Stats MINEURES de combat : initiative (multiplicatif, léger) + régén de donjon (borné +30 %).
  const initiativePct = e.initiativePct + (extra.initiativePct ?? 0);
  const regen = Math.min(0.3, e.regenPct + (extra.regenPct ?? 0));
  return {
    name,
    pv: Math.round(base.pv * (1 + maxPvPct)),
    damage: Math.max(1, Math.round(base.damage * (1 + damagePct))),
    crit: Math.min(0.6, base.crit + critAdd),
    dodge: Math.min(0.4, base.dodge + dodgeAdd),
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
  extra: Partial<AggregatedEffects> = {}, // talents + passif de voie → optimise POUR ton build réel
  voie?: string | null, // gate le capstone du set de voie → l'optimiseur valorise ton set complet
): Equipped {
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
  // Le FAMILIER est un slot parallèle (hors SLOTS) : on l'alimente à part, sinon il
  // restait figé sur celui porté et n'était jamais comparé à ceux du sac.
  const curFam = equipped[FAMILIAR_SLOT];
  if (curFam) bySlot[FAMILIAR_SLOT].push(curFam);
  for (const it of inventory) {
    if (SLOTS.includes(it.slot)) bySlot[it.slot].push(it);
    else if (it.slot === FAMILIAR_SLOT) bySlot[FAMILIAR_SLOT].push(it);
  }
  const soloPower = (it: Item): number => {
    const one: Equipped = {};
    one[it.slot] = it;
    return combatPower(playerWithGear(name, stats, one, extra, level, voie));
  };
  // Candidats retenus par slot : top-K solo + toutes les pièces de set (cap 12) + slot vide.
  // On garde TOUJOURS l'objet actuel du slot (même s'il est médiocre en solo mais fort en
  // combo, ou hors top-K) → l'optimiseur ne peut jamais retirer une pièce sans candidat qui
  // fait mieux, donc jamais de PERTE de puissance (bug auto-équip).
  const K = 6;
  const trim = (arr: Item[], keepCur?: Item): (Item | undefined)[] => {
    const scored = arr.map((it) => ({ it, p: soloPower(it) })).sort((a, b) => b.p - a.p);
    const keep = new Map<string, Item>();
    if (keepCur) keep.set(keepCur.id, keepCur);
    for (const { it } of scored.slice(0, K)) keep.set(it.id, it);
    for (const { it } of scored) if (it.setId && keep.size < 12) keep.set(it.id, it);
    return [...keep.values(), undefined];
  };
  const cand: Record<'weapon' | 'armor' | 'accessory' | 'relic', (Item | undefined)[]> = {
    weapon: trim(bySlot.weapon, equipped.weapon),
    armor: trim(bySlot.armor, equipped.armor),
    accessory: trim(bySlot.accessory, equipped.accessory),
    relic: trim(bySlot.relic, equipped.relic),
  };
  // Candidats FAMILIER : le porté + les meilleurs du sac (pas de synergie de set sur ce
  // slot → un top-K solo suffit). `undefined` = aucun familier, si c'est mieux.
  const famCand = trim(bySlot[FAMILIAR_SLOT], curFam);

  // Base = le loadout ACTUEL : l'optimiseur ne le remplace que par STRICTEMENT mieux.
  let best: Equipped = { ...equipped };
  let bestP = combatPower(playerWithGear(name, stats, best, extra, level, voie));
  // Recherche exhaustive sur les 4 slots de gear, à familier FIXÉ ; le familier est
  // optimisé entre deux passes (ascension par coordonnées). Un produit à 5 dimensions
  // exploserait (13^5 × 8 voies), alors que 2 passes convergent : le meilleur familier
  // dépend très peu du gear (ses effets s'additionnent au reste).
  const sweepGear = (fam: Item | undefined) => {
    for (const w of cand.weapon)
      for (const a of cand.armor)
        for (const ac of cand.accessory)
          for (const r of cand.relic) {
            const combo: Equipped = {};
            if (w) combo.weapon = w;
            if (a) combo.armor = a;
            if (ac) combo.accessory = ac;
            if (r) combo.relic = r;
            if (fam) combo.familiar = fam;
            const p = combatPower(playerWithGear(name, stats, combo, extra, level, voie));
            if (p > bestP) {
              bestP = p;
              best = combo;
            }
          }
  };
  sweepGear(curFam);
  // Meilleur familier POUR ce gear, puis re-balayage du gear s'il a changé.
  let bestFam = best[FAMILIAR_SLOT];
  for (const fam of famCand) {
    const combo: Equipped = { ...best };
    if (fam) combo[FAMILIAR_SLOT] = fam;
    else delete combo[FAMILIAR_SLOT];
    const p = combatPower(playerWithGear(name, stats, combo, extra, level, voie));
    if (p > bestP) {
      bestP = p;
      best = combo;
      bestFam = fam;
    }
  }
  if ((bestFam?.id ?? null) !== (curFam?.id ?? null)) sweepGear(bestFam);
  return best;
}
