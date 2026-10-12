import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { advGearRoles } from '@/lib/advGear';
import { advRuneSkills, type Adventurer } from '@/lib/adventurers';
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
import {
  ARCHIPEL_TRAVEL_LEVEL,
  archipelFloor,
  EXPE,
  HERO_GARRISON_SEATS,
  distNormAt,
  type Poi,
} from '@/lib/expedition';
import { mapOutpostLevel } from '@/lib/archipelago';
import { campWinPct } from '@/lib/camp';
import {
  planExpeditions,
  type PlanMode,
  type PlannedTrip,
  type PlanUnit,
} from '@/lib/expeditionPlanner';
import { heroPostOf } from '@/lib/islandConquest';
import {
  SUPPORT_SKILLS,
  deployRefLevel,
  deployWeight,
  deploymentPoints,
  planDeployment,
  type DeploySpot,
  type DeployUnit,
} from '@/lib/mapDeployment';
import {
  partyHeroBlocker,
  partyLegMin,
  partySendBlocker,
  supplyTarget,
  usefulSupplies,
} from '@/lib/party';
import { CAMP_SAMPLE_MULT, FORECAST_SAMPLES, partyWinChance } from '@/lib/partyForecast';
import type { BaseState } from '@/lib/raid';
import { withRiftCut } from '@/lib/rift';
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
/** 🧭 La force du lieu de référence de la répartition, en gardes : un lieu DUR COURANT (le haut
 *  des lieux de récolte gardés, 1 à 2,5, et des camps). Les repaires pleins et les failles se
 *  prennent en réunissant des garnisons voisines (attaque combinée). */
const REF_SIZE = 2.5;
const THRESHOLD_KEY = 'muscu:planner:threshold';
const MODE_KEY = 'muscu:planner:mode';
const GARRISON_KEY = 'muscu:planner:garrisons';
const SUPPLY_KEY = 'muscu:planner:supplies';

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
/** 🧭 Une équipe de la répartition et l'endroit où elle s'installe. */
export interface RepoTeamRow {
  key: string;
  /** null = la base. */
  spot: Poi | null;
  advs: Adventurer[];
  hero: boolean;
  /** Chance contre le lieu de référence (un lieu dur courant de l'île). */
  win: number;
  /** Part de l'île qu'elle couvre (0..1). */
  share: number;
  /** Trajet moyen (aller-retour) vers les lieux de sa zone. */
  avgTripMin: number;
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
  const mode = ref<PlanMode>(readStr(MODE_KEY) === 'xp' ? 'xp' : 'events');
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
      const targets = ctx.targets.value;
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
          // 🎒 Ce que l'équipe emporte : les consommables autorisés qui lui SERVENT là
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
   * 🧭 RÉPARTIR TOUT L'EFFECTIF SUR LA CARTE (2026-10-11, demandé ; cf. `mapDeployment.ts`).
   * Un placement de fond, fait quand tout le monde est rentré : des équipes ÉQUILIBRÉES
   * (chacune prend un lieu parmi les plus durs de l'île au seuil réglé, compétences de soutien
   * réparties), posées sur la base, les lieux tenus et la forteresse pour couvrir l'île au plus
   * vite. Il n'attaque rien : le 🪄 part ensuite de ces garnisons. Pas de miliciens.
   */
  const repoTeams = ref<RepoTeamRow[] | null>(null);
  const repoMoves = ref<RepoMoveRow[]>([]);
  const repoRunning = ref(false);
  const repoBelow = ref(false);

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

