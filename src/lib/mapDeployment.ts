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
 * importe où chacun se trouve — SAUF les unités IMMOBILES (`DeployUnit.fixed`, 2026-10-15,
 * demandé : « disponible même si tous les effectifs ne sont pas rentrés : des champions ne
 * peuvent pas être bougés, on affecte les autres en fonction de l'état actuel »). Une unité
 * immobile (en route, à l'infirmerie, en sortie…) reste à l'endroit où elle sera : elle y
 * compte (force, vitesse, soutiens) et y occupe sa place ; seuls les autres sont placés. La DÉFENSE n'est pas l'affaire de cette fonction : la garde de
 * base d'un lieu fixe, ce sont les miliciens ; les champions y sont un plus qu'on ignore ici.
 *
 * 🧭 SOUTIENS (2026-10-15, demandé : « des garnisons les plus efficaces et fortes possibles pour
 * couvrir le plus de carte, attaquer le plus de lieux et avec la meilleure vitesse ») :
 * - la VITESSE de chaque garnison vient de ceux qui y sont postés (`keep`, injecté : la règle des
 *   missions). Un porteur 🧭 accélère toute sa garnison, et deux se cumulent moins bien qu'un dans
 *   chacune : le calcul les ÉTALE de lui-même ;
 * - OBJECTIF MIXTE (`easyForce`) : 15 % du coût vient d'un lieu DUR (`force`, réunie depuis les
 *   garnisons voisines), 85 % d'un lieu FACILE (`easyForce`, réunie de même) : une garnison qui
 *   suffit seule pour un lieu facile n'attend personne. On y compte aussi (30 %) la DEUXIÈME
 *   garnison la plus proche, celle qui part si la première est engagée : de quoi lancer
 *   plusieurs attaques en parallèle. Les poids sont MESURÉS (`DEPLOY_SOLO_SHARE`) ;
 * - les autres SOUTIENS d'attaque (⛑️ premiers secours, 🎓 mentor, 🐫 cargaison, `support`
 *   injecté, 0..1, à rendement décroissant) allègent un peu le temps de la garnison pour un lieu
 *   facile : un porteur de plus là où il n'y en a pas vaut plus qu'un second au même endroit.
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
  /** ⏳ Immobile : il reste à `loc` (il y compte et y prend sa place), jamais déplacé. */
  fixed?: boolean;
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
  /** Trajet (minutes, aller) de l'endroit `spot` vers le point d'échantillon n° `point`, pour
   *  une équipe SANS compétence de vitesse. */
  trip: (spot: string, point: number) => number;
  /** Ce que la garnison `members` fait du trajet ci-dessus (multiplicateur ; 1 par défaut). */
  keep?: (members: readonly DeployUnit[]) => number;
  /** Ses soutiens d'attaque, 0..1 (0 par défaut). */
  support?: (members: readonly DeployUnit[]) => number;
}

/** 🧭 Part du coût portée par les lieux FACILES (le reste : les lieux durs). ⚠️ MESURÉE
 *  (2026-10-15, banc d'attaques jouées sur le roster réel, cf. CLAUDE.md) : 0,85 avec une
 *  garnison de secours à 0,3 bat 0,5 sans secours sur les 12 scénarios. */
const DEPLOY_SOLO_SHARE = 0.85;
/** 🔁 Part du temps « lieu facile » portée par la DEUXIÈME garnison la plus proche (celle qui
 *  part si la première est déjà engagée) : c'est ce qui permet plusieurs attaques à la fois. */
const DEPLOY_BACKUP = 0.3;
/** 🔁 Le secours ne s'allume qu'au-delà de ce rapport « force du vivier / force d'un lieu
 *  facile », et il est entier une unité plus haut : il faut de quoi prendre DEUX lieux faciles.
 *  ⚠️ MESURÉ sur les 5 îles (160 scénarios) : sans ce seuil, un petit vivier s'éparpillait un
 *  champion par lieu et faisait moins bien que la v1.199 (7 scénarios, jusqu'à −9 %). */
