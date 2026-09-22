// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { comboChestMessageId, type ComboChestRecord } from '@/lib/comboChest';
import { localDayIso } from '@/lib/localDay';
import {
  advanceBossTokens,
  chestMark,
  type BossTokenState,
  type FriendBossChest,
} from '@/lib/friendBoss';
import { defineStore, acceptHMRUpdate } from 'pinia';
import { computed, ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import {
  normalizePseudo,
  levelUpEnergy,
  pushEnergyLog,
  type EnergyLogEntry,
} from '@/lib/character';
import {
  sellValue,
  canSell,
  sellValueOf,
  levelToEnchant,
  enchantMult,
  round1,
  normRank,
  renameLegacyItem,
  migrateGearItem,
  GEAR_VERSION,
  fillSetPieceAffixes,
  bestGearLoadout,
  playerWithGear,
  mergeEffects,
  SLOTS,
  FAMILIAR_SLOT,
  WORN_SLOTS,
  MAX_LOADOUTS,
  rarityRank,
  type Item,
  type ItemEffect,
  type ItemSlot,
  type Equipped,
  type Loadout,
  type PendingReward,
  voieSetRoster,
  setSellLot,
  familiarSurplus,
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
  talentSurplus,
  type TalentInstance,
} from '@/lib/talents';
import { voiePassiveEffects, VOIES } from '@/lib/voies';
import {
  keysAfterPaying,
  labyIdOfClear,
  labyRunCleared,
  labyRunStarted,
  normalizeLabyStats,
  type LabyStats,
} from '@/data/labyrinths';
import { normalizeRunStats, runAttempt, type RunStats } from '@/lib/runStats';
import {
  PARTY_TARGETS,
  HARVEST_TYPES,
  isRiftPoi,
  isWarbandPoi,
  campSpecOf,
  depositMessages,
  MESSAGES_CAP,
  isClaimable,
  createMap,
  advanceWorld,
  riftOverflows,
  startExpedition,
  buildMessage,
  type ActiveExpedition,
  type ExpeditionMap,
  type ExpeditionMessage,
  type Poi,
} from '@/lib/expedition';
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
import { combatPower, type Combatant } from '@/lib/combat';
import {
  advanceBase,
  markOverflow,
  applyRaidOutcome,
  resolveRaid,
  siegeHurtIds,
  advHurtMs,
  advHealCost,
  siegeXp,
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
  retireKennel,
  healCost,
  woundRemainingMs,
  woundMsFor,
  raidIntervalMs,
  type BaseState,
  type DefenseId,
  type DefenseStructure,
  type Raid,
  type RaidReport,
} from '@/lib/raid';
import {
  advAvailable,
  advProgressOf,
  type AdvProgress,
  advRarity,
  grantAdvXp,
  advNextAscension,
  ascendAdventurer,
  engageCap,
  type Adventurer,
} from '@/lib/adventurers';
import {
  caravanClaimRoster,
  convoySlotsFree,
  isCaravanClaimable,
  pruneCaravans,
  type Caravan,
  type EscortKit,
  type PartyHero,
} from '@/lib/caravan';
import {
  advGearRoles,
  advGearSellValue,
  canWearAdvGear,
  rollGachaPiece,
  advGearModelOf,
  lineageOf,
  normalizeAdvGearState,
  advGearAwakenPlan,
  awakenAdvGear,
  advGearNextRank,
  advGearRankCap,
  ascendAdvGear,
  trainWornGear,
  wornGear,
  type AdvGear,
  type AdvGearSlot,
  type AdvGearState,
} from '@/lib/advGear';
import {
  partySendBlocker,
  PARTY_SEND_BLOCK_LABEL,
  partyHeroBlocker,
  PARTY_HERO_BLOCK_LABEL,
  normalizeParties,
  partyClaimRoster,
  partyLegMin,
  settleParties,
  startParty,
  type ActiveParty,
} from '@/lib/party';
// ⚔️🕳️ Les DEUX résolutions d'une mission de groupe : un camp de faction, ou une incursion
// dans une faille. La dispatch vit dans `sendParty`, le seul chemin qui envoie un groupe.
import { resolveCamp } from '@/lib/camp';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { resolveIncursion, resolveInterception, riftOverflowOf } from '@/lib/rift';
import {
  GACHA,
  dailyFreeMana,
  grantChampion,
  wipeLegacyAdventurers,
  type GachaState,
  GACHA_VERSION,
  pullMany,
  rollGearGrade,
} from '@/lib/gacha';
import {
  addSeals,
  advGearAscensionBlocker,
  advGearAscensionCost,
  GEAR_ASCENSION_BLOCK_LABEL,
  ascensionBlocker,
  ascensionCost,
  ASCENSION_BLOCK_LABEL,
  normalizeSeals,
  type Seals,
} from '@/lib/ascension';
import { levelUpTickets, pullPayment, buildTickets } from '@/lib/sportTickets';
import type { LotItem } from '@/lib/gachaReveal';
import { gearRefonteGifts } from '@/lib/gearMigration';
import { useGameFx } from '@/composables/useGameFx';
import { useGoldFx } from '@/composables/useGoldFx';

export interface CharacterRow {
  user_id: string;
  pseudo: string;
  gold: number;
  dust: number;
  energy_spent: number;
  equipped: Equipped;
  inventory: Item[];
  talents: TalentInstance[];
  cleared_dungeons: string[];
  defeated_bosses: string[];
  login_streak: number;
  login_grace_used: boolean;
  last_login_date: string | null;
  login_energy: number;
  consumables: Record<string, number>;
  reward_level: number;
  endless_best: number;
  pending_reward: PendingReward | null;
  keys: number; // clés d'expédition (donjons à étages)
  stones: number; // pierres magiques 💎 : montée de niveau des familiers
  parchemins: number; // parchemins de maîtrise 📜 : montée de NIVEAU des talents (migr. 0048)
  fragments: number; // poussière d'âme : montée du RANG des familiers (migr. 0049 ; ex-🧩)
  ink_dust: number; // poussière d'encre : montée du RANG des talents (migr. 0053)
  enchant_scrolls: number; // 📜 parchemins d'enchantement : 1 par TENTATIVE d'enchant (migr. 0054)
  protections: number; // 🛡️ protections : évite le retour à +0 sur échec d'enchant (migr. 0054)
  summon_stones: number; // pierres d'invocation 🔮 : tenter les boss (migr. 0050)
  expedition: ActiveExpedition | null; // mode idle « Expédition » en cours
  expedition_map: ExpeditionMap | null; // carte du monde (POI)
  messages: ExpeditionMessage[]; // boîte à messages 📬 (rapports d'expédition)
  buildings: Building[]; // filons de production passive (village)
  set_pieces_seen: Record<string, string[]>; // codex : slots de set déjà obtenus par setId
  loadouts: Loadout[]; // sets d'équipement rangés (max 3, migr. 0051)
  voie: string | null; // spécialisation/archétype choisi (migr. 0055 ; null = aucune)
  energy_log: EnergyLogEntry[]; // journal d’énergie hors-sport horodaté (migr. 0057)
  base: BaseState | null; // défense de la base : enceinte, siège, champ de bataille (migr. 0060)
  /** 💠 Pierres de mana (migr. 0080) — la monnaie du gacha de champions. Elle ARRIVE avant
   *  son puits (failles → pierres de mana → gacha) : elle s'accumule, et ce n'est pas une
   *  devise morte, dont le puits aurait été retiré. */
  mana: number;
  /** 🎰 L'état du TIRAGE (migr. 0081) : le pity, rien d'autre. ⚠️ La COLLECTION n'est
   *  pas ici — un champion EST un `Adventurer`, donc il vit dans `adventurers` (v0.942),
   *  ce qui lui donne gratuitement convois, camps, défense, équipement et compagnons. */
  gacha: GachaState;
  /** 🎟️ Tickets d'invocation (migr. 0082) — gagnés UNIQUEMENT par le sport (360 bouclé,
   *  boss entre amis abattu, niveau global gagné) ; un ticket = un tirage. ⚠️ Colonne À PART
   *  et non dans `gacha` : chaque tirage réécrit `gacha`, un oubli y effacerait les tickets. */
  gacha_tickets: number;
  seals: Seals; // 🔱 sceaux d'ascension (migr. 0083)
  scrap: number; // 🔩 LEGACY (migr. 0060) : devise retirée (v0.998), convertie en or au chargement // journal d'énergie hors-sport horodaté (migr. 0057)
  adventurers: Adventurer[] | null; // vivier de la Guilde (migr. 0061)
  caravans: Caravan[] | null; // convois en route ou dont la cargaison attend (migr. 0061)
  adv_gear: AdvGearState | null; // équipement des aventuriers : stock + forge (migr. 0068)
  laby_stats: LabyStats; // Labyrinthe : runs lancés / nettoyés par palier (migr. 0073)
  boss_stats: RunStats; // Boss de palier : tentatives / victoires par boss (migr. 0085)
  /** 🎫 Jetons de boss entre amis (migr. 0086) : gagnés par le sport (`accrueBossTokens`),
   *  dépensés par le SERVEUR au lancement et à l'adhésion. */
  boss_tokens: number;
  boss_token_state: BossTokenState | null;
  parties: ActiveParty[] | null; // ⚔️ groupes de camp partis SANS le héros (migr. 0077)
  /** ⚙️ Version de l'équipement (migr. 0088) : sous `GEAR_VERSION`, la ligne reçoit une fois
   *  les cadeaux de la refonte à 7 emplacements (`gearRefonteGifts`). */
  gear_version: number;
}

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
    depositMessages(cur.messages, fresh, cap, claimedLocally);
  const loaded = ref(false);
  const goldFx = useGoldFx(); // petite animation « + or » à chaque vente

  const COLS =
    'user_id, pseudo, gold, dust, energy_spent, equipped, inventory, talents, cleared_dungeons, defeated_bosses, login_streak, login_grace_used, last_login_date, login_energy, consumables, reward_level, endless_best, pending_reward, keys, stones, parchemins, fragments, ink_dust, enchant_scrolls, protections, summon_stones, expedition, expedition_map, messages, buildings, set_pieces_seen, loadouts, voie, energy_log, base, scrap, mana, adventurers, caravans, adv_gear, laby_stats, boss_stats, boss_tokens, boss_token_state, parties, gacha, gacha_tickets, seals, gear_version';

  // Garde-fou : une colonne jsonb malformée (ex. talents={} au lieu de []) ne doit
  // JAMAIS faire planter la page (le code fait `for..of` sur les tableaux). On
  // normalise les types attendus au chargement.
  function normalizeRow(r: CharacterRow | null): CharacterRow | null {
    if (!r) return r;
    const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    const obj = <T>(v: unknown): T =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : ({} as T);
    r.talents = normalizeTalents(r.talents); // legacy string[] → instances (rétro-compat)
    // Aventuriers/convois : un jsonb malformé ne doit jamais faire planter la page.
    // ⚠️ Plus de compagnon ni de talent sur un champion (v0.996) : les champs des
    // sauvegardes d'avant sont retirés ici, la prochaine écriture les efface en base.
    r.adventurers = arr<Adventurer>(r.adventurers).map((a) => {
      const rest: Record<string, unknown> = { ...a };
      delete rest.familiarId;
      delete rest.talentId;
      return rest as unknown as Adventurer;
    });
    // ⚠️ Les convois ENCAISSÉS sont taillés au chargement : la liste ne se purgeait
    // jamais (35 convois mesurés sur un compte réel, dont 30 dépensés). Un non-encaissé
    // n'est JAMAIS jeté — il porte une cargaison.
    r.caravans = pruneCaravans(arr<Caravan>(r.caravans));
    // Équipement des aventuriers (`adv_gear`, migr. 0068) : jsonb malformé/absent → stock
    // vide, entrées sans id/slot/effet écartées, forge incomplète remise à null. Même
    // politique que `adventurers`/`caravans` ci-dessus (jamais null après normalisation,
    // malgré le type nullable qui reflète ce que la DB peut renvoyer).
    r.adv_gear = normalizeAdvGearState(r.adv_gear);
    r.laby_stats = normalizeLabyStats(r.laby_stats);
    r.boss_stats = normalizeRunStats(r.boss_stats);
    if (typeof r.boss_tokens !== 'number') r.boss_tokens = 0; // 🎫 migr. 0086
    if (!r.boss_token_state || typeof r.boss_token_state !== 'object') r.boss_token_state = null;
    // ⚔️ Groupes de camp (migr. 0077) : absent/malformé → [] ; une entrée incomplète est
    // écartée (`buildMessage` la lirait à chaque tick).
    r.parties = normalizeParties(r.parties);
    // Rangs (2026‑08‑18) : objets sauvegardés aux ANCIENNES raretés → nouveaux rangs.
    // ⚙️ Refonte à 7 emplacements (étape 8) : chaque objet est converti APRÈS les anciennes
    // migrations (idempotent, cf. `migrateGearItem`) — ses valeurs sont recalculées au
    // nouveau barème, un enchant baké d'avant compris.
    const fixItem = (it: Item): Item => migrateGearItem(fixLegacyItem(it));
    const fixLegacyItem = (it: Item): Item => {
      const rarity = normRank(it.rarity);
      // Nom d'avant la v0.874 (« Cuirasse mythique ») : il contredirait le rang affiché.
      it = renameLegacyItem({ ...it, rarity });
      // Pièces de set d'AVANT le correctif multi-affixe : on complète leurs affixes
      // manquants (déterministe par id) — sinon un set patiemment constitué reste à
      // 1 stat/pièce et ne vaudra jamais du stuff mixte à 3 stats.
      it = fillSetPieceAffixes(it);
      // MIGRATION enchant → valeur (ticket 7acb1e7c) : l'axe enchant des OBJETS est retiré.
      // Tout enchant existant (ou dérivé de l'ancien « niveau ») est BAKÉ dans effect.value
      // (magnitude préservée), puis enchant remis à 0. Idempotent (enchant 0 → ×1, no-op).
      const ench = it.enchant ?? levelToEnchant(it.level);
      if (!ench) return { ...it, rarity, enchant: 0 };
      const m = enchantMult(ench);
      const bake = (e: ItemEffect) => ({ ...e, value: Math.max(1, round1(e.value * m)) });
      const effect = bake(it.effect);
      const effect2 = it.effect2 ? bake(it.effect2) : undefined;
      const effect3 = it.effect3 ? bake(it.effect3) : undefined;
      return {
        ...it,
        rarity,
        enchant: 0,
        effect,
        ...(effect2 ? { effect2 } : {}),
        ...(effect3 ? { effect3 } : {}),
      };
    };
    r.inventory = arr<Item>(r.inventory).map(fixItem);
    r.cleared_dungeons = arr<string>(r.cleared_dungeons);
    r.defeated_bosses = arr<string>(r.defeated_bosses);
    r.equipped = obj<Equipped>(r.equipped);
    for (const k of Object.keys(r.equipped) as (keyof Equipped)[]) {
      const it = r.equipped[k];
      if (it) r.equipped[k] = fixItem(it);
    }
    r.consumables = obj<Record<string, number>>(r.consumables);
    // Loadouts (migr. 0051) : max 3 sets rangés ; on normalise le rang des objets rangés.
    r.loadouts = arr<Loadout>(r.loadouts)
      .slice(0, MAX_LOADOUTS)
      .map((l) => {
        const items = obj<Equipped>(l?.items);
        for (const k of Object.keys(items) as (keyof Equipped)[])
          if (items[k]) items[k] = fixItem(items[k]);
        // ⚠️ Les DOUBLONS du set (v0.839) étaient perdus ici : on ne rendait que `items`, et
        // la prochaine sauvegarde réécrivait les loadouts sans eux.
        return { items, spares: arr<Item>(l?.spares).map(fixItem) };
      });
    r.messages = arr<ExpeditionMessage>(r.messages);
    r.energy_log = arr<EnergyLogEntry>(r.energy_log);
    // Bâtiments (migr. 0046). On DROPPE les types disparus du registre (ex. l'ancien
    // 'fragment_vein' ; 'energy_font'/'warehouse' retirés v0.599) → pas d'emplacement
    // fantôme. ⚠️ On ne RE-PACK les slots QUE si nécessaire (`repackBuildingSlots`) : un
    // repack INCONDITIONNEL ramenait chaque bâtiment à l'index suivant le plus bas dès le
    // premier `persist()` — silencieusement contraire à « on construit là où on touche »
    // (v0.867), qui laisse le joueur choisir un emplacement vide au-delà du prochain index
    // libre. Le filet reste : un slot hors bornes ou en doublon (type retiré du registre,
    // ligne corrompue) est toujours recompacté.
    // 🛕 FUSION DU PANTHÉON (v0.949) — Guilde + Centre de formation + Équipementier.
    // ⚠️ ELLE PASSE **AVANT** LE FILTRE, et c'est tout l'enjeu : après, les trois types
    // ont disparu du registre, donc la ligne au-dessus les aurait déjà effacés — avec
    // 7,42 M d'or investis (mesuré en base). Même ordre que la fouille et `advanceBase`
    // (v0.772). ⚠️ Le remboursement vit ICI, collé à la fusion, pour que l'or et les
    // bâtiments voyagent ENSEMBLE dans la même ligne en mémoire ; `load()` les persiste
    // aussitôt, sans quoi une écriture qui ne porterait que l'or rembourserait deux fois.
    const soin = healBuildings(arr<Building>(r.buildings));
    if (soin.goldRefund > 0) r.gold = (r.gold ?? 0) + soin.goldRefund;
    r.buildings = soin.buildings;
    r.set_pieces_seen = obj<Record<string, string[]>>(r.set_pieces_seen); // migr. 0047
    // 🎰 Le PITY doit survivre à un rechargement : remis à zéro, la garantie anti-
    // malchance (garanti au 90e tirage) serait inatteignable, et ici il n'y a aucun
    // argent réel pour compenser une série noire.
    const g = obj<Partial<GachaState>>(r.gacha);
    r.gacha = {
      sinceTop: Math.max(0, Math.floor(Number(g.sinceTop) || 0)),
      sinceFloor: Math.max(0, Math.floor(Number(g.sinceFloor) || 0)),
      pulls: Math.max(0, Math.floor(Number(g.pulls) || 0)),
      ...(g.v ? { v: Math.floor(Number(g.v)) } : {}),
    };
    if (typeof r.stones !== 'number') r.stones = 0; // colonne récente (migr. 0045)
    if (typeof r.parchemins !== 'number') r.parchemins = 0; // colonne récente (migr. 0048)
    if (typeof r.fragments !== 'number') r.fragments = 0; // colonne récente (migr. 0049)
    if (typeof r.summon_stones !== 'number') r.summon_stones = 0; // colonne récente (migr. 0050)
    if (typeof r.gacha_tickets !== 'number') r.gacha_tickets = 0; // 🎟️ migr. 0082
    if (typeof r.gear_version !== 'number') r.gear_version = 0; // ⚙️ migr. 0088
    r.seals = normalizeSeals(r.seals); // 🔱 migr. 0083
    if (typeof r.ink_dust !== 'number') r.ink_dust = 0; // poussière d'encre (migr. 0053)
    if (typeof r.enchant_scrolls !== 'number') r.enchant_scrolls = 0; // migr. 0054
    if (typeof r.protections !== 'number') r.protections = 0; // migr. 0054
    if (r.voie === undefined) r.voie = null; // migr. 0055 (spécialisation)
    // 🔩 → 🪙 LA FERRAILLE EST RETIRÉE (v0.998). La réserve d'un compte est convertie en
    // or, une fois, au taux de l'épave (`SCRAP_TO_GOLD`). ⚠️ Même politique que le
    // Panthéon : la conversion vit ICI, pour que l'or et la ferraille à zéro voyagent dans
    // la MÊME ligne en mémoire ; `fetchMine` les persiste aussitôt, sans quoi une écriture
    // qui ne porterait que l'or convertirait deux fois.
    const scrapLeft = typeof r.scrap === 'number' ? Math.max(0, r.scrap) : 0;
    if (scrapLeft > 0) r.gold = (r.gold ?? 0) + scrapLeft * SCRAP_TO_GOLD;
    r.scrap = 0;
    if (!r.base || typeof r.base !== 'object' || Array.isArray(r.base)) r.base = null;
    // 🐾 LE CHENIL EST RETIRÉ (v0.996) — son investissement est RENDU. ⚠️ AVANT le filtre
    // des types inconnus ci-dessous, sinon il disparaîtrait sans rien rendre (même ordre
    // que la fusion du Panthéon). `fetchMine` persiste aussitôt (`settleLegacy`).
    if (r.base) {
      const k = retireKennel({ ...r.base, defenses: arr<DefenseStructure>(r.base.defenses) });
      if (k.gold) {
        r.gold = (r.gold ?? 0) + k.gold;
        r.base = k.base;
      }
    }
    // Une structure dont le type a disparu du registre est DROPPÉE (même politique que
    // les bâtiments) → pas d'enceinte fantôme après un renommage de type.
    if (r.base)
      r.base.defenses = arr<DefenseStructure>(r.base.defenses).filter((d) => defenseType(d.typeId));
    if (!r.expedition || typeof r.expedition !== 'object') r.expedition = null;
    if (!r.expedition_map || typeof r.expedition_map !== 'object') r.expedition_map = null;
    return r;
  }

  async function fetchMine() {
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
    row.value = normalizeRow(data ?? null);
    loaded.value = true;
    if (row.value && (legacy.goldRefund > 0 || legacyScrap > 0 || kennelGold > 0))
      await settleLegacy(uid, {
        pantheon: legacy.goldRefund,
        scrap: legacyScrap,
        kennel: kennelGold,
      });
    if (row.value) await settleWipe(uid);
    if (row.value) await settleGachaReset(uid);
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
        gacha: { sinceTop: 0, sinceFloor: 0, pulls: 0, v: GACHA_VERSION },
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

  async function persist(userId: string, patch: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('characters')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select(COLS)
      .single();
    if (error) throw error;
    // NORMALISE comme fetchMine (migration rangs/enchant/roll) : sans ça, la ligne relue
    // après un write repartait BRUTE → valeurs (rang/qualité/puissance) potentiellement
    // différentes de l'état chargé → chiffres qui « bougent » (cf. tickets combat).
    row.value = normalizeRow(data);
    return data;
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
      stones?: number; // pierres magiques 💎 (filet diffus, familiers)
      summonStones?: number; // pierres d'invocation 🔮 (drop de donjon nettoyé)
      parchemins?: number; // parchemins 📜 (filet de donjon nettoyé, niveau des talents)
      inkDust?: number; // poussière d'encre (filet de donjon nettoyé, RANG des talents)
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
    // Clé d'expédition : ~2 % sur un donjon NETTOYÉ (raréfié 2026‑08‑18 : les gros
    // volumes de runs inondaient les clés → le Labyrinthe redevient un événement rare).
    const gotKey = input.clearedDungeonId && Math.random() < 0.02 ? 1 : 0;
    return persist(userId, {
      gold: cur.gold + input.gold,
      stones: cur.stones + (input.stones ?? 0),
      summon_stones: cur.summon_stones + (input.summonStones ?? 0),
      parchemins: cur.parchemins + (input.parchemins ?? 0),
      ink_dust: cur.ink_dust + (input.inkDust ?? 0),
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
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
      stones?: number; // pierres magiques 💎 (jalon boss)
      parchemins?: number; // parchemins 📜 (jalon boss, niveau des talents)
      inkDust?: number; // poussière d'encre (jalon boss, RANG des talents)
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
    // réaffrontements (raréfié 2026‑08‑18) → pas de flux de clés en spammant un boss.
    const keyGain = firstDefeat ? 1 : input.defeated && Math.random() < 0.06 ? 1 : 0;
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
      stones: cur.stones + (input.defeated ? (input.stones ?? 0) : 0),
      parchemins: cur.parchemins + (input.defeated ? (input.parchemins ?? 0) : 0),
      ink_dust: cur.ink_dust + (input.defeated ? (input.inkDust ?? 0) : 0),
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
      stones?: number; // pierres magiques 💎 (fin de jeu)
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    return persist(userId, {
      gold: cur.gold + input.gold,
      stones: cur.stones + (input.stones ?? 0),
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

  /** 🪙 VENTE AUTOMATIQUE des talents et familiers en trop : par catégorie, seuls le
   *  MEILLEUR et celui qu'on PORTE restent (règle dans `familiarSurplus` / `talentSurplus`,
   *  testée). Une seule écriture pour tout le lot ; rien à vendre → aucune écriture.
   *  Rend l'or gagné et le nombre de pièces cédées (pour l'annonce). */
  async function sellSurplusCompanions(
    userId: string,
  ): Promise<{ gold: number; familiars: number; talents: number }> {
    const none = { gold: 0, familiars: 0, talents: 0 };
    const cur = row.value;
    if (!cur) return none;
    const famIds = new Set(familiarSurplus(cur.equipped[FAMILIAR_SLOT], cur.inventory));
    const talIds = new Set(talentSurplus(cur.talents));
    if (!famIds.size && !talIds.size) return none;
    const fams = cur.inventory.filter((i) => famIds.has(i.id));
    const tals = cur.talents.filter((t) => talIds.has(t.id));
    const gold =
      fams.reduce((s, i) => s + sellValue(i), 0) +
      tals.reduce(
        (s, t) => s + sellValueOf(talentRank(talentTier(t.xp)), talentRollOf(t), t.level ?? 1),
        0,
      );
    await persist(userId, {
      gold: cur.gold + gold,
      ...(fams.length ? { inventory: cur.inventory.filter((i) => !famIds.has(i.id)) } : {}),
      ...(tals.length ? { talents: cur.talents.filter((t) => !talIds.has(t.id)) } : {}),
    });
    goldFx.gain(gold);
    return { gold, familiars: fams.length, talents: tals.length };
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
    // 🎟️ Les tickets d'abord s'ils couvrent le prix, sinon la mana — jamais un mélange.
    const pay = pullPayment(count, { tickets: cur.gacha_tickets, mana: cur.mana });
    if (!pay) return null;
    const lot = pullMany(Math.random, cur.gacha, count);
    let advs = cur.adventurers ?? [];
    let manaBack = 0;
    const pieces: Omit<AdvGear, 'id'>[] = [];
    const results: LotItem[] = [];
    for (const r of lot.results) {
      if (r.champion) {
        const g = grantChampion(advs, r.champion, {
          id: `adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        });
        advs = g.advs;
        manaBack += g.manaBack;
        results.push({ ...g, grade: r.grade, champion: r.champion, gear: null });
      } else {
        const piece = gachaPiece(advs);
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
      mana: cur.mana - (pay.kind === 'mana' ? pay.cost : 0) + manaBack,
      ...(pay.kind === 'tickets' ? { gacha_tickets: cur.gacha_tickets - pay.cost } : {}),
      adventurers: advs,
      gacha: { ...lot.pity, pulls: cur.gacha.pulls + count, v: GACHA_VERSION },
      ...(pieces.length ? { adv_gear: withAdvGear(cur, pieces) } : {}),
    });
    return results;
  }

  /** La pièce d'un tirage B — sa LETTRE est tirée à part (`rollGearGrade`) : les pièces A
   *  et S sortent des tirages B (décision de l'utilisateur). `rollGachaPiece` est la seule
   *  source d'équipement de champion. */
  function gachaPiece(advs: Adventurer[]): Omit<AdvGear, 'id'> {
    return rollGachaPiece(Math.random, advs, { grade: rollGearGrade(Math.random) });
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

  // Choisit/retire la VOIE (spécialisation) — petit passif + capstone du set de la voie. Réversible.
  async function setVoie(userId: string, voie: string | null) {
    if (!row.value) return;
    await persistOptimistic(userId, { voie });
  }

  // OPTIMISEUR D'ÉQUIPEMENT (v0.607) : trouve la MEILLEURE combinaison (voie + 4 slots) parmi
  // l'équipé + le sac + les réserves de set. Il ÉVALUE PLUSIEURS VOIES : la voie actuelle et
  // toute voie dont on possède ≥3 pièces de set (assez pour viser son capstone 4-pièces). Pour
  // chaque voie candidate, il verse SA réserve dans le pool, calcule le meilleur loadout (bonus
  // de set + capstone gaté par cette voie), et retient la voie qui donne la plus forte puissance.
  // Si la meilleure voie diffère de l'actuelle, il CHANGE de voie automatiquement. Les non-retenus
  // sont re-rangés (pièce de set → réserve de sa voie ; loose → sac). Le familier n'est pas touché.
  /** Le PLAN proposé par l'optimiseur, sans rien appliquer. ⚠️ C'est un TOUT COHÉRENT :
   *  les talents sont choisis POUR ce gear, la voie POUR son capstone. Accepter une partie
   *  seulement donne donc un autre build — c'est pourquoi `applyGearPlan` **recalcule**
   *  au lieu d'appliquer des morceaux, et pourquoi l'écran de revue doit recalculer le
   *  gain de chaque ligne au lieu d'afficher un chiffre figé. */
  async function computeGearPlan(
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    forceVoie?: string | null, // « Porter ce set » : impose cette voie (pas de choix auto)
    /** « Porter ce set » : impose AUSSI ses pièces, pas seulement sa voie.
     *  ⚠️ Sans ça, le bouton lançait l'optimiseur voie forcée mais stuff LIBRE — il rendait
     *  donc le meilleur build sur cette voie, souvent sans une seule pièce du set demandé
     *  (constaté : « Porter le set Frénétique » → 2 Gardien + 1 Duelliste + 1 Berserker).
     *  Le chiffre annoncé était juste ; c'est le bouton qui ne tenait pas sa promesse. */
    forceSetId?: string,
    /** Rendre le build MÊME s'il n'améliore pas l'actuel (cf. `bestBuild`). */
    always?: boolean,
    /** Appelée entre deux voies pour RENDRE LA MAIN à l'interface (cf. la boucle). */
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

    // Plan complet pour une voie candidate (vIdx = index VOIES, -1 = aucune voie).
    type Plan = {
      equipped: Equipped;
      score: number;
      voie: string | null;
      talents: TalentInstance[]; // talents équipés retenus pour ce plan
    };
    function planFor(vIdx: number, polish = false): Plan {
      const voie = vIdx >= 0 ? VOIES[vIdx]!.id : null;
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
      const fxOf = (ids: string[]) =>
        mergeEffects(talentEffects(withEquipped(ids)), voiePassiveEffects(voie));
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
      return { equipped, score, voie, talents: withEquipped(talIds) };
    }

    // Voies candidates. `forceVoie` (Porter ce set) → cette voie UNIQUEMENT. Sinon : l'actuelle
    // + toute voie dont on possède ≥3 pièces (réserve) → on peut switcher pour le capstone.
    const cand = new Set<number>();
    if (forceVoie !== undefined) {
      cand.add(forceVoie === null ? -1 : VOIES.findIndex((v) => v.id === forceVoie));
    } else {
      // ⚠️ TOUTES les voies, plus « aucune ». On ne retenait que la voie actuelle et celles
      // dont la réserve comptait ≥3 pièces : une voie à 2 pièces — donc éligible au bonus
      // 2-pièces ET à son passif — n'était jamais essayée, et « aucune voie » ne l'était
      // qu'en dernier recours. Le coût d'un plan de plus est marginal devant le balayage.
      for (let k = 0; k < MAX_LOADOUTS; k++) cand.add(k);
      cand.add(-1);
    }

    // ⚠️ EXPLORATION SANS POLISSAGE : la passe d'amélioration locale coûte ~500 ms sur un
    // gros sac, et on essaie une dizaine de voies × 2 passes — la polir partout prenait
    // 9 SECONDES et l'écran paraissait mort. On explore vite, puis on POLIT le gagnant :
    // la garantie « aucun échange simple ne gagne » n'a besoin de tenir que sur le plan
    // effectivement proposé.
    let bestIdx: number | null = null;
    let best: Plan | null = null;
    for (const vi of cand) {
      const p = planFor(vi);
      if (!best || p.score > best.score) {
        best = p;
        bestIdx = vi;
      }
      // ⚠️ ON REND LA MAIN ENTRE CHAQUE VOIE. Le calcul entier dure ~3 s : le laisser
      // filer d'un trait FIGE l'onglet — l'utilisateur l'a constaté deux fois, et même
      // un ⏳ annoncé ne rattrape pas une interface qui ne répond plus. Découpé, chaque
      // tranche ne bloque que ~180 ms : on ne le remarque pas.
      if (respire) await respire();
    }
    if (!best || bestIdx === null) return null;
    best = planFor(bestIdx, true);
    // GARDE-FOU ANTI-REGRESSION : on ne remplace le build actuel que par du STRICTEMENT
    // meilleur. Sans ca, un changement de regle (ex. plafond de talents abaisse) pourrait
    // faire PERDRE de la puissance a un clic sur « equipement automatique ».
    const curScore = combatPower(
      playerWithGear(
        name,
        stats,
        cur.equipped,
        mergeEffects(
          talentEffects(cur.talents),
          voiePassiveEffects(cur.voie as Parameters<typeof voiePassiveEffects>[0]),
        ),
        level,
        cur.voie,
      ),
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
    return computeGearPlan(stats, level, name, undefined, undefined, true, respire);
  }

  /** Le plan proposé, SANS rien appliquer — c'est ce que l'écran de revue affiche. */
  function previewGearPlan(
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    respire?: () => Promise<void>,
  ) {
    return computeGearPlan(stats, level, name, undefined, undefined, undefined, respire);
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
      voie: target.voie,
      talents,
    });
    return true;
  }

  /** Ancien geste « tout appliquer d'un coup » — conservé pour « Porter ce set », qui
   *  impose une voie et n'a pas à passer par un écran de revue. */
  async function optimizeGear(
    userId: string,
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
    forceVoie?: string | null,
    forceSetId?: string,
  ): Promise<boolean> {
    const plan = await computeGearPlan(stats, level, name, forceVoie, forceSetId);
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
  async function expeSyncMap(userId: string, now: number, level: number) {
    const cur = row.value;
    if (!cur) return;
    const prev = cur.expedition_map;
    // 🕳️ LES FAILLES MÛRES SE LISENT ICI, AVANT `advanceWorld` — c'est le SEUL instant où
    // elles sont encore sur la carte : lui les remplace par leur mine de mana résiduel.
    // Après lui, il n'y a plus rien à voir, et l'armée disparaîtrait avec la faille.
    const over = prev ? riftOverflows(prev, now) : [];
    // 🗺️ L'Avant-poste fixe la taille de la carte révélée et son nombre de lieux (v0.1047).
    const outpost = buildingLevel(cur.buildings, 'outpost');
    const map: ExpeditionMap = prev
      ? advanceWorld(prev, now, level, outpost, cur.expedition?.poi.id)
      : createMap(newSeed(now), now, level, outpost);
    // ⚠️ ON NE MARQUE QU'UNE BASE QUI EXISTE. Sans enceinte, personne ne vient assiéger
    // (`raidsEnabled`) et `advanceBase` effacerait le marquage au tick suivant : en créer
    // une ici pour la marquer aussitôt serait une base née d'un effet de bord, avec une
    // graine qui n'est pas celle que le tick de base lui aurait donnée.
    const base = over.length && cur.base ? markOverflow(cur.base, over.map(riftOverflowOf)) : null;
    const mapChanged = JSON.stringify(map) !== JSON.stringify(prev);
    // `markOverflow` rend la MÊME référence quand il n'y a rien de plus récent à poser.
    const baseChanged = !!base && base !== cur.base;
    if (!mapChanged && !baseChanged) return;
    // ⚠️ UNE SEULE ÉCRITURE pour les deux. Persister la carte sans le marquage ferait
    // disparaître la faille en laissant son armée nulle part ; persister le marquage sans
    // la carte la ferait redéborder au tick suivant. Le marquage est idempotent
    // (`riftOverflowOf` est daté du débordement, pas de `now`), donc un échec d'écriture
    // se rattrape au tick d'après au lieu de dupliquer la menace.
    await persist(userId, {
      ...(mapChanged ? { expedition_map: map } : {}),
      ...(baseChanged ? { base } : {}),
    });
  }
  // Envoie le héros (dépense l'or, retire le POI de la carte, calcule l'issue seedée).
  async function expeSend(userId: string, poi: Poi, hero: Combatant, now: number, level: number) {
    const cur = row.value;
    if (!cur) return;
    if (cur.expedition) throw new Error('Une expédition est déjà en cours.');
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
    const exp = startExpedition(
      hero,
      poi,
      now,
      (now ^ (poi.level * 2654435761)) >>> 0 || 1,
      travelTimeMult(cur.buildings),
      level,
    );
    const baseMap =
      cur.expedition_map ??
      createMap(newSeed(now), now, level, buildingLevel(cur.buildings, 'outpost'));
    const map: ExpeditionMap = { ...baseMap, pois: baseMap.pois.filter((p) => p.id !== poi.id) };
    await persist(userId, { expedition: exp, expedition_map: map });
  }
  // À l'arrivée à l'objectif : dépose le rapport (une seule fois). Renvoie le message si nouveau.
  async function expeTick(userId: string, now: number): Promise<ExpeditionMessage | null> {
    const cur = row.value;
    const exp = cur?.expedition;
    if (!cur || !exp || now < exp.midAt || exp.reported) return null;
    const msg = buildMessage(exp);
    const messages = boxWith(cur, [msg], MESSAGES_CAP);
    await persist(userId, { expedition: { ...exp, reported: true }, messages });
    return msg;
  }
  // Au retour en ville : crédite le butin (or/poussière/objet/clé) et libère le héros.
  /** RETOUR EN VILLE. Le héros rentre — il est de nouveau disponible — mais **son
   *  chargement reste dans la sacoche** : c'est le joueur qui l'encaisse, depuis la boîte
   *  📬 (`expeClaim`). ⚠️ Le héros est libéré SANS condition : le bloquer jusqu'à ce qu'on
   *  vienne cliquer punirait l'absence, ce que le jeu ne fait jamais. Le butin, lui, ne se
   *  périme pas : il attend dans la boîte aussi longtemps qu'il faut. */
  async function expeSettle(userId: string, now: number): Promise<ExpeditionMessage | null> {
    const cur = row.value;
    const exp = cur?.expedition;
    if (!cur || !exp || now < exp.returnAt) return null;
    // Le rapport a pu être déposé à l'arrivée sur l'objectif (`expeTick`) ; sinon (app
    // fermée tout du long) on le dépose maintenant. Dans les deux cas il porte le butin.
    const msg = buildMessage({ ...exp, reported: true });
    // ⚠️ DÉJÀ DÉPOSÉ → on NE RÉÉCRIT PAS la boîte. L'ancien code REMPLAÇAIT le rapport par
    // `buildMessage(...)`, qui porte `claimed: false` : un butin encaissé entre le retour
    // (`claimAt`) et ce tick redevenait encaissable (revue finale des camps — or, objets, XP
    // d'escorte, pièces d'aventurier). Sinon, `depositMessages` n'ajoute que l'absent.
    const messages = exp.reported ? null : boxWith(cur, [msg], MESSAGES_CAP);
    await persist(userId, {
      ...(messages && messages !== cur.messages ? { messages } : {}),
      expedition: null,
    });
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
    const msg: ExpeditionMessage = {
      id,
      chest: true,
      title: '🐉 Coffre du boss entre amis',
      level: chest.trophy.level,
      win: true,
      text:
        chest.early > 0
          ? `${bossName} — abattu avec ${Math.round(chest.early * 100)} % du temps restant.`
          : `${bossName} — abattu.`,
      gold: chest.gold,
      energy: 0,
      summonStones: chest.stones,
      item: chest.trophy,
      itemName: chest.trophy.name,
      items: [chest.trophy],
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
    // dressage des compagnons, salaires. ⚠️ `m.party` ABSENT des rapports d'avant : rien à
    // faire. ⚠️ Crédité UNE fois : `isClaimable` en tête + `claimed: true` dans la MÊME
    // écriture. ⚠️ Le héros et l'escorte ont été libérés au RETOUR, sans condition ; seul
    // le butin attendait ce geste.
    const party = m.party;
    let partyPatch: Record<string, unknown> = {};
    let wages = 0;
    // ⭐ Ce que la mission a changé pour le GROUPE — étoiles, rang, « prêt pour l'ascension ».
    // Les convois l'annonçaient depuis la v0.794 ; les camps et les failles, jamais.
    let advProgress: AdvProgress[] = [];
    if (party) {
      const claim = partyClaimRoster(party, advList.value, {
        pantheonLevel: pantheonLevel.value,
        infirmaryLevel: defenseLevel(cur.base?.defenses ?? [], 'infirmary'),
        now,
      });
      wages = claim.wages;
      advProgress = advProgressOf(advList.value, claim.adventurers);
      partyPatch = {
        adventurers: claim.adventurers,
        ...gearTrainedPatch(cur, advList.value, claim.adventurers),
      };
    }
    // ⚠️ ENTIERS À L'ENCAISSEMENT : ces colonnes sont `integer`, une valeur décimale fait
    // échouer la sauvegarde ENTIÈRE sans rien afficher (bug de la cargaison, v0.796).
    const ent = (n: number | undefined) => Math.max(0, Math.round(n || 0));
    // Marqué AVANT l'écriture : tout écrivain de la boîte qui tourne pendant la requête le
    // garde `claimed: true` (`depositMessages`). Retiré si l'écriture échoue.
    claimedLocally.add(m.id);
    try {
      await persist(userId, {
        // Les salaires de l'escorte sont déduits ICI, comme pour un convoi.
        // 🔩 LEGACY : un rapport déposé avant le retrait de la ferraille la rend en or.
        gold: Math.max(
          0,
          cur.gold + ent(m.gold) + (party ? 0 : ent(m.scrap)) * SCRAP_TO_GOLD - wages,
        ),
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
        // 🔱 sceaux du gardien d'une faille refermée (`riftSeals`).
        ...(m.seals && m.seals.n > 0
          ? { seals: addSeals(cur.seals, m.seals.kind, m.seals.rank, m.seals.n) }
          : {}),
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
    return { ...m, advProgress };
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
      ...(tickets ? { gacha_tickets: cur.gacha_tickets + tickets } : {}),
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
  function heroIsHome(cur: CharacterRow): boolean {
    return !cur.expedition;
  }

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
  }> {
    if (!row.value) return { detected: null, report: null, advProgress: [] };
    const cur = row.value;
    if (!cur) return { detected: null, report: null, advProgress: [] };
    const t = advanceBase(baseOf(cur, now), ctx, now);
    if (!t.dueRaid) {
      if (t.changed) await persist(userId, { base: t.base });
      return { detected: t.detected, report: null, advProgress: [] };
    }

    const home = heroIsHome(cur);
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
      advList.value.filter((a) => advAvailable(a, now)),
      engageCap(pantheonLevel.value),
      cctx,
    );
    const report = resolveRaid(
      {
        defenses: t.base.defenses,
        playerLevel: ctx.playerLevel,
        hero: home ? ctx.hero : null,
        guard: guardUnits(ctx.playerLevel, defenders, engageCap(pantheonLevel.value), cctx),
      },
      t.dueRaid,
      now,
      home,
    );
    const { base: nb, damage, corpses } = applyRaidOutcome(t.base, t.dueRaid, report, ctx, now);
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
        )
      : null;
    const drops = (loot?.items ?? []).map((it) => ({ ...it, id: crypto.randomUUID() }));
    if (loot) {
      patch.gold = cur.gold + loot.gold;
      patch.summon_stones = cur.summon_stones + loot.summonStones;
      patch.keys = cur.keys + loot.keys;
      // Le relevé part avec le rapport : on le pose sur la base que `applyRaidOutcome`
      // vient de rendre, pas dans un second `persist`.
      patch.base = {
        ...nb,
        lastLoot: {
          corpses: corpses.length,
          gold: loot.gold,
          keys: loot.keys,
          summonStones: loot.summonStones,
          items: drops.length,
        },
      };
    }
    // ⚠️ CEUX QUI ONT DÉFENDU APPRENNENT (demandé par l’utilisateur). Les familiers postés
    // gagnaient de l’XP depuis la v0.663 ; les aventuriers, qui tiennent pourtant la
    // brèche, n’en gagnaient aucune — rester défendre coûtait un convoi ET la progression
    // qui va avec. Le barème vit dans `siegeXp` (lib, testé), jamais ici.
    // 🤕 Siège PERDU : ceux qui sont tombés partent à l’infirmerie, comme le héros, pour
    // la MÊME durée (l’Infirmerie l’abrège). La règle vit dans `siegeHurtIds` (lib).
    const hurt = new Set(siegeHurtIds(report));
    const hurtUntil =
      now + woundMsFor(defenseLevel(t.base.defenses, 'infirmary'), raidIntervalMs(ctx.activeDays7));
    if (defenders.length) {
      const ids = new Set(defenders.map((a) => a.id));
      const gains: Record<string, number> = {};
      patch.adventurers = advList.value.map((a) => {
        if (!ids.has(a.id)) return a;
        const gain = siegeXp(a, report);
        gains[a.id] = gain;
        const next = grantAdvXp(a, gain, pantheonLevel.value);
        return hurt.has(a.id)
          ? { ...next, hurtUntil: Math.max(next.hurtUntil ?? 0, hurtUntil) }
          : next;
      });
      Object.assign(patch, gearTrainedPatch(cur, advList.value, patch.adventurers as Adventurer[]));
    }
    // ⭐ La MÊME lecture que les camps, les failles et les convois (`advProgressOf`) : un
    // champion qui bute sur son ★5 en défendant doit l'apprendre comme ailleurs.
    const advProgress = defenders.length
      ? advProgressOf(advList.value, patch.adventurers as Adventurer[])
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
    return { detected: t.detected, report, advProgress };
  }

  /** Soins d'urgence : remet le héros sur pied TOUT DE SUITE, contre de l'OR (cher)
   *  proportionnel au repos qu'il reste. Il y a donc toujours une porte de sortie —
   *  attendre reste gratuit, payer ne fait qu'acheter l'immédiateté. */
  async function healHero(userId: string, now: number, playerLevel: number) {
    const cur = row.value;
    if (!cur?.base?.wound) return;
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

  /** ⬆️ ASCENSION d'un champion : il paie l'or et les sceaux du rang visé, le rang s'ouvre, et
   *  l'XP mise de côté à ★5 est reversée (`ascendAdventurer`). ⚠️ Le refus vit ICI, avec la
   *  MÊME règle que le bouton (`ascensionBlocker`) : l'écran ne propose pas l'impossible, il
   *  ne le garantit pas. Rend `null` si c'est fait, sinon la raison du refus. */
  /** 🗡️ Les pièces portées apprennent avec leur champion (`trainWornGear`, lib) : le patch
   *  `adv_gear` à joindre à TOUTE écriture qui change le vivier par de l'XP. Vide si rien
   *  n'a bougé — on n'écrit pas `adv_gear` à vide. */
  function gearTrainedPatch(cur: CharacterRow, before: Adventurer[], after: Adventurer[]) {
    const stock = cur.adv_gear?.stock ?? [];
    const next = trainWornGear(before, after, stock);
    return next === stock ? {} : { adv_gear: { ...(cur.adv_gear ?? {}), stock: next } };
  }

  /** ⬆️ ASCENSION D'UNE PIÈCE : rang suivant contre de l'or et des sceaux d'objet de ce rang.
   *  Même règle que le bouton (`advGearAscensionBlocker`). `null` si c'est fait. */
  async function ascendGear(userId: string, gearId: string): Promise<string | null> {
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
    const up = ascendAdventurer(adv, pantheonLevel.value);
    await persist(userId, {
      gold: cur.gold - cost.gold,
      seals: addSeals(cur.seals, 'champion', next, -cost.seals),
      adventurers: advs.map((a) => (a.id === advId ? up : a)),
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

  /** Retire des pièces du STOCK et les désassigne. 🔒 et pièces PORTÉES exclues —
   *  même politique que le sac du héros. Helper de la vente. */
  function dropAdvGear(cur: CharacterRow, ids: string[]) {
    const worn = new Set((cur.adventurers ?? []).flatMap((a) => Object.values(a.gear ?? {})));
    const stock = cur.adv_gear?.stock ?? [];
    const gone = stock.filter((g) => ids.includes(g.id) && !g.locked && !worn.has(g.id));
    return {
      gone,
      state: { stock: stock.filter((g) => !gone.includes(g)) },
    };
  }
  /** 🪙 VEND des pièces du stock — la moitié d'un objet du héros de même grade. */
  async function sellAdvGear(userId: string, ids: string[]) {
    const cur = row.value;
    if (!cur) return;
    const { gone, state } = dropAdvGear(cur, ids);
    if (!gone.length) return;
    const gold = gone.reduce((s, g) => s + advGearSellValue(g), 0);
    await persist(userId, { gold: cur.gold + gold, adv_gear: state });
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
    const total =
      got.stone +
      got.energy +
      got.parchemins +
      got.fragments +
      got.ink_dust +
      got.summon +
      got.keys;
    if (total <= 0) return null;
    // Report du reliquat : chaque filon n'avance son `collectedAt` que du temps des
    // unités ENTIÈRES récoltées → pas de perte de fraction, un filon lent n'est plus
    // affamé par des récoltes fréquentes (cf. nextCollectedAt).
    await persistOptimistic(userId, {
      login_energy: cur.login_energy + got.energy, // ⚡ Dynamo → énergie de jeu
      summon_stones: cur.summon_stones + got.summon, // 🔮 Autel des boss
      keys: cur.keys + got.keys, // 🗝️ Porte du Labyrinthe
      stones: cur.stones + got.stone,
      parchemins: cur.parchemins + got.parchemins,
      fragments: cur.fragments + got.fragments,
      ink_dust: cur.ink_dust + got.ink_dust,
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
  const caravanList = computed<Caravan[]>(() => row.value?.caravans ?? []);
  /** ⚔️ Groupes de camp partis SANS le héros (migr. 0077). Avec le héros, le voyage vit
   *  dans `expedition`. */
  const partyList = computed<ActiveParty[]>(() => row.value?.parties ?? []);
  /** 🗡️ Le STOCK d'équipement des aventuriers (migr. 0068) — séparé du sac du héros. */
  const advGearStock = computed<AdvGear[]>(() => row.value?.adv_gear?.stock ?? []);
  /** 🛕 Le niveau du PANTHÉON — un seul bâtiment depuis la fusion (v0.949), donc un seul
   *  niveau : il porte le DÉPLOIEMENT (combien de champions engagés à la fois) et la
   *  FORGE (le temps de fabrication d'une pièce). ⚠️ Il porte aussi le plafond d'XP d'un
   *  champion (`grantAdvXp`) — c'est le « le sport fixe le plafond » de cette boucle. */
  const pantheonLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'pantheon'));
  // ⚠️ L'AVANT-POSTE, depuis qu'il a absorbé le Comptoir de caravanes : un seul bâtiment
  // règle tout le VOYAGE — trajet du héros, vitesse ET nombre des convois.
  // Le nom du binding reste `comptoirLevel` : c’est le paramètre que lisent
  // `caravanSlots`, `convoySlotsFree` et `caravanLegMin`, et le renommer partout
  // n'apprendrait rien de plus.
  const comptoirLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'outpost'));

  /** Encaisse la cargaison d'un convoi rentré (devises, XP par aventurier, blessés) et rend
   *  **ce que la mission a changé pour l’escorte** (`AdvProgress[]`), ou `null` si rien n’a
   *  été encaissé.
   *
   *  ⚠️ `o.xp` contient DÉJÀ le socle de mission ET la part des bandits abattus, calculés au
   *  départ (moteur de groupe) ; un convoi lancé avant la bascule porte l'XP de l'ancien
   *  moteur dans le même champ — rien à distinguer ici.
   *  ⚠️ `o.hurt` N'EST PAS « ceux qui sont tombés » : c'est la règle `convoyHurt`. Embuscade
   *  GAGNÉE → personne (les tombés se relèvent) ; embuscade PERDUE → le PREMIER tombé seul.
   *  ⚠️ Un booléen ne suffisait plus : le niveau d’un aventurier est CACHÉ, donc une
   *  étoile gagnée en convoi ne se voyait qu’en rouvrant la Guilde. L’écran a besoin
   *  du AVANT/APRÈS pour l’annoncer — et c’est la LIB qui compare, pas lui.
   *  ⚠️ Une liste VIDE reste « encaissé avec succès » (elle est truthy) : c’est `null`
   *  qui dit l’échec. */
  async function claimCaravan(userId: string, caravanId: string) {
    const cur = row.value;
    const van = caravanList.value.find((c) => c.id === caravanId);
    if (!cur || !van || !isCaravanClaimable(van, Date.now())) return null;
    const o = van.outcome;
    const before = advList.value;
    // XP, blessés et salaires : la règle vit dans `caravanClaimRoster` (lib, testée), jumelle
    // de `partyClaimRoster`. ⚠️ C'est elle qui garantit qu'une convalescence n'est JAMAIS
    // raccourcie — le calcul écrit ici écrasait `hurtUntil` et remettait debout trop tôt un
    // aventurier déjà alité plus longtemps (siège perdu).
    const { adventurers: advs, wages } = caravanClaimRoster(van, before, {
      pantheonLevel: pantheonLevel.value,
      infirmaryLevel: defenseLevel(cur.base?.defenses ?? [], 'infirmary'),
      now: Date.now(),
    });
    // ⚠️ ON ARRONDIT À L'ENCAISSEMENT, pas seulement à la production. Ces cinq colonnes
    // sont des ENTIERS : une valeur décimale fait échouer la sauvegarde entière avec
    // `invalid input syntax for type integer`, et l'écran ne montre RIEN. Corriger la
    // formule ne suffit pas — les cargaisons DÉJÀ calculées portent la valeur fautive
    // dans leur `outcome`, et elles resteraient irrécupérables à vie. On soigne donc à
    // la lecture, comme les POI périmés et les garnisons obsolètes : le code se corrige,
    // la donnée se répare toute seule au passage.
    const ent = (n: number) => Math.max(0, Math.round(n || 0));
    await persist(userId, {
      // Les salaires sont déduits ICI, à l'encaissement : l'aventurier est payé au retour.
      // (`wages` vient de `caravanClaimRoster`, déjà entier — comme la voie des groupes.)
      // 🔩 LEGACY : un convoi lancé avant le retrait de la ferraille la rend en or.
      gold: Math.max(0, cur.gold + ent(o.gold) + ent(o.scrap ?? 0) * SCRAP_TO_GOLD - wages),
      login_energy: cur.login_energy + ent(o.energy),
      summon_stones: cur.summon_stones + ent(o.summonStones),
      keys: cur.keys + ent(o.keys),
      adventurers: advs,
      ...gearTrainedPatch(cur, before, advs),
      caravans: caravanList.value.map((c) => (c.id === caravanId ? { ...c, claimed: true } : c)),
    });
    if (o.gold > o.wages) goldFx.gain(o.gold - o.wages);
    return advProgressOf(before, advs);
  }

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
    opts: { hero: PartyHero | null; escortIds: string[]; playerLevel: number; now: number },
  ): Promise<string | null> {
    // ⚠️ Rend la RAISON d'un refus (null = parti) : un « départ impossible » générique laissait
    // deviner lequel des aventuriers, de l'or ou du héros bloquait.
    const cur = row.value;
    if (!cur) return 'ton personnage n’est pas chargé';
    const { now, hero } = opts;
    // ⚠️ Un id répété ferait partir deux fois le même aventurier.
    if (new Set(opts.escortIds).size !== opts.escortIds.length)
      return 'un aventurier est choisi deux fois';
    const escort = opts.escortIds
      .map((id) => advList.value.find((a) => a.id === id))
      .filter((a): a is Adventurer => !!a && advAvailable(a, now));
    if (escort.length !== opts.escortIds.length)
      return 'un aventurier du groupe n’est plus disponible';
    // ⚠️ Groupe vide, ou SANS le héros alors que tous les créneaux de convoi sont pris : la
    // MÊME règle que l'écran (`partySendBlocker`), un seul pool avec les convois.
    const sendBlock = partySendBlocker(
      poi,
      escort.length,
      !!hero,
      convoySlotsFree(comptoirLevel.value, [...caravanList.value, ...partyList.value], now),
      engageCap(pantheonLevel.value),
    );
    if (sendBlock) return PARTY_SEND_BLOCK_LABEL[sendBlock];
    // 🧝 Avec le héros : la MÊME règle que l'écran lit pour dire POURQUOI il est grisé
    // (déjà parti, infirmerie, Avant-poste, or) — `partyHeroBlocker`, une seule définition.
    const heroBlock = hero
      ? partyHeroBlocker({
          onExpedition: !!cur.expedition,
          healMs: woundRemainingMs(cur.base, now),
          outpost: expeditionsUnlocked(cur.buildings),
        })
      : null;
    if (heroBlock) return `héros : ${PARTY_HERO_BLOCK_LABEL[heroBlock]}`;
    // 🗡️ Ce que le groupe emmène (`escortKitOf`).
    const road = escortKitOf(cur);
    const seed = (now ^ (poi.level * 2654435761)) >>> 0 || 1;
    const leg = partyLegMin(poi, escort, {
      hero: !!hero,
      travelMult: travelTimeMult(cur.buildings),
      gearSpeed: advGearRoles(escort, road.advGear).speed,
    });
    // ⚔️🕳️ LA DISPATCH VIT ICI, à l’UNIQUE chemin d’envoi : `startParty` ne choisit plus la
    // résolution, il REÇOIT l’issue. Un camp se résout par son combat de faction, une faille
    // par son incursion (attrition, gardien, mana). ⚠️ EXPLICITE, et non « camp sinon faille » :
    // le jour où `PARTY_TARGETS` accueille un troisième type, il sera REFUSÉ ici au lieu
    // d’être résolu en silence comme une incursion.
    const spec = campSpecOf(poi);
    const outcome = isRiftPoi(poi)
      ? resolveIncursion({ poi, escort, road, hero, seed, now })
      : isWarbandPoi(poi)
        ? resolveInterception({ poi, escort, road, hero, seed, playerLevel: opts.playerLevel })
        : spec
          ? resolveCamp({ poi, spec, escort, road, hero, seed, playerLevel: opts.playerLevel })
          : HARVEST_TYPES.has(poi.type)
            ? resolveHarvestParty({ poi, escort, road, hero, seed, playerLevel: opts.playerLevel })
            : null;
    if (!outcome) return PARTY_SEND_BLOCK_LABEL.notTarget;
    const trip = startParty({ poi, hero, seed }, now, leg, outcome);
    const busy = new Set(opts.escortIds);
    const map = cur.expedition_map
      ? { ...cur.expedition_map, pois: cur.expedition_map.pois.filter((p) => p.id !== poi.id) }
      : cur.expedition_map;
    await persist(userId, {
      expedition_map: map,
      adventurers: advList.value.map((a) =>
        busy.has(a.id) ? { ...a, busyUntil: trip.returnAt } : a,
      ),
      ...(hero
        ? { expedition: trip }
        : { parties: [...partyList.value, { ...trip, id: `party_${now.toString(36)}` }] }),
    });
    return null;
  }

  /** ⚔️ Cycle de vie des groupes partis SANS le héros : le rapport à l'arrivée sur le camp,
   *  puis le groupe retiré au retour (ses aventuriers sont libérés par `busyUntil`). Le
   *  BUTIN reste à encaisser dans la boîte 📬 (`expeClaim`), comme toute expédition.
   *  La règle vit dans `settleParties` (lib, testée). ⚠️ Une seule écriture, et seulement si
   *  quelque chose change : ce tick bat chaque seconde. Rend les messages nouvellement déposés. */
  async function partyTick(userId: string, now: number): Promise<ExpeditionMessage[]> {
    const cur = row.value;
    if (!cur || !partyList.value.length) return [];
    const box = boxWith(cur, [], MESSAGES_CAP);
    const t = settleParties(partyList.value, box, now, MESSAGES_CAP);
    if (!t.changed) return [];
    // ⚔️ UNE INTERCEPTION GAGNÉE LÈVE LE MARQUAGE — ici, à l'instant où la bataille a lieu
    // (le rapport se dépose à l'arrivée sur l'objectif), et NON à l'encaissement : ce n'est
    // pas du butin, c'est une perte évitée. L'adosser au clic ferait perdre le bénéfice
    // d'une victoire à qui oublie d'ouvrir sa boîte — on ne punit pas l'absence.
    // ⚠️ Le marquage SEUL : si l'armée est déjà tirée, elle garde la force que la Tour de
    // guet a annoncée (règle écrite sur `Raid.overflow` : figée au tirage). L'interception
    // agit sur le PROCHAIN siège, et l'écran le dit avant l'envoi.
    const gagne = t.fresh.some((m) => m.poiType === 'warband' && m.win);
    const base = gagne && cur.base?.overflow ? { ...cur.base, overflow: null } : null;
    // ⚠️ `messages` seulement si la boîte a changé (`settleParties` rend la même référence
    // sinon) : au retour seul, réécrire la boîte de ce tick pourrait écraser un encaissement
    // enregistré entre-temps et rendre le butin encaissable deux fois.
    await persist(userId, {
      parties: t.parties,
      ...(base ? { base } : {}),
      ...(t.messages !== cur.messages ? { messages: t.messages } : {}),
      // (`box` diffère de `cur.messages` si un encaissement en cours y est marqué : l'écrire
      //  ne fait que le confirmer.)
    });
    return t.fresh;
  }

  return {
    settleGearRefonte,
    row,
    loaded,
    fetchMine,
    accrueBossTokens,
    spentBossTokens,
    setPseudo,
    expeSyncMap,
    expeSend,
    expeTick,
    expeSettle,
    grantComboChest,
    grantFriendBossChest,
    expeClaim,
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
    sellAdvGear,
    toggleAdvGearLock,
    withAdvGear,
    autoAssignGear,
    healHero,
    healAdventurers,
    heroIsHome,
    ownedLevel,
    applyRun,
    applyBossWin,
    chooseReward,
    applyEndless,
    spendKey,
    advList,
    caravanList,
    escortKit,
    advGearStock,
    pantheonLevel,
    comptoirLevel,
    claimCaravan,
    partyList,
    sendParty,
    partyTick,
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
    setVoie,
    equipReplacing,
    unequip,
    equipTalent,
    unequipTalent,
    setEquippedTalents,
    sellTalent,
    sellFamiliar,
    sellFamiliars,
    sellSurplusCompanions,
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
