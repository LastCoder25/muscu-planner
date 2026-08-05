// Store character — personnage RPG (Phase 1 : pseudo unique). Accès Supabase centralisé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { normalizePseudo } from '@/lib/character';

export interface CharacterRow {
  user_id: string;
  pseudo: string;
  gold: number;
  energy_spent: number;
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

  const COLS = 'user_id, pseudo, gold, energy_spent';

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

  // Applique le résultat d'un combat : dépense l'énergie, encaisse l'or gagné.
  async function applyCombat(userId: string, energyCost: number, goldWon: number) {
    const cur = row.value;
    if (!cur) return;
    const gold = cur.gold + goldWon;
    const energy_spent = cur.energy_spent + energyCost;
    const { data, error } = await supabase
      .from('characters')
      .update({ gold, energy_spent, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select(COLS)
      .single();
    if (error) throw error;
    row.value = data;
    return data;
  }

  return { row, loaded, fetchMine, setPseudo, applyCombat };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCharacterStore, import.meta.hot));
}
