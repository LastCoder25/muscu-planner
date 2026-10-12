import { describe, expect, it } from 'vitest';
import { vanquishedHidden } from '@/lib/controlPoints';
import type { Poi } from '@/lib/expedition';

const ctl = (id: string, owner: 'player' | 'enemy') =>
  ({ id, control: { kind: 'lapidary', owner } }) as unknown as Pick<Poi, 'id' | 'control'>;

describe('vanquishedHidden — un lieu fixe pris reste sur la carte', () => {
  it('un point tenu par le joueur ne disparaît pas pendant le retour de l’équipe', () => {
    expect(vanquishedHidden(['ctl_lapidary'], [ctl('ctl_lapidary', 'player')])).toEqual([]);
  });
  it('un camp ou un point encore ennemi terrassé, lui, est caché', () => {
    const pois = [ctl('ctl_arsenal', 'enemy'), { id: 'poi_1' } as Pick<Poi, 'id' | 'control'>];
    expect(vanquishedHidden(['ctl_arsenal', 'poi_1'], pois)).toEqual(['ctl_arsenal', 'poi_1']);
  });
});
