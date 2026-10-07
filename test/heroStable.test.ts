import { describe, expect, it } from 'vitest';
import { wingDeparture, type AttackWing } from '@/lib/combinedAttack';
import {
  boardFromFortress,
  heroAwayOnMapAt,
  heroBackToPost,
  heroWalkVoyage,
  heroWalksHomeFrom,
  stripChampions,
  unpostHero,
} from '@/lib/islandConquest';
import { heroStayedSplit } from '@/lib/party';
import { EXPE, type ActiveExpedition, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧝 Passe « rendre le héros stable » (2026-10-07) : le héros posté sur un lieu fixe doit
// suivre les mêmes règles qu'un champion en garnison.
const NOW = 5_000_000;
const MIN = 60_000;
const T = EXPE.town;
const unit = { name: 'Last', level: 30, combatant: {} } as never;

function post(id: string, extra: object = {}, kind = 'mine'): Poi {
  return {
    id,
    type: 'control',
    level: 20,
    x: T.x + 40,
    y: T.y,
    control: { kind, owner: 'player', garrison: [], ...extra },
  } as unknown as Poi;
}
const map = (pois: Poi[], extra: object = {}) => ({ pois, ...extra }) as unknown as ExpeditionMap;

describe('le siège ne compte pas un héros retenu sur la carte', () => {
  it('posté : absent du rempart', () => {
    expect(heroAwayOnMapAt(map([post('a', { hero: true, heroUnit: unit })]), NOW)).toBe(true);
  });
  it('en marche vers un poste : absent seulement une fois parti', () => {
    const m = map([post('a', { heroComing: { from: NOW, at: NOW + 30 * MIN, unit } })]);
    expect(heroAwayOnMapAt(m, NOW - MIN)).toBe(false);
    expect(heroAwayOnMapAt(m, NOW + MIN)).toBe(true);
  });
  it('en retour à pied : absent jusqu’à son arrivée', () => {
    const m = map([], { heroReturnAt: NOW + 10 * MIN });
    expect(heroAwayOnMapAt(m, NOW)).toBe(true);
    expect(heroAwayOnMapAt(m, NOW + 10 * MIN)).toBe(false);
  });
  it('en mer à partir du départ du bateau', () => {
    const m = map([], { crossing: { from: 1, to: 2, bookedAt: 0, departAt: NOW, arriveAt: NOW + 1, ids: [] } });
    expect(heroAwayOnMapAt(m, NOW - 1)).toBe(false);
    expect(heroAwayOnMapAt(m, NOW)).toBe(true);
  });
  it('rien sur la carte : il est à la base', () => {
    expect(heroAwayOnMapAt(map([post('a')]), NOW)).toBe(false);
  });
});

describe('une attaque combinée partant de la base ne prend pas un héros absent', () => {
  const wing: AttackWing = {
    originId: null,
    members: [],
    hero: true,
    legMin: 30,
    departAt: NOW,
    returnAt: NOW + 90 * MIN,
    state: 'waiting',
  };
  const ctx = (m: ExpeditionMap) => ({ now: NOW, map: m, advs: [], raidAt: null, heroWoundedAt: () => false });
  it('à la base il part ; en marche vers la base, non', () => {
    expect(wingDeparture(wing, ctx(map([])))).toEqual({ members: [], hero: true });
    expect(wingDeparture(wing, ctx(map([], { heroReturnAt: NOW + MIN })))).toEqual({
      members: [],
      hero: false,
    });
  });
});

describe('déjà en route vers la base, il ne reprend pas son ancien poste', () => {
  it('heroBackToPost ne le remet pas en garnison', () => {
    const m = heroBackToPost(map([post('a')], { heroReturnAt: NOW + 20 * MIN }), 'a', unit, NOW, 15);
    expect(m.pois[0]!.control!.hero).toBeUndefined();
    expect(m.heroReturnAt).toBe(NOW + 20 * MIN);
  });
});

describe('la production faite avec lui reste acquise quand il part', () => {
  it('unpostHero met de côté ce que le lieu a produit', () => {
    const p = post('a', { hero: true, heroUnit: unit, collectedAt: NOW - 6 * 60 * MIN });
    const m = unpostHero(map([p]), NOW);
    const c = m.pois[0]!.control!;
    expect(c.hero).toBeUndefined();
    expect(c.collectedAt).toBe(NOW);
    expect(c.banked ?? 0).toBeGreaterThan(0);
  });
  it('heroBackToPost met de côté AVANT de le recompter', () => {
    const p = post('a', { collectedAt: NOW - 6 * 60 * MIN, garrison: ['x'] });
    const m = heroBackToPost(map([p]), 'a', unit, NOW, 15);
    expect(m.pois[0]!.control!.collectedAt).toBe(NOW);
    expect(m.pois[0]!.control!.hero).toBe(true);
  });
  it('embarquer à la forteresse met de côté, un simple aperçu non', () => {
    const f = post('isl_fortress', { hero: true, heroUnit: unit, collectedAt: NOW - 60 * MIN }, 'fortress');
    expect(boardFromFortress(map([f])).map.pois[0]!.control!.collectedAt).toBe(NOW - 60 * MIN);
    expect(boardFromFortress(map([f]), undefined, true, NOW).map.pois[0]!.control!.collectedAt).toBe(NOW);
  });
});

describe('quitter une île emmène aussi le héros en route vers un poste', () => {
  it('stripChampions retire heroComing', () => {
    const m = stripChampions(map([post('a', { heroComing: { from: NOW, at: NOW + MIN, unit } })]), NOW, 30);
    expect(m.pois[0]!.control!.heroComing).toBeUndefined();
  });
});

describe('blessé au retour d’une sortie, il rentre à pied de son poste', () => {
  it('heroWalksHomeFrom trace le retour, sans raccourcir un retour plus long', () => {
    const p = post('a');
    const m = heroWalksHomeFrom(map([p]), p, NOW, 25);
    expect(m.heroReturnAt).toBe(NOW + 25 * MIN);
    expect(m.heroReturnFrom).toEqual({ x: p.x, y: p.y, at: NOW });
    const longer = map([p], { heroReturnAt: NOW + 60 * MIN });
    expect(heroWalksHomeFrom(longer, p, NOW, 25)).toBe(longer);
  });
  it('la tuile du retour porte le vrai lieu quitté', () => {
    const p = post('a');
    const v = heroWalkVoyage(heroWalksHomeFrom(map([p]), p, NOW, 25), NOW + MIN);
    expect(v?.poi.id).toBe('a');
  });
});

describe('resté sur le point pris, son voyage s’arrête', () => {
  const exp = (heroStays: boolean, win = true): ActiveExpedition =>
    ({
      poi: post('a'),
      seed: 1,
      sentAt: NOW - 60 * MIN,
      midAt: NOW,
      returnAt: NOW + 40 * MIN,
      homeHero: unit,
      outcome: { win, party: { hero: true, heroStays, escort: ['c1', 'c2', 'c3'] } },
    }) as unknown as ActiveExpedition;
  it('les champions qui rentrent deviennent un groupe sans le héros', () => {
    const s = heroStayedSplit(exp(true), true, new Set(['c1']), NOW, 'party_x');
    expect(s?.party?.crew).toEqual(['c2', 'c3']);
    expect(s?.party?.homeHero).toBeUndefined();
    expect(s?.party?.reported).toBe(true);
  });
  it('personne ne rentre : le voyage se termine', () => {
    expect(heroStayedSplit(exp(true), true, new Set(['c1', 'c2', 'c3']), NOW, 'x')).toEqual({ party: null });
  });
  it('rien à séparer s’il n’est pas resté, a perdu, ou n’est pas posté là', () => {
    expect(heroStayedSplit(exp(false), true, new Set(), NOW, 'x')).toBeNull();
    expect(heroStayedSplit(exp(true, false), true, new Set(), NOW, 'x')).toBeNull();
    expect(heroStayedSplit(exp(true), false, new Set(), NOW, 'x')).toBeNull();
  });
});
