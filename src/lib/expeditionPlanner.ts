/**
 * 🪄 LE PLANIFICATEUR D'EXPÉDITIONS (2026-10-11, demandé par l'utilisateur : « un bouton qui
 * regarde les champions et le héros disponibles, et où ils sont, regarde les événements de la
 * carte, et propose les expéditions possibles avec une chance de réussite que je règle — au
 * moins 90 % par exemple »).
 *
 * Deux optimisations, au choix du joueur :
 * - `events` : le PLUS D'ÉVÉNEMENTS possible avec les effectifs disponibles, puis le MOINS DE
 *   TEMPS (les équipes les plus petites d'abord, à égalité les trajets les plus courts) ;
 * - `xp` : le PLUS D'XP pour les champions, ramenée au temps passé dehors (XP par heure et
 *   par champion engagé).
 *
 * ⚠️ AUCUNE RÈGLE DE JEU N'EST RECOPIÉE ICI. Le pronostic, le trajet, l'XP et ce qu'une
 * équipe a le droit d'emmener sont INJECTÉS (`PlanDeps`) : la page les branche sur les MÊMES
 * fonctions que l'écran d'envoi et le store (`partyWinChance`, `partyLegMin`, `missionXpFor`,
 * `partySendBlocker`). Un planificateur qui aurait sa propre idée du 🎯 % proposerait des
 * départs que le bouton « Lancer » refuse.
 *
 * Une équipe part d'UN seul endroit (la base, ou la garnison d'un point tenu — une sortie) :
 * un planificateur ne propose jamais d'attaque combinée.
 *
 * La recherche est GLOUTONNE, et c'est assumé : le vrai optimum (affectation d'un vivier à
 * des lieux sous contrainte de pronostic simulé) est combinatoire, et chaque pronostic coûte
 * jusqu'à ~25 ms. Pour chaque lieu on cherche la PLUS PETITE équipe qui passe le seuil en
 * prenant les plus forts, puis on la REMPLACE membre par membre par les plus faibles qui la
 * laissent au-dessus du seuil — les forts restent disponibles pour les lieux difficiles.
 */

export type PlanMode = 'events' | 'xp';

/** Un membre possible : un champion ou le héros, et l'endroit d'où il part. */
export interface PlanUnit {
  id: string;
  hero: boolean;
  /** `'base'` ou l'id du point tenu où il est en garnison. */
  origin: string;
  /** Sa puissance (`combatPowerRaw`) : sert seulement à l'ORDRE d'essai. */
  power: number;
}

export interface PlanDeps<T> {
  /** L'équipe a-t-elle le droit de partir vers ce lieu (taille, héros, filon…) ? */
  fits(target: T, units: PlanUnit[]): boolean;
  /** Chance de victoire 0..1, `null` = rien à combattre (sûr). */
  win(target: T, units: PlanUnit[]): number | null;
  /** Aller-retour en minutes. */
  tripMin(target: T, units: PlanUnit[]): number;
  /** XP totale des champions de l'équipe en cas de victoire. */
  xp(target: T, units: PlanUnit[]): number;
}

export interface PlannedTrip<T> {
  target: T;
  units: PlanUnit[];
  /** Chance de victoire 0..1 (1 quand il n'y a rien à combattre). */
  win: number;
  tripMin: number;
  /** XP attendue des champions (XP de victoire × chance). */
  xp: number;
}

export interface PlanResult<T> {
  trips: PlannedTrip<T>[];
  /** Les lieux qu'aucune équipe disponible n'atteint au seuil demandé. */
  unreachable: T[];
}

export interface PlanOptions<T> {
  /** Chance minimale de réussite (0..1). */
  threshold: number;
  mode: PlanMode;
  /** Taille d'équipe au plus essayée (une tanière n'a pas de plafond). */
  maxTeam: number;
  deps: PlanDeps<T>;
  /** Rend la main au navigateur entre deux pronostics (l'écran ne fige pas). */
  pause?: () => Promise<void>;
  /** Un nouveau calcul a démarré : celui-ci s'arrête. */
  cancelled?: () => boolean;
}

/** Combien de remplaçants plus faibles on essaie, au plus, pour chaque membre. */
const SWAP_TRIES = 4;

