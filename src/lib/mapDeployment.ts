/**
 * 🧭 LA RÉPARTITION DE L'EFFECTIF SUR LA CARTE — bouton « Répartir », SANS RÉGLAGE.
 *
 * Refonte du 2026-10-14 (demandé par l'utilisateur : « quand je fais auto, ça me répartit les
 * effectifs au mieux sur la carte » — plus de seuil de réussite ni de %). Les objectifs, posés
 * avec lui :
 * 1. LES PLUS FORTS AUX MEILLEURS ENDROITS. On attaque souvent un lieu avec les effectifs des
 *    lieux fixes les plus proches (attaque combinée : tout le monde arrive avec le plus LENT).
 *    Pour chaque point de l'île, on regarde le temps qu'il faut pour y réunir assez de force
 *    (`force`, la force qu'il faut contre un lieu dur courant) en partant des endroits occupés
 *    les plus proches — c'est l'heure d'arrivée de l'attaque combinée. On minimise la moyenne
 *    de ce temps sur toute l'île : les forts finissent naturellement là où ils servent le plus.
 * 2. EN SECONDAIRE, LA DÉFENSE : un lieu tenu qui se défend (`guard`) garde au moins un
 *    membre, s'il y a assez de monde — sinon il est repris sans combat.
 * 3. LE MOINS DE DÉPLACEMENTS : on part de là où chacun est, et un déplacement doit faire
 *    gagner du temps (`MOVE_COST`) — sinon on ne le propose pas.
 *
 * On ne juge PAS sur les lieux présents sur la carte : ils changent toutes les heures, la
 * géographie non. ⚠️ Aucune règle de jeu ici : forces et trajets sont INJECTÉS.
 */
import { onIsland, islandSpan, LAND_MARGIN } from './islandShape';
import { EXPE, revealRadius } from './expedition';
import { characterRank, rankStartLevel } from './characterRank';

export interface DeployUnit {
  id: string;
  hero: boolean;
  /** Où il est : `'base'` ou l'id du lieu tenu. */
  loc: string;
  /** Sa force (même unité pour tous, ADDITIVE : celle d'un groupe = la somme). */
  power: number;
}

export interface DeploySpot {
  /** `'base'` ou l'id du lieu tenu. */
  id: string;
  /** Places (le héros en prend 2) ; `Infinity` pour la base. */
  seats: number;
  /** Le héros peut-il y être posté ? */
  heroOk: boolean;
  /** Lieu tenu qui se défend : il garde au moins un membre (si l'effectif le permet). */
  guard?: boolean;
}

export interface DeployDeps {
  /** Trajet (minutes, aller) de l'endroit `spot` vers le point d'échantillon n° `point`. */
  trip: (spot: string, point: number) => number;
}

interface DeployMove {
  unit: DeployUnit;
  from: string;
  to: string;
}

export interface DeployResult {
  /** Où chacun finit (id de l'unité → endroit). */
  spotOf: Map<string, string>;
  moves: DeployMove[];
  /** Temps moyen (minutes, aller) pour réunir la force voulue sur un point de l'île. */
  reach: number;
}

/** Ce qu'un membre occupe sur un lieu : le héros en prend 2. */
export const deployWeight = (u: DeployUnit): number => (u.hero ? 2 : 1);

/** Ce que doit faire gagner un déplacement (minutes de temps moyen) pour être proposé : un
 *  champion qui part ne produit plus et ne défend plus le temps de son trajet. */
export const MOVE_COST = 1;

/**
 * ⏱️ Le temps moyen pour réunir `force` sur un point de l'île, avec `power` par endroit.
 * `order[p]` = les endroits triés du plus proche au plus loin du point p. Si l'effectif entier
 * ne suffit pas, le temps du plus lointain est majoré d'autant (plus il manque, pire c'est).
 */
export function reachTime(
  power: ReadonlyMap<string, number>,
  order: readonly (readonly string[])[],
  trips: ReadonlyMap<string, readonly number[]>,
  force: number,
): number {
  if (!order.length) return 0;
  let sum = 0;
  for (let p = 0; p < order.length; p++) {
    let cum = 0;
    let t = 0;
    for (const s of order[p]!) {
      const pw = power.get(s) ?? 0;
      if (pw <= 0) continue;
      cum += pw;
      t = trips.get(s)![p]!;
      if (cum >= force) break;
    }
    sum += cum <= 0 ? 0 : cum >= force ? t : (t * force) / cum;
  }
  return sum / order.length;
}

