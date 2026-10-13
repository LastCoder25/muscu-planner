/**
 * 📘 OUVRIR UN TOME D'EXPÉRIENCE SUR UN CHAMPION (2026-10-03, demandé : « des consommables qui
 * donnent de l'XP à un champion et son équipement »).
 *
 * ⚠️ AUCUNE RÈGLE NOUVELLE : l'XP passe par `grantAdvXp` (plafonds du Panthéon et de
 * l'ascension, excédent CONSERVÉ), et l'équipement porté apprend avec son porteur par
 * `trainWornGear`, côté store — exactement le chemin d'une mission. Un tome n'est qu'une
 * mission qu'on n'a pas eu à faire.
 */
import {
  advAscensionCap,
  advRank,
  advXpRoom,
  advXpToNext,
  grantAdvXp,
  type Adventurer,
} from './adventurers';
import { TOME_IDS, TOME_XP, type SupplyStock, type TomeId } from './supplies';

export interface TomeUse {
  after: Adventurer;
  /** L'XP bute sur un plafond (Panthéon ou ascension) : elle est GARDÉE pour plus tard,
   *  mais ne fait plus monter le champion tout de suite. L'écran le dit avant d'ouvrir. */
  banked: boolean;
  /** L'XP du tome PERDUE : le champion a rattrapé le héros (`advXpRoom`), il ne prend plus
   *  rien au-delà. Le tome entier perdu = l'ouvrir ne sert à rien (le store refuse). */
  lost: number;
}

/** Ce qu'ouvrir ce tome ferait à ce champion. */
export function openTome(
  adv: Adventurer,
  tome: TomeId,
  pantheonLevel: number,
  heroLevel: number,
): TomeUse {
  const xp = TOME_XP[tome];
  const after = grantAdvXp(adv, xp, pantheonLevel, heroLevel);
  const cap = Math.min(Math.max(1, pantheonLevel), advAscensionCap(adv));
  const lost = Math.max(0, xp - Math.min(xp, advXpRoom(adv, heroLevel)));
  return { after, banked: after.level >= cap && after.xp >= advXpToNext(after.level), lost };
}

/** 📘 Un tome du stock, tel que la fiche d'un champion le propose. */
export interface TomeChoice {
  id: TomeId;
  count: number;
  xp: number;
  /** Niveaux que le champion gagnerait. */
  levels: number;
  /** Étoiles gagnées (le niveau reste caché : c'est ce que l'écran annonce). Cran GLOBAL,
   *  jamais l'étoile seule : elle retombe de ★5 à ★1 au passage de rang. */
  stars: number;
  banked: boolean;
  /** XP perdue : il a rattrapé le héros. */
  lost: number;
}

/** Les tomes qu'on possède, chiffrés pour CE champion — du plus petit au plus gros. */
export function tomeChoices(
  stock: SupplyStock,
  adv: Adventurer,
  pantheonLevel: number,
  heroLevel: number,
): TomeChoice[] {
  const out: TomeChoice[] = [];
  for (const id of TOME_IDS) {
    const count = stock[id] ?? 0;
    if (count < 1) continue;
    const u = openTome(adv, id, pantheonLevel, heroLevel);
    out.push({
      id,
      count,
      xp: TOME_XP[id],
      levels: u.after.level - adv.level,
      stars: advRank(u.after).tier - advRank(adv).tier,
      banked: u.banked,
      lost: u.lost,
    });
  }
  return out;
}