interface Candidate<T> {
  target: T;
  units: PlanUnit[];
  win: number;
  tripMin: number;
  xp: number;
}

/** Ce qui classe deux propositions pour un même lieu, ou deux lieux entre eux. */
function score<T>(c: Candidate<T>, mode: PlanMode): number {
  if (mode === 'xp') {
    const champs = c.units.filter((u) => !u.hero).length || 1;
    return c.xp / champs / Math.max(1 / 60, c.tripMin / 60);
  }
  // Moins de membres d'abord (un vivier fait plus d'événements), puis le trajet le plus court.
  return -(c.units.length * 1e6 + c.tripMin);
}

export async function planExpeditions<T extends { id: string }>(
  targets: readonly T[],
  units: readonly PlanUnit[],
  opts: PlanOptions<T>,
): Promise<PlanResult<T> | null> {
  const { deps, threshold, mode } = opts;
  const memo = new Map<string, number | null>();
  const winOf = async (t: T, team: PlanUnit[]): Promise<number | null> => {
    const key = `${t.id}|${team
      .map((u) => u.id)
      .sort()
      .join(',')}`;
    if (memo.has(key)) return memo.get(key)!;
    await opts.pause?.();
    const w = deps.win(t, team);
    memo.set(key, w);
    return w;
  };
  const passes = (w: number | null) => w === null || w >= threshold;

  /** La meilleure équipe pour CE lieu, prise dans `pool`. */
  const bestFor = async (t: T, pool: PlanUnit[]): Promise<Candidate<T> | null> => {
    const origins = [...new Set(pool.map((u) => u.origin))];
    let best: Candidate<T> | null = null;
    for (const origin of origins) {
      const local = pool.filter((u) => u.origin === origin).sort((a, b) => b.power - a.power);
      // Avec le héros, puis sans lui : il peut être refusé (filon) ou ne rien apporter.
      const orders = local.some((u) => u.hero) ? [local, local.filter((u) => !u.hero)] : [local];
      for (const order of orders) {
        let team: PlanUnit[] | null = null;
        let w: number | null = null;
        const kMax = Math.min(opts.maxTeam, order.length);
        for (let k = 1; k <= kMax; k++) {
          if (opts.cancelled?.()) return null;
          const tryTeam = order.slice(0, k);
          if (!deps.fits(t, tryTeam)) continue;
          const tw = await winOf(t, tryTeam);
          if (passes(tw)) {
            team = tryTeam;
            w = tw;
            break;
          }
        }
        if (!team) continue;
        let picked: PlanUnit[] = team;
        // 🪶 On garde les forts pour plus tard : chaque membre, du plus fort au plus faible,
        // est remplacé par le plus FAIBLE inemployé qui laisse l'équipe au-dessus du seuil.
        for (let i = 0; i < picked.length; i++) {
          const cur = picked[i]!;
          const spare = order
            .filter((u) => !picked.includes(u) && u.power < cur.power)
            .sort((a, b) => a.power - b.power)
            .slice(0, SWAP_TRIES);
          for (const s of spare) {
            if (opts.cancelled?.()) return null;
            const alt: PlanUnit[] = picked.map((u, j) => (j === i ? s : u));
            if (!deps.fits(t, alt)) continue;
            const aw = await winOf(t, alt);
            // ⭐ Mode XP : on ne cède pas un membre qui fait gagner de l'XP à l'équipe (🎓 Mentor,
            // champion en retard qui touche la prime de rattrapage) contre un plus faible qui en
            // rapporte moins — le remplacement ne doit jamais faire BAISSER l'XP attendue.
            const keepsXp =
              mode !== 'xp' || deps.xp(t, alt) * (aw ?? 1) >= deps.xp(t, picked) * (w ?? 1);
            if (passes(aw) && keepsXp) {
              picked = alt;
              w = aw;
              break;
            }
          }
        }
        const win = w ?? 1;
        const c: Candidate<T> = {
          target: t,
          units: picked,
          win,
          tripMin: deps.tripMin(t, picked),
          xp: deps.xp(t, picked) * win,
        };
        if (!best || score(c, mode) > score(best, mode)) best = c;
      }
    }
    return best;
  };

  // 1) Ce que chaque lieu demanderait avec TOUT le vivier : l'ordre dans lequel on les sert.
  const firstPass: Candidate<T>[] = [];
  const unreachable: T[] = [];
  for (const t of targets) {
    const c = await bestFor(t, [...units]);
    if (opts.cancelled?.()) return null;
    if (c) firstPass.push(c);
    else unreachable.push(t);
  }
  /** 2) On sert les lieux dans `order`, chacun avec ce qui reste du vivier. */
  const assign = async (
    order: Candidate<T>[],
    withSpare: boolean,
  ): Promise<{ trips: PlannedTrip<T>[]; missed: T[] } | null> => {
    const used = new Set<string>();
    const trips: PlannedTrip<T>[] = [];
    const missed: T[] = [];
    for (const first of order) {
      const pool = units.filter((u) => !used.has(u.id));
      if (!pool.length) {
        missed.push(first.target);
        continue;
      }
      // ⚠️ Recalculer seulement si l'équipe de la première passe a perdu un membre.
      const c = first.units.some((u) => used.has(u.id)) ? await bestFor(first.target, pool) : first;
      if (opts.cancelled?.()) return null;
      if (!c) {
        missed.push(first.target);
        continue;
      }
      for (const u of c.units) used.add(u.id);
      trips.push(c);
    }
    // 3) ⭐ Mode XP : un champion resté à la base n'apprend rien. On l'ajoute à l'équipe (même
    // point de départ) où il fait gagner le plus d'XP au total — la chance de victoire ne fait que
    // monter quand on ajoute quelqu'un, mais le partage d'XP et le trajet (au pas du plus lent)
    // peuvent coûter : on ne le prend que si le total MONTE.
    if (withSpare) {
      const spare = units
        .filter((u) => !used.has(u.id) && !u.hero)
        .sort((a, b) => a.power - b.power);
      for (const s of spare) {
        let bestI = -1;
        let bestTrip: PlannedTrip<T> | null = null;
        let bestGain = 0;
        for (let i = 0; i < trips.length; i++) {
          const tr = trips[i]!;
          if (tr.units[0]!.origin !== s.origin) continue;
          const team = [...tr.units, s];
          if (!deps.fits(tr.target, team)) continue;
          if (opts.cancelled?.()) return null;
          const w = (await winOf(tr.target, team)) ?? 1;
          const xp = deps.xp(tr.target, team) * w;
          if (xp - tr.xp > bestGain) {
            bestGain = xp - tr.xp;
            bestI = i;
            bestTrip = {
              target: tr.target,
              units: team,
              win: w,
              tripMin: deps.tripMin(tr.target, team),
              xp,
            };
          }
        }
        if (bestTrip) {
          trips[bestI] = bestTrip;
          used.add(s.id);
        }
      }
    }
    return { trips, missed };
  };

  // ⚠️ L’ordre de service décide de qui reste pour la suite : on essaie l’ordre « petites
  // équipes d’abord » ET l’ordre « XP par heure d’abord », et on garde le meilleur selon
  // l’optimisation choisie (mesuré sur un vrai vivier : aucun des deux ne gagne toujours).
  const orders = (['events', 'xp'] as PlanMode[]).map((m) =>
    [...firstPass].sort((x, y) => score(y, m) - score(x, m)),
  );
  const totalXp = (r: { trips: PlannedTrip<T>[] }) => r.trips.reduce((s, t) => s + t.xp, 0);
  const totalMin = (r: { trips: PlannedTrip<T>[] }) => r.trips.reduce((s, t) => s + t.tripMin, 0);
  let pick: { trips: PlannedTrip<T>[]; missed: T[] } | null = null;
  for (const order of orders) {
    const r = await assign(order, mode === 'xp');
    if (!r) return null;
    const better = !pick
      ? true
      : mode === 'xp'
        ? totalXp(r) > totalXp(pick)
        : r.trips.length > pick.trips.length ||
          (r.trips.length === pick.trips.length && totalMin(r) < totalMin(pick));
    if (better) pick = r;
  }
  const trips = pick!.trips;
  unreachable.push(...pick!.missed);
  trips.sort((a, b) => (mode === 'xp' ? score(b, mode) - score(a, mode) : a.tripMin - b.tripMin));
  return { trips, unreachable };
}
