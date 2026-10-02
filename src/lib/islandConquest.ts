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
import { CHARACTER_RANKS, rankStartLevel } from './characterRank';
import { mulberry32, seedOf } from './combat';
import { CONTROL, bankAt } from './controlPoints';
import { islandTerrain } from './islandTerrain';
import {
  ARCHIPEL_TRAVEL_LEVEL,
  EXPE,
  islandDistNorm,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type ExpeditionMessage,
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

/** 🏝️ Les DEUX AVANT-POSTES d'une île (étape 3) : deux de ses lieux fixes, posés sur la
 *  route base → forteresse. Tenus tous les deux, ils ouvrent les objectifs ; tenus, on en
 *  part plus près de la forteresse (sorties d'un point tenu). */
export const ISLAND_OUTPOSTS: readonly ControlKind[] = ['tower', 'training'];

/** Les deux avant-postes sont-ils tenus ? */
export function outpostsHeld(map: Pick<ExpeditionMap, 'pois'>): boolean {
  return ISLAND_OUTPOSTS.every((k) =>
    map.pois.some((p) => p.control?.kind === k && p.control.owner === 'player'),
  );
}

/** Où les avant-postes PEUVENT se poser (distance à la base, écart d'angle à l'axe base →
 *  forteresse) : le premier près de la base, le second à mi-chemin des objectifs (43). */
const OUTPOST_GEOM = {
  first: { d: [24, 27], off: [0, 0.3, -0.3, 0.5, -0.5] },
  second: { d: [35, 38], off: [0.35, -0.35, 0.55, -0.55, 0.75, -0.75] },
} as const;

/** 🏰 La forteresse est la DERNIÈRE GRANDE EXPÉDITION de l'île (décision de l'utilisateur,
 *  2026-10-02 : « mets-la plus loin si besoin ») : 3 h d'aller, seul lieu hors de la règle des
 *  4 h aller-retour (`ISLAND_MAX_LEG_MIN`). */
export const FORTRESS_LEG_MIN = 180;

/** 🏝️ Tenus tous les deux, les avant-postes servent de RELAIS : l'aller vers la forteresse
 *  repasse à 2 h, la limite ordinaire de l'île (option c, décision de l'utilisateur 2026-10-02). */
export const FORTRESS_RELAY_LEG_MIN = 120;

/** Où se posent les avant-postes : sur la route base → forteresse, le couple de places le plus
 *  DÉGAGÉ des autres lieux fixes (et l'un de l'autre). Déterministe. */
export function outpostSpots(
  map: Pick<ExpeditionMap, 'pois'>,
  islandId: number,
): Record<string, { x: number; y: number; d: number }> {
  const f = islandTerrain(islandId).fortress;
  const at = (d: number, off: number) => ({
    x: Math.round(EXPE.town.x + Math.cos(f.angle + off) * d),
    y: Math.round(EXPE.town.y + Math.sin(f.angle + off) * d),
    d,
  });
  // Les autres lieux fixes, et la place de CHAQUE objectif, abattu ou non : sinon abattre un
  // objectif déplacerait des avant-postes encore ennemis.
  const isl = ISLANDS.find((i) => i.id === islandId);
  const others: { x: number; y: number }[] = [
    ...map.pois.filter((p) => p.control && !ISLAND_OUTPOSTS.includes(p.control.kind)),
    ...objectiveAngles(isl?.objectives ?? 0).map((o) => at(ISLAND_CONQUEST.objectiveDist, o)),
  ];
  const gapTo = (s: { x: number; y: number }) =>
    Math.min(99, ...others.map((p) => Math.hypot(s.x - p.x, s.y - p.y)));
  const cands = (g: { d: readonly number[]; off: readonly number[] }) =>
    g.d.flatMap((d) => g.off.map((o) => at(d, o)));
  let best: [ReturnType<typeof at>, ReturnType<typeof at>] | null = null;
  let bestGap = -1;
  for (const a of cands(OUTPOST_GEOM.first))
    for (const b of cands(OUTPOST_GEOM.second)) {
      const g = Math.min(gapTo(a), gapTo(b), Math.hypot(a.x - b.x, a.y - b.y));
      if (g > bestGap) {
        bestGap = g;
        best = [a, b];
      }
    }
  return { [ISLAND_OUTPOSTS[0]!]: best![0], [ISLAND_OUTPOSTS[1]!]: best![1] };
}

/** La distance normalisée qui donne un aller de `min` minutes (niveau de trajet d'île). */
function distNormForLeg(min: number): number {
  return (min - EXPE.travelOneWayMinMin) / (EXPE.travelOneWayMaxMin - EXPE.travelOneWayMinMin);
}

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
export function islandConquest(
  map: (Pick<ExpeditionMap, 'archipel'> & Partial<Pick<ExpeditionMap, 'pois'>>) | null | undefined,
): {
  island: Island;
  /** 🏝️ Avant-postes tenus (sur 2). */
  outpostsHeld: number;
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
  const pois = map.pois ?? [];
  return {
    island: isl,
    outpostsHeld: ISLAND_OUTPOSTS.filter((k) =>
      pois.some((p) => p.control?.kind === k && p.control.owner === 'player'),
    ).length,
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
    // ⚠️ Plafonnée à 2 h d'aller (la forteresse, elle, est reposée à `FORTRESS_LEG_MIN`).
    distNorm: islandDistNorm(spot.d),
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
  // 🏝️ Les objectifs ne s'attaquent qu'une fois les deux avant-postes tenus.
  const objLocked = !outpostsHeld(map);
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
          ...(objLocked ? { locked: true } : {}),
        },
      ),
    );
  });
  if (!gone.has(FORTRESS_ID)) {
    const down = Array.from({ length: isl.objectives }, (_, i) => objectiveIdOf(i)).filter((x) =>
      gone.has(x),
    ).length;
    const force = fortressForce(isl, down);
    const relay = outpostsHeld(map);
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
    // 🏰 3 h d'aller ; les deux avant-postes tenus la ramènent à 2 h.
    out[out.length - 1]!.distNorm = distNormForLeg(
      relay ? FORTRESS_RELAY_LEG_MIN : FORTRESS_LEG_MIN,
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
    if (p.level === w.level && p.distNorm === w.distNorm && same(next, c)) continue;
    pois = pois.map((q, j) =>
      j === k ? { ...p, level: w.level, distNorm: w.distNorm, control: next } : q,
    );
    changed = true;
  }
  // 2 bis. 🏝️ Les AVANT-POSTES : marqués, et posés sur la route base → forteresse tant
  // qu'ils sont à l'ennemi et hors assaut (un point tenu ne bouge plus sous sa garnison).
  if (isl) {
    const spots = outpostSpots({ pois }, isl.id);
    pois = pois.map((p) => {
      const c = p.control;
      if (!c || !ISLAND_OUTPOSTS.includes(c.kind)) return p;
      const s = spots[c.kind]!;
      const move = c.owner === 'enemy' && !c.assault && (p.x !== s.x || p.y !== s.y);
      if (c.outpost && !move) return p;
      changed = true;
      return {
        ...p,
        ...(move ? { x: s.x, y: s.y, distNorm: islandDistNorm(s.d) } : {}),
        control: { ...c, outpost: true },
      };
    });
  } else if (pois.some((p) => p.control?.outpost)) {
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
        (PILLAGE_ISLANDS.has(isl.id)
          ? ' · tant qu’il tient, ses brigands pillent la réserve non récoltée de ta base et attaquent tes lieux fixes'
          : ' · tant qu’il tient, il attaque tes lieux fixes') +
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
