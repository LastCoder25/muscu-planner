/**
 * ⚔️🗼 LES ARMÉES EN CAMPAGNE (2026-09-29, demandé par l'utilisateur) — l'armée qui marche
 * sur la BASE (un siège) ou sur un POINT FIXE tenu (une reprise), rendue VISIBLE sur la carte
 * et ATTAQUABLE avant qu'elle n'arrive, comme la bande d'une faille.
 *
 * - **On la voit selon la Tour de guet** : le RAYON DE DÉTECTION de la base vaut la distance
 *   qu'une armée parcourt pendant le préavis de la Tour (`detectRadius`). L'armée d'un siège
 *   apparaît au bord de ce rayon à l'instant où la Tour la repère (`detectedAt`) et marche
 *   sur la ville ; l'armée d'une reprise n'apparaît que quand elle ENTRE dans ce rayon en
 *   marchant sur son point — un point tenu hors du rayon est attaqué sans qu'on la voie venir.
 *   Jamais au-delà de la zone révélée (le brouillard reste le brouillard).
 * - **L'attaquer** est un combat de camp (`fightCampForce`) contre sa force EN CAMPAGNE,
 *   en champions de référence (`FieldArmyTag.size`). Chaque ennemi abattu est retiré de
 *   l'armée : le siège ou la reprise arrive amputé d'autant (`applyFieldHit*`). La battre
 *   entièrement ANNULE l'attaque.
 * - **Défaite** : les tombés vont à l'infirmerie (`campHurt`), mais tout le monde rentre avec
 *   le butin des ennemis abattus : la ressource de leur faction, ou du mana 💠 si l'armée sort
 *   d'une faille (seules les armées de faille en donnent).
 * - Le sort du choc est tiré à l'ENVOI (graine fixée), appliqué à l'heure du CHOC — jamais
 *   après l'arrivée de l'armée : un choc qui tomberait trop tard ne change rien.
 *
 * ⚠️ PUR : le store écrit.
 */
import {
  EXPE,
  distNormAt,
  isFieldArmyPoi,
  warbandAt,
  ARCHIPEL_TRAVEL_LEVEL,
  type CampSpec,
  type ExpeditionMap,
  type ExpeditionOutcome,
  type FieldArmyTag,
  type FieldHit,
  type PartyResult,
  type Poi,
} from './expedition';
import {
  raidFirstSector,
  FACTION_EMOJI,
  FACTION_LABEL,
  type BaseState,
  type Raid,
  type RaidGroup,
} from './raid';
import { BATTLE } from './siegeBattle';
import { islandCenter, islandSpan, islandVia, onIsland } from './islandShape';
import { ISLANDS, islandById } from './archipelago';
import {
  CONTROL,
  attackerLevel,
  citadelIdFor,
  defendsControl,
  retakeBoost,
  retakeForce,
} from './controlPoints';
import {
  campHurt,
  campLightHurt,
  campWinPct,
  fightCampForce,
  forceHaul,
  type PartyInput,
} from './camp';
import { missionXpFor, partyAllies, type EscortKit } from './caravan';
import { militiaUnits } from './militia';
import type { Adventurer } from './adventurers';
import type { SkirmishUnit } from './skirmish';
import { RIFT, riftMana } from './rift';

/** Force de l'armée d'un SIÈGE en rase campagne, en champions de référence. ⚠️ MESURÉE
 *  (champions de référence du niveau du joueur, 60 combats) : un camp de taille N se prend à
 *  ~N champions — à 6, trois champions n'en abattaient que ~37 % et six la battaient à coup
 *  sûr. À 8 : on l'ampute seul, on la BAT en attaque combinée (base + points fixes). */
const SIEGE_SIZE = 8;

export const FIELD_ARMY = {
  /** Vitesse de marche d'une armée, en unités de carte par heure. Elle fait du préavis de la
   *  Tour un RAYON : 30 min sans Tour → 5 unités, niveau 10 → 35, niveau 30 → 57, niveau 100
   *  → 100. Les points fixes sont à ~32 unités de la ville : une Tour vers le niveau 10 voit
   *  arriver les reprises. */
  speedPerHour: 10,
  siegeSize: SIEGE_SIZE,
  /** 💠 Mana par champion de référence abattu — calé pour qu'abattre TOUTE l'armée d'un
   *  siège rapporte ce que rapporte la défense qui la repousse entièrement
   *  (`RIFT.siegeManaFoes`). */
  manaFoesPerSize: RIFT.siegeManaFoes / SIEGE_SIZE,
  /** Plancher de la force affichée/affrontée : une armée amputée reste une armée. */
  minSize: 0.25,
} as const;

