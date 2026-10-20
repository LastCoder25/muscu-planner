// Le niveau Global additionne TOUTES les sorties cardio et séances de tennis. Leurs stores
// les chargeaient avec une limite (100 et 50, 300 sur la page Stats) : au-delà, les plus
// anciennes sortaient du total selon le dernier écran visité — le niveau affiché passait
// de 43 à 42 et l'animation de gain partait d'un point faux (mesuré : 108 sorties, 1 948 XP
// oubliées). Ce test vérifie que les deux stores ramènent tout, au-delà d'une page.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const TOTAL = 2345; // plus de deux pages de 1 000 (le plafond de lignes de Supabase)
const MAX_ROWS = 1000;

const rows = Array.from({ length: TOTAL }, (_, i) => ({
  id: `r${i}`,
  activity: 'course',
  name: 'x',
  performed_at: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
  payload: {},
}));

// Faux client : `.limit(n)` et `.range(a, b)` découpent, et une réponse ne dépasse jamais
// MAX_ROWS lignes — comme le vrai serveur.
function builder() {
  let from = 0;
  let to = TOTAL - 1;
  const b = {
    select: () => b,
    order: () => b,
    eq: () => b,
    limit: (n: number) => {
      to = Math.min(to, from + n - 1);
      return b;
    },
    range: (a: number, z: number) => {
      from = a;
      to = Math.min(to, z);
      return b;
    },
    then: (ok: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({
        data: rows.slice(from, Math.min(to, from + MAX_ROWS - 1) + 1),
        error: null,
      }).then(ok),
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => builder() } }));

describe('les séances qui nourrissent le niveau Global sont chargées en entier', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { useAuthStore } = await import('@/stores/auth');
    useAuthStore().user = { id: 'u1' } as never;
  });

  it('sans utilisateur, rien n’est chargé', async () => {
    const { useAuthStore } = await import('@/stores/auth');
    useAuthStore().user = null;
    const { useCardioStore } = await import('@/stores/cardio');
    const s = useCardioStore();
    await s.fetchLogs();
    expect(s.logs).toHaveLength(0);
  });

  it('cardio : toutes les sorties, sans limite ni plafond de page', async () => {
    const { useCardioStore } = await import('@/stores/cardio');
    const s = useCardioStore();
    await s.fetchLogs();
    expect(s.logs).toHaveLength(TOTAL);
    expect(new Set(s.logs.map((r) => r.id)).size).toBe(TOTAL);
  });

  it('tennis : toutes les séances sur le court', async () => {
    const { useTennisStore } = await import('@/stores/tennis');
    const s = useTennisStore();
    await s.fetchLogs();
    expect(s.logs).toHaveLength(TOTAL);
    expect(new Set(s.logs.map((r) => r.id)).size).toBe(TOTAL);
  });
});
