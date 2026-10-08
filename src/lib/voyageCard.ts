/**
 * 🧭 LA FICHE D'UN VOYAGE (demandé, 2026-10-08 : « quand je touche le tracé ou l'icône d'une
 * troupe sur la carte, un petit modal dans un coin avec les participants, si c'est une
 * attaque combinée, et les heures d'arrivée et de retour de chaque troupe »).
 *
 * Ce module ne fait que LIRE les horodatages d'un voyage (ceux que la carte dessine déjà :
 * `sentAt`, `midAt`, `returnAt`, `dwellMs`, `turnBack`). Il ne recalcule aucun trajet : la
 * fiche ne peut donc pas annoncer une autre heure que celle où la troupe arrivera vraiment.
 */

import type { HaulPill } from './expedition';

/** Ce qu'une troupe fait en ce moment. */
export type TroopState = 'waiting' | 'going' | 'there' | 'back' | 'turned' | 'done';

/** Les horodatages d'une troupe, tels que les porte son voyage. */
export interface TroopLeg {
  sentAt: number;
  /** La résolution sur place (arrivée + temps passé sur place). */
  midAt: number;
  returnAt: number;
  /** Le temps passé sur place avant la résolution (fouille, attente d'une attaque…). */
  dwellMs?: number;
  /** A rebroussé chemin : n'atteindra jamais le lieu. */
  turnBack?: number;
  /** Aller simple (un renfort reste sur le lieu, un retour s'arrête à la base). */
  oneWay?: boolean;
}

export interface TroopTimes {
  state: TroopState;
  /** Départ encore à venir (troupe en attente), sinon `null`. */
  departAt: number | null;
  /** Arrivée sur le lieu, `null` si elle n'y arrivera pas (demi-tour). */
  arriveAt: number | null;
  /** Retour chez elle, `null` pour un aller simple. */
  returnAt: number | null;
}

/** 🧭 Les heures d'une troupe et ce qu'elle fait à `now`. */
export function troopTimes(v: TroopLeg, now: number): TroopTimes {
  const turned = v.turnBack !== undefined;
  const arriveAt = turned ? null : v.midAt - Math.max(0, v.dwellMs ?? 0);
  const returnAt = v.oneWay ? null : v.returnAt;
  const end = v.oneWay ? v.midAt : v.returnAt;
  const state: TroopState =
    now < v.sentAt
      ? 'waiting'
      : now >= end
        ? 'done'
        : turned
          ? 'turned'
          : now < arriveAt!
            ? 'going'
            : now < v.midAt
              ? 'there'
              : 'back';
  return { state, departAt: now < v.sentAt ? v.sentAt : null, arriveAt, returnAt };
}

export const TROOP_STATE_LABEL: Record<TroopState, string> = {
  waiting: '⏳ attend son départ',
  going: '🚶 en route',
  there: '📍 sur place',
  back: '↩ sur le retour',
  turned: '🔙 a fait demi-tour',
  done: '✓ arrivée',
};

/** 🧭 Une troupe de la fiche : d'où elle part, qui voyage, et ses horodatages. */
export interface VoyageCardTroop {
  key: string;
  emo: string;
  label: string;
  /** D'où elle part (la base, le village, un lieu tenu). */
  from: string;
  hero: boolean;
  champs: { id: string; name: string; championId: string | null; emoji: string }[];
  militia: number;
  /** Un renfort reste sur le lieu (aller simple). */
  stays?: boolean;
  leg: TroopLeg;
}
export interface VoyageCardData {
  title: string;
  place: string;
  combined: boolean;
  troops: VoyageCardTroop[];
  /** Ce que le voyage ramène (`haulPills`), vide pour un renfort ou un retour. */
  haul: HaulPill[];
}
