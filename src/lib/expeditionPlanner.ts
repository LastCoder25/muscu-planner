/**
 * 🪄 LE PLANIFICATEUR D'EXPÉDITIONS (2026-10-11, demandé par l'utilisateur : « un bouton qui
 * regarde les champions et le héros disponibles, et où ils sont, regarde les événements de la
 * carte, et propose les expéditions possibles avec une chance de réussite que je règle — au
 * moins 90 % par exemple »).
 *
 * Deux optimisations, au choix du joueur :
 * - `events` : le PLUS D'ÉVÉNEMENTS possible avec les effectifs disponibles, chacun par le
 *   voyage le plus COURT (2026-10-21, demandé : « le facteur le plus important, c'est la durée
 *   la plus courte, compétences des champions et du héros comprises ») — à durée égale, la plus
 *   petite équipe. Avant : le temps occupé (champions × trajet) ;
 * - `xp` : le PLUS D'XP pour les champions, ramenée au temps passé dehors (XP par heure et
 *   par champion engagé) ;
 * - `rifts` (2026-10-15, demandé : « une organisation automatique pour attaquer les failles,
 *   les effectifs les plus proches possibles en optimisant les taux de réussite ») : la page ne
 *   propose que les failles, et on y envoie le monde le plus PROCHE — le plus court
 *   aller-retour, même si l'équipe est plus grande. Une faille refermée vite ne déborde pas ;
 *   l'ordre de service essaie aussi celui de la page (débordement le plus proche d'abord).
 *
 * ⚠️ AUCUNE RÈGLE DE JEU N'EST RECOPIÉE ICI. Le pronostic, le trajet, l'XP et ce qu'une
 * équipe a le droit d'emmener sont INJECTÉS (`PlanDeps`) : la page les branche sur les MÊMES
 * fonctions que l'écran d'envoi et le store (`partyWinChance`, `partyLegMin`, `missionXpFor`,
 * `partySendBlocker`). Un planificateur qui aurait sa propre idée du 🎯 % proposerait des
 * départs que le bouton « Lancer » refuse.
 *
 * Une équipe part d'un endroit (la base, ou la garnison d'un point tenu — une sortie), ou de
 * PLUSIEURS : une ATTAQUE COMBINÉE (2026-10-11, demandé : « la simulation propose de très longs
 * trajets »), où chaque groupe part de chez lui et tous arrivent ensemble. Elle sert quand un lieu
 * dur demande plus de monde qu'un seul endroit proche n'en a : sans elle, seule la base
 * (souvent loin) pouvait fournir l'équipe. Son aller-retour vaut celui du groupe le plus lent.
 *
 * La recherche est GLOUTONNE, et c'est assumé : le vrai optimum (affectation d'un vivier à
 * des lieux sous contrainte de pronostic simulé) est combinatoire, et chaque pronostic coûte
 * jusqu'à ~25 ms. Pour chaque lieu on cherche la PLUS PETITE équipe qui passe le seuil en
 * prenant les plus forts, puis on la REMPLACE membre par membre par les plus faibles qui la
 * laissent au-dessus du seuil — les forts restent disponibles pour les lieux difficiles.
 */

export type PlanMode = 'events' | 'xp' | 'rifts';

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
  /** Chance de victoire 0..1, `null` = rien à combattre (sûr). `kit` = les consommables que
   *  l'équipe emporte (vide sans `PlanOptions.stock`). */
  win(target: T, units: PlanUnit[], kit: readonly string[]): number | null;
  /** Aller-retour en minutes. Plusieurs points de départ (attaque combinée) : celui du groupe
   *  le plus lent — tout le monde arrive ensemble. */
  tripMin(target: T, units: PlanUnit[], kit: readonly string[]): number;
  /** XP totale des champions de l'équipe en cas de victoire. */
  xp(target: T, units: PlanUnit[]): number;
  /** 🎒 Parmi les consommables proposés (`avail`), ceux qui SERVENT à cette équipe vers ce lieu ;
   *  le planificateur n’en retient que le minimum nécessaire. Absent = jamais de consommable. */
  kit?(target: T, units: PlanUnit[], avail: readonly string[]): string[];
}

