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
  heroPickShown as heroPickShownFor,
  partyHeroBlocker,
  partyLegMin,
  partySendBlocker,
  heroCanStay,
  heroStaysAt,
  interceptLeg,
  interceptReach,
  interceptTooLate,
  meetAll,
  supplyTarget,
} from '@/lib/party';
import {
  FORECAST_SAMPLES,
  firstAidGain,
  partyRoadOdds,
  partyWinChance,
  pctGain,
  roadPctGain,
  roadSurePct,
  teamWinPct,
  type GainTeam,
  type TeamPct,
} from '@/lib/partyForecast';
import { champSeatsWithHero, holdSeats, garrisonHold } from '@/lib/controlPoints';
import { legFromSpot, readyGarrisons } from '@/lib/controlRoutes';
import { memberTripDelta } from '@/lib/tripDelta';
import { formatHaulDelta, haulDelta, poiTeamHaul } from '@/lib/poiYield';
import { conditionFx } from '@/lib/islandCondition';
import { heroPostOf, heroSpotOf } from '@/lib/islandConquest';
import {
  COMBINED_BLOCK_LABEL,
  byReach,
  combinedBlocker,
  originGroupState,
  originGroupsWithSomeone,
  toggleOriginGroupWithHero,
  togglePoolWithHero,
  wingOriginId,
} from '@/lib/combinedAttack';
import { SUPPLIES, SUPPLY_IDS, supplyUselessWhy, type SupplyId } from '@/lib/supplies';
import { advGearRoles } from '@/lib/advGear';
import {
  droppedLabel,
  parseLastTeam,
  restoreLastTeam,
  serializeLastTeam,
  type LastTeam,
} from '@/lib/lastTeam';
import { departureRisk, guardUnits, type BaseState, type Raid } from '@/lib/raid';
import {
  advUnavailableReason,
  advXpCapped,
  sortByGradeThenRank,
  type Adventurer,
} from '@/lib/adventurers';
import {
  missionXpPreview,
  missionXpSplit,
  partyAllies,
  roleShare,
  SOLO_XP_MULT,
  type EscortKit,
  type MissionXpPreview,
  type PartyHero,
} from '@/lib/caravan';
import type { Combatant } from '@/lib/combat';
import { isFieldArmyPoi, isWarbandPoi, poiEmo, poiLabel, type Poi } from '@/lib/expedition';
import { attackForecast, interceptForecast } from '@/lib/defenseForecast';
import { attackView, interceptView, type ForecastView } from '@/lib/forecastChips';
import { wearsDown } from '@/lib/enemyWear';

