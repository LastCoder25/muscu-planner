/**
 * 🏝️ PACIFIER UNE ÎLE — étape 2 de l'archipel (roadmap
 * `docs/superpowers/plans/2026-10-01-carte-archipel-roadmap.md`, règles 7, 8, 10 et 11).
 *
 * - **Les OBJECTIFS SECONDAIRES** (île 1 : deux camps de brigands) : des lieux FIXES tenus par
 *   la faction de l'île, qu'on ABAT en groupe — jamais tenus, ils ne reviennent pas. Troupe de
 *   **3** champions de référence pour les premiers, **4** pour les derniers, au niveau du
 *   joueur (plafonné à l'île). Mesuré à l'étape 0 : troupe 3 → 3 champions 86-100 % ; troupe 4
 *   → 3 champions 3-81 %, 5 champions 99-100 %.
 * - **La FORTERESSE PORTUAIRE**, sur le cap : **verrou + affaiblissement**. Verrouillée tant
 *   que moins de `unlockAfter` (2) objectifs sont abattus ; intacte, un rang au-dessus du
 *   plafond de l'île et une troupe de 12 ; chaque objectif abattu la fait redescendre ; tous
 *   abattus, 8 champions de référence AU PLAFOND de l'île (mesuré : 8 champions 88-100 %,
 *   5 champions 0-28 %).
 * - **L'ÎLE PACIFIÉE** (objectifs ET forteresse abattus) : plus aucune attaque sur ses lieux
 *   tenus ; ses spécialités produisent à plein, son SOCLE (mine, source de mana) à 25 % et
 *   sans crans (la rente pleine cassait l'or et le gacha, mesuré à l'étape 0).
 * - **La mine tenue est recalée** à une mission de mine toutes les 24 h (au lieu de 8 h) en
 *   mode archipel (règle 11 : « en même temps que l'archipel, pas avant »).
 *
 * ⚠️ PUR : toutes les fonctions rendent un nouvel état (la MÊME carte quand rien ne change :
 * le store n'écrit pas à vide).
 */
import { activeIsland, islandPacified, ISLANDS, type Island } from './archipelago';
import { buildingType, collectable, type BuildResource, type Building } from './buildings';
import { mulberry32, seedOf } from './combat';
import {
  ALL_CONTROL_KINDS,
  CONTROL,
  attackSlow,
  bankAt,
  controlSpot,
  mapHarass,
  retakeDelayMs,
  seatsOf,
} from './controlPoints';
import { islandTerrain } from './islandTerrain';
import { islandPoint } from './islandShape';
import { isMilitiaId } from './militia';
import {
  ARCHIPEL_TRAVEL_LEVEL,
  EXPE,
  isRiftPoi,
  distNormAt,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type PostedHero,
  type ExpeditionMessage,
  type Poi,
} from './expedition';

export const ISLAND_CONQUEST = {
  /** La troupe des PREMIERS objectifs (la première moitié, arrondie au-dessus), puis celle
   *  des DERNIERS, en champions de référence. */
  firstSize: 3,
  lastSize: 4,
  /** La forteresse intacte (troupe 12, un rang au-dessus du plafond) et affaiblie au maximum
   *  (troupe 8, au plafond). */
  fortressIntactSize: 12,
  fortressWeakSize: 8,
  /** Objectifs abattus avant que la forteresse ne s'attaque (le verrou). */
  unlockAfter: 2,
  /** Où se posent les objectifs : cette part de la terre utile à leur angle (`islandPoint`).
   *  v1.28.0 (« espace les lieux ») : les lieux couvrent toute l'île, les objectifs vont vers
   *  la côte, côté forteresse — au-delà de l'anneau des points fixes (`CONTROL.islandFrac`). */
  objectiveFrac: 0.78,
  /** ⛏️ Mine tenue en mode archipel : une mission de mine toutes les 24 h (au lieu de 8 h). */
  mineHours: 24,
  /** 🕊️ Le socle d'une île pacifiée produit à cette part, sans crans. */
  socleShare: 0.25,
} as const;

/**
 * 🪺 LES NIDS DE L'ÎLE 2 (décisions de l'utilisateur, 2026-10-02) : chaque nid debout en pond
 * un nouveau tous les 3 jours, 6 nids au plus sur l'île ; TOUS les nids debout comptent pour
 * pacifier ; les lieux à portée d'un nid ont des routes dangereuses (embuscades doublées).
 */
export const NEST = {
  islands: new Set([2]) as ReadonlySet<number>,
  layMs: 3 * 24 * 3600_000,
  cap: 6,
  /** Portée des embuscades autour d'un nid (unités de carte). */
  radius: 25,
  /** Rattrapage borné d'une absence (pontes traitées par tick). */
  maxCatchUp: 40,
  /** La troupe d'un nid né en route. */
  size: 3,
} as const;

type NestBirth = NonNullable<NonNullable<ExpeditionMap['archipel']>['nests']>[number];

/**
 * 🪦 LES MORTS SE RELÈVENT (île 3, roadmap : « 2 cimetières + la citadelle ») : un cimetière
 * abattu se RELÈVE `riseMs` plus tard tant que la CITADELLE DES MORTS (le dernier objectif,
 * `Island.keystone`) tient. Abattre la citadelle arrête tout : ce qui est à terre y reste.
 * D'où deux façons de faire : la citadelle d'abord (troupe 4), ou les trois en moins de 3 jours.
 */
export const RISE = {
  islands: new Set([3]) as ReadonlySet<number>,
  riseMs: 3 * 24 * 3600_000,
} as const;

/** L'id de l'objectif-clé (la citadelle des morts), `null` si l'île n'en a pas. */
function keystoneIdOf(isl: Pick<Island, 'objectives' | 'keystone'>): string | null {
  return isl.keystone ? objectiveIdOf(isl.objectives - 1) : null;
}

/** Le nom et l'emoji de l'objectif `i`. */
function objectiveLook(
  isl: Pick<Island, 'objectives' | 'keystone' | 'objective' | 'objectiveEmoji'>,
  i: number,
): { name: string; emoji: string } {
  return isl.keystone && i === isl.objectives - 1
    ? isl.keystone
    : { name: isl.objective, emoji: isl.objectiveEmoji };
}

/**
 * 🪦 Relève les cimetières abattus depuis `RISE.riseMs` tant que la citadelle tient. Rend la
 * MÊME carte si rien ne change.
 */
export function raiseDead(map: ExpeditionMap, now: number): ExpeditionMap {
  const isl = activeIsland(map);
  const a = map.archipel;
  if (!isl || !a || !RISE.islands.has(isl.id) || a.pacifiedAt !== undefined) return map;
  const key = keystoneIdOf(isl);
  const gone = destroyedOf(map);
  if (!key || gone.has(key)) return map;
  const razed = a.razedAt ?? {};
  const up = Object.keys(razed).filter((id) => gone.has(id) && razed[id]! + RISE.riseMs <= now);
  if (!up.length) return map;
  // 🏳️ Un cimetière TENU ne se relève pas tout seul : ses morts ATTAQUENT la garnison à
  // l'heure où il se serait relevé (la reprise décide).
  const held = new Set(map.pois.filter((p) => heldIslandTarget(p)).map((p) => p.id));
  const back = new Set(up.filter((id) => !held.has(id)));
  const razedAt = { ...razed };
  for (const id of up) delete razedAt[id];
  const pois = map.pois.map((p) => {
    if (!held.has(p.id) || !up.includes(p.id)) return p;
    const t = razed[p.id]! + RISE.riseMs;
    const cur = p.control!.attackAt ?? Infinity;
    return { ...p, control: { ...p.control!, attackAt: Math.min(cur, t) } };
  });
  return {
    ...map,
    pois,
    archipel: { ...a, destroyed: (a.destroyed ?? []).filter((x) => !back.has(x)), razedAt },
  };
}

/** 🪦 Quand le prochain cimetière se relève, `null` si aucun. */
export function nextRiseAt(map: Pick<ExpeditionMap, 'archipel'>): number | null {
  const isl = activeIsland(map);
  const a = map.archipel;
  if (!isl || !a || !RISE.islands.has(isl.id) || a.pacifiedAt !== undefined) return null;
  const key = keystoneIdOf(isl);
  const gone = destroyedOf(map);
  if (!key || gone.has(key)) return null;
  const ts = Object.entries(a.razedAt ?? {})
    .filter(([id]) => gone.has(id))
    .map(([, t]) => t + RISE.riseMs);
  return ts.length ? Math.min(...ts) : null;
}

