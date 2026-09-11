// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { comboChestReward } from '@/lib/comboChest';
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
  type Item,
  type ItemEffect,
  type ItemSlot,
  type Equipped,
  type Loadout,
  type PendingReward,
  itemScore,
  voieSetRoster,
} from '@/lib/items';
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
  baseCombatant,
  resolveRaid,
  emptyBase,
  defenseType,
  defenseLevel,
  ownedLevel,
  repairCost,
  defenseUpgradeCost,
  defenseUpgradeScrap,
  scavengerCount,
  pickScavengeTargets,
  lootCorpses,
  repairStructure,
  totalRepairCost,
  garrisonBonus,
  autoGarrison,
  garrisonSlots,
  dedupeGarrisonRoles,
  fatigueMsFor,
  healCost,
  woundRemainingMs,
  SCAV,
  type BaseState,
  type DefenseId,
  type DefenseStructure,
  type Raid,
  type RaidReport,
} from '@/lib/raid';
import {
  advAvailable,
  settleAllTraining,
  canPromote,
  classChoices,
  grantAdvXp,
  guildRoster,
  recruitCost,
  type Adventurer,
} from '@/lib/adventurers';
import {
  canSendCaravan,
  caravanHurtMs,
  caravanSlots,
  trainMsFor,
  isCaravanClaimable,
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
    r.caravans = arr<Caravan>(r.caravans);
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

  // Crée ou renomme le personnage. L'unicité est garantie par la base : un pseudo
  // déjà pris renvoie l'erreur 23505 → on la traduit en PseudoTakenError.
  async function setPseudo(userId: string, rawPseudo: string) {
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
    const trained = grantFamiliarXp(fam, 'atk', input.famAtkXp, input.playerLevel ?? 1);
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
    // Butin de boss. Les pièces de SET DE VOIE sont filées DIRECTEMENT dans le loadout de
    // leur voie (1 set/loadout) : emplacement LIBRE → rangée ; OCCUPÉ → laissée au SAC et
    // signalée en CONFLIT → l'UI demande au joueur laquelle garder (l'autre est vendue).
    // Les autres drops (lots hors-set, rares) suivent le flux donjon (équipe si mieux / sac).
    const drops = input.drops ?? [];
    const loadouts: Loadout[] = Array.from(
      { length: MAX_LOADOUTS },
      (_, k) => cur.loadouts[k] ?? { items: {} },
    );
    const conflicts: Item[] = [];
    let inv = cur.inventory;
    const otherDrops: Item[] = [];
    for (const d of drops) {
      const vi = d.setId?.startsWith('voie:')
        ? VOIES.findIndex((v) => v.id === d.setId!.slice('voie:'.length))
        : -1;
      if (vi >= 0 && vi < MAX_LOADOUTS) {
        const items = { ...loadouts[vi]!.items };
        if (!items[d.slot]) {
          items[d.slot] = d; // emplacement libre → rangée dans le loadout de la voie
          loadouts[vi] = { items };
        } else {
          inv = [...inv, d]; // occupé → au sac, en attente du choix du joueur (conflit UI)
          conflicts.push(d);
        }
      } else otherDrops.push(d);
    }
    const dist = distributeItems(cur.equipped, inv, otherDrops);
    await persist(userId, {
      gold: cur.gold + input.gold,
      stones: cur.stones + (input.defeated ? (input.stones ?? 0) : 0),
      parchemins: cur.parchemins + (input.defeated ? (input.parchemins ?? 0) : 0),
      ink_dust: cur.ink_dust + (input.defeated ? (input.inkDust ?? 0) : 0),
      summon_stones: Math.max(0, cur.summon_stones - input.summonCost),
      defeated_bosses: defeated,
      equipped: dist.equipped,
      inventory: dist.inventory,
      loadouts,
      set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, drops),
      keys: cur.keys + keyGain,
      ...(input.talentDrops?.length ? { talents: [...cur.talents, ...input.talentDrops] } : {}),
    });
    return { conflicts };
  }

  // Choisit une récompense parmi les candidats en attente → l'applique et purge.
  async function chooseReward(userId: string, index: number) {
    const cur = row.value;
    const cand = cur?.pending_reward?.candidates[index];
    if (!cur || !cand) return;
    if (cand.kind === 'item') {
      const item = cand.item;
      // Pièce de SET DE VOIE → filée AUTOMATIQUEMENT dans le loadout de sa voie (≤ 1 set/loadout) :
      // emplacement libre → rangée ; loadout meilleur (ou égal) → drop vendu ; drop meilleur →
      // remplace, ancien vendu (ou au sac si 🔒). Comparaison par magnitude d'effet (même
      // set + même slot → même type d'effet → value monotone avec la puissance).
      if (item.setId?.startsWith('voie:')) {
        const idx = VOIES.findIndex((v) => v.id === item.setId!.slice('voie:'.length));
        if (idx >= 0 && idx < MAX_LOADOUTS) {
          const loadouts: Loadout[] = Array.from(
            { length: MAX_LOADOUTS },
            (_, k) => cur.loadouts[k] ?? { items: {} },
          );
          const items = { ...loadouts[idx]!.items };
          const existing = items[item.slot];
          // Plus de marchand : la pièce écartée part à la FORGE (au sac si elle est 🔒).
          let scrap = cur.scrap;
          let inventory = cur.inventory;
          const jeter = (it: Item) => {
            if (canRecycle(it)) scrap += scrapValue(it);
            else inventory = [...inventory, it]; // 🔒 → au sac, le verrou protège de tout
          };
          if (!existing) {
            items[item.slot] = item; // emplacement libre → rangé
          } else if ((existing.effect?.value ?? 0) >= (item.effect?.value ?? 0)) {
            jeter(item); // la rangée est meilleure (ou égale) → le drop fond
          } else {
            items[item.slot] = item; // drop meilleur → remplace
            jeter(existing);
          }
          loadouts[idx] = { items };
          return persist(userId, {
            loadouts,
            scrap,
            inventory,
            set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, [item]),
            pending_reward: null,
          });
        }
      }
      const dist = distributeItems(cur.equipped, cur.inventory, [cand.item]);
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
  // Consomme 1 clé pour lancer une expédition (garde-fou : refuse si aucune clé).
  async function spendKey(userId: string): Promise<boolean> {
    const cur = row.value;
    if (!cur || cur.keys <= 0) return false;
    await persist(userId, { keys: cur.keys - 1 });
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
   *  huit pièces qui volent. Le 🔒 protège ici comme partout ailleurs. */
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

  // Vide un loadout rangé : ses objets retournent au sac, le slot de loadout est vidé.
  // Renvoie le nombre d'objets remis (ticket 46488974).
  async function unpackLoadout(userId: string, i: number): Promise<number> {
    const cur = row.value;
    if (!cur || i < 0 || i >= MAX_LOADOUTS) return 0;
    const lo = cur.loadouts[i];
    const items = lo ? SLOTS.map((s) => lo.items[s]).filter((it): it is Item => !!it) : [];
    if (!items.length) return 0;
    const loadouts = cur.loadouts.map((l, k) => (k === i ? { items: {} } : l));
    await persist(userId, { inventory: [...cur.inventory, ...items], loadouts });
    return items.length;
  }
  // Vend un loadout rangé : ses objets → or, le slot est vidé. Renvoie l'or gagné (ticket 53a6d487).
  async function recycleLoadout(userId: string, i: number): Promise<number> {
    const cur = row.value;
    if (!cur || i < 0 || i >= MAX_LOADOUTS) return 0;
    const lo = cur.loadouts[i];
    const items = lo ? SLOTS.map((s) => lo.items[s]).filter((it): it is Item => !!it) : [];
    if (!items.length) return 0;
    // ⚠️ Les pièces 🔒 ne fondent pas : elles repartent au sac. Le verrou protège de
    // TOUTES les sorties, pas seulement de celle qu'on avait en tête en l'écrivant.
    const fondues = items.filter((it) => canRecycle(it));
    const gardees = items.filter((it) => !canRecycle(it));
    const gain = fondues.reduce((s, it) => s + scrapValue(it), 0);
    const loadouts = cur.loadouts.map((l, k) => (k === i ? { items: {} } : l));
    await persist(userId, {
      scrap: cur.scrap + gain,
      inventory: gardees.length ? [...cur.inventory, ...gardees] : cur.inventory,
      loadouts,
    });
    return gain;
  }

  // Range une PIÈCE DE SET du sac dans le loadout de SA voie (loadout i ↔ VOIES[i]) : l'objet
  // quitte le sac pour le slot correspondant du bon loadout (≤ 1 pièce/emplacement → au plus
  // 1 set complet). Si une pièce occupait déjà ce slot du loadout, elle est VENDUE quand
  // `sellDisplaced` (et non verrouillée) ; sinon elle repart au sac. Renvoie l'index du
  // loadout, ou -1 si KO.
  async function stashSetPiece(
    userId: string,
    itemId: string,
    /** Que faire de la pièce DÉPLACÉE : la garder au sac ou la fondre.
     *  ⚠️ Une pièce 🔒 revient TOUJOURS au sac, quelle que soit la consigne. */
    displaced: 'keep' | 'recycle' = 'keep',
  ): Promise<number> {
    const cur = row.value;
    if (!cur) return -1;
    const item = cur.inventory.find((it) => it.id === itemId);
    if (!item?.setId?.startsWith('voie:')) return -1;
    const idx = VOIES.findIndex((v) => v.id === item.setId!.slice('voie:'.length));
    if (idx < 0 || idx >= MAX_LOADOUTS) return -1;
    const loadouts: Loadout[] = Array.from(
      { length: MAX_LOADOUTS },
      (_, k) => cur.loadouts[k] ?? { items: {} },
    );
    const items = { ...loadouts[idx]!.items };
    const displacedItem = items[item.slot]; // pièce déjà rangée sur ce slot
    items[item.slot] = item;
    loadouts[idx] = { items };
    let inventory = cur.inventory.filter((it) => it.id !== itemId);
    const gold = cur.gold;
    let scrap = cur.scrap;
    const old = displacedItem;
    if (old) {
      if (displaced === 'recycle' && canRecycle(old)) scrap += scrapValue(old);
      else inventory = [...inventory, old]; // verrouillée ou « garder » → retour au sac
    }
    await persist(userId, { inventory, loadouts, gold, scrap });
    return idx;
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
  function computeGearPlan(
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
  ): { equipped: Equipped; talentIds: string[]; voie: string | null; score: number } | null {
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
      sac: Item[];
      loadouts: Loadout[];
      score: number;
      voie: string | null;
      talents: TalentInstance[]; // talents équipés retenus pour ce plan
    };
    function planFor(vIdx: number): Plan {
      const voie = vIdx >= 0 ? VOIES[vIdx]!.id : null;
      // ⚠️ POOL = TOUT CE QU'ON POSSÈDE, toutes réserves confondues. Avant, seule la réserve
      // de la voie candidate était portable : une meilleure pièce d'un AUTRE set restait
      // invisible, et surtout aucun DEMI-SET croisé (2 pièces d'un set + 2 d'un autre) ne
      // pouvait être formé — les deux moitiés vivant dans deux réserves différentes.
      // Mesuré sur un compte réel : +135 de puissance pour ~350 ms de calcul.
      // ⚠️ Ce n'est PAS destructeur pour les collections : les pièces non retenues sont
      // re-rangées plus bas dans la réserve de LEUR voie. On redistribue, on ne dissout pas.
      const pool = [
        ...cur!.inventory,
        ...loadouts0.flatMap((lo) => Object.values(lo.items).filter(Boolean)),
      ];
      const fxOf = (ids: string[]) =>
        mergeEffects(talentEffects(withEquipped(ids)), voiePassiveEffects(voie));
      // Ascension par coordonnées talents ↔ gear : les meilleurs talents dépendent du gear
      // (et réciproquement). Deux passes suffisent en pratique — on part des talents déjà
      // équipés, on optimise le gear, on re-choisit les talents POUR ce gear, on refait le
      // gear. Chaque étape ne peut qu'améliorer le score, donc ça converge.
      let talIds = normalizeTalents(cur!.talents)
        .filter((t) => t.equipped !== false)
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
        best = bestGearLoadout(name, stats, cur!.equipped, pool, level, fxOf(talIds), voie, pin);
        talIds = pickBestTalents(cur!.talents, maxTal, (ids) =>
          combatPower(playerWithGear(name, stats, best, fxOf(ids), level, voie)),
        );
      }
      const extra = fxOf(talIds);
      // FAMILIAR_SLOT inclus : le familier est désormais optimisé lui aussi, donc celui
      // retenu ne doit pas être considéré comme un « non-retenu » à ranger.
      const allSlots = [...SLOTS, FAMILIAR_SLOT];
      const chosen = new Set(allSlots.map((s) => best[s]?.id).filter((x): x is string => !!x));
      const equippedGear = allSlots.map((s) => cur!.equipped[s]).filter((x): x is Item => !!x);
      // ⚠️ TOUTES les réserves repartent VIDES : leurs pièces sont désormais dans le pool,
      // donc elles seront re-rangées ci-dessous. Ne vider que celle de la voie choisie
      // laisserait une pièce à la fois PORTÉE et en réserve — une duplication.
      const loadouts: Loadout[] = loadouts0.map(() => ({ items: {} }));
      const leftovers = [...equippedGear, ...pool].filter((it) => !chosen.has(it.id));
      const sac: Item[] = [];
      for (const it of leftovers) {
        const li = it.setId?.startsWith('voie:')
          ? VOIES.findIndex((v) => v.id === it.setId!.slice('voie:'.length))
          : -1;
        if (li >= 0 && li < MAX_LOADOUTS) {
          const items = loadouts[li]!.items;
          const held = items[it.slot];
          if (!held) items[it.slot] = it;
          // ⚠️ `itemScore` et non `effect.value` : comparer la valeur brute du 1er affixe
          // revenait à opposer des grandeurs de natures différentes (12 % de crit contre
          // 30 % de PV) — le tri pouvait reléguer au sac la meilleure pièce.
          else if (itemScore(held) >= itemScore(it)) sac.push(it);
          else {
            sac.push(held);
            items[it.slot] = it;
          }
        } else sac.push(it);
      }
      const equipped: Equipped = { ...cur!.equipped };
      for (const s of allSlots) equipped[s] = best[s];
      const score = combatPower(playerWithGear(name, stats, equipped, extra, level, voie));
      return { equipped, sac, loadouts, score, voie, talents: withEquipped(talIds) };
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

    let best: Plan | null = null;
    for (const vi of cand) {
      const p = planFor(vi);
      if (!best || p.score > best.score) best = p;
    }
    if (!best) return null;
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
    if (!forceSetId && best.score <= curScore) return null;
    return {
      equipped: best.equipped,
      talentIds: best.talents.filter((t) => t.equipped).map((t) => t.id),
      voie: best.voie,
      score: best.score,
    };
  }

  /** Le plan proposé, SANS rien appliquer — c'est ce que l'écran de revue affiche. */
  function previewGearPlan(
    stats: { puissance: number; endurance: number; agilite: number },
    level: number,
    name: string,
  ) {
    return computeGearPlan(stats, level, name);
  }

  /** Applique un build CHOISI (tout ou partie du plan). ⚠️ On ne « pose » pas des morceaux :
   *  on repart de l'équipement cible et on RECONSTRUIT le rangement (sac + réserves de set)
   *  à partir de tout ce qu'on possède. Sans ça, refuser une ligne laisserait une pièce
   *  orpheline — ni portée, ni au sac, ni en réserve. */
  async function applyGearPlan(
    userId: string,
    target: { equipped: Equipped; talentIds: string[]; voie: string | null },
  ): Promise<boolean> {
    const cur = row.value;
    if (!cur) return false;
    const allSlots = [...SLOTS, FAMILIAR_SLOT];
    const loadouts0: Loadout[] = Array.from(
      { length: MAX_LOADOUTS },
      (_, k) => cur.loadouts[k] ?? { items: {} },
    );
    // Tout ce qu'on possède : porté + sac + toutes les réserves.
    const owned: Item[] = [
      ...allSlots.map((sl) => cur.equipped[sl]).filter((x): x is Item => !!x),
      ...cur.inventory,
      ...loadouts0.flatMap((lo) => Object.values(lo.items).filter((x): x is Item => !!x)),
    ];
    const kept = new Set(
      allSlots.map((sl) => target.equipped[sl]?.id).filter((x): x is string => !!x),
    );
    // Les réserves repartent vides : on re-range TOUT ce qui n'est pas porté.
    const loadouts: Loadout[] = Array.from({ length: MAX_LOADOUTS }, () => ({ items: {} }));
    const sac: Item[] = [];
    const seen = new Set<string>();
    for (const it of owned) {
      if (kept.has(it.id) || seen.has(it.id)) continue;
      seen.add(it.id);
      const li = it.setId?.startsWith('voie:')
        ? VOIES.findIndex((v) => v.id === it.setId!.slice('voie:'.length))
        : -1;
      if (li >= 0 && li < MAX_LOADOUTS) {
        const items = loadouts[li]!.items;
        const held = items[it.slot];
        if (!held) items[it.slot] = it;
        else if ((held.effect?.value ?? 0) >= (it.effect?.value ?? 0)) sac.push(it);
        else {
          sac.push(held);
          items[it.slot] = it;
        }
      } else sac.push(it);
    }
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
    const plan = computeGearPlan(stats, level, name, forceVoie, forceSetId);
    if (!plan) return false;
    return applyGearPlan(userId, plan);
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
   *  où une devise pourrait être oubliée. */
  async function grantComboChest(
    userId: string,
    comboId: string,
    comboName: string,
    sets: number,
    playerLevel: number,
    now: number,
  ): Promise<boolean> {
    const cur = row.value;
    if (!cur) return false;
    const id = `chest:${comboId}`;
    if (cur.messages.some((m) => m.id === id)) return false;
    const r = comboChestReward(sets, playerLevel);
    const msg: ExpeditionMessage = {
      id,
      chest: true,
      title: '🎁 Coffre du Défi 360',
      level: playerLevel,
      win: true,
      text: `${comboName} — ${sets} séries. Le village a vu ta semaine.`,
      gold: r.gold,
      energy: r.energy,
      summonStones: r.summonStones,
      scrap: r.scrap,
      key: r.keys,
      resolvedAt: now,
      claimAt: now, // pas de route à faire : le coffre est déjà là
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

  /** Bonus que la garnison apporte au mur (rôle par ESPÈCE, cf. GARRISON_ROLE). */
  function garrisonFor(cur: CharacterRow, now: number) {
    return garrisonBonus(
      garrisonedFamiliars(cur),
      now,
      defenseLevel(baseOf(cur, now).defenses, 'kennel'),
    );
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
    ctx: { playerLevel: number; sessions7: number; globalXp: number; hero: Combatant | null },
  ): Promise<{ detected: Raid | null; report: RaidReport | null }> {
    const cur = row.value;
    if (!cur) return { detected: null, report: null };
    const start = baseOf(cur, now);
    const t = advanceBase(start, ctx, now);
    if (!t.dueRaid) {
      if (t.changed) await persist(userId, { base: t.base });
      return { detected: t.detected, report: null };
    }

    const home = heroIsHome(cur);
    const posted = new Set(t.base.garrison ?? []);
    const report = resolveRaid(
      baseCombatant(
        t.base.defenses,
        ctx.playerLevel,
        home ? ctx.hero : null,
        garrisonBonus(
          cur.inventory.filter((it) => it.slot === FAMILIAR_SLOT && posted.has(it.id)),
          now,
          defenseLevel(t.base.defenses, 'kennel'),
        ),
      ),
      t.dueRaid,
      now,
      home,
    );
    const { base: nb, damage } = applyRaidOutcome(t.base, t.dueRaid, report, ctx, now);
    const patch: Record<string, unknown> = { base: nb };
    // Les familiers postés SORTENT du siège : ils gagnent de l'XP de DÉFENSE (∝ ce
    // qu'ils ont repoussé) et soufflent un moment. Jamais blessés, jamais perdus —
    // sinon personne ne posterait ses bons familiers et le chenil resterait vide.
    if (posted.size) {
      const gain = report.groups.slice(0, report.defeated).reduce((a, g) => a + g.level * 2, 0);
      const rest = now + fatigueMsFor(defenseLevel(t.base.defenses, 'infirmary'));
      patch.inventory = cur.inventory.map((it) =>
        posted.has(it.id)
          ? { ...grantFamiliarXp(it, 'def', gain, ctx.playerLevel), fatigueUntil: rest }
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

  /** Soins d'urgence : remet le héros sur pied TOUT DE SUITE, contre de la ferraille
   *  proportionnelle au repos qu'il reste. Il y a donc toujours une porte de sortie —
   *  attendre reste gratuit, payer ne fait qu'acheter l'immédiateté. */
  async function healHero(userId: string, now: number) {
    const cur = row.value;
    if (!cur?.base?.wound) return;
    const cost = healCost(woundRemainingMs(cur.base, now));
    if (cur.scrap < cost) throw new Error(`Il te faut ${cost} 🔩 pour des soins d'urgence.`);
    await persistOptimistic(userId, {
      scrap: cur.scrap - cost,
      base: { ...cur.base, wound: null },
    });
    return cost;
  }

  /** Poste ou retire un familier du chenil. */
  async function toggleGarrison(userId: string, famId: string, now: number, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const base = baseOf(cur, now);
    if (defenseLevel(base.defenses, 'kennel') <= 0)
      throw new Error('Construis un Chenil pour poster des familiers.');
    const cur_ = base.garrison ?? [];
    const next = cur_.includes(famId)
      ? cur_.filter((x) => x !== famId)
      : [...cur_, famId].slice(-garrisonSlots(playerLevel));
    await persistOptimistic(userId, { base: { ...base, garrison: next } });
  }

  /** Remplace la garnison EN BLOC. ⚠️ Une seule écriture : l'écran par emplacements
   *  échange un familier contre un autre (retirer + poster), et enchaîner deux `toggle`
   *  ferait deux allers-retours réseau pour un seul geste — avec un état intermédiaire
   *  visible où l'emplacement est vide. Le tri conserve l'ordre donné : c'est lui qui
   *  décide de quelle case occupe quel familier à l'écran. */
  async function setGarrison(userId: string, ids: string[], now: number, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const base = baseOf(cur, now);
    if (defenseLevel(base.defenses, 'kennel') <= 0)
      throw new Error('Construis un Chenil pour poster des familiers.');
    const owned = new Set(
      cur.inventory.filter((it) => it.slot === FAMILIAR_SLOT).map((it) => it.id),
    );
    // On ne garde que des familiers RÉELLEMENT possédés, un seul par RÔLE, dans la limite
    // des places. ⚠️ Le dédoublonnage par rôle passe par la lib (`dedupeGarrisonRoles`),
    // la même que le combat : l'écran ne doit jamais pouvoir écrire un état que le mur
    // arbitrerait autrement.
    const byId = new Map(cur.inventory.map((it) => [it.id, it]));
    const voulus = [...new Set(ids.filter((id) => owned.has(id)))]
      .map((id) => byId.get(id))
      .filter((it): it is Item => !!it);
    const next = dedupeGarrisonRoles(voulus)
      .slice(0, garrisonSlots(playerLevel))
      .map((it) => it.id);
    await persistOptimistic(userId, { base: { ...base, garrison: next } });
  }

  /** Poste automatiquement les meilleurs défenseurs — le geste qu'on veut faire une
   *  fois, pas avant chaque siège. */
  async function autoAssignGarrison(userId: string, now: number, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const base = baseOf(cur, now);
    if (defenseLevel(base.defenses, 'kennel') <= 0)
      throw new Error('Construis un Chenil pour poster des familiers.');
    const pool = cur.inventory.filter((it) => it.slot === FAMILIAR_SLOT);
    await persistOptimistic(userId, {
      base: { ...base, garrison: autoGarrison(pool, garrisonSlots(playerLevel)) },
    });
  }

  /** Construit une structure de l'enceinte (or + ferraille). Hors des 6 emplacements de
   *  la carte : on ne sacrifie jamais une mine pour un mur. */
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
  async function repairDefense(userId: string, typeId: DefenseId) {
    const cur = row.value;
    if (!cur?.base) return;
    const d = cur.base.defenses.find((x) => x.typeId === typeId);
    if (!d?.damaged) return;
    const cost = repairCost(d.level);
    if (cur.scrap < cost) throw new Error('Pas assez de ferraille 🔩.');
    // `repairStructure` relance aussi la PRODUCTION quand plus rien n'est endommagé :
    // le gel est la conséquence d'une base cassée, pas une punition séparée.
    await persistOptimistic(userId, {
      scrap: cur.scrap - cost,
      base: repairStructure(cur.base, typeId),
    });
  }

  /** Répare TOUT d'un coup — le geste qu'on veut faire quand la production est gelée. */
  async function repairAll(userId: string) {
    const cur = row.value;
    if (!cur?.base) return;
    const cost = totalRepairCost(cur.base);
    if (cost <= 0) return;
    if (cur.scrap < cost) throw new Error(`Il te faut ${cost} 🔩 pour tout remettre en état.`);
    let base = cur.base;
    for (const d of cur.base.defenses.filter((x) => x.damaged))
      base = repairStructure(base, d.typeId);
    await persistOptimistic(userId, { scrap: cur.scrap - cost, base });
    return cost;
  }

  /** Envoie une vague de fouilleurs sur le champ de bataille. Renouvelable autant de fois
   *  qu'on veut tant que les corps sont frais : un petit chantier fait plusieurs
   *  allers-retours, il ne condamne pas le butin. */
  async function sendScavengers(userId: string, now: number) {
    const cur = row.value;
    const field = cur?.base?.field;
    if (!cur?.base || !field) return;
    if (field.dispatchUntil && now < field.dispatchUntil) return; // vague déjà en route
    const cap = scavengerCount(defenseLevel(cur.base.defenses, 'salvage'));
    if (cap <= 0) throw new Error('Construis un Fosse commune pour dépouiller les corps.');
    const targets = pickScavengeTargets(field, cap);
    if (!targets.length) return;
    await persistOptimistic(userId, {
      base: {
        ...cur.base,
        field: {
          ...field,
          dispatchUntil: now + SCAV.dispatchMs,
          dispatchIds: targets.map((c) => c.id),
        },
      },
    });
  }

  /** Récupère ce que la vague a ramené. La richesse vient du NIVEAU DES CORPS, et la
   *  rareté des objets reste plafonnée par le niveau du joueur (anti-runaway). */
  /** Ce que les fouilleurs RAPPORTENT, sans rien créditer — l'aperçu qu'on montre avant
   *  de ramasser. ⚠️ La graine est celle du DÉPART (`dispatchUntil`), pas `now` : sinon
   *  l'aperçu et la récupération tireraient deux butins différents, et l'écran mentirait. */
  function previewScavengers(now: number, playerLevel: number) {
    const cur = row.value;
    const field = cur?.base?.field;
    if (!cur?.base || !field?.dispatchUntil || now < field.dispatchUntil) return null;
    const ids = new Set(field.dispatchIds ?? []);
    const taken = field.corpses.filter((c) => ids.has(c.id) && !c.looted);
    const loot = lootCorpses(
      taken,
      cur.base.lastReport?.faction ?? 'bandits',
      playerLevel,
      (field.dispatchUntil ^ cur.base.seed) >>> 0 || 1,
      garrisonFor(cur, now).lootPct ?? 0,
    );
    return { ...loot, corpses: taken.length };
  }

  async function collectScavengers(userId: string, now: number, playerLevel: number) {
    const cur = row.value;
    const field = cur?.base?.field;
    if (!cur?.base || !field?.dispatchUntil || now < field.dispatchUntil) return null;
    const ids = new Set(field.dispatchIds ?? []);
    const taken = field.corpses.filter((c) => ids.has(c.id) && !c.looted);
    const faction = cur.base.lastReport?.faction ?? 'bandits';
    const loot = lootCorpses(
      taken,
      faction,
      playerLevel,
      (field.dispatchUntil ^ cur.base.seed) >>> 0 || 1,
      garrisonFor(cur, now).lootPct ?? 0,
    );
    const drops = loot.items.map((it) => ({ ...it, id: crypto.randomUUID() }));
    await persistOptimistic(userId, {
      gold: cur.gold + loot.gold,
      summon_stones: cur.summon_stones + loot.summonStones,
      keys: cur.keys + loot.keys,
      // 🔩 L'acier d'une armée en déroute — c'est lui qui fait suivre la ferraille au
      // rythme des séances depuis que la fréquence des sièges en dépend (v0.702).
      scrap: cur.scrap + loot.scrap,
      inventory: drops.length ? [...cur.inventory, ...drops] : cur.inventory,
      set_pieces_seen: drops.length
        ? mergeSetSeen(cur.set_pieces_seen, drops)
        : cur.set_pieces_seen,
      base: {
        ...cur.base,
        field: {
          corpses: field.corpses.map((c) => (ids.has(c.id) ? { ...c, looted: true } : c)),
          expiresAt: field.expiresAt,
        },
      },
    });
    return { ...loot, items: drops, corpses: taken.length };
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
    if (trainingLevel.value <= 0) return false;
    if (!canPromote(adv, guildLevel.value)) return false;
    if (!classChoices(adv).some((c) => c.id === classId)) return false;
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
  async function claimCaravan(userId: string, caravanId: string) {
    const cur = row.value;
    const van = caravanList.value.find((c) => c.id === caravanId);
    if (!cur || !van || !isCaravanClaimable(van, Date.now())) return false;
    const o = van.outcome;
    const hurtMs = caravanHurtMs(
      van.escort
        .map((id) => advList.value.find((a) => a.id === id))
        .filter((a): a is Adventurer => !!a),
      defenseLevel(cur.base?.defenses ?? [], 'infirmary'),
    );
    const hurtUntil = Date.now() + hurtMs;
    const hurt = new Set(o.hurt);
    const advs = advList.value.map((a) => {
      const gain = o.xp[a.id];
      if (gain === undefined) return a;
      const next = grantAdvXp(a, gain, guildLevel.value);
      return hurt.has(a.id) ? { ...next, hurtUntil } : next;
    });
    await persist(userId, {
      // Les salaires sont déduits ICI, à l'encaissement : l'aventurier est payé au retour.
      gold: Math.max(0, cur.gold + o.gold - o.wages),
      login_energy: cur.login_energy + o.energy,
      summon_stones: cur.summon_stones + o.summonStones,
      scrap: cur.scrap + o.scrap,
      keys: cur.keys + o.keys,
      adventurers: advs,
      caravans: caravanList.value.map((c) => (c.id === caravanId ? { ...c, claimed: true } : c)),
    });
    if (o.gold > o.wages) goldFx.gain(o.gold - o.wages);
    return true;
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
    sendScavengers,
    previewScavengers,
    collectScavengers,
    toggleGarrison,
    setGarrison,
    autoAssignGarrison,
    healHero,
    garrisonedFamiliars,
    garrisonFor,
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
    recruitChoices,
    recruitAdventurer,
    promoteAdventurer,
    settleAdventurers,
    sendCaravan,
    claimCaravan,
    applyExpedition,
    equip,
    unpackLoadout,
    recycleLoadout,
    stashSetPiece,
    optimizeGear,
    previewGearPlan,
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
