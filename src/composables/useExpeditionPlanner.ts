import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { advGearRoles } from '@/lib/advGear';
import { advXpRoom, type Adventurer } from '@/lib/adventurers';
import {
  heroPartyCombatant,
  missionXpFor,
  partyAllies,
  type EscortKit,
  type PartyHero,
} from '@/lib/caravan';
import { combatPowerRaw, type Combatant } from '@/lib/combat';
import { deployAnchors, legFromSpot, readyGarrisons } from '@/lib/controlRoutes';
import { type Poi } from '@/lib/expedition';
import { mapOutpostLevel } from '@/lib/archipelago';
import { buildDeploymentAsync } from '@/lib/deployPlan';
import {
  planExpeditions,
  withoutEngaged,
  type PlanMode,
  type PlannedTrip,
  type PlanUnit,
} from '@/lib/expeditionPlanner';
import { heroPostOf, heroSeatOf } from '@/lib/islandConquest';
import { type DeployUnit } from '@/lib/mapDeployment';
import {
  partyHeroBlocker,
  partyLegMin,
  partySendBlocker,
  supplyTarget,
  usefulSupplies,
} from '@/lib/party';
import {
  planReplay,
  replayDeps,
  waveFromRows,
  waveKeyLabel,
  type ReplayWorld,
} from '@/lib/lastWave';
import { FORECAST_SAMPLES, partyWinChance } from '@/lib/partyForecast';
import { healableForDeploy, type BaseState } from '@/lib/raid';
import { riftsByUrgency, withRiftCut } from '@/lib/rift';
import { SUPPLIES, SUPPLY_IDS, type SupplyId } from '@/lib/supplies';

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
const SUPPLY_KEY = 'muscu:planner:supplies';

/** 🕳️ Mode « Failles » : seulement les failles, la plus urgente d'abord ; sinon tous les lieux. */
const planTargets = (pois: Poi[], mode: PlanMode): Poi[] =>
  mode === 'rifts' ? riftsByUrgency(pois) : pois;

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
/** 🧭 Un endroit de la répartition et ceux qui s'y trouveront. */
export interface RepoTeamRow {
  key: string;
  /** null = la base. */
  spot: Poi | null;
  advs: Adventurer[];
  hero: boolean;
  /** ⏳ Ceux qui y sont déjà attendus et qu'on ne bouge pas (ids ; héros compris). */
  fixed: Set<string>;
}
/** 🧭 Ce qui manque pour une répartition complète. */
export interface RepoMissing {
  hero: boolean;
  advs: Adventurer[];
}

export interface PlannerRow {
  key: string;
  poi: Poi;
  /** Champions de l'équipe (héros non compris). */
  advs: Adventurer[];
  hero: boolean;
  /** `null` = la base ; sinon le point tenu d'où part la sortie. */
  from: Poi | null;
  /** ⚔️ Attaque COMBINÉE : un groupe par point de départ (`null` = un seul endroit, `from`). */
  wings: { from: Poi | null; advs: Adventurer[]; hero: boolean }[] | null;
  win: number;
  tripMin: number;
  xp: number;
  /** 🎒 Les consommables emportés (déjà comptés dans le 🎯 % et le trajet). */
  supplies: SupplyId[];
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
  const savedMode = readStr(MODE_KEY);
  const mode = ref<PlanMode>(savedMode === 'xp' || savedMode === 'rifts' ? savedMode : 'events');
  const withGarrisons = ref(readStr(GARRISON_KEY) === '1');
  const withHero = ref(true);
  watch(threshold, (v) => save(THRESHOLD_KEY, String(v)));
  watch(mode, (v) => save(MODE_KEY, v));
  watch(withGarrisons, (v) => save(GARRISON_KEY, v ? '1' : '0'));
  /** 🎒 Les consommables que le joueur AUTORISE dans les simulations (demandé : « pouvoir
   *  rajouter des consommables sur les simulations d'optimisation des expéditions »). Rien par
   *  défaut : on ne dépense jamais un objet que le joueur n'a pas choisi d'engager. */
  const allowedSupplies = ref<SupplyId[]>(
    (readStr(SUPPLY_KEY) ?? '')
      .split(',')
      .filter((id): id is SupplyId => (SUPPLY_IDS as readonly string[]).includes(id)),
  );
  watch(allowedSupplies, (v) => save(SUPPLY_KEY, v.join(',')));
  /** Le stock emportable (consommables de VOYAGE en stock), tuile par tuile. Un consommable
   *  qui ne part pas en voyage (sceau, boost, tome) n'y figure pas : il ne sert à aucune
   *  simulation. */
  const supplyStock = computed(() => {
    const stock = char.row?.supplies ?? {};
    return SUPPLY_IDS.filter((id) => SUPPLIES[id].voyage && (stock[id] ?? 0) > 0).map((id) => ({
      id,
      def: SUPPLIES[id],
      n: stock[id]!,
      on: allowedSupplies.value.includes(id),
    }));
  });
  function toggleSupply(id: SupplyId) {
    allowedSupplies.value = allowedSupplies.value.includes(id)
      ? allowedSupplies.value.filter((x) => x !== id)
      : [...allowedSupplies.value, id];
  }