const H = 3_600_000;

/** 🗼 Le rayon de détection de la base : la distance qu'une armée parcourt pendant le
 *  préavis de la Tour de guet (`scoutLeadMs`). */
export function detectRadius(leadMs: number): number {
  return (FIELD_ARMY.speedPerHour * Math.max(0, leadMs)) / H;
}

/** Le rayon où l'on VOIT vraiment : la détection, dans la zone révélée. ⚠️ Source unique :
 *  les armées n'apparaissent qu'en deçà, et le cercle dessiné sur la carte le lit aussi. */
export function seenRadius(detectR: number, reach: number): number {
  return Math.max(0, Math.min(detectR, reach - 1));
}

/** 👁️ LE PLANCHER DE DÉTECTION (décision de l'utilisateur, 2026-10-04) : tout lieu qu'on
 *  tient — la base comme chaque lieu fixe — voit les armées à 30 unités autour de lui, Tour
 *  ou pas. */
export const DETECT_FLOOR = 30;

/** 🏝️🗼 La part de l'île que voit la Tour de guet de la base : sa place dans la TRANCHE de
 *  niveaux de l'île (décision de l'utilisateur, 2026-10-04 : « détection totale sur l'île au
 *  niveau de l'île ») — rien au premier niveau de l'île, tout à son niveau max : Tour 40 voit
 *  toute l'île 2, Tour 50 la moitié de l'île 3. ⚠️ Rapportée au seul niveau max, une Tour 32
 *  annonçait 53 % de l'île 3 (41-60) à un joueur qui n'y a pas accès (signalé le même jour).
 *  Les Tours tenues sur la carte (`controlDetectBoost`) multiplient le niveau, comme le préavis. */
export function islandDetectShare(scout: number, islandId: number, boost: number): number {
  const isl = islandById(islandId) ?? ISLANDS[0]!;
  const eff = Math.max(0, scout) * (1 + Math.max(0, boost || 0));
  const span = Math.max(1, isl.maxLevel - isl.minLevel + 1);
  return Math.min(1, Math.max(0, (eff - (isl.minLevel - 1)) / span));
}

/** 🏝️🗼 Le rayon de détection de la base sur une île : la part (`islandDetectShare`) de la
 *  plus grande distance entre le port et la terre de l'île (`islandSpan`), jamais sous le
 *  plancher. */
export function islandDetectRadius(scout: number, islandId: number, boost: number): number {
  return Math.max(DETECT_FLOOR, islandDetectShare(scout, islandId, boost) * islandSpan(islandId));
}

/** 🗼 Les PALIERS de perception, île par île (affichés sur la Tour de guet) : la part de
 *  chaque île que la Tour voit, et le niveau de Tour qui la couvre en entier. */
export interface PerceptionRow {
  id: number;
  emoji: string;
  name: string;
  /** Niveau de Tour à partir duquel on commence à voir l'île (son premier niveau). */
  fromAt: number;
  /** Niveau de Tour qui voit toute l'île (le niveau max de l'île). */
  fullAt: number;
  /** Part de l'île vue aujourd'hui (0..1). */
  share: number;
  current: boolean;
}
export function islandPerception(
  scout: number,
  boost: number,
  currentIsland: number | null,
): PerceptionRow[] {
  return ISLANDS.map((i) => ({
    id: i.id,
    emoji: i.emoji,
    name: i.name,
    fromAt: i.minLevel,
    fullAt: i.maxLevel,
    share: islandDetectShare(scout, i.id, boost),
    current: i.id === currentIsland,
  }));
}

