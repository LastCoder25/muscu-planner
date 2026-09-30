// 🏯 Les citadelles ennemies (2026-09-30, décisions de l'utilisateur) : quatre, une par quart,
// loin de la ville ; chacune envoie les reprises sur les points de SON quart. Jamais tenues, on
// les abat ; leur niveau suit le joueur, leur PALIER monte à chaque destruction et redescend à
// un échec ou après 7 jours sans victoire ; les points tenus de leur quart les affaiblissent ;
// abattue, une citadelle offre une trêve à son quart.
import { describe, expect, it } from 'vitest';
import {
  CITADEL,
  CONTROL,
  captureControl,
  citadelIdOf,
  citadelIndexOf,
  citadelLabel,
  citadelPalier,
  citadelSize,
  citadelTargets,
  controlIdOf,
  ensureControls,
  holdControl,
  razeCitadel,
  repelledAtCitadel,
  seatsOf,
  truceUntilFor,
} from '@/lib/controlPoints';
import {
  advanceWorld,
  campSpecOf,
  createMap,
  EXPE,
  revealRadius,
  type ExpeditionMap,
} from '@/lib/expedition';
import { partySendBlocker } from '@/lib/party';
import { poiOffers } from '@/lib/caravan';

const H = 3600_000;
const D = 24 * H;
const base = (L = 30): ExpeditionMap => ensureControls(createMap(5, 0, L, 1), 0, L);
const cits = (m: ExpeditionMap) => m.pois.filter((p) => p.control?.kind === 'citadel');
const byId = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!;
/** La citadelle qui attaque la mine. */
const MINE_CIT = citadelIdOf(citadelIndexOf('mine'));
const dist = (p: { x: number; y: number }) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);

describe('🏯 quatre citadelles, loin, une par quart', () => {
  it('quatre, ennemies, au niveau du joueur, plus loin que tous les points', () => {
    const m = base(30);
    const cs = cits(m);
    expect(cs).toHaveLength(4);
    const far = Math.max(
      ...m.pois.filter((p) => p.control && p.control.kind !== 'citadel').map(dist),
    );
    for (const c of cs) {
      expect(c.control!.owner).toBe('enemy');
      expect(c.level).toBe(30);
      expect(dist(c)).toBeGreaterThan(far + 20);
      // Hors du disque révélé au départ : on va la chercher.
      expect(dist(c)).toBeGreaterThan(revealRadius(1));
    }
    expect(ensureControls(m, H, 30)).toBe(m);
  });
  it('ne sont pas élaguées hors du disque révélé', () => {
    let m = base(30);
    for (let t = H; t <= 5 * D; t += 6 * H) m = advanceWorld(m, t, 30, 1);
    expect(cits(m)).toHaveLength(4);
  });
  it('chaque point a SA citadelle, et toutes en attaquent au moins un', () => {
    const all = CITADEL.quarters.flatMap((_, i) => citadelTargets(i));
    expect([...all].sort()).toEqual([...CONTROL.kinds].sort());
    CITADEL.quarters.forEach((_, i) => expect(citadelTargets(i).length).toBeGreaterThan(0));
  });
  it('la citadelle d’un point est la plus proche de lui', () => {
    const m = base(30);
    for (const k of CONTROL.kinds) {
      const p = byId(m, controlIdOf(k));
      const mine = byId(m, citadelIdOf(citadelIndexOf(k)));
      for (const c of cits(m))
        expect(Math.hypot(p.x - mine.x, p.y - mine.y)).toBeLessThanOrEqual(
          Math.hypot(p.x - c.x, p.y - c.y) + 1e-9,
        );
    }
  });
  it('l’ancienne citadelle unique est retirée', () => {
    const m = base(30);
    const legacy = {
      ...m,
      pois: [...m.pois, { ...byId(m, MINE_CIT), id: controlIdOf('citadel') }],
    };
    expect(
      ensureControls(legacy, H, 30).pois.some((p) => p.id === controlIdOf('citadel')),
    ).toBe(false);
  });
  it('personne n’y reste, sa troupe n’est pas « soignée »', () => {
    expect(seatsOf('citadel')).toBe(0);
    const c = byId(base(30), MINE_CIT);
    expect(c.control!.size).toBeGreaterThan(Math.max(...CONTROL.captureSizes));
    expect(campSpecOf(c)!.size).toBe(c.control!.size);
  });
});

describe('🏯 sa troupe', () => {
  it('grossit avec le palier et maigrit avec les points tenus', () => {
    expect(citadelSize(0, 0)).toBe(CITADEL.baseSize);
    expect(citadelSize(4, 0)).toBeCloseTo(CITADEL.baseSize * (1 + 4 * CITADEL.perPalier), 9);
    expect(citadelSize(0, 2)).toBeCloseTo(CITADEL.baseSize * (1 - 2 * CITADEL.perHeldPoint), 9);
  });
  it('seuls les points de SON quart l’affaiblissent', () => {
    const m1 = ensureControls(
      captureControl(base(30), controlIdOf('mine'), ['a0'], H, 7),
      2 * H,
      30,
    );
    expect(byId(m1, MINE_CIT).control!.size).toBeCloseTo(citadelSize(0, 1), 9);
    for (const c of cits(m1))
      if (c.id !== MINE_CIT) expect(c.control!.size).toBeCloseTo(citadelSize(0, 0), 9);
  });
});

