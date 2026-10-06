// 👥 LA COMPOSITION D'UNE ÉQUIPE sur la carte d'expédition — qui part (héros oui/non, quels
// champions), avec quels consommables, avec quelle chance, en combien de temps, à quel risque
// pour la base, et l'envoi. Sorti de `ExpeditionMapPage` (découpage de la page, 2026-09-27) :
// le bloc est repris TEL QUEL, la page lui fournit son contexte (`PartyCtx`) et reçoit ses
// valeurs sous les mêmes noms — son gabarit n'a pas changé.
//
// ⚠️ AUCUNE RÈGLE ICI : tout ce qui décide (qui peut partir, % de victoire, trajet, risque de
// départ, partage d'XP) vit en lib (`party.ts`, `partyForecast.ts`, `raid.ts`, `caravan.ts`)
// et c'est la MÊME dispatch que le store applique à l'envoi.
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '@/stores/auth';
import { useCharacterStore } from '@/stores/character';
import { withRiftCut } from '@/lib/rift';
import {
  partyCapFor,
  partyHeroBlocker,
  partyLegMin,
  partySendBlocker,
  heroCanStay,
  heroStaysAt,
  interceptLeg,
  interceptTooLate,
  meetAll,
  supplyTarget,
} from '@/lib/party';
import {
  FORECAST_SAMPLES,
  partyRoadOdds,
  partyWinChance,
  winGain,
  type GainTeam,
} from '@/lib/partyForecast';
import { CONTROL_EMO, CONTROL_LABEL, champSeatsWithHero, garrisonHold } from '@/lib/controlPoints';
import { legFromSpot, readyGarrisons } from '@/lib/controlRoutes';
import { plannedTransferIds } from '@/lib/plannedMoves';
import { heroPostOf } from '@/lib/islandConquest';
import {
  COMBINED_BLOCK_LABEL,
  byReach,
  combinedBlocker,
  toggleOriginGroup,
  wingOriginId,
} from '@/lib/combinedAttack';
import { SUPPLIES, SUPPLY_IDS, supplyUselessWhy, type SupplyId } from '@/lib/supplies';
import { advGearRoles } from '@/lib/advGear';
import { departureRisk, guardUnits, type BaseState, type Raid } from '@/lib/raid';
import { advUnavailableReason, sortByGradeThenRank, type Adventurer } from '@/lib/adventurers';
import {
  missionXpPreview,
  missionXpSplit,
  partyAllies,
  SOLO_XP_MULT,
  type EscortKit,
  type MissionXpPreview,
  type PartyHero,
} from '@/lib/caravan';
import type { Combatant } from '@/lib/combat';
import { isWarbandPoi, type Poi } from '@/lib/expedition';

type R<T> = Readonly<Ref<T>> | ComputedRef<T>;

/** Ce que la page connaît déjà et que la composition d'une équipe lit. */
export interface PartyCtx {
  selected: Ref<Poi | null>;
  now: R<number>;
  /** Horloge à la minute : les pronostics coûteux ne se recalculent pas à chaque seconde. */
  coarseNow: R<number>;
  heroLevel: R<number>;
  progressionLevel: R<number>;
  fighter: R<Combatant>;
  heroHealIn: R<number>;
  outpostBuilt: R<boolean>;
  travelMult: R<number>;
  roadCtx: R<EscortKit>;
  compCtx: R<EscortKit>;
  base: R<BaseState | null>;
  incoming: R<Raid | null>;
  raidAt: R<number>;
  heroDefendsNow: R<Combatant | null>;
  freeStable: R<Adventurer[]>;
  freeSorted: R<Adventurer[]>;
  cap: R<number>;
  partyTarget: R<boolean>;
  teamOnly: R<boolean>;
  selectedRift: R<unknown>;
  /** La progression (niveaux) est-elle chargée ? Avant, le niveau vaut 1. */
  progressReady: R<boolean>;
  /** Résout un siège échu avant un départ (la page le fait aussi pour le héros seul). */
  settleDueSiege: () => Promise<void>;
}

