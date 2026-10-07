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
  fortMultOf,
  islandControlSpots,
  retakeCalmMs,
  champSeatsWithHero,
  walkPoint,
  walkHomeMs,
  heroPostBlocker,
} from './controlPoints';
import { islandTerrain } from './islandTerrain';
import { FIELD_ARMY } from './fieldArmy';
import { enemyWaitMs, sortieFires, SORTIE_EVENTS, type SortieKind } from './sortieClock';
import { islandPoint, islandScatter } from './islandShape';
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
  type SortieClock,
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
  /** 🕊️ …sauf sur ces îles, où il garde sa production entière (décision de l'utilisateur,
   *  2026-10-03 : l'île 1 pacifiée reste à 100 %). Les crans disparaissent quand même. */
  socleFullIslands: new Set([1]) as ReadonlySet<number>,
} as const;

/**
 * 🪺 LES NIDS DE L'ÎLE 2 (décisions de l'utilisateur, 2026-10-04 ; remplacent les pontes du
 * 2026-10-02) :
 * - les nids APPARAISSENT sur la carte tant que l'île n'est pas pacifiée — ils ne pondent plus
 *   (`spawnNests`). Pas de durée : **un nid toutes les 5 à 10 sorties sur la carte** (tiré à
 *   chaque nid, `nestThreshold`)
 *   (chaque héros ou équipe envoyé compte À SON ARRIVÉE, `ExpeditionMap.departures` ; un voyage
 *   rappelé par un demi-tour ne compte pas, `forgetDeparture`) — qui joue beaucoup en
 *   revoit souvent, qui ne sort pas n'en voit plus ; 6 nids nés au plus en même temps ;
 * - **un nid qui apparaît ATTAQUE** : il avance la reprise du lieu tenu le plus proche à
 *   l'armée part DU NID après une attente tirée au hasard (`strikeWaitMinMs`..`Max`), puis marche
 *   jusqu'au lieu (`FIELD_ARMY.speedPerHour`) : on la voit arriver dans le rayon de la Tour et on
 *   peut l'intercepter, comme toute reprise (`ControlState.raidFrom`, lu par `syncFieldArmies`) ;
 * - un nid pris est ABATTU, jamais tenu (`ControlState.razes`) ;
 * - leur NIVEAU est tiré entre le minimum et le maximum de l'île (`nestLevel`) ;
 * - seuls les 3 nids d'origine et la forteresse comptent pour pacifier : les nids nés ne
 *   bloquent jamais la pacification, qui les fait disparaître et arrête les apparitions ;
 * - les lieux à portée d'un nid ont des routes dangereuses (embuscades doublées).
 */
export const NEST = {
  islands: new Set([2]) as ReadonlySet<number>,
  /** Un nid apparaît toutes les N sorties sur la carte, N tiré entre ces bornes à chaque nid. */
  departuresMin: 5,
  departuresMax: 10,
  /** Le délai entre l'apparition d'un nid et son attaque sur le lieu tenu le plus proche. */
  strikeWaitMinMs: 3600_000,
  strikeWaitMaxMs: 3 * 3600_000,
  cap: 6,
  /** Portée des embuscades autour d'un nid (unités de carte). */
  radius: 25,
  /** La troupe d'un nid né en route. */
  size: 3,
} as const;

type NestBirth = NonNullable<NonNullable<ExpeditionMap['archipel']>['nests']>[number];

/** 🪺 Le niveau du nid d'index `i` (demandé le 2026-10-06 : « un niveau qui varie du minimum
 *  de la carte au maximum de la carte ») : tiré entre le min et le max de l'île, sur la carte
 *  et l'index du nid — déterministe, il ne bouge plus une fois né, et ne suit pas le joueur. */
export function nestLevel(
  i: number,
  seed: number,
  isl: Pick<Island, 'minLevel' | 'maxLevel'>,
): number {
  const r = mulberry32((seedOf(`${seed}:nestLevel:${i}`) ^ 0x6a09e667) >>> 0 || 1)();
  const span = isl.maxLevel - isl.minLevel + 1;
  return isl.minLevel + Math.min(span - 1, Math.floor(r * span));
}

/** 🪺 Un nid que le joueur TIENT : un reliquat d'avant la règle « on l'abat ». */
function isHeldNest(map: Pick<ExpeditionMap, 'archipel'>, p: Poi): boolean {
  const isl = activeIsland(map);
  return (
    !!isl &&
    NEST.islands.has(isl.id) &&
    p.control?.kind === 'objective' &&
    p.control.owner === 'player' &&
    p.id !== ENDLESS_ID
  );
}

/** 🪺 Les nids tenus où il reste quelqu'un (garnison ou héros) : le store les rappelle, après
 *  quoi `ensureIslandConquest` les retire de la carte — comme un lieu d'un type retiré. */
export function heldNests(map: ExpeditionMap): Poi[] {
  return map.pois.filter(
    (p) => isHeldNest(map, p) && (p.control!.garrison.length > 0 || !!p.control!.hero),
  );
}

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
/** Les objectifs d'ORIGINE de l'île : eux seuls comptent pour la forteresse et la
 *  pacification (les nids nés en route ne la bloquent jamais). */
