// 🏯 La citadelle ennemie (2026-09-30, décisions de l'utilisateur) : jamais tenue, on l'abat ;
// son niveau suit le joueur, son PALIER monte à chaque destruction et redescend à un échec ou
// après 7 jours sans la battre ; les points tenus l'affaiblissent ; abattue, elle offre une trêve.
import { describe, expect, it } from 'vitest';
import {
  CITADEL,
  CITADEL_ID,
  CONTROL,
  captureControl,
  citadelLabel,
  citadelPalier,
  citadelSize,
  citadelTruceUntil,
  controlIdOf,
  ensureControls,
  holdControl,
  razeCitadel,
  repelledAtCitadel,
  seatsOf,
} from '@/lib/controlPoints';
import { campSpecOf, createMap, EXPE, revealRadius, type ExpeditionMap } from '@/lib/expedition';
import { partySendBlocker } from '@/lib/party';
import { poiOffers } from '@/lib/caravan';

const H = 3600_000;
const D = 24 * H;
const base = (L = 30): ExpeditionMap => ensureControls(createMap(5, 0, L, 1), 0, L);
const cit = (m: ExpeditionMap) => m.pois.find((p) => p.id === CITADEL_ID)!;

describe('🏯 la citadelle est posée sur la carte', () => {
  it('une seule, ennemie, au niveau du joueur, dans le disque révélé', () => {
    const m = base(30);
    expect(m.pois.filter((p) => p.control?.kind === 'citadel')).toHaveLength(1);
    const c = cit(m);
    expect(c.control!.owner).toBe('enemy');
    expect(c.level).toBe(30);
    expect(Math.hypot(c.x - EXPE.town.x, c.y - EXPE.town.y)).toBeLessThanOrEqual(revealRadius(1));
    expect(ensureControls(m, H, 30)).toBe(m);
  });
  it('son niveau suit le joueur', () => {
    const m = ensureControls(base(30), H, 45);
    expect(cit(m).level).toBe(45);
  });
  it('personne n’y reste, et elle n’est pas « soignée » comme un point trop fort', () => {
    expect(seatsOf('citadel')).toBe(0);
    const m = base(30);
    // Sa troupe dépasse les tailles de prise d'un point : elle doit la garder.
    expect(cit(m).control!.size).toBeGreaterThan(Math.max(...CONTROL.captureSizes));
    expect(campSpecOf(cit(m))!.size).toBe(cit(m).control!.size);
  });
});

describe('🏯 sa troupe', () => {
  it('grossit avec le palier et maigrit avec les points tenus', () => {
    expect(citadelSize(0, 0)).toBe(CITADEL.baseSize);
    expect(citadelSize(4, 0)).toBeCloseTo(CITADEL.baseSize * (1 + 4 * CITADEL.perPalier), 9);
    expect(citadelSize(0, 6)).toBeCloseTo(CITADEL.baseSize * (1 - 6 * CITADEL.perHeldPoint), 9);
  });
  it('la carte la tient à jour quand on prend un point', () => {
    const m0 = base(30);
    const m1 = ensureControls(captureControl(m0, controlIdOf('mine'), ['a0'], H, 7), 2 * H, 30);
    expect(cit(m1).control!.size).toBeCloseTo(citadelSize(0, 1), 9);
  });
});