  const running = ref(false);
  const progress = ref(0);
  const rows = ref<PlannerRow[] | null>(null);
  const unreachable = ref<Poi[]>([]);
  const launching = ref<string | null>(null);
  // Deux calculs indépendants (deux panneaux sur la carte) : chacun son compteur.
  let run = 0;
  let repoRun = 0;

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
  /** 🪄 Au moins un effectif hors milicien disponible (2026-10-11, demandé) : le héros, un
   *  champion à la base ou dans une garnison prête. Sinon le planificateur n'a personne à
   *  envoyer. ⚠️ Compte les garnisons même si l'option est décochée : on peut la cocher. */
  const anyForceFree = computed(
    () => heroFree.value || poolInfo.value.base + poolInfo.value.garrison > 0,
  );

  async function compute() {
    const me = ++run;
    running.value = true;
    progress.value = 0;
    rows.value = null;
    unreachable.value = [];
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
      /** L'équipe, groupe par groupe (un par point de départ). */
      const groupsOf = (us: PlanUnit[]) => {
        const by = new Map<string, PlanUnit[]>();
        for (const u of us) by.set(u.origin, [...(by.get(u.origin) ?? []), u]);
        return [...by];
      };
      const targets = planTargets(ctx.targets.value, mode.value);
      const total = Math.max(1, targets.length * 6);
      let done = 0;
      // 🎒 Le stock des consommables autorisés : jamais plus que ce qu'on possède.
      const owned = char.row?.supplies ?? {};
      const stock: Record<string, number> = {};
      for (const r of supplyStock.value) if (r.on) stock[r.id] = owned[r.id] ?? 0;
      const sup = (kit: readonly string[]) => kit as readonly SupplyId[];
      const res = await planExpeditions(targets, units, {
        threshold: threshold.value / 100,
        mode: mode.value,
        maxTeam: MAX_TEAM,
        stock,
        cancelled: () => me !== run,
        // ⚔️ Des garnisons en jeu : une équipe peut se réunir de plusieurs endroits.
        combined: withGarrisons.value,
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
          // 🎒 Les consommables autorisés qui SERVENT là (le planificateur n'en retient que le
          // minimum, et seulement si l'effectif ne passe pas le seuil)
          // (`usefulSupplies`, la règle de la tuile grisée et du refus du store).
          kit: (t, us, avail) =>
            usefulSupplies(
              sup(avail),
              supplyTarget(withRiftCut(t, base), hasHero(us), advsOf(us).length),
            ),
          win: (t, us, kit) =>
            partyWinChance(
              withRiftCut(t, base),
              advsOf(us),
              { ...road, supplies: [...sup(kit)] },
              hasHero(us) ? hero : null,
              now,
              FORECAST_SAMPLES,
            ),
          // ⚔️ Plusieurs points de départ (attaque combinée) : chaque groupe à son pas, depuis
          // chez lui ; tout le monde arrive ensemble, donc l'aller-retour du plus lent.
          tripMin: (t, us, kit) =>
            Math.max(
              ...groupsOf(us).map(([origin, g]) => {
                const advs = advsOf(g);
                const legOf = (p: Poi) =>
                  partyLegMin(p, advs, {
                    hero: hasHero(g),
                    travelMult: ctx.travelMult.value,
                    gearSpeed: advGearRoles(advs, road.advGear).speed,
                    supplies: sup(kit),
                  });
                const from = points.get(origin);
                return 2 * (from ? legFromSpot(t, from, legOf) : legOf(t));
              }),
            ),
          // 🧑‍✈️ Seule l'XP que chacun peut ENCORE prendre (`advXpRoom`) : un champion qui a
          // rattrapé le héros n'apprend plus rien, le mode « XP » ne doit pas le compter.
          xp: (t, us) => {
            const team = advsOf(us);
            const got = missionXpFor(
              team,
              t,
              true,
              {},
              char.pantheonLevel,
              hasHero(us),
              null,
              char.heroLevel,
            );
            return team.reduce(
              (s, a) => s + Math.min(got[a.id] ?? 0, advXpRoom(a, char.heroLevel)),
              0,
            );
          },
        },
      });
      if (!res || me !== run) return;
      rows.value = res.trips.map((tr: PlannedTrip<Poi>) => ({
        key: `${tr.target.id}|${tr.units.map((u) => u.id).join(',')}`,
        poi: tr.target,
        advs: advsOf(tr.units),
        hero: hasHero(tr.units),
        from: points.get(tr.units[0]!.origin) ?? null,
        wings:
          groupsOf(tr.units).length > 1
            ? groupsOf(tr.units).map(([origin, g]) => ({
                from: points.get(origin) ?? null,
                advs: advsOf(g),
                hero: hasHero(g),
              }))
            : null,
        win: tr.win,
        tripMin: tr.tripMin,
        xp: Math.round(tr.xp),
        supplies: [...sup(tr.kit)],
      }));
      unreachable.value = res.unreachable;
      progress.value = 1;
    } finally {
      if (me === run) running.value = false;
    }
  }

  /**
   * 🧭 RÉPARTIR TOUT L'EFFECTIF SUR LA CARTE — SANS RÉGLAGE (refonte 2026-10-14, demandé :
   * « quand je fais auto, ça me répartit les effectifs au mieux »). Les plus forts là où ils
   * rejoignent le plus vite n'importe quel point de l'île en attaque combinée — seul objectif.
   * On part de ZÉRO : lieux vidés, tout le monde redispatché (cf. `mapDeployment.ts`) — sauf ceux
   * qu'on ne peut pas bouger (en route, à l'infirmerie, en sortie : `deployAnchors`), comptés là
   * où ils seront ; la répartition se fait autour d'eux (2026-10-15, demandé). La défense des
   * lieux, ce sont les miliciens. Le héros est déplacé s'il est libre. Il n'attaque rien.
   */
  const repoTeams = ref<RepoTeamRow[] | null>(null);
  const repoMoves = ref<RepoMoveRow[]>([]);
  const repoRunning = ref(false);

  /** Qui n'est pas disponible (en route, à l'infirmerie…) : la répartition l'ignorerait. */
  const repoMissing = computed<RepoMissing>(() => {
    const ok = new Set(ctx.freeStable.value.map((a) => a.id));
    for (const ready of readyGarrisons(
      char.row?.expedition_map,
      char.advList,
      ctx.now.value,
    ).values())
      for (const a of ready) ok.add(a.id);
    return { hero: !heroFree.value, advs: char.advList.filter((a) => !ok.has(a.id)) };
  });

  /** 🏥 Ceux qu'un soin d'urgence rendrait disponibles pour la répartition, et son prix. */
  const repoHealable = computed(() => {
    const h = healableForDeploy(char.advList, ctx.now.value, ctx.heroLevel.value);
    const gold = char.row?.gold ?? 0;
    return { ...h, gold, afford: gold >= h.cost };
  });

  /**
   * 🏥 SOIGNER PUIS RÉPARTIR (2026-10-15, demandé : « s'il accepte, on les soigne en payant avec
   * l'or s'il en a suffisamment, et on les répartit ; s'il refuse, on les laisse à
   * l'infirmerie »). Le soin passe par `char.healAdventurers`, le geste de l'Infirmerie (mêmes
   * prix, même refus faute d'or). Soignés à `ctx.now` : la carte les voit libres aussitôt.
   */
  async function healThenRepartir() {
    const uid = auth.user?.id;
    const h = repoHealable.value;
    if (!uid || !h.advs.length) return repartir();
    try {
      await char.healAdventurers(
        uid,
        h.advs.map((a) => a.id),
        ctx.now.value,
        ctx.heroLevel.value,
      );
    } catch (e) {
      $q.notify({ type: 'negative', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    await repartir();
  }

  async function repartir() {
    const me = ++repoRun;
    repoRunning.value = true;
    repoTeams.value = null;
    repoMoves.value = [];
    try {
      // Le navigateur garde la main avant le calcul.
      await new Promise((r) => setTimeout(r, 0));
      if (me !== repoRun) return;
      const map = char.row?.expedition_map;
      const road = ctx.roadCtx.value;
      const garrisons = readyGarrisons(map, char.advList, ctx.now.value);
      // ⏳ Ceux qu'on ne peut pas bouger restent là où ils seront : on place les autres autour.
      const ready = new Set(ctx.freeStable.value.map((a) => a.id));
      for (const list of garrisons.values()) for (const a of list) ready.add(a.id);
      const out = await buildDeploymentAsync({
        map,
        atBase: ctx.freeStable.value,
        garrisons,
        fixed: deployAnchors(map, char.advList, ready),
        hero: {
          party: heroObj(),
          // 🧝 Là où il a SA PLACE (posté, en route, ou en sortie qui la lui garde) : elle compte.
          loc: heroSeatOf(map)?.id ?? 'base',
          ...(heroFree.value ? {} : { fixed: true }),
        },
        road,
        heroLevel: ctx.heroLevel.value,
        travelMult: ctx.travelMult.value,
        outpostLevel: mapOutpostLevel(map, char.comptoirLevel),
      });
      // Un autre calcul a pu partir pendant celui-ci (il rend la main à l'écran) : on se tait.
      if (me !== repoRun) return;
      if (!out) {
        repoTeams.value = [];
        return;
      }
      const { plan, units, spots, points, byId } = out;
      repoTeams.value = spots
        .map((s) => {
          const here = units.filter((u) => plan.spotOf.get(u.id) === s.id);
          return {
            key: s.id,
            spot: points.get(s.id) ?? null,
            advs: here
              .filter((u) => !u.hero)
              .sort((a, b) => b.power - a.power)
              .map((u) => byId.get(u.id)!),
            hero: here.some((u) => u.hero),
            fixed: new Set(here.filter((u) => u.fixed).map((u) => u.id)),
          };
        })
        .filter((t) => t.advs.length || t.hero);
      // Un geste par (départ, arrivée) pour tout le groupe ; le héros à part.
      const moveMin = (u: DeployUnit, to: string) => {
        const lo = (p: Poi) =>
          partyLegMin(p, u.hero ? [] : [byId.get(u.id)!], {
            hero: u.hero,
            travelMult: ctx.travelMult.value,
            gearSpeed: u.hero ? 0 : advGearRoles([byId.get(u.id)!], road.advGear).speed,
          });
        const from = points.get(u.loc);
        if (to === 'base') return from ? lo(from) : 0;
        const dest = points.get(to)!;
        return from ? legFromSpot(dest, from, lo) : lo(dest);
      };
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
        g.min = Math.max(g.min, moveMin(m.unit, m.to));
        groups.set(key, g);
      }
      repoMoves.value = [...groups.values()].sort((a, b) => a.min - b.min);
    } finally {
      if (me === repoRun) repoRunning.value = false;
    }
  }

  /**
   * ✅ VALIDER LA RÉPARTITION : tout le monde part d'un coup (`char.redeployGarrisons`, une
   * seule écriture). ⚠️ Plus de déplacements un par un (2026-10-11, signalé : « pas assez de
   * place sur les lieux ») : deux lieux pleins qui s'échangent des champions se bloquaient.
   */
  async function launchAllMoves() {
    const uid = auth.user?.id;
    if (!uid || launching.value || !repoMoves.value.length) return;
    launching.value = '*';
    let refused: string | null;
    try {
      refused = await char.redeployGarrisons(
        uid,
        repoMoves.value.map((m) => ({
          fromId: m.from?.id ?? null,
          toId: m.to?.id ?? null,
          ids: m.advs.map((a) => a.id),
          hero: m.hero,
        })),
        Date.now(),
        ctx.heroLevel.value,
        heroObj(),
      );
    } finally {
      launching.value = null;
    }
    if (refused) {
      $q.notify({ type: 'negative', message: `Répartition impossible : ${refused}.` });
      return;
    }
    repoMoves.value = [];
  }

  /** Oublie la proposition (la carte a bougé, ou un réglage a changé). */
  function reset() {
    run++;
    running.value = false;
    rows.value = null;
    unreachable.value = [];
  }
  watch([threshold, mode, withGarrisons, withHero, allowedSupplies], reset);
  // ⚔️ Un lieu attaqué depuis le calcul (envoi manuel, héros seul) quitte les cibles : sa
  // proposition s'efface, le reste du plan tient (`withoutEngaged`).
  watch(
    () => ctx.targets.value.map((p) => p.id).join('|'),
    () => {
      if (rows.value) rows.value = withoutEngaged(rows.value, ctx.targets.value);
    },
  );

  /** Lance UNE proposition. Rend la raison d'un refus (`null` = parti). */
  async function sendRow(r: PlannerRow): Promise<string | null> {
    const uid = auth.user?.id;
    if (!uid) return 'non connecté';
    // ⚔️ Une attaque combinée part par le MÊME chemin que l'écran (`sendCombinedAttack`) :
    // chaque groupe part à son heure pour que tous arrivent ensemble.
    if (r.wings)
      return char.sendCombinedAttack(uid, r.poi, {
        wings: r.wings.map((w) => ({
          originId: w.from?.id ?? null,
          escortIds: w.advs.map((a) => a.id),
          hero: w.hero ? heroObj() : null,
        })),
        playerLevel: r.hero ? ctx.progressionLevel.value : ctx.heroLevel.value,
        now: Date.now(),
        supplies: r.supplies,
      });
    return char.sendParty(uid, r.poi, {
      hero: r.hero ? heroObj() : null,
      escortIds: r.advs.map((a) => a.id),
      // Même règle que l'écran d'envoi : avec le héros, son niveau de progression.
      playerLevel: r.hero ? ctx.progressionLevel.value : ctx.heroLevel.value,
      now: Date.now(),
      // 🎒 Les consommables du plan : le store les revérifie (`suppliesBlocker`, stock).
      supplies: r.supplies,
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
    const sent: PlannerRow[] = [];
    try {
      await ctx.settleDueSiege();
      for (const r of [...(rows.value ?? [])]) {
        const refused = await sendRow(r);
        if (refused) refusals.push(refused);
        else {
          ok++;
          sent.push(r);
          rows.value = (rows.value ?? []).filter((x) => x.key !== r.key);
        }
      }
    } finally {
      launching.value = null;
    }
    // 🔁 La vague PARTIE (pas la proposition : seulement ce qui a vraiment quitté la base) est
    // retenue pour être relancée. Une écriture, après les départs.
    await rememberWave(sent);
    if (refusals.length)
      $q.notify({
        type: ok ? 'warning' : 'negative',
        message: `${ok} expédition(s) lancée(s), ${refusals.length} refusée(s) : ${refusals[0]}.`,
      });
  }

  // ── 🔁 RELANCER LA DERNIÈRE VAGUE ───────────────────────────────────────────────────────
  /** La dernière vague de CETTE île (elle vit dans sa carte). */
  const lastWave = computed(() => char.row?.expedition_map?.lastWave ?? null);
  /** Ce que le dernier « Relancer » a fait : combien sont partis, et ce qui est resté avec sa
   *  raison (jamais ignoré en silence). */
  const waveResult = ref<{ sent: number; skipped: { label: string; reason: string }[] } | null>(
    null,
  );

  /** Retient la vague qui vient de partir. Une écriture manquée n'empêche rien : la vague
   *  d'avant reste, le joueur relancera à la main. */
  async function rememberWave(sent: PlannerRow[]) {
    const uid = auth.user?.id;
    const wave = waveFromRows(sent, Date.now());
    if (!uid || !wave) return;
    try {
      await char.recordWave(uid, wave);
      waveResult.value = null;
    } catch {
      /* hors ligne : la prochaine vague la retiendra */
    }
  }

  /** Les règles d'envoi, BRANCHÉES sur celles du planificateur et du store — la vague n'en a
   *  aucune à elle (cf. `lastWave.ts`). */
  function replayWorld(): ReplayWorld {
    const map = char.row?.expedition_map;
    const free = new Map<string, string | null>(ctx.freeStable.value.map((a) => [a.id, null]));
    for (const [pid, list] of readyGarrisons(map, char.advList, ctx.now.value))
      for (const a of list) free.set(a.id, pid);
    return {
      targets: ctx.targets.value,
      free,
      advs: new Map(char.advList.map((a) => [a.id, a])),
      heroFree: heroFree.value,
      heroAt: heroPostOf(map)?.id ?? null,
      hero: heroObj(),
      road: ctx.roadCtx.value,
      base: ctx.base.value,
      cap: ctx.cap.value,
      now: Date.now(),
      need: threshold.value / 100,
    };
  }

  /** « 🔁 Relancer la dernière vague » : les mêmes équipes, sur des lieux du même type, par le
   *  MÊME chemin d'envoi que « Tout lancer » (`sendRow` → le store refuse ce que l'envoi
   *  manuel refuserait). Ce qui ne repart pas est listé avec sa raison. */
  async function relaunchWave() {
    const wave = lastWave.value;
    if (!wave || launching.value) return;
    launching.value = 'wave';
    const skipped: { label: string; reason: string }[] = [];
    let sent = 0;
    try {
      await ctx.settleDueSiege();
      const map = char.row?.expedition_map;
      const plan = planReplay(wave, replayDeps(replayWorld()), char.row?.supplies ?? {});
      for (const s of plan.skipped)
        skipped.push({ label: waveKeyLabel(s.trip.key), reason: s.reason });
      for (const { trip, target } of plan.sends) {
        const groups = trip.wings.map((w) => ({
          from: map?.pois.find((p) => p.id === w.originId) ?? null,
          advs: w.advIds.flatMap((id) => char.advList.find((a) => a.id === id) ?? []),
          hero: w.hero,
        }));
        const refused = await sendRow({
          key: `wave|${target.id}`,
          poi: target,
          advs: groups.flatMap((g) => g.advs),
          hero: groups.some((g) => g.hero),
          from: groups[0]!.from,
          wings: groups.length > 1 ? groups : null,
          win: 1,
          tripMin: 0,
          xp: 0,
          supplies: trip.supplies,
        });
        if (refused) skipped.push({ label: waveKeyLabel(trip.key), reason: refused });
        else sent++;
      }
    } finally {
      launching.value = null;
    }
    waveResult.value = { sent, skipped };
    if (sent && rows.value) rows.value = withoutEngaged(rows.value, ctx.targets.value);
  }

  /** 🕳️ Combien de failles le mode « Failles » peut viser (l'écran le dit s'il n'y en a aucune). */
  const riftCount = computed(() => planTargets(ctx.targets.value, 'rifts').length);

  return {
    threshold,
    mode,
    riftCount,
    withGarrisons,
    withHero,
    supplyStock,
    toggleSupply,
    heroFree,
    poolInfo,
    anyForceFree,
    running,
    progress,
    rows,
    unreachable,
    launching,
    compute,
    reset,
    launch,
    launchAll,
    lastWave,
    waveResult,
    relaunchWave,
    repoTeams,
    repoMoves,
    repoRunning,
    repoMissing,
    repoHealable,
    healThenRepartir,
    repartir,
    launchAllMoves,
  };
}