function objectiveIds(isl: Pick<Island, 'objectives'>): string[] {
  return Array.from({ length: isl.objectives }, (_, i) => objectiveIdOf(i));
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
 * 🪺 LES APPARITIONS (`NEST`) : chaque sortie sur la carte depuis la dernière lue
 * (`archipel.nestFrom`) charge le compteur (`archipel.nestCharge`) ; à `nestThreshold`, un
 * nid apparaît À L'ARRIVÉE DE CETTE SORTIE (une sortie est datée de son arrivée, et un
 * demi-tour la retire : `recordDeparture`) et attaque le lieu tenu le plus proche
 * (`nestStrike`) — tant que l'île n'est pas pacifiée et qu'il y a moins de `NEST.cap` nids nés
 * debout (au plafond, l'apparition est perdue). ⚠️ À la première lecture, les sorties passées
 * ne comptent pas (`nestFrom` part de maintenant). Rend la MÊME carte si rien ne change.
 */
export function spawnNests(map: ExpeditionMap, now: number): ExpeditionMap {
  const isl = activeIsland(map);
  const a = map.archipel;
  if (!isl || !a || !NEST.islands.has(isl.id) || a.pacifiedAt !== undefined) return map;
  if (a.nestFrom === undefined) {
    const { nestLaid: _l, ...rest } = a;
    void _l;
    return { ...map, archipel: { ...rest, nestFrom: now, nestCharge: 0 } };
  }
  const from = a.nestFrom;
  const fresh = (map.departures ?? []).filter((t) => t > from && t <= now).sort((x, y) => x - y);
  if (!fresh.length) return map;
  const gone = destroyedOf(map);
  const nests = [...(a.nests ?? [])];
  let pois = map.pois;
  let charge = a.nestCharge ?? 0;
  for (const t of fresh) {
    if (++charge < nestThreshold(map.seed, nests.length)) continue;
    charge = 0;
    const standing = nests.filter((n) => !gone.has(objectiveIdOf(n.i))).length;
    const spot = standing < NEST.cap ? nestSpot({ pois }, isl.id, nests) : null;
    if (!spot) continue;
    nests.push({ i: isl.objectives + nests.length, at: t, ...spot });
    pois = nestStrike(pois, spot, t, map.seed);
  }
  return {
    ...map,
    pois,
    archipel: { ...a, nests, nestFrom: fresh[fresh.length - 1]!, nestCharge: charge },
  };
}

/** 🪺 Combien de sorties avant le nid d'après le `n`-ième : entre `departuresMin` et
 *  `departuresMax`, tiré sur la carte et le rang du nid (déterministe). */
export function nestThreshold(seed: number, n: number): number {
  const r = mulberry32((seedOf(`${seed}:nestEvery:${n}`) ^ 0x2f6b3a91) >>> 0 || 1)();
  const span = NEST.departuresMax - NEST.departuresMin + 1;
  return NEST.departuresMin + Math.min(span - 1, Math.floor(r * span));
}

/** 🪺 Le nid né à `at` attaque le lieu tenu le plus proche (hors objectifs et forteresse) :
 *  son armée se forme pendant une attente tirée au hasard, puis MARCHE depuis le nid
 *  (`FIELD_ARMY.speedPerHour`). La reprise est avancée à son arrivée, jamais retardée ; le
 *  point garde d'où elle part (`raidFrom`) pour qu'on la voie venir. Rien si on ne tient rien. */
function nestStrike(pois: Poi[], from: { x: number; y: number }, at: number, seed: number): Poi[] {
  const held = pois.filter(
    (p) =>
      p.control?.owner === 'player' &&
      !isIslandTargetId(p.id) &&
      ALL_CONTROL_KINDS.includes(p.control.kind),
  );
  if (!held.length) return pois;
  const t = held.reduce((best, p) =>
    Math.hypot(p.x - from.x, p.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y)
      ? p
      : best,
  );
  const r = mulberry32((seedOf(`${seed}:nestStrike:${at}`) ^ 0x51c3e2d7) >>> 0 || 1)();
  return marchOn(pois, t, from, at, r);
}

/** ⚔️ Une armée née à `at` en `from` attend (`NEST.strikeWait*`, tirée par `r`) puis MARCHE sur
 *  `t` (`FIELD_ARMY.speedPerHour`) : la reprise de `t` est avancée à son arrivée, jamais
 *  retardée, et le point garde d'où elle part (`raidFrom`) pour qu'on la voie venir. Partagée
 *  par les nids (île 2) et l'armée du seigneur de guerre (île 4). */
function marchOn(
  pois: Poi[],
  t: Poi,
  from: { x: number; y: number },
  at: number,
  r: number,
): Poi[] {
  const wait = NEST.strikeWaitMinMs + r * (NEST.strikeWaitMaxMs - NEST.strikeWaitMinMs);
  const march = (Math.hypot(t.x - from.x, t.y - from.y) / FIELD_ARMY.speedPerHour) * 3_600_000;
  const strike = Math.round(at + wait + march);
  if ((t.control!.attackAt ?? Infinity) <= strike) return pois;
  const raidFrom = { x: from.x, y: from.y, at: strike };
  return pois.map((p) =>
    p.id === t.id ? { ...p, control: { ...p.control!, attackAt: strike, raidFrom } } : p,
  );
}

/** 🪺 Les lieux à portée d'un nid debout (routes dangereuses). */
function nestPerilIds(
  pois: readonly Poi[],
  islandId: number | null,
  pacified: boolean,
): Set<string> {
  const out = new Set<string>();
  const zones = nestZones(pois, islandId, pacified);
  for (const p of pois)
    if (!isIslandTargetId(p.id) && zones.some((z) => Math.hypot(p.x - z.x, p.y - z.y) <= z.radius))
      out.add(p.id);
  return out;
}

/** 🪺 Les zones d'embuscade des nids debout (centre + portée) : la carte les dessine en rouge,
 *  `nestPerilIds` en déduit les routes dangereuses — une seule règle pour les deux. */
export function nestZones(
  pois: readonly Poi[],
  islandId: number | null,
  pacified: boolean,
): { id: string; x: number; y: number; radius: number }[] {
  if (islandId === null || !NEST.islands.has(islandId) || pacified) return [];
  return pois
    .filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy')
    .map((n) => ({ id: n.id, x: n.x, y: n.y, radius: NEST.radius }));
}

/** 🏝️ Les lieux fixes TENUS par le joueur sur la carte (ils ouvrent les objectifs ;
 *  on peut en partir en sortie). */
export function heldPoints(map: Pick<ExpeditionMap, 'pois'>): Poi[] {
  return map.pois.filter((p) => p.control?.owner === 'player');
}

/** 🏝️ Les objectifs ne s'attaquent qu'une fois ce nombre de lieux fixes tenus (n'importe
 *  lesquels) : on s'implante avant d'aller frapper le cœur de l'île. */
export const OBJECTIVES_AFTER_HELD = 2;

/** 🧭 LE TRAJET SE MESURE DEPUIS LE VRAI POINT DE DÉPART (demandé le 2026-10-04 ; remplace
 *  les relais de l'étape 6 bis). La distance d'un lieu (`distNorm`) est TOUJOURS celle du
 *  point de départ (base ou village). ⚠️ Les relais la ramenaient au lieu tenu le plus proche
 *  pour TOUT envoi : un héros parti du port payait le trajet depuis un point où personne
 *  n'était (une faille à 83 unités du port, à 14 du Scriptorium : ~4 min). Partir d'un lieu
 *  tenu reste possible : c'est une SORTIE (`legFromSpot`), mesurée depuis ce lieu.
 *  Remet aussi d'aplomb les cartes sauvegardées avec des distances de relais. Les armées en
 *  marche gardent la leur. Rend la MÊME carte si rien ne change. Hors archipel, rien. */
export function withTownDistance(map: ExpeditionMap): ExpeditionMap {
  if (!map.archipel) return map;
  let changed = false;
  const pois = map.pois.map((p) => {
    if (p.type === 'warband') return p;
    const dn = distNormAt(Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y));
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

/** 🏝️ La place de l'objectif `i` de l'île `id` : DISPERSÉS sur toute l'île (demandé le
 *  2026-10-04 : « répartis sur l'île pour attaquer de partout » ; ils étaient tous groupés côté
 *  forteresse). Chacun aussi loin que possible de la ville, de la forteresse, de la ligne de
 *  défense des points fixes et des autres objectifs (`islandScatter`). */
export function objectiveSpot(id: number, i: number): { x: number; y: number; d: number } {
  const isl = ISLANDS.find((x) => x.id === id);
  const p =
    islandScatter(id, Math.max(1, isl?.objectives ?? 0), ISLAND_CONQUEST.objectiveFrac, [
      EXPE.town,
      islandTerrain(id).fortress,
      ...islandControlSpots(id),
    ])[i] ?? islandPoint(id, 0, ISLAND_CONQUEST.objectiveFrac);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  return { x, y, d: Math.hypot(x - EXPE.town.x, y - EXPE.town.y) };
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
  const ids = objectiveIds(isl);
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
  if (flat && !ISLAND_CONQUEST.socleFullIslands.has(map.archipel.island))
    mult *= ISLAND_CONQUEST.socleShare;
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
    // Depuis le point de départ (base ou village).
    distNorm: distNormAt(spot.d),
    spawnedAt: now,
    expiresAt: EXPE.lifespanMs.control,
    control: { ...control, owner: 'enemy', garrison: [], retakes: 0 },
  };
}

/** Les objectifs et la forteresse ATTENDUS sur la carte (ceux pas encore abattus). */
function expectedTargets(map: ExpeditionMap, isl: Island, now: number): Poi[] {
  const gone = destroyedOf(map);
  const terrain = islandTerrain(isl.id);
  const f = terrain.fortress;
  const out: Poi[] = [];
  // 🎯 Les objectifs (et les nids) sont au NIVEAU MAX de l'île, comme la forteresse (demandé
  // le 2026-10-04 : « un objectif long terme pour pouvoir quitter l'île »).
  const lv = isl.maxLevel;
  // 🏝️ Les objectifs ne s'attaquent qu'une fois deux lieux fixes tenus.
  const objLocked = heldPoints(map).length < OBJECTIVES_AFTER_HELD;
  // 🪺 Île des nids : chacun à un niveau tiré sur l'île (`nestLevel`), et il s'abat (`ControlState.razes`).
  const nesting = NEST.islands.has(isl.id);
  const objLv = (i: number) => (nesting ? nestLevel(i, map.seed, isl) : lv);
  const razesOn = nesting ? { razes: true as const } : {};
  objectiveAngles(isl.objectives).forEach((_, i) => {
    const id = objectiveIdOf(i);
    if (gone.has(id)) return;
    out.push(
      enemyTarget(map, id, objectiveSpot(isl.id, i), now, objLv(i), {
        kind: 'objective',
        faction: isl.faction,
        size: objectiveSize(i, isl.objectives),
        ...objectiveLook(isl, i),
        ...razesOn,
        ...(objLocked ? { locked: true } : {}),
      }),
    );
  });
  // 🪺 Les nids nés en route, à leur place (plus aucun une fois l'île pacifiée).
  for (const n of map.archipel?.pacifiedAt === undefined ? (map.archipel?.nests ?? []) : []) {
    const id = objectiveIdOf(n.i);
    if (gone.has(id)) continue;
    out.push(
      enemyTarget(map, id, n, n.at, objLv(n.i), {
        kind: 'objective',
        faction: isl.faction,
        size: NEST.size,
        ...razesOn,
        name: isl.objective,
        emoji: isl.objectiveEmoji,
        ...(objLocked ? { locked: true } : {}),
      }),
    );
  }
  if (!gone.has(FORTRESS_ID)) {
    const down = objectiveIds(isl).filter((x) => gone.has(x)).length;
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
/** Les seules coordonnées d'une place (sans sa distance à la ville, recalculée par `withTownDistance`). */
const xyOf = ({ x, y }: { x: number; y: number }) => ({ x, y });

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
  /** ⚓ Les lieux d'où une équipe est partie (sortie, attaque combinée) : ils ne bougent pas
   *  tant qu'elle n'est pas rentrée, sinon son trajet partirait d'un endroit vide. */
  anchored: ReadonlySet<string> = new Set(),
): ExpeditionMap {
  // 🪺 Les pontes des nids d'abord : un nid né se pose dans la foulée. 🪦 De même les
  // cimetières qui se relèvent.
  const map = raiseDead(spawnNests(map0, now), now);
  const isl = activeIsland(map);
  const want = isl ? expectedTargets(map, isl, now) : [];
  const wantIds = new Set(want.map((p) => p.id));
  let pois = map.pois;
  let changed = map !== map0;
  // 1. Ce qui ne doit plus être là (île abattue, mode quitté). ⚠️ La forteresse PRISE
  // reste : elle se tient (`takeFortress`).
  // 🪺 Un nid TENU d'avant la règle « on l'abat » quitte la carte une fois vide (le store
  // rappelle d'abord sa garnison, `heldNests`).
  const nestGone = (p: Poi) => {
    const c = p.control;
    return (
      !!c &&
      isHeldNest(map, p) &&
      !c.garrison.length &&
      !c.hero &&
      !c.reinforcing?.length &&
      !c.returning?.length
    );
  };
  const stays = (p: Poi) =>
    !isIslandTargetId(p.id) || wantIds.has(p.id) || (!!isl && heldIslandTarget(p) && !nestGone(p));
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
    if (wc.razes) next.razes = true;
    else delete next.razes;
    // 🏝️ La place suit aussi (v1.28.0) : un objectif encore ennemi et hors assaut va là où
    // la règle le pose aujourd'hui — une île déjà ouverte s'espace d'elle-même.
    const moved = p.x !== w.x || p.y !== w.y;
    if (!moved && p.level === w.level && same(next, c)) continue;
    // ⚠️ La distance (le trajet) est celle de `withTownDistance`, recalculée en fin de passage.
    pois = pois.map((q, j) =>
      j === k ? { ...p, x: w.x, y: w.y, level: w.level, control: next } : q,
    );
    changed = true;
  }
  // 2 bis. 🏝️ LES POINTS FIXES se posent à leur place d'île — la ligne de défense (v1.49) —,
  // ENNEMIS COMME TENUS (v1.49.3, signalé : « je n'ai pas les modifs » — les lieux tenus
  // restaient à l'ancienne place). De même les objectifs QU'ON TIENT (ceux encore ennemis
  // suivent à l'étape 2). Ne bougent pas : un lieu attaqué, un lieu où des champions marchent
  // (renforts, retours) ou d'où une équipe est partie (`anchored`).
  if (isl)
    pois = pois.map((p) => {
      const c = p.control;
      if (!c || c.assault || c.reinforcing?.length || c.returning?.length || anchored.has(p.id))
        return p;
      const heldObj =
        c.owner === 'player' &&
        c.kind === 'objective' &&
        objectiveAngles(isl.objectives).some((_, i) => objectiveIdOf(i) === p.id);
      if (!heldObj && (isIslandTargetId(p.id) || !ALL_CONTROL_KINDS.includes(c.kind))) return p;
      const s = heldObj
        ? xyOf(objectiveSpot(isl.id, Number(p.id.slice('isl_obj_'.length))))
        : controlSpot(map, c.kind);
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
  // 3 bis. 🧱 Le fortin de l'île : son facteur sur chaque AUTRE lieu tenu (la clé est retirée
  // sans fortin, ou sur un lieu à l'ennemi).
  pois = pois.map((p) => {
    const c = p.control;
    if (!c || !ALL_CONTROL_KINDS.includes(c.kind)) return p;
    const f = c.owner === 'player' ? fortMultOf(pois, p.id) : 1;
    if ((c.fortMult ?? 1) === f) return p;
    changed = true;
    const { fortMult: _f, ...rest } = c;
    void _f;
    return { ...p, control: f < 1 ? { ...rest, fortMult: f } : rest };
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
  // 8. 🧭 Les trajets se mesurent depuis le point de départ.
  return withTownDistance(
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
  const all = [...objectiveIds(isl), FORTRESS_ID];
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
      // 🪺 Pacifiée : les nids nés encore debout disparaissent avec elle.
      .filter(
        (p) =>
          p.id !== id &&
          !(pacified && p.control?.owner === 'enemy' && p.control.kind === 'objective'),
      )
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
  // 🪺 Un nid pris est ABATTU : il quitte la carte, personne n'y reste.
  if (!before?.control || razed === map || before.control.razes) return razed;
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
      // 🧝 Le héros qui y reste prend 2 places sur les 5.
      garrison: [...new Set(garrison)].slice(0, champSeatsWithHero({ kind: 'objective' }, !!hero)),
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
  // 🪺 Un nid abattu l'est pour de bon : il ne revient pas tenu.
  if (!isl || NEST.islands.has(isl.id)) return [];
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
    const next = at + retakeCalmMs(p.id, at, attackSlow(map, c.kind));
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
  return heroPosted(map) || heroComing(map) || (map?.heroReturnAt ?? 0) > now;
}

/** 🧭 Le héros MARCHE sur la carte : vers le lieu tenu où il va se poster (`to`), ou vers la
 *  base après un rappel ou la perte de son lieu. Rend l'heure d'arrivée, `null` s'il ne
 *  marche pas. ⚠️ Signalé : la ligne des disponibilités le disait « dispo » pendant ces
 *  trajets (le store, lui, le comptait déjà engagé). */
export function heroWalk(
  map: Pick<ExpeditionMap, 'pois' | 'heroReturnAt'> | null | undefined,
  now: number,
): { at: number; to: Poi | null } | null {
  const p = map?.pois.find((q) => q.control?.owner === 'player' && !!q.control.heroComing);
  const c = p?.control?.heroComing;
  if (p && c && c.at > now) return { at: c.at, to: p };
  const back = map?.heroReturnAt;
  if (back !== undefined && back > now) return { at: back, to: null };
  return null;
}

/** 🧭 LE TRAJET À PIED DU HÉROS, tel que la carte le dessine (signalé : « je n'ai pas le
 *  tracé du déplacement du héros »). Vers un poste : un aller simple (comme un renfort), de
 *  la base ou du lieu qu'il a quitté (`origin`, signalé : de l'Ossuaire aux Archives il
 *  partait de la base). Vers la base : un retour simple depuis là où il est parti
 *  (`heroReturnFrom`) ; un retour d'avant, sans point de départ, n'est pas dessiné. `null`
 *  s'il ne marche pas. */
export function heroWalkVoyage(
  map: Pick<ExpeditionMap, 'pois' | 'heroReturnAt' | 'heroReturnFrom'> | null | undefined,
  now: number,
): {
  poi: Poi;
  sentAt: number;
  midAt: number;
  returnAt: number;
  back: boolean;
  origin?: { x: number; y: number };
} | null {
  const p = map?.pois.find((q) => q.control?.owner === 'player' && !!q.control.heroComing);
  const c = p?.control?.heroComing;
  if (p && c && c.at > now)
    return {
      poi: p,
      sentAt: c.from,
      midAt: c.at,
      returnAt: c.at,
      back: false,
      ...(c.origin ? { origin: c.origin } : {}),
    };
  const at = map?.heroReturnAt;
  const from = map?.heroReturnFrom;
  if (at === undefined || at <= now || !from) return null;
  const spot = { id: 'hero-walk', type: 'control', x: from.x, y: from.y } as unknown as Poi;
  return { poi: spot, sentAt: from.at, midAt: from.at, returnAt: at, back: true };
}

/** 🧝 LE HÉROS RENTRE D'UN VOYAGE PARTI DE SON POSTE (signalé : « il part de la base » alors
 *  qu'il était à l'Ossuaire). Il reprend sa place si le lieu est toujours à nous et a encore
 *  ses 2 places ; sinon il rentre à pied à la base depuis le lieu (`legMin` minutes). Rend la
 *  même carte s'il est déjà posté ailleurs (resté sur un point qu'il a pris). */
export function heroBackToPost(
  map: ExpeditionMap,
  homeId: string,
  unit: PostedHero,
  at: number,
  legMin: number,
): ExpeditionMap {
  if (heroPosted(map) || heroComing(map)) return map;
  const p = map.pois.find((q) => q.id === homeId);
  if (!p) return map;
  if (!heroPostBlocker(p.control))
    return {
      ...map,
      pois: map.pois.map((q) =>
        q.id === homeId ? { ...q, control: { ...q.control!, hero: true, heroUnit: unit } } : q,
      ),
    };
  return {
    ...map,
    heroReturnAt: at + Math.max(0, Math.round(legMin)) * 60_000,
    heroReturnFrom: { x: p.x, y: p.y, at },
  };
}

/** 🧝 Le héros est-il EN ROUTE pour rejoindre la garnison d'un lieu tenu ? */
export function heroComing(map: Pick<ExpeditionMap, 'pois'> | null | undefined): boolean {
  return !!map?.pois.some((p) => p.control?.owner === 'player' && !!p.control.heroComing);
}

/** 🧝 Le héros en route vers un poste fait DEMI-TOUR : il rentre à la base depuis là où il est
 *  (`walkHomeMs` : autant qu'il a marché s'il venait de la base), et ses places se libèrent.
 *  Rend la même carte s'il n'est pas en route. */
export function turnBackComingHero(map: ExpeditionMap, now: number): ExpeditionMap {
  const p = map.pois.find((q) => q.control?.owner === 'player' && !!q.control.heroComing);
  if (!p) return map;
  const { heroComing: c, ...rest } = p.control!;
  return {
    ...map,
    pois: map.pois.map((q) => (q.id === p.id ? { ...q, control: rest } : q)),
    heroReturnAt: Math.max(map.heroReturnAt ?? 0, now + walkHomeMs(p, c!, now)),
    heroReturnFrom: walkPoint(p, c!, now),
  };
}

/** 🧝 Le héros quitte son poste (rappel, ou lieu perdu) : il rentre à la base en `legMin`
 *  minutes depuis `now`. */
export function recallPostedHero(map: ExpeditionMap, now: number, legMin: number): ExpeditionMap {
  if (!heroPosted(map)) return map;
  const post = heroPostOf(map)!;
  return {
    ...unpostHero(map),
    heroReturnAt: now + Math.max(0, Math.round(legMin)) * 60_000,
    heroReturnFrom: { x: post.x, y: post.y, at: now },
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
 *  champions et le héros. Rend la carte sans eux et leurs ids (les miliciens restent).
 *  `only` (option A, 2026-10-03) : seuls ces champions embarquent, les autres gardent la
 *  forteresse ; `hero: false` : le héros n'embarque pas (navigation sans lui). */
export function boardFromFortress(
  map: ExpeditionMap,
  only?: ReadonlySet<string>,
  hero = true,
): { map: ExpeditionMap; ids: string[] } {
  const f = map.pois.find(heldFortress);
  if (!f) return { map, ids: [] };
  const c = f.control!;
  const boards = (x: string) => !isMilitiaId(x) && (!only || only.has(x));
  const ids = c.garrison.filter(boards);
  const heroBoards = hero && !!c.hero;
  if (!ids.length && !heroBoards) return { map, ids: [] };
  let control = { ...c, garrison: c.garrison.filter((x) => !boards(x)) };
  if (heroBoards) {
    const { hero: _h, heroUnit: _u, ...rest } = control;
    void _h;
    void _u;
    control = { ...rest, garrison: control.garrison };
  }
  return {
    ids,
    map: { ...map, pois: map.pois.map((p) => (p.id === f.id ? { ...p, control } : p)) },
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
      title: p.control.locked
        ? `🔒 Objectif de l’île · verrouillé (${Math.min(st.pointsHeld, OBJECTIVES_AFTER_HELD)}/${OBJECTIVES_AFTER_HELD} lieux fixes tenus)`
        : `${p.control.emoji ?? isl.objectiveEmoji} Objectif de l’île · ${down}/${n} pris`,
      detail:
        (p.control.locked
          ? `tiens d’abord ${OBJECTIVES_AFTER_HELD} lieux fixes de l’île (n’importe lesquels) pour l’attaquer · `
          : '') +
        `troupe de ${p.control.size} champions de référence · ` +
        (rise && !isKey
          ? 'pris, il se tient — mais ses morts l’attaquent 3 jours plus tard tant que la citadelle des morts tient'
          : rise
            ? 'prise, plus aucun cimetière ne se relève' +
              (riseAt
                ? ` (le prochain se relève ${new Date(riseAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})`
                : '')
            : NEST.islands.has(isl.id)
              ? 'abattu, il quitte la carte : personne n’y reste'
              : 'pris, il se tient : la forteresse viendra le reprendre EN PRIORITÉ, avant tes lieux fixes') +
        (PILLAGE_ISLANDS.has(isl.id)
          ? ' · tant qu’il tient, ses brigands pillent la réserve non récoltée de ta base et attaquent tes lieux fixes'
          : NEST.islands.has(isl.id)
            ? ` · ses bêtes embusquent les routes autour et attaquent tes lieux fixes ; tant que l’île n’est pas pacifiée, un nouveau nid apparaît toutes les ${NEST.departuresMin} à ${NEST.departuresMax} sorties sur la carte (6 au plus, à un rang autour du tien) et son armée marche aussitôt sur ton lieu tenu le plus proche — intercepte-la`
            : CURSE.islands.has(isl.id)
              ? ` · tant qu’il tient, les failles de l’île naissent corrompues (un jour plus vieilles par sanctuaire debout : elles débordent plus tôt) et ses invasions combinées frappent TOUS tes lieux tenus à la fois (toutes les ${SORTIE_EVENTS.invasion.min} à ${SORTIE_EVENTS.invasion.max} sorties sur la carte avec trois sanctuaires debout, plus rarement avec moins)`
              : WARLORD.islands.has(isl.id)
                ? ` · tant qu’il tient, son armée mobile marche sur ton lieu tenu le MOINS défendu (toutes les ${SORTIE_EVENTS.warlord.min} à ${SORTIE_EVENTS.warlord.max} sorties sur la carte avec trois camps debout, plus rarement avec moins) et ses convois de ravitaillement marchent sur la forteresse (toutes les ${SORTIE_EVENTS.convoy.min} à ${SORTIE_EVENTS.convoy.max} sorties ; chacun arrivé la renforce : intercepte-les)`
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
 * défendu ») : tant qu'un camp de guerre tient, une armée sort toutes les `SORTIE_EVENTS.warlord`
 * sorties sur la carte (v1.66.0, plus d'horloge) et marche, depuis le camp le plus proche, sur
 * le lieu tenu le MOINS défendu (la plus petite garnison, champions et miliciens ; départage
 * tiré) : elle attend comme une armée de nid, puis marche (`marchOn`) — on la voit venir et on
 * l'intercepte. Elle ne crée pas d'attaque, elle avance celle qui vient. Abattre les camps
 * l'espace, les abattre tous l'arrête.
 */
const WARLORD = {
  islands: new Set([4]) as ReadonlySet<number>,
} as const;

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
 * sanctuaire maudit tient, une invasion sort au fil de tes sorties (plus rarement avec moins de
 * sanctuaires debout) et frappe TOUS les lieux tenus à la fois (elle avance leurs attaques prévues au même
 * instant). Plus rare que l'armée de l'île 4, mais tout tombe en même temps : il faut des
 * garnisons partout. Aux SORTIES depuis la v1.67.0 (`SORTIE_EVENTS.invasion` : 6 à 10 sorties,
 * jamais deux à moins de 24 h avec trois sanctuaires debout) : elle attend 1 à 3 h puis frappe.
 */
export const INVASION = {
  islands: new Set([5]) as ReadonlySet<number>,
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

/**
 * 🚩 Avance l'armée mobile (île 4) et les invasions (île 5) jusqu'à `now`, aux sorties sur la
 * carte. Ailleurs, efface leur état. `warAt` : l'horloge d'avant (v1.66.0 / v1.67.0), retirée.
 * Rend la MÊME carte si rien ne change.
 */
export function warlordRaids(map: ExpeditionMap, now: number): ExpeditionMap {
  const isl = activeIsland(map);
  if (!map.archipel) return map;
  const camps = standingCamps(map);
  const kind: 'warlord' | 'invasion' | null = !isl
    ? null
    : WARLORD.islands.has(isl.id)
      ? 'warlord'
      : INVASION.islands.has(isl.id)
        ? 'invasion'
        : null;
  const live = kind && !islandPacified(map) && camps > 0 ? kind : null;
  const { warAt: _w, ...a0 } = map.archipel;
  void _w;
  let a = a0;
  for (const k of ['warlord', 'invasion'] as const)
    if (k !== live && a.sorties?.[k]) a = withSortie(a, k, undefined);
  if (!live || !isl) return _w === undefined && a === a0 ? map : { ...map, archipel: a };
  const old = a.sorties?.[live];
  const { times, clock } = sortieFires(map, old, live, now, isl.objectives / camps);
  let pois = map.pois;
  for (const t of times)
    pois =
      live === 'warlord' ? warlordStrike(pois, t, map.seed) : invasionStrike(pois, t, map.seed);
  if (_w === undefined && a === a0 && clock === old && pois === map.pois) return map;
  return { ...map, pois, archipel: withSortie(a, live, clock) };
}

/** 🔮 L'invasion sortie à `at` : après une attente tirée, elle avance d'un coup l'attaque de
 *  TOUS les lieux tenus (jamais une attaque déjà plus proche). */
function invasionStrike(pois: Poi[], at: number, seed: number): Poi[] {
  const when = Math.round(at + enemyWaitMs(`${seed}:invasion`, at));
  const hit = new Set(heldBefore(pois, when).map((p) => p.id));
  if (!hit.size) return pois;
  return pois.map((p) =>
    hit.has(p.id) ? { ...p, control: { ...p.control!, attackAt: when } } : p,
  );
}

/** L'archipel avec l'horloge de sorties `kind` posée (ou retirée si `undefined`). */
function withSortie<A extends { sorties?: Partial<Record<SortieKind, SortieClock>> }>(
  a: A,
  kind: SortieKind,
  clock: SortieClock | undefined,
): A {
  const sorties = { ...(a.sorties ?? {}) };
  if (clock) sorties[kind] = clock;
  else delete sorties[kind];
  const { sorties: _s, ...rest } = a;
  void _s;
  return (Object.keys(sorties).length ? { ...rest, sorties } : rest) as A;
}

/** 🚩 L'armée sortie à `at` : depuis le camp le plus proche du lieu tenu le moins défendu, elle
 *  attend puis marche sur lui (`marchOn`). Rien si on ne tient rien. */
function warlordStrike(pois: Poi[], at: number, seed: number): Poi[] {
  const target = weakestHeld(pois, at, seed);
  const camps = pois.filter((p) => p.control?.owner === 'enemy' && p.control.kind === 'objective');
  if (!target || !camps.length) return pois;
  const from = camps.reduce((best, p) =>
    Math.hypot(p.x - target.x, p.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y)
      ? p
      : best,
  );
  const r = mulberry32((seedOf(`${seed}:warStrike:${at}`) ^ 0x6a09e667) >>> 0 || 1)();
  return marchOn(pois, target, from, at, r);
}

/**
 * 🐫 LES CONVOIS DE RAVITAILLEMENT DE L'ÎLE 4 (roadmap : « 3 camps de guerre, armée mobile
 * qui vise le moins défendu, convois ») : tant qu'un camp de guerre tient et que la
 * forteresse est debout, un convoi part d'un camp toutes les `SORTIE_EVENTS.convoy` sorties sur
 * la carte (v1.66.0, plus d'horloge) et marche `travelMs` jusqu'à la forteresse. C'est une BANDE EN MARCHE : on
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
  travelMs: 8 * 3600_000,
  troop: 1,
  max: 4,
} as const;

/** 🐫 Le renfort de la forteresse : un champion de référence par convoi arrivé (borné). */
export function convoyBonus(map: Pick<ExpeditionMap, 'archipel'>): number {
  return Math.min(CONVOY.max, map.archipel?.delivered?.length ?? 0) * CONVOY.troop;
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
  // 2. Les départs, aux sorties (`SORTIE_EVENTS.convoy`). `convoyAt` : l'horloge d'avant la
  // v1.66.0, retirée.
  const old = a.sorties?.convoy;
  let clock: SortieClock | undefined;
  if (!active) {
    // Île quittée, pacifiée, forteresse prise ou plus aucun camp : plus de convoi en route.
    const stale = new Set(convoys.map((c) => c.id));
    if (stale.size) pois = pois.filter((p) => !stale.has(p.id));
    convoys = [];
  } else {
    const fired = sortieFires(map, old, 'convoy', now, isl.objectives / camps.length);
    clock = fired.clock;
    for (const at of fired.times) {
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
    }
  }
  if (
    pois === map.pois &&
    clock === old &&
    a.convoyAt === undefined &&
    same(convoys, a.convoys ?? []) &&
    same(delivered, a.delivered ?? [])
  )
    return map;
  const { convoyAt: _c, ...base } = a;
  void _c;
  const next = withSortie(base, 'convoy', clock);
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

/**
 * ⛵ Les CHAMPIONS quittent les lieux fixes d'une île (décision de l'utilisateur, 2026-10-03 :
 * « tous les champions partent » sur l'île suivante) : garnisons, renforts en route, retours,
 * sorties et héros posté. ⚠️ LES MILICIENS RESTENT — ce sont eux qui gardent l'île et font
 * tourner ses lieux. La production déjà faite est mise de côté AVANT (`bankAt`) : elle repart
 * au débit de la garnison restante, jamais recalculée. Rend la MÊME carte si rien ne change.
 */
export function stripChampions(map: ExpeditionMap, at: number, playerLevel: number): ExpeditionMap {
  let changed = false;
  const pois = map.pois.map((p) => {
    const c = p.control;
    if (!c || c.owner !== 'player') return p;
    const champ = (id: string) => !isMilitiaId(id);
    const hasChamp =
      c.garrison.some(champ) ||
      (c.reinforcing ?? []).some((r) => champ(r.id)) ||
      (c.returning ?? []).some((r) => champ(r.id)) ||
      !!c.away?.length ||
      !!c.hero;
    if (!hasChamp) return p;
    changed = true;
    const banked = c.collectedAt !== undefined ? bankAt(p, at, playerLevel) : c;
    const { hero: _h, heroUnit: _u, away: _a, reinforcing, returning, perXp, ...rest } = banked;
    void _h;
    void _u;
    void _a;
    const reinf = (reinforcing ?? []).filter((r) => !champ(r.id));
    const ret = (returning ?? []).filter((r) => !champ(r.id));
    const kept = Object.fromEntries(Object.entries(perXp ?? {}).filter(([id]) => !champ(id)));
    const control: ControlState = {
      ...rest,
      garrison: rest.garrison.filter((id) => !champ(id)),
      ...(reinf.length ? { reinforcing: reinf } : {}),
      ...(ret.length ? { returning: ret } : {}),
      ...(Object.keys(kept).length ? { perXp: kept } : {}),
    };
    return { ...p, control };
  });
  return changed ? { ...map, pois } : map;
}

/**
 * ⛵ L'ÎLE QUITTÉE VERS LA SUIVANTE (décision de l'utilisateur, 2026-10-03 : « on pacifie
 * l'île précédente des lieux sauf les lieux fixes qui produisent »). Elle est PACIFIÉE d'office
 * (objectifs et forteresse comptés abattus : ils ne reviennent pas, plus aucune attaque), VIDÉE
 * de tout ce qui n'est pas un lieu fixe (camps, failles, armées, embuscades, convois) et plus
 * rien n'y apparaît (`vacatedAt`, lu par `advanceWorld`). Ses champions partent
 * (`stripChampions`) ; ses miliciens restent. Le socle passe à la règle d'une île pacifiée
 * (`islandYieldRule`), la production faite au débit d'avant étant mise de côté. Idempotente.
 */
export function vacateIsland(map: ExpeditionMap, at: number, playerLevel: number): ExpeditionMap {
  const isl = activeIsland(map);
  const a = map.archipel;
  if (!isl || !a || a.vacatedAt !== undefined) return map;
  const destroyed = [
    ...new Set([
      ...(a.destroyed ?? []),
      ...objectiveIds(isl),
      ...(a.nests ?? []).map((n) => objectiveIdOf(n.i)),
      FORTRESS_ID,
    ]),
  ];
  const archipel = {
    ...a,
    destroyed,
    pacifiedAt: a.pacifiedAt ?? at,
    vacatedAt: at,
  };
  const stripped = stripChampions(map, at, playerLevel);
  const next: ExpeditionMap = { ...stripped, archipel };
  const pois = stripped.pois
    .filter((p) => !!p.control && !isIslandTargetId(p.id) && !p.convoy && !p.army)
    .map((p) => {
      const c0 = p.control!;
      // 🕊️ Plus aucune attaque, et la troupe ennemie d'un lieu non tenu ne bouge plus.
      const {
        attackAt: _a,
        raidAt: _r,
        assault: _s,
        retakeCut: _c,
        fieldHits: _f,
        angerSince: _g,
        ...c
      } = c0;
      void _a;
      void _r;
      void _s;
      void _c;
      void _f;
      void _g;
      if (!ALL_CONTROL_KINDS.includes(c.kind)) return { ...p, control: c };
      const rule = islandYieldRule(next, c.kind);
      const banked =
        c.owner === 'player' && c.collectedAt !== undefined
          ? bankAt({ ...p, control: c }, at, playerLevel)
          : c;
      const { yieldMult: _m, flatTier: _t, ...base } = banked;
      void _m;
      void _t;
      return { ...p, control: { ...base, ...rule } };
    });
  const { ambushes: _am, ...clean } = next;
  void _am;
  return { ...clean, pois };
}
