/**
 * 🛡️ LES ÉTAPES D'UN TRAJET ALLER SIMPLE (2026-10-09, demandé : « intégrer un peu mieux » les
 * tuiles des troupes qui partent en garnison) : un renfort, le héros qui va se poster, un retour
 * vers la base. Ils n'avaient pas d'étapes connues, donc une petite tuile à barre ; avec les
 * mêmes `phases` / `steps` qu'une expédition, ils prennent la frise pleine largeur.
 *
 * ⚠️ Rien de neuf sur le TEMPS : départ et arrivée viennent du voyage (`sentAt`, arrivée), la
 * frise ne fait que les montrer. Une étape : le trajet (`go`, ou `back` vers la base), précédée
 * d'une attente si le départ n'est pas encore passé.
 */
import { formatCountdown } from './duration';
import type { TripPhase, TripStep } from './expedition';

export interface OneWayLegs {
  go: string | null;
  back: string;
  detail: string;
  phases: TripPhase[];
  steps: TripStep[];
}

export function oneWayLegs(
  sentAt: number,
  arriveAt: number,
  now: number,
  /** `go` vers un lieu, `back` vers la base. */
  leg: 'go' | 'back',
  /** L'icône de l'étape de trajet sur la tuile (🛡️ renfort, 🧭 héros, 🏠 retour) : sans elle
   *  ce serait ⚔️, celle d'une attaque. */
  icon?: string,
): OneWayLegs | null {
  if (now >= arriveAt) return null;
  const left = formatCountdown(arriveAt - now);
  const waiting = now < sentAt;
  const ride = Math.max(1, arriveAt - sentAt);
  const ridePct = waiting ? 0 : Math.max(0, Math.min(100, ((now - sentAt) / ride) * 100));
  const phases: TripPhase[] = [];
  const steps: TripStep[] = [];
  if (waiting) {
    const t = formatCountdown(sentAt - now);
    phases.push({ leg: 'wait', time: t, endsAt: sentAt, current: true, pct: 0 });
    steps.push({ leg: 'wait', ms: sentAt - now, pct: 0, current: true, time: t });
  }
  phases.push({
    leg,
    time: left,
    endsAt: arriveAt,
    current: !waiting,
    pct: Math.round(ridePct),
    ...(icon ? { icon } : {}),
  });
  steps.push({
    leg,
    ms: ride,
    pct: ridePct,
    current: !waiting,
    time: left,
    ...(icon ? { icon } : {}),
  });
  return {
    go: leg === 'go' ? left : null,
    back: leg === 'back' ? left : '',
    detail: leg === 'go' ? `Arrivée dans ${left}` : `À la base dans ${left}`,
    phases,
    steps,
  };
}
