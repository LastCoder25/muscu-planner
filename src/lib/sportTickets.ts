/**
 * 🎟️ TICKETS D'INVOCATION — LE SPORT ALIMENTE LE GACHA (v0.992, demandé par l'utilisateur :
 * « je veux que le sport alimente le gacha »).
 *
 * Deux monnaies, comme tous les gachas : les **pierres de mana 💠** se gagnent en JOUANT
 * (failles, mines de mana), les **tickets 🎟️** se gagnent UNIQUEMENT par le SPORT. Un ticket
 * vaut un tirage.
 *
 * ## ⚠️ ON PAIE DES ÉTAPES FRANCHIES, JAMAIS LE VOLUME
 *
 * Le volume est déjà payé en XP et en énergie ; le repayer, c'est l'erreur de la v0.769
 * (+24 100 XP d'un coup pour un défi de marche). Une étape se plafonne d'elle-même et se lit
 * sans notice (« ta semaine t'a rapporté 3 tirages »). D'où trois sources, pesées selon ce
 * qu'elles demandent :
 *
 *  - **🎯 Défi 360 bouclé dans les temps** — l'effort d'une SEMAINE entière. 2 à 5 tickets
 *    selon les séries réellement comptées (le même facteur d'effort que son coffre).
 *  - **🐉 Boss entre amis abattu** — 0 à 4 selon le cran. ⚠️ **L'Échauffement ne paie
 *    RIEN**, et c'est délibéré : c'est le cran qu'on enchaînerait pour farmer (30 pompes par
 *    personne, pour un seul jeton de boss).
 *  - **⭐ Niveau global gagné** — 1 par niveau. Le niveau global EST le sport (XP de fond),
 *    et il ralentit naturellement en montant : pas de plafond à écrire.
 *
 * ⚠️ **LES CHALLENGES N'EN DONNENT PAS** (choix de l'utilisateur) : on en tient plusieurs à
 * la fois, et chaque journée compterait — c'est exactement le volume qu'on ne veut pas payer.
 *
 * ## CE QUE ÇA COÛTE AU RYTHME DU GACHA — mesuré, cf. `sportTickets.test.ts`
 *
 * Un joueur régulier (un 360 par semaine, un boss Sérieux par semaine, ~1,5 niveau par
 * semaine) gagne ~5,5 tickets/semaine, soit **~290 tirages par an de plus**. Le test
 * verrouille que ce joueur reste dans la bande « 10 à 20 S par an » que la spec du gacha
 * vise sur la plage réaliste (niveaux 12 à 60).
 */

import { GACHA } from './gacha';

export const SPORT_TICKETS = {
  /** Tickets d'un 360 « moyen » (facteur d'effort 1, ~76 séries). ⚠️ Multiplié par le MÊME
   *  facteur que le coffre (`chestEffortMult`, borné 0,7 → 1,5) : 2 tickets pour un 360
   *  posé, 3 pour un 360 moyen, 5 pour un avancé intense. */
  comboRef: 3,
  /** Tickets par niveau global gagné. */
  perLevel: 1,
} as const;

/** 🎯 Tickets d'un Défi 360 bouclé, pour un facteur d'effort donné. */
export function comboTickets(effortMult: number): number {
  return Math.max(0, Math.round(SPORT_TICKETS.comboRef * Math.max(0, effortMult)));
}

/** ⭐ Tickets pour les niveaux franchis de `from` (exclu) à `to` (inclus). */
export function levelUpTickets(from: number, to: number): number {
  return Math.max(0, Math.floor(to) - Math.floor(from)) * SPORT_TICKETS.perLevel;
}

/** Prix d'un tirage en tickets. ⚠️ Un ticket compte comme un tirage PAYÉ : le lot garde sa
 *  remise (9 payés pour 10), sinon payer en tickets serait moins bon qu'en mana. */
export function ticketCost(count: number): number {
  return count > 1 ? GACHA.multiPaid : 1;
}

/** Prix d'un tirage en mana — le même que le store applique. */
function manaCost(count: number): number {
  return count > 1 ? GACHA.multiPaid * GACHA.pullCost : GACHA.pullCost;
}

/**
 * Comment payer ce tirage ? ⚠️ **LES TICKETS D'ABORD** quand ils couvrent le prix : ils n'ont
 * pas d'autre usage, alors que la mana en aura (élévation des champions, à venir). Jamais de
 * paiement MIXTE — on sait toujours ce qu'on dépense. `null` = ni l'un ni l'autre ne suffit.
 */
export function pullPayment(
  count: number,
  wallet: { tickets: number; mana: number },
): { kind: 'tickets' | 'mana'; cost: number } | null {
  const t = ticketCost(count);
  if (wallet.tickets >= t) return { kind: 'tickets', cost: t };
  const m = manaCost(count);
  if (wallet.mana >= m) return { kind: 'mana', cost: m };
  return null;
}
