// ⚙️ AUTOMATISATION des montées (v1.321.0 ; demandé par l'utilisateur : « dans les
// paramétrages sous la base, des réglages pour up automatiquement les champions et les
// items ; up les items relance le rééquipement automatique »). PUR : choisit CE QUI monte,
// n'écrit rien — le store garde les écritures et leurs refus (`ascendChampion`, `ascendGear`).
import { ascensionBlocker, gearAscentOffer, type Seals } from '@/lib/ascension';
import type { Adventurer } from '@/lib/adventurers';
import type { AdvGear } from '@/lib/advGear';

export interface AutoUpSettings {
  /** ⬆️ Ascension des champions dès qu'ils sont ★5 et que sceaux + or + Panthéon suivent. */
  champions: boolean;
  /** ⬆️ Ascension des pièces d'équipement, mêmes conditions — suivie du rééquipement. */
  gear: boolean;
  /** ✨ Éveil par fusion des doublons de pièces — équipe d'abord au mieux, fond ensuite. */
  merge: boolean;
}

export const AUTO_UP_DEFAULT: AutoUpSettings = { champions: false, gear: false, merge: false };
export const AUTO_UP_KEY = 'muscu:autoup';

/** Relecture défensive : une valeur absente ou malformée = interrupteur éteint (on ne dépense
 *  jamais l'or du joueur sur la foi d'un JSON illisible). */
export function parseAutoUp(raw: string | null | undefined): AutoUpSettings {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<Record<keyof AutoUpSettings, unknown>>) : {};
    return {
      champions: o.champions === true,
      gear: o.gear === true,
      merge: o.merge === true,
    };
  } catch {
    return { ...AUTO_UP_DEFAULT };
  }
}

export const anyAutoUp = (s: AutoUpSettings): boolean => s.champions || s.gear || s.merge;

/** Le PREMIER champion dont l'ascension est permise MAINTENANT (`ascensionBlocker` est la
 *  règle du bouton et du store : aucune règle recopiée ici), ou `null`. */
export function nextChampionToAscend(
  advs: readonly Adventurer[],
  ctx: { pantheonLevel: number; seals: Seals; gold: number },
): Adventurer | null {
  return advs.find((a) => ascensionBlocker(a, ctx) === null) ?? null;
}

/** La première PIÈCE dont l'ascension est permise maintenant, ou `null`. Même source que
 *  le bouton de la Guilde (`gearAscentOffer`). */
export function nextGearToAscend(
  stock: readonly AdvGear[],
  ctx: { advs: readonly Adventurer[]; seals: Seals; gold: number },
): AdvGear | null {
  return (
    stock.find((g) => {
      const o = gearAscentOffer(g, { advs: ctx.advs, stock, seals: ctx.seals, gold: ctx.gold });
      return !!o && o.block === null;
    }) ?? null
  );
}
