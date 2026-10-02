// 🏯 Les citadelles ennemies (2026-09-30, décisions de l'utilisateur) : quatre, posées dès le
// départ dans le brouillard à des distances différentes, découvertes par l'Avant-poste ; chacune
// envoie les reprises sur les points les plus proches d'elle. Jamais tenues, on les abat ; leur
// palier monte à chaque destruction et redescend à un échec ou après 7 jours ; découvertes et
// laissées debout, elles s'énervent (+5 %/jour) ; abattues, elles offrent une trêve.
import { describe, expect, it } from 'vitest';
import {
  CITADEL,
  attackerHidden,
  dueRetakes,
  CONTROL,
  captureControl,
  citadelIdFor,
  citadelIdOf,
  citadelRevealLevel,
  citadelDiscoveryFx,
  newlyDiscoveredCitadels,
  rageMult,
  retakeForce,
  citadelLabel,
  citadelPalier,
  citadelSize,
  citadelTargets,
  raidDelayMs,
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
  recordDeparture,
  type ExpeditionMap,
  citadelRestingUntil,
} from '@/lib/expedition';
import { partySendBlocker } from '@/lib/party';
import { poiOffers } from '@/lib/caravan';

const H = 3600_000;
const D = 24 * H;
const base = (L = 30, outpost = 100): ExpeditionMap =>
  ensureControls(createMap(5, 0, L, 1), 0, L, outpost);
const cits = (m: ExpeditionMap) => m.pois.filter((p) => p.control?.kind === 'citadel');
const byId = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!;
const withAttack = (m: ExpeditionMap, id: string, attackAt: number | undefined): ExpeditionMap => ({
  ...m,
  pois: m.pois.map((p) => {
    if (p.id !== id) return p;
    const c = { ...p.control! };
    if (attackAt === undefined) delete c.attackAt;
    else c.attackAt = attackAt;
    return { ...p, control: c };
  }),
});
/** La citadelle qui attaque la mine au niveau 30. */
const MINE_CIT = citadelIdFor(base(30).pois, 'mine')!;
const dist = (p: { x: number; y: number }) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);

