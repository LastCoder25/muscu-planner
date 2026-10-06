/**
 * ⚡ LES BOOSTS DE VITESSE (2026-09-30, demandé : « des boosts de vitesse d'expédition en
 * minutes, 5 min, 10 min, 15 min, 30 min, 1 h »). Un consommable (`BOOST_MIN`, supplies.ts)
 * utilisé sur un voyage EN COURS : son ÉTAPE EN COURS finit plus tôt.
 *
 * - À l'ALLER, l'arrivée (et le rapport) avancent de ce qui reste de l'aller au plus, le retour
 *   avec elle ; ce que l'aller n'absorbe pas RACCOURCIT LE RETOUR (2026-10-04, signalé : « si
 *   l'aller fait 3 min et que je veux accélérer de 5 min, il faut appliquer le reste sur le
 *   retour »).
 * - Au RETOUR, seul le retour en ville avance.
 * - Sur place (fouille en cours), rien ne bouge : il n'y a pas de route à raccourcir.
 *
 * ⚠️ MINUTES PERDUES : seulement ce qui dépasse TOUT le trajet restant (aller + retour, ou retour
 * seul). L'écran l'annonce AVANT de valider (`lostMs`).
 * ⚠️ PLUSIEURS BOOSTS AUTORISÉS sur un même voyage (décision de l'utilisateur).
 *
 * ⚔️🧭 ATTAQUE COMBINÉE (option B, décision de l'utilisateur) : le boost s'applique à TOUTE
 * l'attaque, qui arrive X plus tôt. Les groupes en route voient leur trajet restant raccourci
 * de X ; ceux qui attendent partent X plus tôt — si leur départ était dans moins de X, ils
 * partent tout de suite et le reste est pris sur leur trajet. Tous gardent la même arrivée :
 * personne ne double personne. Une fois tous partis, les groupes sont des voyages liés
 * (`combinedSiblings`) : un boost à l'aller les avance tous ensemble.
 *
 * ⚔️ VERS UNE ARMÉE EN MARCHE (`warband`, 2026-10-06, décision de l'utilisateur : « des
 * champions trop lents doivent pouvoir la rattraper grâce aux boosts ») : autorisé, et le point
 * de rencontre est RECALCULÉ (`reMeet`, party.ts) — là où l'armée sera à la nouvelle heure
 * d'arrivée. ⚠️ Pas une attaque combinée qui attend encore ses groupes (`attackBoostPlan`) :
 * son heure de rencontre est commune et figée ; une fois tous partis, ses voyages se pressent.
 */
import type { ActiveExpedition } from './expedition';
import type { CombinedAttack } from './combinedAttack';
import { BOOST_IDS, BOOST_MIN, type BoostId, type SupplyStock } from './supplies';

export type BoostBlock = 'onSite' | 'done' | 'intercept';
export const BOOST_BLOCK_LABEL: Record<BoostBlock, string> = {
  onSite: 'l’équipe est sur place : il n’y a pas de route à raccourcir',
  done: 'ce voyage est terminé',
  intercept: 'on ne presse pas une interception : l’armée ne serait pas au rendez-vous',
};

export interface BoostPlan {
  phase: 'go' | 'back';
  /** L'arrivée avance de tant (0 au retour). */
  goMs: number;
  /** Le RETOUR raccourcit de tant, en plus : le reste d'un boost que l'aller n'absorbe pas
   *  (« si l'aller fait 3 min et que j'accélère de 5 min, le reste va sur le retour »), ou tout
   *  le gain au retour. */
  backMs: number;
  /** Ce que le voyage gagne vraiment. */
  gainMs: number;
  /** Les minutes du boost qui ne servent à rien (l'étape finit avant). */
  lostMs: number;
}

type Timed = Pick<ActiveExpedition, 'poi' | 'midAt' | 'returnAt' | 'dwellMs'>;

/** Ce qu'un boost de `minutes` ferait sur ce voyage, ou pourquoi il ne ferait rien. */
export function voyageBoostPlan(v: Timed, minutes: number, now: number): BoostPlan | BoostBlock {
  const boost = Math.max(0, minutes) * 60_000;
  const arriveAt = v.midAt - Math.max(0, v.dwellMs ?? 0);
  if (now < arriveAt) {
    const goMs = Math.min(boost, arriveAt - now);
    const backMs = Math.min(boost - goMs, Math.max(0, v.returnAt - v.midAt));
    return { phase: 'go', gainMs: goMs + backMs, goMs, backMs, lostMs: boost - goMs - backMs };
  }
  if (now < v.midAt) return 'onSite';
  if (now >= v.returnAt) return 'done';
  const backMs = Math.min(boost, v.returnAt - now);
  return { phase: 'back', gainMs: backMs, goMs: 0, backMs, lostMs: boost - backMs };
}

/** Le voyage accéléré selon `plan`. ⚠️ `sentAt` ne bouge pas : l'aller dure moins, le tracé
 *  va plus vite. Même référence si le gain est nul. */
export function boostVoyage<
  T extends Pick<ActiveExpedition, 'midAt' | 'returnAt'> & {
    returnLegs?: { won: number; lost: number };
  },
