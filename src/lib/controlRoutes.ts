/**
 * 🏰🧭 LES POINTS FIXES COMME AVANT-POSTES (2026-09-29, décisions de l'utilisateur) :
 *
 * - **Transfert** : des champions ou des miliciens postés sur un point fixe partent
 *   directement vers un AUTRE point fixe tenu, comme un renfort envoyé de la base — ils y
 *   prennent leur place tout de suite et rejoignent la garnison à leur arrivée.
 * - **Sortie** : des champions postés partent attaquer (ou récolter) un lieu DEPUIS leur
 *   point, et y REVIENNENT au lieu de rentrer à la base.
 * - La Tour de guet s'applique partout (le multiplicateur de trajet est celui de la base).
 *
 * ⚠️ AUCUNE RÈGLE DE TRAJET NOUVELLE : un trajet depuis un point est la règle habituelle
 * (`partyLegMin`, `caravanLegMin`) rejouée sur un lieu dont la distance est mesurée DEPUIS
 * ce point (`fromSpot`). Et on ne fait jamais plus long que le détour par la ville : la
 * ligne directe paie les 18 unités autour de la ville que le passage par elle ne paie pas
 * (mesuré au niveau 30 : deux points opposés, 236 min en direct contre 160 par la ville).
 *
 * ⚠️ PUR : toutes les fonctions rendent un nouvel état, le store écrit.
 */
import { distNormAt, type ControlState, type ExpeditionMap, type Poi } from './expedition';
import { isMilitiaId } from './militia';
import {
  controlFreeSeats,
  freeAway,
  holdAway,
  garrisonFreeSeats,
  acceptsMilitia,
  militiaMayHead,
  pruneAway,
  reinforceControl,
  releaseFromControl,
  seatsOf,
  garrisonCap,
  sendHomeFromControl,
} from './controlPoints';

type Spot = Pick<Poi, 'x' | 'y'>;

/** Le lieu `poi` vu depuis `origin` : même lieu, distance recalculée depuis ce point. */
export function fromSpot<P extends Poi>(poi: P, origin: Spot): P {
  return { ...poi, distNorm: distNormAt(Math.hypot(poi.x - origin.x, poi.y - origin.y)) };
}

/**
 * Un trajet ALLER (minutes) de `origin` (un point fixe) vers `poi`, selon la règle de trajet
 * `legOf` (celle d'un départ de la ville). Le plus court entre la ligne directe et le détour
 * par la ville (retour à la ville, puis départ habituel).
 */
export function legFromSpot(poi: Poi, origin: Poi, legOf: (p: Poi) => number): number {
  const direct = legOf(fromSpot(poi, origin));
  const viaTown = legOf(origin) + legOf(poi);
  return Math.min(direct, viaTown);
}

const held = (map: ExpeditionMap, id: string) => {
  const p = map.pois.find((q) => q.id === id);
  return p?.control?.owner === 'player' ? p : null;
};

/** 🏰 Pourquoi un transfert ne peut pas partir. SOURCE UNIQUE : l'écran grise avec cette
 *  raison, le store refuse avec elle. */
export type TransferBlock =
  | 'same'
  | 'notHeld'
  | 'enemy'
  | 'empty'
  | 'notHere'
  | 'full'
  | 'noMilitia';