describe('🏯 quatre citadelles dès le départ, découvertes par l’Avant-poste', () => {
  it('toutes posées dès le niveau 1, à des distances différentes, loin des points', () => {
    const m = base(1, 1);
    expect(cits(m)).toHaveLength(4);
    const far = Math.max(
      ...m.pois.filter((p) => p.control && p.control.kind !== 'citadel').map(dist),
    );
    const ds = CITADEL.sites.map((_, i) => dist(byId(m, citadelIdOf(i))));
    for (let i = 1; i < ds.length; i++) expect(ds[i]!).toBeGreaterThan(ds[i - 1]! + 5);
    for (const d of ds) {
      expect(d).toBeGreaterThan(far + 10);
      expect(d).toBeGreaterThan(revealRadius(1));
    }
    for (const c of cits(m)) expect(c.control!.owner).toBe('enemy');
  });
  it('cachées tant que le disque révélé ne les atteint pas, puis découvertes une à une', () => {
    const at = (L: number) =>
      cits(base(30, L)).filter((c) => c.control!.discoveredAt !== undefined);
    expect(at(1)).toHaveLength(0);
    let prev = 0;
    for (let i = 0; i < CITADEL.sites.length; i++) {
      const L = citadelRevealLevel(i);
      expect(L).toBeGreaterThan(prev);
      prev = L;
      expect(at(L)).toHaveLength(i + 1);
      expect(at(L - 1)).toHaveLength(i);
    }
  });
  it('une découverte ne se reperd pas', () => {
    const again = ensureControls(base(30, 100), 5 * D, 30, 1);
    for (const c of cits(again)) expect(c.control!.discoveredAt).toBe(0);
    // …ni ne se re-date : la colère compte depuis la PREMIÈRE découverte.
    for (const c of cits(ensureControls(base(30, 100), 5 * D, 30, 100)))
      expect(c.control!.discoveredAt).toBe(0);
  });
  it('cachée, elle ne s’attaque pas', () => {
    const p = byId(base(30, 1), citadelIdOf(0));
    expect(partySendBlocker(p, 3, true, 3, 0.5)).toBe('citadelHidden');
    expect(poiOffers(p, { heroAway: false, advsAvailable: 3, comptoirLevel: 0 }).party).toBe(false);
  });
  it('cher en temps : plus loin que tout point fixe, et de plus en plus loin', () => {
    const m = base(60);
    const far = Math.max(
      ...m.pois.filter((p) => p.control && p.control.kind !== 'citadel').map((p) => p.distNorm),
    );
    const ds = CITADEL.sites.map((_, i) => byId(m, citadelIdOf(i)).distNorm);
    expect(ds[0]!).toBeGreaterThan(far * 1.5);
    for (let i = 1; i < ds.length; i++) expect(ds[i]!).toBeGreaterThan(ds[i - 1]!);
  });
  it('ne sont pas élaguées hors du disque révélé', () => {
    let m = base(60, 1);
    for (let t = H; t <= 5 * D; t += 6 * H) m = advanceWorld(m, t, 60, 1);
    expect(cits(m)).toHaveLength(4);
  });
  it('chaque point a sa citadelle, et toutes en attaquent au moins un', () => {
    const m = base(60);
    const all = CITADEL.sites.flatMap((_, i) => citadelTargets(m.pois, i));
    expect([...all].sort()).toEqual([...CONTROL.kinds].sort());
    CITADEL.sites.forEach((_, i) => expect(citadelTargets(m.pois, i).length).toBeGreaterThan(0));
  });
  it('l’ancienne citadelle unique est retirée ; stable une fois à jour', () => {
    const m = base(60);
    expect(ensureControls(m, 0, 60, 100)).toBe(m);
    const legacy = {
      ...m,
      pois: [...m.pois, { ...byId(m, citadelIdOf(0)), id: controlIdOf('citadel') }],
    };
    expect(
      ensureControls(legacy, 0, 60, 100).pois.some((p) => p.id === controlIdOf('citadel')),
    ).toBe(false);
  });
  it('personne n’y reste, sa troupe n’est pas « soignée »', () => {
    expect(seatsOf('citadel')).toBe(0);
    const c = byId(base(30), MINE_CIT);
    expect(c.control!.size).toBeGreaterThan(Math.max(...CONTROL.captureSizes));
    expect(campSpecOf(c)!.size).toBe(c.control!.size);
  });
});

