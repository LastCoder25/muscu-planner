import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap } from '@/lib/expedition';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlKindsOf,
  controlYieldCard,
  ensureControls,
} from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { BOOST_IDS, isBoostId, pickBoost, SUPPLY_WEIGHT } from '@/lib/supplies';

const NOW = Date.UTC(2026, 9, 3, 12);
const H = 3600_000;

function island5(L = 90): ExpeditionMap {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(5));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const id = controlIdOf('distillery');

describe('🧪 la distillerie de l’île 5', () => {
  it('l’île 5 : autel des runes, distillerie, laboratoire — sans mine ni source', () => {
    expect([...controlKindsOf({ archipel: archipelOn(5) })].sort()).toEqual([
      'altar',
      'distillery',
      'lab',
    ]);
    const p = island5().pois.find((q) => q.id === id)!;
    expect(poiLabel(p)).toContain('Distillerie');
  });

  it('ne distille QUE des boosts de vitesse', () => {
    const m = captureControl(island5(), id, ['a', 'b', 'c', 'd', 'e'], NOW, 7);
    const got = collectControl(m, id, NOW + 30 * 24 * H, 90);
    const ids = Object.keys(got.supplies);
    expect(ids.length).toBeGreaterThan(0);
    for (const s of ids) expect(isBoostId(s), s).toBe(true);
    expect(got.gold + got.mana + got.runes).toBe(0);
  });

  it('un distillateur : un boost toutes les 12 h ; plus vite à plusieurs', () => {
    const one = captureControl(island5(), id, ['a'], NOW, 7);
    const count = (m: ExpeditionMap, h: number) =>
      Object.values(collectControl(m, id, NOW + h * H, 90).supplies).reduce((a, b) => a + b, 0);
    expect(count(one, CONTROL.distilleryHoursPerItem - 0.1)).toBe(0);
    expect(count(one, CONTROL.distilleryHoursPerItem + 0.1)).toBe(1);
    const five = captureControl(island5(), id, ['a', 'b', 'c', 'd', 'e'], NOW, 7);
    expect(count(five, 10 * 24)).toBeGreaterThan(count(one, 10 * 24));
  });

  it('le tirage suit les poids du butin : un boost court est bien plus fréquent qu’un long', () => {
    const n: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const b = pickBoost((i + 0.5) / 10_000);
      n[b] = (n[b] ?? 0) + 1;
    }
    for (const b of BOOST_IDS) expect(n[b]).toBeGreaterThan(0);
    expect(n.boost5! / n.boost60!).toBeCloseTo(SUPPLY_WEIGHT.boost5 / SUPPLY_WEIGHT.boost60, 0);
  });

  it('la tuile dit des boosts, pas des consommables', () => {
    const m = captureControl(island5(), id, ['a'], NOW, 7);
    const p = m.pois.find((q) => q.id === id)!;
    const card = controlYieldCard(p, NOW + 3 * H, 90)!;
    expect(card.emoji).toBe('🧪');
    expect(card.what).toContain('boost');
  });
});