export const TRANSFER_BLOCK_LABEL: Record<TransferBlock, string> = {
  same: 'c’est déjà ce point',
  notHeld: 'les deux points doivent être à toi',
  enemy: 'un lieu ennemi ne reçoit que des miliciens',
  empty: 'choisis au moins un membre de la garnison',
  notHere: 'seuls les membres arrivés sur le point peuvent repartir',
  full: 'plus assez de places sur le point d’arrivée',
  noMilitia: 'ce lieu ne reçoit pas de miliciens',
};
export function transferBlocker(
  map: ExpeditionMap,
  fromId: string,
  toId: string,
  ids: readonly string[],
): TransferBlock | null {
  if (fromId === toId) return 'same';
  const from = held(map, fromId);
  const to = held(map, toId);
  // 🛡️⚔️ Vers un lieu ENNEMI (2026-10-06, signalé : « je n'ai pas pu faire venir les miliciens
  // depuis le scriptorium, j'ai dû les envoyer depuis la base ») : des miliciens y marchent à
  // l'avance d'un autre point comme de la base (`militiaMayHead`) — pris à leur arrivée, ils
  // occupent les places libres ; sinon demi-tour vers la base (`settleReinforcements`).
  const enemy = !to && militiaMayHead(map.pois.find((q) => q.id === toId)?.control);
  if (!from || (!to && !enemy)) return 'notHeld';
  if (!ids.length) return 'empty';
  // ⚠️ Seulement la garnison ARRIVÉE : un renfort encore en route vers le point de départ ne
  // peut pas en repartir (il n'y est pas), et un id répété ne crée personne.
  const g = new Set(from.control!.garrison);
  if (new Set(ids).size !== ids.length || ids.some((id) => !g.has(id))) return 'notHere';
  const champs = ids.filter((id) => !isMilitiaId(id)).length;
  if (!to) return champs ? 'enemy' : null;
  // 🛡️ Les MILICIENS partent même si le lieu est plein (2026-10-06, demandé : « depuis la
  // garnison du lieu aussi »), comme depuis la base : à l'arrivée ils s'installent s'il y a de
  // la place, sinon ils font demi-tour vers la base (`settleReinforcements`). Les champions,
  // eux, restent bornés par les places.
  if (champs > controlFreeSeats(to.control) || champs > garrisonFreeSeats(to.control))
    return 'full';
  if (ids.length > champs && !acceptsMilitia(to.control)) return 'noMilitia';
  return null;
}

/**
 * ⇄ QUI PEUT VENIR D'UN AUTRE POINT renforcer `toId` (2026-09-29, demandé : « faire venir un
 * champion ou milicien d'un autre lieu fixe » depuis la case libre de la liste). Par point
 * tenu, les membres ARRIVÉS dont le départ SEUL passe `transferBlocker` — la règle du store,
 * donc l'écran ne propose jamais un transfert qu'il refuserait. Les points sans candidat
 * sont omis.
 */
export function transferSourcesFor(
  map: ExpeditionMap | null | undefined,
  toId: string,
): { fromId: string; ids: string[] }[] {
  if (!map) return [];
  return (
    map.pois
      // ⚠️ Pas de pré-filtre « autre point, tenu » : `transferBlocker` refuse déjà le même point,
      // un point ennemi et un renfort pas encore arrivé — un second filtre serait dormant.
      .filter((p) => !!p.control)
      .map((p) => ({
        fromId: p.id,
        ids: p.control!.garrison.filter((id) => !transferBlocker(map, p.id, toId, [id])),
      }))
      .filter((s) => s.ids.length > 0)
  );
}

/**
 * 🏰 Le transfert : les partants quittent le point de départ (sa production garde ce qui est
 * déjà produit, `releaseFromControl`) et marchent vers le point d'arrivée, où ils prennent
 * leur place tout de suite. Champions et miliciens ont chacun leur heure d'arrivée (ils ne
 * marchent pas au même pas).
 */
export function transferGarrison(
  map: ExpeditionMap,
  opts: {
    fromId: string;
    toId: string;
    now: number;
    playerLevel: number;
    champs: { ids: readonly string[]; at: number };
    militia: { ids: readonly string[]; at: number };
  },
): ExpeditionMap {
  const { fromId, toId, now } = opts;
  let m = releaseFromControl(
    map,
    fromId,
    [...opts.champs.ids, ...opts.militia.ids],
    now,
    opts.playerLevel,
  );
  if (opts.champs.ids.length)
    m = reinforceControl(m, toId, opts.champs.ids, opts.champs.at, now, fromId);
  if (opts.militia.ids.length)
    m = reinforceControl(m, toId, opts.militia.ids, opts.militia.at, now, fromId);
  return m;
}

