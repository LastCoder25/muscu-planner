/**
 * ⚔️🧭 L'ATTAQUE COMBINÉE (2026-09-29, décisions de l'utilisateur) : plusieurs groupes —
 * la base (héros compris) et des points fixes tenus — attaquent le MÊME lieu, en partant
 * chacun à son heure pour ARRIVER ENSEMBLE.
 *
 * - **Le plan** : l'heure d'arrivée commune est celle du groupe le plus lent parti tout de
 *   suite ; chaque autre groupe part à « arrivée − son trajet ». Jusque-là il reste chez lui :
 *   la garnison d'un point continue de produire et de se défendre, les champions de la base
 *   (et le héros) la défendent en cas de siège.
 * - **L'attente se paie** : un groupe qui se fait battre avant de partir ne vient pas.
 *   À l'heure de son départ, on ne garde que ceux qui PEUVENT partir (point encore tenu,
 *   toujours en garnison, pas à l'infirmerie ; héros pas blessé). Une reprise ou un siège
 *   échu AVANT le départ se tranche d'abord (`'wait'`) : sans ça, le tick pourrait faire
 *   partir un groupe que la bataille, jouée plus tard, aurait dû garder.
 * - **Le combat** se tire quand le dernier groupe est parti, avec ceux qui sont VRAIMENT
 *   partis (graine fixée à l'envoi). Personne n'est parti → l'attaque est annulée.
 * - Les trajets et le plan sont FIGÉS à l'envoi : un groupe amputé part à l'heure prévue.
 *
 * ⚠️ PUR : le store écrit.
 */
import type { Adventurer } from './adventurers';
import type { ExpeditionMap, Poi } from './expedition';
import type { SupplyId } from './supplies';
import type { Outing } from './siegePresence';

/** Un groupe de l'attaque, parti de la base (`originId` null) ou d'un point fixe. */
export interface AttackWing {
  originId: string | null;
  /** Champions PRÉVUS (réservés à l'envoi). */
  members: string[];
  hero: boolean;
  legMin: number;
  departAt: number;
  returnAt: number;
  state: 'waiting' | 'gone' | 'dropped';
  /** Ceux qui sont VRAIMENT partis (une fois `gone`). */
  gone?: string[];
  heroGone?: boolean;
  /** 🏰 Assaut d'un point fixe : le retour de CE groupe si le point est pris (minutes) —
   *  seuls son héros et ses champions qui ne restent pas en garnison rentrent, à LEUR pas ;
   *  0 si personne. Estimé à l'envoi (affichage), recalculé au lancement avec ceux qui
   *  sont vraiment partis. Absent hors assaut : le retour est `legMin`. */
  wonLegMin?: number;
  /** ⚡ Ce que des boosts ont déjà retiré de son RETOUR (ms) : `wingReturnLegs` le garde. */
  backCutMs?: number;
}

/** Les retours (pris / raté, minutes) d'un groupe dont l'assaut se joue, ce que les boosts en
 *  ont déjà retiré compris — sinon le retour recalculé à l'arrivée effacerait le raccourci. */
export function wingReturnLegs(
  w: Pick<AttackWing, 'legMin' | 'backCutMs'>,
  wonMin: number,
): { won: number; lost: number } {
  const cut = Math.max(0, w.backCutMs ?? 0) / 60_000;
  return { won: Math.max(0, wonMin - cut), lost: Math.max(0, w.legMin - cut) };
}

export interface CombinedAttack {
  id: string;
  poi: Poi;
  seed: number;
  createdAt: number;
  /** Arrivée commune sur le lieu, puis rapport (fouille éventuelle comprise). */
  arriveAt: number;
  midAt: number;
  playerLevel: number;
  supplies: SupplyId[];
  stayIds?: string[];
  wings: AttackWing[];
}

/** ⚠️ Au moins deux groupes : un seul point de départ, c'est une équipe ordinaire. */
const MIN_WINGS = 2;

/** Le plan : arrivée commune = le plus long trajet, parti maintenant ; chacun part à
 *  « arrivée − son trajet ». Retour = arrivée + fouille + son trajet. */
