import { describe, expect, it } from 'vitest';
import { ALL_LEGS, legPillOn, shownLegs, toggleLeg, tripLegTiles, type LegSource } from '@/lib/tripLegTiles';

const trip = (o: Partial<LegSource> = {}): LegSource => ({
  key: 'g1',
  back: false,
  time: '→ 12 min',
  total: '1 h 05',
  pct: 30,
  legs: { go: '12 min', back: '53 min', detail: '' },
  ...o,
});

describe('🚶↩️ une tuile par étape', () => {
  it('à l’aller : deux tuiles, Aller puis Retour à venir, même voyage', () => {
    const [go, back] = tripLegTiles(trip());
    expect(go).toMatchObject({ leg: 'go', tripKey: 'g1', time: '→ 12 min', total: null, back: false });
    expect(back).toMatchObject({
      leg: 'back',
      tripKey: 'g1',
      future: true,
      back: true,
      total: '1 h 05',
      line: '↩ 53 min',
      pct: 0,
    });
    expect(go!.key).not.toBe(back!.key);
  });

  it('sur le retour : une seule tuile, le retour en cours', () => {
    const t = tripLegTiles(trip({ back: true, legs: { go: null, back: '20 min', detail: '' } }));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ leg: 'back', future: false, key: 'g1', pct: 30 });
  });

  it('aller simple, programmé, mer, rappel : une seule tuile', () => {
    expect(tripLegTiles(trip({ legs: null }))).toMatchObject([{ leg: 'go', key: 'g1' }]);
    expect(tripLegTiles(trip({ pending: true }))).toMatchObject([{ leg: 'go' }]);
    expect(tripLegTiles(trip({ sea: { from: 1, to: 2 } }))).toMatchObject([{ leg: 'go' }]);
    expect(tripLegTiles(trip({ toBase: true }))).toMatchObject([{ leg: 'back', back: true }]);
  });
});

describe('🔎 filtre des étapes', () => {
  it('les deux affichées : toucher ISOLE ; retoucher l’étape allumée retire le filtre', () => {
    const both = ['go', 'back'] as const;
    expect([...both].filter((l) => legPillOn(ALL_LEGS, l, both))).toEqual([]);
    const a = toggleLeg(ALL_LEGS, 'go', both);
    expect([...a]).toEqual(['go']);
    expect([...both].filter((l) => legPillOn(a, l, both))).toEqual(['go']);
    expect([...toggleLeg(a, 'go', both)].sort()).toEqual(['back', 'go']);
    expect([...toggleLeg(a, 'back', both)].sort()).toEqual(['back', 'go']);
  });
  it('une étape choisie qui se vide retombe sur tout, une rangée vidée reste vide', () => {
    expect([...shownLegs(new Set(['go']), ['back'])]).toEqual(['back']);
    expect(shownLegs(new Set(), ['go', 'back']).size).toBe(0);
    expect([...shownLegs(new Set(['back']), ['go', 'back'])]).toEqual(['back']);
  });
});
