// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { normalizePseudo } from '@/lib/character';
import {
  salvageValue,
  sellValue,
  upgradeCost,
  type Item,
  type ItemSlot,
  type Equipped,
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
  login_streak: number;
  login_grace_used: boolean;
  last_login_date: string | null;
  login_energy: number;
  consumables: Record<string, number>;
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
    'user_id, pseudo, gold, dust, energy_spent, equipped, inventory, talents, cleared_dungeons, login_streak, login_grace_used, last_login_date, login_energy, consumables';

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

  // Applique un run de donjon : dépense l'énergie, encaisse l'or, range le butin
  // (auto-équipe si le slot est vide ou si l'objet est meilleur ; l'ancien va au sac).
  // Applique un run : dépense l'énergie, encaisse or + poussière, range le butin
  // au SAC (équipement 100 % manuel). Les objets ne montent plus tout seuls.
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
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      energy_spent: cur.energy_spent + input.energyCost,
      inventory: [...cur.inventory, ...input.drops],
      cleared_dungeons: cleared,
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
    equip,
    unequip,
    chooseTalent,
    salvage,
    sell,
    upgradeItem,
    resetTalents,
    spendEnergy,
    claimDailyLogin,
    buyItem,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
