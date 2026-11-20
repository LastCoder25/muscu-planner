import { describe, expect, it } from 'vitest';
import { garrisonDots, type ControlRosterRow } from '@/lib/controlPoints';
import { healHeroOut } from '@/lib/islandConquest';
import { EXPE, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧝🩹 Signalé le 2026-11-20 (« récurrent ») : le héros est en expédition depuis le Cartographe
// (voyage en cours, `homeId`), mais le Cartographe porte encore `hero: true` sans place gardée :
// la carte dessine ses deux boules BLEUES (posté, disponible) au lieu des orange (en sortie).
const NOW = 5_000_000;
const T = EXPE.town;
const unit = { name: 'Last', level: 30, combatant: {} } as never;

const post = (id: string, extra: object = {}): Poi =>
  ({
    id,
    type: 'control',
    level: 20,
    x: T.x + 40,
    y: T.y,
    control: { kind: 'mine', owner: 'player', garrison: [], ...extra },
  }) as unknown as Poi;
const mapOf = (...pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const ctl = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!.control!;

describe('🧝 un héros en voyage n’est jamais posté sur son poste', () => {
  it('posté au poste d’où part son voyage : il passe « en sortie », place et instantané gardés', () => {
    const m = mapOf(post('a', { hero: true, heroUnit: unit }));
    const r = healHeroOut(m, 'a', NOW);
    expect(ctl(r, 'a').hero).toBeUndefined();
    expect(ctl(r, 'a').heroAway).toBe(true);
    expect(ctl(r, 'a').heroAwayUnit).toBe(unit);
  });
  it('rien ne change (même carte) s’il est déjà en sortie ou si son voyage ne part pas d’un poste', () => {
    const away = mapOf(post('a', { heroAway: true }));
    expect(healHeroOut(away, 'a', NOW)).toBe(away);
    const posted = mapOf(post('a', { hero: true, heroUnit: unit }));
    expect(healHeroOut(posted, null, NOW)).toBe(posted);
  });
  it('posté AILLEURS que le poste de son voyage (point pris, autre lieu) : on n’y touche pas', () => {
    const m = mapOf(post('a'), post('b', { hero: true, heroUnit: unit }));
    expect(healHeroOut(m, 'a', NOW)).toBe(m);
  });
  it('la carte dessine alors des boules orange (`g`), plus les bleues (`h`)', () => {
    const row = (hero: 'posted' | 'away') =>
      ({
        poi: post('a', { owner: 'player' }),
        kind: 'mine',
        status: 'held',
        seats: 5,
        garrison: [],
        reinforcing: [],
        away: [],
        engaged: [],
        assault: null,
        hero,
        progress: null,
      }) as unknown as ControlRosterRow;
    expect(garrisonDots(row('posted'))).toMatch(/^hh/);
    expect(garrisonDots(row('away'))).toMatch(/^gg/);
  });
});
