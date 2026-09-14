// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { comboChestMessageId, type ComboChestRecord } from '@/lib/comboChest';
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
  scrapValue,
  canRecycle,
  sellValueOf,
  levelToEnchant,
  enchantMult,
  round1,
  normRank,
  fillSetPieceAffixes,
  bestGearLoadout,
  playerWithGear,
  mergeEffects,
  SLOTS,
  FAMILIAR_SLOT,
  MAX_LOADOUTS,
  grantFamiliarXp,
  rarityRank,
  type Item,
  type ItemEffect,
  type ItemSlot,
  type Equipped,
  type Loadout,
  type PendingReward,
  voieSetRoster,
  setRecycleLot,
} from '@/lib/items';
import {
  fileSetPieces,
  ownedInLoadouts,
  normalizeLoadouts,
  promoteSpare,
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
import { voiePassiveEffects, VOIES } from '@/lib/voies';
import { keysAfterPaying } from '@/data/labyrinths';
import {
  isClaimable,
  createMap,
  advanceWorld,
  startExpedition,
  buildMessage,
  goldCost as expeGoldCost,
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
  plotsForLevel,
  collectable,
  nextCollectedAt,
  storageMult,
  expeditionsUnlocked,
  travelTimeMult,
  type Building,
  buildingLevel,
} from '@/lib/buildings';
import { combatPower, type Combatant } from '@/lib/combat';
import {
  advanceBase,
  applyRaidOutcome,
  resolveRaid,
  siegeXp,
  guardUnits,
  emptyBase,
  defenseType,
  defenseLevel,
  ownedLevel,
  repairCost,
  defenseUpgradeCost,
  defenseUpgradeScrap,
  scavengerCount,
  scavengeMs,
  advanceScavenging,
  lootCorpses,
  startRepair,
  finishRepairNow,
  rushRepairCost,
  totalRepairCost,
  companionPairs,
  companionPerks,
  autoCompanions,
  siegeFamiliarXp,
  type CompanionCtx,
  companionRankLabel,
  canCompanion,
  fatigueMsFor,
  healCost,
  woundRemainingMs,
  type BaseState,
  type DefenseId,
  type DefenseStructure,
  type Raid,
  type RaidReport,
} from '@/lib/raid';
import {
  advAvailable,
  settleAllTraining,
  canPromoteNow,
  classChoices,
  advProgressOf,
  advRarity,
  grantAdvXp,
  guildRoster,
  recruitCost,
  type Adventurer,
} from '@/lib/adventurers';
import {
  canSendCaravan,
  caravanHurtMs,
  caravanSlots,
  caravanFamiliarXp,
  canAdvTalent,
  canAdvFamiliar,
  companionsOf,
  trainMsFor,
  isCaravanClaimable,
  pruneCaravans,
  startCaravan,
  type Caravan,
} from '@/lib/caravan';
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
  scrap: number; // 🔩 ferraille : répare l’enceinte (migr. 0060) // journal d'énergie hors-sport horodaté (migr. 0057)
  adventurers: Adventurer[] | null; // vivier de la Guilde (migr. 0061)
  caravans: Caravan[] | null; // convois en route ou dont la cargaison attend (migr. 0061)
}

// Énergie offerte à la création du perso (~1 session ≈ de quoi lancer plusieurs
// premiers donjons) → le joueur n'est pas bloqué à 0 énergie au départ.
export const WELCOME_ENERGY = 400;

// Jour calendaire LOCAL (YYYY-MM-DD) à l'instant `ms` — utilisé pour horodater les
// entrées du journal d'énergie hors-sport (energy_log).
function isoDayLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export class PseudoTakenError extends Error {
  constructor() {
    super('Ce pseudo est déjà pris.');
    this.name = 'PseudoTakenError';
  }
}