export interface PlannedTrip<T> {
  target: T;
  units: PlanUnit[];
  /** Chance de victoire 0..1 (1 quand il n'y a rien à combattre). */
  win: number;
  tripMin: number;
  /** XP attendue des champions (XP de victoire × chance). */
  xp: number;
  /** 🎒 Les consommables emportés (déjà comptés dans `win` et `tripMin`). */
  kit: string[];
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
  /** ⚔️ Proposer aussi des attaques combinées (équipe venue de plusieurs endroits). */
  combined?: boolean;
  /** 🎒 Les consommables que le joueur AUTORISE (demandé : « pouvoir rajouter des consommables
   *  sur les simulations »), avec leur quantité en stock. Un voyage n'en emporte QUE si son
   *  effectif ne suffit pas à passer le seuil, et alors le plus petit kit qui le fait passer
   *  (cf. `bestFor`), un de chaque type au plus, tant qu'il en reste : le stock se partage entre
   *  les voyages dans l'ordre où le plan les sert — on ne propose jamais d'emporter ce qu'on n'a
   *  pas. Absent ou vide = simulations sans consommable. */
  stock?: Readonly<Record<string, number>>;
}

/** Combien de remplaçants plus faibles on essaie, au plus, pour chaque membre. */
const SWAP_TRIES = 4;

/** 🎒 Combien de combinaisons de consommables on essaie, au plus, avant de se rabattre sur une
 *  réduction gloutonne (en pratique 5 à 6 consommables servent à un lieu : 31 à 63 combinaisons,
 *  arrêtées à la première taille qui passe). */
const MAX_KIT_TRIES = 64;

/** Les sous-ensembles de `items` de taille `k`, dans l'ordre de `items`. */
function subsetsOf<X>(items: readonly X[], k: number): X[][] {
  if (k === 0) return [[]];
  const out: X[][] = [];
  for (let i = 0; i + k <= items.length; i++)
    for (const rest of subsetsOf(items.slice(i + 1), k - 1)) out.push([items[i]!, ...rest]);
  return out;
}

type Candidate<T> = PlannedTrip<T>;

/**
 * ⏱️ L'XP PAR HEURE d'un voyage (2026-10-12, demandé par l'utilisateur : « un trajet très long
 * empêche de gagner plus d'XP en faisant plus de trajets »). L'XP d'une mission ne dépend pas
 * de la distance : un trajet de 10 h rapporte autant qu'un trajet de 30 min, que l'on aurait
 * refait vingt fois dans le même temps. On compare donc des DÉBITS, jamais de l'XP brute.
 */
const xpPerHour = (t: { xp: number; tripMin: number }) => t.xp / Math.max(1 / 60, t.tripMin / 60);

/** Ce qui classe deux propositions pour un même lieu, ou deux lieux entre eux. */
function score<T>(c: Candidate<T>, mode: PlanMode): number {
  if (mode === 'xp') {
    const champs = c.units.filter((u) => !u.hero).length || 1;
    return xpPerHour(c) / champs;
  }
  // 🕳️ Failles : le plus PROCHE (le plus court aller-retour), même si l'équipe est plus grande.
  if (mode === 'rifts') return -c.tripMin;
  // ⏱️ Événements : la DURÉE du voyage d'abord (2026-10-21, demandé par l'utilisateur), à
  // égalité la plus petite équipe. Avant, le temps occupé (champions × trajet) faisait passer
  // un champion seul à 80 min devant trois champions à 30 min.
  return -c.tripMin - c.units.length / 1000;
}

/**
 * ⚔️ LES PROPOSITIONS DONT LE LIEU EST DÉJÀ ATTAQUÉ S'EFFACENT (2026-10-16, demandé par
 * l'utilisateur : « ne pas proposer d'attaques sur des lieux en cours d'attaque »). Un plan
 * calculé reste affiché : si une équipe part entre-temps vers l'un de ses lieux (envoi manuel,
 * « 🔎 Ouvrir », héros seul), ce lieu quitte les cibles du planificateur, et sa proposition aussi.
 */
export function withoutEngaged<R extends { poi: { id: string } }>(
  rows: readonly R[],
  targets: readonly { id: string }[],
): R[] {
  const ids = new Set(targets.map((t) => t.id));
  return rows.filter((r) => ids.has(r.poi.id));
}

