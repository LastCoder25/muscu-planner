/**
 * 🧭 LA RÉPARTITION DE L'EFFECTIF SUR LA CARTE (2026-10-11, demandé par l'utilisateur : « à
 * partir de tous mes champions et du héros, simuler leur répartition sur la base, les lieux
 * fixes et la forteresse, pour que le planificateur 🪄 parte ensuite des meilleurs endroits »).
 *
 * C'est un placement DE FOND, fait une fois (surtout utile avec un gros vivier, ou sur une île
 * pacifiée qu'on farme) — il n'attaque RIEN, c'est le 🪄 qui lance les expéditions ensuite.
 *
 * Deux temps, choisis avec l'utilisateur :
 * 1. ÉQUIPES ÉQUILIBRÉES. On en fait le plus possible tout en gardant chacune capable de
 *    prendre un lieu de référence parmi les plus durs de l'île au seuil réglé : n'importe quelle
 *    équipe peut alors prendre n'importe quel lieu, et c'est ce qui donne le moins de temps pour
 *    tout attaquer. Les compétences de SOUTIEN (⛑️ soins, 🐫 cargaison, 🧲 pillard, 👁️ repérage,
 *    🧭 vitesse, 🎓 mentor) sont RÉPARTIES — une par équipe autant que possible — plutôt
 *    qu'empilées au même endroit.
 * 2. COUVERTURE DE L'ÎLE. Chaque équipe est posée à l'endroit (base ou lieu tenu, places
 *    comprises) qui fait baisser le plus le temps pour tout couvrir : la terre de l'île est
 *    échantillonnée, chaque point va à l'endroit occupé le plus proche, et on minimise la plus
 *    grosse charge par équipe (le dernier lieu atteint). On ne juge PAS sur les lieux présents
 *    sur la carte : ils changent toutes les heures, la géographie non.
 *
 * ⚠️ Aucune règle de jeu ici : la réussite et les trajets sont INJECTÉS.
 */
import { onIsland, islandSpan, LAND_MARGIN } from './islandShape';
import { EXPE, revealRadius } from './expedition';
import { characterRank, rankStartLevel } from './characterRank';

/** Les compétences qu'on répartit entre les équipes au lieu de les empiler. */
export const SUPPORT_SKILLS = ['care', 'haul', 'plunder', 'scout', 'speed', 'mentor'] as const;

export interface DeployUnit {
  id: string;
  hero: boolean;
  /** Où il est : `'base'` ou l'id du lieu tenu. */
  loc: string;
  /** Sa force (même unité pour tous : seul l'ordre compte). */
  power: number;
  /** Ses compétences de soutien (cf. `SUPPORT_SKILLS`), une fois chacune. */
  roles: readonly string[];
}

export interface DeploySpot {
  /** `'base'` ou l'id du lieu tenu. */
  id: string;
  /** Places de champion (le héros en prend 2) ; `Infinity` pour la base et la forteresse. */
  seats: number;
  /** Le héros peut-il y être posté ? */
  heroOk: boolean;
}

export interface DeployDeps {
  /** Chance de l'équipe contre le lieu de référence (0..1). */
  win: (team: readonly DeployUnit[]) => number;
  /** Trajet (minutes, aller) de l'endroit `spot` vers le point d'échantillon n° `point`. */
  trip: (spot: string, point: number) => number;
}

interface DeployTeam {
  units: DeployUnit[];
  spot: string;
  win: number;
  /** Part de l'île que couvre son endroit, divisée entre ses équipes (0..1). */
  share: number;
  /** Trajet moyen (aller) de son endroit vers les points qu'il couvre. */
  avgTrip: number;
}

interface DeployMove {
  unit: DeployUnit;
  from: string;
  to: string;
}

export interface DeployResult {
  teams: DeployTeam[];
  moves: DeployMove[];
  /** Aucune équipe n'atteint le seuil : on a gardé tout le monde ensemble. */
  belowThreshold: boolean;
  /** Le plus long temps de couverture par équipe (somme des trajets d'une zone ÷ ses équipes). */
  makespan: number;
}

/** Ce qu'un membre occupe sur un lieu : le héros en prend 2. */
export const deployWeight = (u: DeployUnit): number => (u.hero ? 2 : 1);
const teamWeight = (t: readonly DeployUnit[]) => t.reduce((n, u) => n + deployWeight(u), 0);

