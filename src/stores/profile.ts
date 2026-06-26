// Store profile — la ligne `profiles` de l'utilisateur courant.
// payload = objet Profile complet (contrat v1.0) ; level_config dérivé.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { Profile, LevelConfig } from '@/lib/types';
import { deriveLevelConfig } from '@/lib/levelConfig';
import { supabase } from '@/lib/supabase';

export const useProfileStore = defineStore('profile', () => {
  const profile = ref<Profile | null>(null);
  const levelConfig = ref<LevelConfig | null>(null);
  const loaded = ref(false);

  async function fetch(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('payload, level_config')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    profile.value = (data?.payload as Profile) ?? null;
    levelConfig.value = (data?.level_config as LevelConfig) ?? null;
    loaded.value = true;
    return profile.value;
  }

  // Écrit la ligne profiles : payload complet + colonnes extraites + level_config.
  async function save(userId: string, p: Profile) {
    const cfg = deriveLevelConfig(p.experience.level);
    const row = {
      user_id: userId,
      level: p.experience.level,
      objective: p.objective,
      sessions_per_week: p.availability.sessions_per_week,
      units: p.preferences?.units ?? 'kg',
      payload: p,
      level_config: cfg,
    };
    const { error } = await supabase.from('profiles').insert(row);
    if (error) throw error;
    profile.value = p;
    levelConfig.value = cfg;
    loaded.value = true;
  }

  // Met à jour la ligne profiles existante (édition depuis l'écran Profil).
  async function update(userId: string, p: Profile) {
    const cfg = deriveLevelConfig(p.experience.level);
    const row = {
      level: p.experience.level,
      objective: p.objective,
      sessions_per_week: p.availability.sessions_per_week,
      units: p.preferences?.units ?? 'kg',
      payload: p,
      level_config: cfg,
    };
    const { error } = await supabase.from('profiles').update(row).eq('user_id', userId);
    if (error) throw error;
    profile.value = p;
    levelConfig.value = cfg;
    loaded.value = true;
  }

  function reset() {
    profile.value = null;
    levelConfig.value = null;
    loaded.value = false;
  }

  return { profile, levelConfig, loaded, fetch, save, update, reset };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProfileStore, import.meta.hot));
}
