/**
 * 🧭 « RÉPARTIR » — LE CALCUL ENTIER, hors de l'écran (2026-10-15).
 *
 * Sorti de `useExpeditionPlanner` pour que le jeu et le banc de mesure exécutent EXACTEMENT le
 * même code : qui est où, quelles places, quelle force viser, quels trajets, quelle vitesse et
 * quels soutiens par garnison. L'écran ne fait plus qu'afficher le résultat et lancer les
 * déplacements. La géométrie et la recherche vivent dans `mapDeployment.ts`.
 */
import { advGearRoles } from './advGear';
import type { Adventurer } from './adventurers';
import {
  attackSupport,
  heroPartyCombatant,
  partyAllies,
  refEscortUnits,
  type EscortKit,
  type PartyHero,
} from './caravan';
import { combatPowerRaw } from './combat';
import { seatsOf } from './controlPoints';
import { deployTargetsOf, isHeldRazed } from './islandConquest';
import { legFromSpot } from './controlRoutes';
import {
  ARCHIPEL_TRAVEL_LEVEL,
  archipelFloor,
  EXPE,
  HERO_GARRISON_SEATS,
  distNormAt,
  isFieldArmyPoi,
  type ExpeditionMap,
  type Poi,
} from './expedition';
import {
  deployEasyLevel,
  deployRefLevel,
  deploymentPoints,
  planStations,
  planStationsAsync,
  type DeployResult,
  type DeploySpot,
  type DeployTune,
  type DeployUnit,
} from './mapDeployment';
import { partyLegMin } from './party';

export interface DeployPlanInput {
  map: ExpeditionMap | null | undefined;
  /** Les champions libres à la base. */
  atBase: readonly Adventurer[];
  /** Les garnisons prêtes (lieu tenu → champions). */
  garrisons: ReadonlyMap<string, readonly Adventurer[]>;
  /** ⏳ Les champions qu'on ne peut pas bouger (en route, à l'infirmerie, en sortie…) et
   *  l'endroit où ils seront (`deployAnchors`) : ils y comptent, sans être déplacés. */
  fixed?: readonly { adv: Adventurer; loc: string }[];
  /** Le héros et où il se trouve (`'base'` ou l'id du lieu) ; `fixed` = pas disponible, il y
   *  compte sans être déplacé. */
  hero: { party: PartyHero; loc: string; fixed?: boolean } | null;
  road: EscortKit;
  heroLevel: number;
  travelMult: number;
  /** Le niveau d'Avant-poste qui fixe la taille de la carte (`mapOutpostLevel`). */
  outpostLevel: number;
  /** Réglages (le banc de mesure en essaie plusieurs ; le jeu prend ceux par défaut). */
  tune?: DeployTune;
}

export interface DeployPlanOutput {
  plan: DeployResult;
  units: DeployUnit[];
  spots: DeploySpot[];
  /** Les lieux tenus, par id. */
  points: Map<string, Poi>;
  /** Les champions, par id. */
  byId: Map<string, Adventurer>;
}

/** L'id de l'unité du héros dans la répartition. */
export const DEPLOY_HERO_ID = '__hero';

/** 🗺️ Les lieux qui ATTENDENT d'être pris (ni lieux fixes ni armées en marche), comptés chacun
 *  sur le point d'échantillon le plus proche (`DEPLOY_STOCK_SHARE`). */
export function waitingWeights(
  pois: readonly Pick<Poi, 'type' | 'army' | 'x' | 'y'>[],
  pts: readonly { x: number; y: number }[],
): number[] {
  const w = pts.map(() => 0);
  if (!pts.length) return w;
  for (const p of pois) {
    if (p.type === 'control' || isFieldArmyPoi(p)) continue;
    let k = 0;
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dd = Math.hypot(pts[i]!.x - p.x, pts[i]!.y - p.y);
      if (dd < best) {
        best = dd;
        k = i;
      }
    }
    w[k]!++;
  }
  return w;
}

