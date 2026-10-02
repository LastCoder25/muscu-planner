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

describe('📖 les archives de l’île 2', () => {
  it('l’île 2 porte socle + archives ; l’île 1 la liste d’origine sans tour de guet', () => {
    const two = kinds(islandMap(2, 40));
    for (const k of ['mine', 'training', 'mana', 'archives']) expect(two).toContain(k);
    expect(two).not.toContain('garden');
    expect(two).not.toContain('scriptorium');
    expect(two).not.toContain('tower');
    const one = kinds(islandMap(1, 20));
    for (const k of CONTROL.kinds.filter((x) => x !== 'tower')) expect(one).toContain(k);
    expect(one).not.toContain('tower');
    expect(one).not.toContain('archives');
    expect(controlKindsOf({})).toEqual(CONTROL.kinds);
  });
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