describe('🏯 le palier', () => {
  it('abattue : +1, trêve de 3 jours, nouvelle troupe', () => {
    const m = razeCitadel(base(30), 10 * H);
    const c = cit(m).control!;
    expect(citadelPalier(c, 10 * H)).toBe(1);
    expect(c.truceUntil).toBe(10 * H + CITADEL.truceMs);
    expect(c.size).toBeCloseTo(citadelSize(1, 0), 9);
    expect(c.owner).toBe('enemy');
    expect(c.assault).toBe(false);
  });
  it('repoussés : −1, jamais sous 0', () => {
    let m = razeCitadel(razeCitadel(base(30), H), 2 * H);
    expect(citadelPalier(cit(m).control, 2 * H)).toBe(2);
    m = repelledAtCitadel(m, 3 * H);
    expect(citadelPalier(cit(m).control, 3 * H)).toBe(1);
    m = repelledAtCitadel(repelledAtCitadel(m, 4 * H), 5 * H);
    expect(citadelPalier(cit(m).control, 5 * H)).toBe(0);
  });
  it('7 jours sans la battre : −1 par semaine', () => {
    let m = base(30);
    for (let i = 0; i < 3; i++) m = razeCitadel(m, i * H);
    const c = cit(m).control!;
    expect(citadelPalier(c, 2 * H + 7 * D - 1)).toBe(3);
    expect(citadelPalier(c, 2 * H + 7 * D)).toBe(2);
    expect(citadelPalier(c, 2 * H + 30 * D)).toBe(0);
    // Et la troupe affichée suit (rafraîchie par la carte).
    expect(cit(ensureControls(m, 2 * H + 7 * D, 30)).control!.size).toBeCloseTo(citadelSize(2, 0), 9);
  });
  it('une victoire repart du palier EFFECTIF, pas de celui posé', () => {
    let m = base(30);
    for (let i = 0; i < 3; i++) m = razeCitadel(m, i * H);
    m = razeCitadel(m, 2 * H + 14 * D);
    expect(citadelPalier(cit(m).control, 2 * H + 14 * D)).toBe(2);
  });
});

describe('🏯 la trêve protège les points tenus', () => {
  it('abattre la citadelle repousse les reprises déjà prévues', () => {
    const held = captureControl(base(30), controlIdOf('mine'), ['a0'], 0, 7);
    const m = razeCitadel(held, H);
    const mine = m.pois.find((p) => p.id === controlIdOf('mine'))!;
    expect(mine.control!.attackAt).toBeGreaterThanOrEqual(citadelTruceUntil(m));
  });
  it('pendant la trêve, une prise ou une défense ne programme rien avant sa fin', () => {
    const m = razeCitadel(base(30), H);
    const truce = citadelTruceUntil(m);
    const cap = captureControl(m, controlIdOf('garden'), ['a0'], 2 * H, 7);
    const g = cap.pois.find((p) => p.id === controlIdOf('garden'))!;
    expect(g.control!.attackAt).toBeGreaterThanOrEqual(truce);
    const held = holdControl(cap, controlIdOf('garden'), 3 * H, 7);
    expect(held.pois.find((p) => p.id === controlIdOf('garden'))!.control!.attackAt).toBeGreaterThanOrEqual(
      truce,
    );
  });
  it('hors trêve, rien ne change', () => {
    const held = captureControl(base(30), controlIdOf('mine'), ['a0'], 0, 7);
    expect(citadelTruceUntil(held)).toBe(0);
    const late = captureControl(razeCitadel(base(30), 0), controlIdOf('mine'), ['a0'], 5 * D, 7);
    const a = late.pois.find((p) => p.id === controlIdOf('mine'))!.control!.attackAt!;
    expect(a).toBeGreaterThanOrEqual(5 * D + CONTROL.retakeMinMs);
  });
});

describe('🏯 on l’attaque en groupe, héros compris', () => {
  it('le héros seul peut y aller (pas de garnison à laisser)', () => {
    const p = cit(base(30));
    expect(partySendBlocker(p, 0, true, 3, 0.5)).toBeNull();
    expect(poiOffers(p, { heroAway: false, advsAvailable: 0, comptoirLevel: 0 }).party).toBe(true);
  });
  it('la fiche dit le palier et la trêve', () => {
    const m = razeCitadel(base(30), 0);
    expect(citadelLabel(m, H)!.title).toBe('🏯 Palier 1');
    expect(citadelLabel(m, H)!.detail).toMatch(/trêve/);
    expect(citadelLabel(base(30), H)!.detail).toMatch(/abats-la/);
  });
});