/** Tout ce qu'il faut à la recherche, et ce que l'écran relit ensuite. */
function prepare(input: DeployPlanInput) {
  const { map, road } = input;
  const byId = new Map<string, Adventurer>();
  const units: DeployUnit[] = [];
  const add = (a: Adventurer, at: string, fixed = false) => {
    byId.set(a.id, a);
    units.push({
      id: a.id,
      hero: false,
      loc: at,
      power: combatPowerRaw(partyAllies([a], road, null)[0]!.combatant),
      ...(fixed ? { fixed } : {}),
    });
  };
  for (const a of input.atBase) add(a, 'base');
  for (const [pid, ready] of input.garrisons) for (const a of ready) add(a, pid);
  for (const f of input.fixed ?? []) if (!byId.has(f.adv.id)) add(f.adv, f.loc, true);
  if (input.hero)
    units.push({
      id: DEPLOY_HERO_ID,
      hero: true,
      loc: input.hero.loc,
      power: combatPowerRaw(heroPartyCombatant(input.hero.party)),
      ...(input.hero.fixed ? { fixed: true } : {}),
    });
  // Personne à placer : rien à proposer (les immobiles seuls ne bougent pas).
  if (!units.some((u) => !u.fixed)) return null;

  // Les endroits : la base, et tout lieu tenu qui reçoit des champions (`seatsOf` > 0).
  // ⚠️ On part de ZÉRO : tout le monde bouge en même temps, chaque lieu est considéré VIDE,
  // donc ses places sont toutes ses places de champions — moins celles des immobiles
  // (`fixed`), que la recherche y pose d'office. La défense n'entre pas en compte :
  // ce sont les miliciens qui gardent les lieux fixes.
  // 🪺🕯️ Jamais un objectif qui s'abat (nid, objectif éteint de l'île 3) : un reliquat tenu
  // est rappelé, personne n'y va.
  const held = (map?.pois ?? []).filter(
    (p) =>
      p.control?.owner === 'player' &&
      seatsOf(p.control.kind) > 0 &&
      !p.control.razes &&
      !(map && isHeldRazed(map, p)),
  );
  const points = new Map(held.map((p) => [p.id, p]));
  const spots: DeploySpot[] = [
    { id: 'base', seats: Infinity, heroOk: true },
    ...held.map((p) => ({
      id: p.id,
      seats: seatsOf(p.control!.kind),
      heroOk: seatsOf(p.control!.kind) >= HERO_GARRISON_SEATS,
    })),
  ];

  // 🎯 La force à réunir : l'escorte de RÉFÉRENCE (celle sur laquelle camps et failles se
  // calibrent) au plus haut rang de l'île — de quoi prendre un lieu dur courant.
  const floor = archipelFloor(map);
  const cap = map?.archipel?.levelCap ?? Infinity;
  const level = deployRefLevel(input.heroLevel, floor, cap);
  const forceAt = (lv: number) =>
    refEscortUnits(lv).reduce((s, x) => s + combatPowerRaw(x.combatant), 0);
  const force = forceAt(level);
  // 🌱 Objectif mixte : chaque garnison doit aussi pouvoir prendre SEULE un lieu facile.
  const easyForce = forceAt(deployEasyLevel(input.heroLevel, floor, cap));

  // L'île, échantillonnée : un trajet de chaque endroit vers chaque point.
  const island = map?.archipel?.island ?? null;
  const pts = deploymentPoints(island, input.outpostLevel);
  const pointWeights = waitingWeights(map?.pois ?? [], pts);
  const travelLevel = map?.archipel ? ARCHIPEL_TRAVEL_LEVEL : level;
  const legOf = (p: Poi) =>
    partyLegMin(p, [], { hero: false, travelMult: input.travelMult, gearSpeed: 0 });
  const ptPoi = pts.map(
    (q, i): Poi => ({
      id: `deploy-${i}`,
      type: 'camp',
      level,
      x: q.x,
      y: q.y,
      distNorm: distNormAt(Math.hypot(q.x - EXPE.town.x, q.y - EXPE.town.y)),
      travelLevel,
      spawnedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    }),
  );
  const legTo = (spot: string, q: Poi) => {
    const from = points.get(spot);
    return from ? legFromSpot(q, from, legOf) : legOf(q);
  };
  const trip = (spot: string, p: number) => legTo(spot, ptPoi[p]!);

  // 🎯 Les objectifs ennemis, présents ou éteints : un trajet de chaque endroit
  // (`DEPLOY_TARGET_SHARE` : y amener une garnison).
  const objs = deployTargetsOf(map);
  const objPoi = objs.map(
    (o): Poi => ({
      id: `deploy-obj-${o.id}`,
      type: 'camp',
      level,
      x: o.x,
      y: o.y,
      distNorm: distNormAt(Math.hypot(o.x - EXPE.town.x, o.y - EXPE.town.y)),
      travelLevel,
      spawnedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    }),
  );
  const targetTrip = (spot: string, t: number) => legTo(spot, objPoi[t]!);

  // 🧭 La vitesse d'une garnison : la RÈGLE DES MISSIONS (`partyLegMin` : compétences 🧭,
  // pièces de vitesse, héros), rapportée au trajet d'une équipe sans compétence, mesurée
  // sur un lieu lointain pour que l'arrondi à la minute ne pèse rien.
  const far: Poi = {
    id: 'deploy-far',
    type: 'camp',
    level,
    x: EXPE.town.x,
    y: EXPE.town.y,
    distNorm: 1,
    travelLevel,
    spawnedAt: 0,
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
  const plain = Math.max(1, legOf(far));
  const champsOf = (members: readonly DeployUnit[]) =>
    members.filter((u) => !u.hero).map((u) => byId.get(u.id)!);
  const keep = (members: readonly DeployUnit[]) => {
    const advs = champsOf(members);
    return (
      partyLegMin(far, advs, {
        hero: members.some((u) => u.hero),
        travelMult: input.travelMult,
        gearSpeed: advs.length ? advGearRoles(advs, road.advGear).speed : 0,
      }) / plain
    );
  };
  const support = (members: readonly DeployUnit[]) => attackSupport(champsOf(members));

  const opts = {
    force,
    easyForce,
    targets: objs.length,
    pointWeights,
    deps: { trip, targetTrip, keep, support },
    tune: input.tune,
  };
  return { units, spots, points, byId, nPoints: pts.length, opts };
}

/** 🧭 La répartition, d'une traite (tests, banc de mesure). */
export function buildDeployment(input: DeployPlanInput): DeployPlanOutput | null {
  const p = prepare(input);
  if (!p) return null;
  const plan = planStations(p.units, p.spots, p.nPoints, p.opts);
  return { plan, units: p.units, spots: p.spots, points: p.points, byId: p.byId };
}

/** ⏳ La même, en rendant la main à l'écran pendant la recherche (le jeu). */
export async function buildDeploymentAsync(
  input: DeployPlanInput,
): Promise<DeployPlanOutput | null> {
  const p = prepare(input);
  if (!p) return null;
  const plan = await planStationsAsync(p.units, p.spots, p.nPoints, p.opts);
  return { plan, units: p.units, spots: p.spots, points: p.points, byId: p.byId };
}
