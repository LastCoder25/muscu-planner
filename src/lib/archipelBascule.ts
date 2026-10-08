/**
 * 🏝️ ÉTAPE 7 DE LA ROADMAP — LA BASCULE DE TOUS LES COMPTES SUR L'ARCHIPEL
 * (`docs/superpowers/plans/2026-10-01-carte-archipel-roadmap.md`, règle 12).
 *
 * Décisions de l'utilisateur (2026-10-03) :
 * - **tout le monde repart de l'île 1** ; bâtiments conservés (rien à faire : ils ne vivent pas
 *   sur la carte) ;
 * - **les lieux fixes tenus qui existent sur l'île 1** (mine, source de mana, jardin,
 *   scriptorium) **restent tenus** — ils produisent désormais au rang de l'île ;
 * - **les autres** (camp d'entraînement, tour de guet) sont rendus : la production en réserve
 *   est récoltée et la garnison rentre (le store le fait déjà au tick suivant, `retiredHeld`),
 *   et chacun est **compensé de 2 jours de production en or**, garnison pleine, à son rang.
 *
 * ⚠️ Idempotent par construction : la bascule pose `archipel` sur la carte DANS LA MÊME
 * écriture que le coffre de compensation ; une carte qui porte `archipel` ne bascule plus.
 */
import { archipelOn } from './archipelago';
import { controlGoldPerHour, controlKindsOf, seatsOf } from './controlPoints';
import {
  RAZE_KINDS,
  type ControlKind,
  type ExpeditionMap,
  type ExpeditionMessage,
  type Poi,
} from './expedition';

export const BASCULE = {
  /** 2 jours de production par lieu rendu (décision de l'utilisateur). */
  compensationHours: 48,
  /** L'id du coffre de compensation : un seul par compte. */
  messageId: 'archipel_bascule',
} as const;

export interface BasculeRefund {
  id: string;
  kind: ControlKind;
  level: number;
  gold: number;
}

/** 🪙 La compensation d'un lieu rendu : 2 jours de l'or d'une mine de son rang, garnison
 *  pleine (`controlGoldPerHour`, la règle de production du jeu). */
export function basculeRefundGold(p: Pick<Poi, 'id' | 'level'>, kind: ControlKind): number {
  // Les lieux rendus produisent pour le joueur : leurs places sont finies (3 au camp, 5 sinon).
  return Math.round(controlGoldPerHour(p, seatsOf(kind), p.level) * BASCULE.compensationHours);
}

/** Les lieux TENUS qui n'existent pas sur l'île 1 : ceux qu'on rend et qu'on compense. */
export function basculeRefunds(map: ExpeditionMap): BasculeRefund[] {
  const kinds = controlKindsOf({ archipel: archipelOn(1) });
  return map.pois
    .filter(
      (p) =>
        p.control?.owner === 'player' &&
        !RAZE_KINDS.has(p.control.kind) &&
        !kinds.includes(p.control.kind),
    )
    .map((p) => ({
      id: p.id,
      kind: p.control!.kind,
      level: p.level,
      gold: basculeRefundGold(p, p.control!.kind),
    }));
}

/** Le coffre de compensation, déposé dans la boîte (rien s'il n'y a rien à rendre). */
function basculeMessage(refunds: BasculeRefund[], at: number): ExpeditionMessage | null {
  const gold = refunds.reduce((s, r) => s + r.gold, 0);
  if (gold <= 0) return null;
  return {
    id: BASCULE.messageId,
    chest: true,
    title: '🏝️ Bienvenue dans l’archipel',
    level: 1,
    win: true,
    text:
      `La carte devient un archipel : tu repars de l’île 1. ` +
      `${refunds.length} lieu${refunds.length > 1 ? 'x' : ''} tenu${refunds.length > 1 ? 's' : ''} ` +
      `n’exist${refunds.length > 1 ? 'ent' : 'e'} pas sur cette île : ta garnison rentre, et voici ` +
      `2 jours de leur production.`,
    gold,
    energy: 0,
    key: 0,
    resolvedAt: at,
    claimAt: at,
    claimed: false,
    read: false,
  };
}

/**
 * 🏝️ Bascule une carte classique sur l'île 1. Rend `null` si elle y est déjà (rien à écrire).
 * Les lieux rendus ne sont PAS retirés ici : le store rappelle leur garnison (récolte comprise)
 * puis `ensureControls` les retire — le même chemin que l'interrupteur admin d'avant.
 */
export function basculeToArchipel(
  map: ExpeditionMap,
  at: number,
): { map: ExpeditionMap; message: ExpeditionMessage | null; refunds: BasculeRefund[] } | null {
  if (map.archipel) return null;
  const refunds = basculeRefunds(map);
  return {
    map: { ...map, archipel: archipelOn(1) },
    message: basculeMessage(refunds, at),
    refunds,
  };
}
