// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { normalizePseudo } from '@/lib/character';
import { itemScore, type Item, type ItemSlot, type Equipped } from '@/lib/items';

export interface CharacterRow {
  user_id: string;
  pseudo: string;
  gold: number;
  energy_spent: number;
  equipped: Equipped;
  inventory: Item[];
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

  const COLS = 'user_id, pseudo, gold, energy_spent, equipped, inventory';

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
  async function applyRun(
    userId: string,
    input: { energyCost: number; gold: number; drops: Item[] },
  ) {
    const cur = row.value;
    if (!cur) return;
    const equipped: Equipped = { ...cur.equipped };
    const inventory: Item[] = [...cur.inventory];
    for (const drop of input.drops) {
      const current = equipped[drop.slot];
      if (!current || itemScore(drop) > itemScore(current)) {
        if (current) inventory.push(current);
        equipped[drop.slot] = drop;
      } else {
        inventory.push(drop);
      }
    }
    return persist(userId, {
      gold: cur.gold + input.gold,
      energy_spent: cur.energy_spent + input.energyCost,
      equipped,
      inventory,
    });
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

  return { row, loaded, fetchMine, setPseudo, applyRun, equip, unequip };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
