/**
 * 💰 LE REMBOURSEMENT DE LA BAISSE DES PRIX (v1.51, demandé par l'utilisateur : « rembourse-moi
 * un peu », pour tous les joueurs). Pur/testé.
 *
 * Le coût d'un cran de bâtiment et d'enceinte passe de `750 × L^1,9` à `560 × L^1,9`. Les crans
 * déjà payés l'ont été à l'ancien prix : chaque compte reçoit UNE fois `PRICE_REFUND_SHARE` de
 * l'écart, calculé sur ses niveaux ACTUELS (la pose d'un bâtiment n'a pas changé de prix).
 * ⚠️ Une approximation assumée : l'ancien prix a lui-même bougé au fil des versions (1400,
 * 1000, 900, 750) ; on ne reconstitue pas l'historique, on rend une part de l'écart d'AUJOURD'HUI.
 * Choix de l'utilisateur : ~7 M pour un compte niveau 37 (40 % de 17,2 M).
 */
import { BUILD, buildingUpgradeCost } from './buildings';

/** Le coefficient d'avant la baisse (`BUILD.upBase` jusqu'à la v1.50). */
export const OLD_UP_BASE = 750;
/** Part de l'écart rendue. */
export const PRICE_REFUND_SHARE = 0.4;
/** Version de la régularisation (`characters.price_refund`) : versée une fois par compte. */
export const PRICE_REFUND_VERSION = 1;

/** L'or rendu pour ces niveaux de structures (bâtiments ET enceinte). */
export function priceRefund(levels: readonly number[]): number {
  let diff = 0;
  for (const L of levels)
    for (let l = 1; l < L; l++)
      diff += Math.round(OLD_UP_BASE * Math.pow(l, BUILD.upExp)) - buildingUpgradeCost(l);
  return Math.max(0, Math.round(diff * PRICE_REFUND_SHARE));
}