/**
 * ⇄ L'ÉCHANGE (2026-09-29, demandé : « le remplacé et le remplaçant échangent leur place dans
 * leur lieu respectif, après temps de trajet ») : `outId`, ARRIVÉ sur `pointId`, part prendre
 * la place de `inId` là où celui-ci se trouve — la BASE (`fromId` absent : il y rentre, et
 * `inId` vient de la base) ou un AUTRE point tenu `fromId` (les deux se croisent, chacun
 * rejoint la garnison de l'autre à son arrivée). Chacun occupe tout de suite la place qu'il va
 * prendre, comme un renfort. SOURCE UNIQUE : l'écran grise avec cette raison, le store refuse.
 */
export type SwapBlock = 'notHeld' | 'notHere' | 'same' | 'full';
/** Le remplaçant « un milicien de la base » : il n'a pas encore d'id, il en reçoit un au départ. */
export const SWAP_MILITIA_FROM_BASE = 'mil:base';
export const SWAP_BLOCK_LABEL: Record<SwapBlock, string> = {
  notHeld: 'les deux points doivent être à toi',
  notHere: 'seuls les membres arrivés sur un point peuvent être échangés',
  same: 'ils sont déjà sur le même point',
  full: 'plus assez de places après l’échange',
};

/** Les places d'un point une fois `out` parti et `add` arrivé : 5 au plus en tout, et les
 *  champions dans la limite du point (`seatsOf`) — la règle de `capGarrison`. */
function seatsOkAfter(c: ControlState, out: string, add: string): boolean {
  const ids = [...c.garrison, ...(c.reinforcing ?? []).map((r) => r.id)].filter((x) => x !== out);
  ids.push(add);
  const champs = ids.filter((x) => !isMilitiaId(x)).length;
  return ids.length <= garrisonCap(c.kind) && champs <= seatsOf(c.kind);
}

export function swapBlocker(
  map: ExpeditionMap,
  pointId: string,
  outId: string,
  inId: string,
  fromId?: string | null,
): SwapBlock | null {
  const p = held(map, pointId);
  if (!p) return 'notHeld';
  const c = p.control!;
  if (!c.garrison.includes(outId)) return 'notHere';
  if (fromId) {
    if (fromId === pointId) return 'same';
    const q = held(map, fromId);
    if (!q) return 'notHeld';
    if (!q.control!.garrison.includes(inId)) return 'notHere';
    if (!seatsOkAfter(q.control!, inId, outId)) return 'full';
  } else if ([...c.garrison, ...(c.reinforcing ?? []).map((r) => r.id)].includes(inId)) {
    // Depuis la base : un membre déjà posté (ou en route) sur ce point n'est pas « à la base ».
    return 'same';
  }
  return seatsOkAfter(c, outId, inId) ? null : 'full';
}

/** ⇄ L'échange sur la carte. `outAt`/`inAt` = l'arrivée de chacun à destination. */
export function swapGarrison(
  map: ExpeditionMap,
  opts: {
    pointId: string;
    outId: string;
    outAt: number;
    inId: string;
    inAt: number;
    now: number;
    playerLevel: number;
    fromId?: string | null;
  },
): ExpeditionMap {
  const { pointId, outId, inId, now, playerLevel, fromId } = opts;
  let m = releaseFromControl(map, pointId, [outId], now, playerLevel);
  if (fromId) {
    m = releaseFromControl(m, fromId, [inId], now, playerLevel);
    m = reinforceControl(m, fromId, [outId], opts.outAt, now, pointId);
    return reinforceControl(m, pointId, [inId], opts.inAt, now, fromId);
  }
  m = sendHomeFromControl(m, pointId, [outId], now, opts.outAt);
  return reinforceControl(m, pointId, [inId], opts.inAt, now);
}