export function planWings(
  inputs: readonly { originId: string | null; members: string[]; hero: boolean; legMin: number }[],
  now: number,
  dwellMs: number,
  /** ⚔️🧭 Cible en MARCHE : la minute de rencontre commune (`meetAll`), qui peut dépasser le
   *  plus long trajet (il faut que l'armée soit venue jusque-là). */
  meetInMin = 0,
): { arriveAt: number; midAt: number; wings: AttackWing[] } {
  const longest = Math.max(1, meetInMin, ...inputs.map((w) => w.legMin));
  const arriveAt = now + longest * 60_000;
  const midAt = arriveAt + Math.max(0, dwellMs);
  return {
    arriveAt,
    midAt,
    wings: inputs.map((w) => ({
      originId: w.originId,
      members: [...w.members],
      hero: w.hero,
      legMin: w.legMin,
      departAt: arriveAt - w.legMin * 60_000,
      returnAt: midAt + w.legMin * 60_000,
      state: 'waiting' as const,
    })),
  };
}

/**
 * 🧭 Les lieux de départ, du plus PROCHE de la cible au plus loin (trajet aller, minutes) —
 * l'ordre dans lequel l'écran les montre : tuiles de départ, champions par lieu, plan.
 * À trajet égal, la base d'abord (c'est de là que part le héros), puis l'ordre reçu.
 */
export function byReach<T extends { id: string; legMin: number }>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        a.r.legMin - b.r.legMin ||
        Number(b.r.id === 'base') - Number(a.r.id === 'base') ||
        a.i - b.i,
    )
    .map((x) => x.r);
}

/** Le groupe de la BASE, tel que l'écran le nomme dans son plan. */
export const BASE_WING_ID = 'base';
/** 🧭 L'origine d'un groupe pour les règles et le store : la base n'est PAS un point fixe,
 *  elle vaut `null`. ⚠️ SOURCE UNIQUE de cette traduction — l'écran la faisait pour l'envoi
 *  mais pas pour la vérification : dès que le héros était de l'attaque, `combinedBlocker`
 *  croyait qu'il partait d'un point (« le héros part de la base ») et grisait le bouton. */
export const wingOriginId = (id: string): string | null => (id === BASE_WING_ID ? null : id);

/** Pourquoi une attaque combinée ne peut pas partir (hors règles d'une équipe ordinaire). */
export type CombinedBlock = 'fewWings' | 'twice' | 'heroFar' | 'emptyWing';
export const COMBINED_BLOCK_LABEL: Record<CombinedBlock, string> = {
  fewWings: 'une attaque combinée part d’au moins deux endroits',
  twice: 'un même point de départ ou un même champion est choisi deux fois',
  heroFar: 'le héros part de la base',
  emptyWing: 'chaque point de départ doit envoyer quelqu’un',
};
export function combinedBlocker(
  poi: Pick<Poi, 'type'>,
  wings: readonly { originId: string | null; members: readonly string[]; hero: boolean }[],
): CombinedBlock | null {
  if (wings.length < MIN_WINGS) return 'fewWings';
  const origins = wings.map((w) => w.originId ?? '');
  const ids = wings.flatMap((w) => w.members);
  if (new Set(origins).size !== origins.length || new Set(ids).size !== ids.length) return 'twice';
  if (wings.some((w) => w.hero && w.originId !== null)) return 'heroFar';
  if (wings.some((w) => !w.members.length && !w.hero)) return 'emptyWing';
  return null;
}

/** Ce qui se passe au départ d'un groupe dont l'heure est venue. */
export type WingDeparture = 'wait' | { members: string[]; hero: boolean };

/**
 * ⚔️ Le groupe peut-il partir ? `null` = pas encore l'heure ; `'wait'` = une bataille échue
 * AVANT son départ n'est pas encore tranchée (on attend le tick qui la tranche) ; sinon, ceux
 * qui partent vraiment (éventuellement personne).
 */
