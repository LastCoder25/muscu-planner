/**
 * 📓 LE CARNET DE VOCATION D'UN CHAMPION (v1.283.0, livraison L1 ; demandé par l'utilisateur :
 * « le joueur est bloqué par le niveau du héros, ses champions sont toujours au max d'XP — un
 * axe pour améliorer chaque champion SANS passer par l'XP »).
 *
 * Trois choses, toutes PURES (l'écran et le store ne font que les appeler) :
 * 1. 🎯 LES POINTS — un pool COMMUN au vivier : `10 + 2 × max(0, niveauHéros − 41)`. Un point
 *    retiré redevient dépensable 24 h plus tard ; l'effet, lui, disparaît tout de suite.
 * 2. 🌳 L'ARBRE de la lignée — des nœuds d'INFORMATION à 1 point (une lecture que le jeu ne
 *    montre nulle part ailleurs) et 2 nœuds MAJEURS à 3 points, mutuellement exclusifs, aux
 *    effets de situation modestes. Les SIX lignées ont le leur (v1.296.0) : le guerrier en a 3
 *    de lecture (livré tel quel), les cinq autres 2 — celles qui apprennent vraiment quelque chose.
 * 3. 🏅 LA VÉTÉRANCE — un titre par faction à `VET.tier` victoires. TITRE SEUL : aucun effet.
 * 4. 🎖️ LA QUÊTE PERSONNELLE (v1.300.0) — un compteur par île et par lignée, qui n'avance que sous
 *    une COMPOSITION de lignée ; le trait gagné est une LECTURE d'information de plus (jamais un
 *    effet au combat). Voir la section en bas de ce fichier.
 *
 * ⚠️ Aucune récompense d'XP, aucune monnaie, aucun % général de puissance. ⚠️ Les effets passent
 * par des crochets qui existent déjà : `fightCampForce`/`partyWinChance`/`attackForecast` pour la
 * force des gardes (`vocationGuardMult`), `ambushChance` pour les embuscades
 * (`vocationAmbushMult`), `resolveIncursion`/`partyWinChance` pour les failles
 * (`vocationRiftMult`) — jamais par `simulateCombat` ni `escortCombatant`.
 *
 * 🧭 UNE SEULE VOIE MAJEURE COMPTE PAR ÉQUIPE : la PREMIÈRE, dans l'ordre de l'escorte, QUI
 * S'APPLIQUE AU LIEU (décision de l'utilisateur, v1.296.0). Une voie qui ne dit rien de ce lieu
 * (un archer Traqueur devant un camp) ne cache donc plus celle de son voisin ; deux voies qui
 * s'appliquent toutes les deux ne se cumulent jamais. Le % annoncé et le vrai combat appellent
 * les MÊMES fonctions avec la MÊME escorte, donc lisent le même facteur dans tous les ordres.
 */
import { advChampion, type Adventurer } from './adventurers';
import type { Lineage } from './advGear';
import {
  HARVEST_TYPES,
  poiForceOf,
  routePerilous,
  ruinsSealKind,
  type PartyResult,
  type Poi,
  type PoiType,
} from './expedition';
import { riftOverflowAt, riftPopulation } from './rift';
import { formatDuration } from './duration';
import { FACTION_LABEL, type RaidFaction } from './raid';
import type { PoiFact } from './poiFacts';
import { ISLANDS } from './archipelago';

/** Ce qu'un champion a acquis. `freeAt` : un instant par point RETIRÉ qui n'est pas encore
 *  redevenu dépensable (purgé à chaque écriture ; au plus autant d'entrées que de points du budget). */
export interface AdvVocation {
  nodes: string[];
  freeAt?: number[];
}

/** Victoires par faction, comptées sous la garde `xpGranted` (une fois par rapport). */
export type AdvVet = Partial<Record<RaidFaction, number>>;

/** 🎖️ Victoires comptées pour chaque quête personnelle (id de quête → compte, BORNÉ au but). */
export type AdvQuest = Record<string, number>;

export const VOCATION = {
  /** Points au départ, puis par niveau de héros au-delà de `catchUpFrom`. */
  start: 10,
  perHeroLevel: 2,
  /** Rattrapage : les niveaux d'avant ne rapportent rien, on ne repart pas de zéro. */
  catchUpFrom: 41,
  /** 📉 PLAFOND du budget (décision de l'utilisateur, v1.296.0) : sans lui, six arbres × 9 points
   *  sont saturés dès le niveau ~60 et plus rien ne se choisit (128 points au niveau 100). 40 =
   *  `10 + 2 × (56 − 41)` : atteint au niveau 56, il laisse de quoi prendre les 12 lectures et
   *  quelques voies, pas de quoi tout poser sur tout le vivier. Il borne les TOTAUX, jamais les
   *  points déjà dépensés (aucun nœud n'est retiré à qui en avait plus). */
  cap: 40,
  /** Délai avant qu'un point retiré soit de nouveau dépensable. */
  refundMs: 24 * 3600_000,
} as const;

/** 🏅 Victoires pour le palier I d'une faction. */
export const VET = { tier: 15 } as const;

