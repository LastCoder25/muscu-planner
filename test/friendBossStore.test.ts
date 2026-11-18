// 🎯 Le store du boss entre amis : la lecture des frappes est PAGINÉE (1 000 lignes au plus par
// réponse), et une frappe sur un boss à choix part vers `fboss_hit_exo`.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const calls: { table: string; range?: [number, number] }[] = [];
const rpcs: { fn: string; args: unknown }[] = [];
const HITS = Array.from({ length: 2350 }, (_, i) => ({
  id: `h${String(i).padStart(5, '0')}`,
  boss_id: 'b1',
  user_id: 'me',
  units: 1,
  surplus: 0,
  created_at: '2026-11-02T10:00:00Z',
}));
const BOSS = {
  id: 'b1',
  owner_id: 'me',
  family: 'push',
  exercise_id: 'pushup',
  exercise_name: 'Pompes + Tractions',
  rep_weight: 1,
  created_at: '2026-11-02T10:00:00Z',
  start_at: null,
  defeated_at: null,
  hp_total: 60000,
  damage: 0,
  exercises: [
    { id: 'pushup', name: 'Pompes', family: 'push', rep_weight: 1 },
    { id: 'pullup', name: 'Tractions', family: 'pull', rep_weight: 1.4 },
  ],
};

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    const state: { range?: [number, number] } = {};
    const b: Record<string, unknown> = {};
    const rows = () => {
      if (table === 'friend_boss_members')
        return [{ boss_id: 'b1', user_id: 'me', status: 'accepted', units: 0 }];
      if (table === 'friend_bosses') return [BOSS];
      if (table === 'friend_boss_hits')
        return state.range ? HITS.slice(state.range[0], state.range[1] + 1) : HITS.slice(0, 1000);
      return [];
    };
    for (const m of ['select', 'eq', 'in', 'order']) b[m] = () => b;
    b.range = (from: number, to: number) => {
      state.range = [from, to];
      calls.push({ table, range: [from, to] });
      return b;
    };
    b.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(res);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: (fn: string, args: unknown) => {
        rpcs.push({ fn, args });
        return Promise.resolve({
          data: { ok: true, accepted: 5, damage_points: 100, surplus_points: 0 },
          error: null,
        });
      },
    },
  };
});
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }));
vi.mock('@/composables/useLazyCharacter', () => ({
  loadCharacterStore: async () => ({ spentBossTokens: () => undefined }),
}));

import { useFriendBossStore } from '@/stores/friendBoss';

beforeEach(() => {
  setActivePinia(createPinia());
  calls.length = 0;
  rpcs.length = 0;
});

describe('🎯 store du boss entre amis', () => {
  it('⚠️ les frappes sont lues PAGE PAR PAGE jusqu’à épuisement (l’XP les additionne toutes)', async () => {
    const st = useFriendBossStore();
    await st.fetchMine();
    expect(st.hits).toHaveLength(2350);
    expect(calls.filter((c) => c.table === 'friend_boss_hits').map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('une frappe sur un boss à choix part vers fboss_hit_exo, jamais fboss_hit', async () => {
    const st = useFriendBossStore();
    await st.fetchMine();
    const r = await st.hit('b1', 20, 'pullup');
    expect(rpcs[0]).toEqual({
      fn: 'fboss_hit_exo',
      args: { p_boss: 'b1', p_units: 20, p_exercise_id: 'pullup' },
    });
    // Les points du serveur sont lus en équivalent poussée (÷ 20).
    expect(r).toMatchObject({ accepted: 5, damage: 5, surplus: 0 });
    await st.hit('b1', 7); // sans exo : le premier, jamais l'ancienne fonction
    expect(rpcs[1]!.fn).toBe('fboss_hit_exo');
  });
});