  async function repartir() {
    const me = ++repoRun;
    repoRunning.value = true;
    repoTeams.value = null;
    repoMoves.value = [];
    repoBelow.value = false;
    try {
      // Le navigateur garde la main avant un calcul de quelques centaines de combats.
      await new Promise((r) => setTimeout(r, 0));
      if (me !== repoRun) return;
      const map = char.row?.expedition_map;
      const road = ctx.roadCtx.value;
      const byId = new Map<string, Adventurer>();
      const units: DeployUnit[] = [];
      const roles = (a: Adventurer) => {
        const ids = new Set(advRuneSkills(a).map((k) => k.id as string));
        return SUPPORT_SKILLS.filter((r) => ids.has(r));
      };
      const add = (a: Adventurer, at: string) => {
        byId.set(a.id, a);
        units.push({
          id: a.id,
          hero: false,
          loc: at,
          power: combatPowerRaw(partyAllies([a], road, null)[0]!.combatant),
          roles: roles(a),
        });
      };
      for (const a of ctx.freeStable.value) add(a, 'base');
      for (const [pid, ready] of readyGarrisons(map, char.advList, ctx.now.value))
        for (const a of ready) add(a, pid);
      const hero = withHero.value && heroFree.value ? heroObj() : null;
      if (hero)
        units.push({
          id: '__hero',
          hero: true,
          loc: heroPostOf(map)?.id ?? 'base',
          power: combatPowerRaw(heroPartyCombatant(hero)),
          roles: [],
        });
      if (!units.length) {
        repoTeams.value = [];
        return;
      }

      // Les endroits : la base, et tout lieu tenu qui reçoit des champions (lieux fixes,
      // objectifs, forteresse — `seatsOf` > 0). Places = places libres + celles de ceux qui
      // y sont et repartent avec la répartition.
      const held = (map?.pois ?? []).filter(
        (p) => p.control?.owner === 'player' && seatsOf(p.control.kind) > 0,
      );
      const points = new Map(held.map((p) => [p.id, p]));
      const weightAt = (id: string) =>
        units.filter((u) => u.loc === id).reduce((n, u) => n + deployWeight(u), 0);
      const spots: DeploySpot[] = [
        { id: 'base', seats: Infinity, heroOk: true },
        ...held.map((p) => ({
          id: p.id,
          seats: controlFreeSeats(p.control) + weightAt(p.id),
          heroOk: seatsOf(p.control!.kind) >= HERO_GARRISON_SEATS,
        })),
      ];

      // 🎯 Le lieu de référence, au plus haut rang de l'île (plafonné au héros) : un lieu DUR
      // COURANT — 2,5 gardes, le haut des lieux de récolte gardés et des camps (`REF_SIZE`).
      // ⚠️ Pas le repaire plein ni la faille : depuis les attaques combinées (v1.139), les
      // garnisons voisines se réunissent pour ceux-là. Mesuré sur un vrai vivier (16 champions,
      // île 2) : exiger le repaire plein ET la faille faisait 3 garnisons de 5-6 qui ne
      // rentraient pas dans les lieux à 5 places (base et forteresse seulement), contre 4
      // garnisons, une par lieu tenu, avec cette référence — trajet moyen du 🪄 113 → 70 min,
      // XP par heure ×2.
      const level = deployRefLevel(
        ctx.heroLevel.value,
        archipelFloor(map),
        map?.archipel?.levelCap ?? Infinity,
      );
      const refPoi: Poi = {
        id: 'deploy-ref',
        type: 'lair',
        level,
        x: EXPE.town.x,
        y: EXPE.town.y - 40,
        distNorm: 0.5,
        spawnedAt: 0,
        expiresAt: Number.MAX_SAFE_INTEGER,
      };
      const advsOf = (us: readonly DeployUnit[]) =>
        us.filter((u) => !u.hero).map((u) => byId.get(u.id)!);
      const winCache = new Map<string, number>();
      const win = (team: readonly DeployUnit[]) => {
        const key = team
          .map((u) => u.id)
          .sort()
          .join(',');
        let w = winCache.get(key);
        if (w === undefined) {
          const allies = partyAllies(advsOf(team), road, team.some((u) => u.hero) ? hero : null);
          w = campWinPct(
            refPoi,
            { faction: 'bandits', size: REF_SIZE },
            allies,
            FORECAST_SAMPLES * CAMP_SAMPLE_MULT,
          );
          winCache.set(key, w);
        }
        return w;
      };

      // L'île, échantillonnée : un trajet de chaque endroit vers chaque point.
      const island = map?.archipel?.island ?? null;
      const pts = deploymentPoints(island, mapOutpostLevel(map, char.comptoirLevel));
      const legOf = (p: Poi) =>
        partyLegMin(p, [], { hero: false, travelMult: ctx.travelMult.value, gearSpeed: 0 });
      const ptPoi = pts.map(
        (q, i): Poi => ({
          id: `deploy-${i}`,
          type: 'camp',
          level,
          x: q.x,
          y: q.y,
          distNorm: distNormAt(Math.hypot(q.x - EXPE.town.x, q.y - EXPE.town.y)),
          travelLevel: map?.archipel ? ARCHIPEL_TRAVEL_LEVEL : level,
          spawnedAt: 0,
          expiresAt: Number.MAX_SAFE_INTEGER,
        }),
      );
      const tripCache = new Map<string, number[]>();
      const trip = (spot: string, p: number) => {
        let row = tripCache.get(spot);
        if (!row) {
          const from = points.get(spot);
          row = ptPoi.map((q) => (from ? legFromSpot(q, from, legOf) : legOf(q)));
          tripCache.set(spot, row);
        }
        return row[p]!;
      };

      const plan = planDeployment(units, spots, pts.length, {
        threshold: threshold.value / 100,
        deps: { win, trip },
      });
      if (me !== repoRun) return;
      repoBelow.value = plan.belowThreshold;
      repoTeams.value = plan.teams.map((t) => ({
        key: t.units.map((u) => u.id).join(','),
        spot: points.get(t.spot) ?? null,
        advs: advsOf(t.units),
        hero: t.units.some((u) => u.hero),
        win: t.win,
        share: t.share,
        avgTripMin: 2 * t.avgTrip,
      }));
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
    const n = repoMoves.value.reduce((k, m) => k + m.advs.length + (m.hero ? 1 : 0), 0);
    repoMoves.value = [];
    $q.notify({ type: 'positive', message: `🧭 ${n} en route vers leur nouvel endroit.` });
  }

  /** Oublie la proposition (la carte a bougé, ou un réglage a changé). */
  function reset() {
    run++;
    running.value = false;
    rows.value = null;
    unreachable.value = [];
  }
  /** Oublie la répartition proposée (un de SES réglages a changé). */
  function resetRepo() {
    repoRun++;
    repoRunning.value = false;
    repoTeams.value = null;
    repoMoves.value = [];
  }
  watch([threshold, mode, withGarrisons, withHero, allowedSupplies], reset);
  watch([threshold, withHero], resetRepo);

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
    repoTeams,
    repoMoves,
    repoRunning,
    repoBelow,
    repoMissing,
    repartir,
    launchAllMoves,
  };
}