/** Les TOTAUX de points du joueur (dépensés ou non) à ce niveau de héros. */
export function vocationBudget(heroLevel: number): number {
  return Math.min(
    VOCATION.cap,
    VOCATION.start + VOCATION.perHeroLevel * Math.max(0, heroLevel - VOCATION.catchUpFrom),
  );
}

/** Familles de lieux qu'une lecture d'information peut annoncer. */
export type SpawnGroup =
  | 'fight'
  | 'rift'
  | 'ruins'
  | 'den'
  | 'sealChamp'
  | 'sealGear'
  | 'shrine'
  | 'well'
  | 'archive'
  | 'fallen'
  | 'mine'
  | 'calm';

/** Une apparition prévue (cf. `upcomingSpawns`). `perilous` : route dangereuse, tirée au spawn. */
export interface SpawnAhead {
  id: string;
  type: PoiType;
  at: number;
  perilous?: boolean;
}

/** Ce qui range une apparition dans une famille. ⚠️ Les sceaux 🔱/⚜️ se lisent dans l'ID
 *  (`ruinsSealKind`), donc la lecture est fiable tant que le lieu naît ; « route calme » lit le
 *  drapeau tiré au spawn (une route peut devenir harcelée ensuite, la lecture dit « à peu près »). */
const SPAWN_MATCH: Record<SpawnGroup, (s: SpawnAhead) => boolean> = {
  fight: (s) => s.type === 'camp' || s.type === 'lair' || s.type === 'den',
  rift: (s) => s.type === 'rift',
  ruins: (s) => s.type === 'ruins',
  den: (s) => s.type === 'den',
  sealChamp: (s) => s.type === 'ruins' && ruinsSealKind(s) === 'champion',
  sealGear: (s) => s.type === 'ruins' && ruinsSealKind(s) === 'gear',
  shrine: (s) => s.type === 'shrine',
  well: (s) => s.type === 'well',
  archive: (s) => s.type === 'archive',
  fallen: (s) => s.type === 'fallen',
  mine: (s) => s.type === 'mine',
  calm: (s) => HARVEST_TYPES.has(s.type) && !s.perilous,
};

export interface VocationNode {
  id: string;
  lineage: Lineage;
  kind: 'info' | 'major';
  cost: number;
  emoji: string;
  label: string;
  /** Ce que le nœud apporte, dans les mots du joueur. */
  text: string;
  /** Nœud majeur : l'id de celui avec lequel il s'exclut. */
  excl?: string;
  /** Nœud d'information : la famille de lieux dont il annonce la prochaine apparition. */
  spawn?: SpawnGroup;
  /** Nœud d'information : le prochain monstre de chaque faille ouverte (`pulseLines`). */
  pulse?: true;
}

/** −5 % de force sur les ennemis visés par une voie de force (le fumigène fait −10 %). Le MÊME
 *  cran pour toutes (Brise-camp, Traqueur, Exorcisme, Pisteur, Mots de passe, Escorte armée,
 *  Briseur de garde) : mesuré, ×0,95 vaut +1,9 à +3,1 points de victoire en moyenne selon le lieu
 *  (+8 à +12 près du 50/50) ; ×0,93 doublait presque l'effet sur la tanière. */
const GUARD_FOE = 0.95;
/** −10 % (relatif) de chance d'embuscade sur une route dangereuse (la carte du contrebandier
 *  retire jusqu'à 25 points de pourcentage). */
const GUARD_AMBUSH = 0.9;
/** 👣 Pas de loup : −10 % sur une route CALME. ×0,9 et non ×0,85 : mesuré, +3 points de trajets
 *  sans perte (3 champions) ; ×0,85 en valait +4,4, trop près d'une rune de Repérage. */
const WOLF_AMBUSH = 0.9;
/** 🌫️ Détour sûr : −20 % sur une route HARCELÉE (faille débordée, nid) — un sous-ensemble des
 *  routes dangereuses, où il bat Garde de route : spécialiste contre généraliste, voulu. */
const DETOUR_AMBUSH = 0.8;
/** 🌧️ Pluie de flèches : les MONSTRES d'une faille (pas son gardien). Le gardien décide presque
 *  toutes les défaites, il faut donc ×0,85 ici pour valoir ×0,93 sur lui (Contre-sort). */
const VOLLEY_FOE = 0.85;
/** 🔮 Contre-sort : le GARDIEN d'une faille. */
const COUNTERSPELL_BOSS = 0.93;

const SOON = 'à peu près, sans promesse';
const pct = (f: number) => Math.round((1 - f) * 100);
const GUARD_TEXT = `${pct(GUARD_FOE)} % de force en moins (pas cumulable)`;

/** Un nœud d'information qui annonce la prochaine apparition d'une famille de lieux. */
const reading = (
  lineage: Lineage,
  key: string,
  emoji: string,
  label: string,
  what: string,
  spawn: SpawnGroup,
): VocationNode => ({
  id: `${lineage}.${key}`,
  lineage,
  kind: 'info',
  cost: 1,
  emoji,
  label,
  text: `Estime quand ${what} (${SOON}).`,
  spawn,
});

