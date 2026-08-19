// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { normalizePseudo, levelUpEnergy } from '@/lib/character';
import {
  salvageValue,
  sellValue,
  upgradeCost,
  forgeItem,
  forgeCost,
  rerolledQuality,
  rerollCost,
  craftSetCost,
  rollSetPiece,
  familiarStoneCost,
  isFamiliar,
  normRank,
  familiarInfuseXp,
  infuseFamiliar as applyFamiliarInfusion,
  FAMILIAR_SLOT,
  type Item,
  type ItemSlot,
  type Equipped,
  type PendingReward,
} from '@/lib/items';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';
import {
  normalizeTalents,
  talentInfuseXp,
  talentsEarned,
  talentTier,
  talentLevelOf,
  talentLevelUpCost,
  type TalentInstance,
} from '@/lib/talents';
import {
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
  maxFuseTargetIndex,
  forgeLuckBonus,
  type Building,
} from '@/lib/buildings';
import type { Combatant } from '@/lib/combat';

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
  parchemins: number; // parchemins de maîtrise 📜 : montée de niveau des talents (migr. 0048)
  fragments: number; // fragments de familiers 🧩 : XP d'infusion du TIER (migr. 0049)
  summon_stones: number; // pierres d'invocation 🔮 : tenter les boss (migr. 0050)
  expedition: ActiveExpedition | null; // mode idle « Expédition » en cours
  expedition_map: ExpeditionMap | null; // carte du monde (POI)
  messages: ExpeditionMessage[]; // boîte à messages 📬 (rapports d'expédition)
  buildings: Building[]; // filons de production passive (village)
  set_pieces_seen: Record<string, string[]>; // codex : slots de set déjà obtenus par setId
}

// Énergie offerte à la création du perso (~1 session ≈ de quoi lancer plusieurs
// premiers donjons) → le joueur n'est pas bloqué à 0 énergie au départ.
const WELCOME_ENERGY = 300;

export class PseudoTakenError extends Error {
  constructor() {
    super('Ce pseudo est déjà pris.');
    this.name = 'PseudoTakenError';
  }
}

