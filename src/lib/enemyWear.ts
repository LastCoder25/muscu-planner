/**
 * 🩸 LES PERTES DE L'ENNEMI SE REPORTENT SUR LA TROUPE QUI S'INSTALLE (2026-10-14, décision de
 * l'utilisateur : « tout combat où l'armée ennemie s'installe quelque part, il faut que cette
 * armée ait logiquement perdu des effectifs si la bataille lui en a fait perdre »).
 *
 * - Une garnison qui tombe a quand même entamé l'assaillant : la troupe qui occupe le lieu
 *   repris part USÉE de ce que le combat lui a retiré (`foeDealt`, la part de ses PV entamée).
 * - Même règle quand c'est TOI qui attaques un lieu ennemi et perds : sa troupe garde la trace.
 * - Aucun plancher (`minShare` = 0) : l'usure est ce que le combat a retiré ; `minSize` évite la troupe nulle.
 * - 🗺️ ELLE SE RENFORCE AU RYTHME DE TES VAGUES D'ATTAQUE, pas de l'horloge (`healPerWave`
 *   par vague, `map.attackTrips`) — la règle des événements calés sur les sorties
 *   (`sortieClock.ts`) : qui joue beaucoup voit le temps passer plus vite, qui joue peu ne
 *   trouve pas l'ennemi requinqué en son absence. Plafonné à l'armée initiale (usure ≥ 0).
 *
 * L'usure se lit sur `ControlState.wear` : `share` = la part de la troupe en moins (0..1 −
 * `minShare`), `from` = le début de la dernière vague comptée (ou le combat), `hits` = les
 * combats déjà comptés (idempotence ; gardés à part 0 après guérison). `healWear` l'avance à chaque tick ;
 * `campSpecOf` (via `wornSize`) la retranche de la troupe combattue.
 */
import type { ControlState, ExpeditionMap } from './expedition';

/**
 * ⚠️ PAS DE PLANCHER (décision de l'utilisateur, 2026-10-14) : l'usure est CE QUE LE COMBAT A
 * RÉELLEMENT RETIRÉ, jusqu'à 100 % (`minShare` = 0, gardé pour pouvoir le régler). Une troupe
 * à 0 serait pourtant injouable (`campBodies`, le combat) : `minSize` est un plancher
 * TECHNIQUE, une troupe minuscule mais jamais nulle. Mesuré : sur une défense perdue, `foeDealt`
 * vaut en moyenne 0,5-0,87 — le plafond d'avant (0,7) était presque toujours atteint.
 * ⚔️ Seuls les TRAJETS D'ATTAQUE renforcent (`map.attackTrips`, failles comprises — décision de
 * l'utilisateur), jamais les récoltes libres, renforts, transferts ni rappels.
 * 🌊 PAR VAGUE (2026-10-14, décision de l'utilisateur, « 7 % par vague ») : les équipes parties
 * ensemble (arrivées à moins de `waveMs` du début de la vague) ne comptent qu'UNE fois — sinon
 * un joueur riche en champions remettait l'ennemi à neuf en 2-4 envois simultanés.
 * ⚠️ MESURÉ sur la partie de l'utilisateur (41 h de jeu, ~18 attaques/j en ~10 vagues/j de 2
 * équipes) : usure médiane d'une défense perdue 0,41-0,56 (p90 ~0,9) ; à 15 %/trajet elle
 * s'effaçait en 3,4 h. À 7 %/vague : sous 0,3 en ~3 vagues, pleine force en ~8 vagues (~17 h).
 */
export const WEAR = {
  /** La force qu'une troupe usée garde au moins (0..1) : 0 = aucune limite. */
  minShare: 0,
  /** La taille technique en dessous de laquelle une troupe usée ne descend pas (champions de référence). */
  minSize: 0.05,
  /** La part de l'armée initiale regagnée par VAGUE d'attaque arrivée sur la carte. */
  healPerWave: 0.07,
  /** Des trajets d'attaque arrivés à moins de ça du début d'une vague en font partie. */
  waveMs: 3_600_000,
  /** Sous cette usure, on l'oublie (une troupe à 1 % près n'est pas « affaiblie »). */
  epsilon: 0.01,
} as const;

export interface EnemyWear {
  /** La part de la troupe en moins (0..1 − `WEAR.minShare`). */
  share: number;
  /** L'instant de la dernière sortie déjà comptée dans la guérison. */
  from: number;
  /** 🔁 Les combats déjà comptés (un tick peut retraiter le même rapport) — borné. */
  hits?: string[];
}

