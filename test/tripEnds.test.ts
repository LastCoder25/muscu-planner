import { describe, expect, it } from 'vitest';
import { tripEnds } from '@/lib/tripEnds';
import type { Poi } from '@/lib/expedition';

const camp = { id: 'camp', type: 'camp', x: 120, y: 80, level: 5 } as unknown as Poi;
const fort = { id: 'fort', type: 'control', x: 60, y: 70, level: 5 } as unknown as Poi;

describe('tripEnds — les encarts départ / destination d’une tuile de voyage', () => {
  it('à l’aller : départ → lieu visé', () => {
    expect(tripEnds({ back: false, from: null, poi: camp })).toEqual({
      left: { kind: 'base' },
      right: { kind: 'poi', poi: camp },
    });
    expect(tripEnds({ back: false, from: fort, poi: camp }).left).toEqual({
      kind: 'poi',
      poi: fort,
    });
  });

  it('sur le retour : les deux encarts s’inversent (lieu quitté → chez soi)', () => {
    expect(tripEnds({ back: true, from: null, poi: camp })).toEqual({
      left: { kind: 'poi', poi: camp },
      right: { kind: 'base' },
    });
    // Une sortie valide rentre sur SON point fixe.
    expect(tripEnds({ back: true, from: fort, poi: camp }).right).toEqual({
      kind: 'poi',
      poi: fort,
    });
  });

  it('🏥 des blessés renvoyés à la base (voyage sans origine) : la destination est la base', () => {
    expect(tripEnds({ back: true, from: null, poi: camp }).right).toEqual({ kind: 'base' });
  });

  it('un trajet déjà vers la base n’est pas retourné une seconde fois', () => {
    expect(tripEnds({ back: true, toBase: true, from: fort, poi: fort })).toEqual({
      left: { kind: 'poi', poi: fort },
      right: { kind: 'base' },
    });
  });

  it('une traversée garde ses deux îles', () => {
    expect(tripEnds({ back: true, sea: { from: 1, to: 2 }, from: null, poi: camp })).toEqual({
      left: { kind: 'isle', n: 1 },
      right: { kind: 'isle', n: 2 },
    });
  });
});
