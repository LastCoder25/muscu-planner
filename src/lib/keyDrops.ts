/**
 * 🗝️ LES CLÉS DU LABYRINTHE QUI TOMBENT EN DONJON ET SUR LES BOSS (v1.8.19).
 *
 * Depuis que les paliers profonds coûtent plusieurs clés (`labyKeyCost` : 1/1/1/2/2/2/3/3/3/4),
 * une clé brute ne valait plus qu'un tiers ou un quart d'entrée en fin de partie. Une clé
 * tombée se compte donc en RUNS du palier du niveau du contenu (`labyKeyPriceAt`) : un donjon
 * ou un boss de niveau 80 en rend 3. Les CHANCES ne bougent pas (rares par décision : les
 * gros volumes de runs inondaient les clés, 2026‑08‑18).
 */
import { DUNGEONS } from '../data/dungeons';
import { BOSSES } from '../data/bosses';
import { labyKeyPriceAt } from '../data/labyrinths';

/** ~2 % sur un donjon NETTOYÉ. */
export const DUNGEON_KEY_CHANCE = 0.02;
/** ~6 % sur un boss vaincu à nouveau (la 1re victoire est garantie). */
const BOSS_KEY_CHANCE = 0.06;

/** Clés d'un donjon nettoyé, `roll` ∈ [0, 1[. Un id inconnu compte au premier palier. */
export function dungeonKeyDrop(dungeonId: string, roll: number): number {
  if (roll >= DUNGEON_KEY_CHANCE) return 0;
  const d = DUNGEONS.find((x) => x.id === dungeonId);
  return labyKeyPriceAt(d?.recoLevel ?? 1);
}

/** Clés d'un boss de palier : garanties à la 1re victoire, rares ensuite, rien sur une défaite. */
export function bossKeyDrop(
  bossId: string,
  firstDefeat: boolean,
  defeated: boolean,
  roll: number,
): number {
  if (!defeated || (!firstDefeat && roll >= BOSS_KEY_CHANCE)) return 0;
  const b = BOSSES.find((x) => x.id === bossId);
  return labyKeyPriceAt(b?.unlockLevel ?? 1);
}
