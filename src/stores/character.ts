// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { comboChestMessageId, type ComboChestRecord } from '@/lib/comboChest';
import { localDayIso } from '@/lib/localDay';
import { sinceEvent } from '@/lib/sinceEvent';
import { parseQuestMark, questMark } from '@/lib/weeklyQuests';
import {
  advanceBossTokens,
  bonusMark,
  chestMark,
  type FriendBossBonus,
  type FriendBossChest,
} from '@/lib/friendBoss';
import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import { normalizePseudo, levelUpEnergy, pushEnergyLog } from '@/lib/character';
import {
  sellValue,
  canSell,
  sellValueOf,
  GEAR_VERSION,
  bestGearLoadout,
  playerWithGear,
  wornVoie,
  SLOTS,
  FAMILIAR_SLOT,
  WORN_SLOTS,
  MAX_LOADOUTS,
  rarityRank,
  type Item,
  type ItemSlot,
  type Equipped,
  type Loadout,
  voieSetRoster,
  setSellLot,
  relicSurplus,
} from '@/lib/items';
import {
  fileSetPieces,
  ownedInLoadouts,
  normalizeLoadouts,
  promoteSpare,
  takeSetPiece,
  sparesLot,
  setPieceScorer,
  voieSetIndex,
  type FiledPiece,
} from '@/lib/setFiling';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';
import {
  normalizeTalents,
  talentsEarned,
  pickBestTalents,
  talentEffects,
  talentTier,
  talentRank,
  talentRollOf,
  type TalentInstance,
} from '@/lib/talents';
import {
  familiarFusionBlock,
  fuseFamiliars,
  fuseTalents,
  talentFusionBlock,
} from '@/lib/companionFusion';
import { VOIES } from '@/lib/voies';
import { keysAfterPaying, labyIdOfClear, labyRunCleared, labyRunStarted } from '@/data/labyrinths';
import { runAttempt } from '@/lib/runStats';
import { bossKeyDrop, dungeonKeyDrop } from '@/lib/keyDrops';
import {
  PARTY_TARGETS,
  poiLabel,
  HARVEST_TYPES,
  isRiftPoi,
  isWarbandPoi,
  isFieldArmyPoi,
  mapReach,
  campSpecOf,
  depositMessages,
  MESSAGES_CAP,
  controlAttackReportId,
  isClaimable,
  isAutoClaimable,
  messageTitle,
  createMap,
  advanceWorld,
  riftOverflows,
  startExpedition,
  expeditionFromPost,
  poiTravelLevel,
  travelOneWayMin,
  buildMessage,
  poiDifficultyLevel,
  riftMaturityAt,
  dwellMsFor,
  type ActiveExpedition,
  type ExpeditionMap,
  type CartoType,
  type ExpeditionMessage,
  type ExpeditionOutcome,
  type Poi,
  type PostedHero,
  restoreUnvanquished,
  supersedeLate,
  staysUnderAttack,
  forgetDeparture,
  isAttackTarget,
  moveDeparture,
  recordDeparture,
  archipelFloor,
} from '@/lib/expedition';
import {
  activeIsland,
  archipelOn,
  islandById,
  islandPacified,
  mapOutpostLevel,
  mapPlayerLevel,
} from '@/lib/archipelago';
import {
  boardTravellers,
  CROSSING_BLOCK_LABEL,
  crossingBlocker,
  championsTravelling,
  type MilitiaPlan,
  crossingDeparture,
  crossingTravellers,
  fortressReward,
  nextCrossingDeparture,
  postponeCrossing,
  islandChampions,
  SAILING_BLOCK_LABEL,
  sailingBlocker,
  settleSailings,
  startSailing,
  endlessReward,
  landAdventurers,
  abandonedIslandKeys,
  landCrossing,
  moveRemoteMilitia,
  landingChestMessage,
  produceIslandMilitia,
  startCrossing,
} from '@/lib/crossing';
import {
  POINT_SHIP_BLOCK_LABEL,
  SHIP_MILITIA_BLOCK_LABEL,
  settleMilitiaSailings,
  shipMilitia,
  shipMilitiaBlocker,
  shipMilitiaToPoint,
  shipPointBlocker,
  type MilitiaSpot,
} from '@/lib/militiaSea';
import { basculeToArchipel } from '@/lib/archipelBascule';
import {
  EMBER,
  FORTRESS_ID,
  brigandPillage,
  ensureIslandConquest,
  convoyVanquished,
  isIslandTargetId,
  razeIslandTarget,
  takeFortress,
  takeObjective,
  heldRazedObjectives,
  regainIslandTarget,
  redirectIslandAttacks,
  ENDLESS_ID,
  heroPosted,
  heroComing,
  heroAwayOnMapAt,
  syncHeroAway,
  heroKeepPostId,
  heroWalksHomeFrom,
  turnBackComingHero,
  heroPostOf,
  heroBackToPost,
  recallPostedHero,
  unpostHero,
  boardFromFortress,
} from '@/lib/islandConquest';
import {
  buildingType,
  buildingUpgradeCost,
  canUpgradeBuilding,
  canBuildType,
  canBuildOnSlot,
  healBuildings,
  collectable,
  nextCollectedAt,
  expeditionsUnlocked,
  travelTimeMult,
  type Building,
  buildingLevel,
  type BuildingTypeId,
} from '@/lib/buildings';
import { combatPower, mulberry32, type Combatant } from '@/lib/combat';
import {
  emptyMilitia,
  isMilitiaId,
  lightHurtLabel,
  militiaLostLabel,
  militiaOfControl,
  militiaOnMap,
  militiaUnits,
  produceMilitia,
  returnMilitia,
  takeMilitia,
} from '@/lib/militia';
import { militiaOwedOn, militiaRelief } from '@/lib/militiaRelief';
import {
  advanceBase,
  markOverflow,
  dispelOverflow,
  weakenOverflow,
  applyRaidOutcome,
  raidIntervalMs,
  baseLeadMs,
  scoutLevel,
  resolveRaid,
  siegeHurtIds,
  advHurtMs,
  advHealCost,
  siegeXpFor,
  guardUnits,
  rampartGuard,
  emptyBase,
  defenseType,
  defenseLevel,
  ownedLevel,
  repairCost,
  defenseUpgradeCost,
  SCRAP_TO_GOLD,
  lootCorpses,
  startRepair,
  finishRepairNow,
  rushRepairCost,
  totalRepairCost,
  autoAdvGear,
  equipThenMerge,
  retireKennel,
  healCost,
  heroAtInfirmary,
  woundRemainingMs,
  woundMsFor,
  type BaseState,
  type DefenseId,
  type Raid,
  type RaidReport,
  fortifyMult,
  islandRaidBand,
} from '@/lib/raid';
import {
  advAvailable,
  advProgressOf,
  advXpTracks,
  type AdvXpTrack,
  type AdvProgress,
  advRarity,
  grantAdvXp,
  advNextAscension,
  ascendAdventurer,
  advTitle,
  engageCap,
  awakenLevel,
  advChampionSlots,
  type Adventurer,
} from '@/lib/adventurers';
import {
  RISE_BLOCK_LABEL,
  RUNE_PLACE_OK,
  SKILL_MAX_LEVEL,
  riseBlocker,
  riseSkill,
  type ChampSkill,
  type SkillId,
} from '@/lib/skillRunes';
import {
  AWAKEN_RUNE_COUNT,
  FUSE_ALL_NONE,
  FUSE_BLOCK_LABEL,
  GIVE_BLOCK_LABEL,
  OPEN_BLOCK_LABEL,
  RUNE_BANK_VERSION,
  STOCK_RISE_BLOCK_LABEL,
  riseStockSkill,
  stockRiseBlocker,
  addRuneCount,
  addForgedSkills,
  ascensionRuneCount,
  fuseAllSkills,
  fuseBlocker,
  fuseSkills,
  giveBlocker,
  giveKind,
  giveSkill,
  takeBackSkill,
  openBlocker,
  openRunes,
  rollPlaceRunes,
  runeCount,
  type FuseGroup,
  type FuseOnly,
  type GiveKind,
  type StockSkill,
} from '@/lib/runeBank';
import { caravanLegMin, partyAllies, type EscortKit, type PartyHero } from '@/lib/caravan';
import {
  advGearRoles,
  canWearAdvGear,
  rollGachaPiece,
  advGearModelOf,
  lineageOf,
  advGearAwakenPlan,
  awakenAdvGear,
  stripAdvGear,
  advGearNextRank,
  advGearRankCap,
  ascendAdvGear,
  trainWornGear,
  withGearTracks,
  wornGear,
  type AdvGear,
  type AdvGearSlot,
  type AdvGearState,
} from '@/lib/advGear';
import {
  partySendBlocker,
  heroStaysAt,
  suppliesBlocker,
  supplyTarget,
  PARTY_SEND_BLOCK_LABEL,
  partyHeroBlocker,
  PARTY_HERO_BLOCK_LABEL,
  grantReportXp,
  partyClaimRoster,
  partyLegMin,
  assaultStayers,
  tripCrew,
  voyageMemberIds,
  shortenWonReturn,
  heroStayedSplit,
  heroHurtSplit,
  rescheduleReturners,
  baseWalkers,
  medkitHeal,
  markHeroHurt,
  heroMissionWound,
  heroWoundAfter,
  walkToBase,
  withoutWalkers,
  interceptLeg,
  interceptTooLate,
  reMeet,
  meetAll,
  settleParties,
  startParty,
  partyOrigins,
  withOrigins,
  type ActiveParty,
  recallBlocker,
  recallVoyage,
  RECALL_BLOCK_LABEL,
  type RecallTarget,
} from '@/lib/party';
import { FORECAST_SAMPLES, partyWinChance } from '@/lib/partyForecast';
import { advsHomeAt, heroHomeAt, outingsOf } from '@/lib/siegePresence';
import {
  heroOutInAttack,
  COMBINED_BLOCK_LABEL,
  attackNoShows,
  attackParticipants,
  attackSettled,
  combinedBlocker,
  heroInAttack,
  attackWaitingIds,
  planWings,
  wingDeparture,
  wingReturnLegs,
  type CombinedAttack,
} from '@/lib/combinedAttack';
import { recallAttack, recallCombinedGroup } from '@/lib/combinedRecall';
import {
  addSupplies,
  rollSupplyDrop,
  sealRift,
  supplyFx,
  takeSupplies,
  BOOST_MIN,
  SUPPLIES,
  TOME_XP,
  type BoostId,
  type SupplyId,
  type SupplyStock,
  type TomeId,
} from '@/lib/supplies';
import { openTome } from '@/lib/xpTome';
import { WARD_BLOCK_LABEL, placeWard, wardBlocker, type WardId } from '@/lib/controlWard';
import {
  attackBoostPlan,
  boostAttack,
  boostVoyage,
  combinedSiblings,
  voyageBoostPlan,
  BOOST_BLOCK_LABEL,
} from '@/lib/speedBoost';
// ⚔️🕳️ Les DEUX résolutions d'une mission de groupe : un camp de faction, ou une incursion
// dans une faille. La dispatch vit dans `sendParty`, le seul chemin qui envoie un groupe.
import { resolveCamp } from '@/lib/camp';
import { healWear, wearEnemy, wearSettleLabel } from '@/lib/enemyWear';
import { FACTION_EMOJI } from '@/lib/raid';
import {
  islandMilitiaOf,
  CONTROL_LABEL,
  captureControl,
  collectControl,
  autoCollectable,
  newAscensions,
  controlGoldMessage,
  controlLootMessage,
  controlNoticeText,
  ascensionMessage,
  controlTravelMult,
  controlDetectBoost,
  trainingRoom,
  dueRetakes,
  holdGrace,
  retiredHeld,
  convertReplacedControls,
  hospiceHealMult,
  retakeCalmMs,
  withLastAttack,
  attackSlow,
  ensureControls,
  holdControl,
  loseControl,
  controlTier,
  tierLostLabel,
  isCitadelId,
  razeCitadel,
  repelledAtCitadel,
  markAssault,
  recallReinforcements,
  canTurnBack,
  campGear,
  reinforceBlocker,
  reinforceControl,
  releaseFromControl,
  sortieLeaves,
  freeAway,
  sendHomeFromControl,
  settleReturns,
  recallReturns,
  RETURN_RECALL_LABEL,
  settleReinforcements,
  militiaSentBackMessages,
  boostControlTrip,
  turnBackLabel,
  sortieHomeLabel,
  turnBackReinforcements,
  REINFORCE_BLOCK_LABEL,
  seatsOf,
  holdSeats,
  champSeatsWithHero,
  heroPostBlocker,
  HERO_POST_BLOCK_LABEL,
  sendHeroToControl,
  campXpFor,
  newlyDiscoveredCitadels,
  citadelDiscoveryFx,
  setCartoFavor,
  setForgeSkill,
  type ForgedSkill,
  orphanPosts,
  garrisonWithoutPost,
} from '@/lib/controlPoints';
import {
  SORTIE_BLOCK_LABEL,
  SWAP_BLOCK_LABEL,
  SWAP_MILITIA_FROM_BASE,
  TRANSFER_BLOCK_LABEL,
  legFromSpot,
  routeFromSpot,
  redeployMap,
  type RedeployMove,
  rejoinHome,
  syncAway,
  sortieBlocker,
  swapBlocker,
  swapGarrison,
  transferBlocker,
  transferGarrison,
} from '@/lib/controlRoutes';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { conditionFx, scaleXp } from '@/lib/islandCondition';
import {
  applyFieldHitToBase,
  applyFieldHitToMap,
  detectionCircles,
  detectRadius,
  islandDetectRadius,
  pendingFieldHits,
  resolveFieldArmy,
  retakeBattle,
  siegeOrigin,
  siegeSightLeadMs,
  syncFieldArmies,
} from '@/lib/fieldArmy';
import {
  resolveIncursion,
  resolveInterception,
  resolveConvoy,
  riftOverflowOf,
  siegeMana,
  withRiftCut,
} from '@/lib/rift';
import { overflowMessage } from '@/lib/overflowStage';
import {
  GACHA,
  dailyFreeMana,
  grantChampion,
  saturatedPull,
  wipeLegacyAdventurers,
  GACHA_VERSION,
  nextGacha,
  pullMany,
  rollGearGrade,
} from '@/lib/gacha';
import type { GearGrade } from '@/data/champions';
import {
  addSeals,
  advGearAscensionBlocker,
  advGearAscensionCost,
  GEAR_ASCENSION_BLOCK_LABEL,
  ascensionBlocker,
  ascensionCost,
  ascensionMana,
  ASCENSION_BLOCK_LABEL,
  type Seals,
} from '@/lib/ascension';
import { singleFlight } from '@/lib/singleFlight';
import { levelUpTickets, pullPayment, buildTickets, welcomeTicketsDue } from '@/lib/sportTickets';
import type { LotItem } from '@/lib/gachaReveal';
import { gearRefonteGifts } from '@/lib/gearMigration';
import { useGameFx } from '@/composables/useGameFx';
import { CHARACTER_RANKS, characterRank } from '@/lib/characterRank';
import { useGoldFx } from '@/composables/useGoldFx';
import { PRICE_REFUND_VERSION, priceRefund } from '@/lib/priceRefund';
import { mergeWritten, writtenEcho } from '@/lib/characterWrite';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { normalizeCharacterRow, type CharacterRow } from '@/lib/characterRow';

export type { CharacterRow } from '@/lib/characterRow';

// Énergie offerte à la création du perso (~1 session ≈ de quoi lancer plusieurs
// premiers donjons) → le joueur n'est pas bloqué à 0 énergie au départ.
export const WELCOME_ENERGY = 400;

// Jour calendaire LOCAL (YYYY-MM-DD) à l'instant `ms` — utilisé pour horodater les
// entrées du journal d'énergie hors-sport (energy_log).
function isoDayLocal(ms: number): string {
  return localDayIso(new Date(ms));
}

export class PseudoTakenError extends Error {
  constructor() {
    super('Ce pseudo est déjà pris.');
    this.name = 'PseudoTakenError';
  }
}

export const useCharacterStore = defineStore('character', () => {
  const row = ref<CharacterRow | null>(null);
  /** 📬 Ids des rapports dont l'encaissement est PARTI (cf. `expeClaim`). ⚠️ `persist` n'est
   *  pas optimiste : tant que la ligne n'est pas relue, `row.value` dit encore
   *  `claimed: false`. Sans ce registre, un tick (ou un double toucher) relisait cet état et
   *  rendait le butin encaissable une seconde fois. Tout écrivain de la boîte le passe à
   *  `depositMessages`. Jamais vidé : un id encaissé l'est pour toujours. */
  const claimedLocally = new Set<string>();
  /** La boîte à écrire : la boîte COURANTE + `fresh`, sans doublon ni encaissement dégradé. */
  const boxWith = (cur: CharacterRow, fresh: ExpeditionMessage[], cap: number) =>
    depositMessages(cur.messages, fresh, cap, Date.now(), claimedLocally);
  const loaded = ref(false);
  const goldFx = useGoldFx(); // petite animation « + or » à chaque vente

  const COLS =
    'user_id, pseudo, gold, energy_spent, equipped, inventory, talents, cleared_dungeons, defeated_bosses, login_streak, login_grace_used, last_login_date, login_energy, reward_level, endless_best, pending_reward, keys, summon_stones, expedition, expedition_map, messages, buildings, set_pieces_seen, loadouts, voie, energy_log, base, scrap, mana, adventurers, adv_gear, laby_stats, boss_stats, dungeon_stats, boss_tokens, boss_token_state, parties, attacks, gacha, gacha_tickets, seals, gear_version, supplies, quest_week, runes, price_refund';

  // Garde-fou : une colonne jsonb malformée (ex. talents={} au lieu de []) ne doit
  // JAMAIS faire planter la page (le code fait `for..of` sur les tableaux). On
  // normalise les types attendus au chargement.
  /** 🪬 Runes rendues par la dernière bascule faite au chargement (annoncées par
   *  `settleRuneBascule`). */
  let runeRefund = 0;

  function normalizeRow(r: CharacterRow | null): CharacterRow | null {
    if (!r) return r;
    const n = normalizeCharacterRow(r);
    if (n.runeRefund !== null) runeRefund = n.runeRefund;
    return n.row;
  }

  /** ⚠️ CHARGEMENT EN VOL PARTAGÉ — la cause du DOUBLE VERSEMENT (v0.1082, constaté en
   *  base : 20 tickets de bienvenue au lieu de 10).
   *
   *  `fetchMine` est appelée par une dizaine d'écrans, souvent gardées par `!char.row` —
   *  un garde qui ne vaut RIEN entre deux appels CONCURRENTS (en cockpit, deux volets se
   *  montent ensemble) : les deux lisent la ligne avant que l'écriture de l'autre n'arrive,
   *  donc les deux croient que rien n'a encore été versé. Toutes les régularisations
   *  one-shot (`settle*`) en dépendent.
   *
   *  ⚠️ Le garde par la MARQUE reste indispensable (un second onglet, un autre appareil) :
   *  celui-ci supprime la course locale, le `filter` de `settleWelcomeTickets` supprime
   *  celle qui traverse le réseau. */
  const fetchMine = singleFlight(loadMine);

  /** Quand et pour qui la ligne a été lue pour la dernière fois (`fetchIfStale`). */
  let loadedAt = 0;
  let loadedUid: string | null = null;
  /** ⏱️ Relit la ligne seulement si elle a plus de `maxAgeMs` (audit 2026-10-15 : ouvrir
   *  l'Aventure relisait toute la ligne, ~48 colonnes JSON, à CHAQUE passage — alors que nos
   *  propres écritures la tiennent déjà à jour). Un autre utilisateur, ou une ligne absente,
   *  force la lecture. Ce qu'un AUTRE appareil a écrit arrive au plus `maxAgeMs` plus tard. */
  async function fetchIfStale(maxAgeMs: number) {
    const uid = useAuthStore().user?.id ?? null;
    if (row.value && uid && uid === loadedUid && Date.now() - loadedAt < maxAgeMs) return row.value;
    return fetchMine();
  }

  async function loadMine() {
    // ⚠️ FILTRE EXPLICITE OBLIGATOIRE (v0.699) — la RLS borne ce qu'on a le DROIT de lire,
    // jamais ce qu'on VEUT lire. Ici l'enjeu est double : `maybeSingle()` LÈVE une erreur si
    // plusieurs lignes reviennent, donc l'ajout d'une policy SELECT élargie sur `characters`
    // (voir `challenges_read_friends`, migr. 0058) ne dégraderait pas l'Aventure — il la
    // casserait. Le `.eq` est un no-op tant que la policy reste own-only ; c'est le but.
    const uid = useAuthStore().user?.id;
    if (!uid) {
      row.value = null;
      loaded.value = true;
      return null;
    }
    const { data, error } = await supabase
      .from('characters')
      .select(COLS)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    // ⚠️ La fusion du Panthéon se mesure sur la ligne BRUTE, avant que `normalizeRow` ne
    // la referme : c'est la présence des trois anciens bâtiments qui EST le marqueur
    // « pas encore migré ». Une fois écrite, il n'y a plus rien à fusionner.
    const raw = data?.buildings;
    const legacy = healBuildings(Array.isArray(raw) ? raw : []);
    const legacyScrap = typeof data?.scrap === 'number' ? Math.max(0, data.scrap) : 0;
    // 🐾 Même principe pour le Chenil retiré : sa présence sur la ligne BRUTE est le marqueur.
    const rawBase = data?.base as BaseState | null | undefined;
    const kennelGold = rawBase && Array.isArray(rawBase.defenses) ? retireKennel(rawBase).gold : 0;
    const rawRuneComp = Math.floor(Number((data?.runes as { comp?: unknown } | null)?.comp)) || 0;
    row.value = normalizeRow(data ?? null);
    loaded.value = true;
    loadedAt = Date.now();
    loadedUid = uid;
    // 🪬 La bascule d'abord : tant qu'elle n'est pas écrite, toute écriture du vivier seul
    // effacerait les compétences sans les rembourser.
    if (row.value && rawRuneComp < RUNE_BANK_VERSION) await settleRuneBascule(uid);
    if (row.value && (legacy.goldRefund > 0 || legacyScrap > 0 || kennelGold > 0))
      await settleLegacy(uid, {
        pantheon: legacy.goldRefund,
        scrap: legacyScrap,
        kennel: kennelGold,
      });
    if (row.value) await settleWipe(uid);
    if (row.value) await settleGachaReset(uid);
    if (row.value) await settleWelcomeTickets(uid);
    if (row.value) await settlePriceRefund(uid);
    return row.value;
  }

  // CRÉE le personnage. L'unicité est garantie par la base : un pseudo déjà pris renvoie
  // l'erreur 23505 → on la traduit en PseudoTakenError.
  // ⚠️ Le pseudo ne se MODIFIE plus (v0.847) : refus ici, et surtout en base (trigger
  // `characters_pseudo_immutable`, migr. 0066), qu'aucun onglet périmé ne contourne.
  async function setPseudo(userId: string, rawPseudo: string) {
    if (row.value) throw new Error('Le pseudo ne peut plus être modifié.');
    const pseudo = normalizePseudo(rawPseudo);
    // Pécule de bienvenue à la 1re création (0 XP de fond → 0 énergie sinon) : de
    // quoi lancer quelques donjons et accrocher le joueur. Pas au renommage.
    const isNew = !row.value;
    const patch: Record<string, unknown> = {
      user_id: userId,
      pseudo,
      updated_at: new Date().toISOString(),
    };
    if (isNew) {
      patch.login_energy = WELCOME_ENERGY;
      // Un personnage NEUF n'a rien à convertir : pas de cadeau de la refonte (le début de
      // partie est calibré sans eux).
      patch.gear_version = GEAR_VERSION;
      patch.energy_log = pushEnergyLog(undefined, {
        date: isoDayLocal(Date.now()),
        emoji: '🎉',
        label: 'Pécule de bienvenue',
        amount: WELCOME_ENERGY,
      });
    }
    const { data, error } = await supabase.from('characters').upsert(patch).select(COLS).single();
    if (error) {
      if (error.code === '23505') throw new PseudoTakenError();
      throw error;
    }
    row.value = normalizeRow(data);
    return data;
  }

  /** 🛕 Écrit la fusion du Panthéon **AUSSITÔT** : les bâtiments fusionnés et l'or rendu,
   *  dans la MÊME requête. ⚠️ Tant que la ligne en base porte encore les trois anciens
   *  bâtiments, chaque chargement recalcule le remboursement — donc une écriture qui ne
   *  porterait que l'or (un achat, par exemple) le rembourserait une seconde fois. La
   *  persistance immédiate ferme cette fenêtre. Un échec laisse la base intacte : on
   *  retentera au prochain chargement, et le pire cas est généreux, jamais punitif.
   *  ⚠️ Et on le DIT : un bond de plusieurs millions d'or sans un mot se lit comme un bug. */
  /**
   * 🏗️ Écrit **EN UNE SEULE REQUÊTE** tout ce que `normalizeRow` a rendu au chargement :
   * fusion du Panthéon (bâtiments), ferraille convertie (or, ferraille à zéro), Chenil retiré
   * (enceinte sans lui, vivier sans compagnons).
   * ⚠️ UNE écriture et non trois : tant que la ligne en base porte encore l'ancien état,
   * chaque chargement recalcule le remboursement. Si l'or partait dans une requête et
   * l'enceinte dans une autre, une coupure entre les deux rembourserait DEUX fois. Hors
   * ligne : rien n'est écrit, on retentera au prochain chargement — jamais deux fois.
   * ⚠️ Et on le DIT : un bond d'or sans un mot se lit comme un bug.
   */
  /**
   * 💰 LE REMBOURSEMENT DE LA BAISSE DES PRIX (v1.51, `priceRefund`), une fois par compte.
   * ⚠️ La marque est écrite dans la MÊME requête que l'or, et la condition vit dans la requête
   * (`price_refund` sous la version) : deux onglets ne remboursent pas deux fois. Un compte
   * sans crans payés est marqué quand même (0 or), sinon il serait remboursé plus tard pour des
   * crans payés au nouveau prix. Un échec laisse la base intacte ; on retentera.
   */
  async function settlePriceRefund(userId: string) {
    const cur = row.value;
    if (!cur || cur.price_refund >= PRICE_REFUND_VERSION) return;
    const levels = [
      ...cur.buildings.map((b) => b.level),
      ...(cur.base?.defenses ?? []).map((d) => d.level),
    ];
    const gold = priceRefund(levels);
    let data: CharacterRow | null = null;
    try {
      const res = await supabase
        .from('characters')
        .update({
          gold: cur.gold + gold,
          price_refund: PRICE_REFUND_VERSION,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .lt('price_refund', PRICE_REFUND_VERSION)
        .select(COLS)
        .maybeSingle();
      if (res.error) return;
      data = res.data;
    } catch {
      return;
    }
    if (!data) return; // un autre onglet l'a déjà versé
    row.value = normalizeRow(data);
    if (gold > 0)
      useGameFx().celebrate({
        kind: 'unlock',
        emoji: '💰',
        title: 'Les prix baissent',
        subtitle: `Bâtiments −25 %, ascensions −40 % — ${gold.toLocaleString('fr-FR')} 🪙 rendus sur ce que tu avais payé`,
        rarity: 'legendary',
      });
  }

  async function settleLegacy(
    userId: string,
    back: { pantheon: number; scrap: number; kennel: number },
  ) {
    const cur = row.value;
    if (!cur) return;
    try {
      await persist(userId, {
        buildings: cur.buildings,
        gold: cur.gold,
        scrap: 0,
        base: cur.base,
        adventurers: cur.adventurers,
      });
    } catch {
      return;
    }
    const fx = useGameFx();
    if (back.pantheon > 0)
      fx.celebrate({
        kind: 'unlock',
        // ⚠️ Générique : cette annonce sert à TOUS les retraits (Panthéon, Mine d'or,
        // Fonderie, Entrepôt…) — nommer un seul bâtiment mentirait aux autres.
        emoji: '🏗️',
        title: 'Ta base est réorganisée',
        subtitle: `Des bâtiments ont été fusionnés ou retirés — ${back.pantheon.toLocaleString('fr-FR')} 🪙 rendus`,
        rarity: 'legendary',
      });
    if (back.scrap > 0)
      fx.celebrate({
        kind: 'unlock',
        emoji: '🪙',
        title: 'La ferraille devient de l’or',
        subtitle: `Tes ${back.scrap} 🔩 ont été revendus : +${back.scrap * SCRAP_TO_GOLD} 🪙. L’enceinte se paie désormais en or.`,
        rarity: 'epic',
      });
    if (back.kennel > 0)
      fx.celebrate({
        kind: 'unlock',
        emoji: '🐾',
        title: 'Le Chenil ferme ses portes',
        subtitle: `Familiers et talents restent au héros — ${back.kennel.toLocaleString('fr-FR')} 🪙 rendus`,
        rarity: 'epic',
      });
  }

  /**
   * 🗑️ LE WIPE DES AVENTURIERS, en une seule écriture.
   *
   * ⚠️ **IL NE PASSE PAS PAR `normalizeRow`, contrairement à la fusion du Panthéon**, et la
   * différence est réelle : là-bas le filtre des types inconnus aurait effacé la donnée
   * avant qu'on l'ait lue, donc la migration DEVAIT être dans la normalisation. Ici rien
   * ne supprime un aventurier tout seul — il survit en base jusqu'à ce qu'on écrive. Le
   * one-shot est donc **atomique par construction** : ça passe, ou rien ne bouge et on
   * retentera au prochain chargement. Aucune fenêtre de double compensation.
   */
  /**
   * ⚙️ LES CADEAUX DE LA REFONTE À 7 EMPLACEMENTS (étape 8 ; spec § 9.4-9.5) : les pièces
   * neuves des sets possédés en entier, puis une pièce de départ par emplacement neuf vide.
   * ⚠️ Demande le NIVEAU du joueur, que la ligne ne porte pas : appelé par l'Aventure une fois
   * `progress.ready`. ⚠️ ONE-SHOT : la version est écrite dans la MÊME requête que les
   * cadeaux (et que l'équipement converti), donc impossible d'offrir deux fois. Un échec
   * réseau laisse la base intacte ; on retentera.
   */
  async function settleGearRefonte(playerLevel: number) {
    const cur = row.value;
    if (!cur || cur.gear_version >= GEAR_VERSION) return;
    const g = gearRefonteGifts(
      { equipped: cur.equipped, inventory: cur.inventory, loadouts: cur.loadouts },
      playerLevel,
      cur.user_id,
      () => crypto.randomUUID(),
    );
    try {
      await persist(cur.user_id, {
        equipped: g.equipped,
        inventory: g.inventory,
        loadouts: cur.loadouts,
        gear_version: GEAR_VERSION,
      });
    } catch {
      return;
    }
    if (!g.gifts.length) return;
    useGameFx().celebrate({
      kind: 'unlock',
      emoji: '🛡️',
      title: 'Bouclier, casque et bottes',
      subtitle: `L'équipement passe à 7 emplacements — ${g.gifts.length} pièce${g.gifts.length > 1 ? 's' : ''} offerte${g.gifts.length > 1 ? 's' : ''}, un rang sous le tien`,
      rarity: 'legendary',
    });
  }

  async function settleWipe(userId: string) {
    const cur = row.value;
    if (!cur) return;
    const w = wipeLegacyAdventurers(cur.adventurers ?? []);
    if (!w.mana) return;
    const partants = (cur.adventurers ?? []).length - w.advs.length;
    try {
      await persist(userId, { adventurers: w.advs, mana: cur.mana + w.mana });
    } catch {
      return; // hors ligne : la base est intacte, on retentera.
    }
    // ⚠️ Et on le DIT. Voir son vivier disparaître sans un mot se lit comme une perte de
    // données, pas comme une bascule — même raison que l'éclat du Panthéon.
    useGameFx().celebrate({
      kind: 'unlock',
      emoji: '🛕',
      title: 'Les champions remplacent les recrues',
      subtitle: `${partants} aventurier${partants > 1 ? 's' : ''} rendu${partants > 1 ? 's' : ''} au Panthéon — ${w.mana} 💠 pour les invoquer`,
      rarity: 'legendary',
    });
  }

  /**
   * 🎰 LE RESET DE LA REFONTE S/A/B (2026-09-21, décidé par l'utilisateur) : les champions
   * de l'ancien gacha partent, et chaque tirage déjà fait est rendu (110 💠 l'un).
   *
   * ⚠️ **MESURÉ EN BASE AVANT DE LE FAIRE** : tous les champions des comptes réels sont au
   * niveau 1, sans Éveil — le reset ne coûte rien d'autre que les tirages, qu'on rend.
   * ⚠️ Le compteur de garantie REPART À ZÉRO (décision de l'utilisateur).
   * ⚠️ **ONE-SHOT, gardé par la version** (`gacha.v`) : écrit dans la MÊME requête que la
   * compensation, donc impossible de compenser deux fois. Un échec réseau laisse la base
   * intacte, on retentera au prochain chargement.
   * ⚠️ L'équipement et les compagnons confiés ne sont que des ids sur le champion : les
   * pièces restent au stock, les familiers et talents au sac.
   */
  async function settleGachaReset(userId: string) {
    const cur = row.value;
    if (!cur || cur.gacha.v === GACHA_VERSION) return;
    const advs = cur.adventurers ?? [];
    const partants = advs.filter((a) => !!a.championId).length;
    const mana = cur.gacha.pulls * GACHA.pullCost;
    try {
      await persist(userId, {
        adventurers: advs.filter((a) => !a.championId),
        mana: cur.mana + mana,
        // Le RESET remet le pity à zéro — mais il ne perd pas ce qui n'est pas du pity
        // (la marque de bienvenue), sans quoi il rouvrirait la même boucle.
        gacha: nextGacha(cur.gacha, { sinceTop: 0, sinceFloor: 0, sinceApex: 0 }, 0),
      });
    } catch {
      return;
    }
    if (!partants && !mana) return;
    useGameFx().celebrate({
      kind: 'unlock',
      emoji: '🎰',
      title: 'Le Panthéon change de visage',
      subtitle: `Nouvelle invocation S / A / B — ${partants} champion${partants > 1 ? 's' : ''} rendu${partants > 1 ? 's' : ''}, +${mana} 💠 pour réinvoquer`,
      rarity: 'legendary',
    });
  }

  /** 🎟️ RATTRAPAGE DES TICKETS DE BIENVENUE — one-shot, gardé par la marque `gacha.welcomed`
   *  écrite dans la MÊME requête que les tickets (donc jamais deux fois ; un échec réseau
   *  laisse la base intacte et on retentera au prochain chargement). Ne concerne que les
   *  comptes qui avaient DÉJÀ posé leur Panthéon avant la v0.1079. */
  async function settleWelcomeTickets(userId: string) {
    const cur = row.value;
    if (!cur) return;
    const due = welcomeTicketsDue(
      cur.buildings.some((b) => b.typeId === 'pantheon'),
      !!cur.gacha.welcomed,
    );
    if (!due) return;
    // ⚠️ LA CONDITION VIT DANS LA REQUÊTE (`filter`), pas seulement dans le `if` au-dessus :
    // deux clients (deux onglets, deux appareils) peuvent lire la ligne « pas encore marquée »
    // en même temps. Ici le SECOND ne met à jour AUCUNE ligne — et ne crédite donc rien, ni
    // n'annonce rien. C'est ce qui manquait : 20 tickets versés au lieu de 10.
    let data: CharacterRow | null = null;
    try {
      const res = await supabase
        .from('characters')
        .update({
          gacha_tickets: cur.gacha_tickets + due,
          gacha: { ...cur.gacha, welcomed: true },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .filter('gacha->>welcomed', 'is', null)
        .select(COLS)
        .maybeSingle();
      if (res.error) return;
      data = res.data;
    } catch {
      return;
    }
    if (!data) return; // quelqu'un d'autre a déjà marqué la ligne : rien n'est dû
    row.value = normalizeRow(data);
    useGameFx().celebrateTickets(due, 'Bienvenue — offerts par ton Panthéon');
  }

  /**
   * 🪬 ÉCRIT LA BASCULE DES RUNES, faite en mémoire par `normalizeRow` : la banque (runes
   * rendues, version) ET le vivier sans compétences, dans la MÊME requête. ⚠️ La condition
   * vit dans la requête (`runes->>comp` sous la version) : deux onglets ne remboursent pas
   * deux fois. Un échec laisse la base intacte ; on retentera au prochain chargement.
   */
  async function settleRuneBascule(userId: string) {
    const cur = row.value;
    if (!cur) return;
    const refunded = runeRefund;
    runeRefund = 0;
    let data: CharacterRow | null = null;
    try {
      const res = await supabase
        .from('characters')
        .update({
          runes: cur.runes,
          adventurers: cur.adventurers,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .or(`runes->>comp.is.null,runes->>comp.lt.${RUNE_BANK_VERSION}`)
        .select(COLS)
        .maybeSingle();
      if (res.error) return;
      data = res.data;
    } catch {
      return;
    }
    if (!data) {
      // Un autre onglet l'a faite : on relit l'état écrit, sans rien annoncer.
      await loadMine();
      return;
    }
    row.value = normalizeRow(data);
    if (refunded > 0)
      useGameFx().celebrate({
        kind: 'unlock',
        emoji: '🪬',
        title: 'Les runes deviennent multicolores',
        subtitle: `Les compétences de tes champions sont rendues : ${refunded} rune${refunded > 1 ? 's' : ''} à ouvrir au Panthéon`,
        rarity: 'legendary',
      });
  }

  /** 🪬 OUVRE une rune (ou un lot de dix pour neuf). Rend la RAISON d'un refus, sinon les
   *  compétences sorties, dans l'ordre du tirage. ⚠️ Le tirage est DÉTERMINISTE (joueur +
   *  numéro d'ouverture) et crédité AVANT toute animation. */
  async function openRuneBatch(
    userId: string,
    count: number,
  ): Promise<{ ok: false; reason: string } | { ok: true; opened: StockSkill[] }> {
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const block = openBlocker(cur.runes, count);
    if (block) return { ok: false, reason: OPEN_BLOCK_LABEL[block] };
    const out = openRunes(cur.runes, userId, count)!;
    await persist(userId, { runes: out.bank });
    return { ok: true, opened: out.opened };
  }

  /** 🪬 FUSIONNE en un les exemplaires choisis d'une même compétence au stock. */
  async function fuseRuneSkills(
    userId: string,
    uids: readonly string[],
  ): Promise<{ ok: false; reason: string } | { ok: true; group: FuseGroup }> {
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const block = fuseBlocker(cur.runes, uids);
    if (block) return { ok: false, reason: FUSE_BLOCK_LABEL[block] };
    const out = fuseSkills(cur.runes, uids)!;
    await persist(userId, { runes: out.bank });
    return { ok: true, group: out.group };
  }

  /** 🪬 FUSIONNE d'un geste tous les exemplaires d'une compétence (`only`), ou de toutes. */
  async function fuseAllRuneSkills(
    userId: string,
    only: FuseOnly = null,
  ): Promise<{ ok: false; reason: string } | { ok: true; groups: FuseGroup[] }> {
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const out = fuseAllSkills(cur.runes, only);
    if (!out.groups.length) return { ok: false, reason: FUSE_ALL_NONE };
    await persist(userId, { runes: out.bank });
    return { ok: true, groups: out.groups };
  }

  /** 🌈 ÉLÈVE un exemplaire du stock au niveau 5 : couleur au-dessus, niveau 1. */
  async function riseRuneSkill(
    userId: string,
    uid: string,
  ): Promise<{ ok: false; reason: string } | { ok: true; skill: StockSkill }> {
    await writesSettled();
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const block = stockRiseBlocker(cur.runes, uid);
    if (block) return { ok: false, reason: STOCK_RISE_BLOCK_LABEL[block] };
    const out = riseStockSkill(cur.runes, uid)!;
    await persist(userId, { runes: out.bank });
    return { ok: true, skill: out.skill };
  }

  /** 🌈 ÉLÈVE une compétence que porte un champion (une 5⚡ d'avant l'usine du lapidaire,
   *  la seule qui reste au niveau 5 chez un champion sans être dorée). */
  async function riseChampionSkill(
    userId: string,
    advId: string,
    id: SkillId,
  ): Promise<{ ok: false; reason: string } | { ok: true; skill: ChampSkill }> {
    await writesSettled();
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const advs = advList.value;
    const sk = advs.find((a) => a.id === advId)?.skills?.find((s) => s.id === id);
    if (!sk) return { ok: false, reason: 'compétence introuvable' };
    const block = riseBlocker(sk);
    if (block) return { ok: false, reason: RISE_BLOCK_LABEL[block] };
    const next = riseSkill(sk)!;
    await persist(userId, {
      adventurers: advs.map((a) =>
        a.id === advId
          ? { ...a, skills: (a.skills ?? []).map((s) => (s.id === id ? next : s)) }
          : a,
      ),
    });
    return { ok: true, skill: next };
  }

  /** 🪬 DONNE une compétence du stock à un champion. ⚠️ Le stock et le champion partent dans
   *  la MÊME écriture : une compétence retirée du stock sans arriver chez lui serait perdue. */
  async function giveRuneSkill(
    userId: string,
    skillUid: string,
    advId: string,
    replaceIndex: number | null = null,
  ): Promise<
    | { ok: false; reason: string }
    | {
        ok: true;
        kind: GiveKind;
        level: number;
        rose: ChampSkill[];
        back: StockSkill | null;
      }
  > {
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const advs = cur.adventurers ?? [];
    const adv = advs.find((a) => a.id === advId);
    if (!adv) return { ok: false, reason: 'champion introuvable' };
    const c = advChampionSlots(adv);
    const block = giveBlocker(cur.runes, skillUid, c, replaceIndex);
    if (block) return { ok: false, reason: GIVE_BLOCK_LABEL[block] };
    const sk = cur.runes.skills.find((s) => s.uid === skillUid)!;
    const kind = giveKind(c, sk);
    const out = giveSkill(cur.runes, skillUid, c, replaceIndex)!;
    await persist(userId, {
      runes: out.bank,
      adventurers: advs.map((a) => (a.id === advId ? { ...a, skills: out.skills } : a)),
    });
    // 🌈 Le niveau ATTEINT par le don (5 si elle s'est élevée dans la foulée : `rose`).
    const level = out.rose.some((s) => s.id === sk.id)
      ? SKILL_MAX_LEVEL
      : (out.skills.find((s) => s.id === sk.id)?.level ?? sk.level);
    return { ok: true, kind, level, rose: out.rose, back: out.back };
  }

  /** ↩️ RÉCUPÈRE une compétence d'un champion : elle revient au stock, niveaux et couleur
   *  gardés. ⚠️ Stock et champion dans la MÊME écriture. Les heures du lapidaire déjà
   *  gardées sur elle (`lapisHours`) restent sur le champion. */
  async function takeBackRuneSkill(
    userId: string,
    advId: string,
    id: SkillId,
  ): Promise<{ ok: false; reason: string } | { ok: true; skill: StockSkill }> {
    await writesSettled();
    const cur = row.value;
    if (!cur) return { ok: false, reason: 'ton personnage n’est pas chargé' };
    const advs = cur.adventurers ?? [];
    const adv = advs.find((a) => a.id === advId);
    if (!adv) return { ok: false, reason: 'champion introuvable' };
    const out = takeBackSkill(cur.runes, advChampionSlots(adv).skills, id);
    if (!out) return { ok: false, reason: 'compétence introuvable' };
    await persist(userId, {
      runes: out.bank,
      adventurers: advs.map((a) => (a.id === advId ? { ...a, skills: out.skills } : a)),
    });
    return { ok: true, skill: out.skill };
  }

  /** 🗓️ Récupère les tickets des paliers atteints (`earned`, au total de la semaine) moins ceux
   *  déjà pris — relus sur la marque STOCKÉE, jamais sur ce que l'écran croit. ⚠️ LA CONDITION
   *  VIT DANS LA REQUÊTE (même patron que les tickets de bienvenue) : la marque doit être
   *  encore celle qu'on a lue, sinon un autre onglet vient de récupérer et le second ne met à
   *  jour aucune ligne. Rend les tickets versés (0 si rien n'était dû). */
  async function claimWeeklyQuests(userId: string, monday: string, earned: number) {
    const cur = row.value;
    if (!cur) return 0;
    const tickets = earned - parseQuestMark(cur.quest_week, monday);
    if (tickets <= 0) return 0;
    const res = await supabase
      .from('characters')
      .update({
        gacha_tickets: cur.gacha_tickets + tickets,
        quest_week: questMark(monday, earned),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .or(cur.quest_week ? `quest_week.eq.${cur.quest_week}` : 'quest_week.is.null')
      .select(COLS)
      .maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return 0;
    row.value = normalizeRow(res.data);
    useGameFx().celebrateTickets(tickets, 'Palier de quêtes atteint');
    return tickets;
  }

  // ⚠️ ÉCRITURES EN VOL (2026-09-28, un milicien envoyé sur un point a disparu) : `persist`
  // n'est PAS optimiste, donc tant qu'une écriture est en route `row.value` est PÉRIMÉ. Un
  // tick de fond qui calcule sur cet état et écrit ensuite ÉCRASE la colonne entière (carte,
  // base) avec l'état d'avant : l'envoi est perdu, mais le milicien a déjà quitté la base.
  // Les ticks passent donc leur tour tant qu'une écriture vole (`persistTick`) ; les gestes
  // du joueur attendent qu'elles aient atterri avant de lire l'état (`writesSettled`).
  const inFlight = new Set<Promise<unknown>>();
  async function writesSettled(): Promise<void> {
    while (inFlight.size) await Promise.allSettled([...inFlight]);
  }
  /** Un tick peut écrire ce qu'il a calculé sur `snap` : rien ne vole, et l'état n'a pas
   *  changé depuis sa lecture. Sinon il passe son tour (il recalculera au suivant). */
  function tickMayWrite(snap: CharacterRow): boolean {
    return inFlight.size === 0 && row.value === snap;
  }
  /**
   * 📉 ÉCRIT SANS RELIRE LA LIGNE (v1.134, mesuré) : chaque écriture relisait la ligne ENTIÈRE
   * (`.select(COLS)`, jusqu'à 200 Ko de JSON pour un compte avancé), soit ~5 000 lignes
   * complètes par jour — le trafic sortant qui dépassait le quota gratuit de Supabase. Le
   * serveur ne transforme rien de ce qu'on écrit (son seul trigger interdit de changer le
   * pseudo), donc ce qu'il renverrait EST le patch : on relit seulement `updated_at` (la
   * preuve que la ligne existe et a été écrite) et on fusionne le patch tel que la base l'a
   * stocké (`writtenEcho`), puis on normalise comme avant.
   * ⚠️ Ce qu'un AUTRE appareil a écrit entre-temps n'est plus relu à chaque écriture : il
   * arrive au prochain chargement (`fetchMine`).
   */
  async function persist(userId: string, patch: Record<string, unknown>) {
    const echo = writtenEcho({ ...patch, updated_at: new Date().toISOString() });
    const req = Promise.resolve(
      supabase.from('characters').update(echo).eq('user_id', userId).select('updated_at').single(),
    );
    inFlight.add(req);
    let res: Awaited<typeof req>;
    try {
      res = await req;
    } finally {
      inFlight.delete(req);
    }
    if (res.error) throw res.error;
    // NORMALISE comme fetchMine (migration rangs/enchant/roll) : sans ça, la ligne
    // repartait BRUTE → valeurs (rang/qualité/puissance) potentiellement différentes de
    // l'état chargé → chiffres qui « bougent » (cf. tickets combat).
    row.value = normalizeRow(mergeWritten(row.value, echo));
    return row.value;
  }

  // MAJ optimiste : reflète le patch localement TOUT DE SUITE (l'or/les bâtiments
  // changent à l'écran sans attendre le roundtrip DB), puis persiste (qui écrase
  // avec la donnée serveur faisant autorité). Rollback si la persistance échoue.
  async function persistOptimistic(userId: string, patch: Partial<CharacterRow>) {
    const cur = row.value;
    if (!cur) return;
    const prev = row.value;
    row.value = { ...cur, ...patch };
    try {
      await persist(userId, patch);
    } catch (e) {
      row.value = prev;
      throw e;
    }
  }

  // Range de nouveaux objets : AUTO-ÉQUIPE ceux dont le slot est VIDE (confort :
  // on ne laisse pas un emplacement vide alors qu'on a de quoi le remplir) ; les
  // autres vont au sac. Ne remplace JAMAIS un objet déjà équipé.
  function distributeItems(
    equipped: Equipped,
    inventory: Item[],
    newItems: Item[],
  ): { equipped: Equipped; inventory: Item[] } {
    const eq: Equipped = { ...equipped };
    const inv = [...inventory];
    for (const it of newItems) {
      if (!eq[it.slot]) eq[it.slot] = it;
      else inv.push(it);
    }
    return { equipped: eq, inventory: inv };
  }

  // Codex des sets : mémorise les slots de set obtenus (indépendant de l'inventaire,
  // qu'on casse/vend). Renvoie la map inchangée si rien de nouveau (évite un write).
  function mergeSetSeen(
    cur: Record<string, string[]>,
    items: Array<{ setId?: string; slot: string } | null | undefined>,
  ): Record<string, string[]> {
    let changed = false;
    const next: Record<string, string[]> = { ...cur };
    for (const it of items) {
      if (!it?.setId) continue;
      const slots = next[it.setId] ? [...next[it.setId]!] : [];
      if (!slots.includes(it.slot)) {
        slots.push(it.slot);
        next[it.setId] = slots;
        changed = true;
      }
    }
    return changed ? next : cur;
  }

  // Applique un run de donjon : dépense l'énergie, encaisse or + poussière, range
  // le butin (auto-équipe si le slot est vide, sinon au sac).
  async function applyRun(
    userId: string,
    input: {
      energyCost: number;
      gold: number;
      drops: Item[];
      clearedDungeonId?: string;
      // Donjon TENTÉ (nettoyé ou non) : compte pour le % de réussite réel. Absent pour
      // l'arène, qui passe aussi par ici mais n'est pas un donjon.
      dungeonId?: string;
      summonStones?: number; // pierres d'invocation 🔮 (drop de donjon nettoyé)
      enchantScrolls?: number; // 📜 parchemins d'enchantement (filet de donjon nettoyé)
      talentDrops?: TalentInstance[]; // talents tombés (drop-only)
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    // Un donjon nettoyé débloque le suivant : on mémorise son id (dédup).
    const cleared =
      input.clearedDungeonId && !cur.cleared_dungeons.includes(input.clearedDungeonId)
        ? [...cur.cleared_dungeons, input.clearedDungeonId]
        : cur.cleared_dungeons;
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    // Clé d'expédition : ~2 % sur un donjon NETTOYÉ, en RUNS du palier de son niveau
    // (`dungeonKeyDrop`, v1.8.19).
    const gotKey = input.clearedDungeonId
      ? dungeonKeyDrop(input.clearedDungeonId, Math.random())
      : 0;
    return persist(userId, {
      gold: cur.gold + input.gold,
      summon_stones: cur.summon_stones + (input.summonStones ?? 0),
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
      // % de réussite RÉEL affiché sur la tuile du donjon : chaque tentative compte.
      ...(input.dungeonId
        ? {
            dungeon_stats: runAttempt(
              cur.dungeon_stats,
              input.dungeonId,
              input.clearedDungeonId === input.dungeonId,
            ),
          }
        : {}),
      keys: cur.keys + gotKey,
      ...(input.talentDrops?.length ? { talents: [...cur.talents, ...input.talentDrops] } : {}),
    });
  }

  // Applique une tentative de BOSS de palier : dépense les PIERRES D'INVOCATION 🔮
  // (win ou lose ; farmées dans les donjons → lie le farm aux boss), encaisse l'or +
  // poussière de base, et — en cas de victoire — mémorise le boss vaincu + pose une
  // RÉCOMPENSE EN ATTENTE (3 candidats au choix, cf. chooseReward).
  async function applyBossWin(
    userId: string,
    input: {
      bossId: string;
      summonCost: number; // pierres d'invocation dépensées (win ou lose)
      gold: number;
      defeated: boolean;
      drops?: Item[]; // butin (comme un donjon) — distribué (auto-équipe si slot libre/meilleur)
      enchantScrolls?: number; // 📜 parchemins d'enchantement (jalon boss)
      protections?: number; // 🛡️ protections d'enchant (jalon boss — la source précieuse)
      talentDrops?: TalentInstance[]; // talents tombés (drop-only)
    },
  ) {
    const cur = row.value;
    if (!cur) return null;
    const firstDefeat = input.defeated && !cur.defeated_bosses.includes(input.bossId);
    // ⚜️ Plus de sceaux d'objet sur les boss de palier (v0.1047) : ils viennent des REPAIRES de
    // la carte — aucune ressource de champion ne se farme dans la partie héros.
    const defeated = firstDefeat ? [...cur.defeated_bosses, input.bossId] : cur.defeated_bosses;
    // Clé d'expédition : GARANTIE à la 1re victoire (jalon) ; ~6 % ensuite sur les
    // réaffrontements, en RUNS du palier de son niveau (`bossKeyDrop`, v1.8.19).
    const keyGain = bossKeyDrop(input.bossId, firstDefeat, input.defeated, Math.random());
    // Butin de boss. Les pièces de SET DE VOIE vont au SAC : c'est l'écran qui les RANGE dans
    // leur set (`fileSetPieces`), une fois le drop révélé — lui seul a de quoi les juger au
    // barème du set, et une seule règle de rangement vaut pour toutes les sources (v0.839).
    // Les autres drops suivent le flux donjon (emplacement vide → porté / sac).
    const drops = input.drops ?? [];
    const setDrops = drops.filter((d) => voieSetIndex(d) >= 0);
    const otherDrops = drops.filter((d) => voieSetIndex(d) < 0);
    const dist = distributeItems(cur.equipped, [...cur.inventory, ...setDrops], otherDrops);
    await persist(userId, {
      gold: cur.gold + input.gold,
      summon_stones: Math.max(0, cur.summon_stones - input.summonCost),
      defeated_bosses: defeated,
      // % de réussite RÉEL affiché sur la carte du boss : chaque tentative compte, gagnée ou perdue.
      boss_stats: runAttempt(cur.boss_stats, input.bossId, input.defeated),
      equipped: dist.equipped,
      inventory: dist.inventory,
      set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, drops),
      keys: cur.keys + keyGain,
      ...(input.talentDrops?.length ? { talents: [...cur.talents, ...input.talentDrops] } : {}),
    });
  }

  // Choisit une récompense parmi les candidats en attente → l'applique et purge.
  async function chooseReward(userId: string, index: number) {
    const cur = row.value;
    const cand = cur?.pending_reward?.candidates[index];
    if (!cur || !cand) return;
    if (cand.kind === 'item') {
      // Pièce de SET DE VOIE → au SAC ; l'écran la range dans son set (`fileSetPieces`).
      // ⚠️ Elle partait à la forge si la pièce rangée « valait plus » — sur la valeur brute
      // du 1er affixe, un troisième barème qui contredisait les deux autres (v0.839).
      const dist =
        voieSetIndex(cand.item) >= 0
          ? { equipped: cur.equipped, inventory: [...cur.inventory, cand.item] }
          : distributeItems(cur.equipped, cur.inventory, [cand.item]);
      return persist(userId, {
        equipped: dist.equipped,
        inventory: dist.inventory,
        set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, [cand.item]),
        pending_reward: null,
      });
    }
    return persist(userId, {
      gold: cur.gold + cand.gold,
      pending_reward: null,
    });
  }

  // Applique une tentative de la Portail sans fin : dépense l'énergie, encaisse
  // or + poussière + butin ; si victoire ET palier plus profond, met à jour le record.
  async function applyEndless(
    userId: string,
    input: {
      tier: number;
      energyCost: number;
      gold: number;
      drops: Item[];
      cleared: boolean;
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    return persist(userId, {
      gold: cur.gold + input.gold,
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      endless_best: input.cleared && input.tier > cur.endless_best ? input.tier : cur.endless_best,
      // ~10 % de clé d'expédition sur un portail nettoyé.
      keys: cur.keys + (input.cleared && Math.random() < 0.1 ? 1 : 0),
    });
  }

  // ── Expéditions (donjons à étages) ──
  // Consomme les clés d’un palier du Labyrinthe (garde-fou : refuse si le compte n’y est pas).
  async function spendKey(userId: string, n = 1, labyId?: string): Promise<boolean> {
    const cur = row.value;
    // ⚠️ Le prix ENTIER (règle dans `keysAfterPaying`, testée) : un palier profond coûte
    // plusieurs clés, et on n’entre pas avec une clé pour trois.
    const reste = cur ? keysAfterPaying(cur.keys, n) : null;
    if (reste === null || !cur) return false;
    // Le run d'un palier compte AU LANCEMENT, dans la même écriture que les clés : un run
    // quitté en route reste un run tenté (le % affiché est celui du joueur, pas une estimation).
    await persist(userId, {
      keys: reste,
      ...(labyId ? { laby_stats: labyRunStarted(cur.laby_stats, labyId) } : {}),
    });
    return true;
  }
  // Crédite le butin d'une expédition/Labyrinthe (or + poussière + parchemins
  // d'enchant 📜 + objets au sac/équipés vides ; un familier passe simplement dans `drops`).
  async function applyExpedition(
    userId: string,
    input: {
      gold: number;
      drops: Item[];
      enchantScrolls?: number;
      clearedDungeonId?: string; // palier de Labyrinthe nettoyé (préfixe `laby:…`)
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    // Déblocage séquentiel des paliers de Labyrinthe (mémorisé dans cleared_dungeons, dédup).
    const cleared =
      input.clearedDungeonId && !cur.cleared_dungeons.includes(input.clearedDungeonId)
        ? [...cur.cleared_dungeons, input.clearedDungeonId]
        : cur.cleared_dungeons;
    const labyId = labyIdOfClear(input.clearedDungeonId);
    return persist(userId, {
      gold: cur.gold + input.gold,
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
      ...(labyId ? { laby_stats: labyRunCleared(cur.laby_stats, labyId) } : {}),
      set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, input.drops),
    });
  }

  // Verrouille/déverrouille un objet du sac (🔒 protégé de la casse/vente).
  async function toggleLock(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    return persist(userId, {
      inventory: cur.inventory.map((i) => (i.id === itemId ? { ...i, locked: !i.locked } : i)),
    });
  }

  // 🪙 VEND un objet du sac (v0.890 : le recyclage en ferraille est retiré — il en donnait
  // bien trop). Un familier se cède par `sellFamiliars`, un objet 🔒 ne part jamais.
  async function sellItem(userId: string, itemId: string): Promise<number> {
    return sellMany(userId, [itemId]);
  }

  // Vend EN MASSE une liste d'objets du sac (par id) → or. Une écriture, une animation d'or.
  async function sellMany(userId: string, ids: string[]): Promise<number> {
    const cur = row.value;
    if (!cur || !ids.length) return 0;
    const set = new Set(ids);
    const targets = cur.inventory.filter((i) => set.has(i.id) && canSell(i));
    if (!targets.length) return 0;
    const rm = new Set(targets.map((t) => t.id)); // ne retire QUE les vendables
    const gain = targets.reduce((a, it) => a + sellValue(it), 0);
    await persist(userId, {
      gold: cur.gold + gain,
      inventory: cur.inventory.filter((i) => !rm.has(i.id)),
    });
    goldFx.gain(gain);
    return gain;
  }

  /** Cède un FAMILIER contre de l'or (ses garde-fous vivent dans `sellFamiliars`). */
  async function sellFamiliar(userId: string, itemId: string): Promise<number> {
    return sellFamiliars(userId, [itemId]);
  }

  /** Vente GROUPÉE de familiers (les doublons). Une seule écriture, une seule animation
   *  d'or : vendre huit compagnons ne doit pas déclencher huit allers-retours réseau ni
   *  huit pièces qui volent. Le 🔒 protège ici comme partout ailleurs.
   *
   *  ⚠️ On ne vend pas un familier CONFIÉ à un aventurier : il partirait avec un
   *  appariement fantôme, et l’homme se battrait sans son compagnon sans qu’on l’ait
   *  décidé. Refusé ici, au STORE : l'écran peut ne pas proposer l'impossible, il ne peut
   *  pas le garantir. (Le familier PORTÉ par le héros vit dans `equipped` : hors d’atteinte
   *  par construction.) */
  async function sellFamiliars(userId: string, itemIds: string[]): Promise<number> {
    const cur = row.value;
    if (!cur || !itemIds.length) return 0;
    const wanted = new Set(itemIds);
    const sold = cur.inventory.filter(
      (i) => wanted.has(i.id) && i.slot === FAMILIAR_SLOT && !i.locked,
    );
    if (!sold.length) return 0;
    const gain = sold.reduce((s, i) => s + sellValue(i), 0);
    const gone = new Set(sold.map((i) => i.id));
    await persist(userId, {
      gold: cur.gold + gain,
      inventory: cur.inventory.filter((i) => !gone.has(i.id)),
    });
    goldFx.gain(gain);
    return gain;
  }

  // (Enchant d'objets retiré, ticket 7acb1e7c : les objets sont des drops purs — leur
  // magnitude est 100 % définie par le grade au drop, plus d'axe +N. Talents/familiers
  // gardent l'infusion de grade.)

  /** 🔮 VENTE AUTOMATIQUE des reliques en trop : par pouvoir, seules la MEILLEURE et celle
   *  qu'on PORTE restent (règle `relicSurplus`, testée). Les talents et familiers, eux, ne se
   *  vendent plus d'office : ils se FUSIONNENT (`fuseFamiliarsFromBag` / `fuseTalentsFromBag`).
   *  Une seule écriture pour tout le lot ; rien à vendre → aucune écriture. */
  async function sellSurplusRelics(userId: string): Promise<{ gold: number; relics: number }> {
    const cur = row.value;
    if (!cur) return { gold: 0, relics: 0 };
    const relIds = new Set(relicSurplus(cur.equipped.relic, cur.inventory));
    if (!relIds.size) return { gold: 0, relics: 0 };
    const gold = cur.inventory
      .filter((i) => relIds.has(i.id))
      .reduce((s, i) => s + sellValue(i), 0);
    await persist(userId, {
      gold: cur.gold + gold,
      inventory: cur.inventory.filter((i) => !relIds.has(i.id)),
    });
    goldFx.gain(gold);
    return { gold, relics: relIds.size };
  }

  /** 🔀 FUSION de trois FAMILIERS du sac de même rareté → un familier d'une race au hasard,
   *  de la rareté juste au-dessus, plafonnée au rang du joueur (règles dans
   *  `companionFusion.ts`, testées). Remplace la vente automatique des doublons.
   *  ⚠️ Refusé ici, au STORE : l'écran peut ne pas proposer l'impossible, il ne peut pas le
   *  garantir. Rend le familier obtenu, ou `null`. */
  async function fuseFamiliarsFromBag(
    userId: string,
    itemIds: string[],
    playerLevel: number,
  ): Promise<Item | null> {
    const cur = row.value;
    if (!cur) return null;
    const fams = itemIds
      .map((id) => cur.inventory.find((i) => i.id === id))
      .filter((i): i is Item => !!i);
    if (fams.length !== itemIds.length || familiarFusionBlock(fams, playerLevel)) return null;
    const made: Item = {
      ...fuseFamiliars(Math.random, fams, playerLevel),
      id: crypto.randomUUID(),
    };
    const gone = new Set(itemIds);
    await persist(userId, { inventory: [...cur.inventory.filter((i) => !gone.has(i.id)), made] });
    return made;
  }

  /** 🔀 FUSION de trois TALENTS non équipés de même rareté (même règle que les familiers). */
  async function fuseTalentsFromBag(
    userId: string,
    talentIds: string[],
    playerLevel: number,
  ): Promise<TalentInstance | null> {
    const cur = row.value;
    if (!cur) return null;
    const tals = talentIds
      .map((id) => cur.talents.find((t) => t.id === id))
      .filter((t): t is TalentInstance => !!t);
    if (tals.length !== talentIds.length || talentFusionBlock(tals, playerLevel)) return null;
    const made = fuseTalents(Math.random, tals, playerLevel, `tal_${crypto.randomUUID()}`);
    const gone = new Set(talentIds);
    await persist(userId, { talents: [...cur.talents.filter((t) => !gone.has(t.id)), made] });
    return made;
  }

  // Récompense de connexion du jour (une fois par jour logique). Renvoie le gain
  // (énergie + streak) pour l'animation, ou null si déjà réclamée aujourd'hui.
  async function claimDailyLogin(userId: string, todayIso: string, level: number) {
    const cur = row.value;
    if (!cur) return null;
    if (cur.last_login_date && daysBetweenIso(cur.last_login_date, todayIso) <= 0) return null;
    const gap = cur.last_login_date ? daysBetweenIso(cur.last_login_date, todayIso) : 999;
    const prev = cur.last_login_date
      ? { streak: cur.login_streak, graceUsed: cur.login_grace_used }
      : null;
    const next = advanceStreak(prev, gap);
    const energy = dailyLoginEnergy(next.streak, level);
    const usedGrace = gap === 2 && !!prev && !prev.graceUsed;
    await persist(userId, {
      login_streak: next.streak,
      login_grace_used: next.graceUsed,
      last_login_date: todayIso,
      login_energy: cur.login_energy + energy,
      // 💠 LE TIRAGE OFFERT DU JOUR. ⚠️ Il vit ICI plutôt que dans un compteur à part :
      // le bonus de connexion porte DÉJÀ la série, le jour de grâce et l'idempotence par
      // jour logique. Un second dispositif aurait eu sa propre notion de « aujourd'hui ».
      mana: cur.mana + dailyFreeMana(),
      energy_log: pushEnergyLog(cur.energy_log, {
        date: todayIso,
        emoji: '🎁',
        label: 'Bonus de connexion',
        amount: energy,
      }),
    });
    return { streak: next.streak, energy, mana: dailyFreeMana(), usedGrace };
  }

  /**
   * 🎰 TIRER — le seul puits des pierres de mana (refonte S/A/B, 2026-09-21).
   *
   * ⚠️ **UNE SEULE ÉCRITURE PAR GESTE**, lot compris : dix `persist` d'affilée, c'est dix
   * allers-retours pendant lesquels une coupure laisserait le mana débité et une partie du
   * lot perdue. Le pity, la mana, le vivier et le stock d'équipement partent ensemble.
   *
   * ⚠️ **LE VIVIER S'ACCUMULE D'UN TIRAGE AU SUIVANT** : deux exemplaires du même champion
   * dans un lot font un cran d'Éveil, pas deux entrées.
   *
   * ⚠️ **UN B N'EST PAS UN CHAMPION** : c'est une pièce d'équipement de lignée, tirée au
   * rang BRONZE ★1, toujours (le rang se gagne ensuite). Lignée prise dans le vivier s'il y en a un
   * (`rollGachaPiece`) ; sinon au hasard parmi celles
   * des champions — le tout premier tirage d'un compte vide ne doit pas rendre du vide.
   *
   * ⚠️ **AUCUNE REMISE** de bâtiment (cf. l'Autel des boss, v0.799). Rend `null` si la mana
   * manque — l'écran doit déjà l'empêcher, le store le garantit.
   */
  async function pullGacha(userId: string, count: number) {
    const cur = row.value;
    if (!cur) return null;
    // 🎟️ Les tickets d'abord, le reste en mana (combinables) ; un ×10 coûte 9 tirages payés.
    const pay = pullPayment(count, { tickets: cur.gacha_tickets, mana: cur.mana });
    if (!pay) return null;
    const lot = pullMany(Math.random, cur.gacha, count, cur.adventurers ?? []);
    let advs = cur.adventurers ?? [];
    let manaBack = 0;
    // 🔮 Chaque cran d'Éveil offre une rune, couleur selon la lettre et le cran.
    let awakenRunes = 0;
    const pieces: Omit<AdvGear, 'id'>[] = [];
    const results: LotItem[] = [];
    for (const r of lot.results) {
      // 🗡️ Lettre saturée (tous ses champions au maximum de l'Éveil) : une pièce de la MÊME
      // lettre au lieu d'une demi-mise en mana (audit 2026-10-15).
      if (r.champion && !saturatedPull(advs, r.champion)) {
        const g = grantChampion(advs, r.champion, {
          id: `adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        });
        advs = g.advs;
        manaBack += g.manaBack;
        if (g.duplicate && !g.manaBack) {
          const step = awakenLevel(g.copies);
          if (step > 0) awakenRunes += AWAKEN_RUNE_COUNT[r.champion.grade];
        }
        results.push({ ...g, grade: r.grade, champion: r.champion, gear: null });
      } else {
        const piece = gachaPiece(
          advs,
          cur.adv_gear?.stock ?? [],
          pieces,
          // ⚠️ L'équipement s'arrête à S : une lettre X saturée rend une pièce S.
          r.champion ? (r.grade === 'X' ? 'S' : r.grade) : rollGearGrade(Math.random),
        );
        pieces.push(piece);
        results.push({
          grade: piece.grade,
          champion: null,
          gear: { name: piece.name, emoji: piece.emoji, model: advGearModelOf(piece) },
          duplicate: false,
          copies: 0,
          manaBack: 0,
        });
      }
    }
    await persist(userId, {
      mana: cur.mana - pay.mana + manaBack,
      ...(pay.tickets ? { gacha_tickets: cur.gacha_tickets - pay.tickets } : {}),
      adventurers: advs,
      // ⚠️ `nextGacha` REPORTE l'état précédent : écrit à plat, le tirage effaçait la marque
      // `welcomed` et la bienvenue se re-versait au chargement suivant (v0.1083).
      gacha: nextGacha(cur.gacha, lot.pity, cur.gacha.pulls + count),
      ...(pieces.length ? { adv_gear: withAdvGear(cur, pieces) } : {}),
      ...(awakenRunes ? { runes: addRuneCount(cur.runes, awakenRunes) } : {}),
    });
    return results;
  }

  /** La pièce d'un tirage B — sa LETTRE est tirée à part (`rollGearGrade`) : les pièces A
   *  et S sortent des tirages B (décision de l'utilisateur). `rollGachaPiece` est la seule
   *  source d'équipement de champion. */
  function gachaPiece(
    advs: Adventurer[],
    stock: AdvGear[],
    pending: Omit<AdvGear, 'id'>[],
    grade: GearGrade,
  ): Omit<AdvGear, 'id'> {
    return rollGachaPiece(Math.random, advs, {
      grade,
      stock,
      pending,
    });
  }

  /** Un tirage à l'unité. */
  async function pullChampion(userId: string) {
    const r = await pullGacha(userId, 1);
    return r?.[0] ?? null;
  }

  /** 🎰 Un lot de 10 — 9 payés pour 10 (v0.968). */
  async function pullChampions(userId: string) {
    return pullGacha(userId, GACHA.multiCount);
  }

  // Bonus de passage de niveau (global). Verse l'énergie de chaque niveau franchi
  // depuis le dernier récompensé (croissant). reward_level=0 = jamais initialisé →
  // on cale la base au niveau actuel SANS bonus rétroactif. Renvoie l'événement à
  // célébrer, ou null. Idempotent (basé sur reward_level persisté).
  /** 🎫 Fait avancer les jetons de boss avec l'XP totale de sport (`advanceBossTokens`).
   *  N'écrit que si quelque chose a changé ; rend les jetons gagnés. */
  async function accrueBossTokens(userId: string, totalXp: number, today: string) {
    const cur = row.value;
    if (!cur) return 0;
    const r = advanceBossTokens(cur.boss_token_state, totalXp, today, cur.boss_tokens);
    if (JSON.stringify(r.state) === JSON.stringify(cur.boss_token_state) && !r.gained) return 0;
    await persistOptimistic(userId, { boss_tokens: r.stock, boss_token_state: r.state });
    return r.gained;
  }

  /** Le serveur vient de dépenser des jetons (lancer / rejoindre) : on le reflète tout de
   *  suite, sans quoi un gain de jetons écrirait la réserve d'AVANT la dépense. */
  function spentBossTokens(n: number) {
    const cur = row.value;
    if (cur) row.value = { ...cur, boss_tokens: Math.max(0, cur.boss_tokens - n) };
  }

  async function claimLevelUps(userId: string, currentLevel: number) {
    const cur = row.value;
    if (!cur) return null;
    const prev = cur.reward_level ?? 0;
    if (prev === 0) {
      // Première fois : on mémorise le niveau actuel, pas de flot rétroactif.
      await persist(userId, { reward_level: currentLevel });
      return null;
    }
    if (currentLevel <= prev) return null;
    let energy = 0;
    for (let l = prev + 1; l <= currentLevel; l++) energy += levelUpEnergy(l);
    // 🎟️ Le niveau global EST le sport : un ticket par niveau franchi (v0.992). ⚠️ Dans la
    // MÊME écriture que `reward_level`, qui le rend idempotent — jamais deux fois le même.
    const tickets = levelUpTickets(prev, currentLevel);
    await persist(userId, {
      reward_level: currentLevel,
      login_energy: cur.login_energy + energy,
      gacha_tickets: cur.gacha_tickets + tickets,
      energy_log: pushEnergyLog(cur.energy_log, {
        date: isoDayLocal(Date.now()),
        emoji: '⭐',
        label:
          currentLevel > prev + 1
            ? `Niveaux ${prev + 1}–${currentLevel}`
            : `Niveau ${currentLevel}`,
        amount: energy,
      }),
    });
    useGameFx().celebrateTickets(
      tickets,
      currentLevel > prev + 1
        ? `Niveaux ${prev + 1} à ${currentLevel} franchis`
        : `Niveau ${currentLevel} franchi`,
    );
    return { from: prev, to: currentLevel, energy, tickets };
  }

  // ── Talents (refonte B : drop + infusion + loadout à emplacements) ──
  // Équipe un talent possédé (respecte le quota talentsEarned(level)). Swap libre.
  // Équipe un talent. Refuse si un talent du MÊME code est déjà équipé (loadout à
  // effets DISTINCTS) ou si plus d'emplacement. Renvoie un code de résultat pour le feedback.
  async function equipTalent(
    userId: string,
    id: string,
    playerLevel: number,
  ): Promise<'ok' | 'dup' | 'full' | 'noop'> {
    const cur = row.value;
    if (!cur) return 'noop';
    const inst = cur.talents.find((t) => t.id === id);
    if (!inst || inst.equipped) return 'noop';
    if (cur.talents.some((t) => t.equipped && t.code === inst.code)) return 'dup'; // déjà ce type
    if (cur.talents.filter((t) => t.equipped).length >= talentsEarned(playerLevel)) return 'full';
    const talents = cur.talents.map((t) => (t.id === id ? { ...t, equipped: true } : t));
    await persistOptimistic(userId, { talents });
    return 'ok';
  }
  async function unequipTalent(userId: string, id: string) {
    const cur = row.value;
    if (!cur) return;
    const talents = cur.talents.map((t) => (t.id === id ? { ...t, equipped: false } : t));
    return persistOptimistic(userId, { talents });
  }
  // Équipe EXACTEMENT l'ensemble d'ids fourni (talents conseillés) en une écriture.
  async function setEquippedTalents(userId: string, ids: string[]) {
    const cur = row.value;
    if (!cur) return;
    const keep = new Set(ids);
    const talents = cur.talents.map((t) => ({ ...t, equipped: keep.has(t.id) }));
    return persistOptimistic(userId, { talents });
  }
  // ── ÉCONOMIE SIMPLIFIÉE (ticket 0ec48637) : plus de recyclage ni d'infusion de grade des
  // talents/familiers (les poussières d'âme/d'encre sont retirées du gameplay). Objets,
  // talents ET familiers = drops purs → on VEND les surplus contre de l'OR. (Les objets et
  // familiers passent par `sell`/`sellMany` — ce sont des Item du sac ; les talents ci-dessous.)
  // Vend un talent NON équipé du sac → or (∝ rang). Renvoie l'or gagné.
  async function sellTalent(userId: string, talentId: string): Promise<number> {
    const cur = row.value;
    if (!cur) return 0;
    const t = cur.talents.find((x) => x.id === talentId);
    if (!t || t.equipped) return 0;
    // Rang + JET + niveau du talent → même barème que les objets (vente qui compte).
    const gain = sellValueOf(talentRank(talentTier(t.xp)), talentRollOf(t), t.level ?? 1);
    await persistOptimistic(userId, {
      gold: cur.gold + gain,
      talents: cur.talents.filter((x) => x.id !== talentId),
    });
    goldFx.gain(gain);
    return gain;
  }

  async function equip(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const equipped: Equipped = { ...cur.equipped };
    const inventory = cur.inventory.filter((i) => i.id !== itemId);
    const prev = equipped[item.slot];
    if (prev) inventory.push(prev);
    equipped[item.slot] = item;
    return persist(userId, { equipped, inventory });
  }

  // Équipe un objet du sac ET dispose de l'objet remplacé (vend → or / garde → sac) en
  // UNE écriture. Évite l'aller-retour par le sac.
  async function equipReplacing(userId: string, itemId: string, disposal: 'sell' | 'keep') {
    const cur = row.value;
    if (!cur) return;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const equipped: Equipped = { ...cur.equipped };
    const inventory = cur.inventory.filter((i) => i.id !== itemId);
    const prev = equipped[item.slot];
    equipped[item.slot] = item;
    const patch: Partial<CharacterRow> = { equipped };
    let sold = 0;
    if (prev && disposal === 'sell' && canSell(prev)) {
      sold = sellValue(prev);
      patch.gold = cur.gold + sold;
    } else if (prev) inventory.push(prev); // keep (ou pièce 🔒 : le verrou protège)
    patch.inventory = inventory;
    const res = await persist(userId, patch);
    if (sold) goldFx.gain(sold);
    return res;
  }

  async function unequip(userId: string, slot: ItemSlot) {
    const cur = row.value;
    if (!cur) return;
    const item = cur.equipped[slot];
    if (!item) return;
    const equipped: Equipped = { ...cur.equipped };
    delete equipped[slot];
    return persist(userId, { equipped, inventory: [...cur.inventory, item] });
  }

  // Vend un SET de voie : sa réserve, ses doublons ET ses pièces au sac → or.
  // Renvoie le gain. ⚠️ Le lot vient de `setSellLot` (lib), le même que l’écran annonce :
  // la carte montrait des pièces au sac que le bouton ne touchait pas (v0.806).
  // ⚠️ Les pièces 🔒 restent RANGÉES dans le set : le verrou protège de toutes les sorties.
  async function sellLoadout(
    userId: string,
    i: number,
    score: (it: Item) => number,
  ): Promise<number> {
    const cur = row.value;
    const voie = VOIES[i];
    if (!cur || !voie || i < 0 || i >= MAX_LOADOUTS) return 0;
    const lo = cur.loadouts[i];
    const { sold, keep } = setSellLot(`voie:${voie.id}`, lo, cur.inventory);
    if (!sold.length) return 0;
    const fondues = new Set(sold.map((it) => it.id));
    const gain = sold.reduce((s, it) => s + sellValue(it), 0);
    const emptied = normalizeLoadouts(cur.loadouts).map((l, k) =>
      k === i ? { items: {}, spares: [] } : l,
    );
    const inBag = new Set(cur.inventory.map((it) => it.id));
    const { loadouts } = fileSetPieces(
      emptied,
      keep.filter((it) => !inBag.has(it.id)),
      score,
    );
    await persist(userId, {
      gold: cur.gold + gain,
      inventory: cur.inventory.filter((it) => !fondues.has(it.id)),
      loadouts,
    });
    goldFx.gain(gain);
    return gain;
  }

  /** Range dans leur set TOUTES les pièces de set de voie du sac (v0.839) — la meilleure à
   *  l'emplacement. `skipIds` : pièces à laisser au sac pour l'instant (le drop d'un boss
   *  pas encore révélé). Une seule écriture.
   *  ⚠️ LES DOUBLONS SONT VENDUS aussitôt (v0.890, demandé par l’utilisateur : « au lieu de
   *  les accumuler dans le loadout ») — tous ceux des sets, sauf les 🔒. Renvoie aussi l’or. */
  async function fileBagSetPieces(
    userId: string,
    score: (it: Item) => number,
    skipIds: ReadonlySet<string> = new Set(),
  ): Promise<{ filed: FiledPiece[]; gold: number }> {
    const cur = row.value;
    if (!cur) return { filed: [], gold: 0 };
    const pieces = cur.inventory.filter((it) => voieSetIndex(it) >= 0 && !skipIds.has(it.id));
    const hasSpares = sparesLot(cur.loadouts).sold.length > 0;
    if (!pieces.length && !hasSpares) return { filed: [], gold: 0 };
    const filedRes = fileSetPieces(cur.loadouts, pieces, score);
    const { sold } = sparesLot(filedRes.loadouts);
    const gone = new Set(sold.map((it) => it.id));
    const loadouts = filedRes.loadouts.map((l) => ({
      ...l,
      spares: (l.spares ?? []).filter((it) => !gone.has(it.id)),
    }));
    const gold = sold.reduce((a, it) => a + sellValue(it), 0);
    const moved = new Set(filedRes.filed.map((f) => f.item.id));
    await persist(userId, {
      inventory: cur.inventory.filter((it) => !moved.has(it.id)),
      loadouts,
      ...(gold ? { gold: cur.gold + gold } : {}),
    });
    if (gold) goldFx.gain(gold);
    return { filed: filedRes.filed, gold };
  }

  /** Met un doublon dans son set à la place de la pièce en place (qui devient doublon). */
  async function promoteSetSpare(userId: string, setIndex: number, spareId: string) {
    const cur = row.value;
    if (!cur) return false;
    const loadouts = promoteSpare(cur.loadouts, setIndex, spareId);
    if (!loadouts) return false;
    await persist(userId, { loadouts });
    return true;
  }

  /** Vend les doublons d'un set (ou de tous). Les 🔒 restent. Renvoie l'or gagné. */
  async function sellSpares(userId: string, setIndex?: number): Promise<number> {
    const cur = row.value;
    if (!cur) return 0;
    const { sold } = sparesLot(cur.loadouts, setIndex);
    if (!sold.length) return 0;
    const fondus = new Set(sold.map((it) => it.id));
    const loadouts = normalizeLoadouts(cur.loadouts).map((l) => ({
      ...l,
      spares: (l.spares ?? []).filter((it) => !fondus.has(it.id)),
    }));
    const gain = sold.reduce((s, it) => s + sellValue(it), 0);
    await persist(userId, { gold: cur.gold + gain, loadouts });
    goldFx.gain(gain);
    return gain;
  }

  /** Vend UNE pièce de set rangée (doublon ou pièce en place — le meilleur doublon de
   *  l'emplacement la remplace). Refus au store pour une pièce 🔒 ou portée. */
  async function sellSetPiece(
    userId: string,
    itemId: string,
    score: (it: Item) => number,
  ): Promise<number> {
    const cur = row.value;
    if (!cur) return 0;
    const r = takeSetPiece(cur.loadouts, itemId, score);
    if (!r) return 0;
    const gain = sellValue(r.taken);
    await persist(userId, { gold: cur.gold + gain, loadouts: r.loadouts });
    goldFx.gain(gain);
    return gain;
  }

  // OPTIMISEUR D'ÉQUIPEMENT (v0.607) : trouve la MEILLEURE combinaison d'emplacements parmi
  // l'équipé + le sac + les réserves de set. ⚠️ Plus de voie à essayer (2026-09-22) : la voie
  // SE DÉDUIT du set porté (`wornVoie`), elle ne change plus aucun calcul — un seul plan suffit.
  // Les non-retenus sont re-rangés (pièce de set → réserve de son set ; le reste → sac).
  /** Le PLAN proposé par l'optimiseur, sans rien appliquer. ⚠️ C'est un TOUT COHÉRENT :
   *  les talents sont choisis POUR ce gear, la voie POUR son capstone. Accepter une partie
   *  seulement donne donc un autre build — c'est pourquoi `applyGearPlan` **recalcule**
   *  au lieu d'appliquer des morceaux, et pourquoi l'écran de revue doit recalculer le
   *  gain de chaque ligne au lieu d'afficher un chiffre figé. */
  async function computeGearPlan(
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    /** « Porter ce set » : impose ses pièces.
     *  ⚠️ Sans ça, le bouton lançait l'optimiseur voie forcée mais stuff LIBRE — il rendait
     *  donc le meilleur build sur cette voie, souvent sans une seule pièce du set demandé
     *  (constaté : « Porter le set Frénétique » → 2 Gardien + 1 Duelliste + 1 Berserker).
     *  Le chiffre annoncé était juste ; c'est le bouton qui ne tenait pas sa promesse. */
    forceSetId?: string,
    /** Rendre le build MÊME s'il n'améliore pas l'actuel (cf. `bestBuild`). */
    always?: boolean,
    /** Appelée entre deux étapes pour RENDRE LA MAIN à l'interface. */
    respire?: () => Promise<void>,
  ): Promise<{
    equipped: Equipped;
    talentIds: string[];
    voie: string | null;
    score: number;
  } | null> {
    const cur = row.value;
    if (!cur) return null;
    // Les TALENTS entrent dans l'optimisation : on ne part plus de ceux déjà équipés,
    // ils sont choisis pour le build. `withEquipped` marque un sous-ensemble comme équipé.
    const maxTal = talentsEarned(level);
    const withEquipped = (ids: string[]): TalentInstance[] =>
      normalizeTalents(cur.talents).map((t) => ({ ...t, equipped: ids.includes(t.id) }));
    const loadouts0: Loadout[] = Array.from(
      { length: MAX_LOADOUTS },
      (_, k) => cur.loadouts[k] ?? { items: {} },
    );

    type Plan = {
      equipped: Equipped;
      score: number;
      voie: string | null; // la voie DÉDUITE du set retenu (affichage)
      talents: TalentInstance[]; // talents équipés retenus pour ce plan
    };
    function planFor(polish = false): Plan {
      const voie = null; // n'influe plus sur aucun calcul (voie déduite du set porté)
      // ⚠️ POOL = TOUT CE QU'ON POSSÈDE, toutes réserves confondues. Avant, seule la réserve
      // de la voie candidate était portable : une meilleure pièce d'un AUTRE set restait
      // invisible, et surtout aucun DEMI-SET croisé (2 pièces d'un set + 2 d'un autre) ne
      // pouvait être formé — les deux moitiés vivant dans deux réserves différentes.
      // Mesuré sur un compte réel : +135 de puissance pour ~350 ms de calcul.
      // ⚠️ Ce n'est PAS destructeur pour les collections : `applyGearPlan` re-range les
      // pièces non retenues dans le set de LEUR voie. On redistribue, on ne dissout pas.
      // ⚠️ Doublons compris (v0.839) : une pièce battue AU BARÈME DU SET peut encore gagner
      // dans un autre build — le rangement ne doit jamais la rendre invisible.
      const pool = [...cur!.inventory, ...ownedInLoadouts(loadouts0)];
      const fxOf = (ids: string[]) => talentEffects(withEquipped(ids));
      // Ascension par coordonnées talents ↔ gear : les meilleurs talents dépendent du gear
      // (et réciproquement). Deux passes suffisent en pratique — on part des talents déjà
      // équipés, on optimise le gear, on re-choisit les talents POUR ce gear, on refait le
      // gear. Chaque étape ne peut qu'améliorer le score, donc ça converge.
      let talIds = normalizeTalents(cur!.talents)
        .filter((t) => t.equipped === true)
        .slice(0, maxTal)
        .map((t) => t.id);
      // Pièces IMPOSÉES : la meilleure possédée pour chaque emplacement du set demandé.
      // On réutilise `voieSetRoster`, donc exactement ce que « Mes sets » affiche — le
      // bouton porte ce que la carte montre, sans seconde règle qui pourrait diverger.
      const pin = forceSetId
        ? (() => {
            // Même arbitre que l'écran : la pièce épinglée est celle que la carte montre.
            const r = voieSetRoster(forceSetId, cur!.equipped, undefined, pool, (it) =>
              combatPower(
                // ⚠️ `fxOf(talIds)` et NON `extra` : `extra` est déclaré plus bas, et cette
                // IIFE s'exécute immédiatement — le lire ici lèverait un ReferenceError
                // que le typecheck ne voit pas (accès dans une closure).
                playerWithGear(
                  name,
                  stats,
                  { ...cur!.equipped, [it.slot]: it },
                  fxOf(talIds),
                  level,
                  voie,
                ),
              ),
            );
            const out: Partial<Record<ItemSlot, Item>> = {};
            for (const sl of SLOTS) if (r[sl]) out[sl] = r[sl].item;
            return Object.keys(out).length ? out : undefined;
          })()
        : undefined;
      let best: Equipped = cur!.equipped;
      for (let pass = 0; pass < 2; pass++) {
        best = bestGearLoadout(
          name,
          stats,
          cur!.equipped,
          pool,
          level,
          fxOf(talIds),
          voie,
          pin,
          polish,
        );
        talIds = pickBestTalents(cur!.talents, maxTal, (ids) =>
          combatPower(playerWithGear(name, stats, best, fxOf(ids), level, voie)),
        );
      }
      const extra = fxOf(talIds);
      // FAMILIAR_SLOT inclus : le familier est désormais optimisé lui aussi.
      // ⚠️ Le RANGEMENT des non-retenus n'est pas calculé ici : il l'était pour chaque voie
      // essayée puis jeté (seuls équipement, talents et voie sortent du plan). C'est
      // `applyGearPlan` qui range, avec la règle unique de `setFiling`.
      const equipped: Equipped = { ...cur!.equipped };
      for (const s of WORN_SLOTS) equipped[s] = best[s];
      const score = combatPower(playerWithGear(name, stats, equipped, extra, level, voie));
      return { equipped, score, voie: wornVoie(equipped), talents: withEquipped(talIds) };
    }

    // Exploration rapide (sans polissage), puis polissage du plan retenu : la passe
    // d'amélioration locale coûte ~500 ms sur un gros sac.
    if (respire) await respire();
    planFor();
    if (respire) await respire();
    const best = planFor(true);
    // GARDE-FOU ANTI-REGRESSION : on ne remplace le build actuel que par du STRICTEMENT
    // meilleur. Sans ca, un changement de regle (ex. plafond de talents abaisse) pourrait
    // faire PERDRE de la puissance a un clic sur « equipement automatique ».
    const curScore = combatPower(
      playerWithGear(name, stats, cur.equipped, talentEffects(cur.talents), level),
    );
    // ⚠️ Le garde-fou protège l'équipement AUTOMATIQUE d'une perte accidentelle. Il ne
    // s'applique PAS à « Porter ce set » : là, le joueur choisit une identité, et il a le
    // droit de payer ce choix — l'aperçu lui annonce l'écart avant qu'il n'appuie.
    if (!always && !forceSetId && best.score <= curScore) return null;
    return {
      equipped: best.equipped,
      talentIds: best.talents.filter((t) => t.equipped).map((t) => t.id),
      voie: best.voie,
      score: best.score,
    };
  }

  /** LE MEILLEUR BUILD POSSIBLE, qu'il soit meilleur que l'actuel ou non.
   *
   *  ⚠️ RÉFÉRENCE UNIQUE de toutes les comparaisons d'objets. Avant, chaque objet du sac
   *  était comparé à CE QU'ON PORTE, tandis que l'équipement conseillé cherchait le
   *  meilleur build POSSIBLE : deux étalons, donc deux verdicts qui pouvaient se
   *  contredire sur le même objet (mesuré : un talisman à +30 pour la pastille, −15 dans
   *  le build optimal — les deux justes, et l'écran incompréhensible). Avec un seul
   *  étalon, la contradiction devient impossible par construction.
   *
   *  ⚠️ Distinct de `previewGearPlan`, qui rend `null` quand il n'y a rien à gagner :
   *  pour comparer, il nous faut le build MÊME quand il est déjà porté. */
  function bestBuild(
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    respire?: () => Promise<void>,
  ) {
    return computeGearPlan(stats, level, name, undefined, true, respire);
  }

  /** Le plan proposé, SANS rien appliquer — c'est ce que l'écran de revue affiche. */
  function previewGearPlan(
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    respire?: () => Promise<void>,
  ) {
    return computeGearPlan(stats, level, name, undefined, undefined, respire);
  }

  /** Applique un build CHOISI (tout ou partie du plan). ⚠️ On ne « pose » pas des morceaux :
   *  on repart de l'équipement cible et on RECONSTRUIT le rangement (sac + réserves de set)
   *  à partir de tout ce qu'on possède. Sans ça, refuser une ligne laisserait une pièce
   *  orpheline — ni portée, ni au sac, ni en réserve. */
  async function applyGearPlan(
    userId: string,
    target: { equipped: Equipped; talentIds: string[]; voie: string | null },
    /** Barème du rangement des pièces de set (`setPieceScorer`). */
    score: (it: Item) => number,
  ): Promise<boolean> {
    const cur = row.value;
    if (!cur) return false;
    const allSlots = WORN_SLOTS;
    // Tout ce qu'on possède : porté + sac + toutes les réserves, doublons compris.
    const owned: Item[] = [
      ...allSlots.map((sl) => cur.equipped[sl]).filter((x): x is Item => !!x),
      ...cur.inventory,
      ...ownedInLoadouts(cur.loadouts),
    ];
    const kept = new Set(
      allSlots.map((sl) => target.equipped[sl]?.id).filter((x): x is string => !!x),
    );
    const seen = new Set<string>();
    const leftovers = owned.filter((it) => {
      if (kept.has(it.id) || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    // Les réserves repartent vides : on re-range TOUT ce qui n'est pas porté, avec la règle
    // unique (`fileSetPieces`) — jamais rien à la forge, les battues en doublon.
    const { loadouts, rest: sac } = fileSetPieces([], leftovers, score);
    const talents = normalizeTalents(cur.talents).map((t) => ({
      ...t,
      equipped: target.talentIds.includes(t.id),
    }));
    await persist(userId, {
      equipped: target.equipped,
      inventory: sac,
      loadouts,
      talents,
    });
    return true;
  }

  /** Ancien geste « tout appliquer d'un coup » — conservé pour « Porter ce set », qui
   *  impose ses pièces et n'a pas à passer par un écran de revue. */
  async function optimizeGear(
    userId: string,
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    forceSetId?: string,
  ): Promise<boolean> {
    const plan = await computeGearPlan(stats, level, name, forceSetId);
    if (!plan || !row.value) return false;
    const cur = row.value;
    return applyGearPlan(
      userId,
      plan,
      setPieceScorer({
        name,
        stats,
        level,
        fx: talentEffects(cur.talents),
        equipped: cur.equipped,
        loadouts: cur.loadouts,
      }),
    );
  }

  // ── Mode idle « Expédition » (carte + héros temporisé) ──
  function newSeed(now: number): number {
    return (now ^ 0x9e3779b9) >>> 0 || 1;
  }
  // Assure la carte (crée si absente) et l'avance jusqu'à `now`. Persiste si changé.
  /** 🗼 Dernière activité sportive connue (jours actifs sur 7), relevée par les ticks qui la
   *  reçoivent : la synchro de la carte ne la reçoit pas, et le préavis de la Tour n'en dépend
   *  qu'à la marge (il est borné par l'intervalle entre deux sièges). */
  let knownActiveDays7 = 7;
  /** 🗼 Le rayon de détection de la base : ce qu'une armée parcourt pendant le préavis de la
   *  Tour de guet — la MÊME règle que la détection des sièges (`advanceBase`). */
  function detectRadiusOf(
    base: BaseState | null | undefined,
    map: ExpeditionMap | null | undefined,
  ): number {
    const defenses = base?.defenses ?? [];
    // 🏝️ Sur une île : la part de l'île que la Tour voit (niveau ÷ niveau max de l'île).
    if (map?.archipel)
      return islandDetectRadius(
        scoutLevel(defenses),
        map.archipel.island,
        controlDetectBoost(map, Date.now()),
      );
    return detectRadius(
      baseLeadMs(
        scoutLevel(defenses),
        raidIntervalMs(knownActiveDays7),
        controlDetectBoost(map, Date.now()),
      ),
    );
  }
  /** 👁️ Le préavis que tes lieux fixes tenus donnent sur un siège, graine par graine
   *  (`siegeSightLeadMs`) : la même carte, la même portée et le même point d'origine que
   *  l'armée posée par `syncFieldArmies`, sinon elle n'apparaîtrait pas là où le fort l'a vue. */
  function fortSightOf(cur: CharacterRow): (seed: number) => number {
    const map = cur.expedition_map;
    if (!map) return () => 0;
    const reach = mapReach(map, mapOutpostLevel(map, buildingLevel(cur.buildings, 'outpost')));
    const circles = detectionCircles(map, 0, reach);
    if (circles.length < 2) return () => 0; // la base seule : pas de fort
    const island = map.archipel?.island;
    return (seed) =>
      siegeSightLeadMs(
        seed,
        circles,
        reach,
        island,
        map.archipel ? siegeOrigin({ seed }, map.pois) : undefined,
      );
  }
  /** ⚔️🗼 Les voyages dont l'issue est tirée (groupes, héros) : les chocs contre les armées en
   *  campagne s'y lisent (`pendingFieldHits`). */
  function fieldVoyages(cur: CharacterRow): { midAt: number; outcome: ExpeditionOutcome }[] {
    return [...partyList.value, ...(cur.expedition ? [cur.expedition] : [])];
  }

  async function expeSyncMap(userId: string, now: number, level: number) {
    const cur = row.value;
    if (!cur) return;
    // 🏝️ ÉTAPE 7 — LA BASCULE (`archipelBascule.ts`) : une carte classique passe sur l'île 1,
    // avec le coffre de compensation des lieux tenus qui n'existent pas sur l'île, DANS LA MÊME
    // écriture (une carte qui porte `archipel` ne rebascule jamais). Le tick suivant rappelle
    // leur garnison (`retiredHeld`, récolte comprise) et pose les lieux de l'île.
    if (cur.expedition_map && !cur.expedition_map.archipel) {
      if (!tickMayWrite(cur)) return;
      const b = basculeToArchipel(cur.expedition_map, now);
      if (b) {
        await persist(userId, {
          expedition_map: b.map,
          ...(b.message ? { messages: boxWith(cur, [b.message], MESSAGES_CAP) } : {}),
        });
        return;
      }
    }
    // 🔀 Un lieu TENU dont le type a été remplacé par un autre à la même place devient ce
    // nouveau type (`convertReplacedControls`) : carte et champions postés dans la MÊME écriture.
    if (cur.expedition_map) {
      const aimed = new Set([
        ...[...partyList.value, ...(cur.expedition ? [cur.expedition] : [])].flatMap((p) => [
          p.poi.id,
          ...(p.homeId ? [p.homeId] : []),
        ]),
        ...attackList.value.flatMap((a) => [
          a.poi.id,
          ...a.wings.flatMap((w) => (w.originId ? [w.originId] : [])),
        ]),
      ]);
      const conv = convertReplacedControls(cur.expedition_map, now, aimed);
      if (conv) {
        if (!tickMayWrite(cur)) return;
        await persist(userId, {
          expedition_map: conv.map,
          adventurers: advList.value.map((a) => {
            const to = a.posted && conv.renamed.get(a.posted);
            return to ? { ...a, posted: to } : a;
          }),
        });
        return;
      }
    }
    // 🗼 Un point d'un type RETIRÉ encore tenu (la tour de guet) : sa garnison et le héros
    // rentrent à pied d'abord ; il quitte la carte au tick suivant, une fois vide.
    if (cur.expedition_map) {
      // 🪺🕯️ De même un nid ou un objectif éteint tenu d’avant la règle « on l’abat » (`heldRazedObjectives`).
      const old = [...retiredHeld(cur.expedition_map), ...heldRazedObjectives(cur.expedition_map)];
      if (old.length) {
        // 🧝 `recallControl` ramène aussi le héros posté là (ou en route vers ce lieu).
        for (const p of old) await recallControl(userId, p.id, now, level);
        return;
      }
    }
    const orig = cur.expedition_map;
    // ⏳ La traversée pas encore partie se recale sur le retour des troupes encore en route
    // (`postponeCrossing`) — avant le débarquement, qui sinon changerait la carte sous leurs pieds.
    const post = orig ? postponeCrossing(orig, advList.value, troopsBackAt(cur), now) : null;
    const advBase = post?.advs ?? advList.value;
    const src = post?.map ?? orig;
    // ⛵ DÉBARQUER d'abord (`crossing.ts`) : l'île quittée est rangée, l'île d'arrivée sort de
    // sa réserve ou naît neuve — tout le reste du tick travaille sur la carte d'arrivée.
    const land = src ? landCrossing(src, now, level, cur.base?.militia) : null;
    const prev = land?.map ?? src;
    // 🕳️ LES FAILLES MÛRES SE LISENT ICI, AVANT `advanceWorld` — c'est le SEUL instant où
    // elles sont encore sur la carte : lui les remplace par leur mine de mana résiduel.
    // Après lui, il n'y a plus rien à voir, et l'armée disparaîtrait avec la faille.
    const over = prev ? riftOverflows(prev, now) : [];
    // 🗺️ L'Avant-poste fixe la taille de la carte révélée et son nombre de lieux (v0.1047).
    // 🏝️ Sauf en mode archipel : l'île a sa taille, et le niveau de ses lieux un plafond.
    // 🏝️ Une carte NEUVE naît sur l'île 1 (étape 7 : tout le monde joue l'archipel).
    const sizing = prev ?? { archipel: archipelOn(1) };
    const outpost = mapOutpostLevel(sizing, buildingLevel(cur.buildings, 'outpost'));
    level = mapPlayerLevel(sizing, level);
    // 🏰 Les points de contrôle (fixes) se posent s'ils manquent — ils sont hors quota.
    // 🏝️ Puis les objectifs de l'île et sa forteresse, et la règle de production de l'île.
    const map0: ExpeditionMap = ensureIslandConquest(
      ensureControls(
        prev
          ? // 🩸 Les troupes ennemies usées se renforcent des sorties arrivées (une fois par
            // tick, avant les combats ; la même carte quand rien ne change).
            healWear(advanceWorld(prev, now, level, outpost, cur.expedition?.poi.id), now)
          : { ...createMap(newSeed(now), now, level, outpost), archipel: archipelOn(1) },
        now,
        level,
        outpost,
      ),
      now,
      level,
      // 🐫 Un convoi battu avant son arrivée ne renforce pas la forteresse.
      convoyVanquished(partyList.value),
      // ⚓ Un lieu d'où une équipe est partie garde sa place jusqu'à son retour.
      new Set([
        ...[...partyList.value, ...(cur.expedition ? [cur.expedition] : [])].flatMap((p) =>
          p.homeId ? [p.homeId] : [],
        ),
        ...attackList.value.flatMap((a) =>
          a.wings.flatMap((w) => (w.originId ? [w.originId] : [])),
        ),
      ]),
    );
    // ⚔️🗼 Les armées qui marchent sur la base ou sur un point fixe, VISIBLES dans le rayon de
    // détection de la Tour de guet (`fieldArmy.ts`).
    const mapF = syncFieldArmies(map0, {
      raid: cur.base?.raid ?? null,
      detectR: detectRadiusOf(cur.base, map0),
      reach: mapReach(map0, outpost),
      now,
      playerLevel: level,
    });
    // ⛺ Les camps de brigands (île 1) pillent la réserve non récoltée des bâtiments : la
    // carte (prochaine échéance), les bâtiments et le rapport partent dans la MÊME écriture.
    const pil = brigandPillage(mapF, cur.buildings, now);
    const mapP = pil?.map ?? mapF;
    // 🏰 La forteresse de l'île abattue : son coffre, une seule fois (marque dans la carte,
    // même écriture). ⚓ Le premier débarquement sur une île : le sien.
    const fort = fortressReward(mapP, now);
    // 🌀 Île 5 : un coffre par victoire sur la brèche sans fin.
    const endless = endlessReward(fort?.map ?? mapP, now);
    // 🛡️ La Caserne produit aussi pour les îles rangées (une réserve par île).
    const mapM = produceIslandMilitia(
      endless?.map ?? fort?.map ?? mapP,
      buildingLevel(cur.buildings, 'barracks'),
      now,
    );
    const landIsl = land?.crossing && land.firstTime ? islandById(land.crossing.to) : null;
    const islandMsgs = [
      ...(fort ? [fort.msg] : []),
      ...(endless?.msgs ?? []),
      ...(landIsl && landIsl.id > 1
        ? [landingChestMessage(landIsl, land!.crossing!.arriveAt)]
        : []),
    ];
    const advLanded = land?.crossing ? landAdventurers(advBase, land.crossing) : null;
    // ⛵ Les champions partis SANS le héros arrivent : APRÈS le débarquement du héros (qui a
    // pu changer l'île active), pour qu'ils sachent s'ils sont « ici » ou ailleurs.
    // ⛵🛡️ Les miliciens arrivés d'une autre île rejoignent la réserve où ils accostent
    // (`militiaSea.ts`) — AVANT `settleSailings`, qui retire les navigations arrivées.
    const milSea = settleMilitiaSailings(mapM, land?.militia ?? cur.base?.militia, now, level);
    const mapS = milSea?.map ?? mapM;
    const sail = settleSailings(mapS, advLanded ?? advBase, now);
    const map = sail?.map ?? mapS;
    const advNext = sail?.advs ?? advLanded ?? post?.advs ?? null;
    // ⚠️ ON NE MARQUE QU'UNE BASE QUI EXISTE. Sans enceinte, personne ne vient assiéger
    // (`raidsEnabled`) et `advanceBase` effacerait le marquage au tick suivant : en créer
    // une ici pour la marquer aussitôt serait une base née d'un effet de bord, avec une
    // graine qui n'est pas celle que le tick de base lui aurait donnée.
    // ⚓ Au débarquement, la réserve de milice de l'île d'arrivée devient celle de la base.
    const reserveNext = milSea ? milSea.reserve : land?.militia;
    const base0 = reserveNext && cur.base ? { ...cur.base, militia: reserveNext } : null;
    const baseM = base0 ?? cur.base;
    const base = over.length && baseM ? markOverflow(baseM, over.map(riftOverflowOf)) : base0;
    const mapChanged = JSON.stringify(map) !== JSON.stringify(orig);
    // `markOverflow` rend la MÊME référence quand il n'y a rien de plus récent à poser.
    const baseChanged = !!base && base !== cur.base;
    if (!mapChanged && !baseChanged) return;
    if (!tickMayWrite(cur)) return;
    // 💥 Le débordement se DIT (v0.1218) : un message par faille, dans la même écriture que
    // la carte — son id vient de la faille, donc une resynchronisation ne le double pas.
    const ovfMsgs = [
      ...over.map((r) => overflowMessage(r, map, !!cur.base)),
      ...(pil?.msg ? [pil.msg] : []),
      ...islandMsgs,
    ];
    // ⚠️ UNE SEULE ÉCRITURE pour les deux. Persister la carte sans le marquage ferait
    // disparaître la faille en laissant son armée nulle part ; persister le marquage sans
    // la carte la ferait redéborder au tick suivant. Le marquage est idempotent
    // (`riftOverflowOf` est daté du débordement, pas de `now`), donc un échec d'écriture
    // se rattrape au tick d'après au lieu de dupliquer la menace.
    await persist(userId, {
      ...(mapChanged ? { expedition_map: map } : {}),
      ...(baseChanged ? { base } : {}),
      ...(pil?.msg ? { buildings: pil.buildings } : {}),
      ...(advNext ? { adventurers: advNext } : {}),
      ...(ovfMsgs.length ? { messages: boxWith(cur, ovfMsgs, MESSAGES_CAP) } : {}),
    });
    if (land?.crossing) {
      const isl = islandById(land.crossing.to);
      if (isl)
        useGameFx().celebrate({
          kind: 'unlock',
          emoji: '⚓',
          title: `Débarqué sur l'île ${isl.id}`,
          subtitle: isl.name,
          rarity: land.firstTime ? 'legendary' : 'rare',
        });
    }
    // 🏯 L'Avant-poste vient de découvrir une citadelle : elle sort du brouillard À L'ÉCRAN
    // (demandé par l'utilisateur). Après l'écriture : la carte d'après porte la découverte, un
    // tick suivant ne la rejoue donc pas.
    const found = newlyDiscoveredCitadels(prev, map);
    if (found.length)
      useGameFx().celebrate({
        kind: 'citadel',
        emoji: '🏯',
        ...citadelDiscoveryFx(map, found),
        rarity: 'legendary',
      });
  }
  /** ⏳ Quand les troupes qui marchent vers un lieu fixe ou en reviennent seront-elles toutes
   *  rentrées ? (0 s'il n'y en a pas). Leur arrivée se règle sur la carte ACTIVE : la traversée
   *  du héros part après (`crossingDeparture`, `postponeCrossing`). */
  function troopsBackAt(cur: CharacterRow): number {
    let t = 0;
    for (const a of attackList.value) for (const w of a.wings) t = Math.max(t, w.returnAt);
    for (const p of partyList.value)
      if (p.homeId || p.poi.type === 'control') t = Math.max(t, p.returnAt);
    for (const p of cur.expedition_map?.pois ?? []) {
      for (const r of p.control?.reinforcing ?? []) t = Math.max(t, r.at);
      for (const r of p.control?.returning ?? []) t = Math.max(t, r.at);
    }
    return t;
  }
  /** ⛵ Le départ qu'aurait une traversée du héros réservée maintenant. */
  function crossingDepartAt(now: number): number {
    const cur = row.value;
    return cur ? crossingDeparture(now, troopsBackAt(cur)) : nextCrossingDeparture(now);
  }
  /** ⛵ La raison qui empêche de traverser vers l'île `to` (null = possible). */
  function crossingBlock(to: number) {
    const cur = row.value;
    if (!cur?.expedition_map) return 'noArchipel' as const;
    return crossingBlocker(cur.expedition_map, to, {
      // 🏰 Posté sur un lieu fixe, il embarque de là ; en marche (vers un poste ou de retour),
      // il est en trajet.
      heroBusy:
        !!cur.expedition ||
        heroInAttack(attackList.value) ||
        heroComing(cur.expedition_map) ||
        cur.expedition_map.heroReturnAt !== undefined,
      championsAway: championsTravelling(advList.value, Date.now()),
    });
  }
  /** ⛵ Les champions qui PEUVENT embarquer depuis l'île `from` : sur l'île active, les libres
   *  ET la garnison de la forteresse (le port) ; sur une île rangée, ses champions libres. */
  function boardableIds(from: number, now: number): string[] {
    const map = row.value?.expedition_map;
    const active = map?.archipel?.island;
    if (!map || active === undefined) return [];
    if (from !== active) return islandChampions(advList.value, from, active, now).map((a) => a.id);
    return [...new Set([...crossingTravellers(advList.value, now), ...boardFromFortress(map).ids])];
  }
  /** 🏰 Les champions choisis quittent la garnison de la forteresse (le port) avant d'embarquer. */
  function leavePort(map: ExpeditionMap, ids: readonly string[], hero: boolean, at: number) {
    const port = boardFromFortress(map, new Set(ids), hero, at);
    const fromPort = new Set(port.ids);
    const advs = advList.value.map((a) =>
      fromPort.has(a.id) && a.posted === FORTRESS_ID ? { ...a, posted: undefined } : a,
    );
    return { map: port.map, advs };
  }
  /** ⛵ RÉSERVE LA TRAVERSÉE du héros vers l'île `to` : départ tout de suite (ou au retour des troupes), arrivée
   *  2 h après. `pick` = les champions qui l'accompagnent (option A, 2026-10-03) ; absent =
   *  tous ceux qui peuvent embarquer. */
  async function crossIsland(
    userId: string,
    to: number,
    now: number,
    pick?: readonly string[],
    /** 🛡️ Vers l'avant : où laisser la milice sur l'île quittée (`leavingMilitiaPoints`). */
    militiaPlan?: MilitiaPlan,
  ) {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map?.archipel) return;
    const why = crossingBlock(to);
    if (why) throw new Error(CROSSING_BLOCK_LABEL[why]);
    const ok = boardableIds(cur.expedition_map.archipel.island, now);
    const ids = pick ? ok.filter((id) => pick.includes(id)) : ok;
    // 🏰 La forteresse est le port : les choisis de sa garnison et le héros embarquent de là.
    const { map: m, advs } = leavePort(cur.expedition_map, ids, true, now);
    // 🧝 Posté sur un AUTRE lieu tenu, le héros embarque aussi : il quitte son poste.
    const map = startCrossing(unpostHero(m, now), to, ids, now, troopsBackAt(cur), militiaPlan);
    await persist(userId, {
      expedition_map: map,
      adventurers: boardTravellers(advs, map.crossing!),
    });
  }
  /** ⛵ Fait NAVIGUER des champions SANS le héros, de l'île `from` vers l'île `to` (deux îles
   *  déjà visitées). La carte active ne change pas ; ils changent d'île à l'arrivée. */
  async function sailChampions(
    userId: string,
    from: number,
    to: number,
    ids: readonly string[],
    now: number,
  ) {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map?.archipel) return;
    const why = sailingBlocker(cur.expedition_map, from, to, ids, boardableIds(from, now));
    if (why) throw new Error(SAILING_BLOCK_LABEL[why]);
    const active = cur.expedition_map.archipel.island;
    const { map: m, advs } =
      from === active
        ? leavePort(cur.expedition_map, ids, false, now)
        : { map: cur.expedition_map, advs: advList.value };
    const map = startSailing(m, from, to, ids, now);
    await persist(userId, {
      expedition_map: map,
      adventurers: boardTravellers(advs, map.sailings![map.sailings!.length - 1]!),
    });
  }
  /** 🧱🏹 Ce que l'enceinte de la base retire aux troupes qui reprennent un lieu fixe
   *  (`fortifyMult`, au niveau du héros). Lu par la bataille ET par le % affiché. */
  function fortify(cur: CharacterRow | null | undefined, heroLevel: number): number {
    return fortifyMult(cur?.base?.defenses ?? [], heroLevel);
  }
  /** 🧱🏹 Idem pour l'écran. */
  function fortifyFor(heroLevel: number): number {
    return fortify(row.value, heroLevel);
  }
  /** 🛡️ Déplace des miliciens sur une île RANGÉE (`moveRemoteMilitia`) : `delta` > 0 de sa
   *  réserve vers le lieu fixe `pointId`, < 0 du lieu vers la réserve. Immédiat. */
  async function moveIslandMilitia(
    userId: string,
    island: number,
    pointId: string,
    delta: number,
    now: number,
    level: number,
  ) {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    const im = map?.islands?.[String(island)];
    if (!cur || !map || !im) return;
    const next = moveRemoteMilitia(im, pointId, delta, now, level);
    if (!next)
      throw new Error(
        delta > 0
          ? 'Plus de place sur ce lieu, ou plus de milicien en réserve sur cette île.'
          : 'Aucun milicien à ramener de ce lieu.',
      );
    await persist(userId, {
      expedition_map: { ...map, islands: { ...map.islands, [String(island)]: next } },
    });
  }
  /** ⛵🛡️ Fait venir `n` miliciens de l'île rangée `from` sur l'île active (`militiaSea.ts`) :
   *  2 h de mer, puis la réserve de la base. Le refus a sa raison (`shipMilitiaBlocker`). */
  async function shipIslandMilitia(
    userId: string,
    from: number,
    n: number,
    now: number,
    level: number,
  ) {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return;
    const why = shipMilitiaBlocker(map, cur.base?.militia, from, n);
    if (why) throw new Error(SHIP_MILITIA_BLOCK_LABEL[why]);
    const next = shipMilitia(map, cur.base?.militia, from, n, now, level);
    if (next) await persist(userId, { expedition_map: next });
  }
  /** ⛵🏰 Envoie `n` miliciens d'un lieu fixe vers un lieu fixe d'une AUTRE île
   *  (`shipMilitiaToPoint`) : 2 h de mer, leur place gardée. Le refus a sa raison
   *  (`shipPointBlocker`). */
  async function shipMilitiaBetweenPoints(
    userId: string,
    from: MilitiaSpot,
    to: MilitiaSpot,
    n: number,
    now: number,
    level: number,
  ) {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return;
    const why = shipPointBlocker(map, cur.base?.militia, from, to, n);
    if (why) throw new Error(POINT_SHIP_BLOCK_LABEL[why]);
    const next = shipMilitiaToPoint(map, cur.base?.militia, from, to, n, now, level);
    if (next) await persist(userId, { expedition_map: next });
  }
  // Envoie le héros (dépense l'or, retire le POI de la carte, calcule l'issue seedée).
  async function expeSend(userId: string, poi: Poi, hero: Combatant, now: number, level: number) {
    const cur = row.value;
    if (!cur) return;
    if (cur.expedition) throw new Error('Une expédition est déjà en cours.');
    if (heroInAttack(cur.attacks))
      throw new Error('Ton héros est réservé pour une attaque combinée.');
    if (cur.expedition_map?.crossing) throw new Error('Ton héros est en traversée.');
    if (cur.expedition_map?.heroReturnAt !== undefined)
      throw new Error('Ton héros rentre de son poste : attends son retour à la base.');
    // ⚔️🕳️ Un camp ET une faille s'attaquent en GROUPE (`sendParty`) : même le héros seul y
    // passe, pour que l'issue soit le combat de faction ou l'incursion, et jamais l'ancien
    // gardien — ni, pour une faille, la MINE D’OR dans laquelle `resolveOutcome` la faisait
    // tomber (v0.926). ⚠️ Une expédition héros DÉJÀ en route vers un camp (ancien format)
    // reste résolue et encaissée normalement.
    // ⚠️ Les lieux de RÉCOLTE aussi, depuis qu'ils sont GARDÉS (2026-09-22) : le héros seul y
    // part toujours (« oui, seul aussi »), mais en groupe d'un, pour affronter les gardes
    // (`resolveHarvestParty`) — une expédition solo les contournait.
    if (PARTY_TARGETS.has(poi.type)) throw new Error('Ce lieu s’attaque en groupe.');
    // ⚠️ L'infirmerie n'était vérifiée que par l'écran Aventure (`expeBlocked`) : depuis la
    // carte, un héros blessé repartait. Le refus vit ici pour qu'aucun écran ne l'oublie.
    const healIn = woundRemainingMs(cur.base, now);
    if (healIn > 0)
      throw new Error(
        `🤕 Ton héros est à l’infirmerie — de retour dans ${Math.ceil(healIn / 60000)} min.`,
      );
    if (!expeditionsUnlocked(cur.buildings))
      throw new Error('Construis un Avant-poste d’expédition pour envoyer des héros.');
    // ⚠️ Plus de coût d'envoi (v0.1069, décision de l'utilisateur).
    // Réduction de trajet selon le niveau de l'avant-poste.
    const mult = travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now);
    // 🌗 La condition d'île À L'ENVOI : l'issue (or, consommable) est figée ici.
    const fx = conditionFx(cur.expedition_map, now);
    const fromTown = startExpedition(
      hero,
      poi,
      now,
      (now ^ (poi.level * 2654435761)) >>> 0 || 1,
      mult,
      level,
      fx.goldOf(poi.type),
    );
    // 🧝 Posté sur un lieu tenu, il part de son poste et y revient (`expeditionFromPost`) —
    // la règle de trajet d'une sortie (`legFromSpot`), comme l'envoi en équipe.
    const post = heroPostOf(cur.expedition_map);
    const started = post
      ? expeditionFromPost(
          fromTown,
          post,
          legFromSpot(poi, post, (p) => travelOneWayMin(poiTravelLevel(p), p.distNorm) * mult),
          { name: cur.pseudo, level, combatant: hero },
        )
      : fromTown;
    // 🎒 Un consommable peut tomber de TOUT voyage (« tout partout »), tiré sur sa graine.
    const exp = {
      ...started,
      outcome: { ...started.outcome, supplies: rollSupplyDrop(started.seed, fx.supplyChance) },
    };
    const baseMap = cur.expedition_map ?? {
      ...createMap(newSeed(now), now, level, buildingLevel(cur.buildings, 'outpost')),
      archipel: archipelOn(1),
    };
    // 🗺️ Un départ de plus : la carte harcèle d'autant plus qu'on l'utilise.
    // 🧝 Posté sur un lieu tenu, il en part directement (`unpostHero`).
    // 🔙 Daté de l'ARRIVÉE : un demi-tour (avant l'arrivée) le retire, il ne compte jamais.
    const map: ExpeditionMap = recordDeparture(
      unpostHero({ ...baseMap, pois: baseMap.pois.filter((p) => p.id !== poi.id) }, now, true),
      now,
      exp.midAt,
    );
    await persist(userId, { expedition: exp, expedition_map: map });
  }
  // À l'arrivée à l'objectif : dépose le rapport (une seule fois). Renvoie le message si nouveau.
  /** ⚠️ `activeDays7` REQUIS : un point de contrôle pris AVEC le héros se règle ici. */
  async function expeTick(
    userId: string,
    now: number,
    activeDays7: number,
  ): Promise<ExpeditionMessage | null> {
    const cur = row.value;
    const exp0 = cur?.expedition;
    if (!cur || !exp0 || now < exp0.midAt || exp0.reported) return null;
    // ⚔️ Arrivé après la chute de sa cible : il ne trouve plus rien (`supersedeLate`).
    const exp = lateAware(cur, now).expedition ?? exp0;
    const msg = buildMessage(exp);
    const x = reportXp(cur, boxWith(cur, [msg], MESSAGES_CAP), [msg], advList.value);
    // ⚔️ Une interception AVEC le héros vit ici, pas dans `partyTick` : elle ne levait
    // jamais le marquage (v0.1190).
    const dw = dispelWon(cur.base, [msg]);
    // 🏰 Même piège pour un point de contrôle pris AVEC le héros (v0.1239) : sans cette
    // ligne, sa garnison ne se posterait jamais.
    const ctl = settleControlAssaults(
      cur,
      [msg],
      (x.patch as { adventurers?: Adventurer[] }).adventurers ?? advList.value,
      activeDays7,
    );
    // 🏰 Assaut pris : le héros (et les champions en trop) rentrent à leur propre pas.
    const exp2 = shortenWonReturn({ ...exp, reported: true });
    const advs0 =
      ctl?.adventurers ?? (x.patch as { adventurers?: Adventurer[] }).adventurers ?? advList.value;
    const advs1 = rescheduleReturners(advs0, tripCrew(exp), exp.returnAt, exp2.returnAt);
    // 🗺️ Le lieu que le héros n'a pas terrassé revient sur la carte DÈS LE RAPPORT : on peut y
    // renvoyer une équipe sans attendre qu'il rentre (`restoreUnvanquished`).
    const mapIn = ctl?.map ?? cur.expedition_map;
    const mapOut = restoreUnvanquished(mapIn, [exp, ...partyList.value], now);
    // 🧝🏰 Resté sur le point qu'il vient de prendre : son voyage s'arrête ici, ceux qui
    // rentrent deviennent un groupe ordinaire (`heroStayedSplit`).
    const split = heroStayedSplit(
      exp2,
      heroPostOf(mapOut)?.id === exp.poi.id,
      new Set(advs1.filter((a) => a.posted === exp.poi.id).map((a) => a.id)),
      now,
      `party_${now.toString(36)}`,
    );
    // 🤕 Blessé, il rentre à la base depuis le lieu du combat, pas par son poste
    // (`heroHurtSplit`) ; ses champions continuent vers le poste.
    const hurt =
      !split && mapOut
        ? heroHurtSplit(
            exp2,
            heroHomeLegMin(cur, mapOut, exp.poi, exp.midAt),
            now,
            `party_${now.toString(36)}`,
          )
        : null;
    const parted = split?.party ?? hurt?.party;
    await persist(userId, {
      ...(dw.base ? { base: dw.base } : {}),
      expedition: split ? null : (hurt?.expedition ?? exp2),
      ...(parted ? { parties: [...partyList.value, parted] } : {}),
      messages: dw.tag(x.messages),
      ...x.patch,
      ...(ctl ? { adventurers: ctl.adventurers } : {}),
      ...(ctl || mapOut !== mapIn ? { expedition_map: mapOut } : {}),
      ...(advs1 !== advs0 ? { adventurers: advs1 } : {}),
    });
    x.play();
    flushIslandFx(row.value?.expedition_map);
    return msg;
  }
  // Au retour en ville : crédite le butin (or/poussière/objet/clé) et libère le héros.
  /** RETOUR EN VILLE. Le héros rentre — il est de nouveau disponible — mais **son
   *  chargement reste dans la sacoche** : c'est le joueur qui l'encaisse, depuis la boîte
   *  📬 (`expeClaim`). ⚠️ Le héros est libéré SANS condition : le bloquer jusqu'à ce qu'on
   *  vienne cliquer punirait l'absence, ce que le jeu ne fait jamais. Le butin, lui, ne se
   *  périme pas : il attend dans la boîte aussi longtemps qu'il faut. */
  async function expeSettle(
    userId: string,
    now: number,
    activeDays7: number,
  ): Promise<ExpeditionMessage | null> {
    const cur = row.value;
    const exp0 = cur?.expedition;
    if (!cur || !exp0 || settleClock(cur, now) < exp0.returnAt) return null;
    const exp = exp0.reported ? exp0 : (lateAware(cur, now).expedition ?? exp0);
    // Le rapport a pu être déposé à l'arrivée sur l'objectif (`expeTick`) ; sinon (app
    // fermée tout du long) on le dépose maintenant. Dans les deux cas il porte le butin.
    const msg = buildMessage({ ...exp, reported: true });
    // ⚠️ DÉJÀ DÉPOSÉ → on NE RÉÉCRIT PAS la boîte. L'ancien code REMPLAÇAIT le rapport par
    // `buildMessage(...)`, qui porte `claimed: false` : un butin encaissé entre le retour
    // (`claimAt`) et ce tick redevenait encaissable (revue finale des camps — or, objets, XP
    // d'escorte, pièces d'aventurier). Sinon, `depositMessages` n'ajoute que l'absent.
    const x = exp.reported
      ? null
      : reportXp(cur, boxWith(cur, [msg], MESSAGES_CAP), [msg], advList.value);
    const dw = exp.reported ? null : dispelWon(cur.base, [msg]);
    const ctl = x
      ? settleControlAssaults(
          cur,
          [msg],
          (x.patch as { adventurers?: Adventurer[] }).adventurers ?? advList.value,
          activeDays7,
        )
      : null;
    // 🗺️ Un lieu que le héros n'a pas terrassé revient sur la carte (`restoreUnvanquished`).
    const map0 = ctl ? ctl.map : cur.expedition_map;
    const map1 = restoreUnvanquished(map0, [exp, ...partyList.value], now);
    // 🏰 Parti d'un POSTE (`homeId`) : ses champions reprennent leur garnison comme une sortie
    // (`sortiesHome`), et le héros sa place (`heroBackToPost`) — sinon il rentre à pied.
    const advs0 = ctl?.adventurers ?? (x?.patch as { adventurers?: Adventurer[] })?.adventurers;
    const home = exp.homeId
      ? sortiesHome(
          cur,
          [{ ...exp, id: 'hero' }],
          { map: map1, adventurers: advs0 ?? advList.value },
          false,
        )
      : null;
    const map2 = home?.map ?? map1;
    const homePoi = exp.homeId ? map2?.pois.find((p) => p.id === exp.homeId) : undefined;
    // 🤕 Revenu blessé d'une défaite : infirmerie à la base, convalescence datée de son
    // retour (`heroMissionWound`). Il ne reprend donc pas son poste.
    const base0 = dw?.base ?? baseOf(cur, now);
    const hurtHero = !!exp.outcome.party?.heroHurt;
    // 🧭 Blessé au retour d'une sortie depuis son poste : il rentre À PIED de son poste à la
    // base, comme ses champions blessés ; sa convalescence ne court qu'à son arrivée.
    // ⚠️ Depuis le LIEU DU COMBAT, à l'heure du rapport (`heroHurtSplit`, ici quand l'app
    // était fermée au rapport) : jamais de détour par son poste.
    const hurtWalk =
      hurtHero && map2 && homePoi
        ? heroWalksHomeFrom(map2, exp.poi, exp.midAt, heroHomeLegMin(cur, map2, exp.poi, exp.midAt))
        : null;
    const woundMs = woundMsFor(
      defenseLevel(base0.defenses, 'infirmary'),
      raidIntervalMs(activeDays7),
    );
    const wound = hurtWalk
      ? heroWoundAfter(hurtWalk.heroReturnAt ?? exp.returnAt, woundMs, base0.wound, now)
      : heroMissionWound(exp, woundMs, base0.wound, now);
    const map = hurtWalk
      ? hurtWalk
      : !hurtHero && exp.homeId && map2 && homePoi
        ? heroBackToPost(
            map2,
            exp.homeId,
            exp.homeHero,
            exp.returnAt,
            heroHomeLegMin(cur, map2, homePoi, exp.returnAt),
          )
        : map2;
    const advsOut = home?.adventurers ?? ctl?.adventurers;
    await persist(userId, {
      ...(wound ? { base: { ...base0, wound } } : dw?.base ? { base: dw.base } : {}),
      ...(x && x.messages !== cur.messages
        ? { messages: dw ? dw.tag(x.messages) : x.messages }
        : {}),
      ...(x?.patch ?? {}),
      ...(advsOut ? { adventurers: advsOut } : {}),
      ...(ctl || map !== map0 ? { expedition_map: map } : {}),
      expedition: null,
    });
    x?.play();
    flushIslandFx(row.value?.expedition_map);
    return msg;
  }

  /** Encaisse le butin d'UN rapport. Idempotent par construction : `claimed` passe à
   *  `true` dans la même écriture que le crédit, et un message déjà encaissé (ou légué de
   *  l'époque du crédit automatique, donc sans `claimed`) est refusé. */
  /** COFFRE DE FIN DE DÉFI 360 — déposé dans la boîte 📬, à ouvrir à la main.
   *
   *  ⚠️ IDEMPOTENT par construction : l’id du message est dérivé de celui du défi, donc
   *  un second appel ne peut pas créer un doublon. C’est indispensable ici — le déclencheur
   *  est un BALAYAGE (à chaque ouverture de l’Aventure on cherche les 360 terminés sans
   *  coffre), donc il repasse forcément plusieurs fois sur le même défi.
   *
   *  ⚠️ Rien n’est crédité ici : le coffre attend, comme un rapport d’expédition, et
   *  c’est `expeClaim` qui verse tout — une seule voie de crédit, donc pas deux endroits
   *  où une devise pourrait être oubliée.
   *
   *  Le CONTENU est décidé en amont (`comboChestPlan`) et conservé sur le défi : ici on ne
   *  fait que le livrer. */
  async function grantComboChest(
    userId: string,
    comboId: string,
    comboName: string,
    sets: number,
    chest: ComboChestRecord,
  ): Promise<boolean> {
    const cur = row.value;
    if (!cur) return false;
    const id = comboChestMessageId(comboId);
    if (cur.messages.some((m) => m.id === id)) return false;
    const msg: ExpeditionMessage = {
      id,
      chest: true,
      title: '🎁 Coffre du Défi 360',
      level: chest.level,
      win: true,
      text: `${comboName} — ${sets} séries. Le village a vu ta semaine.`,
      gold: chest.gold,
      energy: chest.energy,
      summonStones: chest.summonStones,
      key: chest.keys,
      tickets: chest.tickets ?? 0,
      resolvedAt: chest.at,
      claimAt: chest.at, // pas de route à faire : le coffre est déjà là
      claimed: false,
      read: false,
    };
    await persist(userId, { messages: boxWith(cur, [msg], MESSAGES_CAP) });
    return true;
  }

  /** Dépose le COFFRE d'un boss entre amis dans la boîte 📬 et rend l'id du message.
   *  ⚠️ IDEMPOTENT PAR LA MARQUE `chestMark` posée dans `cleared_dungeons`, PAS par l'id du
   *  message : la boîte ne garde que 30 messages, un coffre chassé serait redéposé.
   *  ⚠️ Rien n'est crédité ici, comme pour le coffre du Défi 360 : c'est `expeClaim` qui
   *  verse — une seule voie de crédit. Si l'écran ne va pas jusqu'à l'encaissement (réseau
   *  coupé), le coffre attend dans la boîte au lieu d'être perdu. */
  async function grantFriendBossChest(
    userId: string,
    bossId: string,
    bossName: string,
    chest: FriendBossChest,
    now: number,
  ): Promise<string | null> {
    const cur = row.value;
    if (!cur) return null;
    const id = chestMark(bossId);
    if (cur.cleared_dungeons.includes(id)) return null;
    // 🎁 Coffre complet (ta part faite), demi-coffre, ou lot de consolation : le titre le dit.
    const kind =
      chest.share >= 1 ? 'Coffre' : chest.share >= 0.5 ? 'Demi-coffre' : 'Lot de consolation';
    const msg: ExpeditionMessage = {
      id,
      chest: true,
      title: `🐉 ${kind} du boss entre amis`,
      level: chest.level,
      win: true,
      text: `${bossName} — ${Math.round(chest.share * 100)} % de ton coffre, selon tes reps.`,
      gold: chest.gold,
      energy: 0,
      summonStones: chest.stones,
      ...(chest.trophy
        ? { item: chest.trophy, itemName: chest.trophy.name, items: [chest.trophy] }
        : {}),
      key: 0,
      tickets: chest.tickets,
      resolvedAt: now,
      claimAt: now,
      claimed: false,
      read: false,
    };
    await persist(userId, {
      messages: boxWith(cur, [msg], MESSAGES_CAP),
      cleared_dungeons: [...cur.cleared_dungeons, id],
    });
    return id;
  }

  /** Dépose le BONUS DE GROUPE d'un boss abattu dans la boîte 📬 et rend l'id du message.
   *  Mêmes garanties que `grantFriendBossChest` (marque `bonusMark`, crédit par `expeClaim`). */
  async function grantFriendBossBonus(
    userId: string,
    bossId: string,
    bossName: string,
    bonus: FriendBossBonus,
    level: number,
    now: number,
  ): Promise<string | null> {
    const cur = row.value;
    if (!cur) return null;
    const id = bonusMark(bossId);
    if (cur.cleared_dungeons.includes(id)) return null;
    const parts = [`${bossName} — abattu en groupe`];
    if (bonus.early > 0) parts.push(`${Math.round(bonus.early * 100)} % du temps restant`);
    if (bonus.help > 0) parts.push('tu as couvert un ami 🤝');
    const msg: ExpeditionMessage = {
      id,
      chest: true,
      title: '🐉 Bonus de groupe du boss entre amis',
      level,
      win: true,
      text: parts.join(' · ') + '.',
      gold: bonus.gold,
      energy: 0,
      summonStones: bonus.stones,
      key: 0,
      tickets: 0,
      resolvedAt: now,
      claimAt: now,
      claimed: false,
      read: false,
    };
    await persist(userId, {
      messages: boxWith(cur, [msg], MESSAGES_CAP),
      cleared_dungeons: [...cur.cleared_dungeons, id],
    });
    return id;
  }

  async function expeClaim(userId: string, messageId: string, now: number) {
    const cur = row.value;
    if (!cur) return null;
    const m = cur.messages.find((x) => x.id === messageId);
    // ⚠️ `claimedLocally` : un encaissement déjà PARTI (double toucher, ou ligne pas encore
    // relue) est refusé ici — `row.value` dirait encore `claimed: false`.
    if (!m || claimedLocally.has(m.id) || !isClaimable(m, now)) return null;
    // Objets ramenés : l'arène en rend PLUSIEURS ; `item` seul = messages d'avant `items`.
    const drops = (m.items && m.items.length ? m.items : m.item ? [m.item] : []).map((it) => ({
      ...it,
      id: crypto.randomUUID(),
    }));
    const inventory = drops.length ? [...cur.inventory, ...drops] : cur.inventory;
    // ⚔️ UN GROUPE DE CAMP : XP par aventurier, infirmerie des camps, pièces d'aventurier,
    // dressage des compagnons. ⚠️ `m.party` ABSENT des rapports d'avant : rien à
    // faire. ⚠️ Crédité UNE fois : `isClaimable` en tête + `claimed: true` dans la MÊME
    // écriture. ⚠️ Le héros et l'escorte ont été libérés au RETOUR, sans condition ; seul
    // le butin attendait ce geste.
    const party = m.party;
    let partyPatch: Record<string, unknown> = {};
    // ⭐ Ce que la mission a changé pour le GROUPE — étoiles, rang, « prêt pour l'ascension ».
    // Les convois l'annonçaient depuis la v0.794 ; les camps et les failles, jamais.
    let advProgress: AdvProgress[] = [];
    // 📊 La barre d’étoile AVANT → APRÈS de chaque membre : l’annonce d’étoile ne jouait rien
    // pour un gain qui reste entre deux étoiles — le cas le plus fréquent.
    let advTracks: AdvXpTrack[] = [];
    if (party) {
      const claim = partyClaimRoster(party, advList.value, {
        pantheonLevel: pantheonLevel.value,
        heroLevel: heroLevel.value,
        infirmaryLevel: defenseLevel(cur.base?.defenses ?? [], 'infirmary'),
        // ⏱️ Le RETOUR en ville (`claimAt`), pas ce clic : la convalescence a déjà couru.
        // Les rapports d’avant n’ont que `resolvedAt` — le même repli qu`isClaimable`.
        backAt: m.claimAt ?? m.resolvedAt,
        now,
        // 🎓 Versée à l'ARRIVÉE du rapport (`grantReportXp`) ; les rapports d'avant ce
        // changement ne l'ont pas reçue et la reçoivent ici.
        xpGranted: !!m.xpGranted,
        // 🕯️ L'hospice tenu de l'île abrège les soins (1 sans hospice, hors archipel).
        healMult: hospiceHealMult(cur.expedition_map),
      });
      advProgress = advProgressOf(advList.value, claim.adventurers);
      const gearPatch = gearTrainedPatch(cur, advList.value, claim.adventurers);
      advTracks = gearAwareTracks(cur, advList.value, claim.adventurers, gearPatch);
      partyPatch = { adventurers: claim.adventurers, ...gearPatch };
    }
    // ⚠️ ENTIERS À L'ENCAISSEMENT : ces colonnes sont `integer`, une valeur décimale fait
    // échouer la sauvegarde ENTIÈRE sans rien afficher (bug de la cargaison, v0.796).
    const ent = (n: number | undefined) => Math.max(0, Math.round(n || 0));
    // Marqué AVANT l'écriture : tout écrivain de la boîte qui tourne pendant la requête le
    // garde `claimed: true` (`depositMessages`). Retiré si l'écriture échoue.
    claimedLocally.add(m.id);
    try {
      await persist(userId, {
        // 🔩 LEGACY : un rapport déposé avant le retrait de la ferraille la rend en or.
        // ⚠️ Plus de salaires : un `wages` resté dans un rapport d'avant n'est plus déduit.
        gold: cur.gold + ent(m.gold) + (party ? 0 : ent(m.scrap)) * SCRAP_TO_GOLD,
        login_energy: cur.login_energy + ent(m.energy), // ⚡ mine/source → énergie de jeu
        keys: cur.keys + ent(m.key),
        // ⚠️ DEVISES VIVANTES UNIQUEMENT. Le commentaire qui tenait ici affirmait qu'on ne
        // créditait plus de monnaie morte — et les deux lignes suivantes créditaient des
        // fragments 🧩 et de l'encre 🖋️. Un commentaire ne vérifie rien ; un test si.
        summon_stones: cur.summon_stones + ent(m.summonStones),
        // 💠 mines de mana résiduel → monnaie du gacha. ⚠️ Sans cette ligne, récolter une
        // mine ne rapportait RIEN : l'issue portait le mana, le message le portait, les
        // pastilles l'affichaient… et personne ne le créditait.
        mana: cur.mana + ent(m.mana),
        // 🎟️ coffres gagnés par le sport (360, boss entre amis) → tickets d'invocation.
        gacha_tickets: cur.gacha_tickets + ent(m.tickets),
        // 🎒 consommables trouvés en route (`rollSupplyDrop`).
        ...(m.supplies && Object.keys(m.supplies).length
          ? { supplies: addSupplies(cur.supplies, m.supplies) }
          : {}),
        // 🔱⚜️ sceaux des ruines anciennes (`ruinsSeals`).
        ...(m.seals && m.seals.n > 0
          ? { seals: addSeals(cur.seals, m.seals.kind, m.seals.rank, m.seals.n) }
          : {}),
        ...(runeCount(m.runes) ? { runes: addRuneCount(cur.runes, runeCount(m.runes)) } : {}),
        ...partyPatch,
        inventory,
        // Ce message (et tout autre encaissement en cours) passe à `claimed: true`.
        messages: boxWith(cur, [], MESSAGES_CAP),
        set_pieces_seen: drops.length
          ? mergeSetSeen(cur.set_pieces_seen, drops)
          : cur.set_pieces_seen,
      });
    } catch (e) {
      claimedLocally.delete(m.id);
      throw e;
    }
    // 🎟️ Après l'écriture : une animation ne doit jamais annoncer un gain qui n'a pas eu lieu.
    useGameFx().celebrateTickets(ent(m.tickets), m.title ?? 'Coffre encaissé');
    return { ...m, advProgress, advTracks };
  }
  /** 🎁 ENCAISSEMENT AUTOMATIQUE au retour : chaque rapport d'expédition (héros ou groupe)
   *  dont le voyage est fini est encaissé, l'un après l'autre, par `expeClaim` — la SEULE
   *  voie de crédit (idempotence, `claimedLocally`, entiers). Les coffres restent à ouvrir
   *  à la main (`isAutoClaimable`). Rend ce qui a été encaissé, pour que l'écran l'annonce. */
  async function expeAutoClaim(userId: string, now: number) {
    const due = (row.value?.messages ?? []).filter((m) => isAutoClaimable(m, now));
    const done: NonNullable<Awaited<ReturnType<typeof expeClaim>>>[] = [];
    for (const m of due) {
      const r = await expeClaim(userId, m.id, now);
      if (r) done.push(r);
    }
    return done;
  }
  async function expeMarkRead(userId: string) {
    const cur = row.value;
    if (!cur || !cur.messages.some((m) => !m.read)) return;
    await persist(userId, {
      messages: boxWith(cur, [], MESSAGES_CAP).map((m) => ({ ...m, read: true })),
    });
  }

  // ── Filons de production passive (village autour de la ville) ──
  // Construit un filon sur un emplacement libre, payé à l'or. ⚠️ ON CONSTRUIT LÀ OÙ ON
  // TOUCHE, PAS DANS L'ORDRE (v0.867) : `canBuildOnSlot` juge cet emplacement précis sur
  // le QUOTA (combien de bâtiments sont déjà posés, où qu'ils soient), jamais sur sa
  // position — même règle que `VillagePlots.vue`/`BasePage.vue`, pour qu'aucune copie
  // ne diverge.
  async function buildFilon(
    userId: string,
    // ⚠️ TYPÉ depuis la v0.947 : il acceptait n'importe quelle chaîne, et le seul garde
    // était `buildingType()` rendant `undefined`. Un id mal orthographié partait donc
    // jusqu'ici sans que rien ne le dise.
    typeId: BuildingTypeId,
    slot: number,
    now: number,
    playerLevel: number,
  ) {
    const cur = row.value;
    const t = buildingType(typeId);
    if (!cur || !t) return;
    if (!canBuildOnSlot(slot, cur.buildings, playerLevel, typeId)) return; // quota atteint / occupé / hors bornes
    if (!canBuildType(typeId, playerLevel, cur.buildings)) return; // niveau/unicité
    if (cur.gold < t.buildGold) return;
    const b: Building = { typeId, level: 1, slot, collectedAt: now };
    // 🛕 Le Panthéon verse ses tickets de bienvenue dans la MÊME écriture que sa pose : il est
    // unique, donc jamais deux fois.
    const tickets = buildTickets(typeId);
    await persistOptimistic(userId, {
      gold: cur.gold - t.buildGold,
      buildings: [...cur.buildings, b],
      // ⚠️ La MARQUE part avec les tickets, dans la même écriture : c'est elle qui empêche
      // le rattrapage (`settleWelcomeTickets`) de les redonner au chargement suivant.
      ...(tickets
        ? { gacha_tickets: cur.gacha_tickets + tickets, gacha: { ...cur.gacha, welcomed: true } }
        : {}),
    });
  }
  // Améliore un filon (or ; plafonné au niveau du joueur).
  async function upgradeFilon(userId: string, slot: number, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const b = cur.buildings.find((x) => x.slot === slot);
    if (!b || !canUpgradeBuilding(b, playerLevel)) return;
    const cost = buildingUpgradeCost(b.level);
    if (cur.gold < cost) return;
    await persistOptimistic(userId, {
      gold: cur.gold - cost,
      buildings: cur.buildings.map((x) => (x.slot === slot ? { ...x, level: x.level + 1 } : x)),
    });
  }
  // Récolte TOUS les filons : crédite poussière/pierres accumulées, réinitialise l'horloge.
  // ── DÉFENSE DE LA BASE (sièges) ──
  // Le domaine (src/lib/raid.ts) est pur : il planifie, détecte et tranche. Le store ne
  // fait que lui fournir ce qu'il ne peut pas connaître — le héros, l'activité sportive,
  // l'XP — et persister ce qu'il rend.

  function baseOf(cur: CharacterRow, now: number): BaseState {
    return cur.base ?? emptyBase(newSeed(now), now);
  }

  /** 🗡️ CE QUE L’ESCORTE EMMÈNE — SOURCE UNIQUE : le stock d'équipement des champions.
   *  ⚠️ Plus de familiers ni de talents (v0.996) : ils sont réservés au HÉROS. */
  function escortKitOf(cur: CharacterRow | null): EscortKit {
    return { advGear: cur?.adv_gear?.stock ?? [] };
  }

  /** La même réserve, pour l’ÉCRAN (pronostic d’un camp, panneau de forces) : un `computed`
   *  la partage entre tous ses lecteurs au lieu que chacun la reconstruise. */
  const escortKit = computed(() => escortKitOf(row.value));

  /** Le héros défend-il ? Il n'est là que s'il n'est pas parti en expédition. C'est le
   *  seul coût de sa présence : rester, c'est renoncer au revenu d'une expédition. */
  // ⚠️ PARTI dans une attaque combinée, il n'est plus là non plus (un groupe qui ATTEND son
  // départ, si : il défend). Le panneau de défense le comptait présent — la résolution du
  // siège, elle, lisait déjà les attaques (`outingsOf`).
  function heroIsHome(cur: CharacterRow): boolean {
    return !cur.expedition && !heroOutInAttack(attackList.value) && !heroOnMap(cur.expedition_map);
  }
  /** 🏠 QUAND LE HÉROS SERA DE RETOUR À LA BASE, s'il est dehors ; `null` s'il n'y revient pas
   *  de lui-même (posté, en route vers un poste, en mer, ou en sortie depuis son poste — il y
   *  retourne, pas en ville). Lu par le pronostic de siège des DEUX écrans (`heroDefends`) :
   *  la carte n'y passait que l'expédition, la Base l'expédition ou la marche. */
  function heroBackAtBase(cur: CharacterRow): number | null {
    const map = cur.expedition_map;
    if (heroPosted(map) || heroComing(map) || map?.crossing) return null;
    if (cur.expedition) return cur.expedition.homeId ? null : cur.expedition.returnAt;
    return map?.heroReturnAt ?? null;
  }
  /** 🏰 Le héros posté à la forteresse, ou rappelé et pas encore rentré (`heroReturnAt` est
   *  retiré par `settleHome` à son arrivée). */
  function heroOnMap(map: ExpeditionMap | null | undefined): boolean {
    return heroPosted(map) || heroComing(map) || map?.heroReturnAt !== undefined || !!map?.crossing;
  }

  /** 🏰 L'HORLOGE DES RETOURS tant qu'un siège échu n'est pas tranché.
   *  ⚠️ Un voyage rentré est EFFACÉ de l'état (expédition remise à null, groupe retiré).
   *  S'il rentre APRÈS l'attaque mais que ce retour est réglé AVANT que le siège ne soit
   *  tranché, plus rien ne dit qu'il était dehors : il serait compté comme défenseur. On
   *  règle donc les retours à l'heure de l'attaque jusqu'au tick de base suivant — un
   *  délai d'une seconde, puisque les deux écrans qui règlent les retours tranchent aussi
   *  le siège. Si le tick de base a déjà tourné depuis l'attaque sans rien trancher (sièges
   *  éteints entre-temps), on ne retient plus rien : le héros ne doit jamais rester bloqué. */
  let lastBaseTickAt = 0;
  function settleClock(cur: CharacterRow, now: number): number {
    const r = cur.base?.raid;
    if (!r || now < r.arrivesAt || lastBaseTickAt >= r.arrivesAt) return now;
    return r.arrivesAt;
  }
  /** Un seul tick de base à la fois : la carte et l'Aventure (cockpit) tournent ensemble, et
   *  deux ticks concurrents trancheraient le MÊME siège deux fois. */
  let baseTickRunning = false;

  /** Tick de la base. Avance l'état, et RÉSOUT le siège s'il est à échéance — avec les
   *  défenses telles qu'elles sont À CET INSTANT : ce que tu as construit avant la
   *  deadline est ce qui se bat. Renvoie le rapport si une bataille vient d'avoir lieu. */
  async function baseTick(
    userId: string,
    now: number,
    ctx: { playerLevel: number; activeDays7: number; globalXp: number; hero: Combatant | null },
  ): Promise<{
    detected: Raid | null;
    report: RaidReport | null;
    /** ⭐ Ce que le siège a changé pour les DÉFENSEURS — étoiles, rang, « prêt pour
     *  l'ascension ». Rendu à l'écran, qui l'annonce APRÈS le rejeu (sinon il spoilerait). */
    advProgress: AdvProgress[];
    advTracks: AdvXpTrack[];
  }> {
    if (!row.value || baseTickRunning)
      return { detected: null, report: null, advProgress: [], advTracks: [] };
    baseTickRunning = true;
    try {
      return await baseTickInner(userId, now, ctx);
    } finally {
      baseTickRunning = false;
      lastBaseTickAt = Math.max(lastBaseTickAt, now);
    }
  }
  async function baseTickInner(
    userId: string,
    now: number,
    ctx: { playerLevel: number; activeDays7: number; globalXp: number; hero: Combatant | null },
  ): Promise<{
    detected: Raid | null;
    report: RaidReport | null;
    advProgress: AdvProgress[];
    advTracks: AdvXpTrack[];
  }> {
    const cur = row.value;
    if (!cur) return { detected: null, report: null, advProgress: [], advTracks: [] };
    knownActiveDays7 = ctx.activeDays7;
    const t = advanceBase(
      baseOf(cur, now),
      {
        ...ctx,
        towerBoost: controlDetectBoost(cur.expedition_map, now),
        // 👁️ Un siège dont la route passe par le cercle d'un de tes forts est repéré dès
        // son entrée, si c'est plus tôt que le préavis de la Tour.
        fortSightMs: fortSightOf(cur),
        // 🕊️ Île pacifiée : plus aucun siège. Sinon le point de départ de l'île (la base, ou
        // le village du port) se fait assiéger par les armées de ses points ennemis.
        pacified: islandPacified(cur.expedition_map),
        faction: activeIsland(cur.expedition_map)?.faction ?? null,
        // 🏝️ Sur une île, l'armée reste dans la tranche de l'île, jamais au-dessus du joueur.
        levelBand: islandRaidBand(
          cur.expedition_map?.archipel ? archipelFloor(cur.expedition_map) : null,
          cur.expedition_map?.archipel?.levelCap ?? null,
          ctx.playerLevel,
        ),
      },
      now,
    );
    // ⚔️🗼 LES CHOCS EN RASE CAMPAGNE PASSENT AVANT LE SIÈGE : une équipe qui a croisé l'armée
    // l'a amputée (ou battue) à l'heure du choc. Lus sur les VOYAGES (l'issue y est tirée), pas
    // sur les rapports déposés : l'ordre des ticks ne doit pas décider s'ils comptent.
    // Idempotents (`fieldHits`) : rejoués à chaque tick, appliqués une fois.
    const r0 = t.base.raid;
    if (r0) {
      for (const { hit, at } of pendingFieldHits(
        fieldVoyages(cur),
        'siege',
        r0.id,
        cur.messages ?? [],
      )) {
        if (at > now) continue;
        const a = applyFieldHitToBase(t.base, hit, at, at + raidIntervalMs(ctx.activeDays7));
        if (a.effect) {
          t.base = a.base;
          t.changed = true;
        }
      }
      if (t.base.raid !== r0)
        t.dueRaid = t.base.raid && now >= t.base.raid.arrivesAt ? t.base.raid : null;
    }
    // 🛡️ La Caserne produit : l'horloge avance par pas entiers, donc l'état ne change qu'une
    // fois par milicien (on n'écrit pas chaque seconde).
    const barracks = buildingLevel(cur.buildings, 'barracks');
    if (barracks > 0) {
      const m0 = t.base.militia ?? emptyMilitia(now);
      const m1 = produceMilitia(
        m0,
        barracks,
        militiaOnMap(cur.expedition_map),
        now,
        islandMilitiaOf(cur.expedition_map),
        // 🛡️ Les morts à remplacer se refont même au-dessus du plafond de l'île.
        militiaOwedOn(cur.expedition_map),
      );
      if (m1 !== t.base.militia) {
        t.base = { ...t.base, militia: m1 };
        t.changed = true;
      }
    }
    if (!t.dueRaid) {
      if (t.changed && tickMayWrite(cur)) await persist(userId, { base: t.base });
      return { detected: t.detected, report: null, advProgress: [], advTracks: [] };
    }

    // 🏰 QUI ÉTAIT LÀ À L'HEURE DE L'ATTAQUE — pas au moment du tick, qui peut venir des
    // heures plus tard, après qu'on a renvoyé tout le monde (défaut constaté le 2026-09-27 :
    // siège perdu « sans personne » alors que héros et champions étaient rentrés avant).
    const at = t.dueRaid.arrivesAt;
    const outings = outingsOf({
      expedition: cur.expedition,
      parties: partyList.value,
      attacks: attackList.value,
    });
    // 🧝 Posté sur un lieu fixe, en marche sur la carte ou en mer, il n'est pas au rempart.
    const home = heroHomeAt(outings, at) && !heroAwayOnMapAt(cur.expedition_map, at);
    // Chaque champion se bat avec SES pièces (plus de compagnon ni de talent, v0.996).
    const cctx = escortKitOf(cur);
    // Les aventuriers DISPONIBLES défendent (ni en convoi, ni à l’infirmerie, ni en
    // formation). Sans eux, il ne reste que le mur et les tourelles.
    // ⚠️ LES DÉFENSEURS SONT NOMMÉS UNE FOIS : le combat et l’XP doivent parler des MÊMES
    // aventuriers. Les reconstruire deux fois, c’est laisser les deux listes diverger.
    // ⚠️ LA COUPE EST FAITE ICI, pas seulement dans `guardUnits` : l'XP de siège est
    // versée à `defenders` juste en dessous, et sans elle tout le vivier disponible
    // apprendrait d'une bataille que seuls quelques-uns ont livrée.
    const defenders = rampartGuard(
      advsHomeAt(advList.value, outings, at),
      engageCap(pantheonLevel.value),
      cctx,
    );
    const report = resolveRaid(
      {
        defenses: t.base.defenses,
        playerLevel: ctx.playerLevel,
        hero: home ? ctx.hero : null,
        // 🛡️ Les miliciens PRÉSENTS à la base défendent aussi (ceux postés sur la carte non).
        guard: guardUnits(
          ctx.playerLevel,
          defenders,
          engageCap(pantheonLevel.value),
          cctx,
          t.base.militia?.home ?? 0,
        ),
      },
      t.dueRaid,
      home,
    );
    // 🏝️ Le rejeu dessine le village du port sur les îles 2 à 5 (`SiegeStage`).
    const island = cur.expedition_map?.archipel?.island;
    if (island !== undefined) report.island = island;
    const {
      base: nb,
      damage,
      corpses,
      woundUntil,
    } = applyRaidOutcome(t.base, t.dueRaid, report, ctx, now);
    const patch: Record<string, unknown> = { base: nb };

    // 🦴 LE BUTIN DES CORPS EST CRÉDITÉ TOUT DE SUITE (demandé), et il part avec le
    // rapport de bataille. Il n’y a plus de fouille à venir chercher : le champ qu’on
    // laisse quelques heures n’est que le décor de ce qui vient de se passer.
    // ⚠️ `lootCorpses` reste la seule autorité sur la valeur d’un corps — c’est la même
    // fonction qu’avant, appelée une fois au lieu d’une fois par vague.
    const loot = corpses.length
      ? lootCorpses(
          corpses,
          report.faction,
          ctx.playerLevel,
          (report.resolvedAt ^ cur.base!.seed) >>> 0 || 1,
          cur.equipped?.relic?.power,
        )
      : null;
    const drops = (loot?.items ?? []).map((it) => ({ ...it, id: crypto.randomUUID() }));
    // 💠 LE MANA DES MONSTRES ABATTUS, versé MÊME EN CAS DE DÉFAITE (demandé) : il suit ce
    // qui est tombé, pas l'issue. Calculé à part des corps, qui ne comptent que les
    // groupes tombés en entier — un groupe à moitié abattu paie sa moitié.
    const mana = siegeMana(t.dueRaid, report);
    if (mana > 0) patch.mana = cur.mana + mana;
    if (loot) {
      patch.gold = cur.gold + loot.gold;
      patch.summon_stones = cur.summon_stones + loot.summonStones;
      patch.keys = cur.keys + loot.keys;
    }
    // Le relevé part avec le rapport : on le pose sur la base que `applyRaidOutcome`
    // vient de rendre, pas dans un second `persist`.
    // ⚠️ TOUJOURS réécrit, `null` compris : `applyRaidOutcome` recopie la base, donc un
    // siège sans butin gardait le relevé du PRÉCÉDENT et l'affichait comme le sien.
    // 💀 Les miliciens tombés MEURENT (pas d'infirmerie pour la milice) : ils sortent de
    // l'effectif, et la Caserne les remplacera à son rythme.
    const milLost = report.militiaLost ?? 0;
    patch.base = {
      ...nb,
      ...(milLost > 0 && nb.militia
        ? { militia: { ...nb.militia, home: Math.max(0, nb.militia.home - milLost) } }
        : {}),
      lastLoot:
        loot || mana > 0
          ? {
              corpses: corpses.length,
              gold: loot?.gold ?? 0,
              mana,
              keys: loot?.keys ?? 0,
              summonStones: loot?.summonStones ?? 0,
              items: drops.length,
            }
          : null,
    };
    // ⚠️ CEUX QUI ONT DÉFENDU APPRENNENT (demandé par l’utilisateur). Les familiers postés
    // gagnaient de l’XP depuis la v0.663 ; les aventuriers, qui tiennent pourtant la
    // brèche, n’en gagnaient aucune — rester défendre coûtait un convoi ET la progression
    // qui va avec. Le barème vit dans `siegeXp` (lib, testé), jamais ici.
    // 🤕 Siège PERDU : ceux qui sont tombés partent à l’infirmerie, comme le héros, pour
    // la MÊME durée (l’Infirmerie l’abrège). La règle vit dans `siegeHurtIds` (lib).
    // ⚠️ LA MÊME ÉCHÉANCE QUE LE HÉROS, rendue par `applyRaidOutcome` — plus recalculée ici.
    // Recopiée, elle perdait le plancher de la lib : après une longue absence le héros
    // revenait indemne pendant qu’on écrivait aux défenseurs une convalescence DÉJÀ dépassée.
    // `null` = elle est écoulée, personne ne part à l’infirmerie.
    const hurt = woundUntil ? new Set(siegeHurtIds(report, defenders)) : new Set<string>();
    // 🕯️ Les CHAMPIONS de l'île guérissent plus vite si l'hospice est tenu (le héros, non) :
    // la même échéance que le héros, sa durée multipliée par `hospiceHealMult`, comptée depuis
    // la bataille — `null` si elle est déjà écoulée.
    const champWoundUntil = woundUntil
      ? sinceEvent(
          report.resolvedAt,
          (woundUntil - report.resolvedAt) * hospiceHealMult(cur.expedition_map),
          now,
        )
      : null;
    let siegeGear: ReturnType<typeof gearTrainedPatch> = {};
    if (defenders.length) {
      const ids = new Set(defenders.map((a) => a.id));
      const gains: Record<string, number> = {};
      const siegeGains = siegeXpFor(defenders, report);
      patch.adventurers = advList.value.map((a) => {
        if (!ids.has(a.id)) return a;
        const gain = siegeGains[a.id] ?? 0;
        gains[a.id] = gain;
        const next = grantAdvXp(
          a,
          gain,
          pantheonLevel.value,
          Math.max(ctx.playerLevel, heroLevel.value),
        );
        return hurt.has(a.id) && champWoundUntil
          ? { ...next, hurtUntil: Math.max(next.hurtUntil ?? 0, champWoundUntil) }
          : next;
      });
      siegeGear = gearTrainedPatch(cur, advList.value, patch.adventurers as Adventurer[]);
      Object.assign(patch, siegeGear);
    }
    // ⭐ La MÊME lecture que les camps, les failles et les convois (`advProgressOf`) : un
    // champion qui bute sur son ★5 en défendant doit l'apprendre comme ailleurs.
    const advProgress = defenders.length
      ? advProgressOf(advList.value, patch.adventurers as Adventurer[])
      : [];
    // 📊 Les barres AVANT → APRÈS des défenseurs, jouées à la FERMETURE du rejeu (l'écran).
    const advTracks = defenders.length
      ? gearAwareTracks(cur, advList.value, patch.adventurers as Adventurer[], siegeGear)
      : [];
    if (drops.length) {
      patch.inventory = [...cur.inventory, ...drops];
      patch.set_pieces_seen = mergeSetSeen(cur.set_pieces_seen, drops);
    }
    // Stock VOLÉ = la production accumulée non récoltée. On remet simplement les
    // compteurs à l'heure : on ne peut donc perdre que ce qu'on n'avait pas ramassé,
    // et récolter souvent suffit à ne rien risquer — sans jamais y être obligé.
    if (damage.stockStolen && cur.buildings.length)
      patch.buildings = cur.buildings.map((b) => ({ ...b, collectedAt: now }));
    await persist(userId, patch);
    return { detected: t.detected, report, advProgress, advTracks };
  }

  /** Soins d'urgence : remet le héros sur pied TOUT DE SUITE, contre de l'OR (cher)
   *  proportionnel au repos qu'il reste. Il y a donc toujours une porte de sortie —
   *  attendre reste gratuit, payer ne fait qu'acheter l'immédiateté. */
  async function healHero(userId: string, now: number, playerLevel: number) {
    const cur = row.value;
    if (!cur?.base?.wound) return;
    // 🏥 Il rentre encore à pied : les soins attendent son arrivée à la base.
    if (!heroAtInfirmary(cur.base, cur.expedition_map, now))
      throw new Error('Ton héros rentre à la base : il se soigne une fois arrivé.');
    const cost = healCost(woundRemainingMs(cur.base, now), playerLevel);
    if (cur.gold < cost) throw new Error(`Il te faut ${cost} 🪙 pour des soins d'urgence.`);
    await persistOptimistic(userId, {
      gold: cur.gold - cost,
      base: { ...cur.base, wound: null },
    });
    return cost;
  }

  /** ⛑️ Soins d’urgence d’un AVENTURIER (blessé en convoi ou en défense), au tarif du héros.
   *  ⚠️ Le refus vit ici : l’écran ne propose pas l’impossible, il ne le garantit pas.
   *  `advIds` : un ou plusieurs (« Tout soigner »), payés d’une seule écriture. */
  async function healAdventurers(
    userId: string,
    advIds: readonly string[],
    now: number,
    playerLevel: number,
  ) {
    const cur = row.value;
    if (!cur) return 0;
    const want = new Set(advIds);
    const cost = advList.value
      .filter((a) => want.has(a.id))
      .reduce((s, a) => s + advHealCost(a, now, playerLevel), 0);
    if (cost <= 0) return 0;
    if (cur.gold < cost) throw new Error(`Il te faut ${cost} 🪙 pour ces soins d'urgence.`);
    await persistOptimistic(userId, {
      gold: cur.gold - cost,
      adventurers: advList.value.map((a) =>
        want.has(a.id) && advHurtMs(a, now) > 0 ? { ...a, hurtUntil: now } : a,
      ),
    });
    return cost;
  }

  /** ✨ CONFIER AU MIEUX les pièces d'équipement du vivier (`autoAdvGear`).
   *  ⚠️ Les règles sont celles de la lib, qui reprend les exclusions de `setAdvGear` :
   *  rareté de classe, lignée, un seul porteur.
   *  Il REMPLACE les choix faits à la main — l'écran le dit avant le geste.
   *  Rend le nombre de pièces confiées, ou `null` sans ligne. */
  async function autoAssignGear(userId: string): Promise<{ gear: number } | null> {
    const cur = row.value;
    if (!cur) return null;
    const advs = cur.adventurers ?? [];
    const gearPlan = autoAdvGear(advs, escortKitOf(cur));
    const adventurers = advs.map((a) => ({ ...a, gear: gearPlan.get(a.id) }));
    await persistOptimistic(userId, { adventurers });
    return { gear: adventurers.reduce((s, a) => s + Object.keys(a.gear ?? {}).length, 0) };
  }

  /** 🗡️ TOUT RETIRER : le vivier rendu sans une seule pièce (`stripAdvGear`). Rien n'est
   *  vendu ni perdu — les pièces retournent simplement au stock disponible. Rend le nombre
   *  de pièces retirées, 0 s'il n'y avait rien à faire (aucune écriture alors). */
  async function stripAllAdvGear(userId: string): Promise<number> {
    const cur = row.value;
    if (!cur) return 0;
    const { advs, removed } = stripAdvGear(cur.adventurers ?? []);
    if (!removed) return 0;
    await persistOptimistic(userId, { adventurers: advs });
    return removed;
  }

  /** ⬆️ ASCENSION d'un champion : il paie l'or et les sceaux du rang visé, le rang s'ouvre, et
   *  l'XP mise de côté à ★5 est reversée (`ascendAdventurer`). ⚠️ Le refus vit ICI, avec la
   *  MÊME règle que le bouton (`ascensionBlocker`) : l'écran ne propose pas l'impossible, il
   *  ne le garantit pas. Rend `null` si c'est fait, sinon la raison du refus. */
  /** 🎓 L'XP DES CHAMPIONS À L'ARRIVÉE D'UN RAPPORT (`grantReportXp`, lib) : la boîte
   *  marquée, le patch du vivier (pièces portées comprises) et l'animation à jouer APRÈS
   *  l'écriture — une animation n'annonce jamais un gain qui n'a pas eu lieu. */
  function reportXp(
    cur: CharacterRow,
    box: ExpeditionMessage[],
    fresh: ExpeditionMessage[],
    /** Le vivier sur lequel verser l'XP. ⚠️ REQUIS : la boucle des reprises lui passe le
     *  vivier qui contient DÉJÀ la récolte du camp d'entraînement ; relu dans l'état, ce
     *  vivier-là était ignoré et l'XP du camp se perdait dès que la garnison défendait. */
    base: Adventurer[],
  ) {
    const g = grantReportXp(box, fresh, base, pantheonLevel.value, heroLevel.value);
    if (!g.granted.length) return { messages: box, patch: {}, play: () => {} };
    const gearPatch = gearTrainedPatch(cur, advList.value, g.adventurers);
    const tracks = gearAwareTracks(cur, advList.value, g.adventurers, gearPatch);
    const title =
      g.granted.length === 1 ? `Rapport : ${messageTitle(g.granted[0]!)}` : 'Rapports de mission';
    return {
      messages: g.messages,
      patch: { adventurers: g.adventurers, ...gearPatch },
      play: () => useAdvXpFx().show(tracks, title),
    };
  }

  /** 🗡️ Les pièces portées apprennent avec leur champion (`trainWornGear`, lib) : le patch
   *  `adv_gear` à joindre à TOUTE écriture qui change le vivier par de l'XP. Vide si rien
   *  n'a bougé — on n'écrit pas `adv_gear` à vide. */
  function gearTrainedPatch(cur: CharacterRow, before: Adventurer[], after: Adventurer[]) {
    const stock = cur.adv_gear?.stock ?? [];
    const next = trainWornGear(before, after, stock);
    return next === stock ? {} : { adv_gear: { ...(cur.adv_gear ?? {}), stock: next } };
  }

  /** 📊 Les barres du retour de mission, pièces portées comprises (`withGearTracks`) : le
   *  stock APRÈS est celui du patch, sans quoi on animerait un stock qui n'a pas bougé. */
  function gearAwareTracks(
    cur: CharacterRow,
    before: Adventurer[],
    after: Adventurer[],
    gearPatch: ReturnType<typeof gearTrainedPatch>,
  ): AdvXpTrack[] {
    const stock = cur.adv_gear?.stock ?? [];
    const next = gearPatch.adv_gear?.stock ?? stock;
    return withGearTracks(advXpTracks(before, after), stock, next, after);
  }

  /** ⬆️ ASCENSION D'UNE PIÈCE : rang suivant contre de l'or et des sceaux d'objet de ce rang.
   *  Même règle que le bouton (`advGearAscensionBlocker`). `null` si c'est fait. */
  async function ascendGear(
    userId: string,
    gearId: string,
    /** Ce que l'éclat dit sous la pièce (la Guilde y met le gain de puissance). */
    note?: string,
  ): Promise<string | null> {
    const cur = row.value;
    if (!cur) return 'Personnage introuvable.';
    const advs = cur.adventurers ?? [];
    const stock = cur.adv_gear?.stock ?? [];
    const g = stock.find((x) => x.id === gearId);
    if (!g) return 'Pièce introuvable.';
    const block = advGearAscensionBlocker(g, {
      rankCap: advGearRankCap(g, advs, stock),
      seals: cur.seals,
      gold: cur.gold,
    });
    if (block) return GEAR_ASCENSION_BLOCK_LABEL[block];
    const next = advGearNextRank(g)!;
    const cost = advGearAscensionCost(next);
    const wearer = [...wornGear(advs, stock)].find(([, l]) => l.some((x) => x.id === gearId));
    const wl = wearer ? (advs.find((a) => a.id === wearer[0])?.level ?? 1) : 1;
    const up = ascendAdvGear(g, wl);
    await persist(userId, {
      gold: cur.gold - cost.gold,
      seals: addSeals(cur.seals, 'gear', next, -cost.seals),
      adv_gear: { ...(cur.adv_gear ?? {}), stock: stock.map((x) => (x.id === gearId ? up : x)) },
    });
    // Annoncée APRÈS l'écriture, ICI et non dans un écran : l'ascension se lance depuis la
    // Guilde ET depuis le rapport de mission, et le rapport n'en jouait aucune.
    useGameFx().celebrate({
      kind: 'rankup',
      emoji: g.emoji,
      title: g.name,
      ranks: { from: next - 1, to: next },
      gear: { model: advGearModelOf(g) },
      subtitle: note ?? 'Ses stats montent d’un rang.',
    });
    return null;
  }

  /** ✨ ÉVEILLER une pièce en fondant un doublon du même modèle. ⚠️ Le plan est recalculé
   *  ICI (`advGearAwakenPlan`) : l'écran ne propose pas l'impossible, il ne le garantit pas —
   *  jamais une pièce portée ni 🔒 fondue. `null` si c'est fait. */
  async function awakenGear(userId: string, gearId: string): Promise<string | null> {
    const cur = row.value;
    if (!cur) return 'Personnage introuvable.';
    const stock = cur.adv_gear?.stock ?? [];
    const g = stock.find((x) => x.id === gearId);
    if (!g) return 'Pièce introuvable.';
    const plan = advGearAwakenPlan(g, stock, cur.adventurers ?? []);
    if (!plan || plan.keep.id !== gearId) return 'Aucun doublon libre à fusionner.';
    await persist(userId, {
      adv_gear: { ...(cur.adv_gear ?? {}), stock: awakenAdvGear(stock, plan) },
    });
    return null;
  }

  /** ✨ TOUT FUSIONNER : l'éveil sur chaque modèle jusqu'à épuisement (`awakenAllAdvGear`).
   *  ⚠️ Le plan est recalculé ICI, avec les mêmes exclusions que le bouton d'une ligne —
   *  jamais une pièce portée ni 🔒. Rend ce qui a fondu ET ce qui reste bloqué, pour que
   *  l'écran puisse dire pourquoi il n'a rien fait. Aucune écriture si rien ne fond. */
  async function awakenAllGear(
    userId: string,
  ): Promise<{ merged: number; worn: number; locked: number }> {
    const cur = row.value;
    if (!cur) return { merged: 0, worn: 0, locked: 0 };
    // ✨ Équiper d'abord, fondre ensuite (`equipThenMerge`) — vivier et stock dans la MÊME
    // écriture : séparés, une coupure laisserait des pièces fondues encore assignées.
    const out = equipThenMerge(cur.adventurers ?? [], escortKitOf(cur));
    if (out.merged)
      await persist(userId, {
        adventurers: out.advs,
        adv_gear: { ...(cur.adv_gear ?? {}), stock: out.stock },
      });
    return { merged: out.merged, worn: out.worn, locked: out.locked };
  }

  async function ascendChampion(userId: string, advId: string): Promise<string | null> {
    const cur = row.value;
    if (!cur) return 'Personnage introuvable.';
    const advs = cur.adventurers ?? [];
    const adv = advs.find((a) => a.id === advId);
    if (!adv) return 'Champion introuvable.';
    const block = ascensionBlocker(adv, {
      pantheonLevel: pantheonLevel.value,
      seals: cur.seals,
      gold: cur.gold,
    });
    if (block) return ASCENSION_BLOCK_LABEL[block];
    const next = advNextAscension(adv)!;
    const cost = ascensionCost(next);
    const up = ascendAdventurer(adv, pantheonLevel.value, heroLevel.value);
    // 💠 La récompense part dans la MÊME écriture que le coût : jamais l'un sans l'autre.
    const mana = ascensionMana(next);
    // 🪬 Des runes GARANTIES, plus nombreuses à mesure que le rang atteint est haut.
    await persist(userId, {
      runes: addRuneCount(cur.runes, ascensionRuneCount(next)),
      gold: cur.gold - cost.gold,
      mana: cur.mana + mana,
      seals: addSeals(cur.seals, 'champion', next, -cost.seals),
      adventurers: advs.map((a) => (a.id === advId ? up : a)),
    });
    // Annoncée APRÈS l'écriture : une animation n'annonce jamais un gain qui n'a pas eu lieu.
    useGameFx().celebrate({
      kind: 'rankup',
      // Repli si le champion n'a pas d'illustration : le visage de sa classe.
      emoji: advTitle(adv)?.emoji ?? CHARACTER_RANKS[next]!.emoji,
      ranks: { from: next - 1, to: next },
      championId: adv.championId ?? null,
      title: adv.name,
      count: mana,
    });
    return null;
  }

  /** 🗡️ CONFIER (ou retirer) une PIÈCE D'ÉQUIPEMENT à un aventurier, sur UN emplacement.
   *  Un seul porteur, et l'écran ne
   *  propose pas l'impossible mais ne le garantit pas — le refus vit ICI. */
  async function setAdvGear(
    userId: string,
    advId: string,
    slot: AdvGearSlot,
    gearId: string | null,
  ) {
    const cur = row.value;
    if (!cur) return;
    const adv = (cur.adventurers ?? []).find((a) => a.id === advId);
    if (!adv) return;
    if (gearId) {
      const g = (cur.adv_gear?.stock ?? []).find((x) => x.id === gearId);
      if (!g) throw new Error('Cette pièce est introuvable.');
      if (g.slot !== slot) throw new Error('Mauvais emplacement.');
      // ⚠️ Refus AU STORE : l'écran ne propose pas l'impossible, il ne le garantit pas.
      if (!canWearAdvGear(adv, g))
        throw new Error(
          g.lineage !== lineageOf(adv)
            ? `Cette pièce est faite pour un autre métier.`
            : `Trop rare pour ${adv.name} : sa classe est de rang ${rarityRank(advRarity(adv)).name} — promeus-le d’abord.`,
        );
    }
    const adventurers = (cur.adventurers ?? []).map((a) => {
      const gear = { ...(a.gear ?? {}) };
      if (a.id === advId) gear[slot] = gearId ?? undefined;
      // Une pièce ne sert qu'un porteur : la retirer d'un AUTRE aventurier qui la
      // portait déjà, plutôt que de laisser deux hommes croire qu'ils l'ont.
      else if (gearId && gear[slot] === gearId) gear[slot] = undefined;
      return { ...a, gear };
    });
    await persistOptimistic(userId, { adventurers });
  }

  /** 🔒 Verrouille/déverrouille une pièce du stock — protégée de la vente, comme un objet
   *  du héros. */
  async function toggleAdvGearLock(userId: string, id: string) {
    const cur = row.value;
    if (!cur) return;
    const stock = (cur.adv_gear?.stock ?? []).map((g) =>
      g.id === id ? { ...g, locked: !g.locked } : g,
    );
    await persistOptimistic(userId, { adv_gear: { stock } });
  }
  /** Ajoute des pièces au STOCK — PUR, ne persiste rien. ⚠️ Seul le TIRAGE en ajoute
   *  (v0.1012) : il l'appelle pour les persister dans le MÊME `persist` que la mana et le
   *  pity, plutôt que d'écrire deux fois. */
  function withAdvGear(cur: CharacterRow, pieces: Omit<AdvGear, 'id'>[]): AdvGearState {
    const stock = [
      ...(cur.adv_gear?.stock ?? []),
      ...pieces.map((p) => ({ ...p, id: crypto.randomUUID() })),
    ];
    return { stock };
  }

  async function buildDefense(userId: string, typeId: DefenseId, playerLevel: number, now: number) {
    const cur = row.value;
    if (!cur) return;
    const t = defenseType(typeId);
    if (!t) throw new Error('Structure inconnue.');
    const base = baseOf(cur, now);
    if (base.defenses.some((d) => d.typeId === typeId))
      throw new Error('Cette structure existe déjà.');
    if (playerLevel < t.unlockLevel) throw new Error(`Débloqué au niveau ${t.unlockLevel}.`);
    if (cur.gold < t.buildGold) throw new Error('Pas assez d’or.');
    await persistOptimistic(userId, {
      gold: cur.gold - t.buildGold,
      base: { ...base, defenses: [...base.defenses, { typeId, level: 1 }] },
    });
  }

  /** Monte une structure d'un niveau. Plafonnée au NIVEAU DU JOUEUR, comme les bâtiments :
   *  le sport reste le plafond, y compris pour la défense. */
  async function upgradeDefense(
    userId: string,
    typeId: DefenseId,
    playerLevel: number,
    now: number,
  ) {
    const cur = row.value;
    if (!cur?.base) return;
    const d = cur.base.defenses.find((x) => x.typeId === typeId);
    const t = defenseType(typeId);
    if (!d || !t) return;
    if (d.level >= playerLevel) throw new Error('Niveau plafonné par ton niveau de personnage.');
    const gold = defenseUpgradeCost(d.level);
    if (cur.gold < gold) throw new Error('Pas assez d’or.');
    void now;
    await persistOptimistic(userId, {
      gold: cur.gold - gold,
      base: {
        ...cur.base,
        defenses: cur.base.defenses.map((x) =>
          x.typeId === typeId ? { ...x, level: x.level + 1 } : x,
        ),
      },
    });
  }

  /** Remet une structure en service, en OR (v0.998 : la ferraille est retirée). */
  //  ⚠️ Depuis la v0.802 elle PREND DU TEMPS (`repairMsFor`) : l'or est payé au
  //  lancement, la structure reste endommagée jusqu’à la fin des travaux, et c’est leur fin
  //  (`settleRepairs`, au tick) qui relance la production.
  async function repairDefense(userId: string, typeId: DefenseId, now: number) {
    const cur = row.value;
    if (!cur?.base) return;
    const d = cur.base.defenses.find((x) => x.typeId === typeId);
    if (!d?.damaged || d.repairUntil != null) return;
    const cost = repairCost(d.level);
    if (cur.gold < cost) throw new Error('Pas assez d’or.');
    await persistOptimistic(userId, {
      gold: cur.gold - cost,
      base: startRepair(cur.base, typeId, now),
    });
  }

  /** Lance TOUTES les réparations en attente — le geste qu'on veut faire quand la
   *  production est gelée. Les travaux déjà lancés ne sont ni repayés ni repoussés. */
  async function repairAll(userId: string, now: number) {
    const cur = row.value;
    if (!cur?.base) return;
    const cost = totalRepairCost(cur.base);
    if (cost <= 0) return;
    if (cur.gold < cost) throw new Error(`Il te faut ${cost} 🪙 pour tout remettre en état.`);
    let base = cur.base;
    for (const d of cur.base.defenses.filter((x) => x.damaged && x.repairUntil == null))
      base = startRepair(base, d.typeId, now);
    await persistOptimistic(userId, { gold: cur.gold - cost, base });
    return cost;
  }

  /** Termine des travaux TOUT DE SUITE, contre de l'or ∝ au temps restant — au même
   *  tarif que les soins d’urgence du héros. Attendre reste gratuit. */
  async function finishRepair(userId: string, typeId: DefenseId, now: number, playerLevel: number) {
    const cur = row.value;
    if (!cur?.base) return;
    const d = cur.base.defenses.find((x) => x.typeId === typeId);
    if (d?.repairUntil == null || now >= d.repairUntil) return;
    const cost = rushRepairCost(d.repairUntil - now, playerLevel);
    if (cur.gold < cost) throw new Error(`Il te faut ${cost} 🪙 pour finir les travaux.`);
    await persistOptimistic(userId, {
      gold: cur.gold - cost,
      base: finishRepairNow(cur.base, typeId),
    });
    return cost;
  }

  /** ⛏️ LE CHANTIER TRAVAILLE SEUL, appelé à chaque tick de base.
   *
   *  ⚠️ Remplace `sendScavengers` / `previewScavengers` / `collectScavengers` —
   *  trois fonctions et deux clics par vague. Envoyer des fossoyeurs n’était pas une
   *  DÉCISION (on envoie toujours, il n’y a rien à arbitrer) : c’était un péage. Demandé
   *  par l’utilisateur, qui avait aussi relevé que tout se ramassait « en 1 voire 2
   *  vagues max ».
   *
   *  ⚠️ LE BUTIN EST CRÉDITÉ VAGUE PAR VAGUE, et le rapport ne fait que RÉCAPITULER.
   *  L’accumuler pour ne le verser qu’à la fin le perdrait si le champ pourrissait
   *  avant — 24 h suffisent largement, mais « largement » n’est pas « toujours ». */
  async function collectFilons(userId: string, now: number) {
    const cur = row.value;
    if (!cur || !cur.buildings.length) return null;
    const got = collectable(cur.buildings, now);
    const total = got.energy + got.summon + got.keys;
    if (total <= 0) return null;
    // Report du reliquat : chaque filon n'avance son `collectedAt` que du temps des
    // unités ENTIÈRES récoltées → pas de perte de fraction, un filon lent n'est plus
    // affamé par des récoltes fréquentes (cf. nextCollectedAt).
    await persistOptimistic(userId, {
      login_energy: cur.login_energy + got.energy, // ⚡ Dynamo → énergie de jeu
      summon_stones: cur.summon_stones + got.summon, // 🔮 Autel des boss
      keys: cur.keys + got.keys, // 🗝️ Porte du Labyrinthe
      buildings: cur.buildings.map((b) => ({ ...b, collectedAt: nextCollectedAt(b, now) })),
      energy_log: pushEnergyLog(cur.energy_log, {
        date: isoDayLocal(now),
        emoji: '⚡',
        label: 'Dynamo tellurique',
        amount: got.energy,
      }),
    });
    return got;
  }
  // ── CARAVANES & AVENTURIERS (migr. 0061) ────────────────────────────────────
  // Le domaine (`adventurers.ts` / `caravan.ts`) est pur : il décide des classes, des
  // rencontres et de la cargaison. Le store ne fait que persister et arbitrer ce que le
  // domaine ne peut pas savoir — l'or disponible, le niveau des bâtiments, l'horloge.
  const advList = computed<Adventurer[]>(() => row.value?.adventurers ?? []);
  /** ⚔️ Groupes de camp partis SANS le héros (migr. 0077). Avec le héros, le voyage vit
   *  dans `expedition`. */
  const partyList = computed<ActiveParty[]>(() => row.value?.parties ?? []);
  /** ⚔️🧭 Les attaques combinées en préparation (certains groupes attendent leur départ). */
  const attackList = computed<CombinedAttack[]>(() => row.value?.attacks ?? []);
  /** ⚔️🧭 Les membres déjà PRIS : une attaque combinée les attend (ils restent dans leur
   *  garnison jusqu'au départ). Ni transfert, ni échange, ni rappel. */
  const reservedIds = computed(() => new Set(attackWaitingIds(attackList.value)));
  /** 🧝 Le héros est engagé ailleurs : en expédition, ou réservé pour une attaque combinée. */
  const heroEngaged = computed(
    () =>
      !!row.value?.expedition ||
      heroInAttack(attackList.value) ||
      // ⛵ En traversée (réservée ou en mer) : le héros est sur le bateau.
      !!row.value?.expedition_map?.crossing ||
      // 🧭 Rappelé de son poste et encore en chemin vers la base.
      // ⚠️ POSTÉ sur un lieu tenu, il n'est PAS en expédition (signalé : « considéré partout
      // ailleurs en expédition, je ne peux plus le bouger ») : il reste jouable (donjons,
      // équipement) et repart de son poste vers une autre cible (`unpostHero` à l'envoi).
      row.value?.expedition_map?.heroReturnAt !== undefined ||
      // 🧝 En route pour rejoindre la garnison d'un lieu tenu (`sendHeroToPost`).
      heroComing(row.value?.expedition_map),
  );
  /** 🗡️ Le STOCK d'équipement des aventuriers (migr. 0068) — séparé du sac du héros. */
  const advGearStock = computed<AdvGear[]>(() => row.value?.adv_gear?.stock ?? []);
  /** 🛕 Le niveau du PANTHÉON — un seul bâtiment depuis la fusion (v0.949), donc un seul
   *  niveau : il porte le DÉPLOIEMENT (combien de champions engagés à la fois) et la
   *  FORGE (le temps de fabrication d'une pièce). ⚠️ Il porte aussi le plafond d'XP d'un
   *  champion (`grantAdvXp`) — c'est le « le sport fixe le plafond » de cette boucle. */
  const pantheonLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'pantheon'));
  /**
   * 🧑‍✈️ LE NIVEAU DU HÉROS, qui borne l'XP qu'un champion garde en réserve (`advXpRoom`).
   * Il vient du SPORT (`useProgress`), que le store ne calcule pas : deux sources, toutes deux
   * des MINORANTS du vrai niveau (il ne fait que monter), dont on garde la plus haute —
   * `reward_level` (le dernier niveau récompensé, persisté) et ce que `useProgress` a signalé
   * (`noteHeroLevel`). ⚠️ 0 = inconnu : `advXpRoom` ne borne alors RIEN, plutôt que de jeter
   * l'XP d'un champion sur un niveau qu'on n'a pas encore lu.
   */
  const heroLevelSeen = ref(0);
  const heroLevel = computed(() => Math.max(row.value?.reward_level ?? 0, heroLevelSeen.value));
  function noteHeroLevel(level: number) {
    if (Number.isFinite(level) && level > heroLevelSeen.value) heroLevelSeen.value = level;
  }
  // ⚠️ L'AVANT-POSTE, depuis qu'il a absorbé le Comptoir de caravanes : un seul bâtiment
  // règle tout le VOYAGE — trajet du héros et des équipes.
  // Le nom du binding reste `comptoirLevel` : c’est le paramètre que lit
  // `caravanLegMin`, et le renommer partout n'apprendrait rien de plus.
  const comptoirLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'outpost'));

  /** ⚔️🕳️ Envoie un GROUPE sur un camp de faction OU dans une faille : le héros (oui/non) et
   *  autant d'aventuriers DISPONIBLES qu'on veut — ⚠️ aucun `escortMax` (seuls les convois
   *  le gardent). ⚠️ UNIQUE chemin d’envoi d’un groupe, donc unique endroit où se décide la
   *  RÉSOLUTION (`resolveCamp` / `resolveIncursion`).
   *
   *  ⚠️ Refus AU STORE (l'écran ne garantit rien, même politique que `expeSend`) : lieu qui
   *  accepte un groupe (`PARTY_TARGETS`),
   *  groupe non vide, chaque aventurier disponible (`advAvailable` : ni en convoi, ni à
   *  l'infirmerie, ni en formation), et — avec le héros — pas d'expédition en cours, pas
   *  d'infirmerie, Avant-poste construit, or suffisant.
   *  ⚠️ Le POI est RETIRÉ de la carte au départ, comme pour le héros et les convois.
   *  ⚠️ Avec le héros, le voyage vit dans `expedition` (un seul voyage héros à la fois, et
   *  `expeTick`/`expeSettle` le font vivre) ; sans lui, dans `parties` (`partyTick`). */
  async function sendParty(
    userId: string,
    poi: Poi,
    opts: {
      hero: PartyHero | null;
      escortIds: string[];
      playerLevel: number;
      now: number;
      /** 🎒 Les consommables emportés — un de chaque type, pris dans le stock au départ. */
      supplies?: SupplyId[];
      /** 🏰 Point de contrôle : qui reste en garnison si on le prend (sinon l'escorte). */
      stayIds?: string[];
      /** 🏰 SORTIE : l'équipe part de ce point fixe tenu (sa garnison) et y revient. */
      fromControlId?: string;
      /** 🧝 Le héros reste en garnison si le point est pris (étape 6 bis). */
      heroStays?: boolean;
      /** ⚔️⏱️ Partir quand même vers une armée qu'on ne rejoindrait pas à temps (2026-10-06,
       *  demandé : confirmé par le joueur, qui compte sur un boost ⚡ en route). Arrivée trop
       *  tard : retour sans combattre (`supersedeLate`). */
      lateOk?: boolean;
    },
  ): Promise<string | null> {
    // ⚠️ Rend la RAISON d'un refus (null = parti) : un « départ impossible » générique laissait
    // deviner lequel des aventuriers, de l'or ou du héros bloquait.
    const cur = row.value;
    if (!cur) return 'ton personnage n’est pas chargé';
    const { now, hero } = opts;
    // ⚠️ Un id répété ferait partir deux fois le même aventurier.
    if (new Set(opts.escortIds).size !== opts.escortIds.length)
      return 'un champion est choisi deux fois';
    // 🏰 SORTIE d'un point fixe : l'équipe vient de SA garnison (arrivée), sans le héros —
    // lui part toujours de la base. La règle vit en lib (`sortieBlocker`), l'écran la lit.
    const origin = opts.fromControlId
      ? (cur.expedition_map?.pois.find((p) => p.id === opts.fromControlId) ?? null)
      : null;
    if (opts.fromControlId) {
      if (!origin || !cur.expedition_map) return 'la carte n’est pas chargée';
      // 🧝 Le héros part de LÀ OÙ IL EST : d'un point seulement s'il y est posté.
      const heroHere = heroPostOf(cur.expedition_map)?.id === origin.id;
      if (hero && !heroHere) return 'le héros ne peut partir que du lieu où il est posté';
      const block = sortieBlocker(cur.expedition_map, origin.id, opts.escortIds);
      if (block && !(block === 'empty' && hero)) return SORTIE_BLOCK_LABEL[block];
    }
    // 🧝 Posté sur un lieu tenu, il ne part pas de la base (signalé : il partait de la base
    // alors qu'il était à l'Ossuaire) : l'envoi doit partir de son poste.
    if (hero && !origin && heroPosted(cur.expedition_map))
      return 'ton héros est posté sur un lieu : il part de là';
    const escort = opts.escortIds
      .map((id) => advList.value.find((a) => a.id === id))
      .filter(
        (a): a is Adventurer =>
          !!a &&
          (origin
            ? a.posted === origin.id && (a.hurtUntil ?? 0) <= now && (a.busyUntil ?? 0) <= now
            : advAvailable(a, now)),
      );
    if (escort.length !== opts.escortIds.length)
      return 'un champion du groupe n’est plus disponible';
    // ⚠️ Groupe vide, trop nombreux ou perdu d'avance : la MÊME règle que l'écran
    // (`partySendBlocker`).
    // 🗡️ Ce que le groupe emmène — il faut le connaître AVANT le refus, puisque le
    // pronostic se joue avec l'équipement réellement porté.
    // 🎒 Les consommables : utiles sur CE voyage, et bien en stock. ⚠️ Vérifiés AVANT tout :
    // ils entrent dans le kit, donc dans le pronostic qui décide du refus « perdu d'avance ».
    const supplies = opts.supplies ?? [];
    const supplyBlock = suppliesBlocker(supplies, supplyTarget(poi, !!hero, escort.length));
    if (supplyBlock) return supplyBlock;
    const stockAfter = takeSupplies(cur.supplies, supplies);
    if (!stockAfter) return 'un consommable choisi n’est plus en stock';
    const road = { ...escortKitOf(cur), supplies };
    const sendBlock = partySendBlocker(
      poi,
      escort.length,
      !!hero,
      engageCap(pantheonLevel.value),
      // 💀 PERDU D'AVANCE : l'écran ne propose pas l'impossible, il ne peut pas le GARANTIR.
      // ⚠️ La MÊME dispatch que la résolution, sur la MÊME cible (colonne déjà amputée).
      partyWinChance(withRiftCut(poi, cur.base), escort, road, hero, now, FORECAST_SAMPLES, false),
      now,
    );
    if (sendBlock) return PARTY_SEND_BLOCK_LABEL[sendBlock];
    // 🧝 Avec le héros : la MÊME règle que l'écran lit pour dire POURQUOI il est grisé
    // (déjà parti, infirmerie, Avant-poste, or) — `partyHeroBlocker`, une seule définition.
    const heroBlock = hero
      ? partyHeroBlocker({
          onExpedition: heroEngaged.value,
          healMs: woundRemainingMs(cur.base, now),
          outpost: expeditionsUnlocked(cur.buildings),
          poi,
        })
      : null;
    if (heroBlock) return `héros : ${PARTY_HERO_BLOCK_LABEL[heroBlock]}`;
    // ⚠️ PAIRE : les graines du pronostic sont impaires (`partyForecastSeed`), et une récolte
    // rejoue sa ROUTE sur la graine du départ elle-même (`resolveCaravan`) — le % affiché ne
    // doit jamais rejouer le trajet qui aura lieu.
    const seed = ((now ^ (poi.level * 2654435761)) & ~1) >>> 0 || 2;
    // ⚔️ Une bande en marche vient à notre rencontre : on va là où on la CROISERA
    // (`interceptLeg`), et le voyage garde ce point — la carte y dessine le choc.
    const legOf = (p: Poi) =>
      partyLegMin(p, escort, {
        hero: !!hero,
        travelMult: travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now),
        gearSpeed: advGearRoles(escort, road.advGear).speed,
        supplies,
      });
    // 🏰 Une sortie part de son point : même règle de trajet, distance mesurée depuis lui.
    const meet = interceptLeg(poi, now, origin ? (p) => legFromSpot(p, origin, legOf) : legOf);
    const leg = meet.legMin;
    // ⚔️🗼 On ne croise pas une armée qui sera arrivée avant nous : le choc tomberait après
    // l'attaque, il ne changerait rien. ⚠️ TOUTE bande en marche, pas seulement les armées de
    // campagne : une bande de faille arrivée aux murs a déjà renforcé le siège.
    if (!opts.lateOk && interceptTooLate(poi, now, leg)) return PARTY_SEND_BLOCK_LABEL.tooLate;
    const withSupplies = partyOutcomeFor({
      poi,
      escort,
      road,
      hero,
      seed,
      now,
      arriveAt: now + leg * 60000,
      sentAt: now,
      playerLevel: opts.playerLevel,
      stayIds: opts.stayIds,
      combined: false,
    });
    if (!withSupplies) return PARTY_SEND_BLOCK_LABEL.notTarget;
    // 🧝 Le héros reste-t-il en garnison si le point est pris ? Son instantané de combat part
    // avec le rapport : c'est lui qui défendra le lieu, hors de l'app.
    // Sans choix explicite (`heroStays` absent), il reste s'il a sa place après les champions.
    const allSeats = poi.type === 'control' && poi.control ? holdSeats(poi.control) : 0;
    const heroStays =
      !!hero &&
      heroStaysAt(
        poi,
        assaultStayers(opts.escortIds, opts.stayIds, allSeats).length,
        opts.heroStays,
        allSeats,
      );
    const outcome =
      heroStays && withSupplies.party
        ? {
            ...withSupplies,
            party: {
              ...withSupplies.party,
              heroStays: true,
              heroUnit: { name: hero.name, level: hero.level, combatant: hero.combatant },
            },
          }
        : withSupplies;
    const trip0 = startParty(
      { poi: meet.poi, hero, seed, champions: escort.length },
      now,
      leg,
      // 🧭 Le rapport dira d'où chacun est parti : où le renvoyer une fois guéri.
      withOrigins(outcome, partyOrigins([{ ids: opts.escortIds, origin }])),
    );
    // 🏰 Assaut d'un point fixe : si on le prend, seuls le héros et les champions en trop
    // rentrent — à LEUR pas, souvent plus vif que celui de toute l'équipe. `returnAt` garde
    // le retour de la défaite jusqu'à l'arrivée (`shortenWonReturn`).
    // 🧝 Le héros qui reste prend 2 places sur les 5 (`champSeatsWithHero`).
    const seats =
      poi.type === 'control' && poi.control ? champSeatsWithHero(poi.control, heroStays) : 0;
    const stayers = new Set(seats ? assaultStayers(opts.escortIds, opts.stayIds, seats) : []);
    const back = escort.filter((a) => !stayers.has(a.id));
    // 🧝 Prise, le lieu garde le héros s'il y reste (la forteresse toujours) : il ne rentre pas.
    const heroBack = !!hero && !heroStays;
    const backLeg = (p: Poi) =>
      partyLegMin(p, back, {
        hero: heroBack,
        travelMult: travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now),
        gearSpeed: advGearRoles(back, road.advGear).speed,
        supplies,
      });
    let wonLeg = 0;
    if (seats && (back.length || heroBack))
      wonLeg = origin ? legFromSpot(meet.poi, origin, backLeg) : backLeg(meet.poi);
    const trip1 = seats
      ? { ...trip0, returnLegs: { won: Math.min(wonLeg, leg), lost: leg } }
      : trip0;
    // 🧝 Parti de son poste, le héros y reprend sa place au retour (`heroBackToPost`).
    const trip = origin
      ? {
          ...trip1,
          origin: { x: origin.x, y: origin.y },
          homeId: origin.id,
          ...(hero
            ? { homeHero: { name: hero.name, level: hero.level, combatant: hero.combatant } }
            : {}),
        }
      : trip1;
    const busy = new Set(opts.escortIds);
    // 🏰 Un point de contrôle est FIXE : il reste sur la carte, marqué « assaut en cours ».
    const map0 = targetTaken(cur.expedition_map, poi);
    // 🏰 Une sortie quitte la garnison de son point (ce qui est produit reste en réserve) :
    // le point produit moins et se défend moins bien tant qu'elle est dehors — mais sa place
    // lui est GARDÉE jusqu'à son retour (`sortieLeaves`).
    const map1 =
      origin && map0 ? sortieLeaves(map0, origin.id, opts.escortIds, now, opts.playerLevel) : map0;
    // 🗺️ Un départ de plus : la carte harcèle d'autant plus qu'on l'utilise.
    // 🧝 Le héros posté sur un lieu tenu en part directement : il quitte la garnison.
    const map2 = map1 && hero ? unpostHero(map1, now, !!origin) : map1;
    // 🔙 Daté de l'ARRIVÉE : un demi-tour (avant l'arrivée) le retire, il ne compte jamais.
    const map = map2 ? recordDeparture(map2, now, trip.midAt, isAttackTarget(poi)) : map2;
    await persist(userId, {
      expedition_map: map,
      ...(supplies.length ? { supplies: stockAfter } : {}),
      adventurers: advList.value.map((a) =>
        busy.has(a.id)
          ? { ...a, busyUntil: trip.returnAt, ...(origin ? { posted: undefined } : {}) }
          : a,
      ),
      ...(hero
        ? { expedition: trip }
        : { parties: [...partyList.value, { ...trip, id: `party_${now.toString(36)}` }] }),
    });
    return null;
  }

  /** 🗺️ Le lieu visé est PRIS dès l'envoi : un point de contrôle (fixe) est marqué « assaut en
   *  cours », tout autre lieu quitte la carte. */
  function targetTaken(map: ExpeditionMap | null, poi: Poi): ExpeditionMap | null {
    if (!map) return map;
    // ⚔️🗼 Une armée en campagne continue sa marche : d'autres équipes peuvent encore la
    // croiser. Elle quitte la carte à son arrivée (`syncFieldArmies`).
    if (isFieldArmyPoi(poi)) return map;
    // ⚔️ Un lieu gardé reste attaquable par d'autres équipes tant qu'il n'est pas tombé.
    if (staysUnderAttack(poi)) return map;
    return poi.type === 'control'
      ? markAssault(map, poi.id, true)
      : { ...map, pois: map.pois.filter((p) => p.id !== poi.id) };
  }

  /**
   * ⚔️🕳️ L'ISSUE D'UNE ÉQUIPE sur un lieu — LA DISPATCH, partagée par l'envoi ordinaire et
   * l'attaque combinée (qui la tire quand le dernier groupe est parti). Un camp se résout par
   * son combat de faction, une faille par son incursion (attrition, gardien, mana).
   * ⚠️ EXPLICITE, et non « camp sinon faille » : un type inconnu rend `null` (refus).
   */
  function partyOutcomeFor(a: {
    poi: Poi;
    escort: Adventurer[];
    road: EscortKit;
    hero: PartyHero | null;
    seed: number;
    now: number;
    /** L'arrivée sur le lieu : la maturité d'une faille se lit là. */
    arriveAt: number;
    /** ⚠️ REQUIS : l'heure d'ENVOI, celle où se lit la condition d'île (`conditionFx`). Pour une
     *  attaque combinée c'est `createdAt`, PAS l'arrivée (`now`) : l'aperçu lit la condition de
     *  l'envoi, et l'issue est figée au départ. */
    sentAt: number;
    playerLevel: number;
    stayIds?: string[];
    /** ⚠️ REQUIS : attaque COMBINÉE → aucun demi-tour sur la route (`noTurnBack`). Ses
     *  groupes ne se réunissent qu'au lieu, et leurs trajets sont figés au départ. */
    combined: boolean;
  }): ExpeditionOutcome | null {
    const { poi, escort, road, hero, seed, now } = a;
    const supplies = road.supplies ?? [];
    // 🌗 La condition d'île À L'ENVOI : l'issue est figée ici (graine du départ).
    const fx = conditionFx(row.value?.expedition_map, a.sentAt);
    const opts = {
      playerLevel: a.playerLevel,
      stayIds: a.stayIds,
      escortIds: escort.map((x) => x.id),
    };
    // 🐺 Une tanière : une bête de force FIXE, qu'on peut attaquer en surnombre.
    const spec = campSpecOf(poi);
    const outcome = isRiftPoi(poi)
      ? resolveIncursion({
          poi,
          escort,
          road,
          hero,
          seed,
          now,
          pantheonLevel: pantheonLevel.value,
          heroLevel: heroLevel.value,
        })
      : isFieldArmyPoi(poi)
        ? resolveFieldArmy({
            poi,
            escort,
            road,
            hero,
            seed,
            playerLevel: opts.playerLevel,
            pantheonLevel: pantheonLevel.value,
            heroLevel: heroLevel.value,
          })
        : poi.convoy
          ? resolveConvoy({
              poi,
              escort,
              road,
              hero,
              seed,
              playerLevel: opts.playerLevel,
              pantheonLevel: pantheonLevel.value,
              heroLevel: heroLevel.value,
            })
          : isWarbandPoi(poi)
            ? resolveInterception({
                // ⚔️🕳️ La colonne DÉJÀ amputée par les interceptions ratées (lue sur la base).
                poi: withRiftCut(poi, row.value?.base),
                escort,
                road,
                hero,
                seed,
                playerLevel: opts.playerLevel,
                pantheonLevel: pantheonLevel.value,
                heroLevel: heroLevel.value,
              })
            : spec
              ? resolveCamp({
                  poi,
                  spec,
                  escort,
                  road,
                  hero,
                  seed,
                  playerLevel: opts.playerLevel,
                  pantheonLevel: pantheonLevel.value,
                  heroLevel: heroLevel.value,
                })
              : HARVEST_TYPES.has(poi.type)
                ? resolveHarvestParty({
                    poi,
                    escort,
                    road,
                    hero,
                    seed,
                    playerLevel: opts.playerLevel,
                    pantheonLevel: pantheonLevel.value,
                    heroLevel: heroLevel.value,
                    combined: a.combined,
                    conditionMult: fx.goldOf(poi.type),
                  })
                : null;
    if (!outcome) return null;
    // 🩹 La trousse agit sur l'ISSUE, tirée ici : plus de blessé, donc ni infirmerie ni retour
    // forcé à la base (`medkitHeal`). 🎒 Et un consommable peut tomber de tout voyage.
    const medkit = supplyFx(supplies).medkit;
    // 🏰 L'assaut d'un point de contrôle se reconnaît au rapport (`controlId`) : c'est ce
    // qui fera poster la garnison à l'arrivée.
    // 🤕 Une défaite AVEC le héros le blesse aussi (`markHeroHurt`) — sauf trousse.
    const marked = outcome.party ? markHeroHurt(outcome.party, medkit) : outcome.party;
    const healed = marked && medkit ? medkitHeal(marked) : marked;
    // 🍃 « Vents calmes » : l'XP des champions du rapport, mise à l'échelle au départ.
    const fought = healed && fx.xp !== 1 ? { ...healed, xp: scaleXp(healed.xp, fx.xp) } : healed;
    const party =
      fought && poi.type === 'control'
        ? {
            ...fought,
            controlId: poi.id,
            ...(opts.stayIds && poi.control
              ? {
                  stay: opts.stayIds
                    .filter((id) => opts.escortIds.includes(id))
                    .slice(0, seatsOf(poi.control.kind)),
                }
              : {}),
          }
        : fought;
    // 🔮 Une rune de LIEU : seulement sur un lieu RÉUSSI, et seulement avec un champion (elles
    // servent aux champions). Tirée au départ sur son propre générateur, comme tout le voyage.
    // ⚠️ La maturité d'une faille se lit à l'ARRIVÉE : c'est là que le groupe y entre.
    const placeRunes =
      outcome.win && escort.length && RUNE_PLACE_OK[poi.type]
        ? rollPlaceRunes(mulberry32((seed ^ 0x6b43a9b5) >>> 0 || 1), {
            place: poi.type,
            placeRankIndex: characterRank(poiDifficultyLevel(poi)).rankIndex,
            playerRankIndex: characterRank(opts.playerLevel).rankIndex,
            maturity: isRiftPoi(poi) ? riftMaturityAt(poi.spawnedAt, a.arriveAt) : 0,
          })
        : null;
    const withSupplies = {
      ...outcome,
      ...(placeRunes ? { runes: runeCount(outcome.runes) + placeRunes } : {}),
      ...(party ? { party } : {}),
      // ⚠️ ADDITIONNÉ, jamais écrasé : les bêtes abattues laissent déjà leurs consommables (v0.1166).
      supplies: addSupplies(outcome.supplies ?? {}, rollSupplyDrop(seed, fx.supplyChance)),
    };
    return withSupplies;
  }

  /**
   * ⚔️🧭 L'ATTAQUE COMBINÉE (2026-09-29) : plusieurs groupes — la base (héros compris) et des
   * points fixes tenus — frappent le même lieu en partant chacun à son heure pour ARRIVER
   * ENSEMBLE (`planWings`). Rien ne part encore, sauf le groupe le plus lent : les autres
   * sont RÉSERVÉS (`busyUntil` = leur retour prévu) mais restent chez eux — une garnison
   * continue de produire et de se défendre, la base garde ses défenseurs. Les départs et le
   * combat se règlent dans `attackTick`. Mêmes règles qu'une équipe (plafond du Panthéon sur
   * le TOTAL, pronostic « perdu d'avance », consommables).
   * Rend la RAISON d'un refus, `null` si l'attaque est lancée.
   */
  /** 🏰 Qui reste en garnison si l'assaut prend le point (`assaultStayers`), `null` si ce
   *  n'est pas un assaut de point fixe. */
  function assaultStayOf(
    poi: Poi,
    ids: readonly string[],
    stayIds: readonly string[] | undefined,
  ): Set<string> | null {
    if (poi.type !== 'control' || !poi.control) return null;
    return new Set(assaultStayers(ids, stayIds, holdSeats(poi.control)));
  }

  /** ⚔️🧭 Le retour d'UN groupe d'une attaque combinée si le point est pris : ses membres qui
   *  ne restent pas (et son héros), à LEUR pas, jusqu'à CHEZ LUI. 0 si personne ne rentre ;
   *  jamais plus long que son trajet d'origine (`legMin`, figé à l'envoi). */
  function wingWonLeg(
    cur: CharacterRow,
    poi: Poi,
    origin: Poi | null,
    escort: Adventurer[],
    hero: boolean,
    stay: Set<string>,
    supplies: SupplyId[],
    legMin: number,
  ): number {
    const back = escort.filter((a) => !stay.has(a.id));
    // 🏰 Prise, la forteresse garde le héros : il ne rentre pas.
    if (poi.control?.kind === 'fortress') hero = false;
    if (!back.length && !hero) return 0;
    const road = escortKitOf(cur);
    const legOf = (p: Poi) =>
      partyLegMin(p, back, {
        hero,
        travelMult:
          travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, Date.now()),
        gearSpeed: advGearRoles(back, road.advGear).speed,
        supplies,
      });
    return Math.min(legMin, origin ? legFromSpot(poi, origin, legOf) : legOf(poi));
  }

  async function sendCombinedAttack(
    userId: string,
    poi: Poi,
    opts: {
      wings: { originId: string | null; escortIds: string[]; hero: PartyHero | null }[];
      playerLevel: number;
      now: number;
      supplies?: SupplyId[];
      stayIds?: string[];
      /** ⚔️⏱️ Partir quand même vers une armée qu'on ne rejoindrait pas à temps (2026-10-06,
       *  demandé : confirmé par le joueur, qui compte sur un boost ⚡ en route). Arrivée trop
       *  tard : retour sans combattre (`supersedeLate`). */
      lateOk?: boolean;
    },
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map) return 'la carte n’est pas chargée';
    const { now } = opts;
    const shape = opts.wings.map((w) => ({
      originId: w.originId,
      members: w.escortIds,
      hero: !!w.hero,
    }));
    const heroPostId = heroPostOf(cur.expedition_map)?.id ?? null;
    const cblock = combinedBlocker(poi, shape, heroPostId);
    if (cblock) return COMBINED_BLOCK_LABEL[cblock];
    const map = cur.expedition_map;
    // Chaque groupe : ses champions, prêts à partir de CHEZ LUI.
    const groups: { originId: string | null; origin: Poi | null; escort: Adventurer[] }[] = [];
    for (const w of opts.wings) {
      const origin = w.originId ? (map.pois.find((p) => p.id === w.originId) ?? null) : null;
      if (w.originId) {
        if (!origin) return 'un point de départ n’existe plus';
        const b = sortieBlocker(map, w.originId, w.escortIds);
        // 🧝 Le groupe du héros posté peut partir sans champion : lui suffit.
        if (b && !(b === 'empty' && w.hero)) return SORTIE_BLOCK_LABEL[b];
      }
      const escort = w.escortIds
        .map((id) => advList.value.find((a) => a.id === id))
        .filter(
          (a): a is Adventurer =>
            !!a &&
            (origin
              ? a.posted === origin.id && (a.hurtUntil ?? 0) <= now && (a.busyUntil ?? 0) <= now
              : advAvailable(a, now)),
        );
      if (escort.length !== w.escortIds.length) return 'un champion choisi n’est plus disponible';
      groups.push({ originId: w.originId, origin, escort });
    }
    const hero = opts.wings.find((w) => w.hero)?.hero ?? null;
    const all = groups.flatMap((g) => g.escort);
    const supplies = opts.supplies ?? [];
    const supplyBlock = suppliesBlocker(supplies, supplyTarget(poi, !!hero, all.length));
    if (supplyBlock) return supplyBlock;
    const stockAfter = takeSupplies(cur.supplies, supplies);
    if (!stockAfter) return 'un consommable choisi n’est plus en stock';
    const road = { ...escortKitOf(cur), supplies };
    // ⚠️ Le plafond du Panthéon porte sur l'attaque ENTIÈRE.
    const sendBlock = partySendBlocker(
      poi,
      all.length,
      !!hero,
      engageCap(pantheonLevel.value),
      partyWinChance(withRiftCut(poi, cur.base), all, road, hero, now, FORECAST_SAMPLES, false),
      now,
    );
    if (sendBlock) return PARTY_SEND_BLOCK_LABEL[sendBlock];
    const heroBlock = hero
      ? partyHeroBlocker({
          onExpedition: heroEngaged.value,
          healMs: woundRemainingMs(cur.base, now),
          outpost: expeditionsUnlocked(cur.buildings),
          poi,
        })
      : null;
    if (heroBlock) return `héros : ${PARTY_HERO_BLOCK_LABEL[heroBlock]}`;
    // Le trajet de chaque groupe, à SON pas, depuis chez lui (Tour de guet comprise).
    const mult = travelTimeMult(cur.buildings) * controlTravelMult(map, now);
    const legs = groups.map((g) => {
      const withHero = !!hero && g.originId === heroPostId;
      const legOf = (p: Poi) =>
        partyLegMin(p, g.escort, {
          hero: withHero,
          travelMult: mult,
          gearSpeed: advGearRoles(g.escort, road.advGear).speed,
          supplies,
        });
      const origin = g.origin;
      return { g, withHero, at: origin ? (p: Poi) => legFromSpot(p, origin, legOf) : legOf };
    });
    // ⚔️🧭 Une armée en MARCHE : tous la rejoignent au même point (`meetAll`), là où elle sera.
    const meet = meetAll(
      poi,
      now,
      legs.map((l) => l.at),
    );
    if (
      !opts.lateOk &&
      ((isWarbandPoi(poi) && !meet.joined) || interceptTooLate(poi, now, meet.min))
    )
      return 'trop tard : l’armée atteindra sa cible avant que tous la rejoignent';
    const target = meet.poi;
    const plan = planWings(
      legs.map((l) => ({
        originId: l.g.originId,
        members: l.g.escort.map((a) => a.id),
        hero: l.withHero,
        legMin: l.at(target),
      })),
      now,
      dwellMsFor(poi, all.length),
      meet.min,
    );
    // 🏰 Assaut d'un point fixe : le retour de chaque groupe si le point est pris (estimé ici
    // pour l'affichage, recalculé au lancement avec ceux qui sont vraiment partis).
    const stay = assaultStayOf(
      poi,
      all.map((a) => a.id),
      opts.stayIds,
    );
    // 🧝 Le héros qui aura sa place après les champions reste (`attackTick`) : il ne rentre pas.
    const heroStayEst =
      !!stay &&
      poi.control?.kind !== 'fortress' &&
      heroStaysAt(poi, stay.size, undefined, holdSeats(poi.control!));
    if (stay)
      plan.wings.forEach((w, i) => {
        const g = groups[i]!;
        const h = w.hero && !heroStayEst;
        w.wonLegMin = wingWonLeg(cur, poi, g.origin, g.escort, h, stay, supplies, w.legMin);
      });
    const seed = ((now ^ (poi.level * 2654435761)) & ~1) >>> 0 || 2;
    const attack: CombinedAttack = {
      id: `atk_${now.toString(36)}`,
      poi: target,
      seed,
      createdAt: now,
      arriveAt: plan.arriveAt,
      midAt: plan.midAt,
      playerLevel: opts.playerLevel,
      supplies,
      ...(opts.stayIds?.length ? { stayIds: opts.stayIds } : {}),
      wings: plan.wings,
    };
    // Réservés : jusqu'à leur retour prévu. Ils restent chez eux jusqu'à leur départ.
    const returnOf = new Map(plan.wings.flatMap((w) => w.members.map((id) => [id, w.returnAt])));
    await persist(userId, {
      // 🧝 Réservé pour l'attaque, le héros posté GARDE son poste jusqu'au départ de son
      // groupe (`attackTick`) : il défend le lieu pendant l'attente, comme les champions qui
      // attendent chez eux. (Signalé : il quittait l'Ossuaire dès l'envoi.)
      expedition_map: recordDeparture(targetTaken(map, poi)!, now, plan.midAt, true),
      attacks: [...attackList.value, attack],
      ...(supplies.length ? { supplies: stockAfter } : {}),
      adventurers: advList.value.map((a) =>
        returnOf.has(a.id) ? { ...a, busyUntil: returnOf.get(a.id)! } : a,
      ),
    });
    return null;
  }

  /**
   * ⚔️🧭 Les départs des attaques combinées, à leur heure (`wingDeparture`). Un groupe dont
   * la base ou le point a été battu entre-temps part SANS les blessés, ou pas du tout. Quand
   * le dernier groupe est parti, le combat se tire avec ceux qui sont VRAIMENT partis, et
   * l'attaque devient des voyages ordinaires : le groupe PRINCIPAL (celui du héros, sinon de
   * la base, sinon le premier) porte le rapport ; les autres sont ses compagnons (`wingOf`),
   * qui rentrent chacun chez eux. Personne n'est parti : l'attaque est annulée (le lieu et les
   * consommables sont rendus). ⚠️ À appeler APRÈS le siège, AVANT les reprises des points.
   * Rend ce qui s'est passé, pour l'écran.
   */
  async function attackTick(
    userId: string,
    now: number,
    hero: PartyHero | null,
  ): Promise<{ launched: number; cancelled: number; dropped: number }> {
    const none = { launched: 0, cancelled: 0, dropped: 0 };
    const cur = row.value;
    if (!cur || !attackList.value.length) return none;
    let map = cur.expedition_map;
    let advs = advList.value;
    let parties = partyList.value;
    let expedition = cur.expedition;
    let stock = cur.supplies;
    const keep: CombinedAttack[] = [];
    let changed = false;
    const out = { ...none };
    const raidAt = cur.base?.raid?.arrivesAt ?? null;
    for (const a0 of attackList.value) {
      let a = a0;
      for (let i = 0; i < a.wings.length; i++) {
        const w = a.wings[i]!;
        const d = wingDeparture(w, {
          now,
          map,
          advs,
          raidAt,
          heroWoundedAt: (t) => woundRemainingMs(cur.base, t) > 0,
        });
        if (!d || d === 'wait') continue;
        changed = true;
        const went = new Set(d.members);
        const lost = w.members.filter((id) => !went.has(id)).length + (w.hero && !d.hero ? 1 : 0);
        out.dropped += lost;
        // Les absents ne sont plus réservés (seulement si la réservation est toujours la nôtre).
        advs = advs.map((x) =>
          w.members.includes(x.id) && !went.has(x.id) && x.busyUntil === w.returnAt
            ? { ...x, busyUntil: undefined }
            : x,
        );
        if (w.originId && map && d.members.length) {
          map = sortieLeaves(map, w.originId, d.members, w.departAt, a.playerLevel);
          advs = advs.map((x) => (went.has(x.id) ? { ...x, posted: undefined } : x));
        }
        // 🧝 Le héros quitte son poste à SON départ, pas à l'envoi de l'attaque.
        if (d.hero && map) map = unpostHero(map, w.departAt, !!w.originId);
        const gone = d.members.length > 0 || d.hero;
        const wings = [...a.wings];
        wings[i] = gone
          ? { ...w, state: 'gone', gone: d.members, heroGone: d.hero }
          : { ...w, state: 'dropped' };
        a = { ...a, wings };
      }
      if (!attackSettled(a)) {
        keep.push(a);
        continue;
      }
      changed = true;
      const who = attackParticipants(a);
      if (!who.ids.length && !who.hero) {
        // Personne n'est venu : le lieu redevient libre, les consommables reviennent.
        out.cancelled++;
        if (map)
          map =
            a.poi.type === 'control'
              ? markAssault(map, a.poi.id, false)
              : a.poi.expiresAt > now && !map.pois.some((p) => p.id === a.poi.id)
                ? { ...map, pois: [...map.pois, a.poi] }
                : map;
        stock = addSupplies(stock, Object.fromEntries(a.supplies.map((id) => [id, 1])));
        continue;
      }
      // Le héros part : il faut son combattant (la page le fournit) — sinon on attend.
      if (who.hero && !hero) {
        keep.push(a);
        continue;
      }
      const escort = who.ids
        .map((id) => advs.find((x) => x.id === id))
        .filter((x): x is Adventurer => !!x);
      const road = { ...escortKitOf(cur), supplies: a.supplies };
      const outcome0 = partyOutcomeFor({
        poi: a.poi,
        escort,
        road,
        hero: who.hero ? hero : null,
        seed: a.seed,
        now: a.arriveAt,
        arriveAt: a.arriveAt,
        // 🌗 La condition d'île de l'ENVOI de l'attaque (`createdAt`), comme l'aperçu.
        sentAt: a.createdAt,
        playerLevel: a.playerLevel,
        stayIds: a.stayIds,
        // 🔙 Les groupes ne se réunissent qu'au lieu : aucun demi-tour sur la route.
        combined: true,
      });
      if (!outcome0) {
        out.cancelled++;
        if (map && a.poi.type === 'control') map = markAssault(map, a.poi.id, false);
        advs = advs.map((x) => (who.ids.includes(x.id) ? { ...x, busyUntil: undefined } : x));
        continue;
      }
      // 📜 Le rapport dit qui n'a pas pu venir.
      const miss = attackNoShows(a);
      const names = miss.ids
        .map((id) => advList.value.find((x) => x.id === id)?.name ?? '?')
        .concat(miss.hero ? ['ton héros'] : []);
      const outcome1 =
        names.length && outcome0.party
          ? {
              ...outcome0,
              party: {
                ...outcome0.party,
                journal: [
                  `⚠️ Battus avant de partir, ils n'ont pas rejoint l'attaque : ${names.join(', ')}.`,
                  ...outcome0.party.journal,
                ],
              },
            }
          : outcome0;
      const stay = assaultStayOf(a.poi, who.ids, a.stayIds);
      // 🧝 Le héros reste aussi en garnison s'il a sa place après les champions (demandé le
      // 2026-10-06, même règle qu'une équipe : `heroStaysAt`). La forteresse le garde déjà.
      const heroStay =
        !!who.hero &&
        !!hero &&
        !!stay &&
        a.poi.control?.kind !== 'fortress' &&
        heroStaysAt(a.poi, stay.size, undefined, holdSeats(a.poi.control!));
      const outcome =
        heroStay && outcome1.party
          ? {
              ...outcome1,
              party: {
                ...outcome1.party,
                heroStays: true,
                heroUnit: { name: hero.name, level: hero.level, combatant: hero.combatant },
              },
            }
          : outcome1;
      out.launched++;
      const goneWings = a.wings.filter((w) => w.state === 'gone');
      // 🧭 Chaque groupe a SON départ : le rapport le dit pour chacun de ses champions.
      const fromOf = partyOrigins(
        goneWings.map((w) => ({
          ids: w.gone ?? [],
          origin: w.originId ? (map?.pois.find((p) => p.id === w.originId) ?? null) : null,
        })),
      );
      const main =
        goneWings.find((w) => w.heroGone) ??
        goneWings.find((w) => w.originId === null) ??
        goneWings[0]!;
      for (const w of goneWings) {
        const origin = w.originId ? map?.pois.find((p) => p.id === w.originId) : null;
        const crew = w.gone ?? [];
        const wonLeg = stay
          ? wingWonLeg(
              cur,
              a.poi,
              origin ?? null,
              escort.filter((x) => crew.includes(x.id)),
              // 🧝 Resté en garnison, le héros ne rentre pas.
              !!w.heroGone && !heroStay,
              stay,
              a.supplies,
              w.legMin,
            )
          : null;
        const trip = {
          poi: a.poi,
          sentAt: w.departAt,
          midAt: a.midAt,
          returnAt: w.returnAt,
          ...(a.midAt > a.arriveAt ? { dwellMs: a.midAt - a.arriveAt } : {}),
          goldCost: 0,
          seed: a.seed,
          outcome: withOrigins(outcome, fromOf),
          ...(origin ? { origin: { x: origin.x, y: origin.y }, homeId: origin.id } : {}),
          // 🧝 Parti de son poste, le héros y reprend sa place au retour.
          ...(origin && w.heroGone && hero
            ? { homeHero: { name: hero.name, level: hero.level, combatant: hero.combatant } }
            : {}),
          ...(w === main ? {} : { wingOf: a.id }),
          crew,
          ...(wonLeg !== null ? { returnLegs: wingReturnLegs(w, wonLeg) } : {}),
        };
        if (w === main && w.heroGone) expedition = trip;
        else parties = [...parties, { ...trip, id: `party_${a.id}_${w.originId ?? 'base'}` }];
      }
    }
    if (!changed) return none;
    await persist(userId, {
      attacks: keep,
      adventurers: advs,
      ...(map !== cur.expedition_map ? { expedition_map: map } : {}),
      ...(parties !== partyList.value ? { parties } : {}),
      ...(expedition !== cur.expedition ? { expedition } : {}),
      ...(stock !== cur.supplies ? { supplies: stock } : {}),
    });
    return out;
  }

  /** 🧿 Pose un sceau de brèche sur une faille : 24 h de répit (`sealRift`). Rend la RAISON
   *  d'un refus, `null` si c'est fait. ⚠️ Carte et stock partent dans la MÊME écriture : un
   *  sceau dépensé sans faille scellée (ou l'inverse) serait un objet perdu ou gratuit. */
  async function sealRiftPoi(userId: string, poiId: string): Promise<string | null> {
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return 'la carte n’est pas chargée';
    if ((cur.supplies.sceau ?? 0) < 1) return 'aucun sceau de brèche en stock';
    const poi = map.pois.find((p) => p.id === poiId);
    const sealed = poi ? sealRift(poi) : null;
    if (!sealed) return poi?.sealed ? 'cette faille est déjà scellée' : 'ce n’est pas une faille';
    const stock = takeSupplies(cur.supplies, ['sceau'])!;
    await persist(userId, {
      supplies: stock,
      expedition_map: { ...map, pois: map.pois.map((p) => (p.id === poiId ? sealed : p)) },
    });
    return null;
  }

  /** 🪵 Pose une palissade sur un lieu fixe tenu (`placeWard`) : la troupe qui l'attaque
   *  rétrécit pendant 24 h. Rend la RAISON d'un refus, `null` si c'est fait. ⚠️ Carte et stock
   *  dans la MÊME écriture : un objet dépensé sans palissade posée serait perdu.
   *  ⚠️ La règle (lieu tenu, qui se défend, plafond de 30 %) est `wardBlocker` — celle que
   *  l'écran affiche : l'un ne peut pas accepter ce que l'autre refuse. */
  async function placeControlWard(
    userId: string,
    poiId: string,
    wardId: WardId,
    now: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return 'la carte n’est pas chargée';
    const stock = takeSupplies(cur.supplies, [wardId]);
    if (!stock) return `aucun(e) ${SUPPLIES[wardId].name.toLowerCase()} en stock`;
    const poi = map.pois.find((p) => p.id === poiId);
    const c = poi?.control;
    const why = wardBlocker(c, wardId, now);
    if (why) return WARD_BLOCK_LABEL[why];
    const control = placeWard(c!, wardId, now);
    await persist(userId, {
      supplies: stock,
      expedition_map: {
        ...map,
        pois: map.pois.map((p) => (p.id === poiId ? { ...p, control } : p)),
      },
    });
    return null;
  }

  /** ⚔️ La base après les rapports FRAIS : une interception gagnée disperse l'armée de
   *  la faille (`dispelOverflow`, datée par la bataille). `null` = rien à écrire.
   *  ⚠️ Appelée par les TROIS chemins qui déposent un rapport (groupe, héros à l'arrivée,
   *  héros rentré app fermée) — le chemin du héros l'oubliait. */
  function dispelWon(
    base: BaseState | null,
    fresh: readonly ExpeditionMessage[],
  ): { base: BaseState | null; tag: (box: ExpeditionMessage[]) => ExpeditionMessage[] } {
    const same = (box: ExpeditionMessage[]) => box;
    if (!base) return { base: null, tag: same };
    let b = base;
    const said = new Map<string, 'dispersed' | 'late'>();
    for (const m of fresh)
      // ⚔️🗼 Une ARMÉE EN CAMPAGNE battue n'est pas une bande de faille : elle ne disperse
      // pas le débordement (son effet passe par `applyFieldHit*`).
      if (m.poiType === 'warband' && m.win && !m.party?.fieldHit && !m.party?.convoy) {
        const d = dispelOverflow(b, m.resolvedAt);
        b = d.base;
        if (d.dispel) said.set(m.id, d.dispel);
      } else if (m.poiType === 'warband' && m.party?.riftHit) {
        // ⚔️🕳️ Une interception RATÉE ampute quand même la bande : son renfort au siège fond
        // d'autant, et la prochaine équipe affronte une colonne plus petite (idempotent).
        b = weakenOverflow(b, m.party.riftHit, m.resolvedAt);
      }
    return {
      base: b === base ? null : b,
      // 🗼 Le rapport le DIT (v0.1191) : sans ça le bénéfice d'une interception ne se
      // voyait nulle part.
      tag: said.size
        ? (box) =>
            box.map((m) => {
              const d = said.get(m.id);
              return d && m.party ? { ...m, party: { ...m.party, dispel: d } } : m;
            })
        : same,
    };
  }

  /** ⚔️ Cycle de vie des groupes partis SANS le héros : le rapport à l'arrivée sur le camp,
   *  puis le groupe retiré au retour (ses aventuriers sont libérés par `busyUntil`). Le
   *  BUTIN reste à encaisser dans la boîte 📬 (`expeClaim`), comme toute expédition.
   *  La règle vit dans `settleParties` (lib, testée). ⚠️ Une seule écriture, et seulement si
   *  quelque chose change : ce tick bat chaque seconde. Rend les messages nouvellement déposés. */
  /** ⚠️ `activeDays7` REQUIS : il règle le délai de reprise d'un point de contrôle pris. */
  /** ⚔️ Les voyages (groupes + expédition du héros) avec l'issue des arrivés trop tard remplacée
   *  (`supersedeLate`) : ils ne la découvrent qu'en arrivant, le lieu déjà tombé. */
  function lateAware(
    cur: CharacterRow,
    now: number,
  ): { parties: ActiveParty[]; expedition: ActiveExpedition | null; changed: boolean } {
    const exp = cur.expedition ?? null;
    const all = supersedeLate([...partyList.value, ...(exp ? [exp] : [])], now);
    const n = partyList.value.length;
    const parties = all.slice(0, n) as ActiveParty[];
    const expedition = exp ? all[n]! : null;
    return {
      parties,
      expedition,
      changed: parties.some((p, i) => p !== partyList.value[i]) || expedition !== exp,
    };
  }
  async function partyTick(
    userId: string,
    now: number,
    activeDays7: number,
  ): Promise<ExpeditionMessage[]> {
    const cur = row.value;
    if (!cur) return [];
    if (!partyList.value.length) {
      // ⚔️🏰 Plus aucun groupe dehors : une place encore gardée n'a plus personne à attendre
      // (voyage du héros rentré, ancienne sortie). On ne l'écrit que si elle change.
      await persistAwaySync(userId, cur, []);
      return [];
    }
    const box = boxWith(cur, [], MESSAGES_CAP);
    const clock = settleClock(cur, now);
    // ⚔️ Arrivés APRÈS la chute de leur cible : ils ne trouvent plus rien (`supersedeLate`).
    const late = lateAware(cur, clock);
    const partiesIn = late.parties;
    const t0 = settleParties(partiesIn, box, clock, MESSAGES_CAP);
    // 🏥 À l'arrivée d'une SORTIE (point fixe, attaque combinée comprise) : les blessés — et
    // tout le monde si le point est perdu — partent DIRECTEMENT à la base (`splitSorties`).
    // ⚠️ APRÈS `settleParties` : le rapport est déjà bâti sur l'escorte complète (XP,
    // blessures) ; on ne retouche que le voyage. Les voyages rentrés dans ce même tick y
    // passent aussi, pour que leurs blessés ne soient pas renvoyés du point.
    // ⚠️ Dans leur version RACCOURCIE (`shortenWonReturn`) : relus d'avant, un point pris
    // dont toute l'équipe est restée en garnison ressuscitait avec son ancien retour, et la
    // fiche du lieu annonçait « une équipe sur le retour » (signalé sur la forteresse).
    const gone = partiesIn
      .filter((p) => !t0.parties.some((q) => q.id === p.id))
      .map((p) => shortenWonReturn({ ...p, reported: true as const }));
    const sp = splitSorties(cur, [...t0.parties, ...gone], advList.value, clock);
    const t = sp.changed
      ? { ...t0, parties: sp.list.filter((p) => clock < p.returnAt), changed: true }
      : t0;
    if (!t.changed && !late.changed) {
      // ⚔️🏰 Rien d'autre ne bouge : on accorde quand même les places gardées aux voyages (une
      // sortie partie avant la règle reprend la sienne dès qu'elle est libre).
      await persistAwaySync(userId, cur, partiesIn);
      return [];
    }
    const splitGone = sp.changed ? sp.list.filter((p) => clock >= p.returnAt) : gone;
    // ⚔️ UNE INTERCEPTION GAGNÉE LÈVE LE MARQUAGE — ici, à l'instant où la bataille a lieu
    // (le rapport se dépose à l'arrivée sur l'objectif), et NON à l'encaissement : ce n'est
    // pas du butin, c'est une perte évitée. L'adosser au clic ferait perdre le bénéfice
    // d'une victoire à qui oublie d'ouvrir sa boîte — on ne punit pas l'absence.
    // ⚠️ Le marquage SEUL : si l'armée est déjà tirée, elle garde la force que la Tour de
    // guet a annoncée (règle écrite sur `Raid.overflow` : figée au tirage). L'interception
    // agit sur le PROCHAIN siège, et l'écran le dit avant l'envoi.
    const dw = dispelWon(cur.base, t.fresh);
    const base = dw.base;
    // 🎓 L'XP des champions tombe ICI, à l'arrivée du rapport — et l'animation avec.
    const x0 = reportXp(cur, t.messages, t.fresh, sp.advs);
    const x = { ...x0, messages: dw.tag(x0.messages) };
    // 🏰 Un point de contrôle PRIS : l'équipe y reste en garnison (postée, plus « en route »).
    const ctl0 = settleControlAssaults(
      cur,
      t.fresh,
      (x.patch as { adventurers?: Adventurer[] }).adventurers ?? sp.advs,
      activeDays7,
    );
    // 🏰 Les SORTIES rentrées reprennent leur poste sur leur point (`rejoinHome`). Ceux
    // partis à la base (`splitSorties`) n'en font plus partie.
    const ctl = sortiesHome(
      cur,
      splitGone,
      ctl0 ?? {
        map: cur.expedition_map,
        adventurers: (x.patch as { adventurers?: Adventurer[] }).adventurers ?? sp.advs,
      },
      !!ctl0 || sp.changed,
    );
    // ⚠️ `messages` seulement si la boîte a changé (`settleParties` rend la même référence
    // sinon) : au retour seul, réécrire la boîte de ce tick pourrait écraser un encaissement
    // enregistré entre-temps et rendre le butin encaissable deux fois.
    // 🏰 Assaut pris : ceux qui rentrent (champions en trop) suivent le retour raccourci.
    const advsBase =
      ctl?.adventurers ?? (x.patch as { adventurers?: Adventurer[] }).adventurers ?? sp.advs;
    let advsBack = advsBase;
    for (const p of partiesIn) {
      const q = t.parties.find((r) => r.id === p.id);
      if (q && q.returnAt !== p.returnAt)
        advsBack = rescheduleReturners(advsBack, tripCrew(q), p.returnAt, q.returnAt);
    }
    // 🗺️ Un lieu qu'une équipe n'a pas terrassé revient sur la carte DÈS LE RAPPORT, pas au
    // retour en ville — sauf si un autre voyage le vise encore (`restoreUnvanquished`).
    const mapBase = ctl?.map ?? cur.expedition_map;
    const mapRestored = restoreUnvanquished(
      mapBase,
      [...partiesIn, ...(late.expedition ? [late.expedition] : [])],
      clock,
    );
    // ⚔️🏰 Une place gardée n'appartient qu'à qui revient VRAIMENT sur son point : les blessés
    // renvoyés à la base (`splitSorties`) ou postés ailleurs par la mission la libèrent.
    const mapOut = mapRestored && syncAwayOf(cur, mapRestored, t.parties, advsBack);
    await persist(userId, {
      parties: t.parties,
      ...(late.expedition !== cur.expedition ? { expedition: late.expedition } : {}),
      ...(base ? { base } : {}),
      ...(ctl?.map || mapOut !== mapBase ? { expedition_map: mapOut } : {}),
      ...(x.messages !== cur.messages ? { messages: x.messages } : {}),
      // (`box` diffère de `cur.messages` si un encaissement en cours y est marqué : l'écrire
      //  ne fait que le confirmer.)
      ...x.patch,
      ...(ctl ? { adventurers: ctl.adventurers } : {}),
      ...(advsBack !== advsBase ? { adventurers: advsBack } : {}),
    });
    x.play();
    flushIslandFx(row.value?.expedition_map);
    return t.fresh;
  }

  /** ⚔️🏰 La règle des places gardées (`sortieAwayKeeper`) sur l'état courant : les voyages
   *  (groupes + expédition du héros) et les groupes d'attaque combinée déjà partis. */
  function syncAwayOf(
    cur: CharacterRow,
    map: ExpeditionMap,
    parties: readonly ActiveParty[],
    advs: readonly Adventurer[],
  ): ExpeditionMap {
    // 🧝 La place gardée au héros en sortie suit la même règle : seulement là où il revient.
    return syncHeroAway(
      syncAway(
        map,
        [...parties, ...(cur.expedition ? [cur.expedition] : [])],
        attackList.value.flatMap((a) => a.wings),
        advs,
      ),
      heroKeepPostId(
        cur.expedition,
        attackList.value.flatMap((a) => a.wings),
      ),
    );
  }
  /** ⚔️🏰 `syncAwayOf` sur la carte courante, écrite seulement si elle change (ce tick bat
   *  chaque seconde). */
  async function persistAwaySync(
    userId: string,
    cur: CharacterRow,
    parties: readonly ActiveParty[],
  ): Promise<void> {
    const m = cur.expedition_map;
    if (!m) return;
    const synced = syncAwayOf(cur, m, parties, advList.value);
    // 🩹 Un champion présent dans une garnison sans y être posté y est re-posté
    // (`garrisonWithoutPost`) ; PUIS un posté qu'aucun point ne porte redevient libre.
    const repost = garrisonWithoutPost(advList.value, synced);
    const healed = repost.size
      ? advList.value.map((a) => (repost.has(a.id) ? { ...a, posted: repost.get(a.id)! } : a))
      : advList.value;
    const orphans = new Set(orphanPosts(healed, synced, Date.now()));
    if (synced === m && !orphans.size && !repost.size) return;
    if ((orphans.size || repost.size) && !tickMayWrite(cur)) return;
    await persist(userId, {
      ...(synced !== m ? { expedition_map: synced } : {}),
      ...(orphans.size || repost.size
        ? {
            adventurers: healed.map((a) => (orphans.has(a.id) ? { ...a, posted: undefined } : a)),
          }
        : {}),
    });
  }

  /**
   * 🏥 RÉPARTIT les sorties arrivées sur leur lieu (`homeId`, jamais encore réparties) :
   * `baseWalkers` dit qui rentre à la base (blessés, ou tous si le point est perdu),
   * `walkToBase` trace leur trajet direct depuis le lieu, `withoutWalkers` retire ces
   * champions du voyage d'origine. Leur `busyUntil` passe à leur arrivée à la base.
   * ⚠️ Les membres d'un voyage sont ceux dont `busyUntil` vaut son retour : l'escorte d'un
   * groupe d'attaque combinée liste TOUS les groupes.
   */
  function splitSorties(
    cur: CharacterRow,
    list: readonly ActiveParty[],
    advs: Adventurer[],
    now: number,
  ): { list: ActiveParty[]; advs: Adventurer[]; changed: boolean } {
    const map = cur.expedition_map;
    const out: ActiveParty[] = [];
    let roster = advs;
    let changed = false;
    for (const p of list) {
      if (!p.homeId || p.baseSplit || now < p.midAt) {
        out.push(p);
        continue;
      }
      changed = true;
      const members = voyageMembers(p, roster);
      const homeHeld = map?.pois.find((q) => q.id === p.homeId)?.control?.owner === 'player';
      const walkers = baseWalkers(p, members, homeHeld);
      if (!walkers.length) {
        out.push({ ...p, baseSplit: true });
        continue;
      }
      const walk = walkToBase(p, walkers, p.midAt, legToBaseMs(cur, p, walkers, roster));
      const rest = withoutWalkers(p, walkers, members.length - walkers.length);
      if (rest) out.push(rest);
      out.push(walk);
      const set = new Set(walkers);
      roster = roster.map((a) => (set.has(a.id) ? { ...a, busyUntil: walk.returnAt } : a));
    }
    return { list: out, advs: roster, changed };
  }

  /** Les champions d'UN voyage : son groupe, ni postés ni partis par un autre chemin. */
  function voyageMembers(p: ActiveParty, roster: readonly Adventurer[]): string[] {
    return voyageMemberIds(p, roster);
  }

  /** Le trajet lieu de mission → ville de ces champions, à leur pas (la règle d'un groupe). */
  function legToBaseMs(
    cur: CharacterRow,
    p: ActiveParty,
    ids: readonly string[],
    roster: readonly Adventurer[],
  ): number {
    const esc = ids
      .map((id) => roster.find((a) => a.id === id))
      .filter((a): a is Adventurer => !!a);
    return (
      partyLegMin(p.poi, esc, {
        hero: false,
        travelMult:
          travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, Date.now()),
        gearSpeed: advGearRoles(esc, escortKitOf(cur).advGear).speed,
      }) * 60_000
    );
  }

  /**
   * 🔙 Un point TOMBE à `at` alors qu'une de ses sorties est déjà sur le chemin du RETOUR :
   * elle ne marche pas vers un lieu perdu, elle rentre à la base depuis là où elle est
   * (2026-09-29, préconisation validée — même règle que les renforts en route, qui font
   * demi-tour). Une sortie encore à l'aller est répartie à son arrivée (`splitSorties` voit
   * le point perdu). Rend le nombre de champions rerouté.
   */
  function rerouteSorties(
    cur: CharacterRow,
    list: readonly ActiveParty[],
    advs: Adventurer[],
    pointId: string,
    at: number,
  ): { list: ActiveParty[]; advs: Adventurer[]; n: number } {
    let roster = advs;
    let n = 0;
    const out: ActiveParty[] = [];
    for (const q of list) {
      if (q.homeId !== pointId || at < q.midAt || at >= q.returnAt) {
        out.push(q);
        continue;
      }
      const members = voyageMembers(q, roster);
      if (!members.length) {
        out.push(q);
        continue;
      }
      const walk = walkToBase(q, members, at, legToBaseMs(cur, q, members, roster));
      out.push(walk);
      n += members.length;
      const set = new Set(members);
      roster = roster.map((a) => (set.has(a.id) ? { ...a, busyUntil: walk.returnAt } : a));
    }
    return n ? { list: out, advs: roster, n } : { list: [...list], advs, n };
  }

  /**
   * 🏰 Les SORTIES rentrées (`homeId`) : les champions valides reprennent leur poste sur leur
   * point s'il est encore à nous et a de la place (`rejoinHome`) ; les autres — blessés,
   * point perdu ou plein — rentrent À PIED à la base (dessinés sur la carte). Un champion
   * resté en garnison sur un point pris, ou reparti ailleurs entre-temps, n'est pas touché.
   * `null` si aucune sortie n'est rentrée et que rien d'autre n'a changé.
   */
  function sortiesHome(
    cur: CharacterRow,
    returned: readonly ActiveParty[],
    state: { map: ExpeditionMap | null; adventurers: Adventurer[] },
    touched: boolean,
  ): { map: ExpeditionMap | null; adventurers: Adventurer[] } | null {
    let map = state.map;
    let advs = state.adventurers;
    let any = touched;
    for (const p of returned) {
      if (!p.homeId || !map || !p.outcome.party) continue;
      const party = p.outcome.party;
      const sick = new Set([...party.hurt, ...(party.lightHurt ?? [])]);
      // ⚠️ Le groupe de CE voyage (`voyageMemberIds`), jamais toute l'escorte du rapport.
      const ids = new Set(voyageMemberIds(p, advs));
      const mine = advs.filter((a) => ids.has(a.id));
      if (!mine.length) continue;
      any = true;
      // ⚔️🏰 Les blessés (partis à la base) rendent tout de suite la place qu'on leur gardait ;
      // les autres la reprennent dans `rejoinHome`, qui doit encore la VOIR gardée.
      const r = rejoinHome(
        freeAway(
          map,
          p.homeId,
          mine.filter((a) => sick.has(a.id)).map((a) => a.id),
        ),
        p.homeId,
        mine.filter((a) => !sick.has(a.id)).map((a) => a.id),
        p.returnAt,
      );
      map = r.map;
      const back = new Set(r.back);
      const walkers = mine.filter((a) => !back.has(a.id)).map((a) => a.id);
      const home = walkHome({ ...cur, expedition_map: map }, p.homeId, walkers, [], p.returnAt);
      map = home.map(map);
      advs = advs.map((a) =>
        back.has(a.id)
          ? { ...a, posted: p.homeId }
          : walkers.includes(a.id)
            ? { ...a, busyUntil: home.advAt }
            : a,
      );
    }
    return any ? { map, adventurers: advs } : null;
  }

  /** 🏝️ Ce que les assauts d'île viennent d'abattre (ids, ou « pacified ») : annoncé à l'écran
   *  par `flushIslandFx` une fois l'écriture faite. */
  const islandFx: string[] = [];
  /** Les rapports déjà annoncés : on n'annonce jamais deux fois le même. */
  const islandFxSeen = new Set<string>();
  function flushIslandFx(map: ExpeditionMap | null | undefined) {
    const isl = map?.archipel ? islandById(map.archipel.island) : null;
    for (const what of islandFx.splice(0)) {
      if (!isl) continue;
      if (what === 'pacified')
        useGameFx().celebrate({
          kind: 'unlock',
          emoji: '🕊️',
          title: `${isl.name} pacifiée !`,
          subtitle: 'Plus aucune attaque sur tes lieux tenus · la forteresse est à toi',
          rarity: 'divin',
        });
      else if (what === FORTRESS_ID)
        useGameFx().celebrate({
          kind: 'unlock',
          emoji: '🏰',
          title: `${isl.fortress} abattue !`,
          rarity: 'legendary',
        });
      else
        useGameFx().celebrate({
          kind: 'unlock',
          emoji: isl.objectiveEmoji,
          // 🕯️ Île 3 : un objectif battu s'éteint, il se rallumera au fil des sorties.
          title: EMBER.islands.has(isl.id)
            ? `${isl.objective} éteint !`
            : `${isl.objective} pris !`,
          subtitle: EMBER.islands.has(isl.id)
            ? 'Il se rallumera au fil de tes sorties · un pas vers la forteresse'
            : 'Un pas vers la forteresse portuaire',
          rarity: 'epic',
        });
    }
  }
  /** ⚔️ Une autre équipe marche-t-elle encore sur ce lieu (arrivée après `at`) ? */
  function stillMarching(cur: CharacterRow, id: string, at: number): boolean {
    return [...partyList.value, ...(cur.expedition ? [cur.expedition] : [])].some(
      (v) => v.poi.id === id && v.midAt > at,
    );
  }
  /** 🏰 Les rapports frais d'un assaut de point de contrôle : pris → la garnison est postée
   *  (et libérée de sa « route ») ; raté → l'assaut se lève. `null` si aucun. */
  function settleControlAssaults(
    cur: CharacterRow,
    fresh: readonly ExpeditionMessage[],
    roster: Adventurer[],
    activeDays7: number,
  ): { map: ExpeditionMap; adventurers: Adventurer[] } | null {
    let map = cur.expedition_map;
    if (!map) return null;
    let advs = roster;
    let touched = false;
    for (const m of fresh) {
      const id = m.party?.controlId;
      if (!id || m.party?.defense) continue;
      touched = true;
      // 🏯 La citadelle ne se prend pas : gagnée, elle tombe (palier +1, trêve) ; perdue, palier −1.
      if (isCitadelId(id)) {
        map = m.win
          ? razeCitadel(map, id, m.resolvedAt)
          : wearEnemy(
              repelledAtCitadel(map, id, m.resolvedAt),
              id,
              m.party?.dealt,
              m.resolvedAt,
              m.id,
            );
        continue;
      }
      // 🏝️ Un objectif de l'île ou sa forteresse : gagné, il tombe pour toujours (et l'île se
      // pacifie quand tout est tombé) ; perdu, l'assaut se lève.
      if (isIslandTargetId(id)) {
        if (m.win) {
          const wasPacified = map.archipel?.pacifiedAt !== undefined;
          // 🏰 La forteresse se TIENT (2026-10-02) : toute l'équipe y reste, le héros aussi.
          if (id === FORTRESS_ID) {
            map = takeFortress(
              map,
              m.party!.escort,
              !!m.party!.hero,
              m.resolvedAt,
              m.party!.heroUnit,
            );
            const g = new Set(map.pois.find((p) => p.id === id)?.control?.garrison ?? []);
            advs = advs.map((a) => (g.has(a.id) ? { ...a, posted: id, busyUntil: 0 } : a));
          } else if (id === ENDLESS_ID) map = razeIslandTarget(map, id, m.resolvedAt);
          else {
            // 🏳️ Un objectif pris SE TIENT (étape 6 bis) : ceux qu'on a choisis y restent.
            const stay = m.party!.stay?.length ? m.party!.stay : m.party!.escort;
            const heroUnit = m.party!.heroStays ? m.party!.heroUnit : undefined;
            map = takeObjective(map, id, stay, m.resolvedAt, heroUnit);
            const g = new Set(map.pois.find((p) => p.id === id)?.control?.garrison ?? []);
            advs = advs.map((a) => (g.has(a.id) ? { ...a, posted: id, busyUntil: 0 } : a));
          }
          // ⚠️ UNE FOIS par rapport : un tick qui repart d'une ligne pas encore relue (écriture
          // en vol) retraite le même rapport — sans ce garde, le bandeau « pris ! » bouclait.
          if (!islandFxSeen.has(m.id)) {
            islandFxSeen.add(m.id);
            islandFx.push(map.archipel?.pacifiedAt !== undefined && !wasPacified ? 'pacified' : id);
          }
        } else {
          // 🩸 Raté : sa troupe garde la trace du combat.
          map = wearEnemy(map, id, m.party?.dealt, m.resolvedAt, m.id);
          if (!stillMarching(cur, id, m.resolvedAt)) map = markAssault(map, id, false);
        }
        continue;
      }
      if (m.win) {
        // 🏰 Ceux qu'on a choisis pour rester (sinon l'escorte), coupés aux places du point :
        // on relit la garnison POSÉE, sinon un champion en trop serait « posté » hors garnison.
        const stay = m.party!.stay?.length ? m.party!.stay : m.party!.escort;
        // 🧝 Le héros qui y reste, avec son instantané (étape 6 bis).
        const heroUnit = m.party!.heroStays ? m.party!.heroUnit : undefined;
        map = captureControl(map, id, stay, m.resolvedAt, activeDays7, heroUnit);
        const g = new Set(map.pois.find((p) => p.id === id)?.control?.garrison ?? []);
        advs = advs.map((a) => (g.has(a.id) ? { ...a, posted: id, busyUntil: 0 } : a));
      } else {
        // 🩸 Raté : sa troupe garde la trace du combat.
        map = wearEnemy(map, id, m.party?.dealt, m.resolvedAt, m.id);
        if (!stillMarching(cur, id, m.resolvedAt)) map = markAssault(map, id, false);
      }
    }
    return touched ? { map, adventurers: advs } : null;
  }

  /**
   * 🏚️ LES ÎLES ABANDONNÉES SE FONT REPRENDRE (2026-10-13, décision de l'utilisateur : « l'île
   * quittée se refait prendre par l'ennemi petit à petit ; on laisse les miliciens, qui seront
   * tués petit à petit »). Les reprises dues d'une île quittée en reculant se jouent comme sur
   * l'île active, mais seuls les MILICIENS restés défendent (tous les champions ont suivi le
   * héros). Ce que le lieu a produit jusqu'à l'attaque part avant le combat. Tenu : les
   * miliciens tombés sont retirés et une nouvelle attaque se prépare ; perdu : le lieu revient
   * à l'ennemi. `null` si rien n'est dû (l'appelant n'écrit pas à vide).
   */
  function abandonedRetakes(
    cur: CharacterRow,
    now: number,
    heroLevel: number,
    activeDays7: number,
  ): { patch: Partial<CharacterRow>; msgs: ExpeditionMessage[] } | null {
    const root = cur.expedition_map;
    if (!root) return null;
    if (!root.islands) return null;
    const islands0 = root.islands;
    let islands = islands0;
    const msgs: ExpeditionMessage[] = [];
    let runes = 0;
    let blessed = 0;
    let exalted = 0;
    let keys = 0;
    let summon = 0;
    let gearSeals = 0;
    const champSeals: [number, number][] = [];
    const forged: ForgedSkill[] = [];
    for (const k of abandonedIslandKeys(root)) {
      let map = holdGrace(redirectIslandAttacks(islands[k]!, now), now);
      const due = dueRetakes(map, now);
      if (!due.length) {
        if (map !== islands[k]) islands = { ...islands, [k]: map };
        continue;
      }
      const lvl = mapPlayerLevel(map, heroLevel);
      const isl = islandById(Number(k));
      for (const p of due) {
        const at = p.control!.attackAt!;
        const h = harvestControlIn(map, advList.value, cur.adv_gear?.stock ?? [], p.id, at, lvl);
        map = h.map;
        forged.push(...h.forged);
        runes += h.runes;
        blessed += h.blessedRunes;
        exalted += h.exaltedRunes;
        keys += h.keys;
        summon += h.summon;
        gearSeals += h.gearSeals;
        if (h.champSeals) champSeals.push([h.champSealRank, h.champSeals]);
        const militia = militiaUnits(p.control!.garrison, lvl);
        const { foe, force } = retakeBattle(map, p, militia, lvl, fortify(cur, heroLevel));
        const seed = (at ^ (foe.level * 2654435761)) >>> 0 || 1;
        const kit = escortKitOf(cur);
        const o = militia.length
          ? resolveCamp({
              poi: foe,
              spec: force,
              escort: [],
              road: kit,
              hero: null,
              seed,
              playerLevel: lvl,
              pantheonLevel: pantheonLevel.value,
              heroLevel,
              militia,
            })
          : null;
        const held = !!o?.win;
        const where = isl ? ` (${isl.emoji} ${isl.name})` : ` (île ${k})`;
        const label = CONTROL_LABEL[p.control!.kind] + where;
        const emo = FACTION_EMOJI[force.faction];
        const msg: ExpeditionMessage = {
          ...buildMessage({
            poi: foe,
            sentAt: at,
            midAt: at,
            returnAt: at,
            seed,
            outcome: {
              ...(o ?? {
                win: false,
                gold: 0,
                energy: 0,
                summonStones: 0,
                mana: 0,
                item: null,
                items: [],
                key: 0,
                text: '',
              }),
              gold: (o?.gold ?? 0) + h.gold,
              mana: (o?.mana ?? 0) + h.mana,
              supplies: addSupplies(o?.supplies ?? {}, h.supplies),
            },
          } as ActiveExpedition),
          id: controlAttackReportId(p.id, at),
          title: held ? `🏰 ${label} : attaque repoussée` : `🏰 ${label} reprise par l’ennemi`,
          text: held
            ? `${emo} Tes miliciens ont tenu l’île abandonnée.${militiaLostLabel(o?.party?.militiaLost)} Une nouvelle attaque se prépare.`
            : militia.length
              ? `${emo} L’ennemi a repris le lieu sur l’île abandonnée.${militiaLostLabel(o?.party?.militiaLost)}${wearSettleLabel(o?.party?.dealt, p.control)}`
              : `${emo} L’ennemi a repris le lieu, laissé sans défense sur l’île abandonnée.`,
          ...(o?.party ? { party: { ...o.party, controlId: p.id, defense: true } } : {}),
        };
        msgs.push(msg);
        const dead = o?.party?.militiaLost ?? [];
        if (held && dead.length) map = releaseFromControl(map, p.id, dead, at, lvl);
        map = held
          ? holdControl(map, p.id, at, activeDays7)
          : regainIslandTarget(
              loseControl(map, p.id, lvl, at, {
                level: foe.level,
                faction: force.faction,
                dealt: o?.party?.dealt ?? 0,
                hitId: msg.id,
              }),
              p.id,
            );
        map = withLastAttack(map, p.id, msg);
      }
      islands = { ...islands, [k]: map };
    }
    if (islands === islands0) return null;
    return {
      msgs,
      patch: {
        expedition_map: { ...root, islands },
        ...(msgs.length ? { messages: boxWith(cur, msgs, MESSAGES_CAP) } : {}),
        ...(runes || forged.length
          ? { runes: addForgedSkills(addRuneCount(cur.runes, runes, blessed, exalted), forged) }
          : {}),
        ...(keys ? { keys: cur.keys + keys } : {}),
        ...(summon ? { summon_stones: (cur.summon_stones ?? 0) + summon } : {}),
        ...(gearSeals || champSeals.length
          ? { seals: withControlSeals(cur.seals, gearSeals, champSeals) }
          : {}),
      },
    };
  }

  /**
   * 🏰 LES REPRISES ENNEMIES — à l'instant tiré (`attackAt`), que l'app soit ouverte ou non.
   * La garnison livre le combat d'un camp contre une troupe de force ALÉATOIRE : repoussée,
   * elle gagne son XP et une nouvelle attaque se prépare ; vainqueur, l'ennemi reprend le
   * lieu (rang re-tiré) et la garnison part à l'infirmerie. Le rapport arrive dans la boîte
   * 📬, avec l'animation d'XP. ⚠️ Rend les messages déposés (pour les notifier à l'écran).
   */
  async function controlTick(
    userId: string,
    now: number,
    playerLevel: number,
    activeDays7: number,
  ): Promise<{ attacks: ExpeditionMessage[]; notices: string[] }> {
    const none = { attacks: [], notices: [] };
    const cur = row.value;
    if (!cur?.expedition_map) return none;
    knownActiveDays7 = activeDays7;
    // 🧱🏹 L'enceinte se mesure au niveau du HÉROS (le sport), pas au plafond de l'île.
    const heroLevel = playerLevel;
    // 🏝️ Les assaillants d'une île ne dépassent pas son rang max (le tirage lit ce niveau).
    playerLevel = mapPlayerLevel(cur.expedition_map, playerLevel);
    // 🏠 Les retours ARRIVÉS d'abord, dans leur propre écriture : la suite (renforts,
    // reprises) se fera au tick suivant, sur l'état relu.
    const home = settleHome(cur, now);
    if (home) {
      if (tickMayWrite(cur)) await persist(userId, home);
      return none;
    }
    // 🏚️ Les îles ABANDONNÉES (quittées en reculant) se font reprendre petit à petit, dans
    // leur propre écriture.
    const lost = abandonedRetakes(cur, now, heroLevel, activeDays7);
    if (lost) {
      if (tickMayWrite(cur)) await persist(userId, lost.patch);
      return { attacks: lost.msgs, notices: [] };
    }
    // 🏰 Les renforts ARRIVÉS rejoignent d'abord leur garnison (ceux arrivés avant l'attaque
    // combattent avec elle, les autres non).
    // 🛡️ Un milicien délogé par un champion qui reprend sa place rentre à pied : le trajet de
    // `sendMilitiaToControl`, à l'envers.
    const milMult = travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now);
    const settled0 = settleReinforcements(
      cur.expedition_map,
      now,
      playerLevel,
      (p) => caravanLegMin(p, [], 0, milMult) * 60_000,
    );
    // 📬 Les miliciens que l'arrivée renvoie à la base (délogés, sans place, lieu ennemi)
    // laissent un mot dans la boîte : sans lui, on les retrouve à la base sans savoir pourquoi.
    const sentBack = militiaSentBackMessages(cur.expedition_map, settled0);
    if (sentBack.length) {
      if (tickMayWrite(cur))
        await persist(userId, {
          expedition_map: settled0,
          messages: boxWith(cur, sentBack, MESSAGES_CAP),
        });
      return none;
    }
    // 🛡️ LA RELÈVE : les miliciens tombés en défendant un point tenu sont remplacés d'eux-mêmes,
    // dès que la Caserne en a à la base — même trajet qu'un envoi manuel.
    const relief = cur.base
      ? militiaRelief(
          settled0,
          cur.base.militia ?? emptyMilitia(now),
          now,
          (p) => caravanLegMin(p, [], 0, milMult) * 60_000,
        )
      : null;
    if (relief && cur.base) {
      if (tickMayWrite(cur))
        await persist(userId, {
          expedition_map: relief.map,
          base: { ...cur.base, militia: relief.militia },
        });
      return none;
    }
    // ⚔️🗼 Les chocs en rase campagne contre les armées de REPRISE, AVANT les reprises : une
    // armée amputée arrive amputée, une armée battue n'arrive pas (la reprise est repoussée).
    let settled = settled0;
    for (const p of settled0.pois) {
      if (p.control?.owner !== 'player' || p.control.attackAt === undefined) continue;
      for (const { hit, at } of pendingFieldHits(
        fieldVoyages(cur),
        'retake',
        p.id,
        cur.messages ?? [],
      )) {
        if (at > now) continue;
        settled = applyFieldHitToMap(
          settled,
          hit,
          at,
          at + retakeCalmMs(p.id, at, attackSlow(settled, p.control.kind)),
        ).map;
      }
    }
    // 🎯 Sur une île, la forteresse vise d'abord les objectifs qu'on lui a pris.
    // 🕊️ Puis les trêves des lieux fraîchement pris : le report ne passe pas au travers.
    settled = holdGrace(redirectIslandAttacks(settled, now), now);
    const due = dueRetakes(settled, now);
    if (!due.length) {
      if (settled !== cur.expedition_map) {
        if (tickMayWrite(cur)) await persist(userId, { expedition_map: settled });
        return none;
      }
      // 🏰 Rien d'autre à régler : ce que les points tenus ont produit est versé tout seul.
      return { attacks: [], notices: await autoCollectControls(userId, now, playerLevel) };
    }
    let map = settled;
    let advs = advList.value;
    // 🤕 Un héros posté et délogé rentre BLESSÉ : convalescence dès son arrivée à la base.
    let heroWound: { until: number } | null = null;
    const stock0 = cur.adv_gear?.stock ?? [];
    let gearStock = stock0;
    const msgs: ExpeditionMessage[] = [];
    let runesIn = 0;
    let blessedIn = 0;
    let exaltedIn = 0;
    let keysIn = 0;
    let summonIn = 0;
    let gearSealsIn = 0;
    const champSealsIn: [number, number][] = [];
    const forgedIn: ForgedSkill[] = [];
    // 🔙 Les sorties en retour vers un point qui tombe rentrent à la base (`rerouteSorties`).
    let parties: ActiveParty[] = [...partyList.value];
    let partiesMoved = false;
    for (const p of due) {
      const at = p.control!.attackAt!;
      const ids = new Set(p.control!.garrison);
      // 🎲 Les assaillants ont LEUR rang, tiré à chaque attaque ; s'ils l'emportent, le lieu
      // le garde (un point tenu, lui, est neutre : il produit au niveau du héros).
      // ⛏️🎯🌿 Ce que le point a produit jusqu'à l'attaque part AVANT le combat, même s'il
      // est perdu : on ne punit pas l'absence en confisquant ce qui était déjà sorti.
      const h = harvestControlIn(map, advs, gearStock, p.id, at, playerLevel);
      map = h.map;
      advs = h.advs;
      gearStock = h.stock;
      forgedIn.push(...h.forged);
      runesIn += h.runes;
      blessedIn += h.blessedRunes;
      exaltedIn += h.exaltedRunes;
      keysIn += h.keys;
      summonIn += h.summon;
      gearSealsIn += h.gearSeals;
      if (h.champSeals) champSealsIn.push([h.champSealRank, h.champSeals]);
      // 🛡️ CHAMPIONS, HÉROS ET MILICIENS DÉFENDENT ENSEMBLE (2026-10-12, décision de
      // l'utilisateur ; `controlAllies`), le lapidaire aussi depuis la v1.254.0.
      const posted = advs.filter((a) => ids.has(a.id));
      const escort = posted;
      const militia = militiaUnits(p.control!.garrison, playerLevel);
      // 🎲 Suspense : face à une garnison qui tiendrait plus de `CONTROL.maxHold`, l'ennemi
      // envoie plus de monde — la MÊME règle que ce que l'écran annonce (`garrisonHold`).
      const kit = escortKitOf(cur);
      // ⚔️🗼 Ce que les attaques en rase campagne ont abattu n'arrive pas. ⚠️ `retakeBattle`
      // est aussi ce que l'écran annonce (`controlAttackHold`) : ils ne peuvent pas diverger.
      // 🧝 Le héros posté défend avec eux (son instantané figé à son départ).
      const heroUnit = p.control!.hero ? (p.control!.heroUnit ?? null) : null;
      const { foe, force } = retakeBattle(
        map,
        p,
        [...partyAllies(escort, kit, heroUnit), ...militia],
        playerLevel,
        // 🧱🏹 L'enceinte de la base renforce toutes les garnisons (`fortifyMult`).
        fortify(cur, heroLevel),
      );
      const seed = (at ^ (foe.level * 2654435761)) >>> 0 || 1;
      const o =
        escort.length || militia.length || heroUnit
          ? resolveCamp({
              poi: foe,
              spec: force,
              escort,
              road: kit,
              hero: heroUnit,
              seed,
              playerLevel,
              pantheonLevel: pantheonLevel.value,
              heroLevel,
              militia,
            })
          : null;
      const held = !!o?.win;
      // 🔙 Perdu : les renforts encore en route font demi-tour (ni combat ni infirmerie).
      const back = held ? [] : turnBackReinforcements(p.control!, at);
      const rr = held ? null : rerouteSorties(cur, parties, advs, p.id, at);
      if (rr?.n) {
        parties = rr.list;
        advs = rr.advs;
        partiesMoved = true;
      }
      const stock = h.gold;
      const emo = FACTION_EMOJI[force.faction];
      const label = CONTROL_LABEL[p.control!.kind];
      const msg: ExpeditionMessage = {
        ...buildMessage({
          poi: foe,
          sentAt: at,
          midAt: at,
          returnAt: at,
          seed,
          outcome: {
            ...(o ?? {
              win: false,
              gold: 0,
              energy: 0,
              summonStones: 0,
              mana: 0,
              item: null,
              items: [],
              key: 0,
              text: '',
            }),
            gold: (o?.gold ?? 0) + stock,
            // ⛲ Le mana produit avant l'attaque part avec le rapport, comme l'or de la mine.
            mana: (o?.mana ?? 0) + h.mana,
            supplies: addSupplies(o?.supplies ?? {}, h.supplies),
          },
        } as ActiveExpedition),
        id: controlAttackReportId(p.id, at),
        title: held ? `🏰 ${label} : attaque repoussée` : `🏰 ${label} reprise par l’ennemi`,
        text:
          (held
            ? `${emo} Ta garnison a tenu.${militiaLostLabel(o?.party?.militiaLost)}${o?.party?.militiaLost?.length ? ' 🛡️ La relève partira de la base dès qu’un milicien y sera prêt.' : ''}${lightHurtLabel(o?.party?.lightHurt)} Une nouvelle attaque se prépare.`
            : escort.length
              ? `${emo} L’ennemi a repris le lieu — ta garnison part à l’infirmerie.${militiaLostLabel(o?.party?.militiaLost)}${wearSettleLabel(o?.party?.dealt, p.control)}`
              : militia.length
                ? `${emo} L’ennemi a repris le lieu.${militiaLostLabel(o?.party?.militiaLost)}${wearSettleLabel(o?.party?.dealt, p.control)}`
                : `${emo} L’ennemi a repris le lieu, laissé sans personne pour le défendre.`) +
          turnBackLabel(back.length) +
          sortieHomeLabel(rr?.n ?? 0) +
          tierLostLabel(held ? 0 : controlTier(p.control, at)),
        ...(o?.party ? { party: { ...o.party, controlId: p.id, defense: true } } : {}),
      };
      msgs.push(msg);
      // 🛡️ Tenu : les miliciens tombés sont retirés de la garnison. Vaincu : ceux encore EN
      // ROUTE font demi-tour avec les champions (`loseControl` note leur trajet retour, et
      // `settleReturns` les rend à la base à leur arrivée — plus en un instant).
      const dead = o?.party?.militiaLost ?? [];
      // 🛡️ Leur relève se lit ensuite dans le rapport gardé sur le lieu (`militiaRelief`).
      if (held && dead.length) map = releaseFromControl(map, p.id, dead, at, playerLevel);
      // 🧝 Délogé, le héros posté rentre à pied à la base (le trajet d'un rappel). BLESSÉ
      // seulement s'il a COMBATTU (partout sauf au lapidaire) — sinon il rentre indemne. L'infirmerie commence à son arrivée.
      if (!held && p.control!.hero) {
        const leg = heroHomeLegMin(cur, map, p, at);
        map = recallPostedHero(map, at, leg);
        if (heroUnit) {
          const b = baseOf(cur, now);
          heroWound =
            heroWoundAfter(
              at + Math.max(0, Math.round(leg)) * 60_000,
              woundMsFor(defenseLevel(b.defenses, 'infirmary'), raidIntervalMs(activeDays7)),
              heroWound ?? b.wound,
              now,
            ) ?? heroWound;
        }
      }
      map = held
        ? holdControl(map, p.id, at, activeDays7)
        : regainIslandTarget(
            loseControl(map, p.id, playerLevel, at, {
              level: foe.level,
              faction: force.faction,
              // 🩸 L'ennemi s'installe USÉ de ce que la bataille lui a retiré.
              dealt: o?.party?.dealt ?? 0,
              hitId: msg.id,
            }),
            p.id,
          );
      // 🏠 Délogée, la garnison RENTRE À PIED à la base (le trajet d'un rappel) : elle est en
      // route jusqu'à son arrivée, et c'est là, à l'infirmerie, que ses soins commencent
      // (`partyClaimRoster` part de `busyUntil`). Les miliciens engagés sont morts.
      const walkers = held ? [] : posted.map((a) => a.id);
      const home = walkers.length ? walkHome(cur, p.id, walkers, [], at) : null;
      if (home) map = home.map(map);
      // 📜 Le rapport reste lisible sur la fiche du lieu, même quand la boîte l'a oublié.
      map = withLastAttack(map, p.id, msg);
      const homeAt = new Map(walkers.map((id) => [id, home!.advAt]));
      // ⚔️🗼 L'armée est passée : ses pertes en campagne ne valent que pour elle.
      map = {
        ...map,
        pois: map.pois.map((q) => {
          if (q.id !== p.id || !q.control) return q;
          if (q.control.retakeCut === undefined && q.control.fieldHits === undefined) return q;
          const control = { ...q.control };
          delete control.retakeCut;
          delete control.fieldHits;
          return { ...q, control };
        }),
      };
      // ⚠️ Perdu : TOUS ceux postés ici sont libérés — la garnison ET les renforts encore en
      // route. Seule la garnison, qui a combattu, part à l'infirmerie ; les renforts restent
      // occupés jusqu'à leur retour (le chemin déjà parcouru, refait dans l'autre sens).
      const backAt = new Map([...back.map((r) => [r.id, r.at] as const), ...homeAt]);
      advs = advs.map((a) =>
        !held && a.posted === p.id
          ? {
              ...a,
              posted: undefined,
              ...(backAt.has(a.id) ? { busyUntil: backAt.get(a.id)! } : {}),
            }
          : a,
      );
    }
    const box = boxWith(cur, msgs, MESSAGES_CAP);
    // ⚠️ `advs` et non l'état : il porte l'XP du camp d'entraînement récoltée avant l'attaque.
    const x = reportXp(cur, box, msgs, advs);
    const rosterXp = (x.patch as { adventurers?: Adventurer[] }).adventurers ?? advs;
    let roster = rosterXp;
    // Les postés libérés ET l'XP : on repart de l'XP versée et on retire les postes perdus.
    const freed = new Set(advs.filter((a) => !a.posted).map((a) => a.id));
    roster = roster.map((a) => (freed.has(a.id) ? { ...a, posted: undefined } : a));
    // 🤕 La garnison vaincue est blessée TOUT DE SUITE, mais ses soins ne courent qu'à son
    // ARRIVÉE à la base (`busyUntil`, posé plus haut) : l'infirmerie est à la base.
    // L'encaissement refera le même calcul, et `Math.max` le rend idempotent.
    // 🩹 Victoire serrée : les blessés LÉGERS (`lightHurt`) y passent aussi, sans XP en double.
    for (const m of msgs)
      if (m.party && (!m.win || m.party.lightHurt?.length))
        roster = partyClaimRoster(m.party, roster, {
          pantheonLevel: pantheonLevel.value,
          // ⚠️ Ici `heroLevel` est le niveau du joueur passé au tick (un nombre).
          heroLevel,
          infirmaryLevel: defenseLevel(cur.base?.defenses ?? [], 'infirmary'),
          backAt: m.resolvedAt,
          now,
          xpGranted: true,
          // 🕯️ L'hospice tel qu'il est APRÈS l'attaque (perdu, il ne soigne plus).
          healMult: hospiceHealMult(map),
        }).adventurers;
    // 🗡️ L'ÉQUIPEMENT, en UN seul calcul : le bonus du camp versé avant l'attaque, puis tout
    // ce que les champions ont appris depuis l'état de départ — la récolte du camp ET l'XP
    // du rapport. ⚠️ Sur le stock déjà entraîné : le patch du rapport, bâti sur l'ancien
    // stock, effacerait le bonus du camp.
    const gearNext = trainWornGear(advList.value, rosterXp, gearStock);
    const forged =
      gearNext !== stock0 ? { adv_gear: { ...(cur.adv_gear ?? {}), stock: gearNext } } : {};
    // Calculé sur un état qu'une écriture en vol a peut-être changé : on rejouera au tick
    // suivant (la reprise est déterministe, rien n'est perdu à attendre une seconde).
    if (!tickMayWrite(cur)) return none;
    await persist(userId, {
      expedition_map: map,
      messages: x.messages,
      ...x.patch,
      ...forged,
      ...(heroWound ? { base: { ...baseOf(cur, now), wound: heroWound } } : {}),
      ...(partiesMoved ? { parties } : {}),
      // 📜 Ce que le Scriptorium a recopié avant l'attaque est acquis, même s'il tombe.
      ...(runesIn || forgedIn.length
        ? {
            runes: addForgedSkills(
              addRuneCount(cur.runes, runesIn, blessedIn, exaltedIn),
              forgedIn,
            ),
          }
        : {}),
      // 📖 Les clés des archives, de même.
      ...(keysIn ? { keys: cur.keys + keysIn } : {}),
      // ⚱️ Les pierres de l'ossuaire, de même.
      ...(summonIn ? { summon_stones: (cur.summon_stones ?? 0) + summonIn } : {}),
      // ⚒️ Les sceaux de l'arsenal, de même.
      // 🗿 Et ceux de l'autel des runes.
      ...(gearSealsIn || champSealsIn.length
        ? { seals: withControlSeals(cur.seals, gearSealsIn, champSealsIn) }
        : {}),
      adventurers: roster,
    });
    x.play();
    return { attacks: msgs, notices: [] };
  }

  /**
   * 🏰 Ce qu'un point a produit, APPLIQUÉ au vivier : l'or et les consommables à créditer,
   * et l'XP du camp d'entraînement déjà versée à la garnison — BORNÉE par `trainingRoom`
   * (le ★5 du rang sous le héros). ⚠️ Pur vis-à-vis du store : rend la carte et le vivier.
   */
  function harvestControlIn(
    map: ExpeditionMap,
    advs: Adventurer[],
    stock: AdvGear[],
    id: string,
    at: number,
    heroLevel: number,
  ): {
    map: ExpeditionMap;
    advs: Adventurer[];
    stock: AdvGear[];
    gold: number;
    mana: number;
    supplies: SupplyStock;
    runes: number;
    blessedRunes: number;
    exaltedRunes: number;
    keys: number;
    summon: number;
    gearSeals: number;
    champSeals: number;
    champSealRank: number;
    /** 💎 Les compétences vertes Nv 5 sorties du lapidaire (`addForgedSkills`). */
    forged: ForgedSkill[];
  } {
    const p = map.pois.find((x) => x.id === id);
    // 🏝️ En mode archipel, un lieu tenu produit au RANG DE SON ÎLE, plus au niveau du héros.
    const c = collectControl(map, id, at, mapPlayerLevel(map, heroLevel));
    // ⚒️ Le camp verse AUSSI son XP aux PIÈCES portées — chacun la SIENNE, selon le temps
    // qu'il a passé sur place, même quand le champion bute sur son plafond.
    const nextStock = campGear(stock, advs, c.gearXp);
    const forged = c.forged ?? [];
    if (!p?.control || !Object.keys(c.xpBy).length)
      return {
        map: c.map,
        advs,
        stock: nextStock,
        gold: c.gold,
        mana: c.mana,
        supplies: c.supplies,
        runes: c.runes,
        blessedRunes: c.blessedRunes,
        exaltedRunes: c.exaltedRunes,
        keys: c.keys,
        summon: c.summon,
        gearSeals: c.gearSeals,
        champSeals: c.champSeals,
        champSealRank: c.champSealRank,
        forged,
      };
    // 🎯 Le camp : chacun reçoit SA réserve, selon le temps qu'il a passé sur place (un renfort
    // arrivé tard n'a pas l'XP des autres) — un champion ramené reçoit ce qu'il avait gagné.
    const next = advs.map((a) => {
      // 🎯 Avec la prime de rattrapage des missions (`campXpFor`) : sans elle, le camp ne
      // valait rien pour les champions en retard, les seuls qu'il accueille.
      const xp = campXpFor(a, c.xpBy[a.id] ?? 0, pantheonLevel.value);
      return xp > 0
        ? grantAdvXp(
            a,
            Math.min(xp, trainingRoom(a, heroLevel, pantheonLevel.value)),
            pantheonLevel.value,
            heroLevel,
          )
        : a;
    });
    return {
      map: c.map,
      advs: next,
      stock: nextStock,
      gold: c.gold,
      mana: c.mana,
      supplies: c.supplies,
      runes: c.runes,
      blessedRunes: c.blessedRunes,
      exaltedRunes: c.exaltedRunes,
      keys: c.keys,
      summon: c.summon,
      gearSeals: c.gearSeals,
      champSeals: c.champSeals,
      champSealRank: c.champSealRank,
      forged,
    };
  }

  /** ⚒️🗿 Ajoute les sceaux des lieux tenus (arsenal : d'objet ; autel : de champion, par rang). */
  function withControlSeals(s: Seals, gear: number, champ: [number, number][]): Seals {
    let out = gear ? addSeals(s, 'gear', 0, gear) : s;
    for (const [rank, n] of champ) out = addSeals(out, 'champion', rank, n);
    return out;
  }

  /**
   * 🏰 LA PRODUCTION DES POINTS TENUS EST VERSÉE TOUTE SEULE (2026-09-29, demandé : plus de
   * réserve à récolter). Un passage par point et par minute au plus (`autoCollectable`) :
   * l'or et le mana au joueur, l'XP aux champions de la garnison et à leurs pièces, les
   * consommables et les runes au stock — en UNE écriture pour tous les points. Silencieux,
   * sauf ce qui mérite qu'on le sache : un consommable, une rune, ou un champion (ou une de
   * ses pièces) qui devient prêt pour l'ascension — un bandeau ET un rapport dans la boîte.
   */
  async function autoCollectControls(
    userId: string,
    now: number,
    playerLevel: number,
  ): Promise<string[]> {
    const cur = row.value;
    if (!cur?.expedition_map) return [];
    // ⛵ Les îles QUITTÉES produisent aussi : récoltées à distance (décision de l'utilisateur).
    const stashed = Object.entries(cur.expedition_map.islands ?? {});
    const points = autoCollectable(cur.expedition_map, now);
    if (!points.length && !stashed.some(([, m]) => autoCollectable(m, now).length)) return [];
    const before = advList.value;
    const stock0 = cur.adv_gear?.stock ?? [];
    let map = cur.expedition_map;
    let advs = before;
    let stock = stock0;
    let gold = 0;
    let mana = 0;
    let supplies: SupplyStock = {};
    let runes = 0;
    let blessed = 0;
    let exalted = 0;
    let keys = 0;
    let summon = 0;
    let gearSeals = 0;
    const champSeals: [number, number][] = [];
    const msgs: ExpeditionMessage[] = [];
    const forgedAll: ForgedSkill[] = [];
    /** Récolte tous les points dus d'UNE carte (l'active ou une île rangée). */
    const harvestAll = (m0: ExpeditionMap): ExpeditionMap => {
      let m = m0;
      for (const p of autoCollectable(m0, now)) {
        const since = p.control?.collectedAt ?? now;
        const h = harvestControlIn(m, advs, stock, p.id, now, playerLevel);
        if (h.map === m) continue;
        // ⛏️ L'or d'une absence se dit (`controlGoldMessage`) ; celui de chaque minute, non.
        const goldMsg = controlGoldMessage(p, now, h.gold, since);
        if (goldMsg) msgs.push(goldMsg);
        m = h.map;
        advs = h.advs;
        stock = h.stock;
        forgedAll.push(...h.forged);
        gold += h.gold;
        mana += h.mana;
        supplies = addSupplies(supplies, h.supplies);
        runes += h.runes;
        blessed += h.blessedRunes;
        exalted += h.exaltedRunes;
        keys += h.keys;
        summon += h.summon;
        gearSeals += h.gearSeals;
        if (h.champSeals) champSeals.push([h.champSealRank, h.champSeals]);
        const msg = controlLootMessage(
          p,
          now,
          h.supplies,
          h.runes,
          h.keys,
          h.summon,
          h.gearSeals,
          h.champSeals,
        );
        if (msg) msgs.push(msg);
      }
      return m;
    };
    map = harvestAll(map);
    let islands = map.islands;
    for (const [k, im] of stashed) {
      const next = harvestAll(im);
      if (next !== im) islands = { ...islands, [k]: next };
    }
    if (islands !== map.islands) map = { ...map, islands };
    if (map === cur.expedition_map) return [];
    const gearNext = trainWornGear(before, advs, stock);
    const found = newAscensions(before, advs, stock0, gearNext);
    const owners = new Map<string, string>();
    for (const [aid, list] of wornGear(advs, gearNext))
      for (const g of list) owners.set(g.id, advs.find((a) => a.id === aid)?.name ?? '');
    const asc = ascensionMessage(now, found, owners);
    if (asc) msgs.push(asc);
    if (!tickMayWrite(cur)) return [];
    const nSup = Object.values(supplies).reduce((n, x) => n + (x ?? 0), 0);
    await persist(userId, {
      expedition_map: map,
      ...(gold > 0 ? { gold: cur.gold + gold } : {}),
      ...(mana > 0 ? { mana: cur.mana + mana } : {}),
      ...(nSup ? { supplies: addSupplies(cur.supplies, supplies) } : {}),
      ...(runes || forgedAll.length
        ? { runes: addForgedSkills(addRuneCount(cur.runes, runes, blessed, exalted), forgedAll) }
        : {}),
      ...(keys ? { keys: cur.keys + keys } : {}),
      ...(summon ? { summon_stones: (cur.summon_stones ?? 0) + summon } : {}),
      ...(gearSeals || champSeals.length
        ? { seals: withControlSeals(cur.seals, gearSeals, champSeals) }
        : {}),
      ...(gearNext !== stock0 ? { adv_gear: { ...(cur.adv_gear ?? {}), stock: gearNext } } : {}),
      ...(advs !== before ? { adventurers: advs } : {}),
      ...(msgs.length ? { messages: boxWith(cur, msgs, MESSAGES_CAP) } : {}),
    });
    // 🔔 L'écran les notifie comme les attaques (`$q.notify`), pas le store.
    return msgs.map(controlNoticeText);
  }

  /** 🏰 Récolte ce qu'un point de contrôle tenu a produit (or, XP, consommables). */
  async function collectControlPoint(
    userId: string,
    id: string,
    now: number,
    playerLevel: number,
  ): Promise<{ gold: number; mana: number; supplies: SupplyStock; runes: number } | null> {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map) return null;
    const before = advList.value;
    const stock0 = cur.adv_gear?.stock ?? [];
    const h = harvestControlIn(cur.expedition_map, before, stock0, id, now, playerLevel);
    if (h.map === cur.expedition_map) return null;
    // ⚒️ Les pièces : le bonus du camp (`campGear`, déjà dans `h.stock`), PUIS ce que l'XP de
    // leur porteur leur apprend — dans cet ordre, sur le stock déjà entraîné.
    const gearNext = trainWornGear(before, h.advs, h.stock);
    const gearPatch =
      gearNext !== stock0 ? { adv_gear: { ...(cur.adv_gear ?? {}), stock: gearNext } } : {};
    const tracks = gearAwareTracks(cur, before, h.advs, gearPatch);
    const nSup = Object.values(h.supplies).reduce((s, n) => s + (n ?? 0), 0);
    await persist(userId, {
      expedition_map: h.map,
      ...(h.gold > 0 ? { gold: cur.gold + h.gold } : {}),
      ...(h.mana > 0 ? { mana: cur.mana + h.mana } : {}),
      ...(nSup ? { supplies: addSupplies(cur.supplies, h.supplies) } : {}),
      ...(h.runes || h.forged.length
        ? {
            runes: addForgedSkills(
              addRuneCount(cur.runes, h.runes, h.blessedRunes, h.exaltedRunes),
              h.forged,
            ),
          }
        : {}),
      ...(h.keys ? { keys: cur.keys + h.keys } : {}),
      ...(h.summon ? { summon_stones: (cur.summon_stones ?? 0) + h.summon } : {}),
      ...(h.gearSeals || h.champSeals
        ? {
            seals: withControlSeals(
              cur.seals,
              h.gearSeals,
              h.champSeals ? [[h.champSealRank, h.champSeals]] : [],
            ),
          }
        : {}),
      // ⚠️ `gearPatch` TOUJOURS : un champion au plafond ne bouge pas, ses pièces si — le
      // réserver au cas « vivier changé » (v0.1249) ne sauvegardait jamais leur XP.
      ...gearPatch,
      ...(h.advs !== before ? { adventurers: h.advs } : {}),
    });
    if (h.gold > 0) goldFx.gain(h.gold);
    if (h.advs !== before) useAdvXpFx().show(tracks, 'Camp d’entraînement');
    // Champions au plafond : seules leurs pièces ont appris, on les montre quand même.
    else if (gearNext !== stock0)
      useAdvXpFx().show(withGearTracks([], stock0, gearNext, h.advs), 'Camp d’entraînement');
    return { gold: h.gold, mana: h.mana, supplies: h.supplies, runes: h.runes };
  }

  /** 🏰 Rappelle TOUTE la garnison (et les renforts en route) : la réserve est récoltée,
   *  les champions redeviennent disponibles. ⚠️ Le lieu RESTE À NOUS, sans défense : c'est la
   *  prochaine attaque ennemie qui le reprend (décision de l'utilisateur). */
  async function recallControl(
    userId: string,
    id: string,
    now: number,
    playerLevel: number,
  ): Promise<{ mana: number; supplies: SupplyStock; runes: number } | null> {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map) return null;
    const stock0 = cur.adv_gear?.stock ?? [];
    const h = harvestControlIn(cur.expedition_map, advList.value, stock0, id, now, playerLevel);
    const mil = militiaOfControl(cur.expedition_map.pois.find((p) => p.id === id)?.control);
    const champs = advList.value.filter((a) => a.posted === id).map((a) => a.id);
    const home = walkHome(cur, id, champs, mil, now);
    // 🧝 Le héros posté ici rentre aussi à pied (le rappel vidait le lieu « sans défense » en
    // l'y laissant), et celui qui y marchait fait demi-tour — comme un renfort en route.
    const emptied = home.map(releaseFromControl(h.map, id, [...champs, ...mil], now, playerLevel));
    const poiHere = emptied.pois.find((p) => p.id === id);
    const heroOut =
      poiHere && heroPostOf(emptied)?.id === id
        ? recallPostedHero(emptied, now, heroHomeLegMin(cur, emptied, poiHere, now))
        : poiHere?.control?.heroComing
          ? turnBackComingHero(emptied, now)
          : emptied;
    await persist(userId, {
      // 🏠 Tous rentrent À PIED : on les voit revenir sur la carte, les miliciens rejoignent
      // la base à leur arrivée (`settleReturns`), les champions restent occupés jusque-là.
      expedition_map: heroOut,
      adventurers: h.advs.map((a) =>
        a.posted === id ? { ...a, posted: undefined, busyUntil: home.advAt } : a,
      ),
      ...(h.gold > 0 ? { gold: cur.gold + h.gold } : {}),
      ...(h.mana > 0 ? { mana: cur.mana + h.mana } : {}),
      ...(Object.keys(h.supplies).length
        ? { supplies: addSupplies(cur.supplies, h.supplies) }
        : {}),
      ...(h.runes || h.forged.length
        ? {
            runes: addForgedSkills(
              addRuneCount(cur.runes, h.runes, h.blessedRunes, h.exaltedRunes),
              h.forged,
            ),
          }
        : {}),
      ...(h.keys ? { keys: cur.keys + h.keys } : {}),
      ...(h.summon ? { summon_stones: (cur.summon_stones ?? 0) + h.summon } : {}),
      ...(h.gearSeals || h.champSeals
        ? {
            seals: withControlSeals(
              cur.seals,
              h.gearSeals,
              h.champSeals ? [[h.champSealRank, h.champSeals]] : [],
            ),
          }
        : {}),
      // 🗡️ Les pièces : le bonus du camp, puis ce que l'XP de leur porteur leur a appris.
      ...(() => {
        const next = trainWornGear(advList.value, h.advs, h.stock);
        return next !== stock0 ? { adv_gear: { ...(cur.adv_gear ?? {}), stock: next } } : {};
      })(),
    });
    if (h.gold > 0) goldFx.gain(h.gold);
    // 🧺 Ce qui a été récolté en partant, pour l'animation (comme `collectControlPoint`).
    return { mana: h.mana, supplies: h.supplies, runes: h.runes };
  }

  /** 🏰 Ramène UNE PARTIE de la garnison (ou des renforts en route) : ils redeviennent
   *  disponibles, l'or déjà produit reste en réserve. Même vidé, le point reste à nous
   *  jusqu'à la prochaine attaque. */
  /** 🔙 Les champions d'un demi-tour de renforts : occupés jusqu'à leur arrivée, puis
   *  postés sur leur point d'origine (`to`, un transfert) ou libres à la base. */
  function turnedBack(back: readonly { id: string; at: number; to?: string }[]): Adventurer[] {
    const by = new Map(back.map((b) => [b.id, b]));
    return advList.value.map((a) => {
      const b = by.get(a.id);
      if (!b) return a;
      const next = { ...a, busyUntil: b.at };
      if (b.to) next.posted = b.to;
      else delete next.posted;
      return next;
    });
  }

  /** 🧝 Le trajet du héros seul depuis un lieu jusqu'à la base, à son pas. */
  function heroHomeLegMin(cur: CharacterRow, map: ExpeditionMap, poi: Poi, now: number): number {
    return partyLegMin(poi, [], {
      hero: true,
      travelMult: travelTimeMult(cur.buildings) * controlTravelMult(map, now),
      gearSpeed: 0,
    });
  }

  /** 🧝 RAPPELLE le héros de son poste (n'importe quel lieu tenu) : il rentre à la base. */
  async function recallHeroFromPost(userId: string, now: number): Promise<void> {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    if (cur && map && heroComing(map)) {
      await persist(userId, { expedition_map: turnBackComingHero(map, now) });
      return;
    }
    const poi = heroPostOf(map);
    if (!cur || !map || !poi) return;
    await persist(userId, {
      expedition_map: recallPostedHero(map, now, heroHomeLegMin(cur, map, poi, now)),
    });
  }

  /** 🔙 L'heure d'arrivée À LA BASE du héros rappelé de son poste (ou de sa route vers
   *  lui), calculée par les MÊMES fonctions que `recallHeroFromPost`. */
  function heroPostRecallArrival(now: number): number | null {
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return null;
    if (heroComing(map)) return turnBackComingHero(map, now).heroReturnAt ?? null;
    const poi = heroPostOf(map);
    if (!poi) return null;
    return recallPostedHero(map, now, heroHomeLegMin(cur, map, poi, now)).heroReturnAt ?? null;
  }

  /** 🔙 L'arrivée d'UN champion rappelé de son poste (ou de sa route vers lui), calculée
   *  par les MÊMES fonctions que `releaseControlChampions` ; `toBase: false` = un transfert
   *  qui repartirait vers son point d'origine. `null` : il ne peut pas encore rebrousser. */
  function postRecallArrival(
    id: string,
    advId: string,
    now: number,
  ): { at: number; toBase: boolean } | null {
    const cur = row.value;
    const map = cur?.expedition_map;
    const ctl = map?.pois.find((p) => p.id === id)?.control;
    if (!cur || !map || !ctl) return null;
    const r = (ctl.reinforcing ?? []).find((x) => x.id === advId);
    if (r) {
      if (!canTurnBack(r, now)) return null;
      const b = recallReinforcements(map, id, [advId], now)?.back[0];
      return b ? { at: b.at, toBase: !b.to } : null;
    }
    if (!ctl.garrison.includes(advId)) return null;
    return { at: walkHome(cur, id, [advId], [], now).advAt, toBase: true };
  }

  /** 🧝 ENVOIE LE HÉROS EN GARNISON sur un point tenu (2026-10-05, demandé : « permettre au
   *  héros d'être en garnison sur les lieux fixes ; il prend 2 places sur les 5 »). Ses places
   *  sont réservées tout de suite ; il marche (son pas, celui d'un rappel) et devient défenseur
   *  à son arrivée (`settleReinforcements`). Posté ailleurs, il quitte ce poste et part de là.
   *  `unit` = son instantané de combat, figé au départ (une reprise se résout hors de l'app).
   *  Rend la RAISON d'un refus, `null` s'il est parti. */
  async function sendHeroToPost(
    userId: string,
    id: string,
    now: number,
    unit: PostedHero,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    const map0 = cur?.expedition_map;
    const poi = map0?.pois.find((p) => p.id === id);
    if (!cur || !map0 || !poi) return 'la carte n’est pas chargée';
    const block = heroPostBlocker(poi.control);
    if (block) return HERO_POST_BLOCK_LABEL[block];
    if (woundRemainingMs(cur.base, now) > 0) return 'le héros est à l’infirmerie';
    const post = heroPostOf(map0);
    // 🧝 Posté ailleurs, il en part directement ; sinon il doit être libre. ⚠️ La MÊME règle
    // que l'écran (`heroEngaged`) : réservé dans une attaque combinée en attente, en mer ou
    // déjà en marche, le store le laissait se poster quand même.
    if (heroEngaged.value) return 'le héros est déjà en route ailleurs';
    const legOf = (p: Poi) => heroHomeLegMin(cur, map0, p, now);
    // 🧭 Posté ailleurs, il part de CE lieu (signalé : de l'Ossuaire aux Archives, la carte le
    // faisait partir de la base) — sauf si le détour par la ville est plus court.
    const route = post ? routeFromSpot(poi, post, legOf) : { min: legOf(poi), direct: false };
    const map = post ? unpostHero(map0, now) : map0;
    await persist(userId, {
      expedition_map: sendHeroToControl(
        map,
        id,
        now,
        now + route.min * 60_000,
        unit,
        post && route.direct ? post : undefined,
      ),
    });
    return null;
  }

  /** 💎 Le lapidaire fabrique une autre compétence verte. Les exemplaires FINIS partent d'abord
   *  au stock ; l'entamé reste sur l'ancienne (`forgeDone`) : rien ne se perd. */
  async function chooseForgeSkill(
    userId: string,
    id: string,
    skill: SkillId,
    now: number,
    playerLevel: number,
  ): Promise<void> {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map) return;
    const h = harvestControlIn(
      cur.expedition_map,
      advList.value,
      cur.adv_gear?.stock ?? [],
      id,
      now,
      playerLevel,
    );
    const next = setForgeSkill(h.map, id, skill, now, mapPlayerLevel(h.map, playerLevel));
    if (next === h.map && h.map === cur.expedition_map) return;
    await persist(userId, {
      expedition_map: next,
      ...(h.advs !== advList.value ? { adventurers: h.advs } : {}),
      ...(h.forged.length ? { runes: addForgedSkills(cur.runes, h.forged) } : {}),
    });
  }

  /** 🗺️ Le cartographe tenu fait revenir un autre type de lieu. */
  async function chooseCartoFavor(userId: string, id: string, favor: CartoType): Promise<void> {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map) return;
    const next = setCartoFavor(cur.expedition_map, id, favor);
    if (next === cur.expedition_map) return;
    await persist(userId, { expedition_map: next });
  }

  async function releaseControlChampions(
    userId: string,
    id: string,
    ids: readonly string[],
    now: number,
    playerLevel: number,
  ): Promise<void> {
    await writesSettled();
    const cur = row.value;
    if (!cur?.expedition_map || !ids.length) return;
    // 🔙 CEUX ENCORE EN ROUTE FONT DEMI-TOUR (2026-09-29, signalé : « le demi-tour sur les
    // miliciens ») : sans ça, un milicien ramené avant d'arriver était renvoyé DEPUIS le point,
    // pour tout le trajet, comme s'il y était déjà. Même règle que le demi-tour de la carte
    // (`recallReinforcements`) : ils rentrent en autant de temps qu'ils ont marché.
    const ctl = cur.expedition_map.pois.find((p) => p.id === id)?.control;
    const moving = new Set(
      (ctl?.reinforcing ?? []).filter((r) => canTurnBack(r, now)).map((r) => r.id),
    );
    const turning = ids.filter((x) => moving.has(x));
    const turned = turning.length
      ? recallReinforcements(cur.expedition_map, id, turning, now)
      : null;
    if (turned) {
      await persist(userId, {
        expedition_map: turned.map,
        adventurers: turnedBack(turned.back),
      });
      const rest = ids.filter((x) => !moving.has(x));
      if (rest.length) await releaseControlChampions(userId, id, rest, now, playerLevel);
      return;
    }
    const out = new Set(ids);
    // 🛡️ Seulement les miliciens RÉELLEMENT sur ce point (un id inventé ne crée personne).
    const onPoint = new Set(
      militiaOfControl(cur.expedition_map.pois.find((p) => p.id === id)?.control),
    );
    const mil = ids.filter((x) => onPoint.has(x));
    const champs = advList.value.filter((a) => out.has(a.id) && a.posted === id).map((a) => a.id);
    const home = walkHome(cur, id, champs, mil, now);
    await persist(userId, {
      expedition_map: home.map(releaseFromControl(cur.expedition_map, id, ids, now, playerLevel)),
      adventurers: advList.value.map((a) =>
        out.has(a.id) && a.posted === id ? { ...a, posted: undefined, busyUntil: home.advAt } : a,
      ),
    });
  }

  /** 🏠 Le trajet de RETOUR d'un point vers la base : les champions au pas de leur équipe
   *  (comme à l'aller, `partyLegMin`), les miliciens au pas d'une équipe sans rôle. Rend
   *  l'heure d'arrivée des champions et de quoi noter les deux trajets sur la carte. */
  function walkHome(
    cur: CharacterRow,
    id: string,
    champs: readonly string[],
    mil: readonly string[],
    now: number,
  ): { advAt: number; map: (m: ExpeditionMap) => ExpeditionMap } {
    const poi = cur.expedition_map?.pois.find((p) => p.id === id);
    if (!poi) return { advAt: now, map: (m) => m };
    const mult = travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now);
    const escort = champs
      .map((x) => advList.value.find((a) => a.id === x))
      .filter((a): a is Adventurer => !!a);
    const advAt = escort.length
      ? now +
        partyLegMin(poi, escort, {
          hero: false,
          travelMult: mult,
          gearSpeed: advGearRoles(escort, escortKitOf(cur).advGear).speed,
        }) *
          60_000
      : now;
    const milAt = now + caravanLegMin(poi, [], 0, mult) * 60_000;
    return {
      advAt,
      map: (m) =>
        sendHomeFromControl(sendHomeFromControl(m, id, champs, now, advAt), id, mil, now, milAt),
    };
  }

  /** 🏠 Les retours arrivés quittent la carte ; les miliciens rentrés rejoignent la base.
   *  Appelé par `controlTick`, avant les reprises. */
  function settleHome(cur: CharacterRow, now: number): Record<string, unknown> | null {
    if (!cur.expedition_map) return null;
    let r = settleReturns(cur.expedition_map, now);
    // 🏰 Le héros rappelé de la forteresse est rentré.
    const back = r.map.heroReturnAt !== undefined && r.map.heroReturnAt <= now;
    if (back) {
      const m = { ...r.map };
      delete m.heroReturnAt;
      delete m.heroReturnFrom;
      r = { ...r, map: m };
    }
    if (r.map === cur.expedition_map) return null;
    return {
      expedition_map: r.map,
      ...(r.militiaHome && cur.base
        ? {
            base: {
              ...cur.base,
              militia: returnMilitia(cur.base.militia ?? emptyMilitia(now), r.militiaHome),
            },
          }
        : {}),
    };
  }

  /** 🛡️ Envoie `n` MILICIENS de la base sur un point tenu : ils prennent leur place tout de
   *  suite et rejoignent la garnison à leur arrivée (trajet d'une équipe sans équipement).
   *  Rend la RAISON d'un refus, `null` si partis. */
  async function sendMilitiaToControl(
    userId: string,
    id: string,
    n: number,
    now: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    const poi = cur?.expedition_map?.pois.find((p) => p.id === id);
    if (!cur?.base || !poi) return 'la carte n’est pas chargée';
    const block = reinforceBlocker(poi.control, n, true);
    if (block) return REINFORCE_BLOCK_LABEL[block];
    const took = takeMilitia(cur.base.militia ?? emptyMilitia(now), n);
    if (!took) return 'pas assez de miliciens à la base';
    // Le trajet d'une équipe de champions sans rôle ni équipement de vitesse.
    const leg = caravanLegMin(
      poi,
      [],
      0,
      travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now),
    );
    const at = now + leg * 60_000;
    await persist(userId, {
      expedition_map: reinforceControl(cur.expedition_map!, id, took.ids, at, now),
      base: { ...cur.base, militia: took.state },
    });
    return null;
  }

  /** 🏰 Envoie des champions en RENFORT sur un point tenu : ils prennent leur place tout de
   *  suite, marchent (le trajet d'une équipe, sans le héros) et rejoignent la garnison à leur
   *  arrivée. Rend la RAISON d'un refus, `null` si partis. */
  async function reinforceControlPoint(
    userId: string,
    id: string,
    ids: readonly string[],
    now: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    const poi = cur?.expedition_map?.pois.find((p) => p.id === id);
    if (!cur || !poi) return 'la carte n’est pas chargée';
    if (new Set(ids).size !== ids.length) return 'un champion est choisi deux fois';
    const block = reinforceBlocker(poi.control, ids.length);
    if (block) return REINFORCE_BLOCK_LABEL[block];
    const escort = ids
      .map((x) => advList.value.find((a) => a.id === x))
      .filter((a): a is Adventurer => !!a && advAvailable(a, now));
    if (escort.length !== ids.length) return 'un champion choisi n’est plus disponible';
    const leg = partyLegMin(poi, escort, {
      hero: false,
      travelMult: travelTimeMult(cur.buildings) * controlTravelMult(cur.expedition_map, now),
      gearSpeed: advGearRoles(escort, escortKitOf(cur).advGear).speed,
    });
    const at = now + leg * 60_000;
    const sent = new Set(ids);
    await persist(userId, {
      expedition_map: reinforceControl(cur.expedition_map!, id, ids, at, now),
      adventurers: advList.value.map((a) =>
        sent.has(a.id) ? { ...a, posted: id, busyUntil: at } : a,
      ),
    });
    return null;
  }

  /** 🔙 Le lieu visé par un voyage rappelé redevient disponible : il avait été retiré de la
   *  carte au départ (`targetTaken`). Un point fixe perd son marquage d'assaut ; une armée
   *  en campagne n'avait jamais quitté la carte ; un lieu expiré entre-temps ne revient pas. */
  function targetBack(map: ExpeditionMap | null, poi: Poi, now: number): ExpeditionMap | null {
    if (!map || isFieldArmyPoi(poi)) return map;
    if (poi.type === 'control') return markAssault(map, poi.id, false);
    if (poi.expiresAt <= now || map.pois.some((p) => p.id === poi.id)) return map;
    return { ...map, pois: [...map.pois, poi] };
  }

  /**
   * 🔙 FAIRE DEMI-TOUR (2026-09-29, demandé : « faire faire demi-tour à une troupe à nous en
   * cliquant dessus »). Le voyage rebrousse chemin et revient en autant de temps qu'il a mis
   * à venir ; rien n'est gagné ni perdu (`recallVoyage`). Les champions rentrent au nouveau
   * retour, le lieu visé redevient disponible. Rend la RAISON d'un refus, `null` si c'est fait.
   */
  async function recallTrip(
    userId: string,
    target: RecallTarget,
    now: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    if (!cur) return 'personnage non chargé';
    if (target.kind === 'return') {
      if (!cur.expedition_map) return 'la carte n’est pas chargée';
      const r = recallReturns(cur.expedition_map, target.pointId, target.ids, now);
      if ('block' in r) return `Demi-tour impossible : ${RETURN_RECALL_LABEL[r.block]}.`;
      // 🏰 Les champions reprennent leur poste : occupés jusqu'à leur arrivée sur le point.
      await persist(userId, {
        expedition_map: r.map,
        adventurers: turnedBack(r.back.map((b) => ({ ...b, to: target.pointId }))),
      });
      return null;
    }
    if (target.kind === 'reinf') {
      if (!cur.expedition_map) return 'la carte n’est pas chargée';
      const r = recallReinforcements(cur.expedition_map, target.pointId, target.ids, now);
      if (!r) return 'ces renforts ne peuvent plus faire demi-tour';
      await persist(userId, {
        expedition_map: r.map,
        adventurers: turnedBack(r.back),
      });
      return null;
    }
    if (target.kind === 'attack') {
      // ⚔️🧭 Attaque en préparation : ceux qui attendent restent chez eux, les partis rentrent.
      const a = attackList.value.find((x) => x.id === target.id);
      if (!a) return 'cette attaque est déjà lancée ou terminée';
      const r = recallAttack(a, cur.expedition_map, now);
      if (r === 'arrived') return `Demi-tour impossible : ${RECALL_BLOCK_LABEL.arrived}.`;
      if (r.heroTrip && cur.expedition) return 'le héros est déjà en route ailleurs';
      let advs = advList.value;
      for (const x of r.release)
        advs = advs.map((q) =>
          x.ids.includes(q.id) && q.busyUntil === x.from ? { ...q, busyUntil: undefined } : q,
        );
      for (const m of r.moved) advs = rescheduleReturners(advs, m.ids, m.from, m.to);
      const back0 = targetBack(cur.expedition_map, a.poi, now);
      const map = back0 ? forgetDeparture(back0, a.midAt) : back0;
      const refund = Object.fromEntries(a.supplies.map((id) => [id, 1]));
      await persist(userId, {
        attacks: attackList.value.filter((x) => x.id !== a.id),
        ...(r.trips.length ? { parties: [...partyList.value, ...r.trips] } : {}),
        ...(r.heroTrip ? { expedition: r.heroTrip } : {}),
        ...(r.refund && a.supplies.length ? { supplies: addSupplies(cur.supplies, refund) } : {}),
        ...(map !== cur.expedition_map ? { expedition_map: map } : {}),
        ...(advs !== advList.value ? { adventurers: advs } : {}),
      });
      return null;
    }
    const v =
      target.kind === 'hero' ? cur.expedition : partyList.value.find((p) => p.id === target.id);
    if (!v) return 'ce voyage est déjà terminé';
    if (v.crew || v.wingOf) {
      // ⚔️🧭 Attaque combinée lancée : TOUS ses voyages font demi-tour ensemble.
      const all: ActiveExpedition[] = [
        ...(cur.expedition ? [cur.expedition] : []),
        ...partyList.value,
      ];
      const pairs = recallCombinedGroup<ActiveExpedition>(v, all, now);
      if (typeof pairs === 'string') return `Demi-tour impossible : ${RECALL_BLOCK_LABEL[pairs]}.`;
      const swap = new Map(pairs);
      let advs = advList.value;
      for (const [old, back] of pairs)
        advs = rescheduleReturners(advs, tripCrew(old), old.returnAt, back.returnAt);
      const back0 = targetBack(cur.expedition_map, v.poi, now);
      const map = back0 ? forgetDeparture(back0, v.midAt) : back0;
      const expedition = cur.expedition ? (swap.get(cur.expedition) ?? cur.expedition) : null;
      await persist(userId, {
        ...(expedition !== cur.expedition ? { expedition } : {}),
        parties: partyList.value.map((p) => (swap.get(p) as ActiveParty | undefined) ?? p),
        ...(map !== cur.expedition_map ? { expedition_map: map } : {}),
        ...(advs !== advList.value ? { adventurers: advs } : {}),
      });
      return null;
    }
    const block = recallBlocker(v, now);
    if (block) return `Demi-tour impossible : ${RECALL_BLOCK_LABEL[block]}.`;
    const back = recallVoyage(v, now)!;
    const advs = rescheduleReturners(advList.value, tripCrew(v), v.returnAt, back.returnAt);
    // 🔙 Le départ de ce voyage ne compte pas (nids, harcèlement) : il est retiré.
    const back0 = targetBack(cur.expedition_map, v.poi, now);
    const map = back0 ? forgetDeparture(back0, v.midAt) : back0;
    await persist(userId, {
      ...(target.kind === 'hero'
        ? { expedition: back }
        : { parties: partyList.value.map((p) => (p.id === target.id ? back : p)) }),
      ...(map !== cur.expedition_map ? { expedition_map: map } : {}),
      ...(advs !== advList.value ? { adventurers: advs } : {}),
    });
    return null;
  }

  /**
   * 📘 OUVRIR UN TOME D'EXPÉRIENCE sur un champion (2026-10-03, demandé) : l'XP passe par
   * `openTome` (= `grantAdvXp`, plafonds et excédent conservé), l'équipement porté apprend
   * avec lui (`gearTrainedPatch`), et l'animation est celle d'un retour de mission. Rend la
   * RAISON d'un refus, `null` si c'est fait.
   */
  async function openXpTome(userId: string, advId: string, tomeId: TomeId): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    if (!cur) return 'personnage non chargé';
    const stock = takeSupplies(cur.supplies, [tomeId]);
    if (!stock) return 'tu n’as plus ce tome';
    const before = advList.value;
    const adv = before.find((a) => a.id === advId);
    if (!adv) return 'champion introuvable';
    const { after, lost } = openTome(adv, tomeId, pantheonLevel.value, heroLevel.value);
    // ⚠️ Un tome qui ne servirait à RIEN (champion au niveau du héros) n'est pas consommé.
    if (lost >= TOME_XP[tomeId]) return 'il a rattrapé ton héros : il n’apprend plus rien';
    const advs = before.map((a) => (a.id === advId ? after : a));
    const gearPatch = gearTrainedPatch(cur, before, advs);
    const tracks = gearAwareTracks(cur, before, advs, gearPatch);
    await persist(userId, { supplies: stock, adventurers: advs, ...gearPatch });
    if (tracks.length) useAdvXpFx().show(tracks, 'Tome d’expérience');
    return null;
  }

  /**
   * ⚡ BOOST DE VITESSE (2026-09-30, demandé) : un boost du stock avance l'étape en cours d'un
   * voyage (`speedBoost.ts`). Une attaque combinée pas encore toute partie avance EN BLOC ;
   * partie, ses groupes liés avancent ensemble à l'aller. Les champions suivent leur nouveau
   * retour (`busyUntil`). Un renfort en route ou un retour d'un point fixe (`reinf`/`return`)
   * avance son échéance sur la carte. Rend la RAISON d'un refus, `null` si c'est fait.
   */
  async function applySpeedBoost(
    userId: string,
    target:
      | { kind: 'hero' }
      | { kind: 'party'; id: string }
      | { kind: 'attack'; id: string }
      | { kind: 'reinf' | 'return'; pointId: string; members: readonly string[]; at: number },
    boostId: BoostId,
    now: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    if (!cur) return 'personnage non chargé';
    const stock = takeSupplies(cur.supplies, [boostId]);
    if (!stock) return 'tu n’as plus ce boost';
    const min = BOOST_MIN[boostId];
    if ('pointId' in target) {
      // 🛡️🏠 Renfort en route / retour d'un point fixe : l'échéance vit sur la carte.
      const map = cur.expedition_map;
      const poi = map?.pois.find((p) => p.id === target.pointId);
      const list = target.kind === 'reinf' ? poi?.control?.reinforcing : poi?.control?.returning;
      const e = list?.find((r) => target.members.includes(r.id) && r.at === target.at);
      if (!map || !poi || !e) return 'ce voyage est déjà terminé';
      // Un renfort est un ALLER simple (arrivée = `at`) ; un retour part du point à `from`.
      const plan = voyageBoostPlan(
        { poi, midAt: target.kind === 'reinf' ? e.at : (e.from ?? now), returnAt: e.at },
        min,
        now,
      );
      if (typeof plan === 'string') return BOOST_BLOCK_LABEL[plan];
      const advs = rescheduleReturners(advList.value, target.members, e.at, e.at - plan.gainMs);
      await persist(userId, {
        supplies: stock,
        expedition_map: boostControlTrip(
          map,
          poi.id,
          target.kind,
          target.members,
          e.at,
          plan.gainMs,
        ),
        ...(advs !== advList.value ? { adventurers: advs } : {}),
      });
      return null;
    }
    if (target.kind === 'attack') {
      const a = attackList.value.find((x) => x.id === target.id);
      if (!a) return 'ces groupes sont déjà tous partis';
      const plan = attackBoostPlan(a, min, now);
      if (typeof plan === 'string') return BOOST_BLOCK_LABEL[plan];
      const { attack, moved } = boostAttack(a, plan, now);
      let advs = advList.value;
      for (const m of moved) advs = rescheduleReturners(advs, m.members, m.from, m.to);
      const amap = cur.expedition_map
        ? moveDeparture(cur.expedition_map, a.midAt, attack.midAt)
        : cur.expedition_map;
      await persist(userId, {
        supplies: stock,
        attacks: attackList.value.map((x) => (x.id === a.id ? attack : x)),
        ...(amap !== cur.expedition_map ? { expedition_map: amap } : {}),
        ...(advs !== advList.value ? { adventurers: advs } : {}),
      });
      return null;
    }
    const v: ActiveExpedition | undefined =
      target.kind === 'hero'
        ? (cur.expedition ?? undefined)
        : partyList.value.find((p) => p.id === target.id);
    if (!v) return 'ce voyage est déjà terminé';
    const plan = voyageBoostPlan(v, min, now);
    if (typeof plan === 'string') return BOOST_BLOCK_LABEL[plan];
    const all: ActiveExpedition[] = [
      ...(cur.expedition ? [cur.expedition] : []),
      ...partyList.value,
    ];
    const group = plan.phase === 'go' ? [v, ...combinedSiblings(v, all)] : [v];
    let advs = advList.value;
    let expedition = cur.expedition;
    let parties = partyList.value;
    let bmap = cur.expedition_map;
    for (const t of group) {
      // ⚔️ Vers une armée en marche : on la croise là où elle sera à la nouvelle heure (`reMeet`).
      const nt = reMeet(boostVoyage(t, plan));
      advs = rescheduleReturners(advs, tripCrew(t), t.returnAt, nt.returnAt);
      // ⚡ Le départ (daté de l'arrivée) avance avec le voyage.
      if (bmap) bmap = moveDeparture(bmap, t.midAt, nt.midAt);
      if (t === cur.expedition) expedition = nt;
      else parties = parties.map((p) => (p === t ? (nt as ActiveParty) : p));
    }
    await persist(userId, {
      supplies: stock,
      ...(expedition !== cur.expedition ? { expedition } : {}),
      ...(parties !== partyList.value ? { parties } : {}),
      ...(bmap !== cur.expedition_map ? { expedition_map: bmap } : {}),
      ...(advs !== advList.value ? { adventurers: advs } : {}),
    });
    return null;
  }

  /**
   * 🏰🧭 TRANSFERT d'un point fixe à un autre (2026-09-29, demandé) : des membres ARRIVÉS de
   * la garnison de `fromId` marchent vers `toId`, comme un renfort parti de la base — ils y
   * prennent leur place tout de suite, y arrivent à leur pas (champions au pas de leur équipe,
   * miliciens au pas d'une équipe sans rôle), et la Tour de guet s'applique. Le trajet est le
   * plus court entre la ligne directe et le détour par la ville (`legFromSpot`).
   * Rend la RAISON d'un refus, `null` si partis.
   */
  async function transferControlGarrison(
    userId: string,
    fromId: string,
    toId: string,
    ids: readonly string[],
    now: number,
    playerLevel: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return 'la carte n’est pas chargée';
    const block = transferBlocker(map, fromId, toId, ids);
    if (block) return TRANSFER_BLOCK_LABEL[block];
    const reserved = reservedIds.value;
    if (ids.some((x) => reserved.has(x))) return 'un membre attend une attaque combinée';
    const from = map.pois.find((p) => p.id === fromId)!;
    const to = map.pois.find((p) => p.id === toId)!;
    const mil = ids.filter((x) => isMilitiaId(x));
    const champs = advList.value.filter((a) => ids.includes(a.id) && a.posted === fromId);
    if (champs.length + mil.length !== ids.length) return 'un membre choisi n’est plus là';
    const mult = travelTimeMult(cur.buildings) * controlTravelMult(map, now);
    const advAt = champs.length
      ? now +
        legFromSpot(to, from, (p) =>
          partyLegMin(p, champs, {
            hero: false,
            travelMult: mult,
            gearSpeed: advGearRoles(champs, escortKitOf(cur).advGear).speed,
          }),
        ) *
          60_000
      : now;
    const milAt = now + legFromSpot(to, from, (p) => caravanLegMin(p, [], 0, mult)) * 60_000;
    const moved = new Set(champs.map((a) => a.id));
    await persist(userId, {
      expedition_map: transferGarrison(map, {
        fromId,
        toId,
        now,
        playerLevel,
        champs: { ids: [...moved], at: advAt },
        militia: { ids: mil, at: milAt },
      }),
      adventurers: advList.value.map((a) =>
        moved.has(a.id) ? { ...a, posted: toId, busyUntil: advAt } : a,
      ),
    });
    return null;
  }

  /**
   * 🧭 LA RÉPARTITION, D'UN BLOC (2026-10-11, demandé : « tu pars du principe que tous les lieux
   * sont vides, vu que tu vas faire bouger tous les effectifs d'un coup »). Tous ceux qui
   * changent d'endroit QUITTENT d'abord leur lieu, puis PARTENT vers le nouveau — une seule
   * écriture. Lancés un par un, deux lieux pleins qui s'échangent des champions se bloquaient
   * (« plus assez de places » : chacun attendait la place que l'autre libère). Les places se
   * vérifient sur l'état FINAL. Chacun marche à son pas : depuis la base comme un renfort,
   * d'un lieu à l'autre comme un transfert, vers la base comme un rappel. Rend la RAISON d'un
   * refus (rien n'est parti), `null` si tout le monde est en route.
   */
  async function redeployGarrisons(
    userId: string,
    moves: readonly { fromId: string | null; toId: string | null; ids: string[]; hero: boolean }[],
    now: number,
    playerLevel: number,
    heroUnit: PostedHero,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    let map = cur?.expedition_map;
    if (!cur || !map) return 'la carte n’est pas chargée';
    const reserved = reservedIds.value;
    const champMoves = moves.filter((m) => !m.hero && m.ids.length);
    const heroMove = moves.find((m) => m.hero);
    for (const m of champMoves) {
      if (m.ids.some((x) => reserved.has(x))) return 'un membre attend une attaque combinée';
      for (const x of m.ids) {
        const a = advList.value.find((q) => q.id === x);
        if (!a) return 'un champion choisi n’existe plus';
        // Au départ : soit libre à la base, soit ARRIVÉ dans la garnison de son lieu.
        const there = m.fromId
          ? a.posted === m.fromId &&
            !!map.pois.find((p) => p.id === m.fromId)?.control?.garrison.includes(x)
          : !a.posted && advAvailable(a, now);
        if (!there) return `${a.name} n’est pas disponible là où il est`;
      }
    }
    if (heroMove) {
      if (woundRemainingMs(cur.base, now) > 0) return 'le héros est à l’infirmerie';
      if (heroEngaged.value || heroComing(map)) return 'le héros est déjà en route ailleurs';
    }
    const mult = travelTimeMult(cur.buildings) * controlTravelMult(map, now);
    const legOfTeam = (team: Adventurer[]) => (p: Poi) =>
      partyLegMin(p, team, {
        hero: false,
        travelMult: mult,
        gearSpeed: advGearRoles(team, escortKitOf(cur).advGear).speed,
      });
    const poiOf = (id: string) => map!.pois.find((p) => p.id === id);
    // Chacun à son pas : depuis la base comme un renfort, d'un lieu à l'autre comme un
    // transfert (ligne directe ou détour par la ville), vers la base comme un rappel.
    const arrive = new Map<string, number>();
    const legs: RedeployMove[] = [];
    for (const m of champMoves) {
      const legOf = legOfTeam(m.ids.map((x) => advList.value.find((a) => a.id === x)!));
      const from = m.fromId ? poiOf(m.fromId) : undefined;
      const to = m.toId ? poiOf(m.toId) : undefined;
      if (m.toId && !to) return 'un lieu de destination n’existe plus';
      if (!to && !from) continue;
      const min = to ? (from ? legFromSpot(to, from, legOf) : legOf(to)) : legOf(from!);
      const at = now + min * 60_000;
      legs.push({ fromId: m.fromId, toId: m.toId, ids: m.ids, at });
      for (const x of m.ids) arrive.set(x, at);
    }
    let heroLeg: Parameters<typeof redeployMap>[2] = null;
    if (heroMove) {
      const here = map;
      const legOf = (p: Poi) => heroHomeLegMin(cur, here, p, now);
      const post = heroPostOf(map);
      const to = heroMove.toId ? poiOf(heroMove.toId) : undefined;
      const route = to
        ? post
          ? routeFromSpot(to, post, legOf)
          : { min: legOf(to), direct: false }
        : { min: post ? legOf(post) : 0, direct: false };
      heroLeg = {
        toId: to?.id ?? null,
        at: now + route.min * 60_000,
        unit: heroUnit,
        direct: route.direct,
      };
    }
    const done = redeployMap(map, legs, heroLeg, now, playerLevel);
    if ('full' in done) return `plus assez de places : ${poiLabel(done.full)}`;
    map = done.map;
    await persist(userId, {
      expedition_map: map,
      adventurers: advList.value.map((a) => {
        const at = arrive.get(a.id);
        if (at === undefined) return a;
        const to = champMoves.find((m) => m.ids.includes(a.id))!.toId;
        return { ...a, posted: to ?? undefined, busyUntil: at };
      }),
    });
    return null;
  }

  /**
   * ⇄ ÉCHANGE (2026-09-29, demandé) : `outId`, arrivé sur `pointId`, et `inId` échangent leur
   * place — `inId` vient de la base (`fromId` absent ; `SWAP_MILITIA_FROM_BASE` = un milicien
   * de la Caserne) ou d'un autre point tenu `fromId`. Chacun marche à son pas vers la place de
   * l'autre (`swapGarrison`). Rend la RAISON d'un refus, `null` si partis.
   */
  async function swapControlMember(
    userId: string,
    pointId: string,
    outId: string,
    inId: string,
    fromId: string | null,
    now: number,
    playerLevel: number,
  ): Promise<string | null> {
    await writesSettled();
    const cur = row.value;
    const map = cur?.expedition_map;
    if (!cur || !map) return 'la carte n’est pas chargée';
    const point = map.pois.find((p) => p.id === pointId);
    const from = fromId ? map.pois.find((p) => p.id === fromId) : null;
    if (!point || (fromId && !from)) return 'la carte n’est pas chargée';
    // 🛡️ Un milicien de la base : il n'a pas encore d'id, il en reçoit un en partant.
    let militia = cur.base?.militia ?? emptyMilitia(now);
    let incoming = inId;
    let tookMil = false;
    if (!fromId && inId === SWAP_MILITIA_FROM_BASE) {
      const took = takeMilitia(militia, 1);
      if (!took) return 'pas de milicien à la base';
      militia = took.state;
      tookMil = true;
      incoming = took.ids[0]!;
    }
    const block = swapBlocker(map, pointId, outId, incoming, fromId);
    if (block) return SWAP_BLOCK_LABEL[block];
    // ⚔️🧭 Un membre attendu par une attaque combinée ne s'échange pas (on l'annule d'abord).
    const reserved = reservedIds.value;
    if (reserved.has(outId) || reserved.has(incoming))
      return 'un membre choisi attend une attaque combinée';
    const byId = new Map(advList.value.map((a) => [a.id, a]));
    const outAdv = isMilitiaId(outId) ? null : byId.get(outId);
    const inAdv = isMilitiaId(incoming) ? null : byId.get(incoming);
    if (!isMilitiaId(outId) && outAdv?.posted !== pointId)
      return 'le membre remplacé n’est plus là';
    if (inAdv && (fromId ? inAdv.posted !== fromId : !advAvailable(inAdv, now)))
      return 'le remplaçant n’est plus disponible';
    const mult = travelTimeMult(cur.buildings) * controlTravelMult(map, now);
    const legOf = (adv: Adventurer | null | undefined) => (p: Poi) =>
      adv
        ? partyLegMin(p, [adv], {
            hero: false,
            travelMult: mult,
            gearSpeed: advGearRoles([adv], escortKitOf(cur).advGear).speed,
          })
        : caravanLegMin(p, [], 0, mult);
    // Chacun part vers la place de l'autre : le point de départ de l'un est l'arrivée de l'autre.
    const outMin = from ? legFromSpot(from, point, legOf(outAdv)) : legOf(outAdv)(point);
    const inMin = from ? legFromSpot(point, from, legOf(inAdv)) : legOf(inAdv)(point);
    const outAt = now + outMin * 60_000;
    const inAt = now + inMin * 60_000;
    await persist(userId, {
      expedition_map: swapGarrison(map, {
        pointId,
        outId,
        outAt,
        inId: incoming,
        inAt,
        now,
        playerLevel,
        fromId,
      }),
      adventurers: advList.value.map((a) => {
        if (a.id === outId) {
          if (fromId) return { ...a, posted: fromId, busyUntil: outAt };
          return { ...a, posted: undefined, busyUntil: outAt };
        }
        if (a.id === incoming) return { ...a, posted: pointId, busyUntil: inAt };
        return a;
      }),
      ...(tookMil && cur.base ? { base: { ...cur.base, militia } } : {}),
    });
    return null;
  }

  return {
    swapControlMember,
    detectRadiusOf,
    fortSightOf,
    transferControlGarrison,
    redeployGarrisons,
    settleGearRefonte,
    claimWeeklyQuests,
    openRuneBatch,
    fuseRuneSkills,
    fuseAllRuneSkills,
    riseRuneSkill,
    riseChampionSkill,
    giveRuneSkill,
    takeBackRuneSkill,
    row,
    loaded,
    fetchMine,
    fetchIfStale,
    accrueBossTokens,
    spentBossTokens,
    setPseudo,
    expeSyncMap,
    crossIsland,
    moveIslandMilitia,
    shipIslandMilitia,
    shipMilitiaBetweenPoints,
    fortifyFor,
    crossingDepartAt,
    sailChampions,
    boardableIds,
    crossingBlock,
    expeSend,
    expeTick,
    expeSettle,
    grantComboChest,
    grantFriendBossChest,
    grantFriendBossBonus,
    expeClaim,
    expeAutoClaim,
    expeMarkRead,
    buildFilon,
    upgradeFilon,
    collectFilons,
    baseTick,
    buildDefense,
    upgradeDefense,
    repairDefense,
    repairAll,
    finishRepair,
    setAdvGear,
    ascendChampion,
    ascendGear,
    awakenGear,
    awakenAllGear,
    stripAllAdvGear,
    toggleAdvGearLock,
    withAdvGear,
    autoAssignGear,
    healHero,
    healAdventurers,
    heroIsHome,
    heroBackAtBase,
    ownedLevel,
    applyRun,
    applyBossWin,
    chooseReward,
    applyEndless,
    spendKey,
    advList,
    escortKit,
    advGearStock,
    pantheonLevel,
    heroLevel,
    noteHeroLevel,
    comptoirLevel,
    sealRiftPoi,
    placeControlWard,
    partyList,
    attackList,
    heroEngaged,
    sendCombinedAttack,
    attackTick,
    sendParty,
    partyTick,
    controlTick,
    collectControlPoint,
    recallControl,
    releaseControlChampions,
    chooseCartoFavor,
    chooseForgeSkill,
    recallHeroFromPost,
    sendHeroToPost,
    reinforceControlPoint,
    reservedIds,
    recallTrip,
    heroPostRecallArrival,
    postRecallArrival,
    applySpeedBoost,
    openXpTome,
    sendMilitiaToControl,
    applyExpedition,
    equip,
    sellLoadout,
    fileBagSetPieces,
    promoteSetSpare,
    sellSpares,
    sellSetPiece,
    optimizeGear,
    previewGearPlan,
    bestBuild,
    applyGearPlan,
    equipReplacing,
    unequip,
    equipTalent,
    unequipTalent,
    setEquippedTalents,
    sellTalent,
    sellFamiliar,
    sellFamiliars,
    sellSurplusRelics,
    fuseFamiliarsFromBag,
    fuseTalentsFromBag,
    sellItem,
    sellMany,
    toggleLock,
    claimDailyLogin,
    pullChampion,
    pullChampions,
    claimLevelUps,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
