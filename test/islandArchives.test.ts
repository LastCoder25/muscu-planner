import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap } from '@/lib/expedition';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlKindsOf,
  controlLootMessage,
  ensureControls,
} from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { labyKeyPriceAt } from '@/data/labyrinths';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;

function islandMap(id: number, L: number): ExpeditionMap {
  const m = createMap(3, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const kinds = (m: ExpeditionMap) => m.pois.flatMap((p) => (p.control ? [p.control.kind] : []));
describe('🏝️ lieux fixes des îles : aucun doublon, aucun camp', () => {
  it('île 1 : mine, source de mana, jardin · île 2 : scriptorium, ossuaire, archives', () => {
    const fixed = (m: ExpeditionMap) =>
      kinds(m)
        .filter((k) => !['objective', 'fortress', 'citadel'].includes(k))
        .sort();
    expect(fixed(islandMap(1, 20))).toEqual(['garden', 'mana', 'mine']);
    expect(fixed(islandMap(2, 40))).toEqual(['archives', 'ossuary', 'scriptorium']);
    expect(controlKindsOf({})).toEqual(CONTROL.kinds);
  });
  it('aucun lieu fixe n’apparaît sur deux îles', () => {
    const seen = new Map<string, number>();
    for (const isl of [1, 2, 3, 4, 5])
      for (const k of controlKindsOf({ archipel: archipelOn(isl) })) {
        expect(seen.get(k), `${k} déjà sur l’île ${seen.get(k)}`).toBeUndefined();
        seen.set(k, isl);
      }
  });
});

describe('📖 les archives de l’île 2 (3ᵉ lieu fixe, 2026-10-04)', () => {
  it('tenues au complet, une entrée du palier de l’île toutes les 48 h', () => {
    const L = 40;
    const id = controlIdOf('archives');
    let m = islandMap(2, L);
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Archives');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const price = labyKeyPriceAt(L);
    const half = collectControl(m, id, NOW + 24 * H, L);
    expect(half.keys).toBeLessThanOrEqual(Math.ceil(price / 2));
    const got = collectControl(m, id, NOW + 48 * H, L);
    expect(got.keys).toBeGreaterThanOrEqual(price);
    expect(got.keys).toBeLessThanOrEqual(Math.ceil(price * 1.6));
    expect(got.gold + got.mana + got.runes).toBe(0);
    // Un seul archiviste : moitié moins vite.
    const one = captureControl(islandMap(2, L), id, ['a'], NOW, 7);
    expect(collectControl(one, id, NOW + 48 * H, L).keys).toBeLessThan(got.keys);
  });
  it('le rapport dit les clés', () => {
    const m = islandMap(2, 40);
    const p = m.pois.find((q) => q.id === controlIdOf('archives'))!;
    expect(controlLootMessage(p, NOW, {}, 0, 2)!.title).toContain('2 clés du Labyrinthe');
    expect(controlLootMessage(p, NOW, {}, 0, 0)).toBeNull();
  });
});