/** Une voie majeure : 3 points, exclusive avec sa jumelle. */
const way = (
  lineage: Lineage,
  key: string,
  emoji: string,
  label: string,
  text: string,
  excl: string,
): VocationNode => ({
  id: `${lineage}.${key}`,
  lineage,
  kind: 'major',
  cost: 3,
  emoji,
  label,
  text,
  excl: `${lineage}.${excl}`,
});

/** Les arbres : une lignée sans arbre n'a pas de carnet (l'écran le dit au lieu d'un arbre vide). */
const TREES: Partial<Record<Lineage, readonly VocationNode[]>> = {
  guerrier: [
    reading(
      'guerrier',
      'flair',
      '🏕️',
      'Flair des bannières',
      'apparaîtra un camp ou un repaire',
      'fight',
    ),
    reading('guerrier', 'failles', '🕳️', 'Veilleur des failles', 's’ouvrira une faille', 'rift'),
    reading(
      'guerrier',
      'ruines',
      '🏛️',
      'Œil des ruines',
      'émergeront des ruines anciennes',
      'ruins',
    ),
    way(
      'guerrier',
      'brise-camp',
      '🪓',
      'Brise-camp',
      `Dans l’équipe, les ennemis d’un camp ou d’un repaire ont ${GUARD_TEXT}.`,
      'garde-route',
    ),
    way(
      'guerrier',
      'garde-route',
      '🛡️',
      'Garde de route',
      `Dans l’équipe, ${pct(GUARD_AMBUSH)} % d’embuscades en moins sur une route dangereuse (pas cumulable).`,
      'brise-camp',
    ),
  ],
  // 🏹 le chasseur et le guetteur
  archer: [
    reading('archer', 'piste', '🐾', 'Piste de la bête', 'apparaîtra une tanière', 'den'),
    reading(
      'archer',
      'sceaux',
      '🔱',
      'Œil du sceau',
      'émergeront des ruines à sceaux de champion',
      'sealChamp',
    ),
    way(
      'archer',
      'traqueur',
      '🐾',
      'Traqueur',
      `Dans l’équipe, la bête d’une tanière a ${GUARD_TEXT}.`,
      'volee',
    ),
    way(
      'archer',
      'volee',
      '🌧️',
      'Pluie de flèches',
      `Dans l’équipe, les monstres d’une faille ont ${pct(VOLLEY_FOE)} % de force en moins, pas leur gardien (pas cumulable).`,
      'traqueur',
    ),
  ],
  // 🪄 l'arcane des failles
  mage: [
    {
      id: 'mage.pouls',
      lineage: 'mage',
      kind: 'info',
      cost: 1,
      emoji: '💓',
      label: 'Pouls des failles',
      text: 'Pour chaque faille ouverte : dans combien de temps elle gagnera un monstre de plus.',
      pulse: true,
    },
    reading(
      'mage',
      'sanctuaire',
      '🔮',
      'Appel du sanctuaire',
      'apparaîtra un sanctuaire d’invocation',
      'shrine',
    ),
    way(
      'mage',
      'contresort',
      '🔮',
      'Contre-sort',
      `Dans l’équipe, le gardien d’une faille a ${pct(COUNTERSPELL_BOSS)} % de force en moins (pas cumulable).`,
      'exorcisme',
    ),
    way(
      'mage',
      'exorcisme',
      '🕯️',
      'Exorcisme',
      `Dans l’équipe, les morts-vivants d’un camp, d’un repaire ou d’une garde de récolte ont ${GUARD_TEXT}.`,
      'contresort',
    ),
  ],
  // 🔨 le soldat qui tient la ligne
  homme_armes: [
    reading(
      'homme_armes',
      'tombe',
      '🏚️',
      'Sillage des tombés',
      'apparaîtront les ruines d’un héros tombé',
      'fallen',
    ),
    reading(
      'homme_armes',
      'sceaux-objet',
      '⚜️',
      'Œil de l’arsenal',
      'émergeront des ruines à sceaux d’objet',
      'sealGear',
    ),
    way(
      'homme_armes',
      'escorte',
      '🛡️',
      'Escorte armée',
      `Dans l’équipe, les gardes d’une mine, d’une source, d’un sanctuaire ou d’archives ont ${GUARD_TEXT}.`,
      'brise-garde',
    ),
    way(
      'homme_armes',
      'brise-garde',
      '🧱',
      'Briseur de garde',
      `Dans l’équipe, les gardes de ruines anciennes ou d’une caravane pillée ont ${GUARD_TEXT}.`,
      'escorte',
    ),
  ],
  // 🔪 celui qui passe sans être vu
  eclaireur: [
    reading('eclaireur', 'source', '⛲', 'Repère des sources', 'jaillira une source vive', 'well'),
    reading(
      'eclaireur',
      'archives',
      '📜',
      'Repère des archives',
      'émergeront des archives englouties',
      'archive',
    ),
    way(
      'eclaireur',
      'pas-de-loup',
      '👣',
      'Pas de loup',
      `Dans l’équipe, ${pct(WOLF_AMBUSH)} % d’embuscades en moins sur une route calme (pas cumulable).`,
      'pisteur',
    ),
    way(
      'eclaireur',
      'pisteur',
      '🐺',
      'Pisteur',
      `Dans l’équipe, les bêtes d’un camp, d’un repaire ou d’une garde de récolte (pas d’une tanière) ont ${GUARD_TEXT}.`,
      'pas-de-loup',
    ),
  ],
  // 🧳 la route et ses gens
  caravanier: [
    reading('caravanier', 'mine', '⛏️', 'Nez du filon d’or', 's’ouvrira une mine', 'mine'),
    reading(
      'caravanier',
      'route',
      '🧭',
      'Route sûre',
      'apparaîtra une récolte à route calme',
      'calm',
    ),
    way(
      'caravanier',
      'mots-de-passe',
      '🗝️',
      'Mots de passe',
      `Dans l’équipe, les bandits d’un camp, d’un repaire ou d’une garde de récolte ont ${GUARD_TEXT}.`,
      'detour',
    ),
    way(
      'caravanier',
      'detour',
      '🌫️',
      'Détour sûr',
      `Dans l’équipe, ${pct(DETOUR_AMBUSH)} % d’embuscades en moins sur une route harcelée par une faille débordée ou un nid (pas cumulable).`,
      'mots-de-passe',
    ),
  ],
};

