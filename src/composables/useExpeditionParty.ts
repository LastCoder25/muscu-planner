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
import {
  partyCapFor,
  partyHeroBlocker,
  partyLegMin,
  partySendBlocker,
  interceptLeg,
  supplyTarget,
} from '@/lib/party';
import { partyWinChance } from '@/lib/partyForecast';
import { garrisonHold, seatsOf } from '@/lib/controlPoints';
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
import type { ActiveExpedition, Poi } from '@/lib/expedition';

type R<T> = Readonly<Ref<T>> | ComputedRef<T>;

/** Ce que la page connaît déjà et que la composition d'une équipe lit. */
export interface PartyCtx {
  selected: Ref<Poi | null>;
  now: R<number>;
  /** Horloge à la minute : les pronostics coûteux ne se recalculent pas à chaque seconde. */
  coarseNow: R<number>;
  active: R<ActiveExpedition | null>;
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
  vansLeft: R<number>;
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
    active,
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
    vansLeft,
    partyTarget,
    teamOnly,
    selectedRift,
    progressReady,
    settleDueSiege,
  } = ctx;
  const $q = useQuasar();
  const auth = useAuthStore();
  const char = useCharacterStore();
  const busyParty = ref(false);

  const partyHero = ref(false);
  const partyEscort = ref<string[]>([]);
  /** 🏰 Qui reste en garnison sur un point de contrôle (le choix le plus récent d'abord). */
  const partyStay = ref<string[]>([]);
  watch(selected, () => {
    partyHero.value = false;
    partyEscort.value = [];
    partyStay.value = [];
  });
  /** Les aventuriers retenus ET toujours disponibles (un aventurier parti en convoi entre-temps
   *  sort du groupe de lui-même — le store le refuserait de toute façon). */
  const partyAdvs = computed(() =>
    freeStable.value.filter((a) => partyEscort.value.includes(a.id)),
  );
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
          onExpedition: !!active.value,
          healMs: heroHealIn.value,
          outpost: outpostBuilt.value,
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
  const partyWin = computed(() => {
    const p = selected.value;
    if (!p || !partySize.value) return null;
    const w = partyWinChance(
      p,
      partyAdvs.value,
      partyRoad.value,
      heroForParty.value,
      coarseNow.value,
      40,
    );
    return w === null ? null : Math.round(w * 100);
  });
  /** Aller-retour : le groupe va au pas de son marcheur le plus lent (`partyLegMin`). */
  // ⚔️ Une bande en marche vient à notre rencontre : le trajet annoncé est celui jusqu'au
  // point où on la CROISERA (`interceptLeg`, la même règle que l'envoi), pas jusqu'à là où
  // elle se trouve maintenant. Horloge grossière : la rencontre bouge à la minute, pas plus.
  const partyMin = computed(() =>
    selected.value && partySize.value
      ? 2 *
        interceptLeg(selected.value, coarseNow.value, (p) =>
          partyLegMin(p, partyAdvs.value, {
            hero: partyHeroOn.value,
            travelMult: travelMult.value,
            gearSpeed: advGearRoles(partyAdvs.value, roadCtx.value.advGear).speed,
            supplies: activeSupplies.value,
          }),
        ).legMin
      : 0,
  );
  /** ⚠️ CE QUE LE DÉPART COÛTE face à l'armée qui arrive — mêmes règles que le convoi et le
   *  héros (`departureRisk`) : le groupe quitte la base (et le héros avec lui s'il en est),
   *  et un groupe rentré AVANT l'assaut ne coûte rien. */
  const partyRisk = computed(() => {
    const b = base.value;
    const inc = incoming.value;
    if (!b || !inc || !partyTarget.value || !partySize.value) return null;
    const heroNow = heroDefendsNow.value;
    const partants = new Set(partyAdvs.value.map((a) => a.id));
    const restants = freeStable.value.filter((a) => !partants.has(a.id));
    return departureRisk(
      b.defenses,
      heroLevel.value,
      inc,
      {
        hero: heroNow,
        guard: guardUnits(heroLevel.value, freeStable.value, cap.value, compCtx.value),
      },
      {
        hero: partyHeroOn.value ? null : heroNow,
        guard: guardUnits(heroLevel.value, restants, cap.value, compCtx.value),
      },
      { backAt: coarseNow.value + partyMin.value * 60_000, raidAt: raidAt.value },
    );
  });
  /** Pourquoi le groupe ne peut pas partir — la MÊME règle que le store (`partySendBlocker`) :
   *  sans le héros, un groupe prend un créneau de convoi. */
  const partySendBlock = computed(() =>
    selected.value
      ? partySendBlocker(
          selected.value,
          partyAdvs.value.length,
          partyHeroOn.value,
          vansLeft.value,
          cap.value,
          // 💀 Le 🎯 % DÉJÀ affiché juste au-dessus : on ne laisse pas partir un groupe qui
          // ne peut pas gagner. ⚠️ Le MÊME nombre que le pronostic — deux estimations
          // finiraient par dire « 0 % » d'un côté et laisser partir de l'autre.
          partyWin.value === null ? null : partyWin.value / 100,
        )
      : null,
  );
  /** Sans le héros et plus aucun créneau : on le DIT avant même qu'on choisisse quelqu'un. */
  const partySlotsFull = computed(() => !partyHeroOn.value && vansLeft.value <= 0);
  const canSendPartyNow = computed(
    () =>
      !!selected.value &&
      !partySendBlock.value &&
      // ⚠️ TOUJOURS attendre la progression : avant son chargement le niveau vaut 1, et le
      // tirage des pièces d'aventurier (figé au départ) serait plafonné au plus bas rang.
      progressReady.value &&
      !busyParty.value,
  );
  /** 🗿 Combien de champions on peut engager — `partyCapFor` (le Panthéon), jamais une copie
   *  de la règle : l'écran doit empêcher exactement ce que le store refuse. */
  const partyMax = computed(() => partyCapFor(cap.value, selected.value, partyHeroOn.value));
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
        )
      : {},
  );
  /** La note ne s'affiche que si un champion DISPONIBLE y perd : sinon c'est du bruit. */
  const partyLowXp = computed(() =>
    freeStable.value.some((a) => partyXp.value[a.id]?.full === false),
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
  /** ✨ Tout le vivier disponible d'un geste (et de nouveau pour tout retirer) : un repaire
   *  de taille 10 demande dix aventuriers, dix toucher de suite serait une corvée. */
  /** Ce que « tout le vivier » peut réellement prendre ici. */
  const partyAllIds = computed(() => freeSorted.value.slice(0, partyMax.value).map((a) => a.id));
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
    busyParty.value = true;
    try {
      const refused = await char.sendParty(uid, poi, {
        hero: heroForParty.value,
        escortIds: partyAdvs.value.map((a) => a.id),
        // AVEC le héros : le niveau que `expeSend` passait (progression en donjon) — son butin
        // ne change pas. SANS lui : le niveau de SPORT, comme les convois (pièces d'aventurier).
        playerLevel: partyHeroOn.value ? progressionLevel.value : heroLevel.value,
        now: Date.now(),
        supplies: activeSupplies.value,
        ...(stayCap.value ? { stayIds: stayIds.value } : {}),
      });
      if (!refused) selected.value = null;
      // ⚠️ La RAISON du refus vient du store : un message générique laissait deviner qui bloquait.
      $q.notify(
        refused
          ? { type: 'negative', message: `Départ impossible : ${refused}.` }
          : {
              type: 'positive',
              message: isHarvest
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

  /** Places du point visé (0 hors point de contrôle). */
  const stayCap = computed(() => {
    const c = selected.value?.control;
    return c && c.owner === 'enemy' ? seatsOf(c.kind) : 0;
  });
  /** Ceux qui resteront : les choisis d'abord, complétés par l'ordre de l'équipe. */
  const stayIds = computed(() => {
    const ids = partyAdvs.value.map((a) => a.id);
    const picked = partyStay.value.filter((id) => ids.includes(id));
    return [...picked, ...ids.filter((id) => !picked.includes(id))].slice(0, stayCap.value);
  });
  /** 🛡️ La part des attaques que la garnison CHOISIE repoussera — renfort ennemi compris,
   *  donc jamais plus de `CONTROL.maxHold` (la même règle que la bataille). ⚠️ Sans horloge :
   *  ne se recalcule qu'au changement de lieu ou de garnison, pas à chaque tick. */
  const stayHold = computed(() => {
    const p = selected.value;
    if (!p || !stayCap.value) return null;
    const ids = new Set(stayIds.value);
    const g = partyAdvs.value.filter((a) => ids.has(a.id));
    return g.length ? Math.round(garrisonHold(p, partyAllies(g, roadCtx.value, null)) * 100) : null;
  });
  /** 🌿 Un point à UNE place : la tenue de chaque candidat, pour choisir qui reste. */
  const stayHoldOf = computed<Record<string, number>>(() => {
    const p = selected.value;
    if (!p || stayCap.value !== 1 || partyAdvs.value.length < 2) return {};
    return Object.fromEntries(
      partyAdvs.value.map((a) => [
        a.id,
        Math.round(garrisonHold(p, partyAllies([a], roadCtx.value, null)) * 100),
      ]),
    );
  });
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
    stayCap,
    stayHold,
    stayHoldOf,
    stayIds,
    stayChoice,
    toggleStay,
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
    partyWin,
    partyMin,
    partyRisk,
    partySendBlock,
    partySlotsFull,
    canSendPartyNow,
    partyMax,
    partyXpSplit,
    partyXp,
    partyLowXp,
    togglePartyAdv,
    partyAllIds,
    partyAllOn,
    togglePartyAll,
    partySendLabel,
    doSendParty,
  };
}