/** Les ids de TOUS les objectifs de l'île : ceux d'origine et les nids nés en route. */
function objectiveIds(isl: Pick<Island, 'objectives'>, nests: readonly NestBirth[]): string[] {
  return [
    ...Array.from({ length: isl.objectives }, (_, i) => objectiveIdOf(i)),
    ...nests.map((n) => objectiveIdOf(n.i)),
  ];
}

/** 🪺 La place d'un nid qui naît : sur l'anneau des objectifs ou un peu plus loin, du côté de
 *  la forteresse, la plus DÉGAGÉE des autres lieux (et sur la terre). `null` si aucune. */
export function nestSpot(
  map: Pick<ExpeditionMap, 'pois'>,
  islandId: number,
  nests: readonly NestBirth[],
): { x: number; y: number; d: number } | null {
  const isl = ISLANDS.find((i) => i.id === islandId);
  const f = islandTerrain(islandId).fortress;
  const at = (frac: number, off: number) => fortressSideSpot(islandId, frac, off);
  const others: { x: number; y: number }[] = [
    ...map.pois.filter((p) => p.control),
    ...objectiveAngles(isl?.objectives ?? 0).map((_, i) => objectiveSpot(islandId, i)),
    ...nests,
    { x: f.x, y: f.y },
  ];
  let best: ReturnType<typeof at> | null = null;
  let bestGap = 9.999;
  for (const frac of [0.62, 0.78, 0.9])
    for (let k = -8; k <= 8; k++) {
      const s = at(frac, k * 0.3);
      // ⚠️ Toujours sur la terre : `islandPoint` suit la côte, moins une marge.
      const g = Math.min(99, ...others.map((p) => Math.hypot(s.x - p.x, s.y - p.y)));
      if (g > bestGap) {
        bestGap = g;
        best = s;
      }
    }
  return best;
}

/**
 * 🪺 LES PONTES : chaque nid debout pond un nid tous les `NEST.layMs` (6 nids au plus ; au
 * plafond, la ponte est perdue et l'horloge repart). Déterministe, rattrape une absence
 * (bornée par tick). Rend la MÊME carte si rien ne change.
 */
export function layNests(map: ExpeditionMap, now: number): ExpeditionMap {
  const isl = activeIsland(map);
  const a = map.archipel;
  if (!isl || !a || !NEST.islands.has(isl.id) || a.pacifiedAt !== undefined) return map;
  const gone = destroyedOf(map);
  const nests = [...(a.nests ?? [])];
  const standing = () => objectiveIds(isl, nests).filter((id) => !gone.has(id));
  const laid: Record<string, number> = {};
  for (const id of standing())
    laid[id] = a.nestLaid?.[id] ?? nests.find((n) => objectiveIdOf(n.i) === id)?.at ?? now;
  for (let k = 0; k < NEST.maxCatchUp; k++) {
    const ids = standing();
    let first: string | null = null;
    let due = Infinity;
    for (const id of ids) {
      const t = laid[id]! + NEST.layMs;
      if (t < due) {
        due = t;
        first = id;
      }
    }
    if (!first || due > now) break;
    // Au plafond, plus rien ne naît : chaque horloge saute à sa dernière ponte (perdue).
    if (ids.length >= NEST.cap) {
      for (const id of ids)
        laid[id] = laid[id]! + Math.floor((now - laid[id]!) / NEST.layMs) * NEST.layMs;
      break;
    }
    laid[first] = due;
    const spot = nestSpot(map, isl.id, nests);
    if (!spot) continue;
    const i = isl.objectives + nests.length;
    nests.push({ i, at: due, ...spot });
    laid[objectiveIdOf(i)] = due;
  }
  if (same(nests, a.nests ?? []) && same(laid, a.nestLaid ?? {})) return map;
  return { ...map, archipel: { ...a, nests, nestLaid: laid } };
}

/** 🪺 Les lieux à portée d'un nid debout (routes dangereuses). */
function nestPerilIds(
  pois: readonly Poi[],
  islandId: number | null,
  pacified: boolean,
): Set<string> {
  const out = new Set<string>();
  if (islandId === null || !NEST.islands.has(islandId) || pacified) return out;
  const nests = pois.filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy');
  for (const p of pois)
    if (
      !isIslandTargetId(p.id) &&
      nests.some((n) => Math.hypot(p.x - n.x, p.y - n.y) <= NEST.radius)
    )
      out.add(p.id);
  return out;
}

/** 🏝️ Les lieux fixes TENUS par le joueur sur la carte (étape 6 bis : tout lieu tenu est un
 *  relais — plus d'avant-postes désignés). */
export function heldPoints(map: Pick<ExpeditionMap, 'pois'>): Poi[] {
  return map.pois.filter((p) => p.control?.owner === 'player');
}

/** 🏝️ Les objectifs ne s'attaquent qu'une fois ce nombre de lieux fixes tenus (n'importe
 *  lesquels) : on s'implante avant d'aller frapper le cœur de l'île. */
export const OBJECTIVES_AFTER_HELD = 2;

/** 🧭 LES TRAJETS PARTENT DU LIEU TENU LE PLUS PROCHE (étape 6 bis) : la distance d'un lieu,
 *  celle qui règle le temps de trajet, est mesurée depuis le point de départ (base ou village)
 *  OU depuis le plus proche des lieux fixes qu'on tient. Chaque lieu pris rapproche le reste.
 *  ⚠️ Un lieu tenu ne compte pas pour lui-même (le renforcer, c'est venir d'ailleurs). Les
 *  armées en marche gardent la leur (leur marche ne dépend pas de nous). Rend la MÊME carte si
 *  rien ne change. Hors archipel, rien. */
export function withRelays(map: ExpeditionMap): ExpeditionMap {
  if (!map.archipel) return map;
  const relays = heldPoints(map);
  let changed = false;
  const pois = map.pois.map((p) => {
    if (p.type === 'warband') return p;
    let d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
    for (const r of relays) if (r.id !== p.id) d = Math.min(d, Math.hypot(p.x - r.x, p.y - r.y));
    const dn = distNormAt(d);
    if (Math.abs(dn - p.distNorm) < 1e-9) return p;
    changed = true;
    return { ...p, distNorm: dn };
  });
  return changed ? { ...map, pois } : map;
}

/** 🏝️ Un lieu fixe de l'île `id` : à l'angle `a`, à la part `frac` de sa terre utile. */
function islandSpot(id: number, a: number, frac: number): { x: number; y: number; d: number } {
  const p = islandPoint(id, a, frac);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  // `d` = distance à la VILLE (le trajet) ; l'angle `a`, lui, est vu du centre de l'île.
  return { x, y, d: Math.hypot(x - EXPE.town.x, y - EXPE.town.y) };
}

/** 🏝️ Un lieu fixe du côté de la forteresse : à l'écart d'angle `off` de l'axe base →
 *  forteresse, à la part `frac` de la terre utile (objectifs, avant-postes, nids). */
function fortressSideSpot(id: number, frac: number, off: number) {
  return islandSpot(id, islandTerrain(id).fortress.angle + off, frac);
}

/** 🏝️ La place de l'objectif `i` de l'île `id` : du côté de la forteresse, vers la côte. */
export function objectiveSpot(id: number, i: number): { x: number; y: number; d: number } {
  const isl = ISLANDS.find((x) => x.id === id);
  const off = objectiveAngles(isl?.objectives ?? 0)[i] ?? 0;
  // ⚠️ Pas collé à la forteresse : sur une île où le cap est étroit, l'objectif d'en face
  // tombait à 9 unités d'elle. On le recule vers l'intérieur jusqu'à 14 unités.
  const f = islandTerrain(id).fortress;
  let frac = ISLAND_CONQUEST.objectiveFrac;
  let s = fortressSideSpot(id, frac, off);
  while (frac > 0.3 && Math.hypot(s.x - f.x, s.y - f.y) < 14) {
    frac -= 0.04;
    s = fortressSideSpot(id, frac, off);
  }
  return s;
}

