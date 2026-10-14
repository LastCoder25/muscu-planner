/**
 * 🧭 LA RÉPARTITION DE L'EFFECTIF SUR LA CARTE — bouton « Répartir », SANS RÉGLAGE.
 *
 * Refonte du 2026-10-14 (demandé par l'utilisateur : « quand je fais auto, ça me répartit les
 * effectifs au mieux sur la carte », puis « ne prends en compte que l'optimisation des attaques ;
 * on vide les lieux fixes et on dispatche de zéro »). UN SEUL objectif : les ATTAQUES.
 * On attaque un lieu avec les effectifs des lieux fixes les plus proches (attaque combinée :
 * tout le monde arrive avec le plus LENT). Pour chaque point de l'île, on regarde le temps qu'il
 * faut pour y réunir assez de force (`force`, la force qu'il faut contre un lieu dur courant) en
 * partant des endroits occupés les plus proches. On minimise la moyenne de ce temps sur l'île :
 * les forts finissent là où ils servent le plus.
 *
 * ⚠️ ON PART DE ZÉRO : tout le monde bouge en même temps, chaque lieu est vide au départ, peu
 * importe où chacun se trouve. La DÉFENSE n'est pas l'affaire de cette fonction : la garde de
 * base d'un lieu fixe, ce sont les miliciens ; les champions y sont un plus qu'on ignore ici.
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
const deployWeight = (u: DeployUnit): number => (u.hero ? 2 : 1);

/**
 * ⏱️ Le temps pour réunir `force` sur un point de l'île, avec `power` par endroit, moyenné sur
 * l'île. `order[p]` = les endroits triés du plus proche au plus loin du point p.
 *
 * Par point : la moitié du DERNIER arrivé (l'attaque combinée part avec le plus lent) et la
 * moitié du temps MOYEN de la force réunie (chaque part de force pèse selon son trajet).
 * ⚠️ La seconde moitié n'est pas décorative (2026-10-14, mesuré sur un compte réel) : avec le
 * dernier arrivé SEUL, dès qu'un lieu réunit la force à lui seul, un champion posté plus près
 * d'un point ne change jamais ce temps — rien ne pousse à couvrir l'île, et 16 champions sur
 * 19 restaient à la base, l'endroit le plus loin de tout.
 * Si l'effectif entier ne suffit pas, le manque arrive au temps du plus lointain, majoré.
 */
export function reachTime(
  power: ReadonlyMap<string, number>,
  order: readonly (readonly string[])[],
  trips: ReadonlyMap<string, readonly number[]>,
  force: number,
): number {
  if (!order.length || force <= 0) return 0;
  let sum = 0;
  for (let p = 0; p < order.length; p++) {
    let cum = 0;
    let t = 0;
    let mass = 0;
    for (const s of order[p]!) {
      const pw = power.get(s) ?? 0;
      if (pw <= 0) continue;
      t = trips.get(s)![p]!;
      mass += Math.min(pw, force - cum) * t;
      cum += pw;
      if (cum >= force) break;
    }
    if (cum <= 0) continue;
    const last = cum >= force ? t : (t * force) / cum;
    if (cum < force) mass += (force - cum) * last;
    sum += (last + mass / force) / 2;
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

  const powers = () => {
    const m = new Map<string, number>();
    for (const u of units) {
      const s = at.get(u.id);
      if (s) m.set(s, (m.get(s) ?? 0) + u.power);
    }
    return m;
  };
  const cost = () => reachTime(powers(), order, trips, opts.force);
  const strongFirst = [...units].sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));

  // 🧹 Départ de ZÉRO : tous les lieux sont vides. Le plus fort d'abord, chacun là où il fait
  // le plus gagner (à égalité, la base : pas de déplacement inutile).
  for (const u of strongFirst) {
    let pick: string | null = null;
    let pickCost = Infinity;
    for (const s of spots) {
      if (!fits(u, s.id)) continue;
      put(u, s.id);
      const c = cost();
      if (c < pickCost - 1e-6 || (Math.abs(c - pickCost) <= 1e-6 && s.id === 'base')) {
        pickCost = c;
        pick = s.id;
      }
      at.delete(u.id);
      used.set(s.id, (used.get(s.id) ?? 0) - deployWeight(u));
    }
    put(u, pick ?? 'base');
  }

  // 🔁 Amélioration locale : déplacer un membre, ou en échanger deux, tant que ça fait gagner.
  let best = cost();
  for (let round = 0; round < 200; round++) {
    let improved = false;
    for (const u of strongFirst) {
      const from = at.get(u.id)!;
      for (const s of spots) {
        if (s.id === from || !fits(u, s.id)) continue;
        put(u, s.id);
        const c = cost();
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
