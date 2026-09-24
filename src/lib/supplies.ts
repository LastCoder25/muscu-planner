/**
 * 🎒 LES CONSOMMABLES D'EXPÉDITION — gagnés en BUTIN, jamais achetés (décision de
 * l'utilisateur, 2026-09-24 : « pas de boutique, juste en butin » ; « tout accessible
 * partout » ; « pas de limite par voyage » ; « pris en compte sur le % de réussite »).
 *
 * ⚠️ AUCUN SYSTÈME NEUF : chaque consommable agit par une mécanique qui existe déjà (rôles de
 * convoi, force des ennemis, convalescence, âge d'une faille). Et il passe par le MÊME
 * chemin que ce qu'il modifie : l'objet `road` (`EscortKit`) suit le groupe du pronostic à
 * la résolution, donc le 🎯 % et le vrai combat voient forcément les mêmes consommables.
 *
 * ⚠️ UN DE CHAQUE TYPE PAR VOYAGE : sinon cinq rations empilées font −75 % de trajet. On
 * peut en emporter plusieurs différents, jamais deux fois le même.
 *
 * ⚠️ LES RÔLES GARDENT LEUR VALEUR : rations, carte et bâts partagent le PLAFOND du rôle
 * qu'ils remplacent (🧭 trajet, 👁️ embuscades, 🐫 cargaison). Un convoi qui a déjà ses
 * éclaireurs ne gagne presque rien à en ajouter : l'objet comble un trou, il ne dépasse pas.
 *
 * ⚠️ JAMAIS D'ÉNERGIE, D'XP NI DE RARETÉ DE BUTIN : ce serait acheter ce que le sport paie.
 */
import { mulberry32, type Combatant } from './combat';
import type { Poi, PoiType } from './expedition';

export type SupplyId =
  | 'rations'
  | 'carte'
  | 'bats'
  | 'trousse'
  | 'fumigene'
  | 'potion'
  | 'pierre'
  | 'lanterne'
  | 'cor'
  | 'sceau';

export interface SupplyDef {
  emoji: string;
  name: string;
  /** Ce qu'il fait, en une phrase — affiché sur la tuile et dans l'info-bulle. */
  what: string;
  /** Emporté par un voyage (sinon : utilisé sur la carte, comme le sceau de brèche). */
  voyage: boolean;
}

/** ⚠️ L'ORDRE EST CELUI DE L'ÉCRAN : ce qui sert partout d'abord, le plus rare à la fin. */
export const SUPPLY_IDS: readonly SupplyId[] = [
  'rations',
  'potion',
  'pierre',
  'trousse',
  'fumigene',
  'cor',
  'carte',
  'bats',
  'lanterne',
  'sceau',
];

/** Les réglages, en un seul endroit. Premier calage : à ajuster à l'usage. */
export const SUPPLY = {
  /** 🥖 part du trajet retirée (plafond partagé avec le rôle 🧭 pour les champions). */
  speed: 0.15,
  /** 🗺️ part des embuscades évitées (plafond partagé avec le rôle 👁️). */
  scout: 0.25,
  /** 🧺 cargaison en plus (plafond partagé avec le rôle 🐫). */
  haul: 0.2,
  /** 🩹 durée de convalescence après une défaite. */
  healMult: 0.5,
  /** 🔥 force (PV et dégâts) des défenseurs d'un camp ou des gardes d'un lieu de récolte. */
  guardMult: 0.9,
  /** 🧪 PV du groupe en plus. */
  pv: 0.1,
  /** 🪨 dégâts du groupe en plus. */
  dmg: 0.1,
  /** 🕯️ force des monstres d'une faille (le gardien n'est pas touché). */
  riftFoeMult: 0.85,
  /** 📯 part du butin d'un camp gardée malgré la défaite. */
  retreatShare: 0.5,
  /** 🧿 répit rendu à une faille. */
  sealMs: 24 * 3600_000,
  /** Chance qu'un voyage rapporte un consommable (un seul, tiré uniformément). ⚠️ Visé :
   *  un consommable pour 2 à 3 voyages — assez pour en avoir souvent, pas pour tout couvrir. */
  dropChance: 0.45,
} as const;