/** ⚔️ Pourquoi une sortie ne peut pas partir d'un point. */
export type SortieBlock = 'notHeld' | 'empty' | 'notHere';
export const SORTIE_BLOCK_LABEL: Record<SortieBlock, string> = {
  notHeld: 'ce point n’est plus à toi',
  empty: 'choisis au moins un champion de la garnison',
  notHere: 'seuls les champions arrivés sur le point peuvent en partir',
};
export function sortieBlocker(
  map: ExpeditionMap,
  fromId: string,
  ids: readonly string[],
): SortieBlock | null {
  const from = held(map, fromId);
  if (!from) return 'notHeld';
  if (!ids.length) return 'empty';
  const g = new Set(from.control!.garrison);
  // ⚠️ Des CHAMPIONS : un milicien ne part pas en mission (il tient le point, c'est tout).
  if (new Set(ids).size !== ids.length || ids.some((id) => isMilitiaId(id) || !g.has(id)))
    return 'notHere';
  return null;
}

/** 🏰 Les champions de la garnison ARRIVÉE d'un point (miliciens exclus), dans son ordre. */
export function garrisonChampionIds(map: ExpeditionMap | null | undefined, id: string): string[] {
  const p = map?.pois.find((q) => q.id === id);
  if (p?.control?.owner !== 'player') return [];
  return p.control.garrison.filter((x) => !isMilitiaId(x));
}

/** 🏰 Les champions de garnison PRÊTS À SORTIR, point par point (tenus seulement) : ni en
 *  route vers leur point, ni blessés. ⚠️ SOURCE UNIQUE de l'écran d'envoi (`partyPool`) ET du
 *  grisage de la carte : la carte grisait un lieu faute de champion libre à la BASE, alors
 *  qu'une sortie depuis un point fixe pouvait l'attaquer (signalé par l'utilisateur). */
export function readyGarrisons<A extends { id: string; hurtUntil?: number; busyUntil?: number }>(
  map: ExpeditionMap | null | undefined,
  advs: readonly A[],
  now: number,
  /** ⏳ Les membres réservés par un départ programmé (`plannedTransferIds`) : un retour ou un
   *  transfert programmé les attend, ils ne sortent pas (signalé : « j'ai programmé un retour
   *  mais le membre semble toujours disponible »). */
  reserved: ReadonlySet<string>,
): Map<string, A[]> {
  const out = new Map<string, A[]>();
  for (const p of map?.pois ?? []) {
    if (p.control?.owner !== 'player') continue;
    const ids = new Set(garrisonChampionIds(map, p.id));
    const ready = advs.filter(
      (a) =>
        ids.has(a.id) &&
        !reserved.has(a.id) &&
        (a.hurtUntil ?? 0) <= now &&
        (a.busyUntil ?? 0) <= now,
    );
    if (ready.length) out.set(p.id, ready);
  }
  return out;
}

/** 👥 Combien de champions peuvent partir vers `poiId` : ceux libres à la base, plus les
 *  garnisons prêtes des AUTRES points tenus (on ne sort pas d'un point pour l'attaquer). */
export function championsAbleToGo(
  freeAtBase: number,
  ready: ReadonlyMap<string, readonly unknown[]>,
  poiId: string,
): number {
  let n = freeAtBase;
  for (const [id, list] of ready) if (id !== poiId) n += list.length;
  return n;
}

/**
 * 🏠 Une sortie RENTRE à son point à `at` : ceux qui ont encore une place y reprennent leur
 * poste — la leur leur a été gardée pendant la sortie (`away`) — (ils rejoignent la garnison
 * comme un renfort arrivé — une attaque déjà due se résout
 * d'abord sans eux) ; les autres (point perdu entre-temps, ou places reprises) rentrent à la
 * base. Rend la carte et la répartition.
 */
export function rejoinHome(
  map: ExpeditionMap,
  homeId: string,
  ids: readonly string[],
  at: number,
): { map: ExpeditionMap; back: string[]; out: string[] } {
  if (!held(map, homeId) || !ids.length) return { map, back: [], out: [...ids] };
  // ⚔️🏰 Leur place leur était GARDÉE (`away`) : on la leur rend avant de compter les places
  // libres, sinon ils se la disputeraient avec eux-mêmes.
  // 🛡️⚔️ Ceux dont la place était gardée la REPRENNENT toujours, même si des miliciens la
  // tiennent en intérim (`interimSeats`) : à leur arrivée, le dernier milicien rentre à pied à
  // la base (`settleReinforcements`). Les autres ne prennent qu'une place vraiment libre.
  const kept = new Set(held(map, homeId)!.control!.away ?? []);
  const owed = ids.filter((id) => kept.has(id));
  const rest = ids.filter((id) => !kept.has(id));
  let m = freeAway(map, homeId, ids);
  if (owed.length) m = reinforceControl(m, homeId, owed, at);
  const more = rest.slice(0, controlFreeSeats(held(m, homeId)!.control));
  if (more.length) m = reinforceControl(m, homeId, more, at);
  return { map: m, back: [...owed, ...more], out: rest.slice(more.length) };
}

