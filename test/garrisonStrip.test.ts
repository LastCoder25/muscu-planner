import { describe, it, expect } from 'vitest';
import { garrisonStrip, stripColumns } from '@/lib/garrisonStrip';

describe('🏰 frise des places d’une garnison', () => {
  it('une case par place : le héros en vaut deux, les libres viennent de la fiche', () => {
    const cells = garrisonStrip({
      hero: { state: 'here' },
      members: [{ id: 'a', state: 'here' }],
      free: 1,
      selected: [],
    });
    expect(cells.map((c) => c.kind)).toEqual(['hero', 'member', 'free']);
    expect(stripColumns(cells)).toBe(4);
  });

  it('range les présents, puis ceux qui arrivent (le plus proche d’abord), puis ceux en sortie', () => {
    const cells = garrisonStrip({
      members: [
        { id: 'sortie', state: 'away', inMs: 10 },
        { id: 'loin', state: 'coming', inMs: 9000 },
        { id: 'ici', state: 'here' },
        { id: 'pres', state: 'coming', inMs: 100 },
      ],
      free: 0,
      selected: [],
    });
    expect(cells.map((c) => (c.kind === 'member' ? c.id : c.kind))).toEqual([
      'ici',
      'pres',
      'loin',
      'sortie',
    ]);
  });

  it('on ne choisit ni un membre en sortie ni un membre réservé par une attaque combinée', () => {
    const cells = garrisonStrip({
      members: [
        { id: 'ici', state: 'here' },
        { id: 'sortie', state: 'away' },
        { id: 'parti', state: 'here', reserved: '⚔️ part à 18:00' },
      ],
      free: 0,
      selected: ['ici'],
    });
    const by = Object.fromEntries(cells.flatMap((c) => (c.kind === 'member' ? [[c.id, c]] : [])));
    expect(by.ici.selectable && by.ici.selected).toBe(true);
    expect(by.sortie.selectable).toBe(false);
    expect(by.parti.selectable).toBe(false);
  });

  it('sans limite (forteresse) : une seule case « ＋ », quel que soit le compte libre', () => {
    const cells = garrisonStrip({
      members: [],
      free: 7,
      unlimited: true,
      selected: [],
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ kind: 'free', unlimited: true });
  });

  it('un temps négatif (horloge en retard) ne s’affiche jamais', () => {
    const [c] = garrisonStrip({
      members: [{ id: 'x', state: 'coming', inMs: -500 }],
      free: 0,
      selected: [],
    });
    expect(c).toMatchObject({ inMs: 0 });
  });
});
