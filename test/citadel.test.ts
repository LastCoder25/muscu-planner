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
  citadelIdFor,
  citadelIdOf,
  nextCitadelLevel,
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
/** La citadelle qui attaque la mine au niveau 30. */
const MINE_CIT = citadelIdFor(base(30).pois, 'mine')!;
const dist = (p: { x: number; y: number }) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);

describe('🏯 les citadelles apparaissent avec le niveau, de plus en plus loin', () => {
  it('une au départ, puis une de plus aux niveaux 15, 30 et 50', () => {
    for (const [L, n] of [
      [1, 1],
      [14, 1],
      [15, 2],
      [29, 2],
      [30, 3],
      [50, 4],
      [90, 4],
    ] as const)
      expect(cits(base(L))).toHaveLength(n);
  });
  it('chacune plus loin que la précédente, toutes loin des points et hors du disque de départ', () => {
    const m = base(60);
    const far = Math.max(
      ...m.pois.filter((p) => p.control && p.control.kind !== 'citadel').map(dist),
    );
    const ds = CITADEL.sites.map((_, i) => dist(byId(m, citadelIdOf(i))));
    for (let i = 1; i < ds.length; i++) expect(ds[i]!).toBeGreaterThan(ds[i - 1]! + 5);
    for (const d of ds) {
      expect(d).toBeGreaterThan(far + 20);
      expect(d).toBeGreaterThan(revealRadius(1));
    }
    for (const c of cits(m)) {
      expect(c.control!.owner).toBe('enemy');
      expect(c.level).toBe(60);
    }
    expect(ensureControls(m, H, 60)).toBe(m);
  });
  it('cher en temps : plus loin que tout lieu ordinaire (distNorm > 1)', () => {
    for (const c of cits(base(60))) expect(c.distNorm).toBeGreaterThan(1);
  });
  it('ne sont pas élaguées hors du disque révélé', () => {
    let m = base(60);
    for (let t = H; t <= 5 * D; t += 6 * H) m = advanceWorld(m, t, 60, 1);
    expect(cits(m)).toHaveLength(4);
  });
  it('seule au départ, la première attaque tous les points', () => {
    const m = base(1);
    for (const k of CONTROL.kinds) expect(citadelIdFor(m.pois, k)).toBe(citadelIdOf(0));
  });
  it('à quatre, chaque point a sa citadelle, et toutes en attaquent au moins un', () => {
    const m = base(60);
    const all = CITADEL.sites.flatMap((_, i) => citadelTargets(m.pois, i));
    expect([...all].sort()).toEqual([...CONTROL.kinds].sort());
    CITADEL.sites.forEach((_, i) => expect(citadelTargets(m.pois, i).length).toBeGreaterThan(0));
  });
  it('une citadelle d’un niveau pas encore atteint est retirée ; l’ancienne unique aussi', () => {
    const m = base(60);
    expect(cits(ensureControls(m, H, 20))).toHaveLength(2);
    const legacy = {
      ...m,
      pois: [...m.pois, { ...byId(m, citadelIdOf(0)), id: controlIdOf('citadel') }],
    };
    expect(
      ensureControls(legacy, H, 60).pois.some((p) => p.id === controlIdOf('citadel')),
    ).toBe(false);
  });
  it('la prochaine apparition se lit', () => {
    expect(nextCitadelLevel(1)).toBe(15);
    expect(nextCitadelLevel(30)).toBe(50);
    expect(nextCitadelLevel(50)).toBeNull();
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
  const other = CONTROL.kinds.find((k) => citadelIdFor(base(30).pois, k) !== MINE_CIT)!;
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