export const SUPPLIES: Record<SupplyId, SupplyDef> = {
  rations: {
    emoji: '🥖',
    name: 'Rations de route',
    what: `Trajet −${pct(SUPPLY.speed)} (comme un éclaireur 🧭, même plafond)`,
    voyage: true,
  },
  carte: {
    emoji: '🗺️',
    name: 'Carte de contrebandier',
    what: `Embuscades −${pct(SUPPLY.scout)} sur la route d'une récolte (comme un 👁️, même plafond)`,
    voyage: true,
  },
  bats: {
    emoji: '🧺',
    name: 'Bâts supplémentaires',
    what: `Cargaison d'une récolte +${pct(SUPPLY.haul)} (comme un porteur 🐫, même plafond)`,
    voyage: true,
  },
  trousse: {
    emoji: '🩹',
    name: 'Trousse de soins',
    what: 'Convalescence divisée par deux en cas de défaite',
    voyage: true,
  },
  fumigene: {
    emoji: '🔥',
    name: 'Fumigène',
    what: `Défenseurs d'un camp ou gardes d'une récolte −${pct(1 - SUPPLY.guardMult)}`,
    voyage: true,
  },
  potion: {
    emoji: '🧪',
    name: 'Potion de vigueur',
    what: `PV du groupe +${pct(SUPPLY.pv)}`,
    voyage: true,
  },
  pierre: {
    emoji: '🪨',
    name: 'Pierre à aiguiser',
    what: `Dégâts du groupe +${pct(SUPPLY.dmg)}`,
    voyage: true,
  },
  lanterne: {
    emoji: '🕯️',
    name: 'Lanterne de faille',
    what: `Monstres d'une faille −${pct(1 - SUPPLY.riftFoeMult)} (le gardien n'est pas touché)`,
    voyage: true,
  },
  cor: {
    emoji: '📯',
    name: 'Cor de retraite',
    what: `Camp perdu : on garde ${pct(SUPPLY.retreatShare)} du butin au lieu de rien`,
    voyage: true,
  },
  sceau: {
    emoji: '🧿',
    name: 'Sceau de brèche',
    what: 'Rend 24 h de répit à une faille : débordement repoussé, effectif rajeuni (une fois par faille)',
    voyage: false,
  },
};

function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

/** Le stock du joueur (`characters.supplies`, migr. 0089) : un compte par consommable. */
export type SupplyStock = Partial<Record<SupplyId, number>>;

const IS_ID = new Set<string>(SUPPLY_IDS);
export const isSupplyId = (s: unknown): s is SupplyId => typeof s === 'string' && IS_ID.has(s);

/** Relit un stock venu du JSONB : ids inconnus écartés, comptes entiers et positifs. */
export function normalizeSupplies(v: unknown): SupplyStock {
  const out: SupplyStock = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!isSupplyId(k) || typeof n !== 'number' || !Number.isFinite(n)) continue;
    const c = Math.floor(n);
    if (c > 0) out[k] = c;
  }
  return out;
}

/** Ajoute un butin au stock. Rend le MÊME objet quand il n'y a rien à ajouter. */
export function addSupplies(stock: SupplyStock, gained: SupplyStock | undefined): SupplyStock {
  const g = normalizeSupplies(gained);
  const ids = Object.keys(g) as SupplyId[];
  if (!ids.length) return stock;
  const out = { ...stock };
  for (const id of ids) out[id] = (out[id] ?? 0) + g[id]!;
  return out;
}

/** Retire UN de chaque consommable choisi. `null` si l'un d'eux manque (ou est en double) :
 *  on ne part pas avec un objet qu'on n'a pas. */
export function takeSupplies(stock: SupplyStock, ids: readonly SupplyId[]): SupplyStock | null {
  if (new Set(ids).size !== ids.length) return null;
  const out = { ...stock };
  for (const id of ids) {
    const n = out[id] ?? 0;
    if (n < 1) return null;
    if (n === 1) delete out[id];
    else out[id] = n - 1;
  }
  return out;
}

/** Les effets d'un jeu de consommables, prêts à appliquer. ⚠️ Un doublon ne compte qu'une
 *  fois — la règle « un de chaque type » tient même si un appelant l'oublie. */
export interface SupplyFx {
  speed: number;
  scout: number;
  haul: number;
  healMult: number;
  guardMult: number;
  pv: number;
  dmg: number;
  riftFoeMult: number;
  retreatShare: number;
}

export function supplyFx(ids: readonly SupplyId[] | undefined): SupplyFx {
  const on = new Set(ids ?? []);
  return {
    speed: on.has('rations') ? SUPPLY.speed : 0,
    scout: on.has('carte') ? SUPPLY.scout : 0,
    haul: on.has('bats') ? SUPPLY.haul : 0,
    healMult: on.has('trousse') ? SUPPLY.healMult : 1,
    guardMult: on.has('fumigene') ? SUPPLY.guardMult : 1,
    pv: on.has('potion') ? SUPPLY.pv : 0,
    dmg: on.has('pierre') ? SUPPLY.dmg : 0,
    riftFoeMult: on.has('lanterne') ? SUPPLY.riftFoeMult : 1,
    retreatShare: on.has('cor') ? SUPPLY.retreatShare : 0,
  };
}