export const useCharacterStore = defineStore('character', () => {
  const row = ref<CharacterRow | null>(null);
  const loaded = ref(false);

  const COLS =
    'user_id, pseudo, gold, dust, energy_spent, equipped, inventory, talents, cleared_dungeons, defeated_bosses, login_streak, login_grace_used, last_login_date, login_energy, consumables, reward_level, endless_best, pending_reward, keys, stones, parchemins, fragments, summon_stones, expedition, expedition_map, messages, buildings, set_pieces_seen';

  // Garde-fou : une colonne jsonb malformée (ex. talents={} au lieu de []) ne doit
  // JAMAIS faire planter la page (le code fait `for..of` sur les tableaux). On
  // normalise les types attendus au chargement.
  function normalizeRow(r: CharacterRow | null): CharacterRow | null {
    if (!r) return r;
    const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    const obj = <T>(v: unknown): T =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : ({} as T);
    r.talents = normalizeTalents(r.talents); // legacy string[] → instances (rétro-compat)
    // Rangs (2026‑08‑18) : objets sauvegardés aux ANCIENNES raretés → nouveaux rangs.
    const fixItem = (it: Item): Item => ({
      ...it,
      rarity: normRank(it.rarity),
    });
    r.inventory = arr<Item>(r.inventory).map(fixItem);
    r.cleared_dungeons = arr<string>(r.cleared_dungeons);
    r.defeated_bosses = arr<string>(r.defeated_bosses);
    r.equipped = obj<Equipped>(r.equipped);
    for (const k of Object.keys(r.equipped) as (keyof Equipped)[]) {
      const it = r.equipped[k];
      if (it) r.equipped[k] = fixItem(it);
    }
    r.consumables = obj<Record<string, number>>(r.consumables);
    r.messages = arr<ExpeditionMessage>(r.messages);
    r.buildings = arr<Building>(r.buildings); // colonne récente (migr. 0046)
    r.set_pieces_seen = obj<Record<string, string[]>>(r.set_pieces_seen); // migr. 0047
    if (typeof r.stones !== 'number') r.stones = 0; // colonne récente (migr. 0045)
    if (typeof r.parchemins !== 'number') r.parchemins = 0; // colonne récente (migr. 0048)
    if (typeof r.fragments !== 'number') r.fragments = 0; // colonne récente (migr. 0049)
    if (typeof r.summon_stones !== 'number') r.summon_stones = 0; // colonne récente (migr. 0050)
    if (!r.expedition || typeof r.expedition !== 'object') r.expedition = null;
    if (!r.expedition_map || typeof r.expedition_map !== 'object') r.expedition_map = null;
    return r;
  }

  async function fetchMine() {
    const { data, error } = await supabase.from('characters').select(COLS).maybeSingle();
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
    if (isNew) patch.login_energy = WELCOME_ENERGY;
    const { data, error } = await supabase.from('characters').upsert(patch).select(COLS).single();
    if (error) {
      if (error.code === '23505') throw new PseudoTakenError();
      throw error;
    }
    row.value = data;
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
    row.value = data;
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
      dust: number;
      drops: Item[];
      clearedDungeonId?: string;
      consumed?: string[]; // consommables dépensés pour ce run
      gained?: string[]; // consommables gagnés en butin
      stones?: number; // pierres magiques 💎 (filet diffus, familiers)
      summonStones?: number; // pierres d'invocation 🔮 (drop de donjon nettoyé)
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
    // Consommables : +1 par gain (butin), −1 par dépense (retire l'entrée à 0).
    const consumables = { ...cur.consumables };
    for (const id of input.gained ?? []) consumables[id] = (consumables[id] ?? 0) + 1;
    for (const id of input.consumed ?? []) {
      const left = (consumables[id] ?? 0) - 1;
      if (left > 0) consumables[id] = left;
      else delete consumables[id];
    }
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    // Clé d'expédition : ~2 % sur un donjon NETTOYÉ (raréfié 2026‑08‑18 : les gros
    // volumes de runs inondaient les clés → le Labyrinthe redevient un événement rare).
    const gotKey = input.clearedDungeonId && Math.random() < 0.02 ? 1 : 0;
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      stones: cur.stones + (input.stones ?? 0),
      summon_stones: cur.summon_stones + (input.summonStones ?? 0),
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
      consumables,
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
      dust: number;
      defeated: boolean;
      pending?: PendingReward | null;
      consumed?: string[];
      stones?: number; // pierres magiques 💎 (jalon boss)
      talentDrops?: TalentInstance[]; // talents tombés (drop-only)
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const firstDefeat = input.defeated && !cur.defeated_bosses.includes(input.bossId);
    const defeated = firstDefeat ? [...cur.defeated_bosses, input.bossId] : cur.defeated_bosses;
    // Clé d'expédition : GARANTIE à la 1re victoire (jalon) ; ~6 % ensuite sur les
    // réaffrontements (raréfié 2026‑08‑18) → pas de flux de clés en spammant un boss.
    const keyGain = firstDefeat ? 1 : input.defeated && Math.random() < 0.06 ? 1 : 0;
    const consumables = { ...cur.consumables };
    for (const id of input.consumed ?? []) {
      const left = (consumables[id] ?? 0) - 1;
      if (left > 0) consumables[id] = left;
      else delete consumables[id];
    }
    // Codex : on « croise » les sets des candidats de récompense PROPOSÉS (même sans
    // les garder) → le glossaire les enregistre à la rencontre, pas à la possession.
    const crossedSetItems = (input.pending?.candidates ?? [])
      .map((cnd) => (cnd.kind === 'item' ? cnd.item : null))
      .filter((it): it is Item => !!it);
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      stones: cur.stones + (input.defeated ? (input.stones ?? 0) : 0),
      summon_stones: Math.max(0, cur.summon_stones - input.summonCost),
      defeated_bosses: defeated,
      consumables,
      pending_reward: input.pending ?? cur.pending_reward ?? null,
      set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, crossedSetItems),
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
      dust: cur.dust + cand.dust,
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
      gold: number;
      dust: number;
      drops: Item[];
      cleared: boolean;
      consumed?: string[];
      stones?: number; // pierres magiques 💎 (fin de jeu)
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const consumables = { ...cur.consumables };
    for (const id of input.consumed ?? []) {
      const left = (consumables[id] ?? 0) - 1;
      if (left > 0) consumables[id] = left;
      else delete consumables[id];
    }
    const dist = distributeItems(cur.equipped, cur.inventory, input.drops);
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      stones: cur.stones + (input.stones ?? 0),
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      endless_best: input.cleared && input.tier > cur.endless_best ? input.tier : cur.endless_best,
      consumables,
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
  // Crédite le butin d'une expédition/Labyrinthe (or + poussière + pierres 💎 +
  // objets au sac/équipés vides ; un familier passe simplement dans `drops`).
  async function applyExpedition(
    userId: string,
    input: {
      gold: number;
      dust: number;
      drops: Item[];
      stones?: number;
      fragments?: number;
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
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      stones: cur.stones + (input.stones ?? 0),
      fragments: cur.fragments + (input.fragments ?? 0), // 🧩 coffres du Labyrinthe
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
      set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, input.drops),
    });
  }

  // Achat en boutique : débite l'or, applique l'effet (énergie instantanée →
  // login_energy = pool d'énergie bonus ; consommable → +1 au compteur).
  async function buyItem(
    userId: string,
    item: { id: string; cost: number; kind: string; energy?: number },
    qty = 1,
  ) {
    const cur = row.value;
    const n = Math.max(1, Math.floor(qty));
    const total = item.cost * n;
    if (!cur || cur.gold < total) return false;
    const patch: Record<string, unknown> = { gold: cur.gold - total };
    if (item.kind === 'energy') {
      patch.login_energy = cur.login_energy + (item.energy ?? 0) * n;
    } else {
      patch.consumables = { ...cur.consumables, [item.id]: (cur.consumables[item.id] ?? 0) + n };
    }
    await persist(userId, patch);
    return true;
  }

  function findOwned(cur: CharacterRow, itemId: string): { item: Item; slot?: ItemSlot } | null {
    const inv = cur.inventory.find((i) => i.id === itemId);
    if (inv) return { item: inv };
    for (const slot of Object.keys(cur.equipped) as ItemSlot[]) {
      const it = cur.equipped[slot];
      if (it?.id === itemId) return { item: it, slot };
    }
    return null;
  }

  // Verrouille/déverrouille un objet du sac (🔒 protégé de la casse/vente).
  async function toggleLock(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    return persist(userId, {
      inventory: cur.inventory.map((i) => (i.id === itemId ? { ...i, locked: !i.locked } : i)),
    });
  }

  // Casse un objet du sac → Poussière d'évolution.
  async function salvage(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item || item.locked) return; // 🔒 protégé
    return persist(userId, {
      dust: cur.dust + salvageValue(item),
      inventory: cur.inventory.filter((i) => i.id !== itemId),
    });
  }

  // Vend un objet du sac → or.
  async function sell(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item || item.locked) return; // 🔒 protégé
    return persist(userId, {
      gold: cur.gold + sellValue(item),
      inventory: cur.inventory.filter((i) => i.id !== itemId),
    });
  }

  // Casse EN MASSE une liste d'objets du sac (par id) → poussière. Le CHOIX des
  // objets (ex. ceux qui font perdre de la puissance) est décidé côté composant,
  // qui seul dispose des stats de combat ; le store applique simplement la liste.
  async function salvageMany(userId: string, ids: string[]): Promise<number> {
    const cur = row.value;
    if (!cur || !ids.length) return 0;
    const set = new Set(ids);
    const targets = cur.inventory.filter((i) => set.has(i.id) && !i.locked);
    if (!targets.length) return 0;
    const rm = new Set(targets.map((t) => t.id)); // ne retire QUE les non-verrouillés
    const gain = targets.reduce((a, it) => a + salvageValue(it), 0);
    await persist(userId, {
      dust: cur.dust + gain,
      inventory: cur.inventory.filter((i) => !rm.has(i.id)),
    });
    return targets.length;
  }
  // Vend EN MASSE une liste d'objets du sac (par id) → or.
  async function sellMany(userId: string, ids: string[]): Promise<number> {
    const cur = row.value;
    if (!cur || !ids.length) return 0;
    const set = new Set(ids);
    const targets = cur.inventory.filter((i) => set.has(i.id) && !i.locked);
    if (!targets.length) return 0;
    const rm = new Set(targets.map((t) => t.id)); // ne retire QUE les non-verrouillés
    const gain = targets.reduce((a, it) => a + sellValue(it), 0);
    await persist(userId, {
      gold: cur.gold + gain,
      inventory: cur.inventory.filter((i) => !rm.has(i.id)),
    });
    return targets.length;
  }

  // Améliore un objet (équipé ou au sac) en dépensant de la poussière ; cap = niveau joueur.
  async function upgradeItem(userId: string, itemId: string, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const found = findOwned(cur, itemId);
    if (!found) return;
    const { item, slot } = found;
    const cost = upgradeCost(item.level, item.rarity);
    if (item.level >= playerLevel || cur.dust < cost) return;
    const upgraded: Item = { ...item, level: item.level + 1 };
    if (slot) {
      return persist(userId, {
        dust: cur.dust - cost,
        equipped: { ...cur.equipped, [slot]: upgraded },
      });
    }
    return persist(userId, {
      dust: cur.dust - cost,
      inventory: cur.inventory.map((i) => (i.id === itemId ? upgraded : i)),
    });
  }

  // « Infuser à fond » (refonte C) : monte un objet jusqu'au plus haut niveau
  // ABORDABLE (≤ niveau joueur) en dépensant la poussière, en une écriture.
  async function infuseToMax(userId: string, itemId: string, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const found = findOwned(cur, itemId);
    if (!found) return;
    const { item, slot } = found;
    let level = item.level;
    let dust = cur.dust;
    while (level < playerLevel) {
      const cost = upgradeCost(level, item.rarity);
      if (dust < cost) break;
      dust -= cost;
      level++;
    }
    if (level === item.level) return; // rien d'infusé (pas assez de poussière)
    const upgraded: Item = { ...item, level };
    if (slot) return persist(userId, { dust, equipped: { ...cur.equipped, [slot]: upgraded } });
    return persist(userId, {
      dust,
      inventory: cur.inventory.map((i) => (i.id === itemId ? upgraded : i)),
    });
  }

  // Monte un FAMILIER d'un niveau en dépensant des PIERRES MAGIQUES 💎 (≠ poussière).
  // Cap = niveau du joueur, comme le stuff. Familier équipé OU au sac (findOwned).
  async function upgradeFamiliar(userId: string, itemId: string, playerLevel: number) {
    const cur = row.value;
    if (!cur) return;
    const found = findOwned(cur, itemId);
    if (!found || !isFamiliar(found.item)) return;
    const { item, slot } = found;
    const cost = familiarStoneCost(item.level, item.rarity);
    if (item.level >= playerLevel || cur.stones < cost) return;
    const upgraded: Item = { ...item, level: item.level + 1 };
    if (slot)
      return persist(userId, {
        stones: cur.stones - cost,
        equipped: { ...cur.equipped, [slot]: upgraded },
      });
    return persist(userId, {
      stones: cur.stones - cost,
      inventory: cur.inventory.map((i) => (i.id === itemId ? upgraded : i)),
    });
  }

  // FUSION (incubateur) : consomme 3 familiers du SAC de MÊME rareté → 1 familier
  // ALÉATOIRE de la rareté JUSTE AU-DESSUS (niveau 1). rng = Math.random.
  // RECYCLE un familier en FRAGMENTS 🧩 (∝ son tier) : les doublons nourrissent
  // l'infusion sans « gâcher » un familier entier. Refuse un familier équipé/verrouillé.
  async function recycleFamiliar(userId: string, familiarId: string) {
    const cur = row.value;
    if (!cur) return 0;
    const fam = cur.inventory.find((i) => i.id === familiarId);
    if (!fam || !isFamiliar(fam) || fam.locked) return 0;
    const gain = familiarInfuseXp(fam);
    await persistOptimistic(userId, {
      fragments: cur.fragments + gain,
      inventory: cur.inventory.filter((i) => i.id !== familiarId),
    });
    return gain;
  }
  // INFUSE un familier CIBLE (équipé ou au sac) en dépensant des FRAGMENTS 🧩 → son
  // TIER (rang+qualité) grimpe (qualité puis rang), plafonné par le niveau de
  // l'Incubateur. Les pierres 💎 gèrent le NIVEAU à part. `amount` = fragments dépensés.
  async function infuseFamiliar(userId: string, targetId: string, amount: number) {
    const cur = row.value;
    if (!cur) return;
    const spend = Math.min(Math.max(0, Math.floor(amount)), cur.fragments);
    if (spend <= 0) return;
    const equippedFam = cur.equipped[FAMILIAR_SLOT];
    const bagTarget = cur.inventory.find((i) => i.id === targetId);
    const target =
      equippedFam?.id === targetId
        ? equippedFam
        : bagTarget && isFamiliar(bagTarget)
          ? bagTarget
          : null;
    if (!target) return;
    const updated = applyFamiliarInfusion(target, spend, maxFuseTargetIndex(cur.buildings));
    const patch: Partial<CharacterRow> = { fragments: cur.fragments - spend };
    if (equippedFam?.id === targetId)
      patch.equipped = { ...cur.equipped, [FAMILIAR_SLOT]: updated };
    else patch.inventory = cur.inventory.map((i) => (i.id === target.id ? updated : i));
    await persistOptimistic(userId, patch);
    return updated;
  }

  // ── Atelier de poussière (dust sinks) : forge / reroll / infusion / craft de set ──
  // Applique la MAJ d'un objet possédé (équipé ou au sac) + dépense la poussière.
  function applyItemUpdate(
    userId: string,
    cur: CharacterRow,
    owned: { item: Item; slot?: ItemSlot },
    updated: Item,
    cost: number,
  ) {
    if (owned.slot)
      return persist(userId, {
        dust: cur.dust - cost,
        equipped: { ...cur.equipped, [owned.slot]: updated },
      });
    return persist(userId, {
      dust: cur.dust - cost,
      inventory: cur.inventory.map((i) => (i.id === updated.id ? updated : i)),
    });
  }
  // A. Forge un objet neuf (aléatoire ou ciblé) au niveau joueur → au sac.
  async function forge(userId: string, opts: { level: number; slot?: ItemSlot }) {
    const cur = row.value;
    if (!cur) return;
    const cost = forgeCost(opts.level, !!opts.slot);
    if (cur.dust < cost) return;
    // Le NIVEAU de la Forge améliore le biais de rareté des objets forgés.
    const luck = 0.25 + forgeLuckBonus(cur.buildings);
    const it: Item = { ...forgeItem(Math.random, { ...opts, luck }), id: crypto.randomUUID() };
    return persist(userId, { dust: cur.dust - cost, inventory: [...cur.inventory, it] });
  }
  // B. Reroll l'effet d'un objet (équipé ou au sac).
  async function rerollEffect(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    const owned = findOwned(cur, itemId);
    if (!owned) return;
    const cost = rerollCost(owned.item);
    if (cur.dust < cost) return;
    const rq = rerolledQuality(Math.random, owned.item);
    const updated: Item = { ...owned.item, effect: rq.effect, roll: rq.roll };
    if (rq.effect2) updated.effect2 = rq.effect2;
    return applyItemUpdate(userId, cur, owned, updated, cost);
  }
  // D. Forge une pièce de set ciblée (set + emplacement) au niveau joueur → au sac.
  async function craftSet(userId: string, opts: { level: number; setId: string; slot: ItemSlot }) {
    const cur = row.value;
    if (!cur) return;
    const cost = craftSetCost(opts.level);
    if (cur.dust < cost) return;
    const piece = rollSetPiece(Math.random, {
      setId: opts.setId,
      level: opts.level,
      preferSlot: opts.slot,
    });
    const it: Item = { ...piece, id: crypto.randomUUID() };
    return persist(userId, {
      dust: cur.dust - cost,
      inventory: [...cur.inventory, it],
      set_pieces_seen: mergeSetSeen(cur.set_pieces_seen, [it]),
    });
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
    });
    return { streak: next.streak, energy, usedGrace };
  }

  // Dépense de l'énergie (ex. frappe du boss communautaire) sans autre effet local.
  async function spendEnergy(userId: string, amount: number) {
    const cur = row.value;
    if (!cur || amount <= 0) return;
    return persist(userId, { energy_spent: cur.energy_spent + amount });
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
  // Infuse (consomme) `fodderId` dans `targetId` → +XP au target (clampé au niveau
  // joueur : pas de « banking » au-delà, sinon un talent auto-maxerait en montant de
  // niveau). Renvoie false si le target est déjà au plafond (feedback UI). Le fodder
  // n'est consommé QUE si l'infusion a lieu.
  // INFUSION d'un talent : on SACRIFIE un autre talent (non équipé) dans la cible →
  // XP ∝ son tier → le TIER (rang+qualité) de la cible grimpe. Le tier n'est PAS
  // plafonné par le niveau joueur (c'est le NIVEAU, via parchemins, qui l'est).
  async function infuseTalent(
    userId: string,
    targetId: string,
    fodderId: string,
  ): Promise<boolean> {
    const cur = row.value;
    if (!cur || targetId === fodderId) return false;
    const target = cur.talents.find((t) => t.id === targetId);
    const fodder = cur.talents.find((t) => t.id === fodderId);
    if (!target || !fodder || fodder.equipped) return false; // jamais sacrifier un équipé
    if (talentTier(target.xp) >= 49) return false; // déjà au tier max (SSS5)
    const newXp = target.xp + talentInfuseXp(fodder);
    const talents = cur.talents
      .filter((t) => t.id !== fodderId)
      .map((t) => (t.id === targetId ? { ...t, xp: newXp } : t));
    await persistOptimistic(userId, { talents });
    return true;
  }
  // Monte le NIVEAU d'un talent en dépensant des PARCHEMINS 📜 (Bibliothèque),
  // plafonné au niveau JOUEUR (seul le sport rend plus fort).
  async function upgradeTalentLevel(
    userId: string,
    talentId: string,
    playerLevel: number,
  ): Promise<boolean> {
    const cur = row.value;
    if (!cur) return false;
    const t = cur.talents.find((x) => x.id === talentId);
    if (!t) return false;
    const level = talentLevelOf(t);
    if (level >= playerLevel) return false; // plafonné au niveau joueur
    const cost = talentLevelUpCost(level);
    if (cur.parchemins < cost) return false;
    const talents = cur.talents.map((x) => (x.id === talentId ? { ...x, level: level + 1 } : x));
    await persistOptimistic(userId, { parchemins: cur.parchemins - cost, talents });
    return true;
  }

  // Forge une pierre d'invocation 🔮 à la poussière ✨ (voie de secours au farm de donjon).
  async function craftSummonStone(userId: string, dustCost: number): Promise<boolean> {
    const cur = row.value;
    if (!cur || cur.dust < dustCost) return false;
    await persistOptimistic(userId, {
      dust: cur.dust - dustCost,
      summon_stones: cur.summon_stones + 1,
    });
    return true;
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

  // Équipe un objet du sac ET dispose de l'objet remplacé (casse → poussière /
  // vend → or / garde → sac) en UNE écriture. Évite l'aller-retour par le sac.
  async function equipReplacing(
    userId: string,
    itemId: string,
    disposal: 'salvage' | 'sell' | 'keep',
  ) {
    const cur = row.value;
    if (!cur) return;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item) return;
    const equipped: Equipped = { ...cur.equipped };
    const inventory = cur.inventory.filter((i) => i.id !== itemId);
    const prev = equipped[item.slot];
    equipped[item.slot] = item;
    const patch: Partial<CharacterRow> = { equipped };
    if (prev && disposal === 'salvage') patch.dust = cur.dust + salvageValue(prev);
    else if (prev && disposal === 'sell') patch.gold = cur.gold + sellValue(prev);
    else if (prev) inventory.push(prev); // keep
    patch.inventory = inventory;
    return persist(userId, patch);
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
  async function expeCollect(userId: string, now: number) {
    const cur = row.value;
    const exp = cur?.expedition;
    if (!cur || !exp || now < exp.returnAt) return null;
    const o = exp.outcome;
    // Objets ramenés : l'arène en rend PLUSIEURS (o.items) ; les autres POI un seul (o.item).
    const drops = (o.items && o.items.length ? o.items : o.item ? [o.item] : []).map((it) => ({
      ...it,
      id: crypto.randomUUID(),
    }));
    const inventory = drops.length ? [...cur.inventory, ...drops] : cur.inventory;
    // Si le rapport n'a jamais été déposé (app fermée tout du long), on le dépose aussi.
    const messages = exp.reported
      ? cur.messages
      : [buildMessage({ ...exp, reported: true }), ...cur.messages].slice(0, 20);
    await persist(userId, {
      gold: cur.gold + o.gold,
      dust: cur.dust + o.dust,
      stones: cur.stones + (o.stones ?? 0),
      login_energy: cur.login_energy + (o.energy ?? 0), // ⚡ mine → énergie de jeu
      keys: cur.keys + o.key,
      inventory,
      messages,
      set_pieces_seen: drops.length
        ? mergeSetSeen(cur.set_pieces_seen, drops)
        : cur.set_pieces_seen,
      expedition: null,
    });
    return o;
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
  async function collectFilons(userId: string, now: number) {
    const cur = row.value;
    if (!cur || !cur.buildings.length) return null;
    const got = collectable(cur.buildings, now);
    if (got.dust <= 0 && got.stone <= 0 && got.energy <= 0 && got.parchemins <= 0) return null;
    // Report du reliquat : chaque filon n'avance son `collectedAt` que du temps des
    // unités ENTIÈRES récoltées → pas de perte de fraction, un filon lent n'est plus
    // affamé par des récoltes fréquentes (cf. nextCollectedAt).
    const mult = storageMult(cur.buildings);
    await persistOptimistic(userId, {
      dust: cur.dust + got.dust,
      stones: cur.stones + got.stone,
      parchemins: cur.parchemins + got.parchemins, // 📚 bibliothèque → parchemins (talents)
      login_energy: cur.login_energy + got.energy, // ⚡ dynamo → énergie de jeu
      buildings: cur.buildings.map((b) => ({ ...b, collectedAt: nextCollectedAt(b, now, mult) })),
    });
    return got;
  }

  return {
    row,
    loaded,
    fetchMine,
    setPseudo,
    expeSyncMap,
    expeSend,
    expeTick,
    expeCollect,
    expeMarkRead,
    buildFilon,
    upgradeFilon,
    collectFilons,
    applyRun,
    applyBossWin,
    chooseReward,
    applyEndless,
    spendKey,
    applyExpedition,
    equip,
    equipReplacing,
    unequip,
    equipTalent,
    unequipTalent,
    infuseTalent,
    upgradeTalentLevel,
    craftSummonStone,
    salvage,
    sell,
    salvageMany,
    sellMany,
    toggleLock,
    upgradeItem,
    infuseToMax,
    upgradeFamiliar,
    infuseFamiliar,
    recycleFamiliar,
    forge,
    rerollEffect,
    craftSet,
    spendEnergy,
    claimDailyLogin,
    claimLevelUps,
    buyItem,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