const NODE_BY_ID = new Map(
  Object.values(TREES)
    .flat()
    .map((n) => [n.id, n] as const),
);

/** L'arbre de la lignée du champion, `null` s'il n'a pas (encore) de carnet. */
export function vocationTree(adv: Adventurer): readonly VocationNode[] | null {
  const lineage = advChampion(adv)?.lineage;
  return (lineage && TREES[lineage]) || null;
}

const nodesOf = (a: Adventurer): readonly string[] => a.vocation?.nodes ?? [];

/** Points engagés dans des nœuds, tout le vivier. */
function spentPoints(roster: readonly Adventurer[]): number {
  let n = 0;
  for (const a of roster) for (const id of nodesOf(a)) n += NODE_BY_ID.get(id)?.cost ?? 0;
  return n;
}

/** Points retirés mais pas encore redevenus dépensables, tout le vivier. */
export function pendingPoints(roster: readonly Adventurer[], now: number): number[] {
  const out: number[] = [];
  for (const a of roster) for (const t of a.vocation?.freeAt ?? []) if (t > now) out.push(t);
  return out.sort((x, y) => x - y);
}

/** Les points DÉPENSABLES maintenant. */
export function vocationFree(
  roster: readonly Adventurer[],
  heroLevel: number,
  now: number,
): number {
  return Math.max(
    0,
    vocationBudget(heroLevel) - spentPoints(roster) - pendingPoints(roster, now).length,
  );
}

export type NodeState = 'owned' | 'available' | 'short' | 'excluded';

/** L'état d'un nœud pour ce champion : acquis, prenable, trop cher pour l'instant, ou barré par
 *  son exclusif. */
export function nodeState(
  roster: readonly Adventurer[],
  adv: Adventurer,
  node: VocationNode,
  heroLevel: number,
  now: number,
): NodeState {
  if (nodesOf(adv).includes(node.id)) return 'owned';
  if (node.excl && nodesOf(adv).includes(node.excl)) return 'excluded';
  return vocationFree(roster, heroLevel, now) >= node.cost ? 'available' : 'short';
}

/** Retire les échéances de remboursement écoulées (aucune référence neuve s'il n'y en a pas). */
function pruned(a: Adventurer, now: number): Adventurer {
  const f = a.vocation?.freeAt;
  if (!f || f.every((t) => t > now)) return a;
  const left = f.filter((t) => t > now);
  return {
    ...a,
    vocation: left.length
      ? { nodes: a.vocation!.nodes, freeAt: left }
      : { nodes: a.vocation!.nodes },
  };
}

export type VocationResult = { ok: true; roster: Adventurer[] } | { ok: false; reason: string };

/** 🎓 Apprend un nœud. Le refus vit ICI, avec la même règle que la tuile (`nodeState`). */
export function learnNode(
  roster: readonly Adventurer[],
  advId: string,
  nodeId: string,
  heroLevel: number,
  now: number,
): VocationResult {
  const adv = roster.find((a) => a.id === advId);
  if (!adv) return { ok: false, reason: 'champion introuvable' };
  const node = vocationTree(adv)?.find((n) => n.id === nodeId);
  if (!node) return { ok: false, reason: 'ce nœud n’existe pas dans son carnet' };
  const st = nodeState(roster, adv, node, heroLevel, now);
  if (st === 'owned') return { ok: false, reason: 'déjà acquis' };
  if (st === 'excluded') return { ok: false, reason: 'incompatible avec son autre voie' };
  if (st === 'short') {
    const miss = node.cost - vocationFree(roster, heroLevel, now);
    return { ok: false, reason: `il te manque ${miss} point${miss > 1 ? 's' : ''}` };
  }
  return {
    ok: true,
    roster: roster.map((a) => {
      const p = pruned(a, now);
      return a.id === advId
        ? { ...p, vocation: { ...p.vocation, nodes: [...nodesOf(a), nodeId] } }
        : p;
    }),
  };
}

