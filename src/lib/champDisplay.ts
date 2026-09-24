// 🏅 L'ÉCHELLE D'AFFICHAGE DES CHAMPIONS (v0.1136 ; demandé : « que ça fasse de l'effet de
// les up et de up les items, même si c'est juste à l'affichage — bien moins que le héros »).
//
// ⚠️ AFFICHAGE SEUL — aucune règle de jeu ne lit ces valeurs.
//
// ⚠️ UN FACTEUR FIXE NE MARCHE PAS, et c'est mesuré. Un champion de référence vaut ⚔️ 26 au
// niveau 10 et 1 705 au niveau 80 ; le héros équipé 173 et 327 315. L'écart grandit de ×7 à
// ×190 : un ×10 fixe mettait les champions AU-DESSUS du héros avant le niveau ~15, et restait
// dérisoire en fin de partie. L'échelle suit donc le NIVEAU DU JOUEUR : un champion à ton
// niveau s'affiche à `CHAMP_SHOW_SHARE` (40 %) de la puissance du héros NU à ce niveau — donc
// bien en dessous du héros équipé, qui est celui que l'Aventure affiche.
//
// ⚠️ LE FACTEUR DÉPEND DU JOUEUR, PAS DU CHAMPION : tout le vivier est lu à la même échelle, donc
// l'ordre, les écarts et le gain d'une pièce restent comparables d'un champion à l'autre (un
// facteur par niveau de champion ferait qu'un chiffre plus grand ne voudrait plus dire « plus
// fort »). Plancher à 1 : en tout début de partie on n'affiche jamais MOINS que la vraie valeur.
//
// ⚠️ UNE SEULE ÉCHELLE pour la puissance, les stats 💪❤️⚡ et ce qu'une pièce apporte : une pièce
// qui annonce « ⚔️ +48 » doit se retrouver dans le « ⚔️ » de son porteur.

import { combatPower, fmtDelta, fmtPow, type Combatant } from './combat';
import { advGearMult, type AdvGear } from './advGear';
import { effectLabelFor, round1 } from './items';
import { refChampionAdv } from './caravan';
import { refFighter } from './proceduralContent';
import { adventurerPowers } from './raid';

export const CHAMP_SHOW_SHARE = 0.4;

let kTable: number[] | null = null;

/** Le facteur BRUT d'un niveau : 40 % du héros nu ÷ le champion de référence. */
function rawK(L: number): number {
  const ref = refChampionAdv(L);
  const champ = adventurerPowers([ref]).get(ref.id) ?? 1;
  return (CHAMP_SHOW_SHARE * combatPower(refFighter(L))) / Math.max(1e-9, champ);
}

/** Le facteur d'affichage des champions pour un joueur de ce niveau.
 *  ⚠️ TOUJOURS CROISSANT (max cumulé) : le facteur brut fléchit de ~3 % à certains passages
 *  de rang (le champion de référence y prend son bonus d'ascension) — sans ce max, gagner un
 *  niveau ferait BAISSER tous les chiffres du vivier. Table calculée une fois (pure). */
export function champShowK(playerLevel: number): number {
  if (!kTable) {
    kTable = [];
    let best = 1;
    for (let L = 1; L <= 100; L++) {
      best = Math.max(best, rawK(L));
      kTable[L] = best;
    }
  }
  const L = Math.max(1, Math.min(100, Math.round(playerLevel || 1)));
  return kTable[L]!;
}

/** La puissance d'un champion, formatée à l'échelle `k`. */
export function fmtChampPow(n: number, k: number): string {
  return fmtPow(n * k);
}

/** L'écart signé entre deux puissances de champion, à l'échelle `k`. */
export function fmtChampDelta(cur: number, next: number, k: number): string {
  return fmtDelta(cur * k, next * k);
}

/** Une stat 💪❤️⚡ de champion, arrondie après l'échelle. */
export function champStat(n: number, k: number): number {
  return Math.round(n * k);
}

/**
 * 🗡️ LES STATS D'UNE PIÈCE EN VALEUR RÉELLE (v0.1135 ; demandé : « +1 %, c'est ridicule —
 * pas possible d'avoir de vraies stats ? »). AFFICHAGE SEUL.
 *
 * Les dégâts et les PV s'affichent en ce qu'ils AJOUTENT au champion : « +52 dégâts » plutôt
 * que « +1,4 % dégâts » — la part appliquée à SES dégâts / PV de base (`base`, son combattant
 * SANS équipement : c'est sur lui que le pourcentage s'applique), à l'échelle d'affichage `k`,
 * comme sa puissance. ⚠️ La valeur de la pièce vient de `advGearMult`, le multiplicateur que
 * le COMBAT applique (niveau d'objet × éveil) : l'écran ne peut pas annoncer autre chose.
 *
 * ⚠️ Le critique, la réduction de dégâts et les stats conditionnelles (exécution, élan, épines,
 * vol de vie) RESTENT en % : ce sont des chances ou des parts, les convertir en points serait
 * inventer une unité.
 */
export function realGearTexts(
  g: Pick<AdvGear, 'effect' | 'effect2' | 'level' | 'awaken'>,
  base: Pick<Combatant, 'damage' | 'pv'>,
  k: number,
): string[] {
  const m = advGearMult(g);
  const one = (e: { type: AdvGear['effect']['type']; value: number }) => {
    const v = (e.value * m) / 100;
    if (e.type === 'damage_pct') return `+${fmtPow(base.damage * v * k)} dégâts`;
    if (e.type === 'max_pv_pct') return `+${fmtPow(base.pv * v * k)} PV`;
    return effectLabelFor(e.type, round1(e.value * m));
  };
  const out = [one(g.effect)];
  if (g.effect2) out.push(one(g.effect2));
  return out;
}