/** 👁️ Un cercle de détection : autour de la base ou d'un lieu fixe tenu. */
export interface DetectCircle {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** 👁️ LES CERCLES DE DÉTECTION de la carte : la base (rayon de la Tour, jamais sous le
 *  plancher) et chaque lieu fixe TENU (le plancher). ⚠️ SOURCE UNIQUE : les armées n'y
 *  apparaissent que dedans, et la carte les dessine en pointillé. Un lieu posé sur la ville
 *  (le village du port) n'a pas de cercle à lui : celui de la base le couvre. */
export function detectionCircles(
  map: Pick<ExpeditionMap, 'pois'>,
  detectR: number,
  reach: number,
): DetectCircle[] {
  const out: DetectCircle[] = [
    {
      id: 'base',
      x: EXPE.town.x,
      y: EXPE.town.y,
      r: seenRadius(Math.max(DETECT_FLOOR, detectR), reach),
    },
  ];
  for (const p of map.pois) {
    if (p.type !== 'control' || p.control?.owner !== 'player') continue;
    if (Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y) < 1) continue;
    out.push({ id: p.id, x: p.x, y: p.y, r: DETECT_FLOOR });
  }
  return out;
}

function marching(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  spawnedAt: number,
  at: number,
  level: number,
  playerLevel: number,
  army: FieldArmyTag,
  now: number,
  /** 🧭 Le point de passage (centre d'une île 2 à 5) : elle ne coupe pas la mer. */
  via?: { x: number; y: number },
): Poi {
  const p: Poi = {
    id,
    type: 'warband',
    level,
    // Le trajet se lit sur la distance, pas sur le niveau de l'armée (comme un point fixe).
    travelLevel: Math.max(1, playerLevel),
    faction: army.faction,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    ...(via ? { via: { x: via.x, y: via.y } } : {}),
    x: from.x,
    y: from.y,
    distNorm: distNormAt(Math.hypot(from.x - EXPE.town.x, from.y - EXPE.town.y)),
    spawnedAt,
    expiresAt: at,
    army,
  };
  return warbandAt(p, Math.floor(now / EXPE.warbandStepMs) * EXPE.warbandStepMs);
}

/** 🏝️ Sur une île, une armée part de la TERRE : si son point de départ tombe en mer, on le
 *  ramène vers sa cible jusqu'à la côte (au pas d'une unité). Hors île, rien ne change. */
function ashore(
  from: { x: number; y: number },
  to: { x: number; y: number },
  island: number | undefined,
): { x: number; y: number } {
  if (island === undefined) return from;
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  for (let k = 0; k < d; k++) {
    const t = k / d;
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    if (onIsland(island, p.x, p.y, 4)) return p;
  }
  return { x: to.x, y: to.y };
}

/** 🏰 L'armée d'un SIÈGE sur la carte, ou `null` tant qu'on ne la voit pas. Elle part du bord
 *  du rayon de détection, du côté où elle frappera l'enceinte (`raidFirstSector`). */
export function siegeArmyPoi(
  raid: Raid,
  reach: number,
  now: number,
  playerLevel: number,
  /** 🏝️ L'île de la carte : l'armée y vient de l'INTÉRIEUR des terres, jamais de la mer. */
  island?: number,
): Poi | null {
  if (now >= raid.arrivesAt || !raid.groups.length) return null;
  const lead = detectRadius(raid.arrivesAt - raid.detectedAt);
  const dist = Math.max(1, seenRadius(lead, reach));
  const spawnedAt = raid.arrivesAt - (dist / FIELD_ARMY.speedPerHour) * H;
  if (now < Math.max(spawnedAt, raid.detectedAt)) return null;
  const sector = raidFirstSector(raid.seed) / BATTLE.sectors;
  // 🏝️ Îles 2 à 5 : le port est au bord de l'île, l'armée vient de l'intérieur (un demi-cercle
  // tourné vers le centre de l'île), jamais de la mer.
  const c = island === undefined ? null : islandCenter(island);
  const inland =
    c && (c.x !== EXPE.town.x || c.y !== EXPE.town.y)
      ? Math.atan2(c.y - EXPE.town.y, c.x - EXPE.town.x)
      : null;
  const ang = inland === null ? sector * 2 * Math.PI : inland + (sector - 0.5) * Math.PI * 0.8;
  const from = ashore(
    { x: EXPE.town.x + Math.cos(ang) * dist, y: EXPE.town.y + Math.sin(ang) * dist },
    EXPE.town,
    island,
  );
  const size = Math.max(FIELD_ARMY.minSize, FIELD_ARMY.siegeSize * (1 - (raid.fieldCut ?? 0)));
  return marching(
    `army_${raid.id}`,
    from,
    EXPE.town,
    spawnedAt,
    raid.arrivesAt,
    // ⚠️ Le NIVEAU DU JOUEUR, pas celui du champion du raid : l'armée est calibrée sur lui
    // (`rollRaid`), et `campFoe` se dimensionne sur le niveau du lieu — au niveau du
    // champion (au-dessus du joueur), aucune équipe n'en abattait rien.
    Math.max(1, playerLevel),
    playerLevel,
    {
      kind: 'siege',
      targetId: raid.id,
      at: raid.arrivesAt,
      faction: raid.faction,
      size,
      ...(raid.overflow ? { rift: true as const } : {}),
    },
    now,
    islandVia(island, from, EXPE.town),
  );
}