/** 🕊️ Le SOCLE d'une île (règle 10) : ce qui produit sur toutes les îles. */
const SOCLE: ReadonlySet<ControlKind> = new Set<ControlKind>(['mine', 'mana']);

export const FORTRESS_ID = 'isl_fortress';
export const objectiveIdOf = (i: number): string => `isl_obj_${i}`;
/** 🏝️ Un objectif ou la forteresse (ce qu'on abat sur une île). */
export const isIslandTargetId = (id: string): boolean =>
  id === FORTRESS_ID || id === ENDLESS_ID || id.startsWith('isl_obj_');

/**
 * 🌀 « PUIS SANS FIN » (roadmap, île 5 : « La Citadelle maudite (puis sans fin) »). Une fois
 * la citadelle prise, la malédiction ne s'éteint pas : une BRÈCHE MAUDITE s'ouvre là où se
 * tenaient les sanctuaires. Abattue, elle se rouvre `respawnMs` plus tard, d'un champion de
 * référence plus forte à chaque fois (`perTier`), sans plafond — le contenu sans fin du
 * dernier palier, comme le Portail sans fin des donjons. Chaque victoire dépose un coffre
 * (`endlessReward`, runes et sceaux de champion au rang max). Elle n'attaque rien : l'île
 * reste pacifiée.
 */
export const ENDLESS_ID = 'isl_endless';
export const ENDLESS = {
  islands: new Set([5]) as ReadonlySet<number>,
  respawnMs: 3 * 24 * 3600_000,
  /** La troupe de départ : celle de la forteresse affaiblie (`fortressWeakSize`). */
  perTier: 1,
  runesBase: 2,
  runesMax: 8,
  seals: 1,
} as const;

/** 🌀 La troupe de la brèche après `tier` victoires. */
export function endlessSize(tier: number): number {
  return ISLAND_CONQUEST.fortressWeakSize + Math.max(0, tier) * ENDLESS.perTier;
}

/** Écarts d'angle des objectifs autour de la direction de la forteresse (radians). */
function objectiveAngles(n: number): number[] {
  if (n <= 1) return [0];
  const span = n === 2 ? 1.7 : 2.5;
  return Array.from({ length: n }, (_, i) => -span / 2 + (span * i) / (n - 1));
}

/** La troupe de l'objectif `i` (sur `n`). */
export function objectiveSize(i: number, n: number): number {
  return i < Math.ceil(n / 2) ? ISLAND_CONQUEST.firstSize : ISLAND_CONQUEST.lastSize;
}

/** ⚔️ La forteresse selon les objectifs pris (`down` sur `n`) : niveau, troupe et verrou.
 *  🏰 Son NIVEAU est le maximum de la carte de l'île (décision de l'utilisateur, 2026-10-02) ;
 *  sa troupe redescend LINÉAIREMENT de 12 à 8 champions de référence. */
export function fortressForce(
  isl: Pick<Island, 'maxLevel' | 'objectives'>,
  down: number,
  /** 🐫 Champions de référence ajoutés par les convois arrivés (`convoyBonus`). */
  bonus = 0,
): { level: number; size: number; locked: boolean } {
  const n = Math.max(1, isl.objectives);
  const w = Math.min(1, Math.max(0, down) / n);
  const { fortressIntactSize: big, fortressWeakSize: small } = ISLAND_CONQUEST;
  return {
    level: isl.maxLevel,
    size: Math.round((big - (big - small) * w + Math.max(0, bonus)) * 100) / 100,
    locked: down < Math.min(ISLAND_CONQUEST.unlockAfter, n),
  };
}

/** Ce que l'île a déjà perdu. */
function destroyedOf(map: Pick<ExpeditionMap, 'archipel'>): Set<string> {
  return new Set(map.archipel?.destroyed ?? []);
}

/** 🏝️ Où en est la conquête de l'île active, `null` hors du mode archipel. */
export function islandConquest(
  map: (Pick<ExpeditionMap, 'archipel'> & Partial<Pick<ExpeditionMap, 'pois'>>) | null | undefined,
): {
  island: Island;
  /** 🏝️ Lieux fixes tenus (ouvrent les objectifs à `OBJECTIVES_AFTER_HELD`). */
  pointsHeld: number;
  objectivesDown: number;
  objectivesTotal: number;
  fortressDown: boolean;
  locked: boolean;
  pacified: boolean;
} | null {
  const isl = activeIsland(map);
  if (!isl || !map) return null;
  const gone = destroyedOf(map);
  const ids = objectiveIds(isl, map.archipel?.nests ?? []);
  const down = ids.filter((id) => gone.has(id)).length;
  const pois = map.pois ?? [];
  return {
    island: isl,
    pointsHeld: heldPoints({ pois }).length,
    objectivesDown: down,
    objectivesTotal: ids.length,
    fortressDown: gone.has(FORTRESS_ID),
    locked: fortressForce(isl, down).locked,
    pacified: islandPacified(map),
  };
}

/** 🏝️ La règle de production d'un lieu fixe sur l'île (absente hors du mode archipel). */
export function islandYieldRule(
  map: Pick<ExpeditionMap, 'archipel'>,
  kind: ControlKind,
): { yieldMult?: number; flatTier?: boolean } {
  if (!map.archipel) return {};
  let mult = kind === 'mine' ? CONTROL.mineHoursPerHaul / ISLAND_CONQUEST.mineHours : 1;
  const flat = islandPacified(map) && SOCLE.has(kind);
  if (flat) mult *= ISLAND_CONQUEST.socleShare;
  return {
    ...(mult !== 1 ? { yieldMult: mult } : {}),
    ...(flat ? { flatTier: true } : {}),
  };
}

function enemyTarget(
  map: ExpeditionMap,
  id: string,
  spot: { x: number; y: number; d: number },
  now: number,
  level: number,
  control: Omit<ControlState, 'owner' | 'garrison' | 'retakes'>,
): Poi {
  return {
    id,
    type: 'control',
    level,
    travelLevel: ARCHIPEL_TRAVEL_LEVEL,
    x: spot.x,
    y: spot.y,
    // Depuis la ville ; `withRelays` la ramène au lieu tenu le plus proche.
    distNorm: distNormAt(spot.d),
    spawnedAt: now,
    expiresAt: EXPE.lifespanMs.control,
    control: { ...control, owner: 'enemy', garrison: [], retakes: 0 },
  };
}