export function wingDeparture(
  wing: AttackWing,
  ctx: {
    now: number;
    map: ExpeditionMap | null | undefined;
    advs: readonly Adventurer[];
    /** Heure du siège de la base encore à trancher (`raid.arrivesAt`), sinon null. */
    raidAt: number | null;
    /** Le héros est-il blessé à cet instant ? */
    heroWoundedAt: (t: number) => boolean;
  },
): WingDeparture | null {
  if (wing.state !== 'waiting' || ctx.now < wing.departAt) return null;
  const t = wing.departAt;
  // Toujours réservé pour CETTE attaque, et pas à l'infirmerie au moment de partir.
  const fit = (a: Adventurer) => (a.hurtUntil ?? 0) <= t && a.busyUntil === wing.returnAt;
  if (wing.originId === null) {
    if (ctx.raidAt !== null && ctx.raidAt <= t && ctx.raidAt <= ctx.now) return 'wait';
    const members = wing.members.filter((id) => {
      const a = ctx.advs.find((x) => x.id === id);
      return !!a && !a.posted && fit(a);
    });
    return { members, hero: wing.hero && !ctx.heroWoundedAt(t) };
  }
  const p = ctx.map?.pois.find((q) => q.id === wing.originId);
  const c = p?.control;
  if (c?.owner === 'player' && c.attackAt !== undefined && c.attackAt <= t && c.attackAt <= ctx.now)
    return 'wait';
  if (c?.owner !== 'player') return { members: [], hero: false };
  const g = new Set(c.garrison);
  const members = wing.members.filter((id) => {
    const a = ctx.advs.find((x) => x.id === id);
    return !!a && g.has(id) && a.posted === wing.originId && fit(a);
  });
  return { members, hero: false };
}

/** Tous les groupes ont-ils statué (partis ou abandonnés) ? */
export const attackSettled = (a: CombinedAttack): boolean =>
  a.wings.every((w) => w.state !== 'waiting');

/** Ceux qui ont réellement pris part à l'attaque. */
export function attackParticipants(a: CombinedAttack): { ids: string[]; hero: boolean } {
  const gone = a.wings.filter((w) => w.state === 'gone');
  return { ids: gone.flatMap((w) => w.gone ?? []), hero: gone.some((w) => !!w.heroGone) };
}

/** Les absents, pour le rapport : ceux qui étaient prévus et ne sont pas venus. */
export function attackNoShows(a: CombinedAttack): { ids: string[]; hero: boolean } {
  const ids: string[] = [];
  let hero = false;
  for (const w of a.wings) {
    const went = new Set(w.gone ?? []);
    ids.push(...w.members.filter((id) => !went.has(id)));
    if (w.hero && !w.heroGone) hero = true;
  }
  return { ids, hero };
}

/**
 * 🏰 Pour les sièges : qui est DEHORS à cause d'une attaque combinée, et quand. Un groupe
 * en attente est chez lui jusqu'à son départ (il défend) ; parti, il est dehors jusqu'à son
 * retour. ⚠️ Même forme que les voyages (`siegePresence.Outing`) : le siège lit les deux.
 */
export function attackOutings(attacks: readonly CombinedAttack[]): Outing[] {
  const out: Outing[] = [];
  for (const a of attacks)
    for (const w of a.wings) {
      if (w.state === 'dropped') continue;
      out.push({
        sentAt: w.departAt,
        returnAt: w.returnAt,
        escort: w.state === 'gone' ? (w.gone ?? []) : w.members,
        hero: w.state === 'gone' ? !!w.heroGone : w.hero,
      });
    }
  return out;
}

/** ⏳ Un groupe d'attaque qui ATTEND son départ depuis un lieu. */
export interface WaitingWing {
  attackId: string;
  /** La cible de l'attaque. */
  poi: Poi;
  departAt: number;
  members: string[];
  hero: boolean;
}