>(v: T, plan: Pick<BoostPlan, 'phase' | 'goMs' | 'backMs'>): T {
  // Le raccourci du retour est borné par CE retour (un groupe lié peut en avoir un plus court).
  const go = plan.phase === 'go' ? Math.max(0, plan.goMs) : 0;
  const back = Math.min(Math.max(0, plan.backMs), Math.max(0, v.returnAt - v.midAt));
  if (go + back <= 0) return v;
  const out = { ...v, midAt: v.midAt - go, returnAt: v.returnAt - go - back };
  // ⚠️ Les retours d'un assaut sont RECALCULÉS à l'arrivée (`shortenWonReturn`) : sans les
  // raccourcir aussi, le raccourci serait écrasé.
  if (back > 0 && v.returnLegs) {
    const cut = back / 60_000;
    out.returnLegs = {
      won: Math.max(0, v.returnLegs.won - cut),
      lost: Math.max(0, v.returnLegs.lost - cut),
    };
  }
  return out;
}

/** ⚔️🧭 Les groupes d'une MÊME attaque combinée déjà partie : même lieu, même graine, même
 *  rapport (`midAt`), et chacun porte son `crew`. Un voyage ordinaire n'en a aucun. */
export function combinedSiblings<
  T extends Pick<ActiveExpedition, 'poi' | 'seed' | 'midAt' | 'crew'>,
>(v: T, all: readonly T[]): T[] {
  if (!v.crew) return [];
  return all.filter(
    (x) => x !== v && !!x.crew && x.seed === v.seed && x.midAt === v.midAt && x.poi.id === v.poi.id,
  );
}

/** ⚔️🧭 Ce qu'un boost ferait sur une attaque combinée qui n'est pas encore toute partie. */
export function attackBoostPlan(
  a: Pick<CombinedAttack, 'poi' | 'arriveAt' | 'midAt' | 'wings'>,
  minutes: number,
  now: number,
): BoostPlan | BoostBlock {
  const boost = Math.max(0, minutes) * 60_000;
  if (now >= a.arriveAt) return 'onSite';
  if (a.poi.type === 'warband') return 'intercept';
  const goMs = Math.min(boost, a.arriveAt - now);
  // Le reste raccourcit les retours, jusqu'au plus long d'entre eux.
  const longest = Math.max(
    0,
    ...a.wings.filter((w) => w.state !== 'dropped').map((w) => w.returnAt - a.midAt),
  );
  const backMs = Math.min(boost - goMs, longest);
  return { phase: 'go', gainMs: goMs + backMs, goMs, backMs, lostMs: boost - goMs - backMs };
}

/**
 * ⚔️🧭 L'attaque qui arrive `gainMs` plus tôt (option B). Rend aussi, par groupe, l'ancien et
 * le nouveau retour : les champions réservés (`busyUntil` = le retour de leur groupe, que
 * `wingDeparture` exige à l'identique) doivent suivre.
 */
export function boostAttack(
  a: CombinedAttack,
  plan: Pick<BoostPlan, 'goMs' | 'backMs'>,
  now: number,
): { attack: CombinedAttack; moved: { members: string[]; from: number; to: number }[] } {
  const gainMs = Math.max(0, plan.goMs);
  if (gainMs + Math.max(0, plan.backMs) <= 0) return { attack: a, moved: [] };
  const moved: { members: string[]; from: number; to: number }[] = [];
  const wings = a.wings.map((w) => {
    if (w.state === 'dropped') return w;
    // Le reste du boost raccourcit SON retour, au plus de sa durée ; noté (`backCutMs`) pour que
    // le retour recalculé à son départ (`wingReturnLegs`) le garde.
    const back = Math.min(Math.max(0, plan.backMs), Math.max(0, w.returnAt - a.midAt));
    const returnAt = w.returnAt - gainMs - back;
    const cut = back > 0 ? { backCutMs: (w.backCutMs ?? 0) + back } : {};
    moved.push({
      members: w.state === 'gone' ? (w.gone ?? []) : w.members,
      from: w.returnAt,
      to: returnAt,
    });
    return w.state === 'waiting'
      ? // ⚠️ Jamais PLUS TARD : un groupe dont l'heure est déjà passée (pas encore traité par
        // le tick) garde la sienne — la repousser à « maintenant » changerait l'instant où
        // l'on vérifie qui peut partir (blessures, bataille échue entre-temps).
        {
          ...w,
          departAt: Math.min(w.departAt, Math.max(now, w.departAt - gainMs)),
          returnAt,
          ...cut,
        }
      : { ...w, returnAt, ...cut };
  });
  return {
    attack: { ...a, arriveAt: a.arriveAt - gainMs, midAt: a.midAt - gainMs, wings },
    moved,
  };
}

/** ⚡ Un boost du stock, tel que la tuile d'un voyage le propose. */
export interface BoostChoice {
  id: BoostId;
  count: number;
  minutes: number;
  gainMs: number;
  lostMs: number;
}

/** Les boosts qu'on possède, chiffrés pour CE voyage (`planOf` = `voyageBoostPlan` ou
 *  `attackBoostPlan` liés au voyage). ⚠️ Le blocage se lit avant le stock : un voyage sur
 *  place ou une interception le disent même quand on n'a aucun boost. */
export function boostChoices(
  stock: SupplyStock,
  planOf: (minutes: number) => BoostPlan | BoostBlock,
): { block: BoostBlock } | { choices: BoostChoice[] } {
  const probe = planOf(0);
  if (typeof probe === 'string') return { block: probe };
  const choices: BoostChoice[] = [];
  for (const id of BOOST_IDS) {
    const count = stock[id] ?? 0;
    if (count < 1) continue;
    const p = planOf(BOOST_MIN[id]) as BoostPlan;
    choices.push({ id, count, minutes: BOOST_MIN[id], gainMs: p.gainMs, lostMs: p.lostMs });
  }
  return { choices };
}