/** Combien d'ids de combats on garde. */
const MAX_HITS = 12;

const clampShare = (s: number): number => Math.min(1 - WEAR.minShare, Math.max(0, s));

/** L'usure d'une troupe qui vient de perdre `dealt` (0..1) de ses PV au combat, ajoutée à
 *  celle qu'elle portait déjà (les pertes se composent : 1 − (1 − a)(1 − b)). Absente quand il
 *  n'en reste rien de notable. */
export function addWear(
  prev: EnemyWear | undefined,
  dealt: number,
  at: number,
  /** L'id du combat : déjà compté, il est ignoré (idempotence). */
  hitId?: string,
): EnemyWear | undefined {
  if (hitId && prev?.hits?.includes(hitId)) return prev;
  const hits = hitId ? [...(prev?.hits ?? []), hitId].slice(-MAX_HITS) : prev?.hits;
  const d = Math.min(1, Math.max(0, Number.isFinite(dealt) ? dealt : 0));
  const before = prev?.share ?? 0;
  const share = clampShare(1 - (1 - before) * (1 - d));
  if (share < WEAR.epsilon)
    return hits?.length ? { share: 0, from: Math.max(at, prev?.from ?? at), hits } : undefined;
  return { share, from: Math.max(at, prev?.from ?? at), ...(hits?.length ? { hits } : {}) };
}

/** Le même état de contrôle SANS usure (lieu pris par le joueur, troupe re-tirée…). */
export function withoutWear(c: ControlState): ControlState {
  if (!c.wear) return c;
  const { wear: _w, ...rest } = c;
  void _w;
  return rest;
}

/**
 * 🏰 LA FORTERESSE NE S'USE PAS (2026-10-15, décision de l'utilisateur) : c'est l'objectif de
 * long terme d'une île. Usée par des assauts ratés en boucle, elle tombait en une seule vague
 * de défaites (plusieurs équipes dans l'heure ne comptent qu'une vague, donc aucune reprise de
 * force entre elles) — on débarquait au niveau 40 et on repartait aussitôt. Elle se prend à sa
 * force affichée (le verrou des objectifs et leur affaiblissement, `fortressForce`, restent).
 * SOURCE UNIQUE : stockage (`wearEnemy`, reprise par l'ennemi), combat (`troopSize`),
 * pronostic et fiche la lisent.
 */
export function wearsDown(control: Pick<ControlState, 'kind'> | undefined): boolean {
  return control?.kind !== 'fortress';
}

/** La taille effectivement combattue de la troupe d'un lieu : usée, sauf la forteresse. */
export function troopSize(control: Pick<ControlState, 'kind' | 'size' | 'wear'>): number {
  return wearsDown(control) ? wornSize(control.size, control.wear) : control.size;
}

/** La taille effectivement combattue d'une troupe ennemie usée. */
export function wornSize(size: number, wear: EnemyWear | undefined): number {
  if (!wear) return size;
  return Math.max(size * (1 - clampShare(wear.share)), Math.min(size, WEAR.minSize));
}

/** La part de force regagnée après `waves` vagues d'attaque. */
export function healedWear(wear: EnemyWear, waves: number, from: number): EnemyWear | undefined {
  const share = clampShare(wear.share - WEAR.healPerWave * Math.max(0, waves));
  if (share >= WEAR.epsilon)
    return { share, from, ...(wear.hits?.length ? { hits: wear.hits } : {}) };
  // 🔁 Guérie, elle garde la MÉMOIRE des combats déjà comptés (part 0) : sinon un rapport
  // retraité après la guérison la ré-userait. Sans mémoire, plus rien à garder.
  return wear.hits?.length ? { share: 0, from, hits: wear.hits } : undefined;
}

/** Combien de vagues d'attaque avant qu'une troupe ait retrouvé toute sa force. */
export function wavesToHeal(wear: EnemyWear | undefined): number {
  if (!wear || wear.share < WEAR.epsilon) return 0;
  return Math.ceil((wear.share - WEAR.epsilon) / WEAR.healPerWave);
}