/**
 * ⏳ Les groupes d'attaque combinée qui attendent de partir de `originId` (un point fixe, ou
 * `null` pour la base), du départ le plus proche au plus lointain. ⚠️ Signalé : la fiche d'un
 * lieu fixe ne disait rien de ses champions réservés pour une attaque — on les croyait libres.
 */
export function waitingFrom(
  attacks: readonly CombinedAttack[] | null | undefined,
  originId: string | null,
): WaitingWing[] {
  const out: WaitingWing[] = [];
  for (const a of attacks ?? [])
    for (const w of a.wings)
      if (w.state === 'waiting' && w.originId === originId)
        out.push({
          attackId: a.id,
          poi: a.poi,
          departAt: w.departAt,
          members: w.members,
          hero: w.hero,
        });
  return out.sort((x, y) => x.departAt - y.departAt);
}

/** ⚔️⏳ Les champions de garnison RÉSERVÉS par une attaque combinée qui n'est pas encore partie
 *  de leur lieu fixe : encore là, mais engagés (la carte les dessine comme en expédition). */
export function attackReservedIds(
  attacks: readonly CombinedAttack[] | null | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const a of attacks ?? [])
    for (const w of a.wings)
      if (w.state === 'waiting' && w.originId !== null) for (const id of w.members) out.add(id);
  return out;
}

/** ⏳ Les champions qu'une attaque combinée ATTEND encore : ils restent dans la garnison de
 *  leur point (ou à la base) jusqu'à leur départ, mais ils sont pris — on ne les transfère,
 *  ne les échange ni ne les ramène, comme un membre d'un départ programmé. */
export function attackWaitingIds(attacks: readonly CombinedAttack[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const a of attacks ?? [])
    for (const w of a.wings) if (w.state === 'waiting') for (const id of w.members) ids.add(id);
  return ids;
}

/** 🧝 Le héros est-il engagé dans une attaque combinée (en attente ou parti) ? */
export function heroInAttack(attacks: readonly CombinedAttack[] | null | undefined): boolean {
  return (attacks ?? []).some((a) =>
    a.wings.some((w) => (w.state === 'waiting' && w.hero) || (w.state === 'gone' && w.heroGone)),
  );
}

/** 🦸 Quand le héros rentre d'une attaque combinée où il est engagé (réservé en attente, ou
 *  parti), `null` s'il n'en est d'aucune. ⚠️ Signalé : la ligne des disponibilités le disait
 *  « dispo » pendant une attaque combinée — elle ne lisait que l'expédition solo. */
export function heroAttackReturnAt(
  attacks: readonly CombinedAttack[] | null | undefined,
): number | null {
  let at: number | null = null;
  for (const a of attacks ?? [])
    for (const w of a.wings)
      if ((w.state === 'waiting' && w.hero) || (w.state === 'gone' && w.heroGone))
        at = Math.max(at ?? 0, w.returnAt);
  return at;
}
/** 🏰 Le héros est-il PARTI dans une attaque combinée ? Un groupe qui ATTEND son départ est
 *  encore chez lui (il défend) : seul un départ effectif le retire de la base. */
export function heroOutInAttack(attacks: readonly CombinedAttack[] | null | undefined): boolean {
  return (attacks ?? []).some((a) => a.wings.some((w) => w.state === 'gone' && !!w.heroGone));
}

/** Relit la colonne `attacks` : un jsonb malformé ne doit jamais faire planter la page. */
export function normalizeAttacks(v: unknown): CombinedAttack[] {
  if (!Array.isArray(v)) return [];
  return (v as Partial<CombinedAttack>[]).filter(
    (a): a is CombinedAttack =>
      !!a &&
      typeof a === 'object' &&
      typeof a.id === 'string' &&
      !!a.poi &&
      typeof a.poi === 'object' &&
      Array.isArray(a.wings) &&
      a.wings.length > 0 &&
      Number.isFinite(a.arriveAt) &&
      Number.isFinite(a.midAt),
  );
}

/**
 * 🗺️ Les groupes d'une attaque encore en préparation, comme des voyages à dessiner : un
 * groupe qui attend est posé CHEZ LUI (avant `departAt` le trajet n'a pas commencé), puis il
 * avance vers le lieu. Tous arrivent à `arriveAt`. Un groupe abandonné n'est pas dessiné.
 */
