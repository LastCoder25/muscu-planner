import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import {
  advanceWorld,
  cartoPick,
  CARTO_TYPES,
  createMap,
  EXPE,
  poiLabel,
  type CartoType,
  type ExpeditionMap,
} from '@/lib/expedition';
import {
  captureControl,
  controlIdOf,
  controlKindsOf,
  controlYieldCard,
  ensureControls,
  setCartoFavor,
} from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';

const NOW = Date.UTC(2026, 9, 3, 12);
const H = 3600_000;
const LV = 70;
const id = controlIdOf('cartographer');

function island4(): ExpeditionMap {
  const m = createMap(4, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(4));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
function held(n: number, favor?: CartoType): ExpeditionMap {
  let m = captureControl(island4(), id, ['a', 'b', 'c', 'd', 'e'].slice(0, n), NOW, 7);
  if (favor) m = setCartoFavor(m, id, favor);
  return m;
}
/** Les lieux d'un type APPARUS pendant `days` jours (ids distincts vus à chaque heure). */
function spawned(m0: ExpeditionMap, type: string, days = 20): number {
  const seen = new Set<string>();
  let m = m0;
  for (let h = 1; h <= days * 24; h++) {
    m = advanceWorld(m, NOW + h * H, LV, ISLAND_OUTPOST_LEVEL);
    for (const p of m.pois) if (p.type === type) seen.add(p.id);
  }
  return seen.size;
}

describe('🗺️ le cartographe de l’île 4', () => {
  it('l’île 4 : cartographe, fortin', () => {
    expect([...controlKindsOf({ archipel: archipelOn(4) })].sort()).toEqual([
      'cartographer',
      'fort',
    ]);
    expect(poiLabel(island4().pois.find((p) => p.id === id)!)).toContain('Cartographe');
  });

  it('ne propose aucun lieu de la partie héros, ni rare', () => {
    for (const t of ['well', 'shrine', 'archive', 'arena', 'plunder', 'vein', 'rift'])
      expect(CARTO_TYPES as readonly string[]).not.toContain(t);
  });

  it('à l’ennemi, rien ne se choisit ; tenu, le choix est gardé', () => {
    const m = island4();
    expect(setCartoFavor(m, id, 'den')).toBe(m);
    const h = held(3, 'den');
    expect(h.pois.find((p) => p.id === id)!.control!.favor).toBe('den');
    expect(setCartoFavor(h, id, 'well' as CartoType)).toBe(h);
  });

  it('sans type choisi ou sans arpenteur, rien ne change', () => {
    expect(cartoPick(held(3).pois)).toBeNull();
    expect(cartoPick(held(0, 'den').pois)).toBeNull();
    expect(cartoPick(held(3, 'den').pois)!.chance).toBe(EXPE.cartoChance[3]);
  });

  it('plus d’arpenteurs, plus souvent', () => {
    expect(cartoPick(held(1, 'den').pois)!.chance).toBeLessThan(
      cartoPick(held(5, 'den').pois)!.chance,
    );
  });

  it('le type choisi apparaît nettement plus souvent sur l’île', () => {
    const without = spawned(held(3), 'den');
    const withC = spawned(held(3, 'den'), 'den');
    expect(withC).toBeGreaterThan(without * 2);
  }, 60_000);

  it('la tuile dit le lieu choisi et sa part', () => {
    const card = controlYieldCard(held(3, 'den').pois.find((p) => p.id === id)!, NOW, LV)!;
    expect(card.value).toBe(`${Math.round(EXPE.cartoChance[3]! * 100)} %`);
    expect(card.what).toContain('Tanière');
  });
});
