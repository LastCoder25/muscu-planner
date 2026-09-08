import { describe, it, expect } from 'vitest';
import {
  spawnWindow,
  createMap,
  advanceWorld,
  resolveOutcome,
  HARVEST_TYPES,
  HARVEST,
  EXPE,
  poiCombatant,
  type Poi,
  type PoiType,
} from '@/lib/expedition';
import { playerCombatant } from '@/lib/combat';

const HOUR = 3_600_000;
const hero = playerCombatant({ puissance: 60, endurance: 60, agilite: 60 }, 26);

function poi(type: PoiType, level = 26, distNorm = 0.5): Poi {
  return {
    id: 'p',
    type,
    level,
    x: 100,
    y: 40,
    distNorm,
    spawnedAt: 0,
    expiresAt: 1e15,
  } as Poi;
}

describe('fenêtre de niveaux', () => {
  it('part du niveau du joueur et monte à +10 (plus de POI « en dessous »)', () => {
    for (const L of [1, 5, 26, 60]) {
      const w = spawnWindow(L);
      expect(w.min).toBe(Math.max(1, L));
      expect(w.max).toBe(Math.max(1, L) + 10);
    }
  });
});

describe('POI de récolte', () => {
  const types: PoiType[] = ['well', 'shrine', 'archive'];

  it('ne perdent jamais et ne rendent JAMAIS de butin (la carte ne sait plus en produire)', () => {
    for (const t of types) {
      for (let s = 1; s < 40; s++) {
        const o = resolveOutcome(hero, poi(t), s, 26);
        expect(o.win, t).toBe(true);
        expect(o.item, t).toBeNull();
        expect(o.items ?? [], t).toEqual([]);
      }
    }
  });

  it('paient chacun SA ressource vivante, et rien d’autre', () => {
    const well = resolveOutcome(hero, poi('well'), 7, 26);
    expect(well.energy).toBeGreaterThan(0);
    expect(well.summonStones).toBe(0);

    const shrine = resolveOutcome(hero, poi('shrine'), 7, 26);
    expect(shrine.summonStones).toBeGreaterThanOrEqual(2);
    expect(shrine.energy).toBe(0);

    const arch = resolveOutcome(hero, poi('archive'), 7, 26);
    expect(arch.fragments).toBeGreaterThan(0);
    expect(arch.inkDust).toBeGreaterThan(0);
    expect(arch.energy).toBe(0);
  });

  it('ne versent AUCUNE devise morte (poussière, parchemins d’enchant)', () => {
    for (const t of types) {
      const o = resolveOutcome(hero, poi(t), 3, 26);
      expect(o.dust, t).toBe(0);
      expect(o.enchantScrolls, t).toBe(0);
    }
  });

  it("l'énergie reste un complément borné, jamais un substitut au sport", () => {
    // Même au niveau 100 et au bout du monde, une source reste sous le plafond.
    const o = resolveOutcome(hero, poi('well', 100, 1), 11, 100);
    expect(o.energy).toBeLessThanOrEqual(HARVEST.wellEnergyMax);
  });

  it('les pierres suivent le coût d’un boss (une visite ≈ une tentative)', () => {
    for (const L of [10, 26, 50]) {
      const o = resolveOutcome(hero, poi('shrine', L), 5, L);
      const coutBoss = 1 + Math.floor(L / 5);
      expect(o.summonStones).toBeGreaterThanOrEqual(Math.floor(coutBoss * 0.8));
      expect(o.summonStones).toBeLessThan(coutBoss * 3);
    }
  });

  it('aucun combat : la récolte est indépendante de la puissance du héros', () => {
    const faible = playerCombatant({ puissance: 1, endurance: 1, agilite: 1 }, 1);
    const a = resolveOutcome(hero, poi('shrine'), 9, 26);
    const b = resolveOutcome(faible, poi('shrine'), 9, 26);
    expect(b.summonStones).toBe(a.summonStones);
    expect(b.win).toBe(true);
  });
});

describe('rythme de la carte', () => {
  it('respire au lieu d’être saturée : le nombre de POI reste dans une bande étroite', () => {
    let map = createMap(1234, 0, 26);
    const counts: number[] = [];
    // Une semaine, relevé toutes les 2 h.
    for (let t = 0; t <= 7 * 24 * HOUR; t += 2 * HOUR) {
      map = advanceWorld(map, t, 26);
      counts.push(map.pois.length);
    }
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(min).toBeGreaterThanOrEqual(EXPE.poiFloor); // jamais à sec
    expect(max).toBeLessThanOrEqual(EXPE.poiCap); // jamais une soupe
    // …et la carte ne colle PAS en permanence au plafond (sinon aucun arbitrage).
    const auPlafond = counts.filter((c) => c >= EXPE.poiCap).length / counts.length;
    expect(auPlafond, `${Math.round(auPlafond * 100)} % du temps au plafond`).toBeLessThan(0.85);
  });

  it('le plancher reste sous le plafond (réglage cohérent)', () => {
    expect(EXPE.poiFloor).toBeLessThan(EXPE.poiCap);
  });
});

describe('difficulté des POI de combat', () => {
  it('un adversaire de +10 niveaux reste défini (la fenêtre ne casse rien)', () => {
    const foe = poiCombatant(36, 'lair');
    expect(foe.pv).toBeGreaterThan(0);
    expect(foe.damage).toBeGreaterThan(0);
  });
  it('HARVEST_TYPES contient bien les récoltes et pas les combats', () => {
    expect([...HARVEST_TYPES].sort()).toEqual(['archive', 'mine', 'shrine', 'well']);
    expect(HARVEST_TYPES.has('lair')).toBe(false);
    expect(HARVEST_TYPES.has('arena')).toBe(false);
  });
});
