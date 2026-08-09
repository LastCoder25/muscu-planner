// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { normalizePseudo, levelUpEnergy } from '@/lib/character';
import {
  salvageValue,
  sellValue,
  upgradeCost,
  type Item,
  type ItemSlot,
  type Equipped,
  type PendingReward,
} from '@/lib/items';
import { advanceStreak, dailyLoginEnergy, daysBetweenIso } from '@/lib/loginStreak';

export interface CharacterRow {
  user_id: string;
  pseudo: string;
  gold: number;
  dust: number;
  energy_spent: number;
  equipped: Equipped;
  inventory: Item[];
  talents: string[];
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

  const COLS =
    'user_id, pseudo, gold, dust, energy_spent, equipped, inventory, talents, cleared_dungeons, defeated_bosses, login_streak, login_grace_used, last_login_date, login_energy, consumables, reward_level, endless_best, pending_reward';

  async function fetchMine() {
    const { data, error } = await supabase.from('characters').select(COLS).maybeSingle();
    if (error) throw error;
    row.value = data ?? null;
    loaded.value = true;
    return row.value;
  }

  // Crée ou renomme le personnage. L'unicité est garantie par la base : un pseudo
  // déjà pris renvoie l'erreur 23505 → on la traduit en PseudoTakenError.
  async function setPseudo(userId: string, rawPseudo: string) {
    const pseudo = normalizePseudo(rawPseudo);
    const { data, error } = await supabase
      .from('characters')
      .upsert({ user_id: userId, pseudo, updated_at: new Date().toISOString() })
      .select(COLS)
      .single();
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
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      cleared_dungeons: cleared,
      consumables,
    });
  }

  // Applique une tentative de BOSS de palier : dépense l'énergie (win ou lose),
  // encaisse l'or + poussière de base, et — en cas de victoire — mémorise le boss
  // vaincu + pose une RÉCOMPENSE EN ATTENTE (3 candidats au choix, cf. chooseReward).
  async function applyBossWin(
    userId: string,
    input: {
      bossId: string;
      energyCost: number;
      gold: number;
      dust: number;
      defeated: boolean;
      pending?: PendingReward | null;
      consumed?: string[];
    },
  ) {
    const cur = row.value;
    if (!cur) return;
    const defeated =
      input.defeated && !cur.defeated_bosses.includes(input.bossId)
        ? [...cur.defeated_bosses, input.bossId]
        : cur.defeated_bosses;
    const consumables = { ...cur.consumables };
    for (const id of input.consumed ?? []) {
      const left = (consumables[id] ?? 0) - 1;
      if (left > 0) consumables[id] = left;
      else delete consumables[id];
    }
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      energy_spent: cur.energy_spent + input.energyCost,
      defeated_bosses: defeated,
      consumables,
      pending_reward: input.pending ?? cur.pending_reward ?? null,
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
      energy_spent: cur.energy_spent + input.energyCost,
      equipped: dist.equipped,
      inventory: dist.inventory,
      endless_best: input.cleared && input.tier > cur.endless_best ? input.tier : cur.endless_best,
      consumables,
    });
  }

  // Achat en boutique : débite l'or, applique l'effet (énergie instantanée →
  // login_energy = pool d'énergie bonus ; consommable → +1 au compteur).
  async function buyItem(
    userId: string,
    item: { id: string; cost: number; kind: string; energy?: number },
  ) {
    const cur = row.value;
    if (!cur || cur.gold < item.cost) return false;
    const patch: Record<string, unknown> = { gold: cur.gold - item.cost };
    if (item.kind === 'energy') {
      patch.login_energy = cur.login_energy + (item.energy ?? 0);
    } else {
      patch.consumables = { ...cur.consumables, [item.id]: (cur.consumables[item.id] ?? 0) + 1 };
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

  // Casse un objet du sac → Poussière d'évolution.
  async function salvage(userId: string, itemId: string) {
    const cur = row.value;
    if (!cur) return;
    const item = cur.inventory.find((i) => i.id === itemId);
    if (!item) return;
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
    if (!item) return;
    return persist(userId, {
      gold: cur.gold + sellValue(item),
      inventory: cur.inventory.filter((i) => i.id !== itemId),
    });
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

  // Réinitialise les talents (respec) contre de l'or → on les rechoisit ensuite.
  async function resetTalents(userId: string, cost: number) {
    const cur = row.value;
    if (!cur || cur.talents.length === 0 || cur.gold < cost) return;
    return persist(userId, { gold: cur.gold - cost, talents: [] });
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

  // Choisit un talent (validation du quota côté appelant via talentsEarned).
  async function chooseTalent(userId: string, code: string, maxAllowed: number) {
    const cur = row.value;
    if (!cur || cur.talents.length >= maxAllowed) return;
    return persist(userId, { talents: [...cur.talents, code] });
  }

  return {
    row,
    loaded,
    fetchMine,
    setPseudo,
    applyRun,
    applyBossWin,
    chooseReward,
    applyEndless,
    equip,
    equipReplacing,
    unequip,
    chooseTalent,
    salvage,
    sell,
    upgradeItem,
    resetTalents,
    spendEnergy,
    claimDailyLogin,
    claimLevelUps,
    buyItem,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