describe('😡 la colère : ses armées grossissent chaque jour où on ne l’abat pas', () => {
  const mineAt = (m: ExpeditionMap) => byId(m, controlIdOf('mine')).control!;
  it('+5 % par jour, plafonné à 10 jours', () => {
    expect(rageMult(0, 0, 7)).toBe(1);
    expect(rageMult(0, D - 1, 7)).toBe(1);
    expect(rageMult(0, 3 * D, 7)).toBeCloseTo(1 + 3 * CITADEL.ragePerDay, 9);
    expect(rageMult(0, 40 * D, 7)).toBeCloseTo(1 + CITADEL.rageMaxDays * CITADEL.ragePerDay, 9);
    expect(rageMult(undefined, 40 * D, 7)).toBe(1);
  });
  it('un joueur peu actif n’est pas harcelé comme un actif : la colère suit les jours actifs', () => {
    expect(rageMult(0, 40 * D, 0)).toBe(1);
    expect(rageMult(0, 40 * D, 1)).toBeCloseTo(
      1 + (CITADEL.rageMaxDays * CITADEL.ragePerDay) / 7,
      9,
    );
    const r = [0, 1, 2, 3, 4, 5, 6, 7].map((a) => rageMult(0, 40 * D, a));
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThan(r[i - 1]!);
    expect(rageMult(0, 40 * D, 12)).toBe(rageMult(0, 40 * D, 7));
  });
  it('le point retient l’activité du moment où son attaque est programmée', () => {
    const id = controlIdOf('mine');
    const lazy = byId(captureControl(base(30), id, ['a0'], 0, 1), id);
    const busy = byId(captureControl(base(30), id, ['a0'], 0, 7), id);
    expect(lazy.control!.activity).toBe(1);
    expect(
      byId(holdControl(captureControl(base(30), id, ['a0'], 0, 7), id, H, 2), id).control!.activity,
    ).toBe(2);
    const at = (p: typeof lazy) => ({
      ...p,
      control: { ...p.control!, attackAt: 10 * D, angerSince: 0 },
    });
    expect(retakeForce(at(lazy), 1).size).toBeLessThan(retakeForce(at(busy), 1).size);
  });
  it('un point d’avant (sans activité notée) garde la colère pleine', () => {
    const p = byId(
      captureControl(base(30), controlIdOf('mine'), ['a0'], 0, 7),
      controlIdOf('mine'),
    );
    const legacy = {
      ...p,
      control: { ...p.control!, activity: undefined, attackAt: 5 * D, angerSince: 0 },
    };
    const calm = { ...legacy, control: { ...legacy.control, angerSince: undefined } };
    expect(retakeForce(legacy, 1).size / retakeForce(calm, 1).size).toBeCloseTo(
      rageMult(0, 5 * D, 7),
      9,
    );
  });
  it('aucune colère tant qu’elle est cachée', () => {
    expect(mineAt(base(30, 1)).angerSince).toBeUndefined();
  });
  it('découverte, la colère court depuis la découverte, portée par les points qu’elle attaque', () => {
    const m = ensureControls(base(30, 1), 2 * D, 30, 100);
    expect(mineAt(m).angerSince).toBe(2 * D);
  });
  it('l’abattre remet la colère à zéro à la fin de sa trêve', () => {
    const m = razeCitadel(base(30), MINE_CIT, 4 * D);
    expect(mineAt(m).angerSince).toBe(4 * D + CITADEL.truceMs);
    const other = CONTROL.kinds.find((k) => citadelIdFor(m.pois, k) !== MINE_CIT)!;
    expect(byId(m, controlIdOf(other)).control!.angerSince).toBe(0);
  });
  it('elle grossit vraiment la troupe de reprise, à l’heure de l’attaque', () => {
    const p = byId(
      captureControl(base(30), controlIdOf('mine'), ['a0'], 0, 7),
      controlIdOf('mine'),
    );
    const calm = { ...p, control: { ...p.control!, attackAt: 5 * D, angerSince: undefined } };
    const angry = { ...p, control: { ...p.control!, attackAt: 5 * D, angerSince: 0 } };
    expect(retakeForce(angry, 1).size / retakeForce(calm, 1).size).toBeCloseTo(
      rageMult(0, 5 * D, 7),
      9,
    );
  });
  it('la fiche dit la colère', () => {
    expect(citadelLabel(base(30), MINE_CIT, 3 * D, 7)!.title).toMatch(/😡 \+15 %/);
    expect(citadelLabel(base(30), MINE_CIT, 3 * D, 0)!.title).not.toMatch(/😡/);
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
      100,
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
    expect(byId(ensureControls(m, 2 * H + 7 * D, 30, 100), MINE_CIT).control!.size).toBeCloseTo(
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
  it('abattue, elle est grisée et inattaquable pendant ses 3 jours de trêve', () => {
    const m = razeCitadel(base(30), MINE_CIT, 0);
    const p = byId(m, MINE_CIT);
    const offer = (now: number) =>
      poiOffers(p, { heroAway: false, advsAvailable: 3, comptoirLevel: 0, now }).party;
    expect(citadelRestingUntil(p, H)).toBe(CITADEL.truceMs);
    expect(partySendBlocker(p, 3, true, 3, 0.5, H)).toBe('citadelResting');
    expect(offer(H)).toBe(false);
    // Juste avant la fin de la trêve : toujours inattaquable ; à la fin : de nouveau ouverte.
    expect(partySendBlocker(p, 3, true, 3, 0.5, CITADEL.truceMs - 1)).toBe('citadelResting');
    expect(partySendBlocker(p, 3, true, 3, 0.5, CITADEL.truceMs)).toBeNull();
    expect(offer(CITADEL.truceMs)).toBe(true);
    // Un point ordinaire n'a pas de « repos ».
    expect(citadelRestingUntil(byId(m, controlIdOf('mine')), H)).toBe(0);
  });
  it('la fiche dit le palier, les points qu’elle attaque et la trêve', () => {
    const m = razeCitadel(base(30), MINE_CIT, 0);
    const l = citadelLabel(m, MINE_CIT, H, 7)!;
    expect(l.title).toBe('🏯 Palier 1');
    expect(l.detail).toMatch(/Mine fortifiée/);
    expect(l.detail).toMatch(/trêve/);
    expect(citadelLabel(base(30), MINE_CIT, H, 7)!.detail).toMatch(/abats-la/);
  });
});

describe('🏯 l’annonce de la découverte', () => {
  it('annonce seulement ce qui vient de sortir du brouillard', () => {
    const hidden = base(30, 1);
    const L1 = citadelRevealLevel(0);
    const one = ensureControls(hidden, D, 30, L1);
    expect(newlyDiscoveredCitadels(hidden, one)).toEqual([citadelIdOf(0)]);
    // Déjà découverte : plus rien à annoncer.
    expect(newlyDiscoveredCitadels(one, ensureControls(one, 2 * D, 30, L1))).toEqual([]);
    // Sans carte d'avant : rien.
    expect(newlyDiscoveredCitadels(null, one)).toEqual([]);
    // Plusieurs d'un coup.
    const all = ensureControls(hidden, D, 30, 100);
    expect(newlyDiscoveredCitadels(hidden, all)).toHaveLength(4);
  });
  it('dit ce qu’elle attaque', () => {
    const m = ensureControls(base(30, 1), D, 30, 100);
    const fx = citadelDiscoveryFx(m, [MINE_CIT]);
    expect(fx.title).toBe('Citadelle découverte !');
    expect(fx.subtitle).toMatch(/Mine fortifiée/);
    expect(citadelDiscoveryFx(m, [citadelIdOf(0), citadelIdOf(1)]).title).toMatch(/^2 citadelles/);
  });
});

// 🌫️ Tous les lieux fixes sont attaqués (décision de l'utilisateur, 2026-09-30, qui remplace
// « si je la vois, elle me voit ») : une citadelle cachée attaque son secteur 2× moins souvent,
// et les citadelles découvertes lancent des raids partout.
describe('🌫️ une citadelle cachée attaque aussi, moins souvent', () => {
  const id = controlIdOf('mine');
  it('prendre un point sous une citadelle cachée programme une attaque, plus lointaine', () => {
    const m = captureControl(base(30, 1), id, ['a0'], 0, 7);
    expect(attackerHidden(m, 'mine')).toBe(true);
    const at = byId(m, id).control!.attackAt!;
    expect(at).toBeGreaterThanOrEqual(CITADEL.hiddenSlow * CONTROL.retakeMinMs);
    expect(at).toBeLessThanOrEqual(CITADEL.hiddenSlow * CONTROL.retakeMaxMs);
  });
  it('une attaque retirée par l’ancienne règle revient, et finit par être due', () => {
    const held = captureControl(base(30, 1), id, ['a0'], 0, 7);
    const stale = withAttack(held, id, undefined);
    const synced = ensureControls(stale, D, 30, 1);
    const at = byId(synced, id).control!.attackAt!;
    expect(at).toBeGreaterThan(D);
    expect(dueRetakes(synced, at).map((p) => p.id)).toContain(id);
    // Stable : un second passage ne la déplace pas.
    expect(byId(ensureControls(synced, D + H, 30, 1), id).control!.attackAt).toBe(at);
  });
});

describe('⚔️ les raids des citadelles découvertes', () => {
  const id = controlIdOf('mine');
  const heldAll = (outpost = 100) => {
    let m = base(30, outpost);
    for (const k of CONTROL.kinds) m = captureControl(m, controlIdOf(k), ['a0'], 0, 7);
    // Attaques propres très lointaines : seules les raids peuvent les avancer.
    for (const k of CONTROL.kinds) m = withAttack(m, controlIdOf(k), 1e15);
    return m;
  };
  const dueRaid = (m: ExpeditionMap, i: number, at: number): ExpeditionMap => ({
    ...m,
    pois: m.pois.map((p) =>
      p.id === citadelIdOf(i) ? { ...p, control: { ...p.control!, raidAt: at } } : p,
    ),
  });
  it('une citadelle découverte programme ses raids, une cachée non', () => {
    const m = ensureControls(heldAll(), D, 30, 100);
    for (const p of cits(m)) expect(p.control!.raidAt).toBeGreaterThan(D);
    const hidden = ensureControls(heldAll(1), D, 30, 1);
    const still = cits(hidden).filter((c) => c.control!.discoveredAt === undefined);
    expect(still.length).toBeGreaterThan(0);
    for (const p of still) expect(p.control!.raidAt).toBeUndefined();
  });
  it('un raid ne RETARDE jamais une attaque déjà plus proche', () => {
    const m0 = ensureControls(heldAll(), 0, 30, 100);
    let m = m0;
    for (const k of CONTROL.kinds) m = withAttack(m, controlIdOf(k), 2 * H);
    const after = ensureControls(dueRaid(m, 0, 5 * H), 5 * H, 30, 100);
    for (const k of CONTROL.kinds)
      expect(byId(after, controlIdOf(k)).control!.attackAt).toBe(2 * H);
  });
  it('une citadelle en trêve ne raide pas', () => {
    const razed = razeCitadel(ensureControls(heldAll(), 0, 30, 100), citadelIdOf(0), 0);
    for (let s = 1; s <= 10; s++) {
      const m = ensureControls(dueRaid(razed, 0, s * H), s * H, 30, 100);
      expect(m.pois.filter((p) => p.control?.attackAt === s * H)).toHaveLength(0);
    }
  });
  it('un raid dû avance l’attaque d’un lieu tenu, n’importe où sur la carte', () => {
    const targets = new Set<string>();
    for (let s = 1; s <= 20; s++) {
      const m0 = ensureControls(heldAll(), 0, 30, 100);
      const m1 = {
        ...m0,
        pois: m0.pois.map((p) =>
          p.id === citadelIdOf(0) ? { ...p, control: { ...p.control!, raidAt: s * H } } : p,
        ),
      };
      const m2 = ensureControls(m1, s * H, 30, 100);
      const hit = m2.pois.filter((p) => p.control?.attackAt === s * H);
      expect(hit).toHaveLength(1);
      targets.add(hit[0]!.control!.kind);
    }
    // « Partout » : pas seulement les points de son secteur.
    const own = citadelTargets(base(30, 100).pois, 0);
    expect([...targets].some((k) => !own.includes(k))).toBe(true);
  });
  it('plus on utilise la carte, plus les raids sont fréquents', () => {
    let busy = heldAll();
    for (let i = 0; i < 30; i++) busy = recordDeparture(busy, i * 5 * H);
    const t = 6 * D;
    const quiet = ensureControls(heldAll(), t, 30, 100);
    const hot = ensureControls(busy, t, 30, 100);
    const gap = (m: ExpeditionMap) =>
      cits(m).reduce((s, p) => s + (p.control!.raidAt ?? 0) - t, 0) / cits(m).length;
    expect(gap(hot)).toBeLessThan(gap(quiet));
    expect(raidDelayMs('x', 0, 1)).toBeLessThanOrEqual(CITADEL.raidMinMs * 1.25);
    expect(raidDelayMs('x', 0, 0)).toBeGreaterThanOrEqual(CITADEL.raidMaxMs * 0.75);
  });
  it('pendant sa trêve elle ne raide pas, et la trêve d’un lieu le protège', () => {
    const m0 = ensureControls(heldAll(), 0, 30, 100);
    const razed = razeCitadel(m0, citadelIdOf(0), 0);
    const protectedKinds = citadelTargets(razed.pois, 0);
    const raided = {
      ...razed,
      pois: razed.pois.map((p) =>
        p.control?.kind === 'citadel' && p.id !== citadelIdOf(0)
          ? { ...p, control: { ...p.control, raidAt: H } }
          : p,
      ),
    };
    for (let s = 0; s < 10; s++) {
      const m = ensureControls({ ...raided, pois: raided.pois.map((p) => p) }, H + s, 30, 100);
      for (const k of protectedKinds)
        expect(byId(m, controlIdOf(k)).control!.attackAt!).toBeGreaterThanOrEqual(CITADEL.truceMs);
    }
  });
  it('sans raid dû, aucune attaque n’est avancée', () => {
    const m = ensureControls(heldAll(), 0, 30, 100);
    expect(byId(m, id).control!.attackAt).toBe(1e15);
  });
});
