/**
 * 📓 LE CARNET DE VOCATION D'UN CHAMPION (v1.283.0, livraison L1 ; demandé par l'utilisateur :
 * « le joueur est bloqué par le niveau du héros, ses champions sont toujours au max d'XP — un
 * axe pour améliorer chaque champion SANS passer par l'XP »).
 *
 * Trois choses, toutes PURES (l'écran et le store ne font que les appeler) :
 * 1. 🎯 LES POINTS — un pool COMMUN au vivier : `10 + 2 × max(0, niveauHéros − 41)`. Un point
 *    retiré redevient dépensable 24 h plus tard ; l'effet, lui, disparaît tout de suite.
 * 2. 🌳 L'ARBRE de la lignée — 3 nœuds d'INFORMATION à 1 point (une lecture que le jeu ne
 *    montre nulle part ailleurs) et 2 nœuds MAJEURS à 3 points, mutuellement exclusifs, aux
 *    effets de situation modestes. Une seule lignée livrée (guerrier) ; la structure en tient 6.
 * 3. 🏅 LA VÉTÉRANCE — un titre par faction à `VET.tier` victoires. TITRE SEUL : aucun effet.
 *
 * ⚠️ Aucune récompense d'XP, aucune monnaie. ⚠️ Les deux effets passent par des crochets qui
 * existent déjà (`fightCampForce`/`partyWinChance` pour la force des ennemis, `ambushChance`
 * pour les embuscades) : jamais par `simulateCombat` ni `escortCombatant`.
 */
import { advChampion, type Adventurer } from './adventurers';
import type { Lineage } from './advGear';
import { type PartyResult, type Poi, type PoiType } from './expedition';
import { formatDuration } from './duration';
import type { RaidFaction } from './raid';
import type { PoiFact } from './poiFacts';

/** Ce qu'un champion a acquis. `freeAt` : un instant par point RETIRÉ qui n'est pas encore
 *  redevenu dépensable (purgé à chaque écriture ; au plus autant d'entrées que de points du budget). */
export interface AdvVocation {
  nodes: string[];
  freeAt?: number[];
}

/** Victoires par faction, comptées sous la garde `xpGranted` (une fois par rapport). */
export type AdvVet = Partial<Record<RaidFaction, number>>;

export const VOCATION = {
  /** Points au départ, puis par niveau de héros au-delà de `catchUpFrom`. */
  start: 10,
  perHeroLevel: 2,
  /** Rattrapage : les niveaux d'avant ne rapportent rien, on ne repart pas de zéro. */
  catchUpFrom: 41,
  /** Délai avant qu'un point retiré soit de nouveau dépensable. */
  refundMs: 24 * 3600_000,
} as const;

/** 🏅 Victoires pour le palier I d'une faction. */
export const VET = { tier: 15 } as const;

/** Les TOTAUX de points du joueur (dépensés ou non) à ce niveau de héros. */
export function vocationBudget(heroLevel: number): number {
  return VOCATION.start + VOCATION.perHeroLevel * Math.max(0, heroLevel - VOCATION.catchUpFrom);
}

/** Familles de lieux qu'une lecture d'information peut annoncer. */
export type SpawnGroup = 'fight' | 'rift' | 'ruins';
const SPAWN_TYPES: Record<SpawnGroup, readonly PoiType[]> = {
  fight: ['camp', 'lair', 'den'],
  rift: ['rift'],
  ruins: ['ruins'],
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
}

/** −5 % de force sur les ennemis d'un camp ou d'un repaire (le fumigène fait −10 %). */
const BREAKER_FOE = 0.95;
/** −10 % (relatif) de chance d'embuscade sur une route dangereuse (la carte du contrebandier
 *  retire jusqu'à 25 points de pourcentage). */
const GUARD_AMBUSH = 0.9;

/** Les arbres. ⚠️ Une lignée absente = pas encore de carnet (L2 : archer, mage, homme d'armes,
 *  éclaireur, caravanier) — l'écran le dit au lieu de proposer un arbre vide. */