/** ↩️ Retire un nœud : l'effet cesse TOUT DE SUITE, les points reviennent dans `refundMs`. */
export function forgetNode(
  roster: readonly Adventurer[],
  advId: string,
  nodeId: string,
  now: number,
): VocationResult {
  const adv = roster.find((a) => a.id === advId);
  const node = NODE_BY_ID.get(nodeId);
  if (!adv || !node || !nodesOf(adv).includes(nodeId))
    return { ok: false, reason: 'rien à retirer' };
  return {
    ok: true,
    roster: roster.map((a) => {
      const p = pruned(a, now);
      if (a.id !== advId) return p;
      const back = Array.from({ length: node.cost }, () => now + VOCATION.refundMs);
      return {
        ...p,
        vocation: {
          nodes: nodesOf(a).filter((id) => id !== nodeId),
          freeAt: [...(p.vocation?.freeAt ?? []), ...back],
        },
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚔️ LES VOIES MAJEURES — lues par les crochets existants
// ─────────────────────────────────────────────────────────────────────────────

/** Ce qu'une voie fait, par crochet. `when` dit si la voie S'APPLIQUE à ce lieu : c'est ce qui
 *  fait passer la voie suivante de l'escorte quand celle-ci ne dit rien. */
interface MajorEffect {
  guard?: { factor: number; when: (poi: GuardPoi) => boolean };
  ambush?: { factor: number; when: (poi: AmbushPoi) => boolean };
  rift?: { foe: number; boss: number };
}
type GuardPoi = Pick<Poi, 'id' | 'type' | 'level'>;
type AmbushPoi = Pick<Poi, 'perilous' | 'riftPeril' | 'nestPeril'>;

/** Un lieu dont les gardes sont une troupe de faction : camp, repaire, tanière ou lieu de récolte.
 *  ⚠️ LISTE BLANCHE, jamais « `poiForceOf` rend une faction » : `poiForceOf` passe par `campSpecOf`,
 *  qui rend AUSSI la troupe d'un point de contrôle ennemi (forteresse, citadelle, objectifs d'île
 *  — équilibre réglé par l'utilisateur, vocation interdite) ; et ne jamais lire `poi.faction`
 *  (les armées en campagne le portent, le pronostic ne les voit pas). */
const guarded = (t: PoiType) => t === 'camp' || t === 'lair' || t === 'den' || HARVEST_TYPES.has(t);
/** Les gardes de CE lieu sont de cette faction (tanière comprise ou non). */
const guardedBy = (faction: RaidFaction, den: boolean) => (poi: GuardPoi) =>
  guarded(poi.type) && (den || poi.type !== 'den') && poiForceOf(poi)?.faction === faction;
const guardTypes =
  (...types: PoiType[]) =>
  (poi: GuardPoi) =>
    types.includes(poi.type);

const EFFECTS: Record<string, MajorEffect> = {
  'guerrier.brise-camp': { guard: { factor: GUARD_FOE, when: guardTypes('camp', 'lair') } },
  'guerrier.garde-route': { ambush: { factor: GUARD_AMBUSH, when: (p) => routePerilous(p) } },
  'archer.traqueur': { guard: { factor: GUARD_FOE, when: guardTypes('den') } },
  'archer.volee': { rift: { foe: VOLLEY_FOE, boss: 1 } },
  'mage.contresort': { rift: { foe: 1, boss: COUNTERSPELL_BOSS } },
  'mage.exorcisme': { guard: { factor: GUARD_FOE, when: guardedBy('mortsvivants', true) } },
  'homme_armes.escorte': {
    guard: { factor: GUARD_FOE, when: guardTypes('mine', 'well', 'shrine', 'archive') },
  },
  'homme_armes.brise-garde': { guard: { factor: GUARD_FOE, when: guardTypes('ruins', 'plunder') } },
  'eclaireur.pas-de-loup': { ambush: { factor: WOLF_AMBUSH, when: (p) => !routePerilous(p) } },
  // Pas de tanière : elle est à Traqueur (sinon Pisteur ferait tout ce que fait Traqueur, et plus).
  'eclaireur.pisteur': { guard: { factor: GUARD_FOE, when: guardedBy('betes', false) } },
  'caravanier.mots-de-passe': { guard: { factor: GUARD_FOE, when: guardedBy('bandits', true) } },
  'caravanier.detour': {
    ambush: { factor: DETOUR_AMBUSH, when: (p) => !!p.riftPeril || !!p.nestPeril },
  },
};

/**
 * 🧭 LA VOIE MAJEURE QUI COMPTE : on parcourt l'escorte DANS L'ORDRE REÇU (celui de `escort`, le
 * même pour le vrai combat et le pronostic) et on retient la PREMIÈRE voie qui S'APPLIQUE à ce
 * lieu (`pick` rend `null` sinon). Une seule, donc jamais de cumul, même entre deux champions.
 */
function firstEffect<T>(
  escort: readonly Adventurer[],
  pick: (e: MajorEffect) => T | null,
): T | null {
  for (const a of escort)
    for (const id of nodesOf(a)) {
      const e = EFFECTS[id];
      const r = e && pick(e);
      if (r) return r;
    }
  return null;
}

/** ⚔️ La force des gardes d'un lieu (camp, repaire, tanière, récolte gardée) : le facteur de la
 *  première voie de l'équipe qui s'y applique. 1 = aucun effet.
 *  ⚠️ Lu par le vrai combat (`fightCampForce`) ET par les deux pronostics (`partyWinChance`,
 *  `attackForecast`) : le % et les pastilles 🔮 voient la même chose que le combat. */
export function vocationGuardMult(escort: readonly Adventurer[], poi: GuardPoi): number {
  return firstEffect(escort, (e) => (e.guard?.when(poi) ? { f: e.guard.factor } : null))?.f ?? 1;
}

/** 🛣️ Le facteur sur la chance d'embuscade d'une jambe de route : la première voie de l'équipe
 *  qui s'applique à cette ROUTE (calme, dangereuse, harcelée). 1 = aucun effet. */
export function vocationAmbushMult(escort: readonly Adventurer[], poi: AmbushPoi): number {
  return firstEffect(escort, (e) => (e.ambush?.when(poi) ? { f: e.ambush.factor } : null))?.f ?? 1;
}

/** 🕳️ Les facteurs sur une FAILLE : monstres et gardien. La première voie de l'équipe qui parle des
 *  failles (Pluie de flèches OU Contre-sort), jamais les deux. Se multiplie avec la lanterne. */
export function vocationRiftMult(escort: readonly Adventurer[]): { foe: number; boss: number } {
  return firstEffect(escort, (e) => e.rift ?? null) ?? { foe: 1, boss: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔭 LES LECTURES D'INFORMATION
// ─────────────────────────────────────────────────────────────────────────────

/** La première apparition à venir d'une famille de lieux, `null` si aucune dans l'horizon. */
export function nextOfGroup(spawns: readonly SpawnAhead[], group: SpawnGroup): SpawnAhead | null {
  return spawns.filter(SPAWN_MATCH[group]).sort((a, b) => a.at - b.at)[0] ?? null;
}

const SPAWN_EMO: Record<SpawnGroup, string> = {
  fight: '🏕️',
  rift: '🕳️',
  ruins: '🏛️',
  den: '🐾',
  sealChamp: '🔱',
  sealGear: '⚜️',
  shrine: '🔮',
  well: '⛲',
  archive: '📜',
  fallen: '🏚️',
  mine: '⛏️',
  calm: '🧭',
};

/** Le nom, volontairement VAGUE, d'une famille : le type exact peut différer à l'arrivée. */
const VAGUE_LABEL: Record<SpawnGroup, string> = {
  fight: 'un camp ou un repaire',
  rift: 'une faille',
  ruins: 'des ruines',
  den: 'une tanière',
  sealChamp: 'des ruines à sceaux de champion',
  sealGear: 'des ruines à sceaux d’objet',
  shrine: 'un sanctuaire d’invocation',
  well: 'une source vive',
  archive: 'des archives englouties',
  fallen: 'les ruines d’un héros tombé',
  mine: 'une mine',
  calm: 'une récolte à route calme',
};

/** La phrase d'une lecture. ⚠️ AUCUNE promesse de précision : c'est une estimation de la carte
 *  telle qu'elle est (« environ »), le type exact peut différer (camp, repaire ou tanière) et
 *  prendre un lieu libère une place, ce qui peut tout changer. */
export function readingText(group: SpawnGroup, next: SpawnAhead | null, now: number): string {
  if (!next) return 'Rien d’annoncé dans les 48 prochaines heures.';
  const ms = Math.max(0, next.at - now);
  return `${SPAWN_EMO[group]} ${
    ms < 60_000 ? 'Maintenant' : `Dans environ ${formatDuration(ms)}`
  } : ${VAGUE_LABEL[group]}`;
}

/** Les familles que ce champion sait lire (nœuds d'information acquis). */
export function readableGroups(adv: Adventurer): SpawnGroup[] {
  const fromNodes = (vocationTree(adv) ?? [])
    .filter((n) => n.spawn && nodesOf(adv).includes(n.id))
    .map((n) => n.spawn!);
  // 🎖️ Les traits de quête accomplie lisent aussi : sans point, sans pool, sans les retirer.
  const fromTraits = questLines(adv)
    .filter((l) => l.done)
    .map((l) => l.trait.spawn);
  return [...new Set([...fromNodes, ...fromTraits])];
}

/** 💓 Ce champion lit-il le Pouls des failles ? */
export function readsPulse(adv: Adventurer): boolean {
  return (vocationTree(adv) ?? []).some((n) => n.pulse && nodesOf(adv).includes(n.id));
}

/**
 * 💓 L'instant où cette faille gagnera un monstre de plus, `null` si elle a déjà tous les siens.
 * ⚠️ EXACT, et non une estimation : l'effectif (`riftPopulation`) ne dépend que du temps, il est
 * croissant jusqu'au débordement (`riftOverflowAt`) — une bissection à la seconde le trouve.
 */
export function nextRiftGrowth(rift: Pick<Poi, 'spawnedAt'>, now: number): number | null {
  const base = riftPopulation(rift, now);
  let hi = riftOverflowAt(rift);
  if (riftPopulation(rift, hi) <= base) return null;
  let lo = now;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (riftPopulation(rift, mid) > base) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Les lignes du Pouls : une par faille ouverte, la plus proche d'abord, 3 au plus. */
export function pulseLines(
  pois: readonly Pick<Poi, 'id' | 'type' | 'level' | 'spawnedAt'>[],
  now: number,
): string[] {
  const rifts = pois
    .filter((p) => p.type === 'rift')
    .map((p) => ({ level: p.level, at: nextRiftGrowth(p, now) }))
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  if (!rifts.length) return ['Aucune faille ouverte.'];
  return rifts
    .slice(0, 3)
    .map((r) =>
      r.at === null
        ? `🕳️ La faille de niveau ${r.level} a tous ses monstres.`
        : `🕳️ ${r.at - now < 60_000 ? 'Maintenant' : `Dans environ ${formatDuration(r.at - now)}`} : la faille de niveau ${r.level} gagne un monstre`,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏅 LA VÉTÉRANCE
// ─────────────────────────────────────────────────────────────────────────────

const VET_TITLE: Record<RaidFaction, { emoji: string; label: string }> = {
  bandits: { emoji: '🗡️', label: 'Fléau des bandits' },
  betes: { emoji: '🐺', label: 'Chasseur de bêtes' },
  mortsvivants: { emoji: '💀', label: 'Purificateur' },
};
const VET_FACTIONS = Object.keys(VET_TITLE) as RaidFaction[];

/**
 * La faction dont ce rapport compte UNE victoire, ou `null`. Décisions :
 * - perdu, ou « arrivé trop tard » (rien combattu) : non ;
 * - convoi (une escorte n'est pas une attaque) : non ;
 * - tout ce qui touche un POINT DE CONTRÔLE : non — objectifs d'île, forteresse, citadelle,
 *   reprise défendue y sont (type `control`, ou `controlId`/`defense` sur le rapport) ;
 * - camps, repaires, tanières, failles, gardes de récolte, interceptions : oui.
 * ⚠️ `poiType` inconnu (rapport très ancien) : non, plutôt que de compter à tort.
 */
export function vetFactionOf(
  party: Pick<
    PartyResult,
    'win' | 'faction' | 'late' | 'convoy' | 'controlId' | 'defense' | 'foes'
  >,
  poiType: PoiType | undefined,
): RaidFaction | null {
  if (!party.win || party.late || party.convoy || party.controlId || party.defense) return null;
  // Aucun ennemi affronté (filon, héros tombé, mine de mana : « gagné » sans combat) : non.
  if (!(party.foes > 0)) return null;
  if (!poiType || poiType === 'control') return null;
  return party.faction;
}

/** Compte une victoire de plus pour cette faction. Rend le MÊME objet si `faction` est nulle. */
export function recordVet(adv: Adventurer, faction: RaidFaction | null): Adventurer {
  if (!faction) return adv;
  return { ...adv, vet: { ...adv.vet, [faction]: (adv.vet?.[faction] ?? 0) + 1 } };
}

export interface VetLine {
  faction: RaidFaction;
  emoji: string;
  label: string;
  wins: number;
  earned: boolean;
}

/** Une ligne par faction : victoires et titre (gagné ou non). */
export function vetLines(adv: Adventurer): VetLine[] {
  return VET_FACTIONS.map((f) => {
    const wins = adv.vet?.[f] ?? 0;
    return { faction: f, ...VET_TITLE[f], wins, earned: wins >= VET.tier };
  });
}

/** 🏅 La pastille « Vétéran » de la fiche d'un lieu : le meilleur titre de l'équipe, ou rien. */
export function vetFactOf(team: readonly Adventurer[]): PoiFact | null {
  const t = bestVetTitle(team);
  return t
    ? {
        icon: t.emoji,
        label: 'Vétéran',
        value: t.label,
        title: `Titre de ${t.by} — un honneur, sans effet au combat`,
      }
    : null;
}

/** 🏅 Le meilleur titre d'une équipe — celui du plus grand nombre de victoires, jamais cumulé. */
export function bestVetTitle(
  team: readonly Adventurer[],
): { emoji: string; label: string; by: string } | null {
  let best: { line: VetLine; by: string } | null = null;
  for (const a of team)
    for (const l of vetLines(a))
      if (l.earned && (!best || l.wins > best.line.wins)) best = { line: l, by: a.name };
  return best && { emoji: best.line.emoji, label: best.line.label, by: best.by };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎖️ LA QUÊTE PERSONNELLE D'UN CHAMPION (v1.300.0)
// ─────────────────────────────────────────────────────────────────────────────

/** Une quête de lignée : un COMPTEUR sur les rapports de voyage existants (aucun lieu, aucune
 *  monnaie), sous une condition de COMPOSITION propre à la lignée. */
export interface HeroQuest {
  id: string;
  lineage: Lineage;
  /** L'île dont elle suit le jalon (`ISLANDS[].id`) : UN trait par île et par lignée. */
  island: number;
  emoji: string;
  label: string;
  /** Les ennemis à battre : la faction de l'île, sur ces types de lieux tenus. */
  faction: RaidFaction;
  types: readonly PoiType[];
  /** Victoires conformes pour accomplir la quête. */
  wins: number;
  /** Composition : le champion de la lignée EN TÊTE, et au plus ce nombre d'autres à sa suite. */
  maxEscort: number;
  /** Le trait gagné : une lecture d'information, rien d'autre. */
  trait: { emoji: string; label: string; text: string; spawn: SpawnGroup };
}

/** La table, une entrée par (lignée, île). Ajouter l'île suivante = une entrée de plus.
 *  ⚠️ Un trait est une LECTURE (`spawn`) : il ne touche ni au combat, ni à l'XP, ni à l'or,
 *  ni aux drops, ni au budget de points. */
export const QUESTS: readonly HeroQuest[] = [
  {
    id: 'guerrier.chef-de-bande',
    lineage: 'guerrier',
    island: 1,
    emoji: '🎖️',
    label: 'Chef de bande',
    faction: 'bandits',
    // ⚠️ Pas `den` : une tanière est TOUJOURS « bêtes » (`campSpecOf`), jamais bandits.
    types: ['camp', 'lair'],
    wins: 3,
    maxEscort: 2,
    trait: {
      emoji: '🏚️',
      label: 'Veilleur des tombés',
      text: `Estime quand surgiront les ruines d’un héros tombé (${SOON}).`,
      spawn: 'fallen',
    },
  },
];

/** Ce qu'un rapport apporte aux quêtes : le champion de TÊTE et ce qu'il a battu. */
export interface QuestHit {
  headId: string;
  faction: RaidFaction;
  poiType: PoiType;
  /** Combien de champions en tout (lui compris) étaient du voyage. */
  size: number;
}

/**
 * Le « coup » qu'un rapport porte aux quêtes, ou `null`. Règles :
 * - une victoire de vétérance (`vetFactionOf` : ni défaite, ni convoi, ni point de contrôle, ni
 *   arrivée tardive, ni combat vide) — une défaite ne retire donc jamais rien ;
 * - SANS le héros (`party.hero`) ;
 * - le champion de TÊTE = le premier de `party.escort` (l'ordre d'envoi).
 * La composition de lignée (`maxEscort`) et le type de lieu se jugent par quête (`recordQuest`).
 */
export function questHitOf(
  party: Pick<
    PartyResult,
    'win' | 'faction' | 'late' | 'convoy' | 'controlId' | 'defense' | 'foes' | 'hero' | 'escort'
  >,
  poiType: PoiType | undefined,
): QuestHit | null {
  if (party.hero || !party.escort?.length) return null;
  const faction = vetFactionOf(party, poiType);
  if (!faction || !poiType) return null;
  return { headId: party.escort[0]!, faction, poiType, size: party.escort.length };
}

/** Compte `hit` pour ce champion s'il est celui de TÊTE, de la bonne lignée, et que la troupe
 *  respecte la composition. Rend le MÊME objet si rien ne bouge. ⚠️ L'idempotence est celle de
 *  l'appelant (`xpGranted`), comme la vétérance. */
export function recordQuest(adv: Adventurer, hit: QuestHit | null): Adventurer {
  if (!hit || adv.id !== hit.headId) return adv;
  const lineage = advChampion(adv)?.lineage;
  let quest = adv.quest;
  for (const q of QUESTS) {
    if (q.lineage !== lineage || q.faction !== hit.faction || !q.types.includes(hit.poiType))
      continue;
    if (hit.size > q.maxEscort + 1) continue;
    const have = quest?.[q.id] ?? 0;
    if (have >= q.wins) continue;
    quest = { ...quest, [q.id]: have + 1 };
  }
  return quest === adv.quest ? adv : { ...adv, quest };
}

export interface QuestLine {
  id: string;
  emoji: string;
  label: string;
  /** Le but, dans les mots du joueur. */
  goal: string;
  island: string;
  wins: number;
  total: number;
  done: boolean;
  trait: HeroQuest['trait'];
}

/** Les quêtes de la lignée de ce champion, avec leur avancement. Vide sans lignée. */
export function questLines(adv: Adventurer): QuestLine[] {
  const lineage = advChampion(adv)?.lineage;
  return QUESTS.filter((q) => q.lineage === lineage).map((q) => {
    const wins = Math.min(q.wins, adv.quest?.[q.id] ?? 0);
    const isl = ISLANDS.find((i) => i.id === q.island);
    return {
      id: q.id,
      emoji: q.emoji,
      label: q.label,
      goal: `${q.wins} camps ou repaires pris contre les ${FACTION_LABEL[q.faction].toLowerCase()}, en tête d’une troupe de ${q.maxEscort + 1} champions au plus (lui + ${q.maxEscort}), sans le héros`,
      island: isl ? `${isl.emoji} ${isl.name}` : `Île ${q.island}`,
      wins,
      total: q.wins,
      done: wins >= q.wins,
      trait: q.trait,
    };
  });
}