export function attackWingVoyages(
  attacks: readonly CombinedAttack[],
  map: ExpeditionMap | null | undefined,
): {
  key: string;
  attackId: string;
  waiting: boolean;
  members: string[];
  hero: boolean;
  voyage: {
    poi: Poi;
    sentAt: number;
    midAt: number;
    returnAt: number;
    dwellMs: number;
    origin?: { x: number; y: number };
    returnLegs?: { won: number; lost: number };
  };
}[] {
  const out = [];
  for (const a of attacks)
    for (const [i, w] of a.wings.entries()) {
      if (w.state === 'dropped') continue;
      const home = w.originId ? map?.pois.find((p) => p.id === w.originId) : undefined;
      out.push({
        key: `${a.id}:${i}`,
        attackId: a.id,
        waiting: w.state === 'waiting',
        members: w.state === 'gone' ? (w.gone ?? []) : w.members,
        hero: w.state === 'gone' ? !!w.heroGone : w.hero,
        voyage: {
          poi: a.poi,
          sentAt: w.departAt,
          midAt: a.midAt,
          returnAt: w.returnAt,
          dwellMs: Math.max(0, a.midAt - a.arriveAt),
          ...(w.wonLegMin !== undefined ? { returnLegs: wingReturnLegs(w, w.wonLegMin) } : {}),
          ...(home ? { origin: { x: home.x, y: home.y } } : {}),
        },
      });
    }
  return out;
}

/**
 * 🧭 Toucher un LIEU de départ coche tous ses champions, ou les décoche tous s'ils sont
 * déjà tous cochés (demandé par l'utilisateur). Les champions des AUTRES lieux ne bougent
 * pas. On n'ajoute jamais au-delà de `max` (le plafond de l'équipe) : les premiers du lieu,
 * dans l'ordre de l'écran, passent d'abord. Rend la nouvelle sélection.
 */
export function toggleOriginGroup(
  selected: readonly string[],
  groupIds: readonly string[],
  max: number,
): string[] {
  if (!groupIds.length) return [...selected];
  if (groupIds.every((id) => selected.includes(id)))
    return selected.filter((id) => !groupIds.includes(id));
  const out = [...selected];
  for (const id of groupIds) {
    if (out.length >= max) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * 🎨 UNE COULEUR PAR ATTAQUE COMBINÉE (demandé par l'utilisateur) : tous les groupes d'une
 * même attaque portent le même contour dans la rangée des voyages, et deux attaques en cours
 * ne partagent jamais la même tant que la palette suffit. Hors de l'accent (sélection), du
 * rouge (attaques ennemies), du violet (voyages) et du vert (retours), déjà pris.
 */
export const COMBINED_COLORS = [
  '#3ec6e0',
  '#ff9d4d',
  '#ff6fb5',
  '#9be15d',
  '#5b8cff',
  '#2fd4a3',
] as const;

/** 🎨 La clé d'une attaque combinée : son lieu et sa graine, communs à tous ses groupes
 *  (en attente comme partis — cf. `combinedSiblings`). */
export const combinedKey = (poiId: string, seed: number) => `${poiId}:${seed}`;

/**
 * 🎨 Attribue une couleur à chaque attaque. La couleur PRÉFÉRÉE vient d'un hachage de la clé
 * (une attaque garde sa couleur quand une autre se termine) ; en cas de collision, la
 * suivante libre. Les clés sont traitées dans un ordre stable (tri) : le résultat ne dépend
 * pas de l'ordre de la rangée.
 */
export function combinedColors(keys: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<number>();
  const n = COMBINED_COLORS.length;
  for (const k of [...new Set(keys)].sort()) {
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    let idx = h % n;
    for (let j = 0; j < n && used.has(idx); j++) idx = (idx + 1) % n;
    used.add(idx);
    out.set(k, COMBINED_COLORS[idx]!);
  }
  return out;
}
