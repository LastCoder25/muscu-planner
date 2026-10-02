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
import { activeIsland, islandPacified, type Island } from './archipelago';
import { CHARACTER_RANKS, rankStartLevel } from './characterRank';
import { CONTROL, bankAt } from './controlPoints';
import { islandTerrain } from './islandTerrain';
import {
  ARCHIPEL_TRAVEL_LEVEL,
  EXPE,
  distNormAt,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
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
  /** Distance des objectifs à la base (unités de carte) : entre l'anneau des lieux fixes
   *  (~32) et le bord de l'île (54) — à au moins 10 unités de chacun des deux. */
  objectiveDist: 43,
  /** ⛏️ Mine tenue en mode archipel : une mission de mine toutes les 24 h (au lieu de 8 h). */
  mineHours: 24,
  /** 🕊️ Le socle d'une île pacifiée produit à cette part, sans crans. */
  socleShare: 0.25,
} as const;

/** 🕊️ Le SOCLE d'une île (règle 10) : ce qui produit sur toutes les îles. */
const SOCLE: ReadonlySet<ControlKind> = new Set<ControlKind>(['mine', 'mana']);

export const FORTRESS_ID = 'isl_fortress';
export const objectiveIdOf = (i: number): string => `isl_obj_${i}`;
/** 🏝️ Un objectif ou la forteresse (ce qu'on abat sur une île). */
export const isIslandTargetId = (id: string): boolean =>
  id === FORTRESS_ID || id.startsWith('isl_obj_');

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

/** Le premier niveau du rang au-dessus du plafond de l'île (borné au dernier rang). */
function rankAbove(cap: number): number {
  const top = rankStartLevel(CHARACTER_RANKS.length - 1);
  return Math.min(top, cap + (rankStartLevel(1) - 1));
}

/** ⚔️ La forteresse selon les objectifs abattus (`down` sur `n`) : niveau, troupe et verrou.
 *  Elle redescend LINÉAIREMENT d'un rang au-dessus du plafond (troupe 12) au plafond (8). */
export function fortressForce(
  isl: Pick<Island, 'maxLevel' | 'objectives'>,
  down: number,
): { level: number; size: number; locked: boolean } {
  const n = Math.max(1, isl.objectives);
  const w = Math.min(1, Math.max(0, down) / n);
  const hi = rankAbove(isl.maxLevel);
  const { fortressIntactSize: big, fortressWeakSize: small } = ISLAND_CONQUEST;
  return {
    level: Math.round(hi - (hi - isl.maxLevel) * w),
    size: Math.round((big - (big - small) * w) * 100) / 100,
    locked: down < Math.min(ISLAND_CONQUEST.unlockAfter, n),
  };
}

/** Ce que l'île a déjà perdu. */
function destroyedOf(map: Pick<ExpeditionMap, 'archipel'>): Set<string> {
  return new Set(map.archipel?.destroyed ?? []);
}

/** 🏝️ Où en est la conquête de l'île active, `null` hors du mode archipel. */
export function islandConquest(map: Pick<ExpeditionMap, 'archipel'> | null | undefined): {
  island: Island;
  objectivesDown: number;
  objectivesTotal: number;
  fortressDown: boolean;
  locked: boolean;
  pacified: boolean;
} | null {
  const isl = activeIsland(map);
  if (!isl || !map) return null;
  const gone = destroyedOf(map);
  const down = Array.from({ length: isl.objectives }, (_, i) => objectiveIdOf(i)).filter((id) =>
    gone.has(id),
  ).length;
  return {
    island: isl,
    objectivesDown: down,
    objectivesTotal: isl.objectives,
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
  objectiveAngles(isl.objectives).forEach((off, i) => {
    const id = objectiveIdOf(i);
    if (gone.has(id)) return;
    const a = f.angle + off;
    const d = ISLAND_CONQUEST.objectiveDist;
    out.push(
      enemyTarget(
        map,
        id,
        {
          x: Math.round(EXPE.town.x + Math.cos(a) * d),
          y: Math.round(EXPE.town.y + Math.sin(a) * d),
          d,
        },
        now,
        lv,
        {
          kind: 'objective',
          faction: isl.faction,
          size: objectiveSize(i, isl.objectives),
          name: isl.objective,
          emoji: isl.objectiveEmoji,
        },
      ),
    );
  });
  if (!gone.has(FORTRESS_ID)) {
    const down = Array.from({ length: isl.objectives }, (_, i) => objectiveIdOf(i)).filter((x) =>
      gone.has(x),
    ).length;
    const force = fortressForce(isl, down);
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
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
): ExpeditionMap {
  const isl = activeIsland(map);
  const want = isl ? expectedTargets(map, isl, now, playerLevel) : [];
  const wantIds = new Set(want.map((p) => p.id));
  let pois = map.pois;
  let changed = false;
  // 1. Ce qui ne doit plus être là (île abattue, mode quitté).
  if (pois.some((p) => isIslandTargetId(p.id) && !wantIds.has(p.id))) {
    pois = pois.filter((p) => !isIslandTargetId(p.id) || wantIds.has(p.id));
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
    if (p.level === w.level && same(next, c)) continue;
    pois = pois.map((q, j) => (j === k ? { ...p, level: w.level, control: next } : q));
    changed = true;
  }
  // 3. La règle de production de l'île sur chaque lieu fixe.
  pois = pois.map((p) => {
    const c = p.control;
    if (!c || !CONTROL.kinds.includes(c.kind)) return p;
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
  return changed ? { ...map, pois } : map;
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
  const destroyed = [...new Set([...(map.archipel.destroyed ?? []), id])];
  const all = [...Array.from({ length: isl.objectives }, (_, i) => objectiveIdOf(i)), FORTRESS_ID];
  const pacified = all.every((x) => destroyed.includes(x));
  const next: ExpeditionMap = {
    ...map,
    archipel: {
      ...map.archipel,
      destroyed,
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

/** 🏝️ Ce que la fiche dit d'un objectif ou de la forteresse. */
export function islandTargetLabel(
  map: ExpeditionMap | null | undefined,
  id: string,
): { title: string; detail: string } | null {
  const st = islandConquest(map);
  const p = map?.pois.find((x) => x.id === id);
  if (!st || !p?.control || !isIslandTargetId(id)) return null;
  const { island: isl, objectivesDown: down, objectivesTotal: n } = st;
  if (p.control.kind === 'objective')
    return {
      title: `${isl.objectiveEmoji} Objectif de l’île · ${down}/${n} abattus`,
      detail:
        `troupe de ${p.control.size} champions de référence · abattu, il ne revient pas` +
        ` · ${Math.min(ISLAND_CONQUEST.unlockAfter, n)} abattus ouvrent la forteresse, tous l’affaiblissent au plus bas.`,
    };
  const f = fortressForce(isl, down);
  return {
    title: f.locked
      ? `🔒 ${isl.fortress} · verrouillée (${down}/${Math.min(ISLAND_CONQUEST.unlockAfter, n)})`
      : `🏰 ${isl.fortress}`,
    detail:
      `troupe de ${f.size} champions de référence` +
      (down < n
        ? ` · chaque objectif abattu l’affaiblit (${down}/${n})`
        : ' · affaiblie au plus bas') +
      ' · abattue avec tous les objectifs : l’île est pacifiée, plus aucune attaque.',
  };
}