const TREES: Partial<Record<Lineage, readonly VocationNode[]>> = {
  guerrier: [
    {
      id: 'guerrier.flair',
      lineage: 'guerrier',
      kind: 'info',
      cost: 1,
      emoji: '🏕️',
      label: 'Flair des bannières',
      text: 'Estime quand apparaîtra un camp ou un repaire (à peu près, sans promesse).',
      spawn: 'fight',
    },
    {
      id: 'guerrier.failles',
      lineage: 'guerrier',
      kind: 'info',
      cost: 1,
      emoji: '🕳️',
      label: 'Veilleur des failles',
      text: 'Estime quand s’ouvrira une faille (à peu près, sans promesse).',
      spawn: 'rift',
    },
    {
      id: 'guerrier.ruines',
      lineage: 'guerrier',
      kind: 'info',
      cost: 1,
      emoji: '🏛️',
      label: 'Œil des ruines',
      text: 'Estime quand émergeront des ruines anciennes (à peu près, sans promesse).',
      spawn: 'ruins',
    },
    {
      id: 'guerrier.brise-camp',
      lineage: 'guerrier',
      kind: 'major',
      cost: 3,
      emoji: '🪓',
      label: 'Brise-camp',
      text: `Dans l’équipe, les ennemis d’un camp ou d’un repaire ont ${Math.round((1 - BREAKER_FOE) * 100)} % de force en moins (pas cumulable).`,
      excl: 'guerrier.garde-route',
    },
    {
      id: 'guerrier.garde-route',
      lineage: 'guerrier',
      kind: 'major',
      cost: 3,
      emoji: '🛡️',
      label: 'Garde de route',
      text: `Dans l’équipe, ${Math.round((1 - GUARD_AMBUSH) * 100)} % d’embuscades en moins sur une route dangereuse (pas cumulable).`,
      excl: 'guerrier.brise-camp',
    },
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
// ⚔️ LES DEUX EFFETS — lus par les crochets existants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🧭 LA VOIE MAJEURE DE L'ÉQUIPE : UNE SEULE compte par mission (décision de l'utilisateur).
 * C'est la première trouvée en parcourant l'escorte DANS L'ORDRE REÇU (celui de `escort`, le
 * même pour le vrai combat et le pronostic) ; un champion n'en a qu'une (exclusivité). Les deux
 * voies ne se cumulent donc jamais, même portées par deux champions. `null` = aucune.
 */
function teamMajor(escort: readonly Adventurer[]): string | null {
  for (const a of escort)
    for (const id of nodesOf(a)) if (NODE_BY_ID.get(id)?.kind === 'major') return id;
  return null;
}
/** 🪓 Brise-camp : la force des ennemis d'un camp ou d'un repaire, si c'est la voie de l'équipe.
 *  1 = aucun effet. */
export function vocationGuardMult(escort: readonly Adventurer[], poi: Pick<Poi, 'type'>): number {
  return (poi.type === 'camp' || poi.type === 'lair') && teamMajor(escort) === 'guerrier.brise-camp'
    ? BREAKER_FOE
    : 1;
}

/** 🛡️ Garde de route : le facteur sur la chance d'embuscade d'une route DANGEREUSE
 *  (`routePerilous`, fourni par l'appelant), si c'est la voie de l'équipe. 1 = aucun effet. */
export function vocationAmbushMult(escort: readonly Adventurer[], perilous: boolean): number {
  return perilous && teamMajor(escort) === 'guerrier.garde-route' ? GUARD_AMBUSH : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔭 LES LECTURES D'INFORMATION
// ─────────────────────────────────────────────────────────────────────────────

/** Une apparition prévue (cf. `upcomingSpawns`). */
export interface SpawnAhead {
  id: string;
  type: PoiType;
  at: number;
}

/** La première apparition à venir d'une famille de lieux, `null` si aucune dans l'horizon. */
export function nextOfGroup(spawns: readonly SpawnAhead[], group: SpawnGroup): SpawnAhead | null {
  const types = SPAWN_TYPES[group];
  return spawns.filter((s) => types.includes(s.type)).sort((a, b) => a.at - b.at)[0] ?? null;
}

const SPAWN_EMO: Record<SpawnGroup, string> = { fight: '🏕️', rift: '🕳️', ruins: '🏛️' };

/** Le nom, volontairement VAGUE, d'une famille : le type exact peut différer à l'arrivée. */
const VAGUE_LABEL: Record<SpawnGroup, string> = {
  fight: 'un camp ou un repaire',
  rift: 'une faille',
  ruins: 'des ruines',
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
  return (vocationTree(adv) ?? [])
    .filter((n) => n.spawn && nodesOf(adv).includes(n.id))
    .map((n) => n.spawn!);
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