/** 🧪🪨 Un combattant renforcé par la potion (PV) et la pierre (dégâts). Rend le MÊME objet
 *  sans l'un ni l'autre. */
export function boostCombatant(c: Combatant, fx: Pick<SupplyFx, 'pv' | 'dmg'>): Combatant {
  if (!fx.pv && !fx.dmg) return c;
  return {
    ...c,
    pv: Math.max(1, Math.round(c.pv * (1 + fx.pv))),
    damage: Math.max(1, Math.round(c.damage * (1 + fx.dmg))),
  };
}

/** Ce que le voyage offre aux consommables — de quoi dire lesquels servent à quelque chose. */
export interface SupplyTarget {
  type: PoiType;
  /** Le lieu se combat (camp, faille, bande, récolte gardée). */
  fights: boolean;
  hero: boolean;
  /** Champions envoyés (le héros non compris). */
  escort: number;
}

const CAMPS = new Set<PoiType>(['camp', 'lair']);
const HARVESTS = new Set<PoiType>(['mine', 'well', 'shrine', 'archive', 'mana_mine']);

/**
 * Pourquoi ce consommable ne servirait à RIEN sur ce voyage — `null` s'il sert.
 * ⚠️ L'écran grise la tuile ET dit pourquoi : emporter un objet qui ne fait rien le
 * gaspillerait, et un gris sans raison se lit comme une panne (leçon du gris de la carte).
 */
export function supplyUselessWhy(id: SupplyId, t: SupplyTarget): string | null {
  const harvest = HARVESTS.has(t.type);
  switch (id) {
    case 'rations':
      return null;
    case 'potion':
    case 'pierre':
      return t.fights ? null : 'aucun combat ici';
    case 'trousse':
      return !t.fights ? 'aucun combat ici' : t.escort ? null : 'le héros n’est jamais blessé';
    case 'fumigene':
      return CAMPS.has(t.type) || (harvest && t.fights) ? null : 'ni camp ni gardes ici';
    case 'cor':
      return CAMPS.has(t.type) ? null : 'seulement sur un camp ou un repaire';
    case 'carte':
      return !harvest ? 'seulement sur la route d’une récolte' : t.hero ? 'sans effet avec le héros' : null;
    case 'bats':
      return harvest ? null : 'seulement sur un lieu de récolte';
    case 'lanterne':
      return t.type === 'rift' ? null : 'seulement dans une faille';
    case 'sceau':
      return 'se pose sur une faille, depuis sa fiche';
  }
}

/** Butin d'un voyage : au plus UN consommable, n'importe lequel (« tout partout »).
 *  ⚠️ Tiré sur la graine du voyage : déterministe, et sur un générateur à part pour ne
 *  décaler aucun autre tirage de la résolution. */
export function rollSupplyDrop(seed: number): SupplyStock {
  const next = mulberry32((seed ^ 0x2f6b0a13) >>> 0 || 1);
  if (next() >= SUPPLY.dropChance) return {};
  const id = SUPPLY_IDS[Math.floor(next() * SUPPLY_IDS.length)]!;
  return { [id]: 1 };
}

/**
 * 🧿 LE SCEAU DE BRÈCHE — rend 24 h de répit à une faille.
 *
 * ⚠️ On RECULE SON ÂGE (`spawnedAt`, et `expiresAt` avec lui) au lieu d'ajouter une règle :
 * tout ce qui dépend de l'âge d'une faille le lit déjà (`riftMaturity`, `riftOverflows`,
 * l'effectif) — le débordement est donc repoussé ET l'effectif rajeunit d'un jour, sans
 * qu'aucun calcul ait à connaître le sceau. Une seule fois par faille (`sealed`), sinon un
 * stock suffirait à ne jamais laisser une faille déborder.
 * Rend `null` si ce n'est pas une faille, ou si elle est déjà scellée.
 */
export function sealRift<P extends Pick<Poi, 'type' | 'spawnedAt' | 'expiresAt' | 'sealed'>>(
  p: P,
): P | null {
  if (p.type !== 'rift' || p.sealed) return null;
  return {
    ...p,
    spawnedAt: p.spawnedAt + SUPPLY.sealMs,
    expiresAt: p.expiresAt + SUPPLY.sealMs,
    sealed: true,
  };
}