/** Un lieu de départ tel que l'écran le liste (cf. `partyGroups`). */
type OriginGroup = { id: string; advs: readonly Adventurer[] };
const idsOf = (g: OriginGroup) => g.advs.map((a) => a.id);

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
  /** 🧝 Le héros reste-t-il en garnison si le point est pris (étape 6 bis) ? `undefined` = pas
   *  de choix : il reste s'il a sa place après les champions (`heroStaysAt`). */
  const partyHeroStay = ref<boolean | undefined>(undefined);
  /** 🪄 Une équipe proposée par le planificateur, à poser sur le lieu qu'on ouvre : elle
   *  remplace la remise à zéro quand la sélection arrive sur CE lieu (sinon les deux watchers
   *  ci-dessous l'effaceraient aussitôt). */
  let pendingTeam: { poiId: string; advs: string[]; hero: boolean; supplies: SupplyId[] } | null =
    null;
  watch(selected, (p) => {
    const t = pendingTeam && p?.id === pendingTeam.poiId ? pendingTeam : null;
    partyHero.value = t?.hero ?? false;
    partyEscort.value = t ? [...t.advs] : [];
    partyStay.value = [];
    partyHeroStay.value = undefined;
  });
  /** ⚠️ Une CHAÎNE (point → ids prêts) recalculée au tick, qui ne réveille les listes que si
   *  quelqu'un change d'état — même principe que `freeKey` de la page. « Prêt à sortir » est
   *  la règle de la lib (`readyGarrisons`), partagée avec le grisage de la carte. */
  const garrisonKey = computed(() =>
    [...readyGarrisons(char.row?.expedition_map, char.advList, now.value)]
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
          emo: poiEmo(p),
          label: poiLabel(p),
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
  /** 🧝 Son lieu fixe même quand il est dehors (sortie, marche vers son poste) : sa tuile se
   *  range sous ce lieu, pas sous la base (signalé). Dehors, il est bloqué
   *  (`partyHeroBlock`) : ce lieu ne sert qu'à le montrer au bon endroit. */
  const heroSpot = computed(
    () =>
      heroSpotOf(
        char.row?.expedition_map,
        char.row?.expedition,
        char.attackList.flatMap((a) => a.wings),
      ) ?? null,
  );
  const heroOriginId = computed(() => heroSpot.value?.id ?? 'base');
  /** Les points de départ possibles, le lieu du héros compris même sans champion prêt. */
  const startOptions = computed(() => {
    const p = heroSpot.value;
    if (!p?.control || originOptions.value.some((o) => o.id === p.id)) return originOptions.value;
    return [
      ...originOptions.value,
      {
        id: p.id,
        poi: p,
        emo: poiEmo(p),
        label: poiLabel(p),
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
  /** 🧝 La tuile du héros n'est pas proposée quand il est indisponible (`heroPickShown`). */
  const heroPickShown = computed(() => heroPickShownFor(partyHeroBlock.value));
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
    (id) => {
      const t = pendingTeam && id === pendingTeam.poiId ? pendingTeam : null;
      chosenSupplies.value = t ? [...t.supplies] : [];
      pendingTeam = null;
    },
  );
  /** 🪄 Ouvre un lieu « comme un envoi manuel » avec l'équipe que le planificateur proposait :
   *  champions, héros et consommables déjà cochés, modifiables avant de lancer. À appeler
   *  AVANT de sélectionner le lieu ; s'il l'est déjà, l'équipe est posée tout de suite. */
  function prefillTeam(t: { poiId: string; advs: string[]; hero: boolean; supplies: SupplyId[] }) {
    if (selected.value?.id === t.poiId) {
      partyHero.value = t.hero;
      partyEscort.value = [...t.advs];
      chosenSupplies.value = [...t.supplies];
      pendingTeam = null;
    } else pendingTeam = t;
  }
  /** ↻ La dernière équipe ENVOYÉE, mémorisée par appareil (confort : pas de migration). */
  const lastTeamKey = () => `muscu:lastTeam:${auth.user?.id ?? ''}`;
  const lastTeam = ref<LastTeam | null>(null);
  const lastTeamNote = ref('');
  function refreshLastTeam() {
    try {
      lastTeam.value = auth.user?.id ? parseLastTeam(localStorage.getItem(lastTeamKey())) : null;
    } catch {
      lastTeam.value = null;
    }
  }
  function rememberTeam(t: LastTeam) {
    lastTeam.value = t;
    try {
      localStorage.setItem(lastTeamKey(), serializeLastTeam(t));
    } catch {
      /* stockage indisponible : le confort s'en passe */
    }
  }
  refreshLastTeam();
  watch(selected, () => {
    lastTeamNote.value = '';
    refreshLastTeam();
  });
  /** La dernière équipe, posée sur le lieu ouvert — filtrée par les règles d'envoi existantes. */
  function restoreTeam() {
    const last = lastTeam.value;
    if (!last || !selected.value) return;
    const r = restoreLastTeam(last, {
      allIds: char.advList.map((a) => a.id),
      poolIds: partyPool.value.map((a) => a.id),
      max: partyMax.value,
      heroOk: heroPickShown.value && !partyHeroBlock.value,
      stock: char.row?.supplies ?? {},
    });
    partyEscort.value = r.advs;
    partyHero.value = r.hero;
    chosenSupplies.value = r.supplies;
    const why = droppedLabel(r.dropped);
    lastTeamNote.value = why ? `Pas repris : ${why}` : '';
  }
  /** Libellé du bouton : combien de champions la dernière équipe comptait. */
  const lastTeamLabel = computed(() => {
    const t = lastTeam.value;
    if (!t) return '';
    const n = t.advs.length + (t.hero ? 1 : 0);
    return `↻ Même équipe (${n})`;
  });
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
  /** 🔮 CE QUE LE COMBAT COÛTERA ET RAPPORTERA, en pastilles (`defenseForecast.ts`) : l'usure de
   *  la troupe ennemie si l'assaut échoue, la part abattue d'une armée interceptée, et NOS pertes
   *  (miliciens, blessés) par issue. ⚠️ Rejoue le combat sur des graines de pronostic, comme le
   *  🎯 % ; ne lit ni l'horloge ni rien d'autre que le lieu, l'équipe et son kit : le `computed`
   *  le mémoïse (96 combats par changement d'équipe). Rien tant que l'équipe est vide. */
  const partyBattleView = computed<ForecastView | null>(() => {
    const p = aimed.value;
    if (!p || !partySize.value) return null;
    const hero = heroForParty.value;
    if (isFieldArmyPoi(p)) {
      const f = interceptForecast(p, partyAdvs.value, partyRoad.value, hero);
      return f ? interceptView(f) : null;
    }
    if (p.type !== 'control' && p.type !== 'camp' && p.type !== 'lair') return null;
    const f = attackForecast(p, partyAdvs.value, partyRoad.value, hero);
    return f ? attackView(f, p.type === 'control' && wearsDown(p.control)) : null;
  });
  /** 🏰👥 LA FORTERESSE ENNEMIE, TOUT LE MONDE RÉUNI (demandé) : le 🎯 % si le joueur
   *  rassemblait TOUS ses champions (occupés, postés ou blessés compris) et son héros — un
   *  repère « est-elle à ma portée ? », pas une équipe qu'on peut envoyer telle quelle. Même
   *  dispatch que l'équipe (`partyWinChance`), sans consommables. `null` hors forteresse
   *  ennemie. Lu aussi par la carte, sous la forteresse (`fortressOddsKey`). */
  function allInWin(p: Poi): number | null {
    if (p.control?.kind !== 'fortress' || p.control.owner === 'player') return null;
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
  }
  const fortressAllWin = computed(() => (aimed.value ? allInWin(aimed.value) : null));
  /** 🎯➕ CE QUE CHAQUE MEMBRE APPORTE à la réussite, en points (`winGain`), par rapport à
   *  l'équipe COCHÉE : un champion non coché s'y ajoute, un coché en est retiré. Clé `hero`
   *  pour le héros.
   *  ⚠️ CALCULÉ PAR MORCEAUX, jamais d'un bloc : un 🎯 % coûte jusqu'à ~25 ms (mesuré, une mine
   *  ou une faille), deux par tuile, et un vivier en compte des dizaines — d'un bloc, l'écran
   *  se figerait plus d'une seconde à chaque case cochée. On rend la main entre deux tuiles,
   *  les chiffres apparaissent au fil de l'eau, et un nouveau changement d'équipe annule le
   *  calcul en cours (`gainRun`). Horloge grossière, comme le 🎯 %.
   *  ⚠️ LES GARDES SEULS (`winGain(…, false)`) : sur une récolte sans le héros, l'écran affiche
   *  « 🎯 Gardes » et « 🛣️ Route » à part, et la tuile annonçait leur PRODUIT, un chiffre montré
   *  nulle part (signalé : +2 % sur la tuile, 6 points sur la pastille). La route a son apport à
   *  elle, `partyRoadGain`. Ailleurs la route ne se joue pas : le chiffre ne change pas.
   *  ⚠️ La cible est `aimed` (la bande de faille amputée), celle du 🎯 % de l'équipe. */
  const partyGain = ref<Record<string, number | null>>({});
  /** 🛣️➕ Ce que chaque champion change à la route d'une récolte sans le héros (`roadGain`), en
   *  points de la pastille « 🛣️ … % sûre ». Absent quand la route ne se joue pas. */
  const partyRoadGain = ref<Record<string, number | null>>({});
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
      combined.value,
      aimed.value?.riftCut ?? 0,
    ].join('|');
  });
  let gainRun = 0;
  watch(
    gainKey,
    async (key) => {
      const run = ++gainRun;
      partyGain.value = {};
      partyRoadGain.value = {};
      const p = aimed.value;
      if (!key || !p) return;
      const cur: GainTeam = { escort: partyAdvs.value, hero: heroForParty.value };
      const road = partyRoad.value;
      const now = coarseNow.value;
      const isCombined = combined.value;
      const pctOf = (t: GainTeam) => teamWinPct(p, t, road, now, undefined, false);
      // 🛣️ `null` quand la route ne se joue pas : la règle de la pastille (`partyRoadOdds`).
      const roadOf = (e: Adventurer[]) => roadSurePct(p, e, road, cur.hero, isCombined);
      // ⚠️ L'équipe COCHÉE est l'un des deux côtés de chaque apport : simulée UNE fois (premier
      // morceau), pas une fois par tuile.
      let baseWin: TeamPct = null;
      let baseRoad: number | null = null;
      const jobs: (() => void)[] = [
        () => {
          baseWin = pctOf(cur);
          baseRoad = roadOf(cur.escort);
        },
      ];
      // Avec lui moins sans lui : coché, l'équipe cochée est le côté « avec ».
      const swing = (inTeam: boolean, other: TeamPct) =>
        inTeam ? pctGain(baseWin, other) : pctGain(other, baseWin);
      const hero = heroCandidate.value;
      if (hero) {
        const heroOn = partyHeroOn.value;
        jobs.push(() => {
          partyGain.value.hero = swing(
            heroOn,
            pctOf({ escort: cur.escort, hero: heroOn ? null : hero }),
          );
        });
      }
      for (const a of partyPoolSorted.value) {
        const inTeam = cur.escort.some((x) => x.id === a.id);
        const { without, withA } = teamsAround(a);
        const other = inTeam ? without : withA;
        jobs.push(() => {
          partyGain.value[a.id] = swing(inTeam, pctOf({ escort: other, hero: cur.hero }));
          const r = roadOf(other);
          partyRoadGain.value[a.id] = inTeam ? roadPctGain(baseRoad, r) : roadPctGain(r, baseRoad);
        });
      }
      for (const job of jobs) {
        await new Promise((r) => setTimeout(r, 0));
        if (run !== gainRun) return;
        job();
      }
    },
    { immediate: true },
  );
  /** L'équipe cochée SANS `a` et AVEC `a`, dans l'ordre du vivier (celui de `partyAdvs` une fois
   *  la case touchée) : la paire dont chaque apport de la tuile est l'écart. */
  function teamsAround(a: Adventurer): { without: Adventurer[]; withA: Adventurer[] } {
    const ids = new Set(partyEscort.value).add(a.id);
    return {
      without: partyAdvs.value.filter((x) => x.id !== a.id),
      withA: partyPool.value.filter((x) => ids.has(x.id)),
    };
  }
  /** ⛑️➕ Ce que chaque champion change aux PREMIERS SECOURS de la troupe (`firstAidGain`), en
   *  points de « chance qu'un blessé évite l'infirmerie ». Instantané : aucun combat à rejouer. */
  const partyHealGain = computed(() => {
    const out: Record<string, number> = {};
    if (!selected.value) return out;
    for (const a of partyPool.value) {
      const { without, withA } = teamsAround(a);
      out[a.id] = firstAidGain(withA, without);
    }
    return out;
  });
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
    return partyRoadOdds(
      p,
      partyAdvs.value,
      partyRoad.value,
      heroForParty.value,
      FORECAST_SAMPLES,
      combined.value,
    );
  });
  /** 🧭 Trajet ALLER (minutes) vers la cible depuis un lieu de départ (`null` = la base),
   *  pour un groupe donné — la MÊME règle que le store (`partyLegMin`, `legFromSpot`). */
  function legFrom(origin: Poi | null, members: Adventurer[], hero = false): number {
    const target = selected.value;
    if (!target) return 0;
    return legFnFrom(origin, members, hero, activeSupplies.value)(target);
  }
  /** La règle de trajet d'un groupe donné, depuis son lieu de départ, avec ces consommables. */
  function legFnFrom(
    origin: Poi | null,
    members: Adventurer[],
    hero: boolean,
    supplies: readonly SupplyId[],
  ): (p: Poi) => number {
    const legOf = (p: Poi) =>
      partyLegMin(p, members, {
        hero,
        travelMult: travelMult.value,
        gearSpeed: advGearRoles(members, roadCtx.value.advGear).speed,
        supplies,
      });
    return origin ? (p: Poi) => legFromSpot(p, origin, legOf) : legOf;
  }
  /** ⚔️⏱️ QUI ARRIVERA À TEMPS sur une armée en marche (demandé) — par membre, depuis SON lieu
   *  de départ (`interceptReach`, la règle de l'envoi) : `ok` montré, `aid` signalé avec ce qui le
   *  ferait arriver (🧭 un éclaireur parti du même lieu — sa compétence presse tout le groupe —,
   *  🥖 des rations), `late` signalé (jamais masqué). Les boosts ⚡ ne figurent pas dans les aides :
   *  ils s’utilisent EN ROUTE (`reMeet` recalcule alors la rencontre).
   *  Vide hors armée en marche. Horloge grossière : la rencontre bouge à la minute. */
  const interceptInfo = computed(() => {
    const out = new Map<string, ReturnType<typeof interceptReach>>();
    const target = selected.value;
    if (!target || !isWarbandPoi(target)) return out;
    const t = coarseNow.value;
    const sup = activeSupplies.value;
    const rations = !sup.includes('rations') && (char.row?.supplies?.rations ?? 0) > 0;
    const withRations: readonly SupplyId[] = [...sup, 'rations'];
    const fast = (a: Adventurer) =>
      roleShare([a], 'speed') + advGearRoles([a], roadCtx.value.advGear).speed > 0;
    const originPoiOf = (id: string) =>
      id === 'base' ? null : (startOptions.value.find((o) => o.id === id)?.poi ?? null);
    // 🧝 Le héros n'a pas de rôle : seules les rations le pressent.
    if (!partyHeroBlock.value) {
      const o = originPoiOf(heroOriginId.value);
      const aids = rations
        ? [{ label: '🥖 avec des rations', legOf: legFnFrom(o, [], true, withRations) }]
        : [];
      out.set('hero', interceptReach(target, t, legFnFrom(o, [], true, sup), aids));
    }
    for (const a of partyPool.value) {
      const oid = originOfAdv(a.id);
      const o = originPoiOf(oid);
      // Ceux du même lieu déjà cochés marchent avec lui : leur 🧭 le presse déjà.
      const mates = partyAdvs.value.filter((m) => m.id !== a.id && originOfAdv(m.id) === oid);
      const team = [...mates, a];
      const scouts = partyPool.value.filter(
        (s) => s.id !== a.id && !mates.includes(s) && originOfAdv(s.id) === oid && fast(s),
      );
      const all = [...team, ...scouts];
      // De la moins coûteuse à la plus coûteuse : un éclaireur ne se dépense pas, des rations si.
      const aids = [
        ...scouts.map((s) => ({
          label: `🧭 avec ${s.name}`,
          legOf: legFnFrom(o, [...team, s], false, sup),
        })),
        ...(scouts.length > 1
          ? [{ label: '🧭 avec ses éclaireurs', legOf: legFnFrom(o, all, false, sup) }]
          : []),
        ...(rations
          ? [{ label: '🥖 avec des rations', legOf: legFnFrom(o, team, false, withRations) }]
          : []),
        ...(scouts.length && rations
          ? [
              {
                label: '🥖🧭 rations + éclaireurs',
                legOf: legFnFrom(o, all, false, withRations),
              },
            ]
          : []),
      ];
      out.set(a.id, interceptReach(target, t, legFnFrom(o, team, false, sup), aids));
    }
    return out;
  });
  /** ⚔️⏱️ CE QUI LE FERAIT ARRIVER À TEMPS, ou qu'il arriverait trop tard (`null` = à temps).
   *  ⚠️ JAMAIS bloquant (2026-10-06, demandé : « on affiche tous les champions et héros ») : un
   *  boost ⚡ utilisé en route peut le faire arriver à temps ; l'envoi demande confirmation. */
  const interceptWarn = (id: string): string | null => {
    const r = interceptInfo.value.get(id);
    if (r?.kind === 'aid') return `⏱️ À temps ${r.label}`;
    if (r?.kind === 'late') return '⏱️ Trop tard sans boost ⚡';
    return null;
  };
  /** 🧭 Les lieux de départ (la base et les points tenus), du plus proche de la cible au plus
   *  loin (demandé). L'ORDRE se règle sur un groupe sans rôle (seule la distance compte) : il
   *  ne doit pas bouger quand on coche un champion. */
  const originTiles = computed(() =>
    byReach([
      {
        id: 'base',
        emo: '🏰',
        label: 'Base',
        n: freeStable.value.length,
        legMin: legFrom(null, [], false),
      },
      // 🧝 Le poste du héros a sa rangée même sans champion prêt (`startOptions`) — signalé :
      // le héros était montré à la base alors qu'il était à l'Ossuaire.
      ...startOptions.value.map((o) => ({
        id: o.id,
        emo: o.emo,
        label: o.label,
        n: o.n,
        legMin: legFrom(o.poi, [], false),
      })),
    ]),
  );
  /** ⏱️ Le trajet AFFICHÉ d'un lieu : celui des membres COCHÉS qui en partent (héros compris
   *  s'il y est et qu'il vient) — signalé : il prenait les compétences 🧭 de TOUTE la garnison,
   *  donc un temps qui changeait dès qu'on n'envoyait pas tout le monde. Personne de coché :
   *  le pas d'un groupe sans rôle. */
  function selectedLegFrom(id: string): number {
    const origin =
      id === 'base' ? null : (startOptions.value.find((o) => o.id === id)?.poi ?? null);
    const members = partyAdvs.value.filter((a) => originOfAdv(a.id) === id);
    const hero = id === heroOriginId.value && partyHeroOn.value;
    return legFrom(origin, members, hero);
  }
  /** ⏱️ Ce que chaque champion change au trajet de son lieu (`memberTripDelta`), en minutes
   *  d'aller-retour — le pendant « temps » du 🎯. Négatif = il fait aller le groupe plus vite. */
  const partyTripDelta = computed(() => {
    const out: Record<string, number> = {};
    if (!selected.value) return out;
    for (const a of partyPool.value) {
      const id = originOfAdv(a.id);
      const origin =
        id === 'base' ? null : (startOptions.value.find((o) => o.id === id)?.poi ?? null);
      const hero = id === heroOriginId.value && partyHeroOn.value;
      const picked = partyAdvs.value.filter((b) => originOfAdv(b.id) === id);
      out[a.id] = memberTripDelta(picked, a, (m) => legFrom(origin, m, hero));
    }
    return out;
  });
  /** 💰 Ce que chaque champion et chaque consommable change à la RÉCOLTE si le lieu est pris
   *  (demandé : « comme le % de réussite et le temps »), en texte signé (« +120 🪙 »). Même
   *  convention que le 🎯 et le ⏱️ : coché, ce qu'on perdrait sans lui ; non coché, ce qu'on
   *  gagnerait en l'ajoutant. `poiTeamHaul` = la règle de la fiche et de la résolution (bâts,
   *  porteurs 🐫, pièces de cargaison) ; un lieu qui ne se récolte pas ne bouge jamais. */
  const haulOf = (escort: Adventurer[], supplies: readonly SupplyId[]) => {
    const p = selected.value!;
    const heroGoes = partyHeroOn.value;
    return poiTeamHaul(p, {
      playerLevel: heroGoes ? progressionLevel.value : heroLevel.value,
      heroGoes,
      escort,
      kit: { ...roadCtx.value, supplies },
      conditionMult: condFx.value.goldOf(p.type),
    }).total;
  };
  const partyHaulDelta = computed(() => {
    const out: Record<string, string> = {};
    if (!selected.value || !partyTarget.value) return out;
    const sup = activeSupplies.value;
    for (const a of partyPool.value) {
      const without = partyAdvs.value.filter((b) => b.id !== a.id);
      out[a.id] = formatHaulDelta(haulDelta(haulOf([...without, a], sup), haulOf(without, sup)));
    }
    return out;
  });
  const supplyHaulDelta = computed(() => {
    const out: Partial<Record<SupplyId, string>> = {};
    if (!selected.value || !partyTarget.value) return out;
    const others = (id: SupplyId) => activeSupplies.value.filter((x) => x !== id);
    for (const r of supplyRows.value) {
      if (r.why) continue;
      out[r.id] = formatHaulDelta(
        haulDelta(
          haulOf(partyAdvs.value, [...others(r.id), r.id]),
          haulOf(partyAdvs.value, others(r.id)),
        ),
      );
    }
    return out;
  });
  /** 🧭 Les champions PAR LIEU de départ, du lieu le plus proche de la cible au plus loin
   *  (demandé) — dès qu'un point fixe tenu a des champions prêts, ou que le héros y est
   *  posté ; sinon la liste habituelle. */
  const partyGroups = computed(() => {
    if (!startOptions.value.length) return [];
    // 🙈 Un lieu sans champion prêt ni héros présent est caché (demandé).
    return originGroupsWithSomeone(
      originTiles.value.map((t) => {
        const all =
          t.id === 'base'
            ? freeSorted.value
            : sortByGradeThenRank(readyByPoint.value.get(t.id) ?? []);
        return { ...t, advs: all, legMin: selectedLegFrom(t.id) };
      }),
      heroAt.value,
    );
  });
  /** 🧝 Où le héros se trouve VRAIMENT : son poste, la base, ou `null` s'il est dehors. */
  const heroAt = computed(() =>
    heroPost.value ? heroPost.value.id : char.row && char.heroIsHome(char.row) ? 'base' : null,
  );
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
    return byReach(
      rows.map((r) => ({
        ...r,
        departInMin: longest - r.legMin,
      })),
    );
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
  /** ⚔️⏱️ LE GROUPE N'ARRIVERA PAS À TEMPS sur l'armée en marche — la MÊME règle que le store
   *  (`interceptTooLate` sur l'aller annoncé ; `meetAll` pour une attaque combinée). On peut
   *  partir quand même après confirmation (2026-10-06, demandé) : un boost ⚡ en route peut
   *  suffire, sinon l'équipe rentre sans combattre (`supersedeLate`). */
  const partyLate = computed(() => {
    const t = selected.value;
    if (!t || !isWarbandPoi(t) || !partySize.value) return false;
    if (combined.value) {
      const m = meetInfo.value;
      return !!m && (!m.joined || interceptTooLate(t, coarseNow.value, m.min));
    }
    return interceptTooLate(t, coarseNow.value, partyLeg.value);
  });
  /** ⚔️⏱️ Qui, dans la sélection, n'arriverait pas à temps : portrait et lieu de départ, pour la
   *  fenêtre de confirmation. Si personne seul n'est en retard (le pas du groupe), tout le monde. */
  const lateMembers = computed(() => {
    if (!partyLate.value) return [];
    const where = (oid: string) => {
      const o = oid === 'base' ? null : startOptions.value.find((x) => x.id === oid);
      return o ? `${o.emo} ${o.label}` : '🏰 Base';
    };
    const rows = [
      ...(partyHeroOn.value ? [{ id: 'hero', adv: null, where: where(heroOriginId.value) }] : []),
      ...partyAdvs.value.map((a) => ({ id: a.id, adv: a, where: where(originOfAdv(a.id)) })),
    ];
    const late = rows.filter((r) => (interceptInfo.value.get(r.id)?.kind ?? 'ok') !== 'ok');
    return late.length ? late : rows;
  });
  /** La fenêtre « ils arriveront trop tard » est ouverte. */
  const lateAsk = ref(false);
  /** Pourquoi le groupe ne peut pas partir — la MÊME règle que le store (`partySendBlocker`). */
  const partySendBlock = computed(() =>
    selected.value
      ? partySendBlocker(
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
  /** 🧑‍✈️ Les champions cochés déjà au maximum (rang et étoiles du héros) : ils ne prennent
   *  pas d'XP et ne comptent pas dans le partage (`missionXpFor`). */
  const partyMaxedCount = computed(
    () => partyAdvs.value.filter((a) => advXpCapped(a, char.heroLevel)).length,
  );
  /** 👥 Le partage d'XP de l'équipe cochée — `missionXpSplit`, la règle du moteur, entre ceux
   *  qui peuvent encore apprendre. */
  const partyXpSplit = computed(
    () =>
      missionXpSplit(partyAdvs.value.length - partyMaxedCount.value) *
      (partyHeroOn.value ? 1 : SOLO_XP_MULT),
  );
  /** 🔮 Ce que CHAQUE champion gagnerait sur le lieu visé (demandé). ⚠️ La règle vit en lib
   *  (`missionXpPreview`), qui appelle `missionXpFor` — ce que le store verse vraiment :
   *  une seconde formule d'affichage finirait par annoncer une XP que l'encaissement dément. */
  /** 🌗 La condition d'île du moment : l'envoi la lit à son heure (`partyOutcomeFor`). */
  const condFx = computed(() => conditionFx(char.row?.expedition_map, now.value));
  const partyXp = computed<Record<string, MissionXpPreview>>(() => {
    const raw = selected.value ? partyXpRaw() : {};
    const k = condFx.value.xp;
    if (k === 1) return raw;
    // 🍃 « Vents calmes » : les MÊMES nombres que le store verse (`scaleXp`).
    return Object.fromEntries(
      Object.entries(raw).map(([id, v]) => [
        id,
        { ...v, xp: Math.round(v.xp * k), xpWin: Math.round(v.xpWin * k) },
      ]),
    );
  });
  const partyXpRaw = (): Record<string, MissionXpPreview> =>
    selected.value
      ? missionXpPreview(
          char.advList,
          partyEscort.value,
          selected.value,
          char.pantheonLevel,
          char.heroLevel,
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
      : {};
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
   *  déjà (demandé). Borné par le plafond de l'équipe, comme un toucher par champion. Le héros
   *  posté sur ce lieu fixe part et revient avec eux (demandé). */
  function togglePartyGroup(g: OriginGroup) {
    const r = toggleOriginGroupWithHero(
      partyEscort.value,
      idsOf(g),
      partyMax.value,
      heroPostedAt(g.id),
      partyHeroOn.value,
    );
    partyEscort.value = r.escort;
    partyHero.value = r.hero;
  }
  /** 🧝 Le héros est posté sur CE lieu fixe et peut partir : « tous » l'emmène. La base n'est
   *  pas concernée — y cocher « tous » ne l'engage pas. */
  function heroPostedAt(groupId: string): boolean {
    return groupId !== 'base' && groupId === heroOriginId.value && !partyHeroBlock.value;
  }
  /** État d'un lieu pour son titre : 'all' tout coché, 'some' en partie, 'none' rien. */
  function partyGroupState(g: OriginGroup): 'all' | 'some' | 'none' {
    return originGroupState(partyEscort.value, idsOf(g), heroPostedAt(g.id), partyHeroOn.value);
  }
  /** ✨ Tout le vivier disponible d'un geste (et de nouveau pour tout retirer) : un repaire
   *  de taille 10 demande dix aventuriers, dix toucher de suite serait une corvée. */
  /** Ce que « tout le vivier » peut réellement prendre ici. */
  const partyAllIds = computed(() =>
    partyPoolSorted.value
      // ⚔️⏱️ Seulement ceux qui arrivent à temps : un retardataire bloquerait l'envoi.
      .filter((a) => (interceptInfo.value.get(a.id)?.kind ?? 'ok') === 'ok')
      .slice(0, partyMax.value)
      .map((a) => a.id),
  );
  const partyAllAdvsOn = computed(
    () => partyAllIds.value.length > 0 && partyAdvs.value.length === partyAllIds.value.length,
  );
  /** 🧝 Posté sur un lieu fixe, le héros part avec « tous », comme avec le « tous » du lieu. */
  const partyAllHero = computed(() => heroPostedAt(heroOriginId.value));
  const partyAllOn = computed(
    () => partyAllAdvsOn.value && (!partyAllHero.value || partyHeroOn.value),
  );
  function togglePartyAll() {
    // ⚠️ Bornée par le lieu : sur une faille, « tout le vivier » ne peut pas en envoyer dix.
    const r = togglePoolWithHero(
      partyAllIds.value,
      partyAllAdvsOn.value,
      partyAllHero.value,
      partyHeroOn.value,
    );
    partyEscort.value = r.escort;
    partyHero.value = r.hero;
  }
  /** Le bouton dit OÙ l’on va : un camp se prend, une faille se referme. */
  const partySendLabel = computed(() => {
    if (!partySize.value) return 'Choisis ton groupe';
    // ⚠️ Le bouton DIT le refus, il ne se contente pas d'être gris.
    if (partySendBlock.value === 'hopeless') return '💀 Perdu d’avance';
    if (partyLate.value) return `⏱️ Envoyer quand même (${partySize.value})`;
    if (!teamOnly.value) return `🧺 Envoyer l’équipe (${partySize.value})`;
    return selectedRift.value
      ? `🌀 Entrer dans la faille (${partySize.value})`
      : `⚔️ Attaquer le camp (${partySize.value})`;
  });
  async function doSendParty(lateOk = false) {
    const uid = auth.user?.id;
    const poi = selected.value;
    if (!uid || !poi || !canSendPartyNow.value) return;
    // ⚔️⏱️ Trop tard pour croiser l'armée : on prévient d'abord (fenêtre de confirmation).
    if (partyLate.value && !lateOk) {
      lateAsk.value = true;
      return;
    }
    lateAsk.value = false;
    await settleDueSiege();
    busyParty.value = true;
    const sentTeam: LastTeam = {
      advs: partyAdvs.value.map((a) => a.id),
      hero: partyHeroOn.value,
      supplies: [...activeSupplies.value],
    };
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
            ...(lateOk ? { lateOk: true } : {}),
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
            // 🧝 La décision AFFICHÉE (choix ou place libre) : le store ne la redevine pas.
            ...(partyHeroOn.value ? { heroStays: heroStays.value } : {}),
            ...(lateOk ? { lateOk: true } : {}),
          });
      if (!refused) {
        rememberTeam(sentTeam);
        selected.value = null;
      }
      // ⚠️ La RAISON du refus vient du store : un message générique laissait deviner qui bloquait.
      // 🔕 Un départ réussi ne se confirme plus par un toast : la tuile du voyage le montre.
      if (refused) $q.notify({ type: 'negative', message: `Départ impossible : ${refused}.` });
    } finally {
      busyParty.value = false;
    }
  }

  /** 🧝 Le héros reste-t-il ? La MÊME règle que le store (`heroStaysAt`) : sans choix, il
   *  reste s'il a sa place après les champions qui restent (les choisis, sinon l'équipe). */
  const heroStays = computed(() => {
    if (combined.value || !partyHeroOn.value) return false;
    const c = selected.value?.control;
    const seats = c && c.owner === 'enemy' ? holdSeats(c) : 0;
    const ids = partyAdvs.value.map((a) => a.id);
    const picked = partyStay.value.filter((id) => ids.includes(id));
    const champs = Math.min((picked.length ? picked : ids).length, seats);
    return heroStaysAt(selected.value, champs, partyHeroStay.value, seats);
  });
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
            // 🪵 Un point qu'on PREND n'a pas encore de palissade.
            null,
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
            null,
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
    partyRoadGain,
    partyHealGain,
    partyTripDelta,
    partyHaulDelta,
    supplyHaulDelta,
    combined,
    wingPlan,
    combinedBlock,
    originOptions,
    heroOriginId,
    partyGroups,
    originPoi,
    partyPoolSorted,
    interceptWarn,
    partyLate,
    lateMembers,
    lateAsk,
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
    heroPickShown,
    partyHeroOn,
    partySize,
    supplyRows,
    toggleSupply,
    partyRoad,
    partyWin,
    partyBattleView,
    fortressAllWin,
    allInWin,
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
    partyMaxedCount,
    partyXp,
    partyLowXp,
    togglePartyAdv,
    togglePartyGroup,
    partyGroupState,
    heroPostedAt,
    partyAllIds,
    partyAllOn,
    partyAllHero,
    togglePartyAll,
    partySendLabel,
    doSendParty,
    prefillTeam,
    lastTeam,
    lastTeamLabel,
    lastTeamNote,
    restoreTeam,
  };
}