export const useCharacterStore = defineStore('character', () => {
  const row = ref<CharacterRow | null>(null);
  const loaded = ref(false);
  const goldFx = useGoldFx(); // petite animation « + or » à chaque vente

  const COLS =
    'user_id, pseudo, gold, dust, energy_spent, equipped, inventory, talents, cleared_dungeons, defeated_bosses, login_streak, login_grace_used, last_login_date, login_energy, consumables, reward_level, endless_best, pending_reward, keys, stones, parchemins, fragments, ink_dust, enchant_scrolls, protections, summon_stones, expedition, expedition_map, messages, buildings, set_pieces_seen, loadouts, voie, energy_log, base, scrap, adventurers, caravans';

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
    r.adventurers = arr<Adventurer>(r.adventurers);
    // ⚠️ Les convois ENCAISSÉS sont taillés au chargement : la liste ne se purgeait
    // jamais (35 convois mesurés sur un compte réel, dont 30 dépensés). Un non-encaissé
    // n'est JAMAIS jeté — il porte une cargaison.
    r.caravans = pruneCaravans(arr<Caravan>(r.caravans));
    // Rangs (2026‑08‑18) : objets sauvegardés aux ANCIENNES raretés → nouveaux rangs.
    const fixItem = (it: Item): Item => {
      const rarity = normRank(it.rarity);
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
        return { items };
      });
    r.messages = arr<ExpeditionMessage>(r.messages);
    r.energy_log = arr<EnergyLogEntry>(r.energy_log);
    // Bâtiments (migr. 0046). On DROPPE les types disparus du registre (ex. l'ancien
    // 'fragment_vein' ; 'energy_font'/'warehouse' retirés v0.599) → pas d'emplacement
    // fantôme, puis on RE-PACK les slots à 0..n-1 (triés par slot d'origine) pour que les
    // bâtiments restants tiennent dans le nombre d'emplacements réduit (plotCap).
    r.buildings = arr<Building>(r.buildings)
      .filter((b) => !!buildingType(b.typeId))
      .sort((a, b) => a.slot - b.slot)
      .map((b, i) => ({ ...b, slot: i }));
    r.set_pieces_seen = obj<Record<string, string[]>>(r.set_pieces_seen); // migr. 0047
    if (typeof r.stones !== 'number') r.stones = 0; // colonne récente (migr. 0045)
    if (typeof r.parchemins !== 'number') r.parchemins = 0; // colonne récente (migr. 0048)
    if (typeof r.fragments !== 'number') r.fragments = 0; // colonne récente (migr. 0049)
    if (typeof r.summon_stones !== 'number') r.summon_stones = 0; // colonne récente (migr. 0050)
    if (typeof r.ink_dust !== 'number') r.ink_dust = 0; // poussière d'encre (migr. 0053)
    if (typeof r.enchant_scrolls !== 'number') r.enchant_scrolls = 0; // migr. 0054
    if (typeof r.protections !== 'number') r.protections = 0; // migr. 0054
    if (r.voie === undefined) r.voie = null; // migr. 0055 (spécialisation)
    if (typeof r.scrap !== 'number') r.scrap = 0; // colonne récente (migr. 0060)
    if (!r.base || typeof r.base !== 'object' || Array.isArray(r.base)) r.base = null;
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
    row.value = normalizeRow(data ?? null);
    loaded.value = true;
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
  /** Crédite l'XP d'ATTAQUE au familier ÉQUIPÉ. Appelé par TOUS les modes où le
   *  familier booste le héros (donjon, boss, faille, Labyrinthe, arène) — c'est là qu'il
   *  se bat, donc c'est là qu'il apprend. Appliqué APRÈS la distribution du butin : sinon
   *  un drop de familier auto-équipé écraserait le gain de celui qui a couru. */
  function trainRunFamiliar(
    dist: { equipped: Equipped; inventory: Item[] },
    input: { famAtkXp?: number; playerLevel?: number },
  ) {
    const fam = dist.equipped[FAMILIAR_SLOT];
    if (!fam || !input.famAtkXp) return;
    const trained = grantFamiliarXp(fam, input.famAtkXp, input.playerLevel ?? 1);
    if (trained !== fam) dist.equipped = { ...dist.equipped, [FAMILIAR_SLOT]: trained };
  }

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
      // Dressage d'ATTAQUE du familier ÉQUIPÉ : le compagnon qui t'a suivi au donjon
      // progresse. Contextuel : cette XP ne vaut qu'équipé, jamais au chenil.
      famAtkXp?: number;
      playerLevel?: number; // plafond du dressage (le sport reste le plafond)
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
    trainRunFamiliar(dist, input);
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
      famAtkXp?: number; // dressage d'attaque du familier équipé
      playerLevel?: number;
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const firstDefeat = input.defeated && !cur.defeated_bosses.includes(input.bossId);
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

  // Applique une tentative de la Faille sans fin : dépense l'énergie, encaisse
  // or + poussière + butin ; si victoire ET palier plus profond, met à jour le record.
  async function applyEndless(
    userId: string,
    input: {
      tier: number;
      energyCost: number;
      famAtkXp?: number;
      playerLevel?: number;
      gold: number;
      drops: Item[];
      cleared: boolean;
      stones?: number; // pierres magiques 💎 (fin de jeu)
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    trainRunFamiliar(dist, input);
    return persist(userId, {
      gold: cur.gold + input.gold,
      stones: cur.stones + (input.stones ?? 0),
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      endless_best: input.cleared && input.tier > cur.endless_best ? input.tier : cur.endless_best,
      // ~10 % de clé d'expédition sur une faille nettoyée.
      keys: cur.keys + (input.cleared && Math.random() < 0.1 ? 1 : 0),
    });
  }

  // ── Expéditions (donjons à étages) ──
  // Consomme les clés d’un palier du Labyrinthe (garde-fou : refuse si le compte n’y est pas).
  async function spendKey(userId: string, n = 1): Promise<boolean> {
    const cur = row.value;
    // ⚠️ Le prix ENTIER (règle dans `keysAfterPaying`, testée) : un palier profond coûte
    // plusieurs clés, et on n’entre pas avec une clé pour trois.
    const reste = cur ? keysAfterPaying(cur.keys, n) : null;
    if (reste === null) return false;
    await persist(userId, { keys: reste });
    return true;
  }
  // Crédite le butin d'une expédition/Labyrinthe (or + poussière + parchemins
  // d'enchant 📜 + objets au sac/équipés vides ; un familier passe simplement dans `drops`).
  async function applyExpedition(
    userId: string,
    input: {
      gold: number;
      drops: Item[];
      famAtkXp?: number;
      playerLevel?: number;
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
    trainRunFamiliar(dist, input);
    return persist(userId, {
      gold: cur.gold + input.gold,
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
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

  // ♻️ Envoie un objet du sac À LA FORGE → ferraille 🔩 (réparations et défenses).
  // ⚠️ ALTERNATIVE à la vente, pas un bonus : l'objet est consommé une fois. Un familier
  // ne se recycle jamais (`canRecycle`), un objet 🔒 non plus — mêmes garde-fous que la
  // vente, sinon le verrou ne protégerait que d'une des deux portes.
  async function recycle(userId: string, itemId: string): Promise<number> {
    const cur = row.value;
    if (!cur) return 0;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item || !canRecycle(item)) return 0;
    const gain = scrapValue(item);
    await persist(userId, {
      scrap: cur.scrap + gain,
      inventory: cur.inventory.filter((i) => i.id !== itemId),
    });
    return gain;
  }

  // Recycle EN MASSE une liste d'objets du sac (par id) → ferraille. Renvoie le total.
  async function recycleMany(userId: string, ids: string[]): Promise<number> {
    const cur = row.value;
    if (!cur || !ids.length) return 0;
    const set = new Set(ids);
    const targets = cur.inventory.filter((i) => set.has(i.id) && canRecycle(i));
    if (!targets.length) return 0;
    const rm = new Set(targets.map((t) => t.id)); // ne retire QUE les recyclables
    const gain = targets.reduce((a, it) => a + scrapValue(it), 0);
    await persist(userId, {
      scrap: cur.scrap + gain,
      inventory: cur.inventory.filter((i) => !rm.has(i.id)),
    });
    return gain;
  }

  /** Cède un FAMILIER contre de l'or. ⚠️ **La seule vente qui subsiste**, et c'est
   *  cohérent : on ne fond pas un animal à la forge — `scrapValue` rend d'ailleurs 0 pour
   *  le slot familier, si bien que le brancher sur le recyclage rendait le bouton inerte.
   *  Un familier dont on ne veut plus se cède ; un objet se refond. */
  async function sellFamiliar(userId: string, itemId: string): Promise<number> {
    return sellFamiliars(userId, [itemId]);
  }

  /** Vente GROUPÉE de familiers (les doublons). Une seule écriture, une seule animation
   *  d'or : vendre huit compagnons ne doit pas déclencher huit allers-retours réseau ni
   *  huit pièces qui volent. Le 🔒 protège ici comme partout ailleurs.
   *
   *  ⚠️ UN FAMILIER EN POSTE NE SE VEND PAS (signalé par l'utilisateur). Celui qu'on
   *  PORTE était déjà hors d'atteinte par construction — il vit dans `equipped`, pas
   *  dans `inventory`. Mais un familier POSTÉ AU MUR, lui, reste dans l'inventaire :
   *  `base.garrison` n'est qu'une liste d'ids qui pointent dessus. Il était donc
   *  vendable, et sa vente laissait un id FANTÔME dans la garnison — une place occupée
   *  par personne, que `garrisonedFamiliars` filtrait en silence. On le refuse ici,
   *  au STORE : l'écran peut ne pas proposer l'impossible, il ne peut pas le garantir. */
  async function sellFamiliars(userId: string, itemIds: string[]): Promise<number> {
    const cur = row.value;
    if (!cur || !itemIds.length) return 0;
    const wanted = new Set(itemIds);
    // ⚠️ On ne vend pas un familier CONFIÉ à un aventurier : il partirait avec un
    // appariement fantôme, et l’homme se battrait sans son compagnon sans qu’on l’ait
    // décidé. (Le familier PORTÉ par le héros, lui, vit dans `equipped` : hors d’atteinte
    // par construction.)
    const posted = new Set(
      (cur.adventurers ?? []).map((a) => a.familiarId).filter((x): x is string => !!x),
    );
    const sold = cur.inventory.filter(
      (i) => wanted.has(i.id) && i.slot === FAMILIAR_SLOT && !i.locked && !posted.has(i.id),
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
      energy_log: pushEnergyLog(cur.energy_log, {
        date: todayIso,
        emoji: '🎁',
        label: 'Bonus de connexion',
        amount: energy,
      }),
    });
    return { streak: next.streak, energy, usedGrace };
  }

  // Bonus de passage de niveau (global). Verse l'énergie de chaque niveau franchi
  // depuis le dernier récompensé (croissant). reward_level=0 = jamais initialisé →
  // on cale la base au niveau actuel SANS bonus rétroactif. Renvoie l'événement à
  // célébrer, ou null. Idempotent (basé sur reward_level persisté).
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
    await persist(userId, {
      reward_level: currentLevel,
      login_energy: cur.login_energy + energy,
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
    return { from: prev, to: currentLevel, energy };
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
  async function equipReplacing(userId: string, itemId: string, disposal: 'recycle' | 'keep') {
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
    if (prev && disposal === 'recycle' && canRecycle(prev)) {
      sold = scrapValue(prev);
      patch.scrap = cur.scrap + sold;
    } else if (prev) inventory.push(prev); // keep (ou pièce 🔒 : le verrou protège)
    patch.inventory = inventory;
    const res = await persist(userId, patch);
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

  // Fond un SET de voie : sa réserve, ses doublons ET ses pièces au sac → ferraille.
  // Renvoie le gain. ⚠️ Le lot vient de `setRecycleLot` (lib), le même que l’écran annonce :
  // la carte montrait des pièces au sac que le bouton ne touchait pas (v0.806).
  // ⚠️ Les pièces 🔒 restent RANGÉES dans le set : le verrou protège de toutes les sorties.
  async function recycleLoadout(
    userId: string,
    i: number,
    score: (it: Item) => number,
  ): Promise<number> {
    const cur = row.value;
    const voie = VOIES[i];
    if (!cur || !voie || i < 0 || i >= MAX_LOADOUTS) return 0;
    const lo = cur.loadouts[i];
    const { melt, keep } = setRecycleLot(`voie:${voie.id}`, lo, cur.inventory);
    if (!melt.length) return 0;
    const fondues = new Set(melt.map((it) => it.id));
    const gain = melt.reduce((s, it) => s + scrapValue(it), 0);
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
      scrap: cur.scrap + gain,
      inventory: cur.inventory.filter((it) => !fondues.has(it.id)),
      loadouts,
    });
    return gain;
  }

  /** Range dans leur set TOUTES les pièces de set de voie du sac (v0.839) — la meilleure à
   *  l'emplacement, l'autre en doublon, rien à la forge. `skipIds` : pièces à laisser au sac
   *  pour l'instant (le drop d'un boss pas encore révélé). Une seule écriture. */
  async function fileBagSetPieces(
    userId: string,
    score: (it: Item) => number,
    skipIds: ReadonlySet<string> = new Set(),
  ): Promise<FiledPiece[]> {
    const cur = row.value;
    if (!cur) return [];
    const pieces = cur.inventory.filter((it) => voieSetIndex(it) >= 0 && !skipIds.has(it.id));
    if (!pieces.length) return [];
    const { loadouts, filed } = fileSetPieces(cur.loadouts, pieces, score);
    const moved = new Set(filed.map((f) => f.item.id));
    await persist(userId, {
      inventory: cur.inventory.filter((it) => !moved.has(it.id)),
      loadouts,
    });
    return filed;
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

  /** Fond les doublons d'un set (ou de tous). Les 🔒 restent. Renvoie la ferraille gagnée. */
  async function recycleSpares(userId: string, setIndex?: number): Promise<number> {
    const cur = row.value;
    if (!cur) return 0;
    const { melt } = sparesLot(cur.loadouts, setIndex);
    if (!melt.length) return 0;
    const fondus = new Set(melt.map((it) => it.id));
    const loadouts = normalizeLoadouts(cur.loadouts).map((l) => ({
      ...l,
      spares: (l.spares ?? []).filter((it) => !fondus.has(it.id)),
    }));
    const gain = melt.reduce((s, it) => s + scrapValue(it), 0);
    await persist(userId, { scrap: cur.scrap + gain, loadouts });
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
      for (const s of [...SLOTS, FAMILIAR_SLOT]) equipped[s] = best[s];
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
    const allSlots = [...SLOTS, FAMILIAR_SLOT];
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
    const map: ExpeditionMap = cur.expedition_map
      ? advanceWorld(cur.expedition_map, now, level, cur.expedition?.poi.id)
      : createMap(newSeed(now), now, level);
    if (JSON.stringify(map) !== JSON.stringify(cur.expedition_map))
      await persist(userId, { expedition_map: map });
  }
  // Envoie le héros (dépense l'or, retire le POI de la carte, calcule l'issue seedée).
  async function expeSend(userId: string, poi: Poi, hero: Combatant, now: number, level: number) {
    const cur = row.value;
    if (!cur) return;
    if (cur.expedition) throw new Error('Une expédition est déjà en cours.');
    // ⚠️ L'infirmerie n'était vérifiée que par l'écran Aventure (`expeBlocked`) : depuis la
    // carte, un héros blessé repartait. Le refus vit ici pour qu'aucun écran ne l'oublie.
    const healIn = woundRemainingMs(cur.base, now);
    if (healIn > 0)
      throw new Error(
        `🤕 Ton héros est à l’infirmerie — de retour dans ${Math.ceil(healIn / 60000)} min.`,
      );
    if (!expeditionsUnlocked(cur.buildings))
      throw new Error('Construis un Avant-poste d’expédition pour envoyer des héros.');
    const cost = expeGoldCost(poi.type, poi.level);
    if (cur.gold < cost) throw new Error('Pas assez d’or pour cette expédition.');
    // Réduction de trajet selon le niveau de l'avant-poste.
    const exp = startExpedition(
      hero,
      poi,
      now,
      (now ^ (poi.level * 2654435761)) >>> 0 || 1,
      travelTimeMult(cur.buildings),
      level,
    );
    const baseMap = cur.expedition_map ?? createMap(newSeed(now), now, level);
    const map: ExpeditionMap = { ...baseMap, pois: baseMap.pois.filter((p) => p.id !== poi.id) };
    await persist(userId, { gold: cur.gold - cost, expedition: exp, expedition_map: map });
  }
  // À l'arrivée à l'objectif : dépose le rapport (une seule fois). Renvoie le message si nouveau.
  async function expeTick(userId: string, now: number): Promise<ExpeditionMessage | null> {
    const cur = row.value;
    const exp = cur?.expedition;
    if (!cur || !exp || now < exp.midAt || exp.reported) return null;
    const msg = buildMessage(exp);
    const messages = [msg, ...cur.messages].slice(0, 20);
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
    const messages = exp.reported
      ? cur.messages.map((m) => (m.id === msg.id ? msg : m))
      : [msg, ...cur.messages].slice(0, 20);
    await persist(userId, { messages, expedition: null });
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
      scrap: chest.scrap,
      key: chest.keys,
      resolvedAt: chest.at,
      claimAt: chest.at, // pas de route à faire : le coffre est déjà là
      claimed: false,
      read: false,
    };
    await persist(userId, { messages: [msg, ...cur.messages].slice(0, 30) });
    return true;
  }

  async function expeClaim(userId: string, messageId: string, now: number) {
    const cur = row.value;
    if (!cur) return null;
    const m = cur.messages.find((x) => x.id === messageId);
    if (!m || !isClaimable(m, now)) return null;
    // Objets ramenés : l'arène en rend PLUSIEURS ; `item` seul = messages d'avant `items`.
    const drops = (m.items && m.items.length ? m.items : m.item ? [m.item] : []).map((it) => ({
      ...it,
      id: crypto.randomUUID(),
    }));
    const inventory = drops.length ? [...cur.inventory, ...drops] : cur.inventory;
    await persist(userId, {
      gold: cur.gold + m.gold,
      login_energy: cur.login_energy + (m.energy ?? 0), // ⚡ mine/source → énergie de jeu
      keys: cur.keys + (m.key ?? 0),
      // ⚠️ DEVISES VIVANTES UNIQUEMENT. Le commentaire qui tenait ici affirmait qu'on ne
      // créditait plus de monnaie morte — et les deux lignes suivantes créditaient des
      // fragments 🧩 et de l'encre 🖋️. Un commentaire ne vérifie rien ; un test si.
      summon_stones: cur.summon_stones + (m.summonStones ?? 0),
      scrap: cur.scrap + (m.scrap ?? 0), // 🔩 épaves → réparation de l’enceinte
      inventory,
      messages: cur.messages.map((x) =>
        x.id === messageId ? { ...x, claimed: true, read: true } : x,
      ),
      set_pieces_seen: drops.length
        ? mergeSetSeen(cur.set_pieces_seen, drops)
        : cur.set_pieces_seen,
    });
    return m;
  }
  async function expeMarkRead(userId: string) {
    const cur = row.value;
    if (!cur || !cur.messages.some((m) => !m.read)) return;
    await persist(userId, { messages: cur.messages.map((m) => ({ ...m, read: true })) });
  }

  // ── Filons de production passive (village autour de la ville) ──
  // Construit un filon sur un emplacement libre (débloqué par le niveau), payé à l'or.
  async function buildFilon(
    userId: string,
    typeId: string,
    slot: number,
    now: number,
    playerLevel: number,
  ) {
    const cur = row.value;
    const t = buildingType(typeId);
    if (!cur || !t) return;
    const plots = plotsForLevel(playerLevel);
    if (slot < 0 || slot >= plots) return; // emplacement non débloqué
    if (cur.buildings.some((b) => b.slot === slot)) return; // déjà occupé
    if (!canBuildType(typeId, playerLevel, cur.buildings)) return; // niveau/unicité
    if (cur.gold < t.buildGold) return;
    const b: Building = { typeId, level: 1, slot, collectedAt: now };
    await persistOptimistic(userId, {
      gold: cur.gold - t.buildGold,
      buildings: [...cur.buildings, b],
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

  /** Les familiers POSTÉS au chenil. Ils restent dans le sac : poster n'est pas ranger,
   *  c'est affecter — et un familier posté ne peut évidemment pas être équipé, d'où le
   *  filtre sur l'inventaire seul. */
  function garrisonedFamiliars(cur: CharacterRow): Item[] {
    const ids = new Set(cur.base?.garrison ?? []);
    return cur.inventory.filter((it) => it.slot === FAMILIAR_SLOT && ids.has(it.id));
  }

  /** 🐾 CE QUE L’ON A APPAREILLÉ, prêt pour le combat et pour les à-côtés.
   *
   *  ⚠️ REMPLACE `garrisonFor` : il n’y a plus de garnison de familiers postés au mur.
   *  Un familier est confié à un AVENTURIER et le suit partout (demandé par
   *  l’utilisateur) ; le Chenil ne fait que plafonner combien et jusqu’à quel rang. */
  function companionCtx(cur: CharacterRow, now: number): CompanionCtx {
    return {
      familiars: cur.inventory.filter((it) => it.slot === FAMILIAR_SLOT),
      talents: normalizeTalents(cur.talents),
      kennelLevel: defenseLevel(baseOf(cur, now).defenses, 'kennel'),
      now,
      heroFamiliarId: cur.equipped[FAMILIAR_SLOT]?.id ?? null,
      heroTalentIds: normalizeTalents(cur.talents)
        .filter((t) => t.equipped === true)
        .map((t) => t.id),
    };
  }
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
  ): Promise<{ detected: Raid | null; report: RaidReport | null }> {
    // ⚠️ LA FOUILLE PASSE EN PREMIER, et l’ordre n’est pas cosmétique — DEUX raisons.
    // (1) Elle ÉCRIT (butin crédité, champ avancé) : calculer `advanceBase` avant elle
    //     puis persister son `base` écraserait la fouille à chaque tick, en silence.
    // (2) `advanceBase` SUPPRIME un champ périmé. Passer après, c’est perdre le butin
    //     d’une absence longue au lieu de le rattraper — or on ne punit jamais l’absence.
    // Elle avance siège ou pas : elle vit sa vie pendant que le joueur fait autre chose.
    if (!row.value) return { detected: null, report: null };
    await tickScavengers(userId, now, ctx.playerLevel);
    // ⚠️ RELU APRÈS l’await : la fouille vient peut-être de créditer or et objets, et
    // `cur` sert plus bas à reconstruire l’inventaire.
    const cur = row.value;
    if (!cur) return { detected: null, report: null };
    const t = advanceBase(baseOf(cur, now), ctx, now);
    if (!t.dueRaid) {
      if (t.changed) await persist(userId, { base: t.base });
      return { detected: t.detected, report: null };
    }

    const home = heroIsHome(cur);
    // ⚠️ CHAQUE AVENTURIER SE BAT AVEC SON COMPAGNON ET SON TALENT — il n’y a plus de
    // bonus GLOBAL appliqué identiquement à tout le monde. Le Chenil ne fait que
    // plafonner combien peuvent en porter, et jusqu’à quel rang.
    const cctx = companionCtx(cur, now);
    // Les aventuriers DISPONIBLES défendent (ni en convoi, ni à l’infirmerie, ni en
    // formation). Sans eux, il ne reste que le mur et les tourelles.
    // ⚠️ LES DÉFENSEURS SONT NOMMÉS UNE FOIS : le combat et l’XP doivent parler des MÊMES
    // aventuriers. Les reconstruire deux fois, c’est laisser les deux listes diverger.
    const defenders = advList.value.filter((a) => advAvailable(a, now));
    const report = resolveRaid(
      {
        defenses: t.base.defenses,
        playerLevel: ctx.playerLevel,
        hero: home ? ctx.hero : null,
        guard: guardUnits(ctx.playerLevel, defenders, cctx),
      },
      t.dueRaid,
      now,
      home,
    );
    const { base: nb, damage } = applyRaidOutcome(t.base, t.dueRaid, report, ctx, now);
    const patch: Record<string, unknown> = { base: nb };
    // ⚠️ CEUX QUI ONT DÉFENDU APPRENNENT (demandé par l’utilisateur). Les familiers postés
    // gagnaient de l’XP depuis la v0.663 ; les aventuriers, qui tiennent pourtant la
    // brèche, n’en gagnaient aucune — rester défendre coûtait un convoi ET la progression
    // qui va avec. Le barème vit dans `siegeXp` (lib, testé), jamais ici.
    if (defenders.length) {
      const ids = new Set(defenders.map((a) => a.id));
      patch.adventurers = advList.value.map((a) =>
        ids.has(a.id) ? grantAdvXp(a, siegeXp(a, report), guildLevel.value) : a,
      );
    }
    // Les familiers postés SORTENT du siège : ils gagnent de l'XP de DÉFENSE (∝ ce
    // qu'ils ont repoussé) et soufflent un moment. Jamais blessés, jamais perdus —
    // sinon personne ne posterait ses bons familiers et le chenil resterait vide.
    // ⚠️ CE SONT LES COMPAGNONS ENGAGÉS qui sortent du siège — ceux que
    // `companionPairs` a réellement retenus, pas tous ceux qu’on a appareillés : au-delà
    // des places du Chenil, un compagnon reste à la niche et ne se fatigue pas.
    const engages = new Set(
      [...companionPairs(defenders, cctx).values()]
        .map((p) => p.familiar?.id)
        .filter((x): x is string => !!x),
    );
    if (engages.size) {
      const gain = siegeFamiliarXp(report);
      const rest = now + fatigueMsFor(defenseLevel(t.base.defenses, 'infirmary'));
      patch.inventory = cur.inventory.map((it) =>
        engages.has(it.id)
          ? { ...grantFamiliarXp(it, gain, ctx.playerLevel), fatigueUntil: rest }
          : it,
      );
    }
    // Stock VOLÉ = la production accumulée non récoltée. On remet simplement les
    // compteurs à l'heure : on ne peut donc perdre que ce qu'on n'avait pas ramassé,
    // et récolter souvent suffit à ne rien risquer — sans jamais y être obligé.
    if (damage.stockStolen && cur.buildings.length)
      patch.buildings = cur.buildings.map((b) => ({ ...b, collectedAt: now }));
    await persist(userId, patch);
    return { detected: t.detected, report };
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

  /** 🐾 CONFIER (ou reprendre) un COMPAGNON à un aventurier.
   *
   *  ⚠️ REMPLACE `toggleGarrison` / `setGarrison` / `autoAssignGarrison` : il n’y a
   *  plus de garnison ni d’emplacements au mur. Un familier appartient à un HOMME et le
   *  suit partout — convoi comme rempart (demandé par l’utilisateur).
   *
   *  ⚠️ LE REFUS VIT ICI, pas seulement à l’écran : une interface peut ne pas proposer
   *  l’impossible, elle ne peut pas le garantir.
   *
   *  ⚠️ UN FAMILIER NE SERT QU’UN MAÎTRE : le confier à un second le retire au premier,
   *  au lieu de laisser deux hommes croire qu’ils l’ont. C’est ce que le combat ferait
   *  de toute façon (`companionPairs` n’en compte qu’un) — autant que l’écran le dise. */
  async function setCompanion(userId: string, advId: string, famId: string | null) {
    const cur = row.value;
    if (!cur) return;
    const kennel = defenseLevel(cur.base?.defenses ?? [], 'kennel');
    if (famId) {
      if (kennel <= 0) throw new Error(`Construis un Chenil pour confier un familier.`);
      const fam = cur.inventory.find((it) => it.id === famId);
      if (!fam || fam.slot !== FAMILIAR_SLOT) throw new Error(`Ce familier est introuvable.`);
      if (famId === cur.equipped[FAMILIAR_SLOT]?.id)
        throw new Error(`Ton héros le porte déjà — il se bat ailleurs.`);
      if (!canCompanion(fam, kennel))
        throw new Error(
          `Ton Chenil ne sait héberger que jusqu’au rang ${companionRankLabel(kennel)}.`,
        );
      const adv = (cur.adventurers ?? []).find((a) => a.id === advId);
      // ⚠️ Refus AU STORE, comme pour les talents : même règle, même message.
      if (adv && !canAdvFamiliar(adv, fam))
        throw new Error(
          `Trop rare pour ${adv.name} : sa classe est de rang ${rarityRank(advRarity(adv)).name} — promeus-le d’abord.`,
        );
    }
    const adventurers = (cur.adventurers ?? []).map((a) => {
      if (a.id === advId) return { ...a, familiarId: famId ?? undefined };
      return famId && a.familiarId === famId ? { ...a, familiarId: undefined } : a;
    });
    await persistOptimistic(userId, { adventurers });
  }

  /** ✨ CONFIER AU MIEUX tous les compagnons et talents du vivier (`autoCompanions`).
   *  ⚠️ Les règles sont celles de la lib, qui reprend les exclusions de `setCompanion` et
   *  de `setAdvTalent` : héros, Chenil (rang et places), rareté de classe, un seul porteur.
   *  Il REMPLACE les choix faits à la main — l'écran le dit avant le geste.
   *  Rend le nombre de compagnons et de talents confiés, ou `null` sans ligne. */
  async function autoAssignCompanions(
    userId: string,
    now: number,
  ): Promise<{ familiars: number; talents: number } | null> {
    const cur = row.value;
    if (!cur) return null;
    const advs = cur.adventurers ?? [];
    const plan = autoCompanions(advs, companionCtx(cur, now));
    const adventurers = advs.map((a) => ({
      ...a,
      familiarId: plan.get(a.id)?.familiarId,
      talentId: plan.get(a.id)?.talentId,
    }));
    await persistOptimistic(userId, { adventurers });
    return {
      familiars: adventurers.filter((a) => a.familiarId).length,
      talents: adventurers.filter((a) => a.talentId).length,
    };
  }

  /** 🧠 CONFIER (ou reprendre) un TALENT à un aventurier. Mêmes règles que le
   *  compagnon : un seul porteur, et jamais ce que le héros a équipé. */
  async function setAdvTalent(userId: string, advId: string, talentId: string | null) {
    const cur = row.value;
    if (!cur) return;
    if (talentId) {
      const t = normalizeTalents(cur.talents).find((x) => x.id === talentId);
      if (!t) throw new Error(`Ce talent est introuvable.`);
      if (t.equipped === true)
        throw new Error(`Ton héros l’a équipé — retire-le d’abord de ta fiche.`);
      const adv = (cur.adventurers ?? []).find((a) => a.id === advId);
      // ⚠️ Refus AU STORE : l’écran ne propose pas l’impossible, mais il ne le garantit pas.
      if (adv && !canAdvTalent(adv, t))
        throw new Error(
          `Trop rare pour ${adv.name} : sa classe est de rang ${rarityRank(advRarity(adv)).name} — promeus-le d’abord.`,
        );
    }
    const adventurers = (cur.adventurers ?? []).map((a) => {
      if (a.id === advId) return { ...a, talentId: talentId ?? undefined };
      return talentId && a.talentId === talentId ? { ...a, talentId: undefined } : a;
    });
    await persistOptimistic(userId, { adventurers });
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
    if (cur.scrap < t.buildScrap) throw new Error('Pas assez de ferraille 🔩.');
    await persistOptimistic(userId, {
      gold: cur.gold - t.buildGold,
      scrap: cur.scrap - t.buildScrap,
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
    const scrap = defenseUpgradeScrap(d.level);
    if (cur.gold < gold) throw new Error('Pas assez d’or.');
    if (cur.scrap < scrap) throw new Error('Pas assez de ferraille 🔩.');
    void now;
    await persistOptimistic(userId, {
      gold: cur.gold - gold,
      scrap: cur.scrap - scrap,
      base: {
        ...cur.base,
        defenses: cur.base.defenses.map((x) =>
          x.typeId === typeId ? { ...x, level: x.level + 1 } : x,
        ),
      },
    });
  }

  /** Remet une structure en service. En FERRAILLE uniquement : l'or est déjà tendu par
   *  les bâtiments de production, une réparation ne doit pas leur faire concurrence. */
  //  ⚠️ Depuis la v0.802 elle PREND DU TEMPS (`repairMsFor`) : la ferraille est payée au
  //  lancement, la structure reste endommagée jusqu’à la fin des travaux, et c’est leur fin
  //  (`settleRepairs`, au tick) qui relance la production.
  async function repairDefense(userId: string, typeId: DefenseId, now: number) {
    const cur = row.value;
    if (!cur?.base) return;
    const d = cur.base.defenses.find((x) => x.typeId === typeId);
    if (!d?.damaged || d.repairUntil != null) return;
    const cost = repairCost(d.level);
    if (cur.scrap < cost) throw new Error('Pas assez de ferraille 🔩.');
    await persistOptimistic(userId, {
      scrap: cur.scrap - cost,
      base: startRepair(cur.base, typeId, now, buildingLevel(cur.buildings ?? [], 'foundry')),
    });
  }

  /** Lance TOUTES les réparations en attente — le geste qu'on veut faire quand la
   *  production est gelée. Les travaux déjà lancés ne sont ni repayés ni repoussés. */
  async function repairAll(userId: string, now: number) {
    const cur = row.value;
    if (!cur?.base) return;
    const cost = totalRepairCost(cur.base);
    if (cost <= 0) return;
    if (cur.scrap < cost) throw new Error(`Il te faut ${cost} 🔩 pour tout remettre en état.`);
    const foundry = buildingLevel(cur.buildings ?? [], 'foundry');
    let base = cur.base;
    for (const d of cur.base.defenses.filter((x) => x.damaged && x.repairUntil == null))
      base = startRepair(base, d.typeId, now, foundry);
    await persistOptimistic(userId, { scrap: cur.scrap - cost, base });
    return cost;
  }

  /** Termine des travaux TOUT DE SUITE, contre de la ferraille ∝ au temps restant — au même
   *  tarif que les soins d’urgence du héros. Attendre reste gratuit. */
  async function finishRepair(userId: string, typeId: DefenseId, now: number) {
    const cur = row.value;
    if (!cur?.base) return;
    const d = cur.base.defenses.find((x) => x.typeId === typeId);
    if (d?.repairUntil == null || now >= d.repairUntil) return;
    const cost = rushRepairCost(d.repairUntil - now);
    if (cur.scrap < cost) throw new Error(`Il te faut ${cost} 🔩 pour finir les travaux.`);
    await persistOptimistic(userId, {
      scrap: cur.scrap - cost,
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
  async function tickScavengers(userId: string, now: number, playerLevel: number) {
    const cur = row.value;
    const field = cur?.base?.field;
    if (!cur?.base || !field) return null;
    const lvl = defenseLevel(cur.base.defenses, 'salvage');
    const t = advanceScavenging(field, scavengerCount(lvl), now, scavengeMs(lvl));
    if (!t) return null;
    // ⚠️ Rien de neuf → on n’écrit PAS : ce tick bat chaque seconde, et persister à vide
    // enverrait une requête par seconde pendant toute la fouille.
    if (!t.taken.length && t.field.dispatchUntil === field.dispatchUntil) return null;

    const patch: Record<string, unknown> = {};
    let base: BaseState = { ...cur.base, field: t.field };

    if (t.taken.length) {
      const faction = cur.base.lastReport?.faction ?? 'bandits';
      const loot = lootCorpses(
        t.taken,
        faction,
        playerLevel,
        ((t.field.dispatchUntil ?? now) ^ cur.base.seed) >>> 0 || 1,
        companionPerks(advList.value, companionCtx(cur, now)).lootPct,
      );
      const drops = loot.items.map((it) => ({ ...it, id: crypto.randomUUID() }));
      patch.gold = cur.gold + loot.gold;
      patch.summon_stones = cur.summon_stones + loot.summonStones;
      patch.keys = cur.keys + loot.keys;
      if (drops.length) {
        patch.inventory = [...cur.inventory, ...drops];
        patch.set_pieces_seen = mergeSetSeen(cur.set_pieces_seen, drops);
      }
      const p = cur.base.pillage;
      base = {
        ...base,
        pillage: {
          corpses: (p?.corpses ?? 0) + t.taken.length,
          waves: (p?.waves ?? 0) + t.waves,
          gold: (p?.gold ?? 0) + loot.gold,
          keys: (p?.keys ?? 0) + loot.keys,
          summonStones: (p?.summonStones ?? 0) + loot.summonStones,
          items: (p?.items ?? 0) + drops.length,
          startedAt: p?.startedAt ?? now,
        },
      };
    }

    // ⚠️ LE RAPPORT PART QUAND LE CHAMP EST VIDE, et il emporte le cumul : sans lui, une
    // fouille étalée sur des heures ne laisserait aucune trace de ce qu’elle a rapporté.
    const fini = t.done && base.pillage;
    if (fini) {
      const p = base.pillage!;
      const msg: ExpeditionMessage = {
        id: crypto.randomUUID(),
        title: '📜 Rapport de pillage',
        level: cur.base.lastReport?.level ?? playerLevel,
        win: true,
        text:
          `${p.corpses} corps dépouillés en ${p.waves} vague${p.waves > 1 ? 's' : ''}` +
          (p.items ? ` · ${p.items} objet${p.items > 1 ? 's' : ''} au sac.` : '.'),
        gold: p.gold,
        energy: 0,
        summonStones: p.summonStones,
        key: p.keys,
        resolvedAt: now,
        // ⚠️ Déjà crédité vague par vague : ce message se LIT, il ne se réclame pas.
        read: false,
      };
      patch.messages = [msg, ...cur.messages].slice(0, 30);
      base = { ...base, pillage: null, field: null };
    }

    patch.base = base;
    await persistOptimistic(userId, patch);
    return { ...t, fini: !!fini };
  }
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
      got.gold +
      got.summon +
      got.keys +
      got.scrap;
    if (total <= 0) return null;
    // Report du reliquat : chaque filon n'avance son `collectedAt` que du temps des
    // unités ENTIÈRES récoltées → pas de perte de fraction, un filon lent n'est plus
    // affamé par des récoltes fréquentes (cf. nextCollectedAt).
    const mult = storageMult(cur.buildings);
    await persistOptimistic(userId, {
      gold: cur.gold + got.gold, // 🪙 Mine d'or
      login_energy: cur.login_energy + got.energy, // ⚡ Dynamo → énergie de jeu
      summon_stones: cur.summon_stones + got.summon, // 🔮 Autel des boss
      keys: cur.keys + got.keys, // 🗝️ Porte du Labyrinthe
      scrap: cur.scrap + got.scrap, // 🔩 Fonderie → réparation de l’enceinte
      stones: cur.stones + got.stone,
      parchemins: cur.parchemins + got.parchemins,
      fragments: cur.fragments + got.fragments,
      ink_dust: cur.ink_dust + got.ink_dust,
      buildings: cur.buildings.map((b) => ({ ...b, collectedAt: nextCollectedAt(b, now, mult) })),
      energy_log: pushEnergyLog(cur.energy_log, {
        date: isoDayLocal(now),
        emoji: '⚡',
        label: 'Dynamo de faille',
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
  const guildLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'guild'));
  const comptoirLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'caravanserail'));
  const trainingLevel = computed(() => buildingLevel(row.value?.buildings ?? [], 'training'));
  /** ⚠️ Le Chenil est une structure de l’ENCEINTE, pas un bâtiment de la cour — d’où
   *  `defenseLevel` et non `buildingLevel`. Exposé ici parce que DEUX écrans en ont besoin
   *  (la Guilde pour la coupe du dressage, la fiche des familiers pour l’afficher) : chacun
   *  le recalculait, et une étiquette qui refait le calcul finit par contredire le combat. */
  const kennelLevel = computed(() => defenseLevel(row.value?.base?.defenses ?? [], 'kennel'));

  /** Les 3 classes de DÉPART proposées à une nouvelle recrue. Tirées sur une graine
   *  figée à l'avance pour que l'écran affiche exactement ce qui sera recruté. */
  function recruitChoices(seed: number) {
    return classChoices({ id: '', name: '', seed, path: [], level: 1, xp: 0 }, 0);
  }

  /** Recrute un aventurier dans la classe choisie. ⚠️ La Guilde plafonne l'EFFECTIF ; le
   *  coût croît avec le vivier déjà en place, sinon on le remplit d'un coup et « qui
   *  j'élève » cesse d'être une décision. */
  async function recruitAdventurer(userId: string, seed: number, classId: string, name: string) {
    const cur = row.value;
    if (!cur) return false;
    if (guildLevel.value <= 0) return false;
    const roster = advList.value;
    if (roster.length >= guildRoster(guildLevel.value)) return false;
    if (!recruitChoices(seed).some((c) => c.id === classId)) return false; // pas dans l'offre
    const cost = recruitCost(roster.length, guildLevel.value);
    if (cur.gold < cost) return false;
    const adv: Adventurer = {
      id: `adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      seed,
      path: [classId],
      level: 1,
      xp: 0,
    };
    await persist(userId, { gold: cur.gold - cost, adventurers: [...roster, adv] });
    return true;
  }

  /** Valide une promotion au Centre de formation. ⚠️ Le Centre n'est requis QU'À PARTIR de
   *  la 2e strate : la classe de départ se choisit au recrutement, donc un débutant n'a
   *  besoin que de la Guilde et du Comptoir pour lancer la boucle. */
  async function promoteAdventurer(userId: string, advId: string, classId: string) {
    const cur = row.value;
    const adv = advList.value.find((a) => a.id === advId);
    if (!cur || !adv) return false;
    // ⚠️ LA MÊME règle que l’étoile et que le bouton : elle vivait en trois exemplaires
    // avec trois sous-ensembles différents, et l’étoile s’allumait donc pour des
    // promotions que ce garde refusait. Un seul prédicat, un seul endroit.
    if (
      !canPromoteNow(adv, {
        guildLevel: guildLevel.value,
        trainingLevel: trainingLevel.value,
        now: Date.now(),
      })
    )
      return false;
    if (!classChoices(adv).some((c) => c.id === classId)) return false;
    // ⚠️ PAS pendant un convoi (signalé par l'utilisateur : « j'ai pu promouvoir des
    // aventuriers en déplacement »). Il est physiquement sur la route, il ne peut pas
    // être au Centre de formation — et la formation l'immobiliserait une seconde fois,
    // sur une échéance sans rapport avec celle du convoi.
    // ⚠️ On ne teste QUE `busyUntil`, pas `advAvailable` : une formation peut courir
    // pendant une CONVALESCENCE, c'est même le bon moment, et on ne fait pas attendre
    // un blessé deux fois (décision v0.739, à ne pas défaire par mégarde).
    if ((adv.busyUntil ?? 0) > Date.now()) return false;
    // ⚠️ On n'applique PAS la classe tout de suite : on engage une FORMATION. C'est le
    // temps passé au Centre qui la paie, et c'est ce que son niveau raccourcit — sinon
    // son `perLevelNote` (« formations plus courtes ») promet ce que rien ne tient.
    // ⚠️ Une formation peut courir PENDANT une convalescence : c'est même le bon moment,
    // et on ne punit jamais un blessé en lui faisant attendre deux fois.
    if (adv.training) return false; // une seule à la fois
    const next: Adventurer = {
      ...adv,
      // ⚠️ La strate VISÉE, pas celle qu’il a : `path` porte N classes, la promotion
      // en vise donc la N-ième. C’est elle qui fixe la durée (×2 par rang).
      training: {
        classId,
        until: Date.now() + trainMsFor(trainingLevel.value, adv.path.length),
      },
    };
    await persist(userId, {
      adventurers: advList.value.map((a) => (a.id === advId ? next : a)),
    });
    return true;
  }

  /** Envoie un convoi. ⚠️ Le POI est RETIRÉ de la carte au départ, exactement comme pour
   *  le héros — c'est ce qui fait que caravanes et héros se disputent les mêmes lieux. */
  /** Applique les formations arrivées à terme. ⚠️ Appelé par le tick de base (qui
   *  tourne déjà) : sans ça, une promotion ne se conclurait qu'à la prochaine action
   *  touchant le vivier, donc peut-être jamais. */
  async function settleAdventurers(userId: string, now = Date.now()) {
    const r = settleAllTraining(advList.value, now);
    if (!r.changed) return false;
    await persist(userId, { adventurers: r.list });
    return true;
  }

  async function sendCaravan(userId: string, poi: Poi, escortIds: string[]) {
    const cur = row.value;
    if (!cur) return false;
    if (comptoirLevel.value <= 0) return false;
    const now = Date.now();
    const running = caravanList.value.filter((c) => now < c.returnAt).length;
    if (running >= caravanSlots(comptoirLevel.value)) return false;
    const escort = escortIds
      .map((id) => advList.value.find((a) => a.id === id))
      .filter((a): a is Adventurer => !!a && advAvailable(a, now));
    if (escort.length !== escortIds.length || !canSendCaravan(poi, escort)) return false;

    const seed = (now ^ (poi.id.length * 2654435761)) >>> 0 || 1;
    const van = startCaravan(
      `car_${now.toString(36)}`,
      poi,
      escort,
      now,
      seed,
      // 🐾🧠 Ce que l'escorte emmène. Le héros garde ce qu'il porte : il se bat ailleurs.
      {
        familiars: (cur.inventory ?? []).filter((it: Item) => it.slot === FAMILIAR_SLOT),
        talents: normalizeTalents(cur.talents),
        heroFamiliarId: cur.equipped?.[FAMILIAR_SLOT]?.id ?? null,
        heroTalentIds: normalizeTalents(cur.talents)
          .filter((t) => t.equipped === true)
          .map((t) => t.id),
      },
      comptoirLevel.value,
    );
    const busy = new Set(escortIds);
    await persist(userId, {
      caravans: [...caravanList.value, van],
      adventurers: advList.value.map((a) =>
        busy.has(a.id) ? { ...a, busyUntil: van.returnAt } : a,
      ),
      expedition_map: cur.expedition_map
        ? { ...cur.expedition_map, pois: cur.expedition_map.pois.filter((p) => p.id !== poi.id) }
        : cur.expedition_map,
    });
    return true;
  }

  /** Encaisse la cargaison d'un convoi rentré : devises, XP par aventurier, blessés.
   *  ⚠️ L'XP est versée QUEL QUE SOIT le résultat et même sans combat — sinon un débutant
   *  à un seul aventurier, qui perd toutes ses embuscades, ne progresserait jamais. */
  /** Encaisse une cargaison et rend **ce que la mission a changé pour l’escorte**
   *  (`AdvProgress[]`), ou `null` si rien n’a été encaissé.
   *
   *  ⚠️ Un booléen ne suffisait plus : le niveau d’un aventurier est CACHÉ, donc une
   *  étoile gagnée en convoi ne se voyait qu’en rouvrant la Guilde. L’écran a besoin
   *  du AVANT/APRÈS pour l’annoncer — et c’est la LIB qui compare, pas lui.
   *  ⚠️ Une liste VIDE reste « encaissé avec succès » (elle est truthy) : c’est `null`
   *  qui dit l’échec. */
  async function claimCaravan(userId: string, caravanId: string, playerLevel: number) {
    const cur = row.value;
    const van = caravanList.value.find((c) => c.id === caravanId);
    if (!cur || !van || !isCaravanClaimable(van, Date.now())) return null;
    const o = van.outcome;
    const escortAdvs = van.escort
      .map((id) => advList.value.find((a) => a.id === id))
      .filter((a): a is Adventurer => !!a);
    const hurtMs = caravanHurtMs(escortAdvs, defenseLevel(cur.base?.defenses ?? [], 'infirmary'));
    // 🐾 Leurs COMPAGNONS ont escorté aussi : ils gagnent du dressage, comme au rempart.
    // ⚠️ Mêmes exclusions que la route (`companionsOf`) : celui que le héros porte se
    // battait ailleurs, il n’apprend rien de ce voyage.
    const trained = new Set(
      companionsOf(escortAdvs, cur.inventory, cur.equipped?.[FAMILIAR_SLOT]?.id).map((f) => f.id),
    );
    const famGain = caravanFamiliarXp(van.poi);
    const inventory = trained.size
      ? cur.inventory.map((it) =>
          trained.has(it.id) ? grantFamiliarXp(it, famGain, playerLevel) : it,
        )
      : cur.inventory;
    const hurtUntil = Date.now() + hurtMs;
    const hurt = new Set(o.hurt);
    const before = advList.value;
    const advs = before.map((a) => {
      const gain = o.xp[a.id];
      if (gain === undefined) return a;
      const next = grantAdvXp(a, gain, guildLevel.value);
      return hurt.has(a.id) ? { ...next, hurtUntil } : next;
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
      gold: Math.max(0, cur.gold + ent(o.gold) - ent(o.wages)),
      login_energy: cur.login_energy + ent(o.energy),
      summon_stones: cur.summon_stones + ent(o.summonStones),
      scrap: cur.scrap + ent(o.scrap),
      keys: cur.keys + ent(o.keys),
      adventurers: advs,
      ...(trained.size ? { inventory } : {}),
      caravans: caravanList.value.map((c) => (c.id === caravanId ? { ...c, claimed: true } : c)),
    });
    if (o.gold > o.wages) goldFx.gain(o.gold - o.wages);
    return advProgressOf(before, advs, {
      guildLevel: guildLevel.value,
      trainingLevel: trainingLevel.value,
      now: Date.now(),
    });
  }

  return {
    row,
    loaded,
    fetchMine,
    setPseudo,
    expeSyncMap,
    expeSend,
    expeTick,
    expeSettle,
    grantComboChest,
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
    setCompanion,
    setAdvTalent,
    autoAssignCompanions,
    healHero,
    garrisonedFamiliars,
    heroIsHome,
    ownedLevel,
    applyRun,
    applyBossWin,
    chooseReward,
    applyEndless,
    spendKey,
    advList,
    caravanList,
    guildLevel,
    comptoirLevel,
    trainingLevel,
    kennelLevel,
    recruitChoices,
    recruitAdventurer,
    promoteAdventurer,
    settleAdventurers,
    sendCaravan,
    claimCaravan,
    applyExpedition,
    equip,
    recycleLoadout,
    fileBagSetPieces,
    promoteSetSpare,
    recycleSpares,
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
    recycle,
    recycleMany,
    toggleLock,
    claimDailyLogin,
    claimLevelUps,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
