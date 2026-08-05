// Store worldBoss — boss communautaire hebdomadaire. Accès Supabase centralisé.
// Les mutations passent par des RPC SECURITY DEFINER (HP atomiques, pas d'écriture directe).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { currentBoss, type BossSpec } from '@/data/worldBoss';

export interface BossRow {
  id: string;
  name: string;
  emoji: string;
  hp_total: number;
  hp_remaining: number;
  week_start: string;
  week_end: string;
  status: 'active' | 'defeated';
}
export interface Contribution {
  user_id: string;
  pseudo: string;
  damage: number;
  claimed: boolean;
}

export const useWorldBossStore = defineStore('worldBoss', () => {
  const boss = ref<BossRow | null>(null);
  const contributions = ref<Contribution[]>([]);
  const spec = ref<BossSpec>(currentBoss());

  async function refresh() {
    const s = currentBoss();
    spec.value = s;
    // Crée le boss de la semaine s'il n'existe pas encore (idempotent).
    await supabase.rpc('ensure_world_boss', {
      p_id: s.id,
      p_name: s.name,
      p_emoji: s.emoji,
      p_hp: s.hp,
      p_start: s.weekStart,
      p_end: s.weekEnd,
    });
    const { data: b } = await supabase
      .from('world_bosses')
      .select('*')
      .eq('id', s.id)
      .maybeSingle();
    boss.value = (b as BossRow) ?? null;
    const { data: c } = await supabase
      .from('boss_contributions')
      .select('user_id, pseudo, damage, claimed')
      .eq('boss_id', s.id)
      .order('damage', { ascending: false });
    contributions.value = (c as Contribution[]) ?? [];
    return boss.value;
  }

  async function hit(damage: number, pseudo: string) {
    if (!boss.value) return;
    const { error } = await supabase.rpc('hit_world_boss', {
      p_id: boss.value.id,
      p_damage: Math.max(1, Math.round(damage)),
      p_pseudo: pseudo,
    });
    if (error) throw error;
    await refresh();
  }

  async function claim(): Promise<{ gold: number; dust: number; top: boolean } | null> {
    if (!boss.value) return null;
    const { data, error } = await supabase.rpc('claim_boss_reward', { p_id: boss.value.id });
    if (error) throw error;
    await refresh();
    const res = data as { ok: boolean; gold?: number; dust?: number; top?: boolean };
    return res?.ok ? { gold: res.gold ?? 0, dust: res.dust ?? 0, top: !!res.top } : null;
  }

  return { boss, contributions, spec, refresh, hit, claim };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useWorldBossStore, import.meta.hot));
}
