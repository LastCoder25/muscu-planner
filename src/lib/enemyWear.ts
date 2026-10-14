/**
 * 🩸 LES PERTES DE L'ENNEMI SE REPORTENT SUR LA TROUPE QUI S'INSTALLE (2026-10-14, décision de
 * l'utilisateur : « tout combat où l'armée ennemie s'installe quelque part, il faut que cette
 * armée ait logiquement perdu des effectifs si la bataille lui en a fait perdre »).
 *
 * - Une garnison qui tombe a quand même entamé l'assaillant : la troupe qui occupe le lieu
 *   repris part USÉE de ce que le combat lui a retiré (`foeDealt`, la part de ses PV entamée).
 * - Même règle quand c'est TOI qui attaques un lieu ennemi et perds : sa troupe garde la trace.
 * - Plancher : la troupe garde au moins `minShare` de sa force (des renforts arrivent vite).
 * - 🗺️ ELLE SE RENFORCE AU RYTHME DE TES TRAJETS, pas de l'horloge (`healPerTrip` par sortie
 *   arrivée, `map.departures`) — la règle des événements calés sur les sorties
 *   (`sortieClock.ts`) : qui joue beaucoup voit le temps passer plus vite, qui joue peu ne
 *   trouve pas l'ennemi requinqué en son absence.
 *
 * L'usure se lit sur `ControlState.wear` : `share` = la part de la troupe en moins (0..1 −
 * `minShare`), `from` = la dernière sortie déjà comptée. `healWear` l'avance à chaque tick ;
 * `campSpecOf` (via `wornSize`) la retranche de la troupe combattue.
 */
import type { ControlState, ExpeditionMap } from './expedition';

export const WEAR = {
  /** La force qu'une troupe usée garde au moins (0..1). */
  minShare: 0.3,
  /** La part de la troupe regagnée par trajet arrivé sur la carte. */
  healPerTrip: 0.15,
  /** Sous cette usure, on l'oublie (une troupe à 1 % près n'est pas « affaiblie »). */
  epsilon: 0.01,
} as const;

export interface EnemyWear {
  /** La part de la troupe en moins (0..1 − `WEAR.minShare`). */
  share: number;
  /** L'instant de la dernière sortie déjà comptée dans la guérison. */
  from: number;
}

const clampShare = (s: number): number => Math.min(1 - WEAR.minShare, Math.max(0, s));

/** L'usure d'une troupe qui vient de perdre `dealt` (0..1) de ses PV au combat, ajoutée à
 *  celle qu'elle portait déjà (les pertes se composent : 1 − (1 − a)(1 − b)). Absente quand il
 *  n'en reste rien de notable. */
export function addWear(
  prev: EnemyWear | undefined,
  dealt: number,
  at: number,
): EnemyWear | undefined {
  const d = Math.min(1, Math.max(0, Number.isFinite(dealt) ? dealt : 0));
  const before = prev?.share ?? 0;
  const share = clampShare(1 - (1 - before) * (1 - d));
  if (share < WEAR.epsilon) return undefined;
  return { share, from: Math.max(at, prev?.from ?? at) };
}

/** La taille effectivement combattue d'une troupe ennemie usée. */
export function wornSize(size: number, wear: EnemyWear | undefined): number {
  return wear ? size * (1 - clampShare(wear.share)) : size;
}

/** La part de force regagnée après `trips` sorties. */
export function healedWear(wear: EnemyWear, trips: number, from: number): EnemyWear | undefined {
  const share = clampShare(wear.share - WEAR.healPerTrip * Math.max(0, trips));
  return share < WEAR.epsilon ? undefined : { share, from };
}

/** Combien de trajets avant qu'une troupe ait retrouvé toute sa force. */
export function tripsToHeal(wear: EnemyWear | undefined): number {
  if (!wear || wear.share < WEAR.epsilon) return 0;
  return Math.ceil((wear.share - WEAR.epsilon) / WEAR.healPerTrip);
}

/**
 * 🗺️ Les troupes ennemies usées se renforcent des sorties arrivées depuis la dernière lecture.
 * Rend la MÊME carte quand rien ne change (le store n'écrit pas à vide). Seuls les lieux tenus
 * par l'ennemi guérissent : un lieu repris par le joueur perd son usure (`captureControl`).
 */
export function healWear(map: ExpeditionMap, now: number): ExpeditionMap {
  const deps = map.departures ?? [];
  let changed = false;
  const pois = map.pois.map((p) => {
    const w = p.control?.wear;
    if (!w || p.control!.owner !== 'enemy') return p;
    const fresh = deps.filter((t) => t > w.from && t <= now);
    if (!fresh.length) return p;
    changed = true;
    const next = healedWear(w, fresh.length, Math.max(...fresh));
    const control: ControlState = { ...p.control! };
    if (next) control.wear = next;
    else delete control.wear;
    return { ...p, control };
  });
  return changed ? { ...map, pois } : map;
}

/** « affaiblie de 40 % · se renforce en 3 trajets » — ou '' sans usure. */
export function wearLabel(wear: EnemyWear | undefined): string {
  if (!wear || wear.share < WEAR.epsilon) return '';
  const n = tripsToHeal(wear);
  return `affaiblie de ${Math.round(wear.share * 100)} % · se renforce en ${n} trajet${n > 1 ? 's' : ''}`;
}