export async function planExpeditions<T extends { id: string }>(
  targets: readonly T[],
  units: readonly PlanUnit[],
  opts: PlanOptions<T>,
): Promise<PlanResult<T> | null> {
  const { deps, threshold, mode } = opts;
  const stock = opts.stock ?? {};
  /** Les consommables encore disponibles dans un stock donné. */
  const availOf = (left: Readonly<Record<string, number>>) =>
    Object.keys(left).filter((id) => (left[id] ?? 0) > 0);
  const memo = new Map<string, number | null>();
  const winOf = async (t: T, team: PlanUnit[], kit: readonly string[]): Promise<number | null> => {
    const key = `${t.id}|${team
      .map((u) => u.id)
      .sort()
      .join(',')}|${[...kit].sort().join(',')}`;
    if (memo.has(key)) return memo.get(key)!;
    await opts.pause?.();
    const w = deps.win(t, team, kit);
    memo.set(key, w);
    return w;
  };
  const passes = (w: number | null) => w === null || w >= threshold;
  // ⭐ Mode XP : le héros seul ne fait apprendre personne (il ne prend aucune part d'XP) — il
  // part toujours avec au moins un champion (2026-10-11, demandé par l'utilisateur).
  const allowed = (t: T, team: PlanUnit[]) =>
    !(mode === 'xp' && team.every((u) => u.hero)) && deps.fits(t, team);

  /**
   * La meilleure équipe pour CE lieu, prise dans `pool`, avec les consommables qu'on y emporte
   * (`kitFor(équipe)`). C'est la recherche gloutonne décrite en tête de fichier ; le kit y est
   * FIXÉ par l'appelant (`bestFor`), jamais choisi ici.
   */
  const searchWith = async (
    t: T,
    pool: PlanUnit[],
    kitFor: (team: PlanUnit[]) => string[],
  ): Promise<Candidate<T> | null> => {
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
          if (!allowed(t, tryTeam)) continue;
          const tw = await winOf(t, tryTeam, kitFor(tryTeam));
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
            if (!allowed(t, alt)) continue;
            const aw = await winOf(t, alt, kitFor(alt));
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
        if (mode === 'events') {
          const q = await quicken(t, picked, w, order, kitFor);
          if (!q) return null;
          picked = q.team;
          w = q.w;
        }
        const win = w ?? 1;
        const kit = kitFor(picked);
        const c: Candidate<T> = {
          target: t,
          units: picked,
          win,
          tripMin: deps.tripMin(t, picked, kit),
          xp: deps.xp(t, picked) * win,
          kit,
        };
        if (!best || score(c, mode) > score(best, mode)) best = c;
      }
    }
    // ⚔️ L'ATTAQUE COMBINÉE : les plus PROCHES d'abord (chacun mesuré depuis chez lui), à égalité
    // les plus forts ; on ajoute du monde jusqu'à passer le seuil. Une équipe venue d'un seul
    // endroit a déjà été essayée plus haut : on ne garde ici que celles de deux endroits ou plus.
    if (opts.combined && origins.length > 1) {
      for (const order of combinedOrders(t, pool)) {
        const kMax = Math.min(opts.maxTeam, order.length);
        for (let k = 2; k <= kMax; k++) {
          if (opts.cancelled?.()) return null;
          const team = order.slice(0, k);
          if (new Set(team.map((u) => u.origin)).size < 2) continue;
          if (!allowed(t, team)) continue;
          const kit = kitFor(team);
          const tw = await winOf(t, team, kit);
          if (!passes(tw)) continue;
          const win = tw ?? 1;
          const c: Candidate<T> = {
            target: t,
            units: team,
            win,
            tripMin: deps.tripMin(t, team, kit),
            xp: deps.xp(t, team) * win,
            kit,
          };
          if (!best || score(c, mode) > score(best, mode)) best = c;
          break;
        }
      }
    }
    return best;
  };

  /**
   * ⏱️ ÉVÉNEMENTS : RACCOURCIR LE VOYAGE (2026-10-21, demandé par l'utilisateur). Le groupe va
   * au pas du plus lent, et un champion 🧭 peut l'accélérer : la recherche par la force ne voit
   * ni l'un ni l'autre. Tant que ça raccourcit le voyage, on essaie d'ÉCHANGER un membre ou
   * d'AJOUTER quelqu'un du même point de départ (un guide), ou de RETIRER un membre (le héros
   * qui ralentit), toujours au-dessus du seuil. Le trajet ne coûte rien à calculer : on ne
   * simule le combat que des équipes plus rapides.
   */
  const quicken = async (
    t: T,
    start: PlanUnit[],
    startW: number | null,
    order: PlanUnit[],
    kitFor: (team: PlanUnit[]) => string[],
  ): Promise<{ team: PlanUnit[]; w: number | null } | null> => {
    let team = start;
    let w = startW;
    const tripOf = (x: PlanUnit[]) => deps.tripMin(t, x, kitFor(x));
    for (let round = 0; round < 4; round++) {
      const cur = tripOf(team);
      const alts: PlanUnit[][] = [];
      if (team.length > 1)
        for (let i = 0; i < team.length; i++) alts.push(team.filter((_, j) => j !== i));
      for (const s of order) {
        if (team.includes(s)) continue;
        for (let i = 0; i < team.length; i++) alts.push(team.map((x, j) => (j === i ? s : x)));
        if (team.length < opts.maxTeam) alts.push([...team, s]);
      }
      // Les plus courts d'abord, à durée égale les plus petits : le premier qui passe gagne.
      const faster = alts
        .map((x) => ({ x, min: tripOf(x) }))
        .filter((a) => a.min < cur && allowed(t, a.x))
        .sort((a, b) => a.min - b.min || a.x.length - b.x.length);
      let moved = false;
      for (const a of faster) {
        if (opts.cancelled?.()) return null;
        const aw = await winOf(t, a.x, kitFor(a.x));
        if (passes(aw)) {
          team = a.x;
          w = aw;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    return { team, w };
  };

  /** ⚔️ Les ordres d'essai d'une attaque combinée : les plus proches d'abord (trajet SANS
   *  consommable : le kit ne doit pas changer qui on appelle), à égalité les plus forts. */
  const combinedOrders = (t: T, pool: PlanUnit[]): PlanUnit[][] => {
    const leg = new Map(pool.map((u) => [u.id, deps.tripMin(t, [u], [])]));
    const near = [...pool].sort((a, b) => leg.get(a.id)! - leg.get(b.id)! || b.power - a.power);
    return near.some((u) => u.hero) ? [near, near.filter((u) => !u.hero)] : [near];
  };

  /**
   * Les PLUS GRANDES équipes que la recherche essaierait (une par point de départ, avec et sans
   * le héros, et la plus grande attaque combinée). Une chance de victoire ne fait que monter
   * quand on ajoute quelqu'un : si AUCUNE ne passe avec un kit donné, la recherche complète ne
   * passera pas non plus ; si l'une passe, elle trouvera une équipe. C'est le test rapide qui
   * évite de relancer toute la recherche pour chaque combinaison de consommables essayée.
   */
  const largestTeams = (t: T, pool: PlanUnit[]): PlanUnit[][] => {
    const out: PlanUnit[][] = [];
    const largest = (order: PlanUnit[], minOrigins: number) => {
      for (let k = Math.min(opts.maxTeam, order.length); k >= 1; k--) {
        const team = order.slice(0, k);
        if (new Set(team.map((u) => u.origin)).size < minOrigins) continue;
        if (allowed(t, team)) return out.push(team);
      }
    };
    const origins = [...new Set(pool.map((u) => u.origin))];
    for (const origin of origins) {
      const local = pool.filter((u) => u.origin === origin).sort((a, b) => b.power - a.power);
      largest(local, 1);
      if (local.some((u) => u.hero))
        largest(
          local.filter((u) => !u.hero),
          1,
        );
    }
    if (opts.combined && origins.length > 1)
      for (const order of combinedOrders(t, pool)) largest(order, 2);
    return out;
  };

  /**
   * La meilleure équipe pour CE lieu, prise dans `pool`, avec le stock `left`.
   *
   * 🎒 LE CONSOMMABLE PALLIE UN MANQUE D'EFFECTIF, ET ON L'ÉCONOMISE (2026-10-12, décision de
   * l'utilisateur : « le consommable est là pour pallier un manque d'effectif pour passer
   * au-dessus du seuil de réussite de l'attaque et des embuscades ; on essaie de les économiser
   * autant que possible »). Donc :
   * 1. l'équipe se forme d'abord SANS consommable — l'effectif passe toujours avant ;
   * 2. seulement si personne ne passe le seuil, on cherche le PLUS PETIT kit (en nombre
   *    d'exemplaires) qui le fait passer — `win` compte l'attaque ET les embuscades de route ;
   * 3. à nombre égal, celui dont le stock est le plus GRAND (on garde les rares) ;
   * 4. si même tout le stock autorisé ne suffit pas, rien n'est emporté (pas de gaspillage).
   */
  const bestFor = async (
    t: T,
    pool: PlanUnit[],
    left: Readonly<Record<string, number>>,
  ): Promise<Candidate<T> | null> => {
    const bare = await searchWith(t, pool, () => []);
    if (bare !== null) return bare;
    const avail = availOf(left);
    if (!deps.kit || !avail.length) return null;
    const kitOf = (team: PlanUnit[], set: readonly string[]) =>
      set.length ? deps.kit!(t, team, set) : [];
    const teams = largestTeams(t, pool);
    // Les candidats : ce qui SERT à au moins une de ces équipes.
    const useful = [...new Set(teams.flatMap((team) => kitOf(team, avail)))];
    const quick = async (set: readonly string[]) => {
      for (const team of teams) {
        if (opts.cancelled?.()) return false;
        if (passes(await winOf(t, team, kitOf(team, set)))) return true;
      }
      return false;
    };
    // 4. Tout le stock autorisé ne suffit pas : on n'en engage aucun.
    if (!useful.length || !(await quick(useful))) return null;
    const qty = (id: string) => left[id] ?? 0;
    // 2-3. Par taille croissante ; à taille égale, le plus petit stock du kit le plus grand,
    // puis la somme, puis l'ordre alphabétique (déterministe).
    let chosen: string[] | null = null;
    let tries = 0;
    for (let size = 1; size <= useful.length && !chosen; size++) {
      const sets = subsetsOf(useful, size).sort((a, b) => {
        const minA = Math.min(...a.map(qty));
        const minB = Math.min(...b.map(qty));
        if (minA !== minB) return minB - minA;
        const sumA = a.reduce((s, id) => s + qty(id), 0);
        const sumB = b.reduce((s, id) => s + qty(id), 0);
        return sumB - sumA || a.join(',').localeCompare(b.join(','));
      });
      for (const set of sets) {
        if (++tries > MAX_KIT_TRIES) break;
        if (await quick(set)) {
          chosen = set;
          break;
        }
        if (opts.cancelled?.()) return null;
      }
      if (tries > MAX_KIT_TRIES) break;
    }
    // Trop de combinaisons : on part de tout ce qui sert et on retire, du plus RARE au plus
    // courant, ce dont on peut se passer.
    if (!chosen) {
      let kept: string[] = [...useful];
      for (const id of [...useful].sort((a, b) => qty(a) - qty(b) || a.localeCompare(b))) {
        const without: string[] = kept.filter((x) => x !== id);
        if (without.length && (await quick(without))) kept = without;
        if (opts.cancelled?.()) return null;
      }
      chosen = kept;
    }
    const set: string[] = chosen;
    return searchWith(t, pool, (team) => kitOf(team, set));
  };

  // 1) Ce que chaque lieu demanderait avec TOUT le vivier : l'ordre dans lequel on les sert.
  const firstPass: Candidate<T>[] = [];
  const unreachable: T[] = [];
  for (const t of targets) {
    const c = await bestFor(t, [...units], stock);
    if (opts.cancelled?.()) return null;
    if (c) firstPass.push(c);
    else unreachable.push(t);
  }
  /** 2) On sert les lieux dans `order`, chacun avec ce qui reste du vivier et du stock. */
  const assign = async (
    order: Candidate<T>[],
    withSpare: boolean,
  ): Promise<{ trips: PlannedTrip<T>[]; missed: T[] } | null> => {
    const used = new Set<string>();
    // 🎒 Le stock qui reste : chaque voyage retenu y prend un exemplaire de chaque consommable.
    const left: Record<string, number> = { ...stock };
    const trips: PlannedTrip<T>[] = [];
    const missed: T[] = [];
    for (const first of order) {
      const pool = units.filter((u) => !used.has(u.id));
      if (!pool.length) {
        missed.push(first.target);
        continue;
      }
      // ⚠️ Recalculer seulement si l'équipe de la première passe a perdu un membre, ou si un des
      // consommables qu'elle emportait n'est plus en stock (pris par un voyage servi avant).
      const stale =
        first.units.some((u) => used.has(u.id)) || first.kit.some((id) => (left[id] ?? 0) < 1);
      const c = stale ? await bestFor(first.target, pool, left) : first;
      if (opts.cancelled?.()) return null;
      if (!c) {
        missed.push(first.target);
        continue;
      }
      for (const u of c.units) used.add(u.id);
      for (const id of c.kit) left[id] = (left[id] ?? 0) - 1;
      trips.push(c);
    }
    // 3) ⭐ Mode XP : un champion resté à la base n'apprend rien. On l'ajoute à l'équipe (même
    // point de départ) où il fait gagner le plus d'XP au total — la chance de victoire ne fait que
    // monter quand on ajoute quelqu'un, mais le partage d'XP et le trajet (au pas du plus lent)
    // peuvent coûter : on ne le prend que si l'XP PAR HEURE de ce voyage MONTE (un voyage long
    // rapporte plus par trajet, mais le court se refait plusieurs fois dans le même temps).
    // 🎒 Le voyage garde ses consommables : aucun n'est pris en plus dans le stock. ⚠️ Le
    // nouveau venu ne les rend pas inutiles : un voyage n'en emporte que si TOUT l'effectif
    // restant à son point de départ ne suffisait pas (`bestFor`), et le restant, c'est lui.
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
          const kit = tr.kit.length && deps.kit ? deps.kit(tr.target, team, tr.kit) : [];
          const w = (await winOf(tr.target, team, kit)) ?? 1;
          const xp = deps.xp(tr.target, team) * w;
          const tripMin = deps.tripMin(tr.target, team, kit);
          const gain = xpPerHour({ xp, tripMin }) - xpPerHour(tr);
          if (gain > bestGain) {
            bestGain = gain;
            bestI = i;
            bestTrip = { target: tr.target, units: team, win: w, tripMin, xp, kit };
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
  // 🕳️ Failles : on essaie aussi l'ordre de la page (la plus URGENTE d'abord) et « la plus proche
  // d'abord ».
  if (mode === 'rifts')
    orders.unshift(
      [...firstPass],
      [...firstPass].sort((x, y) => score(y, mode) - score(x, mode)),
    );
  // ⏱️ Le DÉBIT du plan : chaque équipe refait son voyage en boucle, donc on somme l'XP par heure.
  const xpRate = (r: { trips: PlannedTrip<T>[] }) => r.trips.reduce((s, t) => s + xpPerHour(t), 0);
  // 🕳️ Failles : l'urgence d'un plan = la somme des rangs (dans l'ordre de la page) des lieux
  // servis — plus petite = les plus pressées sont couvertes.
  const rankOf = new Map(targets.map((t, i) => [t.id, i]));
  const urgency = (r: { trips: PlannedTrip<T>[] }) =>
    r.trips.reduce((s, t) => s + (rankOf.get(t.target.id) ?? 0), 0);
  // ⏱️ Failles et événements : le temps pour y être (Σ aller-retour), pas le temps champion ;
  // à égalité, le moins de monde engagé.
  const totalMin = (r: { trips: PlannedTrip<T>[] }) =>
    r.trips.reduce((s, t) => s + t.tripMin + t.units.length / 1000, 0);
  let pick: { trips: PlannedTrip<T>[]; missed: T[] } | null = null;
  for (const order of orders) {
    const r = await assign(order, mode === 'xp');
    if (!r) return null;
    const sameCount = !!pick && r.trips.length === pick.trips.length;
    const better = !pick
      ? true
      : mode === 'xp'
        ? xpRate(r) > xpRate(pick)
        : r.trips.length > pick.trips.length ||
          // 🕳️ Failles, à nombre égal : les plus URGENTES servies avant la plus proche.
          (sameCount && mode === 'rifts' && urgency(r) < urgency(pick)) ||
          (sameCount &&
            (mode !== 'rifts' || urgency(r) === urgency(pick)) &&
            totalMin(r) < totalMin(pick));
    if (better) pick = r;
  }
  const trips = pick!.trips;
  unreachable.push(...pick!.missed);
  trips.sort((a, b) =>
    mode === 'xp'
      ? score(b, mode) - score(a, mode)
      : mode === 'rifts'
        ? (rankOf.get(a.target.id) ?? 0) - (rankOf.get(b.target.id) ?? 0)
        : a.tripMin - b.tripMin,
  );
  return { trips, unreachable };
}