/** 🏰 L'armée d'une REPRISE sur la carte, ou `null` tant qu'elle n'est entrée dans AUCUN
 *  cercle de détection (`detectionCircles` : la base, et chaque lieu tenu — le point attaqué
 *  compris, donc on la voit toujours au moins sur les `DETECT_FLOOR` derniers pas). 🏯 Elle
 *  part de SA CITADELLE (`origin`) et marche en ligne droite sur le point ; sans citadelle
 *  connue, elle vient du bout de la carte dans l'axe ville → point. On ne la voit que sur la
 *  part de ce trajet qui suit sa PREMIÈRE entrée dans un cercle. */
export function retakeArmyPoi(
  p: Poi,
  map: Pick<ExpeditionMap, 'seed' | 'archipel'>,
  /** 👁️ Les cercles de détection (`detectionCircles`). Le point attaqué a toujours le sien. */
  circles: readonly DetectCircle[],
  reach: number,
  now: number,
  playerLevel: number,
  /** 🏯 D'où elle part : la citadelle qui attaque ce point. */
  origin?: { x: number; y: number },
): Poi | null {
  const c = p.control;
  if (!c || c.owner !== 'player' || c.attackAt === undefined || now >= c.attackAt) return null;
  const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
  if (d <= 0) return null;
  const isl = map.archipel?.island;
  const start = ashore(
    origin ?? {
      x: EXPE.town.x + ((p.x - EXPE.town.x) / d) * Math.max(reach, d + DETECT_FLOOR),
      y: EXPE.town.y + ((p.y - EXPE.town.y) / d) * Math.max(reach, d + DETECT_FLOOR),
    },
    p,
    isl,
  );
  // ⚠️ Le point attaqué voit TOUJOURS ses abords : son cercle est ajouté s'il manque.
  const all = circles.some((k) => k.id === p.id)
    ? circles
    : [...circles, { id: p.id, x: p.x, y: p.y, r: DETECT_FLOOR }];
  let tMin = Infinity;
  for (const k of all) {
    const t = entryParam(start, p, k, k.r);
    if (t !== null && t < tMin) tMin = t;
  }
  if (!Number.isFinite(tMin)) return null;
  const from = { x: start.x + (p.x - start.x) * tMin, y: start.y + (p.y - start.y) * tMin };
  const march = Math.hypot(p.x - from.x, p.y - from.y);
  const spawnedAt = c.attackAt - (march / FIELD_ARMY.speedPerHour) * H;
  if (now < spawnedAt) return null;
  const force = retakeForce(p, 1);
  const size = Math.max(FIELD_ARMY.minSize, force.size * (1 - (c.retakeCut ?? 0)));
  return marching(
    `army_${p.id}_${c.attackAt}`,
    from,
    { x: p.x, y: p.y },
    spawnedAt,
    c.attackAt,
    attackerLevel(map, p, playerLevel),
    playerLevel,
    { kind: 'retake', targetId: p.id, at: c.attackAt, faction: force.faction, size },
    now,
    islandVia(map.archipel?.island, from, p),
  );
}

/** 🏯 Où le trajet `from` → `to` ENTRE dans le cercle de rayon `r` autour de la ville : `from`
 *  lui-même s'il y est déjà, `null` si le trajet ne le traverse pas. */
export function entryPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  r: number,
): { x: number; y: number } | null {
  const t = entryParam(from, to, EXPE.town, r);
  return t === null ? null : { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) };
}

/** La part (0..1) du trajet `from` → `to` où il ENTRE dans le cercle (`center`, `r`) : 0 si
 *  `from` y est déjà, `null` s'il ne le traverse pas. */
