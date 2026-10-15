import { describe, it, expect } from 'vitest';
import { resourceGains, mergeGains } from '@/lib/resourceGains';

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
