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

/** Paliers proposés avant « Max ». */
export const BATCH_STEPS = [5, 10] as const;
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
  };
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