describe('🏯 le palier', () => {
  it('abattue : +1, trêve de 3 jours, nouvelle troupe', () => {
    const m = razeCitadel(base(30), MINE_CIT, 10 * H);
    const c = byId(m, MINE_CIT).control!;
    expect(citadelPalier(c, 10 * H)).toBe(1);
    expect(c.truceUntil).toBe(10 * H + CITADEL.truceMs);
    expect(c.size).toBeCloseTo(citadelSize(1, 0), 9);
    expect(c.owner).toBe('enemy');
    expect(c.assault).toBe(false);
    // Les autres ne bougent pas.
    for (const o of cits(m))
      if (o.id !== MINE_CIT) expect(citadelPalier(o.control, 10 * H)).toBe(0);
  });
  it('repoussés : −1, jamais sous 0', () => {
    let m = razeCitadel(razeCitadel(base(30), MINE_CIT, H), MINE_CIT, 2 * H);
    expect(citadelPalier(byId(m, MINE_CIT).control, 2 * H)).toBe(2);
    m = repelledAtCitadel(m, MINE_CIT, 3 * H);
    expect(citadelPalier(byId(m, MINE_CIT).control, 3 * H)).toBe(1);
    m = repelledAtCitadel(repelledAtCitadel(m, MINE_CIT, 4 * H), MINE_CIT, 5 * H);
    expect(citadelPalier(byId(m, MINE_CIT).control, 5 * H)).toBe(0);
  });
  it('7 jours sans la battre : −1 par semaine', () => {
    let m = base(30);
    for (let i = 0; i < 3; i++) m = razeCitadel(m, MINE_CIT, i * H);
    const c = byId(m, MINE_CIT).control!;
    expect(citadelPalier(c, 2 * H + 7 * D - 1)).toBe(3);
    expect(citadelPalier(c, 2 * H + 7 * D)).toBe(2);
    expect(citadelPalier(c, 2 * H + 30 * D)).toBe(0);
    expect(byId(ensureControls(m, 2 * H + 7 * D, 30), MINE_CIT).control!.size).toBeCloseTo(
      citadelSize(2, 0),
      9,
    );
  });
  it('une victoire repart du palier EFFECTIF, pas de celui posé', () => {
    let m = base(30);
    for (let i = 0; i < 3; i++) m = razeCitadel(m, MINE_CIT, i * H);
    m = razeCitadel(m, MINE_CIT, 2 * H + 14 * D);
    expect(citadelPalier(byId(m, MINE_CIT).control, 2 * H + 14 * D)).toBe(2);
  });
});

describe('🏯 la trêve protège les points de son quart', () => {
  const other = CONTROL.kinds.find((k) => citadelIndexOf(k) !== citadelIndexOf('mine'))!;
  it('abattre la citadelle repousse les reprises prévues de SON quart, pas des autres', () => {
    let held = captureControl(base(30), controlIdOf('mine'), ['a0'], 0, 7);
    held = captureControl(held, controlIdOf(other), ['a1'], 0, 7);
    const before = byId(held, controlIdOf(other)).control!.attackAt;
    const m = razeCitadel(held, MINE_CIT, H);
    expect(byId(m, controlIdOf('mine')).control!.attackAt).toBeGreaterThanOrEqual(
      H + CITADEL.truceMs,
    );
    expect(byId(m, controlIdOf(other)).control!.attackAt).toBe(before);
    expect(truceUntilFor(m, other)).toBe(0);
  });
  it('pendant la trêve, une prise ou une défense ne programme rien avant sa fin', () => {
    const m = razeCitadel(base(30), MINE_CIT, H);
    const truce = truceUntilFor(m, 'mine');
    const cap = captureControl(m, controlIdOf('mine'), ['a0'], 2 * H, 7);
    expect(byId(cap, controlIdOf('mine')).control!.attackAt).toBeGreaterThanOrEqual(truce);
    const held = holdControl(cap, controlIdOf('mine'), 3 * H, 7);
    expect(byId(held, controlIdOf('mine')).control!.attackAt).toBeGreaterThanOrEqual(truce);
  });
  it('hors trêve, rien ne change', () => {
    const late = captureControl(
      razeCitadel(base(30), MINE_CIT, 0),
      controlIdOf('mine'),
      ['a0'],
      5 * D,
      7,
    );
    expect(byId(late, controlIdOf('mine')).control!.attackAt!).toBeGreaterThanOrEqual(
      5 * D + CONTROL.retakeMinMs,
    );
  });
});

describe('🏯 on l’attaque en groupe, héros compris', () => {
  it('le héros seul peut y aller (pas de garnison à laisser)', () => {
    const p = byId(base(30), MINE_CIT);
    expect(partySendBlocker(p, 0, true, 3, 0.5)).toBeNull();
    expect(poiOffers(p, { heroAway: false, advsAvailable: 0, comptoirLevel: 0 }).party).toBe(true);
  });
  it('la fiche dit le palier, les points qu’elle attaque et la trêve', () => {
    const m = razeCitadel(base(30), MINE_CIT, 0);
    const l = citadelLabel(m, MINE_CIT, H)!;
    expect(l.title).toBe('🏯 Palier 1');
    expect(l.detail).toMatch(/Mine fortifiée/);
    expect(l.detail).toMatch(/trêve/);
    expect(citadelLabel(base(30), MINE_CIT, H)!.detail).toMatch(/abats-la/);
  });
});