export function useExpeditionParty(ctx: PartyCtx) {
  const {
    selected,
    now,
    coarseNow,
    heroLevel,
    progressionLevel,
    fighter,
    heroHealIn,
    outpostBuilt,
    travelMult,
    roadCtx,
    compCtx,
    base,
    incoming,
    raidAt,
    heroDefendsNow,
    freeStable,
    freeSorted,
    cap,
    partyTarget,
    teamOnly,
    selectedRift,
    progressReady,
    settleDueSiege,
  } = ctx;
  const $q = useQuasar();
  const auth = useAuthStore();
  const char = useCharacterStore();
  /** 🛡️ Les miliciens à la base : ils défendent en cas de siège (compter les mêmes que le combat). */
  const milHome = computed(() => char.row?.base?.militia?.home ?? 0);
  const busyParty = ref(false);

  const partyHero = ref(false);
  const partyEscort = ref<string[]>([]);
  /** 🏰 Qui reste en garnison sur un point de contrôle (le choix le plus récent d'abord). */
  const partyStay = ref<string[]>([]);
  /** 🧝 Le héros reste-t-il en garnison si le point est pris (étape 6 bis) ? */
  const partyHeroStay = ref(false);
  watch(selected, () => {
    partyHero.value = false;
    partyEscort.value = [];
    partyStay.value = [];
    partyHeroStay.value = false;
  });
  /** ⚠️ Une CHAÎNE (point → ids prêts) recalculée au tick, qui ne réveille les listes que si
   *  quelqu'un change d'état — même principe que `freeKey` de la page. « Prêt à sortir » est
   *  la règle de la lib (`readyGarrisons`), partagée avec le grisage de la carte. */
  const garrisonKey = computed(() =>
    [
      ...readyGarrisons(
        char.row?.expedition_map,
        char.advList,
        now.value,
        plannedTransferIds(char.plannedList),
      ),
    ]
      .map(([id, ready]) => `${id}=${ready.map((a) => a.id).join(',')}`)
      .join('|'),
  );
  const readyByPoint = computed(() => {
    const out = new Map<string, Adventurer[]>();
    for (const part of garrisonKey.value ? garrisonKey.value.split('|') : []) {
      const [id, list] = part.split('=');
      const ids = list ? list.split(',') : [];
      out.set(
        id!,
        char.advList.filter((a) => ids.includes(a.id)),
      );
    }
    return out;
  });
  /** 🏰 Les points d'où une sortie peut partir : tenus, avec au moins un champion prêt, et
   *  jamais le lieu visé lui-même. */
  const originOptions = computed(() => {
    const map = char.row?.expedition_map;
    const sel = selected.value?.id;
    return (map?.pois ?? []).flatMap((p) => {
      const ready = readyByPoint.value.get(p.id) ?? [];
      if (p.id === sel || p.control?.owner !== 'player' || !ready.length) return [];
      return [
        {
          id: p.id,
          poi: p,
          emo: CONTROL_EMO[p.control.kind],
          label: CONTROL_LABEL[p.control.kind],
          n: ready.length,
        },
      ];
    });
  });
  /** Qui peut partir : le vivier de la base et la garnison prête de TOUS les points tenus.
   *  ⚠️ Plus de tuiles de départ à cocher (demandé, 2026-09-29) : tous les lieux sont montrés,
   *  et le départ se DÉDUIT des champions choisis. */
  const partyPool = computed(() => [
    ...freeStable.value,
    ...originOptions.value.flatMap((o) => readyByPoint.value.get(o.id) ?? []),
  ]);
  const partyPoolSorted = computed(() =>
    !originOptions.value.length ? freeSorted.value : sortByGradeThenRank(partyPool.value),
  );
  /** D'où part chaque champion : sa garnison, sinon la base. */
  const originOfAdv = (id: string): string =>
    originOptions.value.find((o) => (readyByPoint.value.get(o.id) ?? []).some((a) => a.id === id))
      ?.id ?? 'base';
  /** Les aventuriers retenus ET toujours disponibles (un aventurier parti en convoi entre-temps
   *  sort du groupe de lui-même — le store le refuserait de toute façon). */
  const partyAdvs = computed(() => partyPool.value.filter((a) => partyEscort.value.includes(a.id)));
  /** 🧝 D'où part le HÉROS : le lieu tenu où il est posté, sinon la base (signalé : il partait
   *  de la base alors qu'il était à l'Ossuaire). */
  const heroPost = computed(() => heroPostOf(char.row?.expedition_map) ?? null);
  const heroOriginId = computed(() => heroPost.value?.id ?? 'base');
  /** Les points de départ possibles, le poste du héros compris même sans champion prêt. */
  const startOptions = computed(() => {
    const p = heroPost.value;
    if (!p?.control || originOptions.value.some((o) => o.id === p.id)) return originOptions.value;
    return [
      ...originOptions.value,
      {
        id: p.id,
        poi: p,
        emo: CONTROL_EMO[p.control.kind],
        label: CONTROL_LABEL[p.control.kind],
        n: 0,
      },
    ];
  });
  /** 🏰 D'où part l'équipe, DÉDUIT des champions choisis (et du héros, qui part de son poste
   *  ou de la base). UN seul point = une sortie (elle y revient) ; PLUSIEURS départs = une
   *  ATTAQUE COMBINÉE, chaque groupe part à son heure pour que tous arrivent ensemble.
   *  Personne = la base. */
  const partyOrigins = computed(() => {
    const ids = new Set<string>();
    if (partyHero.value && !partyHeroBlock.value) ids.add(heroOriginId.value);
    for (const a of partyAdvs.value) ids.add(originOfAdv(a.id));
    return ids.size ? [...ids] : ['base'];
  });
  const baseOn = computed(() => partyOrigins.value.includes('base'));
  /** Les points de départ retenus (hors base). */
  const pointOrigins = computed(() =>
    startOptions.value.filter((o) => partyOrigins.value.includes(o.id)),
  );
  /** UN seul point, sans la base : une sortie ordinaire (`fromControlId`). */
  const originPoi = computed(() =>
    !baseOn.value && pointOrigins.value.length === 1 ? pointOrigins.value[0]!.poi : null,
  );
  /** ⚔️🧭 Plusieurs départs : une attaque combinée. */
  const combined = computed(() => partyOrigins.value.length > 1);
  /** Ceux qui ne peuvent PAS partir, avec la raison — même règle que le store
   *  (`advUnavailableReason`, dont `advAvailable` dérive). On les montre grisés plutôt que de
   *  les cacher : un aventurier qui disparaît de la liste se lit comme un aventurier perdu. */
  /** ⚠️ Même principe que `freeKey` : une CHAÎNE (id + raison) calculée au tick, mais qui ne
   *  réveille la liste — donc le rendu des tuiles grisées — que si un aventurier change d'état.
   *  ⚠️ ET LA MÊME HORLOGE QUE `freeKey`, OBLIGATOIREMENT (`now`, pas `coarseNow`) : les deux
   *  listes PARTITIONNENT le vivier (`advAvailable` ⟺ `advUnavailableReason === null`) et sont
   *  rendues côte à côte dans `.car-pick`, keyées sur le même id. Sur deux horloges décalées, un
   *  aventurier dont l'échéance tombe en milieu de minute apparaîtrait DANS LES DEUX pendant
   *  jusqu'à une minute (tuile en double + clés dupliquées). Le coût du tick est ici une
   *  concaténation sur le vivier : c'est la chaîne, pas l'horloge, qui protège les dépendants. */
  const blockedKey = computed(() =>
    char.advList.map((a) => `${a.id}:${advUnavailableReason(a, now.value) ?? ''}`).join('|'),
  );
  /** Champions indisponibles : masqués par défaut dans le choix d'une équipe (demandé). */
  const showBlocked = ref(false);
  const partyBlocked = computed(() => {
    const why = new Map(
      blockedKey.value.split('|').map((kv) => {
        const cut = kv.lastIndexOf(':');
        return [kv.slice(0, cut), kv.slice(cut + 1)] as const;
      }),
    );
    return sortByGradeThenRank(char.advList).flatMap((a) => {
      const w = why.get(a.id);
      return w ? [{ adv: a, why: w as NonNullable<ReturnType<typeof advUnavailableReason>> }] : [];
    });
  });
  /** Pourquoi le héros ne peut pas se joindre au groupe — la MÊME règle que le store. */
  const partyHeroBlock = computed(() =>
    selected.value
      ? partyHeroBlocker({
          onExpedition: char.heroEngaged,
          healMs: heroHealIn.value,
          outpost: outpostBuilt.value,
          poi: selected.value,
        })
      : null,
  );
  /** Le héros est-il VRAIMENT du groupe ? Le choix du joueur, tant que rien ne l'en empêche :
   *  un héros qu'on a coché puis qui part ailleurs ne doit pas fausser le pronostic. */
  const partyHeroOn = computed(() => partyHero.value && !partyHeroBlock.value);
  const heroForParty = computed<PartyHero | null>(() =>
    partyHeroOn.value
      ? { name: char.row?.pseudo ?? 'Toi', level: heroLevel.value, combatant: fighter.value }
      : null,
  );
  const partySize = computed(() => partyAdvs.value.length + (partyHeroOn.value ? 1 : 0));
  /** 🎒 Les consommables choisis pour CE voyage — remis à zéro quand on change de lieu. */
  const chosenSupplies = ref<SupplyId[]>([]);
  watch(
    () => selected.value?.id,
    () => (chosenSupplies.value = []),
  );
  /** Le stock, tuile par tuile, et POURQUOI un consommable ne servirait à rien ici. */
  const supplyRows = computed(() => {
    const p = selected.value;
    const stock = char.row?.supplies ?? {};
    const t = p ? supplyTarget(p, partyHeroOn.value, partyAdvs.value.length) : null;
    return SUPPLY_IDS.filter((id) => SUPPLIES[id].voyage && (stock[id] ?? 0) > 0).map((id) => ({
      id,
      def: SUPPLIES[id],
      n: stock[id]!,
      on: chosenSupplies.value.includes(id),
      why: t ? supplyUselessWhy(id, t) : null,
    }));
  });
  /** ⚠️ Un consommable coché qui DEVIENT inutile (on retire le héros, par exemple) n'est plus
   *  emporté : on ne dépense pas un objet qui ne fait rien. */
  const activeSupplies = computed(() =>
    supplyRows.value.filter((r) => r.on && !r.why).map((r) => r.id),
  );
  function toggleSupply(id: SupplyId) {
    chosenSupplies.value = chosenSupplies.value.includes(id)
      ? chosenSupplies.value.filter((x) => x !== id)
      : [...chosenSupplies.value, id];
  }
  /** Le kit du groupe AVEC ses consommables : c'est lui que lisent le 🎯 % et le trajet. */
  const partyRoad = computed(() => ({ ...roadCtx.value, supplies: activeSupplies.value }));
  /** 🎯 % de victoire — `partyWinChance`, LA MÊME dispatch que le store (qui s'en sert pour
   *  refuser un départ perdu d'avance) : l'écran en avait une copie, qui aurait dû apprendre
   *  les consommables séparément. Graines de pronostic, jamais celle du vrai combat.
   *  ⚠️ HORLOGE GROSSIÈRE (`coarseNow`) : l'effectif d'une faille dépend de l'instant, et une
   *  incursion enchaîne jusqu'à 13 combats — à 40 échantillons par seconde, ce serait ~520
   *  combats rejoués à chaque tick pour un effectif qui bouge sur SEPT JOURS. */
  /** ⚔️🕳️ La cible TELLE QU'ON L'AFFRONTERA : une bande de faille déjà amputée par des
   *  interceptions ratées (`withRiftCut`) — la MÊME copie que le store résout. */
  const aimed = computed(() =>
    selected.value ? withRiftCut(selected.value, char.row?.base) : null,
  );
  const partyWin = computed(() => {
    const p = aimed.value;
    if (!p || !partySize.value) return null;
    const w = partyWinChance(
      p,
      partyAdvs.value,
      partyRoad.value,
      heroForParty.value,
      coarseNow.value,
      FORECAST_SAMPLES,
    );
    return w === null ? null : Math.round(w * 100);
  });
  /** 🏰👥 LA FORTERESSE ENNEMIE, TOUT LE MONDE RÉUNI (demandé) : le 🎯 % si le joueur
   *  rassemblait TOUS ses champions (occupés, postés ou blessés compris) et son héros — un
   *  repère « est-elle à ma portée ? », pas une équipe qu'on peut envoyer telle quelle. Même
   *  dispatch que l'équipe (`partyWinChance`), sans consommables. `null` hors forteresse
   *  ennemie. */
  const fortressAllWin = computed(() => {
    const p = aimed.value;
    if (!p || p.control?.kind !== 'fortress' || p.control.owner === 'player') return null;
    const hero: PartyHero = {
      name: char.row?.pseudo ?? 'Toi',
      level: heroLevel.value,
      combatant: fighter.value,
    };
    const w = partyWinChance(
      p,
      char.advList,
      { ...roadCtx.value, supplies: [] },
      hero,
      coarseNow.value,
      FORECAST_SAMPLES,
    );
    return w === null ? null : Math.round(w * 100);
  });
  /** 🎯➕ CE QUE CHAQUE MEMBRE APPORTE à la réussite, en points (`winGain`), par rapport à
   *  l'équipe COCHÉE : un champion non coché s'y ajoute, un coché en est retiré. Clé `hero`
   *  pour le héros.
   *  ⚠️ CALCULÉ PAR MORCEAUX, jamais d'un bloc : un 🎯 % coûte jusqu'à ~25 ms (mesuré, une mine
   *  ou une faille), deux par tuile, et un vivier en compte des dizaines — d'un bloc, l'écran
   *  se figerait plus d'une seconde à chaque case cochée. On rend la main entre deux tuiles,
   *  les chiffres apparaissent au fil de l'eau, et un nouveau changement d'équipe annule le
   *  calcul en cours (`gainRun`). Horloge grossière, comme le 🎯 %. */
  const partyGain = ref<Record<string, number | null>>({});
  const heroCandidate = computed<PartyHero | null>(() =>
    partyHeroBlock.value
      ? null
      : { name: char.row?.pseudo ?? 'Toi', level: heroLevel.value, combatant: fighter.value },
  );
  const gainKey = computed(() => {
    const p = selected.value;
    if (!p || !partyTarget.value) return '';
    return [
      p.id,
      [...partyEscort.value].sort().join(','),
      partyHeroOn.value,
      !!heroCandidate.value,
      activeSupplies.value.join(','),
      partyPoolSorted.value.map((a) => a.id).join(','),
      coarseNow.value,
    ].join('|');
  });
  let gainRun = 0;
  watch(
    gainKey,
    async (key) => {
      const run = ++gainRun;
      partyGain.value = {};
      const p = selected.value;
      if (!key || !p) return;
      const cur: GainTeam = { escort: partyAdvs.value, hero: heroForParty.value };
      const road = partyRoad.value;
      const now = coarseNow.value;
      const jobs: [string, () => number | null][] = [];
      const hero = heroCandidate.value;
      if (hero)
        jobs.push([
          'hero',
          () =>
            partyHeroOn.value
              ? winGain(p, cur, { escort: cur.escort, hero: null }, road, now)
              : winGain(p, { escort: cur.escort, hero }, cur, road, now),
        ]);
      for (const a of partyPoolSorted.value) {
        const inTeam = cur.escort.some((x) => x.id === a.id);
        jobs.push([
          a.id,
          () =>
            inTeam
              ? winGain(
                  p,
                  cur,
                  { escort: cur.escort.filter((x) => x.id !== a.id), hero: cur.hero },
                  road,
                  now,
                )
              : winGain(p, { escort: [...cur.escort, a], hero: cur.hero }, cur, road, now),
        ]);
      }
      for (const [id, job] of jobs) {
        await new Promise((r) => setTimeout(r, 0));
        if (run !== gainRun) return;
        partyGain.value = { ...partyGain.value, [id]: job() };
      }
    },
    { immediate: true },
  );
  /** 💀 Le refus « perdu d'avance » : les GARDES seuls (la route coûte de la cargaison, elle
   *  ne rend pas un lieu imprenable) — le même nombre que le store. */
  const partyGuardWin = computed(() => {
    const p = aimed.value;
    if (!p || !partySize.value) return null;
    return partyWinChance(
      p,
      partyAdvs.value,
      partyRoad.value,
      heroForParty.value,
      coarseNow.value,
      FORECAST_SAMPLES,
      false,
    );
  });
  /** 🛣️ La route à part des gardes (`partyRoadOdds`), `null` quand elle ne se joue pas. */
  const partyRoute = computed(() => {
    const p = selected.value;
    if (!p || !partySize.value) return null;
    return partyRoadOdds(p, partyAdvs.value, partyRoad.value, heroForParty.value, FORECAST_SAMPLES);
  });
  /** 🧭 Trajet ALLER (minutes) vers la cible depuis un lieu de départ (`null` = la base),
   *  pour un groupe donné — la MÊME règle que le store (`partyLegMin`, `legFromSpot`). */
  function legFrom(origin: Poi | null, members: Adventurer[], hero = false): number {
    const target = selected.value;
    if (!target) return 0;
    const legOf = (p: Poi) =>
      partyLegMin(p, members, {
        hero,
        travelMult: travelMult.value,
        gearSpeed: advGearRoles(members, roadCtx.value.advGear).speed,
        supplies: activeSupplies.value,
      });
    return origin ? legFromSpot(target, origin, legOf) : legOf(target);
  }
  /** 🧭 Les lieux de départ (la base et les points tenus), du plus proche de la cible au plus
   *  loin (demandé). Le trajet est celui de TOUS les champions prêts du lieu. */
  const originTiles = computed(() =>
    byReach([
      {
        id: 'base',
        emo: '🏰',
        label: 'Base',
        n: freeStable.value.length,
        // 🧝 Le héros part de la base : son trajet compte dès qu'il peut se joindre au groupe.
        legMin: legFrom(null, freeStable.value, !partyHeroBlock.value),
      },
      ...originOptions.value.map((o) => ({
        id: o.id,
        emo: o.emo,
        label: o.label,
        n: o.n,
        legMin: legFrom(o.poi, readyByPoint.value.get(o.id) ?? []),
      })),
    ]),
  );
  /** 🧭 Les champions PAR LIEU de départ, du lieu le plus proche de la cible au plus loin
   *  (demandé) — dès qu'un point fixe tenu a des champions prêts ; sinon la liste habituelle. */
  const partyGroups = computed(() => {
    if (!originOptions.value.length) return [];
    return originTiles.value.map((t) => ({
      ...t,
      advs:
        t.id === 'base'
          ? freeSorted.value
          : sortByGradeThenRank(readyByPoint.value.get(t.id) ?? []),
    }));
  });
  /** Aller-retour : le groupe va au pas de son marcheur le plus lent (`partyLegMin`). */
  // ⚔️ Une bande en marche vient à notre rencontre : le trajet annoncé est celui jusqu'au
  // point où on la CROISERA (`interceptLeg`, la même règle que l'envoi), pas jusqu'à là où
  // elle se trouve maintenant. Horloge grossière : la rencontre bouge à la minute, pas plus.
  /** ⚔️🧭 Les trajets de chaque groupe prévu, pour le point de rencontre sur une armée en
   *  marche (`meetAll`, la MÊME règle que le store). */
  const wingLegFns = computed(() =>
    partyOrigins.value.map((id) => {
      const members = partyAdvs.value.filter((a) => originOfAdv(a.id) === id);
      const hero = id === heroOriginId.value && partyHeroOn.value;
      const origin = id === 'base' ? null : (pointOrigins.value.find((o) => o.id === id) ?? null);
      const legOf = (p: Poi) =>
        partyLegMin(p, members, {
          hero,
          travelMult: travelMult.value,
          gearSpeed: advGearRoles(members, roadCtx.value.advGear).speed,
          supplies: activeSupplies.value,
        });
      return (p: Poi) => (origin ? legFromSpot(p, origin.poi, legOf) : legOf(p));
    }),
  );
  /** ⚔️🧭 Cible en marche : où et quand TOUS la rejoignent. `null` hors attaque combinée
   *  sur une armée en marche. */
  const meetInfo = computed(() => {
    const target = selected.value;
    if (!target || !combined.value || target.type !== 'warband') return null;
    return meetAll(target, coarseNow.value, wingLegFns.value);
  });
  const meetPoi = computed(() => meetInfo.value?.poi ?? null);
  const meetMin = computed(() => meetInfo.value?.min ?? 0);
  /** ⚔️🧭 Les groupes d'une attaque combinée, chacun à SON pas depuis chez lui — la MÊME règle
   *  que le store (`partyLegMin`, `legFromSpot`). Arrivée commune = le plus long ; chacun part
   *  à « arrivée − son trajet ». Vide hors attaque combinée. */
  const wingPlan = computed(() => {
    const target = selected.value;
    if (!target || !combined.value) return [];
    const rows = partyOrigins.value.map((id) => {
      const members = partyAdvs.value.filter((a) => originOfAdv(a.id) === id);
      const hero = id === heroOriginId.value && partyHeroOn.value;
      const origin = id === 'base' ? null : (pointOrigins.value.find((o) => o.id === id) ?? null);
      const legOf = (p: Poi) =>
        partyLegMin(p, members, {
          hero,
          travelMult: travelMult.value,
          gearSpeed: advGearRoles(members, roadCtx.value.advGear).speed,
          supplies: activeSupplies.value,
        });
      const legAt = (p: Poi) => (origin ? legFromSpot(p, origin.poi, legOf) : legOf(p));
      const legMin = legAt(meetPoi.value ?? target);
      // 🏰 Assaut d'un point fixe : pris, SES membres qui ne restent pas (et son héros)
      // rentrent chez lui à leur pas — la MÊME règle que le store (`wingWonLeg`).
      let wonMin = legMin;
      if (stayCap.value) {
        const stay = new Set(stayIds.value);
        const back = members.filter((a) => !stay.has(a.id));
        const backOf = (p: Poi) =>
          partyLegMin(p, back, {
            hero,
            travelMult: travelMult.value,
            gearSpeed: advGearRoles(back, roadCtx.value.advGear).speed,
            supplies: activeSupplies.value,
          });
        wonMin =
          back.length || hero
            ? Math.min(legMin, origin ? legFromSpot(target, origin.poi, backOf) : backOf(target))
            : 0;
      }
      return {
        id,
        emo: origin?.emo ?? '🏰',
        label: origin?.label ?? 'Base',
        n: members.length + (hero ? 1 : 0),
        ids: members.map((a) => a.id),
        hero,
        legMin,
        wonMin,
      };
    });
    const longest = Math.max(1, meetMin.value, ...rows.map((r) => r.legMin));
    // Du groupe le plus proche au plus lointain, comme les tuiles de départ.
    return byReach(rows.map((r) => ({ ...r, departInMin: longest - r.legMin })));
  });
  /** Pourquoi l'attaque combinée ne peut pas partir (hors règles d'une équipe). */
  const combinedBlock = computed(() => {
    if (!combined.value || !selected.value) return null;
    const b = combinedBlocker(
      selected.value,
      wingPlan.value.map((w) => ({ originId: wingOriginId(w.id), members: w.ids, hero: w.hero })),
      heroPost.value?.id ?? null,
    );
    if (b) return COMBINED_BLOCK_LABEL[b];
    // ⚔️🗼 La MÊME garde que le store : tous doivent rejoindre l'armée avant qu'elle n'arrive.
    const m = meetInfo.value;
    if (
      m &&
      ((isWarbandPoi(selected.value) && !m.joined) ||
        interceptTooLate(selected.value, coarseNow.value, m.min))
    )
      return 'trop tard : l’armée atteindra sa cible avant que tous la rejoignent';
    return null;
  });
  /** Trajet ALLER de l'équipe (minutes). Le retour vaut l'aller : c'est la règle du store
   *  (`startParty` : `returnAt = midAt + leg`). ⚔️🧭 Attaque combinée : l'aller commun, celui
   *  du groupe le plus lointain, qui est aussi le dernier à rentrer. */
  const partyLeg = computed(() => {
    if (!selected.value || !partySize.value) return 0;
    if (combined.value) return Math.max(1, ...wingPlan.value.map((w) => w.legMin));
    const legOf = (p: Poi) =>
      partyLegMin(p, partyAdvs.value, {
        hero: partyHeroOn.value,
        travelMult: travelMult.value,
        gearSpeed: advGearRoles(partyAdvs.value, roadCtx.value.advGear).speed,
        supplies: activeSupplies.value,
      });
    const o = originPoi.value;
    // 🏰 Une sortie part de son point (même règle que le store, `legFromSpot`).
    return interceptLeg(
      selected.value,
      coarseNow.value,
      o ? (p) => legFromSpot(p, o, legOf) : legOf,
    ).legMin;
  });
  /** Aller-retour de l'équipe (minutes). */
  const partyMin = computed(() => 2 * partyLeg.value);
  /** 🏰 Assaut d'un point fixe PRIS : seuls le héros et les champions en trop rentrent, à LEUR
   *  pas — la MÊME règle que le store (`returnLegs.won`). 0 si personne ne rentre. Une attaque
   *  combinée garde le retour de toute l'équipe. */
  const partyWonLeg = computed(() => {
    if (!selected.value || !partySize.value || !stayCap.value || combined.value)
      return partyLeg.value;
    const stay = new Set(stayIds.value);
    const back = partyAdvs.value.filter((a) => !stay.has(a.id));
    // 🧝 Prise, le lieu garde le héros s'il y reste (la forteresse toujours) : il ne rentre pas.
    const heroBack = partyHeroOn.value && !heroStays.value;
    if (!back.length && !heroBack) return 0;
    const legOf = (p: Poi) =>
      partyLegMin(p, back, {
        hero: heroBack,
        travelMult: travelMult.value,
        gearSpeed: advGearRoles(back, roadCtx.value.advGear).speed,
        supplies: activeSupplies.value,
      });
    const o = originPoi.value;
    return Math.min(
      partyLeg.value,
      o ? legFromSpot(selected.value, o, legOf) : legOf(selected.value),
    );
  });
  /** ⚠️ CE QUE LE DÉPART COÛTE face à l'armée qui arrive — mêmes règles que le convoi et le
   *  héros (`departureRisk`) : le groupe quitte la base (et le héros avec lui s'il en est),
   *  et un groupe rentré AVANT l'assaut ne coûte rien. */
  const partyRisk = computed(() => {
    const b = base.value;
    const inc = incoming.value;
    // 🏰 Une sortie ne vide pas la base : ses champions étaient déjà dehors, sur leur point.
    if (!b || !inc || !partyTarget.value || !partySize.value || !baseOn.value) return null;
    const heroNow = heroDefendsNow.value;
    // Seuls ceux de la BASE la quittent (les autres étaient déjà sur leur point).
    const partants = new Set(
      partyAdvs.value.filter((a) => originOfAdv(a.id) === 'base').map((a) => a.id),
    );
    const restants = freeStable.value.filter((a) => !partants.has(a.id));
    return departureRisk(
      b.defenses,
      heroLevel.value,
      inc,
      {
        hero: heroNow,
        guard: guardUnits(
          heroLevel.value,
          freeStable.value,
          cap.value,
          compCtx.value,
          milHome.value,
        ),
      },
      {
        hero: partyHeroOn.value ? null : heroNow,
        guard: guardUnits(heroLevel.value, restants, cap.value, compCtx.value, milHome.value),
      },
      { backAt: coarseNow.value + partyMin.value * 60_000, raidAt: raidAt.value },
    );
  });
  /** Pourquoi le groupe ne peut pas partir — la MÊME règle que le store (`partySendBlocker`). */
  const partySendBlock = computed(() =>
    selected.value
      ? // ⚔️⏱️ Une armée en marche qu'on n'interceptera pas avant son arrivée : la MÊME règle
        // que le store (`interceptTooLate`), sur l'aller annoncé juste au-dessus.
        !combined.value &&
        partySize.value > 0 &&
        interceptTooLate(selected.value, coarseNow.value, partyLeg.value)
        ? ('tooLate' as const)
        : partySendBlocker(
            selected.value,
            partyAdvs.value.length,
            partyHeroOn.value,
            cap.value,
            // 💀 Le 🎯 % déjà affiché : un départ perdu d'avance est refusé (sauf contre une
            // armée qu'on peut affaiblir) — le MÊME nombre que le store.
            partyGuardWin.value,
            coarseNow.value,
          )
      : null,
  );
  const canSendPartyNow = computed(
    () =>
      !!selected.value &&
      !partySendBlock.value &&
      !combinedBlock.value &&
      // ⚠️ TOUJOURS attendre la progression : avant son chargement le niveau vaut 1, et le
      // tirage des pièces d'aventurier (figé au départ) serait plafonné au plus bas rang.
      progressReady.value &&
      !busyParty.value,
  );
  /** 🗿 Combien de champions on peut engager — `partyCapFor` (le Panthéon), jamais une copie
   *  de la règle : l'écran doit empêcher exactement ce que le store refuse. */
  const partyMax = computed(() => partyCapFor(cap.value, selected.value));
  /** 👥 Le partage d'XP de l'équipe cochée — `missionXpSplit`, la règle du moteur. */
  const partyXpSplit = computed(
    () => missionXpSplit(partyAdvs.value.length) * (partyHeroOn.value ? 1 : SOLO_XP_MULT),
  );
  /** 🔮 Ce que CHAQUE champion gagnerait sur le lieu visé (demandé). ⚠️ La règle vit en lib
   *  (`missionXpPreview`), qui appelle `missionXpFor` — ce que le store verse vraiment :
   *  une seconde formule d'affichage finirait par annoncer une XP que l'encaissement dément. */
  const partyXp = computed<Record<string, MissionXpPreview>>(() =>
    selected.value
      ? missionXpPreview(
          char.advList,
          partyEscort.value,
          selected.value,
          char.pantheonLevel,
          !!partyHeroOn.value,
          // 🎯 L'XP annoncée est PONDÉRÉE par la chance de victoire (signalé : un champion seul
          // contre une armée annonçait l'XP d'une victoire). Coché : le 🎯 % de l'équipe ;
          // non coché : ce % + ce qu'il apporterait (`partyGain`, les MÊMES nombres que les
          // tuiles). Inconnu tant que le calcul par morceaux n'est pas arrivé.
          (id) => {
            const g = partyGain.value[id];
            if (partyEscort.value.includes(id))
              return partyWin.value === null ? null : partyWin.value / 100;
            return g == null ? null : ((partyWin.value ?? 0) + g) / 100;
          },
        )
      : {},
  );
  /** La note ne s'affiche que si un champion DISPONIBLE y perd : sinon c'est du bruit. */
  const partyLowXp = computed(() =>
    partyPool.value.some((a) => partyXp.value[a.id]?.full === false),
  );
  /** Vrai quand on ne peut plus en cocher — pour le dire AVANT qu'on essaie. */
  const partyFull = computed(() => partyAdvs.value.length >= partyMax.value);
  /** Si le plafond baisse (Panthéon), on retire les derniers cochés plutôt que de laisser un
   *  envoi impossible à l'écran. */
  watch(partyMax, (max) => {
    if (partyEscort.value.length > max) partyEscort.value = partyEscort.value.slice(0, max);
  });

  function togglePartyAdv(id: string) {
    if (partyEscort.value.includes(id)) {
      partyEscort.value = partyEscort.value.filter((x) => x !== id);
      return;
    }
    // ⚠️ On REFUSE d'en ajouter un de trop plutôt que de laisser l'envoi échouer : un bouton
    // qui se grise après coup ne dit pas lequel est en trop.
    if (partyFull.value) return;
    partyEscort.value = [...partyEscort.value, id];
  }
  /** 🧭 Toucher un lieu de départ : tous ses champions cochés, ou tous décochés s'ils l'étaient
   *  déjà (demandé). Borné par le plafond de l'équipe, comme un toucher par champion. */
  function togglePartyGroup(ids: readonly string[]) {
    partyEscort.value = toggleOriginGroup(partyEscort.value, ids, partyMax.value);
  }
  /** État d'un lieu pour son titre : 'all' tout coché, 'some' en partie, 'none' rien. */
  function partyGroupState(ids: readonly string[]): 'all' | 'some' | 'none' {
    const n = ids.filter((id) => partyEscort.value.includes(id)).length;
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  }
  /** ✨ Tout le vivier disponible d'un geste (et de nouveau pour tout retirer) : un repaire
   *  de taille 10 demande dix aventuriers, dix toucher de suite serait une corvée. */
  /** Ce que « tout le vivier » peut réellement prendre ici. */
  const partyAllIds = computed(() =>
    partyPoolSorted.value.slice(0, partyMax.value).map((a) => a.id),
  );
  const partyAllOn = computed(
    () => partyAllIds.value.length > 0 && partyAdvs.value.length === partyAllIds.value.length,
  );
  function togglePartyAll() {
    // ⚠️ Bornée par le lieu : sur une faille, « tout le vivier » ne peut pas en envoyer dix.
    partyEscort.value = partyAllOn.value ? [] : [...partyAllIds.value];
  }
  /** Le bouton dit OÙ l’on va : un camp se prend, une faille se referme. */
  const partySendLabel = computed(() => {
    if (!partySize.value) return 'Choisis ton groupe';
    // ⚠️ Le bouton DIT le refus, il ne se contente pas d'être gris.
    if (partySendBlock.value === 'hopeless') return '💀 Perdu d’avance';
    if (partySendBlock.value === 'tooLate') return '⏱️ Trop tard';
    if (!teamOnly.value) return `🧺 Envoyer l’équipe (${partySize.value})`;
    return selectedRift.value
      ? `🌀 Entrer dans la faille (${partySize.value})`
      : `⚔️ Attaquer le camp (${partySize.value})`;
  });
  async function doSendParty() {
    const uid = auth.user?.id;
    const poi = selected.value;
    if (!uid || !poi || !canSendPartyNow.value) return;
    await settleDueSiege();
    // ⚠️ Retenu AVANT l’envoi : `selected` est remis à null au succès, donc le lire après
    // coup pour choisir le message dirait toujours « camp ».
    const isRift = !!selectedRift.value;
    const isHarvest = !teamOnly.value;
    const isCombined = combined.value;
    busyParty.value = true;
    try {
      const refused = combined.value
        ? await char.sendCombinedAttack(uid, poi, {
            wings: wingPlan.value.map((w) => ({
              originId: wingOriginId(w.id),
              escortIds: w.ids,
              hero: w.hero ? heroForParty.value : null,
            })),
            playerLevel: partyHeroOn.value ? progressionLevel.value : heroLevel.value,
            now: Date.now(),
            supplies: activeSupplies.value,
            ...(stayCap.value ? { stayIds: stayIds.value } : {}),
          })
        : await char.sendParty(uid, poi, {
            hero: heroForParty.value,
            escortIds: partyAdvs.value.map((a) => a.id),
            // AVEC le héros : le niveau que `expeSend` passait (progression en donjon) — son butin
            // ne change pas. SANS lui : le niveau de SPORT, comme les convois (pièces d'aventurier).
            playerLevel: partyHeroOn.value ? progressionLevel.value : heroLevel.value,
            now: Date.now(),
            supplies: activeSupplies.value,
            ...(stayCap.value ? { stayIds: stayIds.value } : {}),
            ...(originPoi.value ? { fromControlId: originPoi.value.id } : {}),
            ...(heroStays.value ? { heroStays: true } : {}),
          });
      if (!refused) selected.value = null;
      // ⚠️ La RAISON du refus vient du store : un message générique laissait deviner qui bloquait.
      $q.notify(
        refused
          ? { type: 'negative', message: `Départ impossible : ${refused}.` }
          : {
              type: 'positive',
              message: isCombined
                ? '⚔️🧭 Attaque combinée lancée : chaque groupe partira à son heure.'
                : isHarvest
                  ? '🧺 L’équipe part en récolte.'
                  : isRift
                    ? '🌀 L’équipe s’enfonce dans la faille.'
                    : '⚔️ L’équipe marche sur le camp.',
            },
      );
    } finally {
      busyParty.value = false;
    }
  }

  /** 🧝 Le héros reste-t-il ? La MÊME règle que le store (`heroStaysAt`). */
  const heroStays = computed(
    () =>
      !combined.value &&
      partyHeroOn.value &&
      heroStaysAt(selected.value, partyAdvs.value.length, partyHeroStay.value),
  );
  /** Places de CHAMPION du point visé (0 hors point de contrôle). 🧝 Le héros qui y reste en
   *  prend 2 sur les 5 (`champSeatsWithHero`, la MÊME règle que le store). */
  const stayCap = computed(() => {
    const c = selected.value?.control;
    return c && c.owner === 'enemy' ? champSeatsWithHero(c, heroStays.value) : 0;
  });
  /** Ceux qui resteront : les choisis d'abord, complétés par l'ordre de l'équipe. */
  const stayIds = computed(() => {
    const ids = partyAdvs.value.map((a) => a.id);
    const picked = partyStay.value.filter((id) => ids.includes(id));
    return [...picked, ...ids.filter((id) => !picked.includes(id))].slice(0, stayCap.value);
  });
  /** 🎲 Le pronostic se juge contre les assaillants les plus forts possibles (tirés entre Bronze
   *  et le rang du héros) : la tenue affichée est un PLANCHER, jamais une promesse. */
  const heldAt = (p: Poi): Poi => ({ ...p, level: Math.max(1, heroLevel.value) });
  /** 🛡️ La part des attaques que la garnison CHOISIE repoussera — renfort ennemi compris,
   *  donc jamais plus de `CONTROL.maxHold` (la même règle que la bataille). ⚠️ Sans horloge :
   *  ne se recalcule qu'au changement de lieu ou de garnison, pas à chaque tick. */
  const stayHold = computed(() => {
    const p = selected.value;
    // 🧝 Le héros qui reste défend avec eux (la bataille du store le compte, `heroUnit`).
    const hero = heroStays.value ? heroForParty.value : null;
    if (!p || (!stayCap.value && !hero)) return null;
    const ids = new Set(stayIds.value);
    const g = partyAdvs.value.filter((a) => ids.has(a.id));
    return g.length || hero
      ? Math.round(
          garrisonHold(
            heldAt(p),
            partyAllies(g, roadCtx.value, hero),
            char.fortifyFor(heroLevel.value),
          ) * 100,
        )
      : null;
  });
  /** 🌿 Un point à UNE place : la tenue de chaque candidat, pour choisir qui reste. */
  const stayHoldOf = computed<Record<string, number>>(() => {
    const p = selected.value;
    if (!p || stayCap.value !== 1 || partyAdvs.value.length < 2) return {};
    return Object.fromEntries(
      partyAdvs.value.map((a) => [
        a.id,
        Math.round(
          garrisonHold(
            heldAt(p),
            partyAllies([a], roadCtx.value, null),
            char.fortifyFor(heroLevel.value),
          ) * 100,
        ),
      ]),
    );
  });
  /** 🧝 Le choix ne se pose que sur un point ordinaire avec des champions : à la forteresse, ou
   *  seul, le héros reste d'office. */
  const heroStayChoice = computed(
    () =>
      !combined.value &&
      partyHeroOn.value &&
      heroCanStay(selected.value) &&
      selected.value?.control?.kind !== 'fortress' &&
      partyAdvs.value.length > 0,
  );

  /** Le choix n'a de sens que si l'équipe dépasse les places. */
  const stayChoice = computed(() => stayCap.value > 0 && partyAdvs.value.length > stayCap.value);
  function toggleStay(id: string) {
    if (stayIds.value.includes(id)) {
      partyStay.value = partyStay.value.filter((x) => x !== id);
      // Retiré : il cède sa place au premier de l'équipe qui ne restait pas.
      const next = partyAdvs.value.find((a) => a.id !== id && !stayIds.value.includes(a.id));
      if (next) partyStay.value = [...stayIds.value.filter((x) => x !== id), next.id];
    } else partyStay.value = [id, ...partyStay.value.filter((x) => x !== id)];
  }

  return {
    partyGain,
    combined,
    wingPlan,
    combinedBlock,
    originOptions,
    partyGroups,
    originPoi,
    partyPoolSorted,
    stayCap,
    stayHold,
    stayHoldOf,
    stayIds,
    stayChoice,
    toggleStay,
    partyHeroStay,
    heroStays,
    heroStayChoice,
    partyHero,
    partyEscort,
    partyAdvs,
    showBlocked,
    partyBlocked,
    partyHeroBlock,
    partyHeroOn,
    partySize,
    supplyRows,
    toggleSupply,
    partyRoad,
    partyWin,
    fortressAllWin,
    partyGuardWin,
    partyRoute,
    partyLeg,
    partyWonLeg,
    partyMin,
    partyRisk,
    partySendBlock,
    canSendPartyNow,
    partyMax,
    partyXpSplit,
    partyXp,
    partyLowXp,
    togglePartyAdv,
    togglePartyGroup,
    partyGroupState,
    partyAllIds,
    partyAllOn,
    togglePartyAll,
    partySendLabel,
    doSendParty,
  };
}
