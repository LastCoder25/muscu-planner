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
): { arriveAt: number; midAt: number; wings: AttackWing[] } {
  const longest = Math.max(1, ...inputs.map((w) => w.legMin));
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

/** Pourquoi une attaque combinée ne peut pas partir (hors règles d'une équipe ordinaire). */
export type CombinedBlock = 'fewWings' | 'twice' | 'heroFar' | 'emptyWing' | 'moving';
export const COMBINED_BLOCK_LABEL: Record<CombinedBlock, string> = {
  fewWings: 'une attaque combinée part d’au moins deux endroits',
  twice: 'un même point de départ ou un même champion est choisi deux fois',
  heroFar: 'le héros part de la base',
  emptyWing: 'chaque point de départ doit envoyer quelqu’un',
  moving: 'une armée en marche ne s’attaque pas en coordonné',
};
export function combinedBlocker(
  poi: Pick<Poi, 'type'>,
  wings: readonly { originId: string | null; members: readonly string[]; hero: boolean }[],
): CombinedBlock | null {
  if (wings.length < MIN_WINGS) return 'fewWings';
  if (poi.type === 'warband') return 'moving';
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

/** 🧝 Le héros est-il engagé dans une attaque combinée (en attente ou parti) ? */
export function heroInAttack(attacks: readonly CombinedAttack[] | null | undefined): boolean {
  return (attacks ?? []).some((a) =>
    a.wings.some((w) => (w.state === 'waiting' && w.hero) || (w.state === 'gone' && w.heroGone)),
  );
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
          ...(w.wonLegMin !== undefined
            ? { returnLegs: { won: w.wonLegMin, lost: w.legMin } }
            : {}),
          ...(home ? { origin: { x: home.x, y: home.y } } : {}),
        },
      });
    }
  return out;
}
