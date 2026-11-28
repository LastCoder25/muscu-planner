// @vitest-environment happy-dom
//
// ⏫ TOUT AMÉLIORER la base : l'ordre et l'arrêt (lib), puis l'enregistrement (le VRAI store,
// une base simulée au niveau de `fetch`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { planBaseUpgrades } from '@/lib/baseUpgrade';
import { buildingUpgradeCost as cost, type Building } from '@/lib/buildings';
import type { DefenseStructure } from '@/lib/raid';

const yard = (typeId: Building['typeId'], level: number, slot = 0): Building => ({
  typeId,
  level,
  slot,
  collectedAt: 0,
});

describe('planBaseUpgrades', () => {
  const buildings = [yard('pantheon', 4, 0), yard('barracks', 1, 1)];
  const defenses: DefenseStructure[] = [
    { typeId: 'wall', level: 3 },
    { typeId: 'turret', level: 2, damaged: true },
  ];

  it('paie les crans du moins cher au plus cher, cour et enceinte mêlées', () => {
    // Juste de quoi : caserne 1→2, puis caserne 2→3 et tourelles 2→3.
    const gold = cost(1) + cost(2) * 2;
    const plan = planBaseUpgrades({ gold, playerLevel: 10, buildings, defenses });
    expect(plan.lines.map((l) => [l.key, l.from, l.to])).toEqual([
      ['yard:barracks', 1, 3],
      ['def:turret', 2, 3],
    ]);
    expect(plan.levels).toBe(3);
    expect(plan.spent).toBe(gold);
    expect(plan.nextCost).toBe(cost(3));
  });

  it('s’arrête quand le cran le moins cher n’est plus payable, sans jamais dépasser l’or', () => {
    for (const gold of [0, cost(1) - 1, cost(1), 50_000, 123_456]) {
      const plan = planBaseUpgrades({ gold, playerLevel: 60, buildings, defenses });
      expect(plan.spent).toBeLessThanOrEqual(gold);
      expect(gold - plan.spent).toBeLessThan(plan.nextCost!);
      // Le coût annoncé est celui des niveaux réellement pris.
      const paid = plan.lines.reduce((s, l) => {
        for (let n = l.from; n < l.to; n++) s += cost(n);
        return s;
      }, 0);
      expect(plan.spent).toBe(paid);
    }
  });

  it('monte à niveau égal : aucun cran pris n’est plus cher qu’un cran laissé', () => {
    const plan = planBaseUpgrades({ gold: 40_000, playerLevel: 60, buildings, defenses });
    const reached = [...plan.buildings, ...plan.defenses].map((s) => s.level);
    const raised = plan.lines.map((l) => l.to);
    expect(Math.max(...raised) - Math.min(...reached)).toBeLessThanOrEqual(1);
  });

  it('plafonne au niveau du joueur, sans rien construire ni toucher à l’entrée', () => {
    const plan = planBaseUpgrades({ gold: 1e12, playerLevel: 5, buildings, defenses });
    expect(plan.buildings.map((b) => [b.typeId, b.level])).toEqual([
      ['pantheon', 5],
      ['barracks', 5],
    ]);
    expect(plan.defenses).toEqual([
      { typeId: 'wall', level: 5 },
      { typeId: 'turret', level: 5, damaged: true },
    ]);
    expect(plan.nextCost).toBeNull();
    expect(buildings[0]!.level).toBe(4);
    expect(defenses[1]!.level).toBe(2);
  });

  it('une structure déjà au-dessus du joueur reste telle quelle', () => {
    const plan = planBaseUpgrades({
      gold: 1e9,
      playerLevel: 3,
      buildings: [yard('pantheon', 7)],
      defenses: [],
    });
    expect(plan).toMatchObject({ levels: 0, spent: 0, nextCost: null, lines: [] });
    expect(plan.buildings[0]!.level).toBe(7);
  });
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('upgradeAllBase (store)', { timeout: 60000 }, () => {
  async function setup(gold: number) {
    const writes: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) writes.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Promise.resolve(
        new Response(JSON.stringify({ updated_at: '2026-01-01T00:00:00Z' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }) as typeof fetch;
    setActivePinia(createPinia());
    const { useCharacterStore } = await import('@/stores/character');
    const char = useCharacterStore();
    (char as unknown as { row: unknown }).row = {
      user_id: 'u1',
      gold,
      buildings: [yard('barracks', 1)],
      base: { seed: 1, defenses: [{ typeId: 'wall', level: 1 }] },
    };
    return { char, writes };
  }

  it('enregistre le lot entier en UNE écriture : or, cour et enceinte', async () => {
    const gold = (cost(1) + cost(2)) * 2 + 7;
    const { char, writes } = await setup(gold);
    const done = await char.upgradeAllBase('u1', 20);
    expect(done!.levels).toBe(4);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      gold: 7,
      buildings: [expect.objectContaining({ typeId: 'barracks', level: 3 })],
      base: { seed: 1, defenses: [{ typeId: 'wall', level: 3 }] },
    });
    expect(char.row!.gold).toBe(7);
  });

  it('sans de quoi payer un seul cran, n’écrit rien', async () => {
    const { char, writes } = await setup(cost(1) - 1);
    const done = await char.upgradeAllBase('u1', 20);
    expect(done!.levels).toBe(0);
    expect(writes).toHaveLength(0);
  });
});
