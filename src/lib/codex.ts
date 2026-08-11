// codex.ts — MÉTA DE COLLECTION de l'Aventure (pur/testé). Donne une carotte long
// terme (« je veux tout débloquer ») : bestiaire des monstres vaincus + journal des
// sets d'équipement. Tout est DÉRIVÉ de l'état existant (donjons nettoyés / boss
// vaincus / équipement) → aucune colonne DB en plus. N'affecte ni combat ni drops.
import { MONSTERS } from '@/data/monsters';
import { DUNGEONS } from '@/data/dungeons';
import { BOSSES } from '@/data/bosses';
import { ITEM_SETS, SLOTS, type Equipped, type Item, type ItemSet } from './items';

/** Monstres « vaincus » = tous ceux des donjons NETTOYÉS (clear = tous tués). */
export function discoveredMonsterIds(clearedDungeonIds: string[]): Set<string> {
  const cleared = new Set(clearedDungeonIds);
  const out = new Set<string>();
  for (const d of DUNGEONS) if (cleared.has(d.id)) for (const mid of d.monsterIds) out.add(mid);
  return out;
}

export interface BestiaryEntry {
  id: string;
  name: string;
  emoji: string;
  tier: number;
  discovered: boolean;
}

/** Bestiaire complet (ordonné par tier), chaque monstre marqué découvert ou non. */
export function bestiary(clearedDungeonIds: string[]): BestiaryEntry[] {
  const seen = discoveredMonsterIds(clearedDungeonIds);
  return [...MONSTERS]
    .sort((a, b) => a.tier - b.tier)
    .map((m) => ({
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      tier: m.tier,
      discovered: seen.has(m.id),
    }));
}

export interface SetCollectionEntry {
  set: ItemSet;
  owned: number; // slots distincts possédés (équipé + sac), max 4
  total: number; // 4
  complete: boolean; // 4/4
  bossId: string | undefined; // boss source (pour le hint de déblocage)
  bossDefeated: boolean; // le boss source a-t-il été vaincu ?
}

/** Journal des sets : pièces possédées par set (slots distincts) + état du boss source. */
export function setCollection(
  equipped: Equipped,
  inventory: Item[],
  defeatedBossIds: string[],
): SetCollectionEntry[] {
  const defeated = new Set(defeatedBossIds);
  const all: Item[] = [...SLOTS.map((s) => equipped[s]).filter((i): i is Item => !!i), ...inventory];
  return ITEM_SETS.map((set) => {
    const slotsOwned = new Set<string>();
    for (const it of all) if (it.setId === set.id) slotsOwned.add(it.slot);
    const owned = Math.min(4, slotsOwned.size);
    const boss = BOSSES.find((b) => b.setId === set.id);
    return {
      set,
      owned,
      total: 4,
      complete: owned >= 4,
      bossId: boss?.id,
      bossDefeated: boss ? defeated.has(boss.id) : false,
    };
  });
}

export interface CodexSummary {
  monstersFound: number;
  monstersTotal: number;
  setsComplete: number;
  setsTotal: number;
}

/** Résumé chiffré pour le bouton/entrée du codex. */
export function codexSummary(
  clearedDungeonIds: string[],
  equipped: Equipped,
  inventory: Item[],
  defeatedBossIds: string[],
): CodexSummary {
  const b = bestiary(clearedDungeonIds);
  const sets = setCollection(equipped, inventory, defeatedBossIds);
  return {
    monstersFound: b.filter((e) => e.discovered).length,
    monstersTotal: b.length,
    setsComplete: sets.filter((s) => s.complete).length,
    setsTotal: sets.length,
  };
}
