import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { advGearRoles } from '@/lib/advGear';
import type { Adventurer } from '@/lib/adventurers';
import {
  heroPartyCombatant,
  missionXpFor,
  partyAllies,
  type EscortKit,
  type PartyHero,
} from '@/lib/caravan';
import { combatPowerRaw, type Combatant } from '@/lib/combat';
import { controlFreeSeats, seatsOf } from '@/lib/controlPoints';
import { legFromSpot, readyGarrisons } from '@/lib/controlRoutes';
import { HERO_GARRISON_SEATS, RAZE_KINDS, type Poi } from '@/lib/expedition';
import {
  planExpeditions,
  type PlanMode,
  type PlannedTrip,
  type PlanUnit,
} from '@/lib/expeditionPlanner';
import { heroPostOf } from '@/lib/islandConquest';
import { planReposition, type RepoUnit } from '@/lib/repositionPlanner';
import { partyHeroBlocker, partyLegMin, partySendBlocker } from '@/lib/party';
import { FORECAST_SAMPLES, partyWinChance } from '@/lib/partyForecast';
import type { BaseState } from '@/lib/raid';
import { withRiftCut } from '@/lib/rift';

type R<T> = Readonly<Ref<T>> | ComputedRef<T>;

/** Ce que la carte connaît déjà et que le planificateur lit. */
export interface PlannerCtx {
  /** Les lieux qu'on peut proposer (la page les filtre : visibles, libres, attaquables). */
  targets: R<Poi[]>;
  /** Les champions libres à la base. */
  freeStable: R<Adventurer[]>;
  now: R<number>;
  coarseNow: R<number>;
  heroLevel: R<number>;
  progressionLevel: R<number>;
  fighter: R<Combatant>;
  heroHealIn: R<number>;
  outpostBuilt: R<boolean>;
  travelMult: R<number>;
  roadCtx: R<EscortKit>;
  base: R<BaseState | null>;
  /** Le plafond d'engagement du Panthéon. */
  cap: R<number>;
  settleDueSiege: () => Promise<void>;
}

/** Taille d'équipe au plus essayée : au-delà, une proposition n'a plus de sens (tanière). */
const MAX_TEAM = 8;
const THRESHOLD_KEY = 'muscu:planner:threshold';
const MODE_KEY = 'muscu:planner:mode';
const GARRISON_KEY = 'muscu:planner:garrisons';

function readNum(key: string, def: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : def;
  } catch {
    return def;
  }
}
function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* navigation privée : sans mémoire */
  }
}

/** 🧭 Un déplacement proposé : des champions (et/ou le héros) d'un endroit vers un autre. */
export interface RepoMoveRow {
  key: string;
  /** D'où ils partent (null = la base). */
  from: Poi | null;
  /** Où ils vont (null = la base). */
  to: Poi | null;
  advs: Adventurer[];
  hero: boolean;
  /** Le plus long des trajets du groupe (minutes). */
  min: number;
}
/** 🧭 Ce que la répartition change pour une équipe. */
export interface RepoTeamRow {
  key: string;
  poi: Poi;
  advs: Adventurer[];
  hero: boolean;
  /** D'où l'équipe partira (null = la base). */
  origin: Poi | null;
  tripMin: number;
  /** L'aller-retour sans rien changer (null : l'équipe est aujourd'hui dispersée). */
  nowTripMin: number | null;
  moveMin: number;
}
/** Sur combien d'expéditions un déplacement doit se rentabiliser. */
const REPO_PAYBACK = 3;

export interface PlannerRow {
  key: string;
  poi: Poi;
  /** Champions de l'équipe (héros non compris). */
  advs: Adventurer[];
  hero: boolean;
  /** `null` = la base ; sinon le point tenu d'où part la sortie. */
  from: Poi | null;
  win: number;
  tripMin: number;
  xp: number;
}

/**
 * 🪄 LE PLANIFICATEUR SUR LA CARTE : réglages (seuil, optimisation, garnisons, héros),
 * calcul par morceaux (le navigateur garde la main), et lancement — un départ ou tous.
 * ⚠️ Lancer passe par `char.sendParty`, LE chemin d'envoi de l'écran : mêmes refus, même
 * pronostic. Le planificateur propose, le store décide.
 */