const DEPLOY_BACKUP_FROM = 1;
/** 🛡️ Garde-fou : la recherche est refaite SANS secours, et ce plan-là est gardé si celui avec
 *  secours y perd plus de 10 %. ⚠️ MESURÉ sur les 5 îles : −21,9 % de temps contre −20,8 % sans
 *  garde-fou, mêmes attaques simultanées, 2 scénarios moins bons que la v1.199 au lieu de 4. */
const DEPLOY_GUARD = 0.1;
/** 🎯 Échelle des forces visées : l'escorte de RÉFÉRENCE du rang surestime ce qu'il faut
 *  vraiment pour gagner un lieu (mesuré : 0,4 à 0,9 de la force « facile » selon l'île). Visée
 *  trop haut, la recherche croyait qu'aucune garnison ne suffit seule et éparpillait de petites
 *  garnisons à additionner. ⚠️ MESURÉ sur les 5 îles (160 scénarios, attaques jouées) : facile
 *  × 0,5 et difficile × 0,6 → −29 % de temps et +0,91 attaque simultanée face à la v1.199
 *  (−22 % et +0,54 sans), aucun scénario moins bon ; plus bas, certains le redeviennent.
 *  Tient à 90 % de victoire exigés (−27 %, +0,86). */
export const DEPLOY_EASY_K = 0.5;
export const DEPLOY_HARD_K = 0.6;
/** ⛑️🎓🐫 Ce que des soutiens complets retirent au temps d'une garnison, pour un lieu facile. */
const DEPLOY_SUPPORT_W = 0.2;

/** 🔧 Réglages de la recherche (le banc de mesure en compare plusieurs ; le jeu garde les
 *  valeurs par défaut). Couper vitesse, soutiens et lieu facile, le second départ et l'échelle
 *  de la force difficile (`hardK: 1`) rend le calcul de la v1.199 (`backup` et le garde-fou
 *  n'agissent que sur le lieu facile). */
export interface DeployTune {
  soloShare?: number;
  supportW?: number;
  noSpeed?: boolean;
  noSupport?: boolean;
  noEasy?: boolean;
  backup?: number;
  /** Seuil du secours (`DEPLOY_BACKUP_FROM`). */
  backupFrom?: number;
  /** Garde-fou (`DEPLOY_GUARD`) ; `null` le coupe. */
  guard?: number | null;
  /** Échelles des forces visées (`DEPLOY_EASY_K` / `DEPLOY_HARD_K`). */
  easyK?: number;
  hardK?: number;
  /** Le seul départ glouton (la recherche d'avant la v1.202). */
  singleStart?: boolean;
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
  for (let p = 0; p < order.length; p++)
    sum += pointReach(
      order[p]!.map((s) => ({ pw: power.get(s) ?? 0, t: trips.get(s)![p]! })),
      force,
    );
  return sum / order.length;
}

/** ⏱️ Le temps d'UN point (cf. `reachTime`), les endroits déjà triés du plus proche au plus loin. */
function pointReach(near: readonly { pw: number; t: number }[], force: number): number {
  let cum = 0;
  let t = 0;
  let mass = 0;
  for (const x of near) {
    if (x.pw <= 0) continue;
    t = x.t;
    mass += Math.min(x.pw, force - cum) * t;
    cum += x.pw;
    if (cum >= force) break;
  }
  if (cum <= 0) return 0;
  const last = cum >= force ? t : (t * force) / cum;
  if (cum < force) mass += (force - cum) * last;
  return (last + mass / force) / 2;
}

type PlanArgs = Parameters<typeof planStations>;

/** 🧭 La répartition : où mettre chacun (cf. l'en-tête). D'une traite (tests, banc). */
export function planStations(
  units: readonly DeployUnit[],
  spots: readonly DeploySpot[],
  points: number,
  opts: {
    force: number;
    /** La force d'un lieu FACILE, qu'une garnison doit pouvoir prendre seule (objectif mixte).
     *  Absente : seule l'attaque combinée compte. */
    easyForce?: number;
    deps: DeployDeps;
    tune?: DeployTune;
  },
): DeployResult {
  const run = planSteps(units, spots, points, opts);
  for (;;) {
    const r = run.next();
    if (r.done) return r.value;
  }
}

