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
import type { BuildingTypeId } from './buildings';

export const SPORT_TICKETS = {
  /** Tickets d'un 360 « moyen » (facteur d'effort 1, ~76 séries). ⚠️ Multiplié par le MÊME
   *  facteur que le coffre (`chestEffortMult`, borné 0,7 → 1,5) : 2 tickets pour un 360
   *  posé, 3 pour un 360 moyen, 5 pour un avancé intense. */
  comboRef: 3,
  /** Tickets par niveau global gagné. */
  perLevel: 1,
} as const;

/** 🛕 TICKETS DE BIENVENUE — versés UNE fois, à la construction du Panthéon (v0.1079,
 *  demandé par l'utilisateur : « on donne 10 tickets au début ? »).
 *
 *  Mesuré sur la base : AUCUN joueur n'avait de ticket, et un débutant n'avait pour tirer
 *  que ses 110 💠 quotidiens — la boucle des champions restait invisible. ⚠️ À la
 *  CONSTRUCTION, pas à la création du compte : c'est le moment où ils servent, et le
 *  Panthéon étant `unique`, ils ne peuvent tomber qu'une fois. Dix tickets = un lot ×10
 *  (9 payés) + 1, donc au moins un épique garanti par le plancher. Hors bande de débit du
 *  gacha : c'est un versement ponctuel, pas un robinet. */
export const WELCOME_TICKETS = 10;

/** Tickets versés en construisant le bâtiment `typeId` (0 pour tout autre que le Panthéon). */
export function buildTickets(typeId: BuildingTypeId): number {
  return typeId === 'pantheon' ? WELCOME_TICKETS : 0;
}

/** 🎟️ RATTRAPAGE — tickets dus à un compte QUI A DÉJÀ SON PANTHÉON (v0.1081, décision de
 *  l'utilisateur).
 *
 *  ⚠️ Mesuré en base : versés à la seule CONSTRUCTION, les deux comptes les plus avancés
 *  ne pouvaient jamais les recevoir — ils avaient bâti leur Panthéon avant la règle. Le
 *  rattrapage les leur donne UNE fois, au chargement.
 *
 *  ⚠️ **LA MARQUE (`welcomed`) EST LA SEULE GARANTIE D'UNICITÉ**, et elle est posée par les
 *  DEUX chemins (pose et rattrapage) dans la même écriture que les tickets : sans elle, le
 *  rattrapage repasserait à chaque ouverture. Pas de Panthéon → rien, et rien n'est marqué :
 *  le joueur les recevra en le construisant. */
export function welcomeTicketsDue(hasPantheon: boolean, welcomed: boolean): number {
  return hasPantheon && !welcomed ? WELCOME_TICKETS : 0;
}

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

/**
 * Comment payer ce tirage ? ⚠️ **LES TICKETS D'ABORD** : ils n'ont pas d'autre usage, alors
 * que la mana en aura. Un ticket vaut UN tirage payé ; s'il en manque, le reste se paie en
 * mana au tarif d'un tirage — tickets et mana se COMBINENT (v0.1108, demandé par
 * l'utilisateur). ⚠️ Le lot garde sa remise dans tous les cas : il coûte `multiPaid` tirages
 * payés (9), jamais 10 — donc au plus 9 tickets, même avec 10 en poche.
 * `null` = même combinés, tickets et mana ne suffisent pas.
 */
export function pullPayment(
  count: number,
  wallet: { tickets: number; mana: number },
): { tickets: number; mana: number } | null {
  const paid = ticketCost(count);
  const tickets = Math.max(0, Math.min(Math.floor(wallet.tickets), paid));
  const mana = (paid - tickets) * GACHA.pullCost;
  return wallet.mana >= mana ? { tickets, mana } : null;
}
