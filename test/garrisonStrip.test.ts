import { describe, it, expect } from 'vitest';
import { crewOnSite, garrisonStrip, stripColumns, type SiteVoyage } from '@/lib/garrisonStrip';

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

describe('🔍 qui est sur un lieu de récolte (`crewOnSite`)', () => {
  const v = (o: Partial<SiteVoyage> = {}): SiteVoyage => ({
    poi: { id: 'ruine' },
    midAt: 10_000,
    dwellMs: 4_000,
    returnAt: 20_000,
    crew: ['a', 'b'],
    outcome: {},
    ...o,
  });
  it('en chemin avant l’arrivée, en récolte pendant la fouille, rien après', () => {
    const before = crewOnSite([v()], 'ruine', 1_000);
    expect(before.members).toEqual([
      { id: 'a', state: 'coming', inMs: 5_000 },
      { id: 'b', state: 'coming', inMs: 5_000 },
    ]);
    expect(crewOnSite([v()], 'ruine', 7_000).members[0]).toEqual({
      id: 'a',
      state: 'search',
      inMs: 3_000,
    });
    expect(crewOnSite([v()], 'ruine', 10_000).members).toEqual([]);
  });
  it('le héros de son expédition, un autre lieu ignoré, un demi-tour ou un rappel jamais là', () => {
    const r = crewOnSite(
      [
        v({ hero: true, crew: ['c'] }),
        v({ poi: { id: 'autre' }, crew: ['d'] }),
        v({ turnBack: 0.4, crew: ['e'] }),
        v({ recalled: true, crew: ['f'] }),
      ],
      'ruine',
      7_000,
    );
    expect(r.hero).toEqual({ state: 'search', inMs: 3_000 });
    expect(r.members.map((m) => m.id)).toEqual(['c']);
  });
  it('lit l’escorte du rapport à défaut d’équipe', () => {
    const r = crewOnSite(
      [v({ crew: undefined, outcome: { party: { escort: ['z'] } } })],
      'ruine',
      0,
    );
    expect(r.members.map((m) => m.id)).toEqual(['z']);
  });
  it('en lecture seule, ni les récolteurs ni ceux en chemin ne se choisissent', () => {
    const cells = garrisonStrip({
      members: [
        { id: 'a', state: 'search', inMs: 1 },
        { id: 'b', state: 'coming', inMs: 1 },
        { id: 'c', state: 'here' },
      ],
      free: 0,
      readonly: true,
      selected: [],
    });
    expect(cells.every((c) => c.kind !== 'member' || !c.selectable)).toBe(true);
    // Une récolte n'est jamais choisissable, même hors lecture seule.
    const open = garrisonStrip({
      members: [{ id: 'a', state: 'search', inMs: 1 }],
      free: 0,
      selected: [],
    });
    expect(open[0]!.kind === 'member' && open[0]!.selectable).toBe(false);
  });
});