/**
 * ⚖️ Répartit les unités en `k` équipes de force équivalente : du plus fort au plus faible,
 * chacun rejoint l'équipe la plus faible — sauf si elle a déjà sa compétence de soutien
 * (chaque doublon pèse la moitié d'une unité moyenne). Le héros d'abord : il est le plus lourd.
 */
export function balancedTeams(units: readonly DeployUnit[], k: number): DeployUnit[][] {
  const teams: DeployUnit[][] = Array.from({ length: Math.max(1, k) }, () => []);
  const power = teams.map(() => 0);
  const avg = units.reduce((s, u) => s + u.power, 0) / Math.max(1, units.length);
  const order = [...units].sort(
    (a, b) => Number(b.hero) - Number(a.hero) || b.power - a.power || a.id.localeCompare(b.id),
  );
  for (const u of order) {
    let best = 0;
    let bestCost = Infinity;
    teams.forEach((t, i) => {
      const dup = u.roles.filter((r) => t.some((m) => m.roles.includes(r))).length;
      // ⚠️ Deux héros ne vont jamais ensemble (il n'y en a qu'un, mais la règle tient seule).
      const cost = power[i]! + dup * avg * 0.5 + (u.hero && t.some((m) => m.hero) ? 1e12 : 0);
      if (cost < bestCost - 1e-9) {
        best = i;
        bestCost = cost;
      }
    });
    teams[best]!.push(u);
    power[best]! += u.power;
  }
  return teams.filter((t) => t.length);
}

/**
 * 🧮 Le plus grand nombre d'équipes dont CHACUNE passe le seuil (recherche dichotomique : plus
 * d'équipes = équipes plus faibles). Aucune ne passe → une seule équipe, signalée.
 */
export function formTeams(
  units: readonly DeployUnit[],
  threshold: number,
  win: DeployDeps['win'],
): { teams: DeployUnit[][]; below: boolean } {
  if (!units.length) return { teams: [], below: false };
  const ok = (k: number) => balancedTeams(units, k).every((t) => win(t) >= threshold);
  if (!ok(1)) return { teams: balancedTeams(units, 1), below: true };
  let lo = 1;
  let hi = units.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  return { teams: balancedTeams(units, lo), below: false };
}

/**
 * 🗺️ Pose les équipes pour couvrir l'île au plus vite : chacune va à l'endroit (places et héros
 * permis) qui fait baisser le plus la charge maximale par équipe ; à charge égale, celui où ses
 * membres sont déjà (moins de déplacements).
 */
export function placeTeams(
  teams: readonly DeployUnit[][],
  spots: readonly DeploySpot[],
  points: number,
  trip: DeployDeps['trip'],
): { spotOf: string[]; load: Map<string, number>; count: Map<string, number>; makespan: number } {
  const T = new Map<string, number[]>();
  for (const s of spots)
    T.set(
      s.id,
      Array.from({ length: points }, (_, p) => trip(s.id, p)),
    );
  const room = new Map(spots.map((s) => [s.id, s.seats]));
  const count = new Map<string, number>();
  const spotOf: string[] = new Array<string>(teams.length).fill('base');

  const evaluate = (cnt: Map<string, number>) => {
    const occ = spots.filter((s) => (cnt.get(s.id) ?? 0) > 0);
    const load = new Map<string, number>(occ.map((s) => [s.id, 0]));
    let sum = 0;
    for (let p = 0; p < points; p++) {
      let bs = '';
      let bt = Infinity;
      for (const s of occ) {
        const t = T.get(s.id)![p]!;
        if (t < bt) {
          bt = t;
          bs = s.id;
        }
      }
      if (bs) {
        load.set(bs, load.get(bs)! + bt);
        sum += bt;
      }
    }
    let max = 0;
    for (const [id, l] of load) max = Math.max(max, l / cnt.get(id)!);
    return { load, max, sum };
  };

  // Les plus lourdes d'abord : ce sont elles qui ont le moins d'endroits possibles.
  const order = teams
    .map((_, i) => i)
    .sort((a, b) => teamWeight(teams[b]!) - teamWeight(teams[a]!));
  for (const i of order) {
    const team = teams[i]!;
    const w = teamWeight(team);
    const hasHero = team.some((u) => u.hero);
    let best: { id: string; score: number } | null = null;
    for (const s of spots) {
      if ((room.get(s.id) ?? 0) < w) continue;
      if (hasHero && !s.heroOk) continue;
      const cnt = new Map(count);
      cnt.set(s.id, (cnt.get(s.id) ?? 0) + 1);
      const e = evaluate(cnt);
      const moves = team.filter((u) => u.loc !== s.id).length;
      const score = e.max + e.sum * 1e-6 + moves * 1e-9;
      if (!best || score < best.score) best = { id: s.id, score };
    }
    const at = best?.id ?? 'base';
    spotOf[i] = at;
    count.set(at, (count.get(at) ?? 0) + 1);
    room.set(at, (room.get(at) ?? Infinity) - w);
  }
  const e = evaluate(count);
  return { spotOf, load: e.load, count, makespan: e.max };
}