/**
 * 🌊 Les NOUVELLES vagues parmi des trajets d'attaque, après la vague (ou le combat) commencée à
 * `from` : un trajet ouvre une vague s'il arrive plus de `waveMs` après le début de la
 * précédente. Rend leur nombre et le début de la dernière (`from` si aucune).
 * ⚠️ `from` est le DÉBUT de la dernière vague comptée : les trajets qui la suivent de moins de
 * `waveMs` en font partie, même lus à un tick ultérieur. Le combat qui a usé la troupe ouvre
 * la sienne (l'attaque ratée elle-même ne la renforce pas).
 */
export function newWaves(
  trips: readonly number[],
  from: number,
  now: number,
): { n: number; last: number } {
  let last = from;
  let n = 0;
  for (const t of trips.filter((x) => x > from && x <= now).sort((a, b) => a - b))
    if (t > last + WEAR.waveMs) {
      n++;
      last = t;
    }
  return { n, last };
}

/**
 * 🗺️ Les troupes ennemies usées se renforcent des vagues d'attaque arrivées depuis la dernière
 * lecture. Rend la MÊME carte quand rien ne change (le store n'écrit pas à vide). Seuls les
 * lieux tenus par l'ennemi guérissent : un lieu repris par le joueur perd son usure.
 */
export function healWear(map: ExpeditionMap, now: number): ExpeditionMap {
  const deps = map.attackTrips ?? [];
  let changed = false;
  const pois = map.pois.map((p) => {
    const w = p.control?.wear;
    // Une usure à 0 n'est plus que la mémoire des combats comptés : rien à guérir.
    if (!w || w.share < WEAR.epsilon || p.control!.owner !== 'enemy') return p;
    const { n, last } = newWaves(deps, w.from, now);
    if (!n) return p;
    changed = true;
    const next = healedWear(w, n, last);
    const control: ControlState = { ...p.control! };
    if (next) control.wear = next;
    else delete control.wear;
    return { ...p, control };
  });
  return changed ? { ...map, pois } : map;
}

/** « affaiblie de 40 % · se renforce en 6 vagues d'attaque » — ou '' sans usure. */
export function wearLabel(wear: EnemyWear | undefined): string {
  if (!wear || wear.share < WEAR.epsilon) return '';
  const n = wavesToHeal(wear);
  return `affaiblie de ${Math.round(wear.share * 100)} % · se renforce en ${n} vague${n > 1 ? 's' : ''} d’attaque`;
}

/**
 * 🩸 Une attaque RATÉE du joueur sur un lieu tenu par l'ennemi : sa troupe garde la trace du
 * combat (`dealt`, 0..1), composée à l'usure qu'elle portait. Idempotent (`hitId` = l'id du
 * rapport). Rend la MÊME carte quand rien ne change (lieu absent, tenu par nous, rien entamé).
 */
export function wearEnemy(
  map: ExpeditionMap,
  id: string,
  dealt: number | undefined,
  at: number,
  hitId?: string,
): ExpeditionMap {
  if (!dealt || dealt <= 0) return map;
  let changed = false;
  const pois = map.pois.map((p) => {
    const c = p.control;
    if (p.id !== id || !c || c.owner !== 'enemy' || !wearsDown(c)) return p;
    const wear = addWear(c.wear, dealt, at, hitId);
    if (wear === c.wear) return p;
    changed = true;
    const control: ControlState = { ...c };
    if (wear) control.wear = wear;
    else delete control.wear;
    return { ...p, control };
  });
  return changed ? { ...map, pois } : map;
}

/** « Ce combat a retiré 40 % à sa troupe » — la part de CE combat (l'usure du lieu, composée
 *  à celle qu'il portait, peut être plus forte) — ou '' quand il l'a à peine entamée. */
export function wearHitLabel(dealt: number | undefined): string {
  const pct = Math.round(Math.min(1 - WEAR.minShare, Math.max(0, dealt ?? 0)) * 100);
  return pct >= 1 ? ` Ce combat a retiré ${pct} % à sa troupe.` : '';
}

/** « L’ennemi s’installe affaibli de 40 % » — ou '' quand le combat l'a à peine entamé, ou
 *  quand le lieu ne s'use pas (la forteresse, `wearsDown`). */
export function wearSettleLabel(
  dealt: number | undefined,
  control: Pick<ControlState, 'kind'> | undefined,
): string {
  if (!wearsDown(control)) return '';
  const pct = Math.round(Math.min(1 - WEAR.minShare, Math.max(0, dealt ?? 0)) * 100);
  return pct >= 1 ? ` L’ennemi s’installe affaibli de ${pct} %.` : '';
}