/**
 * ⏳ La même répartition, en RENDANT LA MAIN à l'écran toutes les `sliceMs` : le calcul prend
 * ~1 s sur un roster complet, et un calcul qui bloque l'affichage fige l'app sans même laisser
 * le ⏳ se dessiner (leçon de l'équipement conseillé, v0.744). Résultat identique.
 */
export async function planStationsAsync(
  ...args: [...PlanArgs, sliceMs?: number]
): Promise<DeployResult> {
  const [units, spots, points, opts, sliceMs = 40] = args;
  const run = planSteps(units, spots, points, opts);
  let since = Date.now();
  for (;;) {
    const r = run.next();
    if (r.done) return r.value;
    if (Date.now() - since >= sliceMs) {
      await new Promise((res) => setTimeout(res, 0));
      since = Date.now();
    }
  }
}

/** Le calcul, découpé : un `yield` après chaque essai de répartition. */
function* planSteps(
  units: readonly DeployUnit[],
  spots: readonly DeploySpot[],
  points: number,
  opts: {
    force: number;
    /** La force d'un lieu FACILE, qu'une garnison doit pouvoir prendre seule (objectif mixte).
     *  Absente : seule l'attaque combinée compte. */
    easyForce?: number;
    deps: DeployDeps;
    tune?: DeployTune;
  },
): Generator<void, DeployResult> {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const trips = new Map(
    spots.map((s) => [s.id, Array.from({ length: points }, (_, p) => opts.deps.trip(s.id, p))]),
  );
  const tune = opts.tune ?? {};
  const keepOf = (!tune.noSpeed && opts.deps.keep) || (() => 1);
  const supportOf = (!tune.noSupport && opts.deps.support) || (() => 0);
  const soloShare = tune.soloShare ?? DEPLOY_SOLO_SHARE;
  const supportW = tune.supportW ?? DEPLOY_SUPPORT_W;
  const backupBase = tune.backup ?? DEPLOY_BACKUP;
  // Une garnison donnée a toujours la même vitesse et les mêmes soutiens : on ne les recalcule
  // pas à chaque essai (la recherche en fait des milliers).
  const memo = new Map<string, { k: number; sup: number }>();
  const traitsOf = (members: DeployUnit[]) => {
    const key = members
      .map((m) => m.id)
      .sort()
      .join('|');
    let v = memo.get(key);
    if (!v) {
      v = { k: keepOf(members), sup: supportOf(members) };
      memo.set(key, v);
    }
    return v;
  };
  const easy =
    tune.noEasy || opts.easyForce === undefined
      ? undefined
      : opts.easyForce * (tune.easyK ?? DEPLOY_EASY_K);
  const hardForce = opts.force * (tune.hardK ?? DEPLOY_HARD_K);
  const totalPw = units.reduce((s, u) => s + Math.max(0, u.power), 0);
  const pwRatio = easy && easy > 0 ? totalPw / easy : Infinity;
  const backupFrom = tune.backupFrom ?? DEPLOY_BACKUP_FROM;
  let backup = backupBase * Math.min(1, Math.max(0, pwRatio - backupFrom));
  const guard = tune.guard === undefined ? DEPLOY_GUARD : tune.guard;
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

  /** Les garnisons occupées : force, vitesse, soutiens. */
  const garrisons = () => {
    const m = new Map<string, DeployUnit[]>();
    for (const u of units) {
      const s = at.get(u.id);
      if (!s) continue;
      const list = m.get(s);
      if (list) list.push(u);
      else m.set(s, [u]);
    }
    return [...m].map(([id, members]) => ({
      id,
      pw: members.reduce((a, u) => a + u.power, 0),
      ...traitsOf(members),
    }));
  };
  // ⚡ Tampons réutilisés : `evaluate` tourne des milliers de fois (chaque essai de la
  // recherche), sur des centaines de points — aucune allocation dans la boucle des points
  // (mesuré sur le roster réel, 19 unités : 6,8 s → 1,1 s, résultat identique).
  const nSpots = spots.length;
  const tBuf = new Float64Array(nSpots);
  const lBuf = new Float64Array(nSpots);
  const pwBuf = new Float64Array(nSpots);
  const nearIdx = new Int32Array(nSpots);
  const lightIdx = new Int32Array(nSpots);
  /** Tri par insertion des `n` indices selon `t` (quelques garnisons : plus rapide qu'un tri). */
  const sortBy = (idx: Int32Array, n: number, t: Float64Array) => {
    for (let i = 0; i < n; i++) idx[i] = i;
    for (let i = 1; i < n; i++) {
      const v = idx[i]!;
      let j = i - 1;
      while (j >= 0 && t[idx[j]!]! > t[v]!) {
        idx[j + 1] = idx[j]!;
        j--;
      }
      idx[j + 1] = v;
    }
  };
  /** `pointReach` sur des indices triés, en sautant la position `skip` (-1 : aucune). */
  const reachIdx = (
    idx: Int32Array,
    n: number,
    t: Float64Array,
    force: number,
    skipFirst: boolean,
  ) => {
    let cum = 0;
    let tt = 0;
    let mass = 0;
    let skip = skipFirst;
    for (let i = 0; i < n; i++) {
      const g = idx[i]!;
      const pw = pwBuf[g]!;
      if (pw <= 0) continue;
      // La garnison de secours : on écarte la PREMIÈRE qui a de la force (celle déjà partie).
      if (skip) {
        skip = false;
        continue;
      }
      tt = t[g]!;
      mass += Math.min(pw, force - cum) * tt;
      cum += pw;
      if (cum >= force) break;
    }
    if (cum <= 0) return 0;
    const last = cum >= force ? tt : (tt * force) / cum;
    if (cum < force) mass += (force - cum) * last;
    return (last + mass / force) / 2;
  };
  /** ⏱️ Le coût d'une répartition : par point, l'attaque combinée et (objectif mixte) la
   *  garnison la plus vite prête SEULE, allégée de ses soutiens. `combinedOnly` = le temps
   *  rendu au joueur (`reach`). */
  const evaluate = (combinedOnly: boolean) => {
    const gs = garrisons();
    const n = gs.length;
    if (!n || !points) return 0;
    const tr = gs.map((g) => trips.get(g.id)!);
    const lightMult = gs.map((g) => 1 - supportW * Math.min(1, Math.max(0, g.sup)));
    for (let i = 0; i < n; i++) pwBuf[i] = gs[i]!.pw;
    const mixed = !combinedOnly && !!easy && easy > 0;
    let sum = 0;
    for (let p = 0; p < points; p++) {
      for (let i = 0; i < n; i++) tBuf[i] = tr[i]![p]! * gs[i]!.k;
      sortBy(nearIdx, n, tBuf);
      const combined = reachIdx(nearIdx, n, tBuf, hardForce, false);
      if (!mixed) {
        sum += combined;
        continue;
      }
      // 🌱 Un lieu facile : la petite force se réunit aussi depuis les plus proches — une
      // garnison qui suffit seule n'attend personne. Ses soutiens l'allègent un peu.
      for (let i = 0; i < n; i++) lBuf[i] = tBuf[i]! * lightMult[i]!;
      sortBy(lightIdx, n, lBuf);
      let easyT = reachIdx(lightIdx, n, lBuf, easy, false);
      if (backup > 0) {
        // 🔁 Une seconde garnison prête pour un lieu facile, si la première est déjà partie.
        // Personne d'autre n'a de force : le secours vaut le double du premier.
        const second = reachIdx(lightIdx, n, lBuf, easy, true);
        easyT = (1 - backup) * easyT + backup * (second > 0 ? second : easyT * 2);
      }
      sum += (1 - soloShare) * combined + soloShare * easyT;
    }
    return sum / points;
  };
  const cost = () => evaluate(false);
  // ⏳ Les immobiles restent où ils seront (s'il s'agit d'un endroit de la répartition) ; seuls
  // les autres sont essayés, déplacés, échangés.
  const anchored = units.filter((u) => u.fixed && byId.has(u.loc));
  const placeFixed = () => {
    for (const u of anchored) put(u, u.loc);
  };
  const strongFirst = units
    .filter((u) => !u.fixed)
    .sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));

  // 🧹 Départ de ZÉRO : les lieux ne portent que les immobiles. Le plus fort d'abord, chacun là où il fait
  // le plus gagner (à égalité, la base : pas de déplacement inutile).
  function* greedyStart() {
    for (const u of strongFirst) {
      let pick: string | null = null;
      let pickCost = Infinity;
      for (const s of spots) {
        if (!fits(u, s.id)) continue;
        put(u, s.id);
        const c = cost();
        yield;
        if (c < pickCost - 1e-6 || (Math.abs(c - pickCost) <= 1e-6 && s.id === 'base')) {
          pickCost = c;
          pick = s.id;
        }
        at.delete(u.id);
        used.set(s.id, (used.get(s.id) ?? 0) - deployWeight(u));
      }
      put(u, pick ?? 'base');
    }
  }
  // 🌐 Un second départ ÉTALÉ : les plus forts répartis tour à tour sur les lieux tenus.
  // ⚠️ Nécessaire (mesuré, 2026-10-15) : la recherche ne bouge qu'un membre à la fois, et
  // passer de « tous au centre » à « deux garnisons » demande d'en bouger deux d'un coup —
  // depuis le seul départ glouton, elle restait bloquée sur une répartition plus lente.
  function* spreadStart() {
    const held = spots.filter((s) => s.id !== 'base');
    let i = 0;
    for (const u of strongFirst) {
      let placed = false;
      for (let k = 0; k < held.length && !placed; k++) {
        const s = held[(i + k) % held.length]!;
        if (fits(u, s.id)) {
          put(u, s.id);
          i = (i + k + 1) % held.length;
          placed = true;
        }
      }
      if (!placed) put(u, 'base');
    }
    yield;
  }

  // 🔁 Amélioration locale : déplacer un membre, ou en échanger deux, tant que ça fait gagner.
  function* improve(): Generator<void, number> {
    let best = cost();
    for (let round = 0; round < 200; round++) {
      let improved = false;
      for (const u of strongFirst) {
        const from = at.get(u.id)!;
        for (const s of spots) {
          if (s.id === from || !fits(u, s.id)) continue;
          put(u, s.id);
          const c = cost();
          yield;
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
          yield;
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
    return best;
  }

  // Les deux départs, chacun amélioré ; on garde le meilleur (le glouton à égalité).
  function* searchAll(): Generator<void, { at: Map<string, string> | null; cost: number }> {
    let bestAt: Map<string, string> | null = null;
    let bestCost = Infinity;
    for (const start of tune.singleStart ? [greedyStart] : [greedyStart, spreadStart]) {
      at.clear();
      used.clear();
      placeFixed();
      yield* start();
      const c = yield* improve();
      if (!bestAt || c < bestCost - 1e-6) {
        bestCost = c;
        bestAt = new Map(at);
      }
    }
    return { at: bestAt, cost: bestCost };
  }
  const place = (m: Map<string, string> | null) => {
    at.clear();
    used.clear();
    for (const u of units) {
      const s = m?.get(u.id) ?? u.loc;
      // ⏳ Un immobile hors des endroits de la répartition (lieu sans place) n'y compte pas.
      if (byId.has(s)) put(u, s);
    }
  };
  let best = yield* searchAll();
  if (guard !== null && backup > 0 && easy) {
    // Le plan avec secours, jugé SANS secours (plus rien ne lit `backup` après).
    backup = 0;
    place(best.at);
    const cB = cost();
    const plain = yield* searchAll();
    if (cB > plain.cost * (1 + guard)) best = plain;
  }
  place(best.at);

  const moves: DeployMove[] = units
    .filter((u) => !u.fixed && at.get(u.id) !== u.loc)
    .map((u) => ({ unit: u, from: u.loc, to: at.get(u.id)! }));
  return { spotOf: at, moves, reach: evaluate(true) };
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
 * 🌱 Le niveau d'un lieu FACILE de la carte : le BAS du rang du joueur, borné par l'île. C'est
 * ce qu'une garnison doit pouvoir prendre SEULE (objectif mixte de `planStations`).
 */
export function deployEasyLevel(heroLevel: number, floor: number, cap: number): number {
  const bottom = rankStartLevel(characterRank(Math.max(1, heroLevel)).rankIndex);
  return Math.max(Math.max(1, floor), Math.min(cap, bottom));
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