/** Combien de compétences de soutien sont en double dans l'équipe. */
const dupRoles = (t: readonly DeployUnit[]): number => {
  const seen = new Set<string>();
  let n = 0;
  for (const u of t)
    for (const r of u.roles) {
      if (seen.has(r)) n++;
      seen.add(r);
    }
  return n;
};

/**
 * 🔁 LE MOINS DE DÉPLACEMENTS POSSIBLE (2026-10-11, signalé : « pas assez de place sur les lieux
 * en question »). Les équipes sont équilibrées sans regarder où chacun se trouve : deux lieux
 * pleins pouvaient s'ÉCHANGER des champions, et aucun des deux transferts ne pouvait partir
 * (chacun attend une place que l'autre libère). On échange donc deux membres de deux équipes
 * quand ça fait rester plus de monde sur place — jamais le héros (il pèse 2 places), jamais au
 * prix d'une équipe sous le seuil ni d'une compétence de soutien en double de plus.
 */
export function trimMoves(
  teams: readonly DeployUnit[][],
  spotOf: readonly string[],
  ok: (team: readonly DeployUnit[]) => boolean,
): DeployUnit[][] {
  const out = teams.map((t) => [...t]);
  const stay = (u: DeployUnit, i: number) => (u.loc === spotOf[i] ? 1 : 0);
  for (let round = 0; round < 200; round++) {
    let swapped = false;
    search: for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        if (spotOf[i] === spotOf[j]) continue;
        for (const a of out[i]!)
          for (const b of out[j]!) {
            if (a.hero || b.hero) continue;
            if (stay(b, i) + stay(a, j) <= stay(a, i) + stay(b, j)) continue;
            const ti = out[i]!.map((x) => (x === a ? b : x));
            const tj = out[j]!.map((x) => (x === b ? a : x));
            if (dupRoles(ti) + dupRoles(tj) > dupRoles(out[i]!) + dupRoles(out[j]!)) continue;
            if (!ok(ti) || !ok(tj)) continue;
            out[i] = ti;
            out[j] = tj;
            swapped = true;
            break search;
          }
      }
    if (!swapped) break;
  }
  return out;
}

/** 🧭 La répartition complète : équipes, endroits, et déplacements à faire. */
export function planDeployment(
  units: readonly DeployUnit[],
  spots: readonly DeploySpot[],
  points: number,
  opts: { threshold: number; deps: DeployDeps },
): DeployResult {
  const formed = formTeams(units, opts.threshold, opts.deps.win);
  const below = formed.below;
  const placed = placeTeams(formed.teams, spots, Math.max(1, points), opts.deps.trip);
  const teams = trimMoves(
    formed.teams,
    placed.spotOf,
    (t) => below || opts.deps.win(t) >= opts.threshold,
  );
  const total = Math.max(1, points);
  // Les points de chaque endroit, pour le trajet moyen.
  const zone = new Map<string, number>();
  for (let p = 0; p < points; p++) {
    let bs = '';
    let bt = Infinity;
    for (const [id] of placed.count) {
      const t = opts.deps.trip(id, p);
      if (t < bt) {
        bt = t;
        bs = id;
      }
    }
    if (bs) zone.set(bs, (zone.get(bs) ?? 0) + 1);
  }
  const out: DeployTeam[] = teams.map((units2, i) => {
    const spot = placed.spotOf[i]!;
    const n = zone.get(spot) ?? 0;
    const c = placed.count.get(spot) ?? 1;
    return {
      units: units2,
      spot,
      win: opts.deps.win(units2),
      share: n / total / c,
      avgTrip: n ? (placed.load.get(spot) ?? 0) / n : 0,
    };
  });
  const moves: DeployMove[] = [];
  for (const t of out)
    for (const u of t.units) if (u.loc !== t.spot) moves.push({ unit: u, from: u.loc, to: t.spot });
  return { teams: out, moves, belowThreshold: below, makespan: placed.makespan };
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
