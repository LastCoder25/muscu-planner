import { describe, it, expect } from 'vitest';
import { resourceGains, mergeGains } from '@/lib/resourceGains';
import { gateGain, GAIN_GATE_MS } from '@/lib/resourceGains';

describe('resourceGains — ce qui vient d’arriver', () => {
  it('ne rend que les hausses, arrondies', () => {
    expect(
      resourceGains({ gold: 100, mana: 5, keys: 3 }, { gold: 1100.4, mana: 2, keys: 3 }),
    ).toEqual([{ id: 'gold', n: 1100 - 100 }]);
  });
  it('une dépense ne s’annonce jamais', () => {
    expect(resourceGains({ gold: 500 }, { gold: 10 })).toEqual([]);
  });
  it('une ressource inconnue d’un côté n’est pas comparée', () => {
    expect(resourceGains({}, { gold: 500 })).toEqual([]);
    expect(resourceGains({ gold: 1 }, { gold: NaN })).toEqual([]);
  });
});

describe('mergeGains — plusieurs ticks, une ligne par ressource', () => {
  it('additionne une même ressource et garde l’ordre d’arrivée', () => {
    const a = mergeGains([], [{ id: 'gold', n: 10 }]);
    const b = mergeGains(a, [
      { id: 'mana', n: 2 },
      { id: 'gold', n: 5 },
    ]);
    expect(b).toEqual([
      { id: 'gold', n: 15 },
      { id: 'mana', n: 2 },
    ]);
    expect(a).toEqual([{ id: 'gold', n: 10 }]); // pas de mutation
  });
});

describe('gateGain — l’or et le mana une fois par heure', () => {
  const H = GAIN_GATE_MS;
  for (const id of ['gold', 'mana'] as const) {
    it(`${id} : annoncé une fois, retenu une heure, puis le cumul sort`, () => {
      let r = gateGain([{ id, n: 100 }], id, { held: 0, shownAt: 0 }, 10 * H);
      expect(r.show).toEqual([{ id, n: 100 }]);
      r = gateGain(
        [
          { id, n: 50 },
          { id: 'keys', n: 1 },
        ],
        id,
        r.gate,
        10 * H + 1000,
      );
      expect(r.show).toEqual([{ id: 'keys', n: 1 }]);
      r = gateGain([{ id, n: 30 }], id, r.gate, 10 * H + 2000);
      expect(r.show).toEqual([]);
      r = gateGain([{ id, n: 20 }], id, r.gate, 11 * H);
      expect(r.show).toEqual([{ id, n: 100 }]);
      expect(r.gate).toEqual({ held: 0, shownAt: 11 * H });
    });
  }
  it('seule la ressource filtrée est retenue, les autres passent', () => {
    const r = gateGain([{ id: 'mana', n: 3 }], 'gold', { held: 0, shownAt: 5 }, 6);
    expect(r.show).toEqual([{ id: 'mana', n: 3 }]);
  });
});
