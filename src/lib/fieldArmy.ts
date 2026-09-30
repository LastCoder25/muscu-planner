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
import { CONTROL, attackerLevel, retakeBoost, retakeForce } from './controlPoints';
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
    x: from.x,
    y: from.y,
    distNorm: distNormAt(Math.hypot(from.x - EXPE.town.x, from.y - EXPE.town.y)),
    spawnedAt,
    expiresAt: at,
    army,
  };
  return warbandAt(p, Math.floor(now / EXPE.warbandStepMs) * EXPE.warbandStepMs);
}

/** 🏰 L'armée d'un SIÈGE sur la carte, ou `null` tant qu'on ne la voit pas. Elle part du bord
 *  du rayon de détection, du côté où elle frappera l'enceinte (`raidFirstSector`). */
export function siegeArmyPoi(
  raid: Raid,
  reach: number,
  now: number,
  playerLevel: number,
): Poi | null {
  if (now >= raid.arrivesAt || !raid.groups.length) return null;
  const lead = detectRadius(raid.arrivesAt - raid.detectedAt);
  const dist = Math.max(1, seenRadius(lead, reach));
  const spawnedAt = raid.arrivesAt - (dist / FIELD_ARMY.speedPerHour) * H;
  if (now < Math.max(spawnedAt, raid.detectedAt)) return null;
  const ang = (raidFirstSector(raid.seed) * 2 * Math.PI) / BATTLE.sectors;
  const from = { x: EXPE.town.x + Math.cos(ang) * dist, y: EXPE.town.y + Math.sin(ang) * dist };
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
  );
}

/** 🏰 L'armée d'une REPRISE sur la carte, ou `null` tant qu'elle n'est pas entrée dans le
 *  rayon de détection. Elle marche sur son point depuis l'extérieur (dans l'axe ville → point). */
export function retakeArmyPoi(
  p: Poi,
  mapSeed: number,
  detectR: number,
  reach: number,
  now: number,
  playerLevel: number,
): Poi | null {
  const c = p.control;
  if (!c || c.owner !== 'player' || c.attackAt === undefined || now >= c.attackAt) return null;
  const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
  const vis = seenRadius(detectR, reach);
  if (d <= 0) return null;
  // Hors du rayon (`d ≥ vis`) la marche visible est ≤ 0 : `spawnedAt ≥ attackAt > now`, donc
  // elle n'apparaît jamais — c'est la règle « vue seulement dans le rayon », sans garde à part.
  const march = vis - d;
  const spawnedAt = c.attackAt - (march / FIELD_ARMY.speedPerHour) * H;
  if (now < spawnedAt) return null;
  const from = {
    x: EXPE.town.x + ((p.x - EXPE.town.x) / d) * vis,
    y: EXPE.town.y + ((p.y - EXPE.town.y) / d) * vis,
  };
  const force = retakeForce(p, 1);
  const size = Math.max(FIELD_ARMY.minSize, force.size * (1 - (c.retakeCut ?? 0)));
  return marching(
    `army_${p.id}_${c.attackAt}`,
    from,
    { x: p.x, y: p.y },
    spawnedAt,
    c.attackAt,
    attackerLevel(mapSeed, p, playerLevel),
    playerLevel,
    { kind: 'retake', targetId: p.id, at: c.attackAt, faction: force.faction, size },
    now,
  );
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
  const want: Poi[] = [];
  if (ctx.raid) {
    const s = siegeArmyPoi(ctx.raid, ctx.reach, ctx.now, ctx.playerLevel);
    if (s) want.push(s);
  }
  for (const p of map.pois) {
    if (p.type !== 'control') continue;
    const r = retakeArmyPoi(p, map.seed, ctx.detectR, ctx.reach, ctx.now, ctx.playerLevel);
    if (r) want.push(r);
  }
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
    xp: missionXpFor(escort, poi, d.win, g.shares, input.pantheonLevel, !!hero),
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
  mapSeed: number,
  p: Poi,
  allies: readonly SkirmishUnit[],
  playerLevel: number,
): { foe: Poi; force: CampSpec } {
  const foe = { ...p, level: attackerLevel(mapSeed, p, playerLevel) };
  const f0 = retakeForce(foe, retakeBoost(foe, allies));
  return { foe, force: { ...f0, size: f0.size * retakeRemaining(p) } };
}

/**
 * 🎯 La part des assauts que ces défenseurs repousseront face à l'armée QUI ARRIVE
 * (demandé : « le % doit prendre en compte la défense ET l'attaquant »). Rejoue la bataille
 * de `retakeBattle` sur les graines de pronostic, jamais celle du vrai combat.
 * ⚠️ À n'appeler que quand l'armée est VISIBLE : avant, sa force est un secret.
 */
export function controlAttackHold(
  mapSeed: number,
  p: Poi,
  ids: readonly string[],
  advs: readonly Adventurer[],
  kit: EscortKit,
  playerLevel: number,
): number {
  const set = new Set(ids);
  const champs = advs.filter((a) => set.has(a.id));
  const allies = [...partyAllies(champs, kit, null), ...militiaUnits([...ids], playerLevel)];
  if (!allies.length) return 0;
  const { foe, force } = retakeBattle(mapSeed, p, allies, playerLevel);
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