export function useExpeditionPlanner(ctx: PlannerCtx) {
  const $q = useQuasar();
  const auth = useAuthStore();
  const char = useCharacterStore();

  const threshold = ref(Math.min(99, Math.max(50, readNum(THRESHOLD_KEY, 90))));
  const mode = ref<PlanMode>(readStr(MODE_KEY) === 'xp' ? 'xp' : 'events');
  const withGarrisons = ref(readStr(GARRISON_KEY) === '1');
  const withHero = ref(true);
  watch(threshold, (v) => save(THRESHOLD_KEY, String(v)));
  watch(mode, (v) => save(MODE_KEY, v));
  watch(withGarrisons, (v) => save(GARRISON_KEY, v ? '1' : '0'));

  const running = ref(false);
  const progress = ref(0);
  const rows = ref<PlannerRow[] | null>(null);
  const unreachable = ref<Poi[]>([]);
  const launching = ref<string | null>(null);
  let run = 0;

  const heroObj = (): PartyHero => ({
    name: char.row?.pseudo ?? 'Toi',
    level: ctx.heroLevel.value,
    combatant: ctx.fighter.value,
  });
  /** Le héros peut-il partir (hors filon, vérifié lieu par lieu) ? */
  const heroFree = computed(
    () =>
      !partyHeroBlocker({
        onExpedition: char.heroEngaged,
        healMs: ctx.heroHealIn.value,
        outpost: ctx.outpostBuilt.value,
        poi: null,
      }),
  );

  /** Combien partiraient : la base, les garnisons prêtes (si on les inclut), le héros. */
  const poolInfo = computed(() => {
    let garrison = 0;
    for (const ready of readyGarrisons(
      char.row?.expedition_map,
      char.advList,
      ctx.now.value,
    ).values())
      garrison += ready.length;
    return { base: ctx.freeStable.value.length, garrison };
  });

  async function compute() {
    const me = ++run;
    running.value = true;
    progress.value = 0;
    rows.value = null;
    unreachable.value = [];
    repoTeams.value = null;
    repoMoves.value = [];
    try {
      const now = ctx.coarseNow.value;
      const map = char.row?.expedition_map;
      const road = ctx.roadCtx.value;
      const base = ctx.base.value;
      const byId = new Map<string, Adventurer>();
      const points = new Map<string, Poi>();
      const power = (a: Adventurer) => combatPowerRaw(partyAllies([a], road, null)[0]!.combatant);
      const units: PlanUnit[] = [];
      for (const a of ctx.freeStable.value) {
        byId.set(a.id, a);
        units.push({ id: a.id, hero: false, origin: 'base', power: power(a) });
      }
      if (withGarrisons.value)
        for (const [pid, ready] of readyGarrisons(map, char.advList, ctx.now.value)) {
          const p = map?.pois.find((q) => q.id === pid);
          if (!p) continue;
          points.set(pid, p);
          for (const a of ready) {
            byId.set(a.id, a);
            units.push({ id: a.id, hero: false, origin: pid, power: power(a) });
          }
        }
      const hero = withHero.value && heroFree.value ? heroObj() : null;
      if (hero) {
        const post = heroPostOf(map);
        if (post) points.set(post.id, post);
        units.push({
          id: '__hero',
          hero: true,
          origin: post?.id ?? 'base',
          power: combatPowerRaw(heroPartyCombatant(hero)),
        });
      }
      const advsOf = (us: PlanUnit[]) => us.filter((u) => !u.hero).map((u) => byId.get(u.id)!);
      const hasHero = (us: PlanUnit[]) => us.some((u) => u.hero);
      const targets = ctx.targets.value;
      const total = Math.max(1, targets.length * 6);
      let done = 0;
      const res = await planExpeditions(targets, units, {
        threshold: threshold.value / 100,
        mode: mode.value,
        maxTeam: MAX_TEAM,
        cancelled: () => me !== run,
        pause: async () => {
          done++;
          progress.value = Math.min(0.95, done / total);
          await new Promise((r) => setTimeout(r, 0));
        },
        deps: {
          fits: (t, us) => {
            const h = hasHero(us);
            if (h && partyHeroBlocker({ onExpedition: false, healMs: 0, outpost: true, poi: t }))
              return false;
            return !partySendBlocker(
              withRiftCut(t, base),
              advsOf(us).length,
              h,
              ctx.cap.value,
              1,
              now,
            );
          },
          win: (t, us) =>
            partyWinChance(
              withRiftCut(t, base),
              advsOf(us),
              road,
              hasHero(us) ? hero : null,
              now,
              FORECAST_SAMPLES,
            ),
          tripMin: (t, us) => {
            const advs = advsOf(us);
            const legOf = (p: Poi) =>
              partyLegMin(p, advs, {
                hero: hasHero(us),
                travelMult: ctx.travelMult.value,
                gearSpeed: advGearRoles(advs, road.advGear).speed,
              });
            const from = points.get(us[0]!.origin);
            return 2 * (from ? legFromSpot(t, from, legOf) : legOf(t));
          },
          xp: (t, us) =>
            Object.values(
              missionXpFor(advsOf(us), t, true, {}, char.pantheonLevel, hasHero(us), null),
            ).reduce((s, x) => s + x, 0),
        },
      });
      if (!res || me !== run) return;
      rows.value = res.trips.map((tr: PlannedTrip<Poi>) => ({
        key: `${tr.target.id}|${tr.units.map((u) => u.id).join(',')}`,
        poi: tr.target,
        advs: advsOf(tr.units),
        hero: hasHero(tr.units),
        from: points.get(tr.units[0]!.origin) ?? null,
        win: tr.win,
        tripMin: tr.tripMin,
        xp: Math.round(tr.xp),
      }));
      unreachable.value = res.unreachable;
      progress.value = 1;
    } finally {
      if (me === run) running.value = false;
    }
  }

  /**
   * 🧭 RÉPARTIR champions et héros sur la base et les lieux fixes tenus pour raccourcir les
   * expéditions (demandé le 2026-10-11). Les ÉQUIPES viennent du planificateur, en mode
   * événements, au seuil réglé, tout le monde mis en commun (où qu'il soit) ; puis
   * `planReposition` cherche d'où chacune partira le plus vite, le déplacement amorti sur
   * `REPO_PAYBACK` expéditions. Pas de miliciens : ils ne partent pas en expédition.
   */
  const repoTeams = ref<RepoTeamRow[] | null>(null);
  const repoMoves = ref<RepoMoveRow[]>([]);
  const repoRunning = ref(false);
  async function repartir() {
    const me = ++run;
    repoRunning.value = true;
    rows.value = null;
    unreachable.value = [];
    repoTeams.value = null;
    repoMoves.value = [];
    try {
      const now = ctx.coarseNow.value;
      const map = char.row?.expedition_map;
      const road = ctx.roadCtx.value;
      const base = ctx.base.value;
      const byId = new Map<string, Adventurer>();
      const loc = new Map<string, string>();
      const power = (a: Adventurer) => combatPowerRaw(partyAllies([a], road, null)[0]!.combatant);
      const units: PlanUnit[] = [];
      const add = (a: Adventurer, at: string) => {
        byId.set(a.id, a);
        loc.set(a.id, at);
        units.push({ id: a.id, hero: false, origin: 'pool', power: power(a) });
      };
      for (const a of ctx.freeStable.value) add(a, 'base');
      for (const [pid, ready] of readyGarrisons(map, char.advList, ctx.now.value))
        for (const a of ready) add(a, pid);
      const hero = withHero.value && heroFree.value ? heroObj() : null;
      if (hero) {
        loc.set('__hero', heroPostOf(map)?.id ?? 'base');
        units.push({
          id: '__hero',
          hero: true,
          origin: 'pool',
          power: combatPowerRaw(heroPartyCombatant(hero)),
        });
      }
      const held = (map?.pois ?? []).filter(
        (p) => p.control?.owner === 'player' && !RAZE_KINDS.has(p.control.kind),
      );
      const points = new Map(held.map((p) => [p.id, p]));
      const advsOf = (us: readonly { id: string; hero: boolean }[]) =>
        us.filter((u) => !u.hero).map((u) => byId.get(u.id)!);
      const hasHero = (us: readonly { hero: boolean }[]) => us.some((u) => u.hero);
      const legOf = (advs: Adventurer[], h: boolean) => (p: Poi) =>
        partyLegMin(p, advs, {
          hero: h,
          travelMult: ctx.travelMult.value,
          gearSpeed: advGearRoles(advs, road.advGear).speed,
        });
      const tripFrom = (t: Poi, us: readonly { id: string; hero: boolean }[], origin: string) => {
        const lo = legOf(advsOf(us), hasHero(us));
        const from = points.get(origin);
        return 2 * (from ? legFromSpot(t, from, lo) : lo(t));
      };
      const res = await planExpeditions(ctx.targets.value, units, {
        threshold: threshold.value / 100,
        mode: 'events',
        maxTeam: MAX_TEAM,
        cancelled: () => me !== run,
        pause: () => new Promise((r) => setTimeout(r, 0)),
        deps: {
          fits: (t, us) => {
            const h = hasHero(us);
            if (h && partyHeroBlocker({ onExpedition: false, healMs: 0, outpost: true, poi: t }))
              return false;
            return !partySendBlocker(
              withRiftCut(t, base),
              advsOf(us).length,
              h,
              ctx.cap.value,
              1,
              now,
            );
          },
          win: (t, us) =>
            partyWinChance(
              withRiftCut(t, base),
              advsOf(us),
              road,
              hasHero(us) ? hero : null,
              now,
              FORECAST_SAMPLES,
            ),
          tripMin: (t, us) => tripFrom(t, us, 'base'),
          xp: () => 0,
        },
      });
      if (!res || me !== run) return;
      const teams = res.trips.map((tr) => ({
        target: tr.target,
        units: tr.units.map((u): RepoUnit => ({ id: u.id, hero: u.hero, loc: loc.get(u.id)! })),
      }));
      const free: Record<string, number> = {};
      for (const p of held) free[p.id] = controlFreeSeats(p.control);
      const plan = planReposition(
        teams,
        {
          tripMin: (team, origin) => tripFrom(team.target, team.units, origin),
          moveMin: (u, to) => {
            const lo = legOf(u.hero ? [] : [byId.get(u.id)!], u.hero);
            const from = points.get(u.loc);
            if (to === 'base') return from ? lo(from) : 0;
            const dest = points.get(to)!;
            return from ? legFromSpot(dest, from, lo) : lo(dest);
          },
          canHost: (u, to) =>
            to === 'base' ||
            seatsOf(points.get(to)!.control!.kind) >= (u.hero ? HERO_GARRISON_SEATS : 1),
        },
        { free, payback: REPO_PAYBACK },
      );
      repoTeams.value = plan.assignments.map((a) => ({
        key: `${a.team.target.id}|${a.team.units.map((u) => u.id).join(',')}`,
        poi: a.team.target,
        advs: advsOf(a.team.units),
        hero: hasHero(a.team.units),
        origin: points.get(a.origin) ?? null,
        tripMin: a.tripMin,
        nowTripMin: a.nowTripMin,
        moveMin: a.moveMin,
      }));
      // Un geste par (départ, arrivée) pour tout le groupe ; le héros à part.
      const groups = new Map<string, RepoMoveRow>();
      for (const m of plan.moves) {
        const key = m.unit.hero ? `hero|${m.to}` : `${m.from}>${m.to}`;
        const g = groups.get(key) ?? {
          key,
          from: points.get(m.from) ?? null,
          to: points.get(m.to) ?? null,
          advs: [],
          hero: m.unit.hero,
          min: 0,
        };
        if (!m.unit.hero) g.advs.push(byId.get(m.unit.id)!);
        g.min = Math.max(g.min, m.min);
        groups.set(key, g);
      }
      repoMoves.value = [...groups.values()].sort((a, b) => a.min - b.min);
    } finally {
      if (me === run) repoRunning.value = false;
    }
  }

  /** Exécute UN déplacement. Rend la raison d'un refus (`null` = parti). */
  async function moveOne(m: RepoMoveRow): Promise<string | null> {
    const uid = auth.user?.id;
    if (!uid) return 'non connecté';
    const now = Date.now();
    const ids = m.advs.map((a) => a.id);
    if (m.hero) {
      if (m.to) return char.sendHeroToPost(uid, m.to.id, now, heroObj());
      await char.recallHeroFromPost(uid, now);
      return null;
    }
    if (!m.from) return m.to ? char.reinforceControlPoint(uid, m.to.id, ids, now) : null;
    if (!m.to) {
      await char.releaseControlChampions(uid, m.from.id, ids, now, ctx.heroLevel.value);
      return null;
    }
    return char.transferControlGarrison(uid, m.from.id, m.to.id, ids, now, ctx.heroLevel.value);
  }

  async function launchMove(m: RepoMoveRow) {
    if (launching.value) return;
    launching.value = m.key;
    try {
      const refused = await moveOne(m);
      if (refused) $q.notify({ type: 'negative', message: `Déplacement impossible : ${refused}.` });
      else repoMoves.value = repoMoves.value.filter((x) => x.key !== m.key);
    } finally {
      launching.value = null;
    }
  }

  async function launchAllMoves() {
    if (launching.value || !repoMoves.value.length) return;
    launching.value = '*';
    let ok = 0;
    const refusals: string[] = [];
    try {
      // ⚠️ Les départs d'un lieu d'abord : ils y libèrent les places que les arrivées prendront.
      const order = [...repoMoves.value].sort((a, b) => Number(!a.from) - Number(!b.from));
      for (const m of order) {
        const refused = await moveOne(m);
        if (refused) refusals.push(refused);
        else {
          ok++;
          repoMoves.value = repoMoves.value.filter((x) => x.key !== m.key);
        }
      }
    } finally {
      launching.value = null;
    }
    $q.notify(
      refusals.length
        ? {
            type: ok ? 'warning' : 'negative',
            message: `${ok} déplacement(s), ${refusals.length} refusé(s) : ${refusals[0]}.`,
          }
        : { type: 'positive', message: `🧭 ${ok} déplacement(s) lancé(s).` },
    );
  }

  /** Oublie la proposition (la carte a bougé, ou un réglage a changé). */
  function reset() {
    run++;
    running.value = false;
    rows.value = null;
    unreachable.value = [];
    repoRunning.value = false;
    repoTeams.value = null;
    repoMoves.value = [];
  }
  watch([threshold, mode, withGarrisons, withHero], reset);

  /** Lance UNE proposition. Rend la raison d'un refus (`null` = parti). */
  async function sendRow(r: PlannerRow): Promise<string | null> {
    const uid = auth.user?.id;
    if (!uid) return 'non connecté';
    return char.sendParty(uid, r.poi, {
      hero: r.hero ? heroObj() : null,
      escortIds: r.advs.map((a) => a.id),
      // Même règle que l'écran d'envoi : avec le héros, son niveau de progression.
      playerLevel: r.hero ? ctx.progressionLevel.value : ctx.heroLevel.value,
      now: Date.now(),
      ...(r.from ? { fromControlId: r.from.id } : {}),
    });
  }

  async function launch(r: PlannerRow) {
    if (launching.value) return;
    launching.value = r.key;
    try {
      await ctx.settleDueSiege();
      const refused = await sendRow(r);
      if (refused) $q.notify({ type: 'negative', message: `Départ impossible : ${refused}.` });
      else if (rows.value) rows.value = rows.value.filter((x) => x.key !== r.key);
    } finally {
      launching.value = null;
    }
  }

  async function launchAll() {
    if (launching.value || !rows.value?.length) return;
    launching.value = '*';
    let ok = 0;
    const refusals: string[] = [];
    try {
      await ctx.settleDueSiege();
      for (const r of [...(rows.value ?? [])]) {
        const refused = await sendRow(r);
        if (refused) refusals.push(refused);
        else {
          ok++;
          rows.value = (rows.value ?? []).filter((x) => x.key !== r.key);
        }
      }
    } finally {
      launching.value = null;
    }
    $q.notify(
      refusals.length
        ? {
            type: ok ? 'warning' : 'negative',
            message: `${ok} expédition(s) lancée(s), ${refusals.length} refusée(s) : ${refusals[0]}.`,
          }
        : { type: 'positive', message: `🪄 ${ok} expédition(s) lancée(s).` },
    );
  }

  return {
    threshold,
    mode,
    withGarrisons,
    withHero,
    heroFree,
    poolInfo,
    running,
    progress,
    rows,
    unreachable,
    launching,
    compute,
    reset,
    launch,
    launchAll,
    repoTeams,
    repoMoves,
    repoRunning,
    repartir,
    launchMove,
    launchAllMoves,
  };
}
