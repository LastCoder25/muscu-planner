import { describe, expect, it } from 'vitest';
import { orphanPosts } from '@/lib/controlPoints';
import type { ExpeditionMap } from '@/lib/expedition';

const NOW = 1_000_000;

function mapWith(control: Record<string, unknown>): ExpeditionMap {
  return {
    pois: [{ id: 'ctl_a', type: 'control', control: { garrison: [], ...control } }],
  } as unknown as ExpeditionMap;
}

describe('orphanPosts — les postes fantômes', () => {
  it('un champion posté que le point ne porte nulle part redevient libre', () => {
    const map = mapWith({ garrison: ['mil:1'] });
    expect(orphanPosts([{ id: 'x', posted: 'ctl_a' }], map, NOW)).toEqual(['x']);
  });

  it('en garnison, en renfort ou sur le retour : il reste posté', () => {
    const map = mapWith({
      garrison: ['g'],
      reinforcing: [{ id: 'r', at: NOW - 1 }],
      returning: [{ id: 'b', from: NOW - 1, at: NOW - 1 }],
    });
    const advs = ['g', 'r', 'b'].map((id) => ({ id, posted: 'ctl_a' }));
    expect(orphanPosts(advs, map, NOW)).toEqual([]);
  });

  it('jamais un champion occupé, resté sur une autre île, ou posté hors de la carte active', () => {
    const map = mapWith({});
    expect(
      orphanPosts(
        [
          { id: 'busy', posted: 'ctl_a', busyUntil: NOW + 1 },
          { id: 'ile', posted: 'ctl_a', elsewhere: 1 },
          { id: 'loin', posted: 'ctl_ailleurs' },
          { id: 'libre' },
        ],
        map,
        NOW,
      ),
    ).toEqual([]);
  });

  it('sans carte : rien', () => {
    expect(orphanPosts([{ id: 'x', posted: 'ctl_a' }], null, NOW)).toEqual([]);
  });
});
