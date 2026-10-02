/**
 * ⚡ LES BOOSTS DE VITESSE (2026-09-30, demandé : « des boosts de vitesse d'expédition en
 * minutes, 5 min, 10 min, 15 min, 30 min, 1 h »). Un consommable (`BOOST_MIN`, supplies.ts)
 * utilisé sur un voyage EN COURS : son ÉTAPE EN COURS finit plus tôt.
 *
 * - À l'ALLER, l'arrivée (et le rapport) avancent de X, le retour avec elle : la durée du
 *   retour ne change pas, seul l'aller est plus court.
 * - Au RETOUR, seul le retour en ville avance.
 * - Sur place (fouille en cours), rien ne bouge : il n'y a pas de route à raccourcir.
 *
 * ⚠️ MINUTES PERDUES (décision de l'utilisateur) : un boost de 1 h sur une étape qui finit
 * dans 20 min n'en rend que 20. L'écran l'annonce AVANT de valider (`lostMs`).
 * ⚠️ PLUSIEURS BOOSTS AUTORISÉS sur un même voyage (décision de l'utilisateur).
 *
 * ⚔️🧭 ATTAQUE COMBINÉE (option B, décision de l'utilisateur) : le boost s'applique à TOUTE
 * l'attaque, qui arrive X plus tôt. Les groupes en route voient leur trajet restant raccourci
 * de X ; ceux qui attendent partent X plus tôt — si leur départ était dans moins de X, ils
 * partent tout de suite et le reste est pris sur leur trajet. Tous gardent la même arrivée :
 * personne ne double personne. Une fois tous partis, les groupes sont des voyages liés
 * (`combinedSiblings`) : un boost à l'aller les avance tous ensemble.
 *
 * ⚠️ JAMAIS vers une armée EN MARCHE (`warband`) à l'aller : le point de rencontre est
 * calculé au départ sur la marche de l'armée ; arriver plus tôt ne la ferait pas être là.
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
    if (v.poi.type === 'warband') return 'intercept';
    const gainMs = Math.min(boost, arriveAt - now);
    return { phase: 'go', gainMs, lostMs: boost - gainMs };
  }
  if (now < v.midAt) return 'onSite';
  if (now >= v.returnAt) return 'done';
  const gainMs = Math.min(boost, v.returnAt - now);
  return { phase: 'back', gainMs, lostMs: boost - gainMs };
}

/** Le voyage accéléré selon `plan`. ⚠️ `sentAt` ne bouge pas : l'aller dure moins, le tracé
 *  va plus vite. Même référence si le gain est nul. */
export function boostVoyage<T extends Pick<ActiveExpedition, 'midAt' | 'returnAt'>>(
  v: T,
  plan: Pick<BoostPlan, 'phase' | 'gainMs'>,
): T {
  const g = plan.gainMs;
  if (g <= 0) return v;
  if (plan.phase === 'back') return { ...v, returnAt: v.returnAt - g };
  return { ...v, midAt: v.midAt - g, returnAt: v.returnAt - g };
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
  a: Pick<CombinedAttack, 'poi' | 'arriveAt'>,
  minutes: number,
  now: number,
): BoostPlan | BoostBlock {
  const boost = Math.max(0, minutes) * 60_000;
  if (now >= a.arriveAt) return 'onSite';
  if (a.poi.type === 'warband') return 'intercept';
  const gainMs = Math.min(boost, a.arriveAt - now);
  return { phase: 'go', gainMs, lostMs: boost - gainMs };
}

/**
 * ⚔️🧭 L'attaque qui arrive `gainMs` plus tôt (option B). Rend aussi, par groupe, l'ancien et
 * le nouveau retour : les champions réservés (`busyUntil` = le retour de leur groupe, que
 * `wingDeparture` exige à l'identique) doivent suivre.
 */
export function boostAttack(
  a: CombinedAttack,
  gainMs: number,
  now: number,
): { attack: CombinedAttack; moved: { members: string[]; from: number; to: number }[] } {
  if (gainMs <= 0) return { attack: a, moved: [] };
  const moved: { members: string[]; from: number; to: number }[] = [];
  const wings = a.wings.map((w) => {
    if (w.state === 'dropped') return w;
    const returnAt = w.returnAt - gainMs;
    moved.push({
      members: w.state === 'gone' ? (w.gone ?? []) : w.members,
      from: w.returnAt,
      to: returnAt,
    });
    return w.state === 'waiting'
      ? // ⚠️ Jamais PLUS TARD : un groupe dont l'heure est déjà passée (pas encore traité par
        // le tick) garde la sienne — la repousser à « maintenant » changerait l'instant où
        // l'on vérifie qui peut partir (blessures, bataille échue entre-temps).
        { ...w, departAt: Math.min(w.departAt, Math.max(now, w.departAt - gainMs)), returnAt }
      : { ...w, returnAt };
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