/** 🧭 La répartition : où mettre chacun (cf. l'en-tête). */
export function planStations(
  units: readonly DeployUnit[],
  spots: readonly DeploySpot[],
  points: number,
  opts: { force: number; deps: DeployDeps },
): DeployResult {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const trips = new Map(
    spots.map((s) => [s.id, Array.from({ length: points }, (_, p) => opts.deps.trip(s.id, p))]),
  );
  const order = Array.from({ length: points }, (_, p) =>
    spots.map((s) => s.id).sort((a, b) => trips.get(a)![p]! - trips.get(b)![p]!),
  );
  const at = new Map<string, string>();
  const used = new Map<string, number>();
  const put = (u: DeployUnit, s: string) => {
    const old = at.get(u.id);
    if (old) used.set(old, (used.get(old) ?? 0) - deployWeight(u));
    at.set(u.id, s);
    used.set(s, (used.get(s) ?? 0) + deployWeight(u));
  };
  const room = (s: string) => byId.get(s)!.seats - (used.get(s) ?? 0);
  const fits = (u: DeployUnit, s: string) =>
    (!u.hero || byId.get(s)!.heroOk) && room(s) >= deployWeight(u);
  const members = (s: string) => units.filter((u) => at.get(u.id) === s);

  // Départ : chacun là où il est (moins de déplacements), sinon à la base.
  const base = spots.find((s) => s.id === 'base')?.id ?? spots[0]?.id ?? 'base';
  for (const u of units) put(u, byId.has(u.loc) && fits(u, u.loc) ? u.loc : base);

  // 🛡️ Un membre au moins sur chaque lieu qui se défend : le moins fort qu'on peut retirer
  // d'un endroit qui en a plusieurs (jamais un lieu gardé vidé pour en remplir un autre).
  for (const s of spots) {
    if (!s.guard || members(s.id).length) continue;
    const pick = units
      .filter((u) => {
        const from = at.get(u.id)!;
        return fits(u, s.id) && (!byId.get(from)?.guard || members(from).length > 1);
      })
      .sort((a, b) => a.power - b.power)[0];
    if (pick) put(pick, s.id);
  }
  const guardOk = (s: string) => !byId.get(s)?.guard || members(s).length > 0;

  const powers = () => {
    const m = new Map<string, number>();
    for (const u of units) m.set(at.get(u.id)!, (m.get(at.get(u.id)!) ?? 0) + u.power);
    return m;
  };
  const moved = () => units.filter((u) => at.get(u.id) !== u.loc).length;
  const cost = () => reachTime(powers(), order, trips, opts.force) + MOVE_COST * moved();

  // 🔁 Amélioration locale : déplacer un membre, ou en échanger deux, tant que ça fait gagner.
  let best = cost();
  for (let round = 0; round < 200; round++) {
    let improved = false;
    const strongFirst = [...units].sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
    for (const u of strongFirst) {
      const from = at.get(u.id)!;
      for (const s of spots) {
        if (s.id === from || !fits(u, s.id)) continue;
        put(u, s.id);
        const c = guardOk(from) ? cost() : Infinity;
        if (c < best - 1e-6) {
          best = c;
          improved = true;
          break;
        }
        put(u, from);
      }
      if (improved) break;
      for (const v of strongFirst) {
        const to = at.get(v.id)!;
        if (to === from || deployWeight(u) !== deployWeight(v)) continue;
        if ((u.hero && !byId.get(to)!.heroOk) || (v.hero && !byId.get(from)!.heroOk)) continue;
        put(u, to);
        put(v, from);
        const c = cost();
        if (c < best - 1e-6) {
          best = c;
          improved = true;
          break;
        }
        put(u, from);
        put(v, to);
      }
      if (improved) break;
    }
    if (!improved) break;
  }

  const moves: DeployMove[] = units
    .filter((u) => at.get(u.id) !== u.loc)
    .map((u) => ({ unit: u, from: u.loc, to: at.get(u.id)! }));
  return { spotOf: at, moves, reach: reachTime(powers(), order, trips, opts.force) };
}

/**
 * 📍 Les points d'échantillon de la terre où des lieux peuvent apparaître : sur une île, la terre
 * ferme (marge de côte), à plus de `distMin` de la ville ; sur une carte ordinaire, l'anneau
 * révélé. Grille de pas `step`.
 */
export function deploymentPoints(
  island: number | null,
  outpostLevel: number,
  step = 6,
): { x: number; y: number }[] {
  const { x: cx, y: cy } = EXPE.town;
  const reach = island !== null ? islandSpan(island) : revealRadius(outpostLevel);
  const out: { x: number; y: number }[] = [];
  for (let x = cx - reach; x <= cx + reach; x += step)
    for (let y = cy - reach; y <= cy + reach; y += step) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < EXPE.distMin || d > reach) continue;
      if (island !== null && !onIsland(island, x, y, LAND_MARGIN)) continue;
      out.push({ x, y });
    }
  return out;
}

/**
 * 🎯 Le niveau des lieux de référence : le HAUT du rang du joueur (la carte tire les lieux
 * jusqu'à son rang, pas seulement jusqu'à son niveau), borné par le plancher et le plafond de
 * l'île (`levelFloor` / `levelCap`).
 */
export function deployRefLevel(heroLevel: number, floor: number, cap: number): number {
  const top = rankStartLevel(characterRank(Math.max(1, heroLevel)).rankIndex + 1) - 1;
  return Math.max(Math.max(1, floor), Math.min(cap, top));
}
