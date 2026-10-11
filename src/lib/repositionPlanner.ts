/**
 * 🧭 LA RÉPARTITION DES CHAMPIONS ET DU HÉROS POUR LE FARM DE LA CARTE (2026-10-11, demandé
 * par l'utilisateur : « une répartition de mes champions et du héros sur les lieux fixes pris
 * et la base, pour optimiser le farm de la carte — couvrir le plus de lieux possible en
 * optimisant les temps de trajet »).
 *
 * Depuis la v1.104 un champion posté ne DÉFEND pas un lieu fixe (seuls les miliciens le font) :
 * il y produit et en part. Un lieu fixe est donc d'abord un POINT DE DÉPART plus proche des
 * événements. La répartition ne vise que ça.
 *
 * Elle part des ÉQUIPES que le planificateur a choisies (qui va où, au seuil de réussite voulu
 * — la réussite ne dépend pas de l'endroit d'où l'on part) et cherche, pour chacune, l'endroit
 * d'où ses expéditions seront les plus courtes :
 * - une équipe part d'UN seul endroit : ceux qui n'y sont pas doivent d'abord s'y rendre ;
 * - un déplacement se paie UNE fois, le trajet gagné se regagne à CHAQUE expédition : on
 *   l'amortit sur `payback` expéditions, et on ne bouge que si ça rapporte ;
 * - un lieu fixe n'a que ses places de champion (le héros en prend 2), la base est illimitée.
 *
 * ⚠️ Aucune règle de jeu ici : trajets, temps de déplacement et places sont INJECTÉS.
 */

export interface RepoUnit {
  id: string;
  hero: boolean;
  /** Où il est : `'base'` ou l'id du lieu fixe où il est posté. */
  loc: string;
}

export interface RepoTeam<T> {
  target: T;
  units: RepoUnit[];
}

export interface RepoDeps<T> {
  /** Aller-retour (minutes) d'une expédition de l'équipe vers sa cible, partie de `origin`. */
  tripMin(team: RepoTeam<T>, origin: string): number;
  /** Temps (minutes) pour que `unit` rejoigne `to` depuis là où il est. */
  moveMin(unit: RepoUnit, to: string): number;
  /** `to` peut-il accueillir ce membre (le héros n'entre pas partout) ? */
  canHost(unit: RepoUnit, to: string): boolean;
}

export interface RepoOptions {
  /** Les places de champion libres de chaque lieu fixe (la base n'y figure pas : illimitée). */
  free: Record<string, number>;
  /** Sur combien d'expéditions on amortit un déplacement. */
  payback: number;
}

export interface RepoAssignment<T> {
  team: RepoTeam<T>;
  /** D'où l'équipe partira. */
  origin: string;
  tripMin: number;
  /** L'aller-retour si on ne bouge personne (`null` : l'équipe n'est pas réunie). */
  nowTripMin: number | null;
  /** Le temps du plus long déplacement pour réunir l'équipe à `origin` (0 = personne ne bouge). */
  moveMin: number;
}

export interface RepoMove {
  unit: RepoUnit;
  from: string;
  to: string;
  min: number;
}

export interface RepoResult<T> {
  assignments: RepoAssignment<T>[];
  moves: RepoMove[];
}

/** Ce qu'un membre occupe : le héros prend 2 places. */
export const repoWeight = (u: RepoUnit): number => (u.hero ? 2 : 1);

export function planReposition<T>(
  teams: readonly RepoTeam<T>[],
  deps: RepoDeps<T>,
  opts: RepoOptions,
): RepoResult<T> {
  const free: Record<string, number> = { ...opts.free };
  const spots = ['base', ...Object.keys(opts.free)];
  const room = (spot: string) => (spot === 'base' ? Number.POSITIVE_INFINITY : (free[spot] ?? 0));

  /** Le coût amorti de partir de `origin` : trajet + déplacement réparti sur `payback`. */
  const option = (team: RepoTeam<T>, origin: string) => {
    if (!team.units.every((u) => deps.canHost(u, origin))) return null;
    const movers = team.units.filter((u) => u.loc !== origin);
    const moveMin = movers.reduce((m, u) => Math.max(m, deps.moveMin(u, origin)), 0);
    const tripMin = deps.tripMin(team, origin);
    return { origin, tripMin, moveMin, cost: tripMin + moveMin / Math.max(1, opts.payback) };
  };

  // Ce que coûte de NE RIEN changer : partir de là où l'équipe est déjà réunie.
  const stay = (team: RepoTeam<T>) => {
    const locs = new Set(team.units.map((u) => u.loc));
    return locs.size === 1 ? option(team, [...locs][0]!) : null;
  };

  // On sert d'abord les équipes qui ont le plus à gagner : les places des lieux fixes vont là
  // où elles rapportent le plus.
  const ranked = teams
    .map((team) => {
      const s = stay(team);
      const opts2 = spots.map((sp) => option(team, sp)).filter((o) => !!o);
      const best = opts2.reduce((a, b) => (b.cost < a.cost ? b : a), opts2[0]!);
      return { team, s, gain: (s?.cost ?? best.cost * 2) - best.cost };
    })
    .sort((a, b) => b.gain - a.gain);

  // Une équipe ne libère sa place qu'une fois réaffectée : servir les équipes dans un seul
  // ordre laisserait une place prise par quelqu'un qui allait partir. On repasse donc jusqu'à
  // ce que plus rien ne bouge — chaque passe ne fait que baisser le coût total.
  type Pick = NonNullable<ReturnType<typeof option>>;
  const chosen = new Map<RepoTeam<T>, Pick>();
  const claim = (team: RepoTeam<T>, p: Pick, sign: 1 | -1) => {
    for (const un of team.units) {
      if (un.loc === p.origin) continue;
      if (un.loc !== 'base') free[un.loc] = (free[un.loc] ?? 0) + sign * repoWeight(un);
      if (p.origin !== 'base') free[p.origin] = (free[p.origin] ?? 0) - sign * repoWeight(un);
    }
  };
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const { team, s } of ranked) {
      const prev = chosen.get(team);
      if (prev) claim(team, prev, -1);
      const need = (sp: string) =>
        team.units.filter((un) => un.loc !== sp).reduce((n, un) => n + repoWeight(un), 0);
      let best: Pick | null = null;
      for (const sp of spots) {
        if (need(sp) > room(sp)) continue;
        const o = option(team, sp);
        if (!o) continue;
        if (!best || o.cost < best.cost - 1e-9) best = o;
      }
      // ⚠️ Rester sur place ne demande aucune place, et on ne bouge que si l'endroit trouvé
      // est STRICTEMENT meilleur.
      if (s && (!best || best.cost >= s.cost - 1e-9)) best = s;
      if (!best) {
        if (prev) chosen.delete(team);
        changed ||= !!prev;
        continue;
      }
      claim(team, best, 1);
      chosen.set(team, best);
      if (prev?.origin !== best.origin) changed = true;
    }
    if (!changed) break;
  }

  const assignments: RepoAssignment<T>[] = [];
  const moves: RepoMove[] = [];
  for (const { team, s } of ranked) {
    const best = chosen.get(team);
    if (!best) continue;
    for (const un of team.units)
      if (un.loc !== best.origin)
        moves.push({ unit: un, from: un.loc, to: best.origin, min: deps.moveMin(un, best.origin) });
    assignments.push({
      team,
      origin: best.origin,
      tripMin: best.tripMin,
      nowTripMin: s ? s.tripMin : null,
      moveMin: best.moveMin,
    });
  }
  return { assignments, moves };
}
