/**
 * 🔁 LANCER UN DONJON OU UN BOSS PLUSIEURS FOIS D'AFFILÉE (demandé : « propose le lancement de x
 * fois le donjon selon l'énergie dispo, pareil pour les boss »). Pur : le choix des tuiles
 * (×5, ×10, Max) et le cumul des résultats. La page enchaîne les vrais lancers un par un
 * (mêmes règles, mêmes écritures), ceci ne fait que compter.
 *
 * Un donjon se paie en énergie ⚡, un boss de palier en pierres d'invocation 🔮 : `have` est le
 * stock de la ressource concernée, `cost` le prix d'UN lancer.
 */
import type { Item } from './items';
import type { FiledPiece } from './setFiling';

/** Paliers proposés avant « Max ». */
const BATCH_STEPS = [5, 10] as const;
/**
 * ⚠️ « Max » est plafonné : chaque lancer est une écriture en base (le trafic sortant du compte
 * gratuit a déjà été dépassé, cf. CLAUDE.md « TRAFIC SORTANT ») et un récap de 60 combats ne se
 * lit plus.
 */
export const BATCH_CAP = 25;

export interface BatchChoice {
  n: number;
  /** La tuile « Max » : tout ce que le stock paie (dans la limite de `BATCH_CAP`). */
  max: boolean;
}

/** Combien de lancers le stock paie (au plus `BATCH_CAP`). */
export function batchMax(have: number, cost: number): number {
  if (!(cost > 0)) return 0;
  return Math.min(BATCH_CAP, Math.max(0, Math.floor(have / cost)));
}

/**
 * Les tuiles à proposer, en plus du lancer simple : ×5 et ×10 s'ils sont payables, puis « Max ».
 * Rien quand le stock ne paie qu'un lancer (le bouton simple suffit). « Max » n'est ajouté que
 * s'il apporte un nombre que les paliers n'offrent pas.
 */
export function batchChoices(have: number, cost: number): BatchChoice[] {
  const m = batchMax(have, cost);
  if (m < 2) return [];
  const out: BatchChoice[] = BATCH_STEPS.filter((n) => n < m).map((n) => ({ n, max: false }));
  out.push({ n: m, max: true });
  return out;
}

/** Ce qu'un lancer apporte au récap. */
export interface BatchRunResult {
  cleared: boolean;
  gold: number;
  drops: readonly Item[];
  summonStones?: number;
  talentDrops?: readonly unknown[];
  /** 1er nettoyage d'un donjon / 1re victoire sur un boss. */
  firstClear?: boolean;
}

/** 🧩 Une pièce de set renforcée pendant la série : SEULE la dernière de son emplacement compte. */
interface BatchSetNote {
  setIndex: number;
  setName: string;
  slot: string;
  /** La dernière pièce posée dans cet emplacement du set. */
  item: Item;
  /** Ce qui y était AVANT la série (null : l'emplacement était libre). */
  from: Item | null;
  /** Gain de puissance de la dernière pièce sur l'ORIGINALE (null : emplacement libre). */
  gain: number | null;
}

export interface BatchSummary {
  name: string;
  kind: 'dungeon' | 'boss';
  /** Lancers demandés. */
  asked: number;
  /** Lancers réellement joués (la série s'arrête sur une récompense en attente, une erreur…). */
  runs: number;
  cleared: number;
  failed: number;
  gold: number;
  summonStones: number;
  talents: number;
  drops: Item[];
  firstClear: boolean;
  /** Pourquoi la série s'est arrêtée avant la fin, s'il y a lieu. */
  stoppedBecause: string | null;
  /** 🧩 Pièces de set renforcées PENDANT la série (une par set et par emplacement). Le rangement
   *  automatique se fait en arrière-plan : il n'annonce plus rien un lancer à la fois, il vient ici. */
  sets: BatchSetNote[];
  /** L'or des doublons de set vendus d'office pendant la série. */
  spareGold: number;
  /** Reliques en trop vendues d'office, et l'or qu'elles ont rapporté. */
  relics: number;
  relicGold: number;
}

export function newBatch(name: string, kind: 'dungeon' | 'boss', asked: number): BatchSummary {
  return {
    name,
    kind,
    asked,
    runs: 0,
    cleared: 0,
    failed: 0,
    gold: 0,
    summonStones: 0,
    talents: 0,
    drops: [],
    firstClear: false,
    stoppedBecause: null,
    sets: [],
    spareGold: 0,
    relics: 0,
    relicGold: 0,
  };
}

/** L'or TOTAL d'une série : les lancers plus les ventes automatiques (reliques, doublons). */
export function batchTotalGold(b: BatchSummary): number {
  return b.gold + b.relicGold + b.spareGold;
}

/**
 * Verse au récap ce que le rangement automatique des pièces de set a fait. Par set ET par
 * emplacement, on ne garde que la DERNIÈRE pièce posée, comparée à celle d'AVANT la série (un set
 * renforcé dix fois ne se raconte pas dix fois) ; l'or des doublons vendus s'additionne.
 */
export function noteFiledPieces(
  b: BatchSummary,
  filed: readonly FiledPiece[],
  gold: number,
  score: (it: Item) => number,
  setName: (setIndex: number) => string,
): BatchSummary {
  b.spareGold += gold;
  for (const f of filed) {
    if (f.outcome === 'spare') continue; // un doublon ne s'annonce pas : il se lit dans « Mes sets »
    const i = b.sets.findIndex((n) => n.setIndex === f.setIndex && n.slot === f.item.slot);
    const prev = i >= 0 ? b.sets[i]! : null;
    const from = prev ? prev.from : f.outcome === 'upgraded' ? (f.displaced ?? null) : null;
    const note: BatchSetNote = {
      setIndex: f.setIndex,
      setName: setName(f.setIndex),
      slot: f.item.slot,
      item: f.item,
      from,
      gain: from ? Math.round(score(f.item) - score(from)) : null,
    };
    if (prev) b.sets[i] = note;
    else b.sets.push(note);
  }
  return b;
}

/** Verse au récap une vente automatique de reliques en trop. */
export function noteRelicSale(b: BatchSummary, relics: number, gold: number): BatchSummary {
  b.relics += relics;
  b.relicGold += gold;
  return b;
}

/** Ajoute un lancer au récap (même objet, rendu pour chaîner). */
export function addToBatch(b: BatchSummary, r: BatchRunResult): BatchSummary {
  b.runs++;
  if (r.cleared) b.cleared++;
  else b.failed++;
  b.gold += r.gold;
  b.summonStones += r.summonStones ?? 0;
  b.talents += r.talentDrops?.length ?? 0;
  b.drops.push(...r.drops);
  if (r.firstClear) b.firstClear = true;
  return b;
}

/** Les objets du butin, regroupés par rareté, du plus rare au plus commun. */
export function dropsByRarity(
  drops: readonly Item[],
  order: readonly string[],
): { rarity: Item['rarity']; items: Item[] }[] {
  const by = new Map<Item['rarity'], Item[]>();
  for (const d of drops) by.set(d.rarity, [...(by.get(d.rarity) ?? []), d]);
  return [...by.entries()]
    .sort((a, b) => order.indexOf(b[0]) - order.indexOf(a[0]))
    .map(([rarity, items]) => ({ rarity, items }));
}