/**
 * ⚔️🏰 QUI EST VRAIMENT DEHORS POUR REVENIR SUR SON POINT : la règle de `pruneAway`. Un
 * champion garde sa place sur `pointId` tant qu'un voyage EN COURS parti de ce point
 * (`homeId`) le ramène — il en est membre (`crew`, sinon l'escorte du rapport) et son
 * `busyUntil` est le retour de CE voyage — ou qu'un groupe d'attaque combinée parti de ce
 * point l'a emmené (`state: 'gone'`) sans que le voyage soit encore créé. Un champion posté
 * ailleurs (assaut pris) n'y revient pas. ⚠️ Types STRUCTURELS : aucune dépendance au store.
 */
export function sortieAwayKeeper(
  voyages: readonly {
    homeId?: string;
    returnAt: number;
    crew?: string[];
    outcome: { party?: { escort: string[] } };
  }[],
  wings: readonly { originId: string | null; state: string; gone?: string[] }[],
  advs: readonly { id: string; busyUntil?: number; posted?: string }[],
): (pointId: string, advId: string) => boolean {
  const byId = new Map(advs.map((a) => [a.id, a]));
  return (pointId, advId) => {
    const a = byId.get(advId);
    if (!a || a.posted) return false;
    if (wings.some((w) => w.state === 'gone' && w.originId === pointId && w.gone?.includes(advId)))
      return true;
    return voyages.some(
      (v) =>
        v.homeId === pointId &&
        (a.busyUntil ?? 0) === v.returnAt &&
        (v.crew ?? v.outcome.party?.escort ?? []).includes(advId),
    );
  };
}

type AwayVoyage = Parameters<typeof sortieAwayKeeper>[0][number];
type AwayWing = Parameters<typeof sortieAwayKeeper>[1][number];
type AwayAdv = Parameters<typeof sortieAwayKeeper>[2][number];

/**
 * ⚔️🏰 ACCORDE les places gardées à la réalité des voyages : retire celles dont le sortant ne
 * revient plus (`pruneAway`), et en DONNE une à tout sortant en route vers son point qui n'en
 * a pas — une sortie partie avant la règle (signalé : « je ne vois pas les places gardées »,
 * une attaque combinée partie du camp d'entraînement juste avant la mise à jour). ⚠️ Seulement
 * s'il reste une place libre : on ne déloge jamais quelqu'un arrivé entre-temps. Rend la MÊME
 * carte si rien ne change (le store n'écrit pas à vide).
 */
export function syncAway(
  map: ExpeditionMap,
  voyages: readonly AwayVoyage[],
  wings: readonly AwayWing[],
  advs: readonly AwayAdv[],
): ExpeditionMap {
  const keep = sortieAwayKeeper(voyages, wings, advs);
  let out = pruneAway(map, keep);
  for (const v of voyages) {
    if (!v.homeId) continue;
    const p = held(out, v.homeId);
    if (!p) continue;
    const c = p.control!;
    const there = new Set([
      ...c.garrison,
      ...(c.reinforcing ?? []).map((r) => r.id),
      ...(c.away ?? []),
    ]);
    const miss = (v.crew ?? v.outcome.party?.escort ?? []).filter(
      (id) => !there.has(id) && keep(v.homeId!, id),
    );
    const add = miss.slice(0, controlFreeSeats(c));
    if (add.length) out = holdAway(out, v.homeId, add);
  }
  return out;
}
