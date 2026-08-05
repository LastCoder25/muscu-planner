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

export interface CharacterRow {
  user_id: string;
  pseudo: string;
  gold: number;
  dust: number;
  energy_spent: number;
  equipped: Equipped;
  inventory: Item[];
  talents: string[];
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

  const COLS = 'user_id, pseudo, gold, dust, energy_spent, equipped, inventory, talents';

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
    input: { energyCost: number; gold: number; dust: number; drops: Item[] },
  ) {
    const cur = row.value;
    if (!cur) return;
    return persist(userId, {
      gold: cur.gold + input.gold,
      dust: cur.dust + input.dust,
      energy_spent: cur.energy_spent + input.energyCost,
      inventory: [...cur.inventory, ...input.drops],
    });
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
    const cost = upgradeCost(item.level);
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
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