function entryParam(
  from: { x: number; y: number },
  to: { x: number; y: number },
  center: { x: number; y: number },
  r: number,
): number | null {
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cc = fx * fx + fy * fy - r * r;
  if (cc <= 0) return 0;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * cc;
  if (a <= 0 || disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t < 0 || t > 1 ? null : t;
}

/**
 * 🗺️ La carte avec ses armées en campagne À JOUR : celles qu'on voit sont posées (ou
 * rafraîchies : position, force restante), celles qui ne sont plus (arrivées, battues,
 * sorties de la détection) sont retirées. Rend la MÊME carte quand rien ne change.
 */
export function syncFieldArmies(
  map: ExpeditionMap,
  ctx: {
    raid: Raid | null;
    /** Rayon de détection (`detectRadius` du préavis de la Tour). */
    detectR: number;
    /** Rayon révélé de la carte (`revealRadius`). */
    reach: number;
    now: number;
    playerLevel: number;
  },
): ExpeditionMap {
  const want0: Poi[] = [];
  if (ctx.raid) {
    const s = siegeArmyPoi(ctx.raid, ctx.reach, ctx.now, ctx.playerLevel, map.archipel?.island);
    if (s) want0.push(s);
  }
  const circles = detectionCircles(map, ctx.detectR, ctx.reach);
  for (const p of map.pois) {
    if (p.type !== 'control') continue;
    // 🪺 Elle part du NID qui vient d'apparaître (`raidFrom`, pour CETTE échéance), sinon de
    // la citadelle qui attaque ce point.
    const rf = p.control?.raidFrom;
    const cit =
      rf && rf.at === p.control?.attackAt
        ? rf
        : p.control
          ? map.pois.find((q) => q.id === citadelIdFor(map.pois, p.control!.kind))
          : undefined;
    const r = retakeArmyPoi(
      p,
      map,
      circles,
      ctx.reach,
      ctx.now,
      ctx.playerLevel,
      cit ? { x: cit.x, y: cit.y } : undefined,
    );
    if (r) want0.push(r);
  }
  // 🏝️ En mode archipel, le trajet ne lit aucun niveau — la règle que `advanceWorld` pose sur
  // tous les lieux. ⚠️ Sans elle, les deux réécriraient le lieu à chaque tick, l'un après
  // l'autre, et la carte serait persistée toutes les secondes.
  const want = map.archipel
    ? want0.map((w) => ({ ...w, travelLevel: ARCHIPEL_TRAVEL_LEVEL }))
    : want0;
  const old = map.pois.filter(isFieldArmyPoi);
  const byId = new Map(old.map((p) => [p.id, p]));
  const same =
    old.length === want.length &&
    want.every((w) => {
      const o = byId.get(w.id);
      return !!o && JSON.stringify(o) === JSON.stringify(w);
    });
  if (same) return map;
  return {
    ...map,
    pois: [
      ...map.pois.filter((p) => !isFieldArmyPoi(p)),
      ...want.map((w) => {
        const o = byId.get(w.id);
        return o && JSON.stringify(o) === JSON.stringify(w) ? o : w;
      }),
    ],
  };
}

/** Ce qu'on affronte : la force de campagne que porte l'armée. */
export function fieldArmySpec(poi: Pick<Poi, 'army'>): CampSpec | null {
  const a = poi.army;
  return a ? { faction: a.faction, size: Math.max(FIELD_ARMY.minSize, a.size) } : null;
}

/** 💠 Le mana d'un choc : au prorata de la force réellement abattue. */
export function fieldArmyMana(size: number, part: number, level: number): number {
  return riftMana(FIELD_ARMY.manaFoesPerSize * Math.max(0, size) * clamp01(part), level);
}

/** ⚔️ Attaquer une armée en campagne. ⚠️ Même forme d'entrée qu'un camp (sans `spec` :
 *  il vient de l'armée elle-même). */
export function resolveFieldArmy(input: Omit<PartyInput, 'spec'>): ExpeditionOutcome {
  const { poi, escort, hero, seed } = input;
  const tag = poi.army;
  const spec = fieldArmySpec(poi);
  if (!tag || !spec) throw new Error('resolveFieldArmy : ce lieu n’est pas une armée en campagne');
  const g = fightCampForce({ ...input, spec });
  const d = g.skirmish;
  const part = d.win ? 1 : g.foes ? g.slain / g.foes : 0;
  // ⚠️ SEULES LES ARMÉES DE FAILLE DONNENT DU MANA (décision de l'utilisateur) : les autres
  // laissent ce que portent leurs abattus, selon la faction — la MÊME règle qu'un camp
  // (`forceHaul` : tout si battue, les abattus sinon).
  const mana = tag.rift ? fieldArmyMana(spec.size, part, poi.level) : 0;
  const haul = tag.rift ? null : forceHaul(input, spec, d);
  const hit: FieldHit = {
    kind: tag.kind,
    targetId: tag.targetId,
    at: tag.at,
    part,
    hitId: `${poi.id}@${seed}`,
  };
  const party: PartyResult = {
    hero: !!hero,
    faction: spec.faction,
    escort: escort.map((a) => a.id),
    win: d.win,
    foes: g.foes,
    slain: g.slain,
    kills: g.kills,
    heroKills: g.heroKills,
    xp: missionXpFor(escort, poi, d.win, g.shares, input.pantheonLevel, !!hero, d.foeDealt),
    hurt: campHurt(d, escort),
    lightHurt: campLightHurt(d, escort),
    journal: g.journal,
    fieldHit: hit,
    // 🎬 Rejouée en bataille rangée, comme l'interception d'une bande (`warbandStage.ts`) :
    // les temps sont le LOG du vrai combat (`fightCampForce`), résumé sans rien perdre.
    battle: {
      maxPv: g.replay.maxPv,
      armyPv: g.replay.beastPv,
      groups: [
        { species: FACTION_LABEL[spec.faction], emoji: FACTION_EMOJI[spec.faction], count: g.foes },
      ],
      steps: g.replay.steps,
    },
  };
  const target = tag.kind === 'siege' ? 'ta base' : 'le point';
  const tag2 = `${FACTION_EMOJI[spec.faction]} ${g.slain}/${g.foes} abattus${mana ? ` · +${mana} 💠` : ''}`;
  return {
    win: d.win,
    gold: haul?.gold ?? 0,
    energy: 0,
    summonStones: haul?.summonStones ?? 0,
    mana,
    item: null,
    items: [],
    ...(haul && Object.keys(haul.supplies).length ? { supplies: haul.supplies } : {}),
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    text: d.win
      ? `⚔️ Armée battue en campagne — elle n’attaquera pas ${target}. ${tag2}`
      : `💀 Repoussés — l’armée marche encore sur ${target}, amputée de ${Math.round(part * 100)} %. ${tag2}`,
    party,
  };
}

/** Ce qu'un choc a changé. */
export type FieldEffect = 'routed' | 'thinned' | null;

/** L'armée d'un siège amputée d'une part : chaque groupe perd sa part de corps, le champion
 *  reste tant que l'armée n'est pas battue. */
export function thinGroups(groups: readonly RaidGroup[], part: number): RaidGroup[] {
  const k = 1 - clamp01(part);
  return groups
    .map((g) => (g.champion ? g : { ...g, count: Math.round(g.count * k) }))
    .filter((g) => g.count > 0);
}

const cutAfter = (cut: number | undefined, part: number) =>
  1 - (1 - clamp01(cut ?? 0)) * (1 - clamp01(part));

/**
 * 🏰 Un choc contre l'armée d'un SIÈGE, appliqué à la base. Ignoré s'il vise un autre raid,
 * s'il tombe APRÈS l'arrivée de l'armée, ou s'il est déjà appliqué. Battue (`part` 1, ou plus
 * aucun corps) : le siège est ANNULÉ et le suivant repart de `nextRaidAt`.
 * Rend la MÊME base quand rien ne change.
 */
export function applyFieldHitToBase(
  base: BaseState,
  hit: FieldHit,
  battleAt: number,
  nextRaidAt: number,
): { base: BaseState; effect: FieldEffect } {
  const r = base.raid;
  if (
    hit.kind !== 'siege' ||
    !r ||
    r.id !== hit.targetId ||
    battleAt > r.arrivesAt ||
    (r.fieldHits ?? []).includes(hit.hitId)
  )
    return { base, effect: null };
  const groups = thinGroups(r.groups, hit.part);
  const onlyChampion = groups.every((g) => g.champion);
  if (hit.part >= 1 || !groups.length || (onlyChampion && hit.part >= 0.5))
    return { base: { ...base, raid: null, nextRaidAt }, effect: 'routed' };
  return {
    base: {
      ...base,
      raid: {
        ...r,
        groups,
        fieldCut: cutAfter(r.fieldCut, hit.part),
        fieldHits: [...(r.fieldHits ?? []), hit.hitId],
      },
    },
    effect: 'thinned',
  };
}

/**
 * 🏰 Un choc contre l'armée d'une REPRISE, appliqué au point. Battue : la reprise est repoussée
 * à `nextAttackAt` (comme une défense tenue). Rend la MÊME carte quand rien ne change.
 */
export function applyFieldHitToMap(
  map: ExpeditionMap,
  hit: FieldHit,
  battleAt: number,
  nextAttackAt: number,
): { map: ExpeditionMap; effect: FieldEffect } {
  const p = map.pois.find((q) => q.id === hit.targetId);
  const c = p?.control;
  if (
    hit.kind !== 'retake' ||
    !p ||
    !c ||
    c.owner !== 'player' ||
    c.attackAt !== hit.at ||
    battleAt > c.attackAt ||
    (c.fieldHits ?? []).includes(hit.hitId)
  )
    return { map, effect: null };
  const cut = cutAfter(c.retakeCut, hit.part);
  const routed = hit.part >= 1 || cut >= 0.999;
  const control = routed
    ? (() => {
        const rest = { ...c, attackAt: nextAttackAt };
        delete rest.retakeCut;
        delete rest.fieldHits;
        return rest;
      })()
    : { ...c, retakeCut: cut, fieldHits: [...(c.fieldHits ?? []), hit.hitId] };
  return {
    map: { ...map, pois: map.pois.map((q) => (q === p ? { ...q, control } : q)) },
    effect: routed ? 'routed' : 'thinned',
  };
}

/** Les chocs EN ROUTE contre une armée donnée (voyages dont l'issue est tirée), avec l'heure
 *  du choc — de quoi les appliquer AVANT que l'armée n'arrive, quel que soit l'ordre des
 *  ticks. */
export function pendingFieldHits(
  voyages: readonly { midAt: number; outcome: ExpeditionOutcome }[],
  kind: FieldArmyTag['kind'],
  targetId: string,
): { hit: FieldHit; at: number }[] {
  const out: { hit: FieldHit; at: number }[] = [];
  for (const v of voyages) {
    const h = v.outcome.party?.fieldHit;
    if (h && h.kind === kind && h.targetId === targetId) out.push({ hit: h, at: v.midAt });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 🗺️ Ce que la carte dessine pour une armée en campagne : sa TRAJECTOIRE jusqu'au lieu
 *  attaqué (arrêtée au bord de sa cible), la flèche au bout, et l'anneau sur la cible. */
export interface ArmyPath {
  id: string;
  kind: FieldArmyTag['kind'];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** La pointe de flèche (chemin SVG) posée à l'arrivée du trait. */
  arrow: string;
  /** La cible (ville ou point fixe) : centre et rayon de l'anneau d'alerte. */
  tx: number;
  ty: number;
  tr: number;
}

/** Rayon autour de la cible où le trait s'arrête : la ville (enceinte dessinée) est plus
 *  large qu'un point fixe. */
export const ARMY_PATH = { baseR: 10, pointR: 9, arrow: 2.2 } as const;

/** 🗺️ La trajectoire d'une armée en campagne, de là où elle est jusqu'à ce qu'elle attaque —
 *  lue sur la MÊME marche que la carte (`to`, la ville par défaut). `null` si ce n'est pas une
 *  armée en campagne, ou si elle est déjà au contact. */
export function armyTrajectory(p: Poi): ArmyPath | null {
  if (!isFieldArmyPoi(p) || !p.army) return null;
  const to = p.to ?? EXPE.town;
  const r = p.army.kind === 'siege' ? ARMY_PATH.baseR : ARMY_PATH.pointR;
  const dx = to.x - p.x;
  const dy = to.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= r) return null;
  const ux = dx / d;
  const uy = dy / d;
  const x2 = to.x - ux * r;
  const y2 = to.y - uy * r;
  const a = ARMY_PATH.arrow;
  const bx = x2 - ux * a;
  const by = y2 - uy * a;
  const f = (n: number) => Math.round(n * 100) / 100;
  const arrow = `M${f(x2)},${f(y2)} L${f(bx - uy * a * 0.6)},${f(by + ux * a * 0.6)} L${f(bx + uy * a * 0.6)},${f(by - ux * a * 0.6)} Z`;
  return {
    id: p.id,
    kind: p.army.kind,
    x1: p.x,
    y1: p.y,
    x2,
    y2,
    arrow,
    tx: to.x,
    ty: to.y,
    tr: r - 1,
  };
}

/** La part de la troupe de reprise qui arrive vraiment (ce que les chocs n'ont pas abattu). */
export function retakeRemaining(p: Pick<Poi, 'control'>): number {
  return 1 - clamp01(p.control?.retakeCut ?? 0);
}

/**
 * ⚔️ LA BATAILLE D'UNE REPRISE, telle qu'elle sera livrée : les assaillants à LEUR niveau
 * (`attackerLevel`, tiré pour CETTE attaque), leur troupe grossie si la garnison tiendrait
 * trop bien (`retakeBoost`), amputée de ce que les sorties ont abattu (`retakeRemaining`).
 * ⚠️ SOURCE UNIQUE de la résolution (store) ET du % affiché : l'un ne peut pas annoncer
 * un ennemi que l'autre ne combat pas.
 */
export function retakeBattle(
  map: Pick<ExpeditionMap, 'seed' | 'archipel'>,
  p: Poi,
  allies: readonly SkirmishUnit[],
  playerLevel: number,
  /** 🧱🏹 Ce que l'enceinte retire à la troupe (`fortifyMult`), REQUIS : la bataille et le %
   *  affiché doivent le compter tous les deux. */
  fort: number,
): { foe: Poi; force: CampSpec } {
  const foe = { ...p, level: attackerLevel(map, p, playerLevel) };
  const f0 = retakeForce(foe, retakeBoost(foe, allies, fort));
  return { foe, force: { ...f0, size: (f0.size * retakeRemaining(p)) / Math.max(1, fort) } };
}

/**
 * 🎯 La part des assauts que ces défenseurs repousseront face à l'armée QUI ARRIVE
 * (demandé : « le % doit prendre en compte la défense ET l'attaquant »). Rejoue la bataille
 * de `retakeBattle` sur les graines de pronostic, jamais celle du vrai combat.
 * ⚠️ À n'appeler que quand l'armée est VISIBLE : avant, sa force est un secret.
 */
export function controlAttackHold(
  map: Pick<ExpeditionMap, 'seed' | 'archipel'>,
  p: Poi,
  ids: readonly string[],
  advs: readonly Adventurer[],
  kit: EscortKit,
  playerLevel: number,
  /** 🧱🏹 `fortifyMult`, REQUIS. */
  fort: number,
): number {
  const set = new Set(ids);
  const champs = advs.filter((a) => set.has(a.id));
  const allies = [...partyAllies(champs, kit, null), ...militiaUnits([...ids], playerLevel)];
  if (!allies.length || !defendsControl(p.control?.kind)) return 0;
  const { foe, force } = retakeBattle(map, p, allies, playerLevel, fort);
  return campWinPct(foe, force, allies, CONTROL.holdSamples);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** ⚔️ Une attaque en cours, telle que la liste des attaques la montre. */
export interface ActiveAttack {
  /** L'armée elle-même (un lieu de la carte : la toucher ouvre sa fiche). */
  army: Poi;
  kind: FieldArmyTag['kind'];
  /** Le point fixe visé par une reprise ; `null` pour un siège (la base). */
  target: Poi | null;
  /** Temps avant l'attaque (ms, ≥ 0). */
  inMs: number;
  /** Sa force en rase campagne, en champions de référence. */
  size: number;
  faction: FieldArmyTag['faction'];
}

/**
 * ⚔️ LES ATTAQUES VISIBLES EN COURS (2026-09-29, demandé : « comme la liste des lieux fixes,
 * une icône qui référence les attaques visibles en cours »). Les armées en campagne que la
 * carte DESSINE — donc déjà repérées par la Tour de guet : on ne liste jamais ce que le
 * brouillard cache. La plus proche de frapper d'abord.
 */
export function activeAttacks(pois: readonly Poi[], now: number): ActiveAttack[] {
  const byId = new Map(pois.map((p) => [p.id, p]));
  return pois
    .filter((p) => isFieldArmyPoi(p) && !!p.army && p.army.at > now)
    .map((p) => {
      const a = p.army!;
      return {
        army: p,
        kind: a.kind,
        target: a.kind === 'retake' ? (byId.get(a.targetId) ?? null) : null,
        inMs: a.at - now,
        size: a.size,
        faction: a.faction,
      };
    })
    .sort((x, y) => x.inMs - y.inMs);
}