/** Les objectifs et la forteresse ATTENDUS sur la carte (ceux pas encore abattus). */
function expectedTargets(map: ExpeditionMap, isl: Island, now: number, level: number): Poi[] {
  const gone = destroyedOf(map);
  const terrain = islandTerrain(isl.id);
  const f = terrain.fortress;
  const out: Poi[] = [];
  const lv = Math.max(1, Math.min(level, isl.maxLevel));
  // 🏝️ Les objectifs ne s'attaquent qu'une fois deux lieux fixes tenus.
  const objLocked = heldPoints(map).length < OBJECTIVES_AFTER_HELD;
  objectiveAngles(isl.objectives).forEach((_, i) => {
    const id = objectiveIdOf(i);
    if (gone.has(id)) return;
    out.push(
      enemyTarget(map, id, objectiveSpot(isl.id, i), now, lv, {
        kind: 'objective',
        faction: isl.faction,
        size: objectiveSize(i, isl.objectives),
        ...objectiveLook(isl, i),
        ...(objLocked ? { locked: true } : {}),
      }),
    );
  });
  // 🪺 Les nids nés en route, à leur place.
  for (const n of map.archipel?.nests ?? []) {
    const id = objectiveIdOf(n.i);
    if (gone.has(id)) continue;
    out.push(
      enemyTarget(map, id, n, n.at, lv, {
        kind: 'objective',
        faction: isl.faction,
        size: NEST.size,
        name: isl.objective,
        emoji: isl.objectiveEmoji,
        ...(objLocked ? { locked: true } : {}),
      }),
    );
  }
  if (!gone.has(FORTRESS_ID)) {
    const down = objectiveIds(isl, map.archipel?.nests ?? []).filter((x) => gone.has(x)).length;
    const force = fortressForce(isl, down, convoyBonus(map));
    out.push(
      enemyTarget(
        map,
        FORTRESS_ID,
        {
          x: Math.round(f.x),
          y: Math.round(f.y),
          d: Math.hypot(f.x - EXPE.town.x, f.y - EXPE.town.y),
        },
        now,
        force.level,
        {
          kind: 'fortress',
          faction: isl.faction,
          size: force.size,
          name: isl.fortress,
          emoji: '🏰',
          ...(force.locked ? { locked: true } : {}),
        },
      ),
    );
  }
  // 🌀 La brèche sans fin, une fois la citadelle prise, rouverte après chaque victoire.
  const e = map.archipel?.endless;
  if (
    ENDLESS.islands.has(isl.id) &&
    gone.has(FORTRESS_ID) &&
    (e?.at === undefined || now >= e.at + ENDLESS.respawnMs)
  ) {
    out.push(
      enemyTarget(map, ENDLESS_ID, objectiveSpot(isl.id, 0), now, isl.maxLevel, {
        kind: 'objective',
        faction: isl.faction,
        size: endlessSize(e?.tier ?? 0),
        name: 'Brèche maudite',
        emoji: '🌀',
      }),
    );
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 🏝️ Tient la carte à jour : objectifs et forteresse POSÉS s'ils manquent (retirés hors du
 * mode archipel ou une fois abattus), leur niveau, troupe et verrou rafraîchis — jamais
 * pendant un assaut (la troupe affrontée est celle annoncée au départ) —, et la RÈGLE DE
 * PRODUCTION de l'île posée sur chaque lieu fixe, ce qui est déjà produit mis de côté avant
 * tout changement. Rend la MÊME carte quand rien ne change.
 */
export function ensureIslandConquest(
  map0: ExpeditionMap,
  now: number,
  playerLevel: number,
  /** 🐫 Les convois BATTUS par un voyage avant leur arrivée (`convoyVanquished`). */
  vanquished: ReadonlySet<string> = new Set(),
): ExpeditionMap {
  // 🪺 Les pontes des nids d'abord : un nid né se pose dans la foulée. 🪦 De même les
  // cimetières qui se relèvent.
  const map = raiseDead(layNests(map0, now), now);
  const isl = activeIsland(map);
  const want = isl ? expectedTargets(map, isl, now, playerLevel) : [];
  const wantIds = new Set(want.map((p) => p.id));
  let pois = map.pois;
  let changed = map !== map0;
  // 1. Ce qui ne doit plus être là (île abattue, mode quitté). ⚠️ La forteresse PRISE
  // reste : elle se tient (`takeFortress`).
  const stays = (p: Poi) =>
    !isIslandTargetId(p.id) || wantIds.has(p.id) || (!!isl && heldIslandTarget(p));
  if (pois.some((p) => !stays(p))) {
    pois = pois.filter(stays);
    changed = true;
  }
  // 1 bis. 🏳️ Les objectifs rasés sous l'ancienne règle reviennent, tenus par nous.
  const restored = restoreRazedObjectives(map, pois, now, playerLevel);
  if (restored.length) {
    pois = [...pois, ...restored];
    changed = true;
  }
  // 2. Posés s'ils manquent, rafraîchis sinon (niveau, troupe, verrou ; la place ne bouge pas).
  for (const w of want) {
    const k = pois.findIndex((p) => p.id === w.id);
    if (k < 0) {
      pois = [...pois, w];
      changed = true;
      continue;
    }
    const p = pois[k]!;
    const c = p.control!;
    if (c.assault) continue;
    const wc = w.control!;
    const next: ControlState = { ...c, size: wc.size, faction: wc.faction };
    if (wc.locked) next.locked = true;
    else delete next.locked;
    // 🏝️ La place suit aussi (v1.28.0) : un objectif encore ennemi et hors assaut va là où
    // la règle le pose aujourd'hui — une île déjà ouverte s'espace d'elle-même.
    const moved = p.x !== w.x || p.y !== w.y;
    if (!moved && p.level === w.level && same(next, c)) continue;
    // ⚠️ La distance (le trajet) est celle de `withRelays`, recalculée en fin de passage.
    pois = pois.map((q, j) =>
      j === k ? { ...p, x: w.x, y: w.y, level: w.level, control: next } : q,
    );
    changed = true;
  }
  // 2 bis. 🏝️ LES POINTS FIXES ENCORE À L'ENNEMI se posent à leur place d'île (v1.28.0,
  // « espace les lieux ») : à mi-chemin de la côte au lieu de serrés autour de la base. Ceux
  // qu'on tient, qu'on attaque ou où des champions marchent ne bougent pas.
  if (isl)
    pois = pois.map((p) => {
      const c = p.control;
      if (
        !c ||
        c.owner !== 'enemy' ||
        c.assault ||
        c.reinforcing?.length ||
        c.returning?.length ||
        isIslandTargetId(p.id) ||
        !ALL_CONTROL_KINDS.includes(c.kind)
      )
        return p;
      const s = controlSpot(map, c.kind);
      if (p.x === s.x && p.y === s.y) return p;
      changed = true;
      return { ...p, ...s };
    });
  // 2 ter. 🏝️ Plus d'avant-postes désignés (étape 6 bis) : la marque tombe partout.
  if (pois.some((p) => p.control?.outpost)) {
    changed = true;
    pois = pois.map((p) => {
      if (!p.control?.outpost) return p;
      const { outpost: _o, ...rest } = p.control;
      void _o;
      return { ...p, control: rest };
    });
  }
  // 3. La règle de production de l'île sur chaque lieu fixe.
  pois = pois.map((p) => {
    const c = p.control;
    if (!c || !ALL_CONTROL_KINDS.includes(c.kind)) return p;
    const rule = islandYieldRule(map, c.kind);
    if ((c.yieldMult ?? 1) === (rule.yieldMult ?? 1) && !!c.flatTier === !!rule.flatTier) return p;
    changed = true;
    // ⚠️ La production déjà faite, mise de côté AU DÉBIT D'AVANT.
    const banked =
      c.owner === 'player' && c.collectedAt !== undefined ? bankAt(p, now, playerLevel) : c;
    const { yieldMult: _m, flatTier: _f, ...rest } = banked;
    void _m;
    void _f;
    return { ...p, control: { ...rest, ...rule } };
  });
  // 4. 🪺 Les routes dangereuses autour des nids (dérivé ; la clé est RETIRÉE hors portée).
  const peril = nestPerilIds(pois, isl?.id ?? null, islandPacified(map));
  if (pois.some((p) => peril.has(p.id) !== !!p.nestPeril)) {
    changed = true;
    pois = pois.map((p) => {
      const on = peril.has(p.id);
      if (on === !!p.nestPeril) return p;
      if (on) return { ...p, nestPeril: true };
      const rest = { ...p };
      delete rest.nestPeril;
      return rest;
    });
  }
  // 5. 🔮 Les failles corrompues (île 5).
  const cursed = corruptRifts(map, pois);
  if (cursed !== pois) {
    pois = cursed;
    changed = true;
  }
  // 6. 🚩 L'armée mobile du seigneur de guerre (île 4), 🔮 les invasions combinées (île 5).
  // 7. 🐫 Les convois de ravitaillement de l'île 4.
  // 8. 🧭 Les trajets partent du lieu tenu le plus proche.
  return withRelays(
    warlordConvoys(warlordRaids(changed ? { ...map, pois } : map, now), now, vanquished),
  );
}

/**
 * ⚔️ Un objectif ou la forteresse ABATTU à `at` : il quitte la carte pour toujours ; la
 * forteresse s'affaiblit (ou se déverrouille) ; tout abattu, l'île est PACIFIÉE — les
 * attaques prévues tombent. ⚠️ Le verrou de la forteresse et la règle du socle se
 * rafraîchissent au tick suivant de la carte (`ensureIslandConquest`), qui connaît le niveau.
 */
export function razeIslandTarget(map: ExpeditionMap, id: string, at: number): ExpeditionMap {
  const isl = activeIsland(map);
  if (!isl || !map.archipel || !isIslandTargetId(id)) return map;
  // 🌀 La brèche sans fin ne compte pas pour la pacification : elle monte d'un cran.
  if (id === ENDLESS_ID) {
    const e = map.archipel.endless;
    return {
      ...map,
      archipel: { ...map.archipel, endless: { ...e, tier: (e?.tier ?? 0) + 1, at } },
      pois: map.pois.filter((p) => p.id !== id),
    };
  }
  const destroyed = [...new Set([...(map.archipel.destroyed ?? []), id])];
  const all = [...objectiveIds(isl, map.archipel.nests ?? []), FORTRESS_ID];
  const pacified = all.every((x) => destroyed.includes(x));
  // 🪦 Un cimetière abattu garde l'heure de sa chute : il se relève 3 jours plus tard.
  const rises = RISE.islands.has(isl.id) && id !== FORTRESS_ID && id !== keystoneIdOf(isl);
  const next: ExpeditionMap = {
    ...map,
    archipel: {
      ...map.archipel,
      destroyed,
      ...(rises ? { razedAt: { ...(map.archipel.razedAt ?? {}), [id]: at } } : {}),
      ...(pacified && map.archipel.pacifiedAt === undefined ? { pacifiedAt: at } : {}),
    },
    pois: map.pois
      .filter((p) => p.id !== id)
      .map((p) => {
        // 🕊️ Pacifiée : plus aucune attaque prévue.
        if (!pacified || !p.control) return p;
        if (p.control.attackAt === undefined && p.control.raidAt === undefined) return p;
        const { attackAt: _a, raidAt: _r, ...rest } = p.control;
        void _a;
        void _r;
        return { ...p, control: rest };
      }),
  };
  return next;
}

/** 🏰 La forteresse est-elle à nous ? */
function heldFortress(p: Poi): boolean {
  return p.id === FORTRESS_ID && p.control?.owner === 'player';
}

/** 🏝️ Un objectif ou la forteresse TENU par le joueur (étape 6 bis : ils se tiennent). */
export function heldIslandTarget(p: Poi): boolean {
  return isIslandTargetId(p.id) && p.id !== ENDLESS_ID && p.control?.owner === 'player';
}

/**
 * 🏳️ UN OBJECTIF PRIS SE TIENT (décision de l'utilisateur, 2026-10-02) : il compte comme
 * « tombé » pour la forteresse (verrou, troupe) et la pacification, mais reste sur la carte
 * avec sa garnison — et la forteresse vient le RÉCUPÉRER en priorité (`redirectIslandAttacks`).
 * Il ne produit rien. Repris par l'ennemi (`regainIslandTarget`), il recompte comme debout.
 */
export function takeObjective(
  map: ExpeditionMap,
  id: string,
  garrison: readonly string[],
  at: number,
  hero?: PostedHero,
): ExpeditionMap {
  const before = map.pois.find((p) => p.id === id);
  if (id === FORTRESS_ID || id === ENDLESS_ID) return map;
  const razed = razeIslandTarget(map, id, at);
  if (!before?.control || razed === map) return razed;
  return { ...razed, pois: [...razed.pois, heldObjective(before, garrison, at, hero)] };
}

/** 🏳️ L'objectif `before` (encore ennemi) devenu NÔTRE à `at`, avec sa garnison. */
function heldObjective(
  before: Poi,
  garrison: readonly string[],
  at: number,
  hero?: PostedHero,
): Poi {
  const { attackAt: _a, raidAt: _r, locked: _l, hero: _h, heroUnit: _u, ...rest } = before.control!;
  void _a;
  void _r;
  void _l;
  void _h;
  void _u;
  return {
    ...before,
    control: {
      ...rest,
      owner: 'player',
      garrison: [...new Set(garrison)].slice(0, seatsOf('objective')),
      since: at,
      collectedAt: at,
      assault: false,
      ...(hero ? { hero: true, heroUnit: hero } : {}),
    },
  };
}

/**
 * 🏳️ LES OBJECTIFS RASÉS SOUS L'ANCIENNE RÈGLE REVIENNENT, TENUS PAR LE JOUEUR (signalé : « un
 * avant-poste ennemi que j'ai pris hier a disparu de la carte »). Avant la v1.31, un objectif
 * pris était RASÉ (il quittait la carte) ; depuis il se TIENT (`takeObjective`). Un objectif
 * fixe de l'île compté abattu (`destroyed`) mais absent de la carte est donc un reliquat : il
 * revient à sa place, à nous, sans garnison. Rien si la carte n'en a pas.
 */
export function restoreRazedObjectives(
  map: ExpeditionMap,
  pois: readonly Poi[],
  now: number,
  playerLevel: number,
): Poi[] {
  const isl = activeIsland(map);
  if (!isl) return [];
  const gone = destroyedOf(map);
  const lv = Math.max(1, Math.min(playerLevel, isl.maxLevel));
  const out: Poi[] = [];
  objectiveAngles(isl.objectives).forEach((_, i) => {
    const id = objectiveIdOf(i);
    if (!gone.has(id) || pois.some((p) => p.id === id)) return;
    const at = map.archipel?.razedAt?.[id] ?? now;
    const enemy = enemyTarget(map, id, objectiveSpot(isl.id, i), at, lv, {
      kind: 'objective',
      faction: isl.faction,
      size: objectiveSize(i, isl.objectives),
      ...objectiveLook(isl, i),
    });
    out.push(heldObjective(enemy, [], at));
  });
  return out;
}

/** ⚔️ Un objectif tenu REPRIS par l'ennemi : il recompte comme debout (la forteresse se
 *  reverrouille et se renforce s'il le faut). Rend la MÊME carte si rien ne change. */
export function regainIslandTarget(map: ExpeditionMap, id: string): ExpeditionMap {
  const a = map.archipel;
  if (!a?.destroyed?.includes(id) || id === FORTRESS_ID || id === ENDLESS_ID) return map;
  const razedAt = { ...(a.razedAt ?? {}) };
  delete razedAt[id];
  return {
    ...map,
    archipel: { ...a, destroyed: a.destroyed.filter((x) => x !== id), razedAt },
  };
}

/**
 * 🎯 LA FORTERESSE VISE D'ABORD CE QU'ON LUI A PRIS (décision de l'utilisateur, 2026-10-02) :
 * tant qu'on tient un objectif de l'île (pacifiée exceptée), une attaque échue sur un autre
 * lieu tenu se reporte sur l'objectif tenu le PLUS PROCHE (son attaque est avancée à cet
 * instant) et l'attaque du lieu épargné est reprogrammée. La base n'est pas concernée (ses
 * sièges suivent leur propre règle). Rend la MÊME carte si rien ne change.
 */
export function redirectIslandAttacks(map: ExpeditionMap, now: number): ExpeditionMap {
  if (!activeIsland(map) || islandPacified(map)) return map;
  const objectives = map.pois.filter((p) => heldIslandTarget(p) && p.control!.kind === 'objective');
  if (!objectives.length) return map;
  let pois = map.pois;
  for (const p of map.pois) {
    const c = p.control;
    if (!c || c.owner !== 'player' || isIslandTargetId(p.id)) continue;
    if (c.attackAt === undefined || c.attackAt > now) continue;
    const at = c.attackAt;
    const target = objectives.reduce((best, o) =>
      Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? o : best,
    );
    const next = at + retakeDelayMs(p.id, at, mapHarass(map, at), attackSlow(map, c.kind));
    pois = pois.map((q) => {
      if (q.id === p.id) return { ...q, control: { ...q.control!, attackAt: next } };
      if (q.id === target.id) {
        const cur = q.control!.attackAt ?? Infinity;
        return { ...q, control: { ...q.control!, attackAt: Math.min(cur, at) } };
      }
      return q;
    });
  }
  return pois === map.pois ? map : { ...map, pois };
}

/**
 * 🏰 LA FORTERESSE PRISE (décisions de l'utilisateur, 2026-10-02) : elle n'est plus rasée,
 * elle se TIENT. Toute l'équipe gagnante y reste — garnison SANS LIMITE, comme la base — et le
 * héros, s'il était du combat, y est POSTÉ jusqu'à son rappel. Elle compte comme abattue pour
 * la pacification et n'est JAMAIS reprise. Elle ne produit rien.
 */
export function takeFortress(
  map: ExpeditionMap,
  garrison: readonly string[],
  hero: boolean,
  at: number,
  heroUnit?: PostedHero,
): ExpeditionMap {
  const before = map.pois.find((p) => p.id === FORTRESS_ID);
  const razed = razeIslandTarget(map, FORTRESS_ID, at);
  if (!before?.control || razed === map) return razed;
  const { attackAt: _a, raidAt: _r, locked: _l, ...rest } = before.control;
  void _a;
  void _r;
  void _l;
  const held: Poi = {
    ...before,
    control: {
      ...rest,
      owner: 'player',
      garrison: [...new Set(garrison)],
      since: at,
      collectedAt: at,
      assault: false,
      ...(hero ? { hero: true } : {}),
      ...(hero && heroUnit ? { heroUnit } : {}),
    },
  };
  if (!hero) delete held.control!.hero;
  if (!hero || !heroUnit) delete held.control!.heroUnit;
  return { ...razed, pois: [...razed.pois, held] };
}

/** 🧝 Le lieu tenu où le héros est POSTÉ (étape 6 bis : n'importe lequel), s'il l'est. */
export function heroPostOf(map: Pick<ExpeditionMap, 'pois'> | null | undefined): Poi | undefined {
  return map?.pois.find(heroPostPoi);
}
const heroPostPoi = (p: Poi) => p.control?.owner === 'player' && !!p.control.hero;

/** 🧝 Le héros est-il posté sur un lieu tenu ? */
export function heroPosted(map: Pick<ExpeditionMap, 'pois'> | null | undefined): boolean {
  return !!heroPostOf(map);
}

/** 🧝 Le héros est-il retenu sur la carte (posté, ou en chemin vers la base après son rappel
 *  ou la perte de son lieu) ? */
export function heroHeldOnMap(
  map: Pick<ExpeditionMap, 'pois' | 'heroReturnAt'> | null | undefined,
  now: number,
): boolean {
  return heroPosted(map) || (map?.heroReturnAt ?? 0) > now;
}

/** 🧝 Le héros quitte son poste (rappel, ou lieu perdu) : il rentre à la base en `legMin`
 *  minutes depuis `now`. */
export function recallPostedHero(map: ExpeditionMap, now: number, legMin: number): ExpeditionMap {
  if (!heroPosted(map)) return map;
  return {
    ...unpostHero(map),
    heroReturnAt: now + Math.max(0, Math.round(legMin)) * 60_000,
  };
}

/** 🧝 Le héros QUITTE son poste pour partir ailleurs (demandé : « posté, je ne peux plus le
 *  bouger ») : il part directement de là, sans repasser par la base — donc aucun trajet de
 *  retour (`heroReturnAt`), contrairement au rappel. Le lieu perd sa défense héroïque. */
export function unpostHero(map: ExpeditionMap): ExpeditionMap {
  if (!heroPosted(map)) return map;
  return {
    ...map,
    pois: map.pois.map((p) => {
      if (!heroPostPoi(p)) return p;
      const { hero: _h, heroUnit: _u, ...c } = p.control!;
      void _h;
      void _u;
      return { ...p, control: c };
    }),
  };
}

/** ⛵ Ceux qui EMBARQUENT de la forteresse (elle est le port de l'île) : sa garnison de
 *  champions et le héros. Rend la carte sans eux et leurs ids (les miliciens restent). */
export function boardFromFortress(map: ExpeditionMap): { map: ExpeditionMap; ids: string[] } {
  const f = map.pois.find(heldFortress);
  if (!f) return { map, ids: [] };
  const c = f.control!;
  const ids = c.garrison.filter((x) => !isMilitiaId(x));
  if (!ids.length && !c.hero) return { map, ids: [] };
  const { hero: _h, heroUnit: _u, ...rest } = c;
  void _h;
  void _u;
  return {
    ids,
    map: {
      ...map,
      pois: map.pois.map((p) =>
        p.id === f.id
          ? { ...p, control: { ...rest, garrison: c.garrison.filter(isMilitiaId) } }
          : p,
      ),
    },
  };
}

/** 🏝️ Ce que la fiche dit d'un objectif ou de la forteresse. */
export function islandTargetLabel(
  map: ExpeditionMap | null | undefined,
  id: string,
): { title: string; detail: string } | null {
  const st = islandConquest(map);
  const p = map?.pois.find((x) => x.id === id);
  if (!st || !p?.control || !isIslandTargetId(id) || heldIslandTarget(p)) return null;
  const { island: isl, objectivesDown: down, objectivesTotal: n } = st;
  if (id === ENDLESS_ID) {
    const tier = map!.archipel?.endless?.tier ?? 0;
    return {
      title: `🌀 Brèche maudite · ${tier} fois abattue`,
      detail:
        `troupe de ${p.control.size} champions de référence · abattue, elle se rouvre 3 jours plus ` +
        'tard, plus forte d’un champion de référence, sans fin · chaque victoire dépose un coffre ' +
        '(runes et sceaux de champion).',
    };
  }
  const isKey = p.id === keystoneIdOf(isl);
  const rise = RISE.islands.has(isl.id);
  const riseAt = rise && isKey ? nextRiseAt(map!) : null;
  if (p.control.kind === 'objective')
    return {
      title: `${p.control.emoji ?? isl.objectiveEmoji} Objectif de l’île · ${down}/${n} pris`,
      detail:
        `troupe de ${p.control.size} champions de référence · ` +
        (rise && !isKey
          ? 'pris, il se tient — mais ses morts l’attaquent 3 jours plus tard tant que la citadelle des morts tient'
          : rise
            ? 'prise, plus aucun cimetière ne se relève' +
              (riseAt
                ? ` (le prochain se relève ${new Date(riseAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})`
                : '')
            : 'pris, il se tient : la forteresse viendra le reprendre EN PRIORITÉ, avant tes lieux fixes') +
        (PILLAGE_ISLANDS.has(isl.id)
          ? ' · tant qu’il tient, ses brigands pillent la réserve non récoltée de ta base et attaquent tes lieux fixes'
          : NEST.islands.has(isl.id)
            ? ' · tant qu’il tient, il pond un nid tous les 3 jours (6 au plus), ses bêtes embusquent les routes autour et attaquent tes lieux fixes ; tous les nids debout comptent pour pacifier'
            : CURSE.islands.has(isl.id)
              ? ' · tant qu’il tient, les failles de l’île naissent corrompues (un jour plus vieilles par sanctuaire debout : elles débordent plus tôt) et ses invasions combinées frappent TOUS tes lieux tenus à la fois (en moyenne toutes les 72 h, plus souvent avec plusieurs sanctuaires debout)'
              : WARLORD.islands.has(isl.id)
                ? ' · tant qu’il tient, son armée mobile frappe ton lieu tenu le MOINS défendu (en moyenne toutes les 36 h, plus souvent avec plusieurs camps debout) et ses convois de ravitaillement marchent sur la forteresse (chacun arrivé la renforce : intercepte-les)'
                : ' · tant qu’il tient, il attaque tes lieux fixes') +
        ` · ${Math.min(ISLAND_CONQUEST.unlockAfter, n)} pris ouvrent la forteresse, tous l’affaiblissent au plus bas (repris, ils la reverrouillent).`,
    };
  const bonus = convoyBonus(map!);
  const f = fortressForce(isl, down, bonus);
  return {
    title: f.locked
      ? `🔒 ${isl.fortress} · verrouillée (${down}/${Math.min(ISLAND_CONQUEST.unlockAfter, n)})`
      : `🏰 ${isl.fortress}`,
    detail:
      `troupe de ${f.size} champions de référence` +
      (down < n
        ? ` · chaque objectif pris l’affaiblit (${down}/${n})`
        : ' · affaiblie au plus bas') +
      (bonus ? ` · renforcée par ${bonus} convoi${bonus > 1 ? 's' : ''} de ravitaillement` : '') +
      ' · prise avec tous les objectifs : l’île est pacifiée, plus aucune attaque.',
  };
}

/**
 * ⛺ LE PILLAGE DES BRIGANDS (île 1, roadmap : « ils pillent ce qui n'est pas récolté ») :
 * tant qu'un camp de brigands tient, ils viennent prendre la RÉSERVE NON RÉCOLTÉE des
 * bâtiments de la base (Dynamo, Porte du Labyrinthe, Autel), en moyenne toutes les
 * `pillageMs` heures PAR CAMP debout (deux camps : deux fois plus souvent). Abattre un camp
 * les espace, les abattre tous les arrête. ⚠️ On ne perd que ce qu'on n'avait pas ramassé :
 * récolter souvent suffit à ne rien perdre — la règle des sièges. ⚠️ Un seul pillage par
 * échéance, même après une longue absence : la réserve accumulée APRÈS lui reste à toi.
 */
export const BRIGANDS = { pillageMs: 36 * 3600_000, jitter: 0.25 } as const;
/** Les îles dont les objectifs pillent (leur menace propre, roadmap). */
const PILLAGE_ISLANDS: ReadonlySet<number> = new Set([1]);

/**
 * 🚩 L'ARMÉE MOBILE DU SEIGNEUR DE GUERRE (île 4, roadmap : « armée mobile qui vise le moins
 * défendu ») : tant qu'un camp de guerre tient, une armée sort en moyenne toutes les
 * `raidMs` / camps debout et AVANCE à cet instant l'attaque prévue du lieu tenu le MOINS
 * défendu (la plus petite garnison, champions et miliciens ; départage tiré). Comme un raid
 * de citadelle : elle ne crée pas d'attaque, elle avance celle qui vient. Abattre les camps
 * l'espace, les abattre tous l'arrête. Déterministe, rattrape une absence (bornée).
 */
export const WARLORD = {
  islands: new Set([4]) as ReadonlySet<number>,
  raidMs: 36 * 3600_000,
  jitter: 0.25,
  catchUp: 8,
} as const;

/** Le délai jusqu'à la prochaine sortie, à `standing` camps debout. */
export function warDelayMs(
  seed: number,
  from: number,
  standing: number,
  raidMs: number = WARLORD.raidMs,
): number {
  const r = mulberry32((seedOf(`${seed}:war:${from}`) ^ 0x3b9ac9ff) >>> 0 || 1)();
  return (raidMs / Math.max(1, standing)) * (1 + (r * 2 - 1) * WARLORD.jitter);
}

/** 🚩 Le lieu tenu le MOINS défendu à `at` (dont l'attaque prévue vient après), `null` si aucun. */
export function weakestHeld(pois: readonly Poi[], at: number, seed: number): Poi | null {
  const held = heldBefore(pois, at);
  if (!held.length) return null;
  const least = Math.min(...held.map((p) => p.control!.garrison.length));
  const ties = held.filter((p) => p.control!.garrison.length === least);
  const r = mulberry32((seedOf(`${seed}:warTarget:${at}`) ^ 0x7f4a7c15) >>> 0 || 1)();
  return ties[Math.floor(r * ties.length)]!;
}

/** Les lieux tenus dont l'attaque prévue vient APRÈS `at` (on n'en recule jamais une). */
function heldBefore(pois: readonly Poi[], at: number): Poi[] {
  return pois.filter(
    (p) =>
      p.control?.owner === 'player' &&
      ALL_CONTROL_KINDS.includes(p.control.kind) &&
      p.control.attackAt !== undefined &&
      p.control.attackAt > at,
  );
}

/**
 * 🔮 LES INVASIONS COMBINÉES DE L'ÎLE 5 (roadmap : « invasions combinées ») : tant qu'un
 * sanctuaire maudit tient, une invasion sort en moyenne toutes les `raidMs` / sanctuaires
 * debout et frappe TOUS les lieux tenus à la fois (elle avance leurs attaques prévues au même
 * instant). Plus rare que l'armée de l'île 4, mais tout tombe en même temps : il faut des
 * garnisons partout. Même mécanique que `warlordRaids` (même horloge `warAt`).
 */
export const INVASION = {
  islands: new Set([5]) as ReadonlySet<number>,
  raidMs: 72 * 3600_000,
} as const;

/**
 * 🔮 LES FAILLES CORROMPUES DE L'ÎLE 5 : tant qu'un sanctuaire maudit tient, chaque faille
 * naît VIEILLIE de `ageMs` par sanctuaire debout (plus peuplée, elle déborde plus tôt). Une
 * seule fois par faille (`Poi.corrupt`).
 */
export const CURSE = {
  islands: new Set([5]) as ReadonlySet<number>,
  ageMs: 24 * 3600_000,
} as const;

/** 🔮 Corrompt les failles neuves de l'île 5. Rend les MÊMES lieux si rien ne change. */
export function corruptRifts(map: ExpeditionMap, pois: Poi[]): Poi[] {
  const isl = activeIsland(map);
  if (!isl || !CURSE.islands.has(isl.id) || islandPacified(map)) return pois;
  const n = standingCamps({ pois });
  if (!n || !pois.some((p) => isRiftPoi(p) && !p.corrupt)) return pois;
  const age = n * CURSE.ageMs;
  return pois.map((p) =>
    isRiftPoi(p) && !p.corrupt
      ? {
          ...p,
          spawnedAt: p.spawnedAt - age,
          expiresAt: p.expiresAt - age,
          corrupt: true,
        }
      : p,
  );
}

/** 🚩 Avance l'armée mobile jusqu'à `now`. Rend la MÊME carte si rien ne change. */
export function warlordRaids(map: ExpeditionMap, now: number): ExpeditionMap {
  const isl = activeIsland(map);
  const a = map.archipel;
  if (!a) return map;
  const camps = standingCamps(map);
  // 🚩 Île 4 : le moins défendu ; 🔮 île 5 : tous à la fois, plus rarement.
  const all = !!isl && INVASION.islands.has(isl.id);
  const raidMs = all ? INVASION.raidMs : WARLORD.raidMs;
  const active = !!isl && (WARLORD.islands.has(isl.id) || all) && !islandPacified(map) && camps > 0;
  if (!active) {
    if (a.warAt === undefined) return map;
    const { warAt: _w, ...rest } = a;
    void _w;
    return { ...map, archipel: rest };
  }
  let pois = map.pois;
  let at = a.warAt ?? now + warDelayMs(map.seed, now, camps, raidMs);
  for (let n = 0; at <= now && n < WARLORD.catchUp; n++) {
    const hit = new Set(
      (all ? heldBefore(pois, at) : [weakestHeld(pois, at, map.seed)])
        .filter((p): p is Poi => !!p)
        .map((p) => p.id),
    );
    if (hit.size) {
      const when = at;
      pois = pois.map((p) =>
        hit.has(p.id) ? { ...p, control: { ...p.control!, attackAt: when } } : p,
      );
    }
    at += warDelayMs(map.seed, at, camps, raidMs);
  }
  if (at <= now) at = now + warDelayMs(map.seed, now, camps, raidMs);
  if (at === a.warAt && pois === map.pois) return map;
  return { ...map, pois, archipel: { ...a, warAt: at } };
}

/**
 * 🐫 LES CONVOIS DE RAVITAILLEMENT DE L'ÎLE 4 (roadmap : « 3 camps de guerre, armée mobile
 * qui vise le moins défendu, convois ») : tant qu'un camp de guerre tient et que la
 * forteresse est debout, un convoi part d'un camp en moyenne toutes les `everyMs` / camps
 * debout et marche `travelMs` jusqu'à la forteresse. C'est une BANDE EN MARCHE : on
 * l'intercepte comme celle d'une faille (même force, calibrée sur l'escorte de référence),
 * et la battre rapporte sa cargaison (`convoyHaul`). ARRIVÉ, il RENFORCE la forteresse de
 * `troop` champion de référence (au plus `max`) : l'ignorer rend la fin de l'île plus dure.
 *
 * ⚠️ L'arrivée se tranche ICI, une fois : le convoi reste sur la carte jusque-là
 * (`advanceWorld` ne le retire pas à l'échéance). Il est intercepté s'il a quitté la carte
 * avant (une victoire l'en retire, `restoreUnvanquished`) OU si un voyage l'a battu avant son
 * arrivée (`vanquished` — sans ça, l'ordre des ticks déciderait après une absence).
 */
export const CONVOY = {
  islands: new Set([4]) as ReadonlySet<number>,
  everyMs: 24 * 3600_000,
  travelMs: 8 * 3600_000,
  jitter: 0.25,
  troop: 1,
  max: 4,
  catchUp: 8,
} as const;

/** 🐫 Le renfort de la forteresse : un champion de référence par convoi arrivé (borné). */
export function convoyBonus(map: Pick<ExpeditionMap, 'archipel'>): number {
  return Math.min(CONVOY.max, map.archipel?.delivered?.length ?? 0) * CONVOY.troop;
}

/** Le délai jusqu'au prochain convoi, à `standing` camps debout. */
export function convoyDelayMs(seed: number, from: number, standing: number): number {
  const r = mulberry32((seedOf(`${seed}:convoy:${from}`) ^ 0x2545f491) >>> 0 || 1)();
  return (CONVOY.everyMs / Math.max(1, standing)) * (1 + (r * 2 - 1) * CONVOY.jitter);
}

/** 🐫 Les convois qu'un voyage a BATTUS (l'issue est tirée au départ, la rencontre a lieu
 *  avant l'arrivée : `interceptLeg`). */
export function convoyVanquished(
  voyages: readonly { poi: Pick<Poi, 'id' | 'convoy'>; outcome?: { win?: boolean } }[],
): Set<string> {
  return new Set(voyages.filter((v) => v.poi.convoy && v.outcome?.win).map((v) => v.poi.id));
}

/** 🐫 Fait partir et arriver les convois jusqu'à `now`. Rend la MÊME carte si rien ne change. */
export function warlordConvoys(
  map: ExpeditionMap,
  now: number,
  vanquished: ReadonlySet<string> = new Set(),
): ExpeditionMap {
  const a = map.archipel;
  if (!a) return map;
  const isl = activeIsland(map);
  const fortress = map.pois.find((p) => p.id === FORTRESS_ID && p.control?.owner === 'enemy');
  const camps = map.pois.filter(
    (p) => p.control?.owner === 'enemy' && p.control.kind === 'objective',
  );
  const active =
    !!isl && CONVOY.islands.has(isl.id) && !islandPacified(map) && !!fortress && camps.length > 0;
  let pois = map.pois;
  let convoys = a.convoys ?? [];
  let delivered = a.delivered ?? [];
  const deliver = (id: string) => {
    if (!delivered.includes(id)) delivered = [...delivered, id];
  };
  // 1. Les arrivées. Avant l'échéance, un convoi disparu ou battu est INTERCEPTÉ ; à
  // l'échéance, encore là et jamais battu, il LIVRE.
  for (const c of a.convoys ?? []) {
    const onMap = pois.some((p) => p.id === c.id);
    const beaten = vanquished.has(c.id) || !onMap;
    if (c.at > now && !beaten) continue;
    convoys = convoys.filter((x) => x.id !== c.id);
    if (onMap) pois = pois.filter((p) => p.id !== c.id);
    if (!beaten && fortress) deliver(c.id);
  }
  // 2. Les départs.
  let convoyAt = a.convoyAt;
  if (!active) {
    // Île quittée, pacifiée, forteresse prise ou plus aucun camp : plus de convoi en route.
    const stale = new Set(convoys.map((c) => c.id));
    if (stale.size) pois = pois.filter((p) => !stale.has(p.id));
    convoys = [];
    convoyAt = undefined;
  } else {
    let at = convoyAt ?? now + convoyDelayMs(map.seed, now, camps.length);
    for (let n = 0; at <= now && n < CONVOY.catchUp; n++) {
      const r = mulberry32((seedOf(`${map.seed}:convoyCamp:${at}`) ^ 0x1b873593) >>> 0 || 1)();
      const camp = camps[Math.floor(r * camps.length)]!;
      const id = `isl_convoy_${Math.round(at)}`;
      const arrive = at + CONVOY.travelMs;
      // ⚠️ Parti ET arrivé pendant une absence : personne n'a pu l'intercepter, il livre.
      if (arrive <= now) deliver(id);
      else {
        pois = [
          ...pois,
          {
            id,
            type: 'warband',
            convoy: true,
            level: camp.level,
            travelLevel: ARCHIPEL_TRAVEL_LEVEL,
            x: camp.x,
            y: camp.y,
            from: { x: camp.x, y: camp.y },
            to: { x: fortress.x, y: fortress.y },
            distNorm: distNormAt(Math.hypot(camp.x - EXPE.town.x, camp.y - EXPE.town.y)),
            spawnedAt: at,
            expiresAt: arrive,
            faction: isl.faction,
          },
        ];
        convoys = [...convoys, { id, at: arrive }];
      }
      at += convoyDelayMs(map.seed, at, camps.length);
    }
    if (at <= now) at = now + convoyDelayMs(map.seed, now, camps.length);
    convoyAt = at;
  }
  if (
    pois === map.pois &&
    convoyAt === a.convoyAt &&
    same(convoys, a.convoys ?? []) &&
    same(delivered, a.delivered ?? [])
  )
    return map;
  const next = { ...a };
  if (convoyAt === undefined) delete next.convoyAt;
  else next.convoyAt = convoyAt;
  if (convoys.length) next.convoys = convoys;
  else delete next.convoys;
  if (delivered.length) next.delivered = delivered;
  else delete next.delivered;
  return { ...map, pois, archipel: next };
}

/** Les camps (objectifs) encore debout. */
function standingCamps(map: Pick<ExpeditionMap, 'pois'>): number {
  return map.pois.filter((p) => p.control?.owner === 'enemy' && p.control.kind === 'objective')
    .length;
}

/** Le délai jusqu'au prochain pillage, à `standing` camps debout (graine : la carte, l'instant). */
export function pillageDelayMs(seed: number, from: number, standing: number): number {
  const r = mulberry32((seedOf(`${seed}:pillage:${from}`) ^ 0x6c8e9cf5) >>> 0 || 1)();
  return (BRIGANDS.pillageMs / Math.max(1, standing)) * (1 + (r * 2 - 1) * BRIGANDS.jitter);
}

/**
 * ⛺ Avance le pillage jusqu'à `now`. `null` quand rien ne change ; sinon la carte (prochaine
 * échéance), les bâtiments (réserve prise) et ce qui a été pris, avec le rapport à déposer.
 */
export function brigandPillage(
  map: ExpeditionMap,
  buildings: readonly Building[],
  now: number,
): {
  map: ExpeditionMap;
  buildings: Building[];
  stolen: Record<BuildResource, number>;
  msg: ExpeditionMessage | null;
} | null {
  const isl = activeIsland(map);
  const arch = map.archipel;
  const camps = standingCamps(map);
  const none = { energy: 0, summon: 0, keys: 0 } as Record<BuildResource, number>;
  const active =
    !!isl && !!arch && PILLAGE_ISLANDS.has(isl.id) && !islandPacified(map) && camps > 0;
  if (!arch) return null;
  if (!active) {
    if (arch.pillageAt === undefined) return null;
    const { pillageAt: _p, ...rest } = arch;
    void _p;
    return { map: { ...map, archipel: rest }, buildings: [...buildings], stolen: none, msg: null };
  }
  const at = arch.pillageAt;
  if (at === undefined || at > now) {
    if (at !== undefined) return null;
    const next = now + pillageDelayMs(map.seed, now, camps);
    return {
      map: { ...map, archipel: { ...arch, pillageAt: next } },
      buildings: [...buildings],
      stolen: none,
      msg: null,
    };
  }
  const stolen = collectable([...buildings], at);
  const robbed = buildings.map((b) =>
    buildingType(b.typeId)?.resource && b.collectedAt < at ? { ...b, collectedAt: at } : b,
  );
  const next = now + pillageDelayMs(map.seed, now, camps);
  const parts = [
    stolen.energy ? `${stolen.energy} ⚡` : '',
    stolen.keys ? `${stolen.keys} 🗝️` : '',
    stolen.summon ? `${stolen.summon} 🔮` : '',
  ].filter(Boolean);
  const msg: ExpeditionMessage | null = parts.length
    ? {
        id: `pill_${at}`,
        title: `${isl.objectiveEmoji} Les brigands ont pillé ta base`,
        level: isl.maxLevel,
        win: false,
        text: `Des brigands sortis de leurs camps ont pris ce que tes bâtiments n'avaient pas encore livré : ${parts.join(', ')}. Récolte souvent pour ne rien leur laisser, ou abats leurs camps.`,
        gold: 0,
        energy: 0,
        key: 0,
        resolvedAt: at,
        read: false,
      }
    : null;
  return {
    map: { ...map, archipel: { ...arch, pillageAt: next } },
    buildings: robbed,
    stolen,
    msg,
  };
}
