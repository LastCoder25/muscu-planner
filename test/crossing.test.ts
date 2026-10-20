import { describe, expect, it } from 'vitest';
import {
  CROSSING,
  boardTravellers,
  crossingBlocker,
  crossingTravellers,
  fortressReward,
  fortressSealCount,
  landAdventurers,
  abandonedIslandKeys,
  landCrossing,
  landingChestMessage,
  moveRemoteMilitia,
  nextCrossingDeparture,
  openIslands,
  produceIslandMilitia,
  remotePoints,
  storedIslandProduction,
  startCrossing,
  visitedIslands,
} from '@/lib/crossing';
import { archipelOn, islandById } from '@/lib/archipelago';
import { advUnavailableReason, type Adventurer } from '@/lib/adventurers';
import {
  advanceWorld,
  createMap,
  EXPE,
  type ControlState,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';
import { FORTRESS_ID, vacateIsland } from '@/lib/islandConquest';
import { characterRank } from '@/lib/characterRank';
import { emptyMilitia, militiaCap, produceMilitia } from '@/lib/militia';
import { controlKindsOf, islandMilitiaOf } from '@/lib/controlPoints';

const H = 3600_000;
const T0 = Date.UTC(2026, 9, 2, 10, 0, 0);

function island1(destroyed: string[] = []): ExpeditionMap {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return { ...m, archipel: { ...m.archipel!, destroyed } };
}
const adv = (id: string, extra: Partial<Adventurer> = {}): Adventurer =>
  ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0, ...extra }) as Adventurer;
const free = { heroBusy: false, championsAway: 0 };

describe('⛵ départ immédiat (plus d’heure pile, v1.46.0)', () => {
  it('le prochain départ est maintenant, quelle que soit l’heure', () => {
    expect(nextCrossingDeparture(T0)).toBe(T0);
    expect(nextCrossingDeparture(T0 + 1)).toBe(T0 + 1);
    expect(nextCrossingDeparture(T0 + H - 1)).toBe(T0 + H - 1);
  });
});

describe('⛵ îles ouvertes', () => {
  it('seule l’île 1 tant que sa forteresse tient, la 2 dès qu’elle tombe', () => {
    expect(openIslands(island1())).toEqual([1]);
    expect(openIslands(island1([FORTRESS_ID]))).toEqual([1, 2]);
  });
  it('une île rangée reste ouverte (on retraverse dans les deux sens)', () => {
    const m = { ...island1(), islands: { '3': { ...island1(), archipel: archipelOn(3) } } };
    expect(visitedIslands(m)).toEqual([1, 3]);
    expect(openIslands(m)).toContain(3);
  });
  it('hors archipel, rien', () => {
    expect(openIslands(createMap(1, T0, 10, 3))).toEqual([]);
  });
});

describe('⛵ refus de traverser', () => {
  const m = island1([FORTRESS_ID]);
  it('île fermée, même île, héros pris, troupes en route, déjà en mer', () => {
    expect(crossingBlocker(island1(), 2, free)).toBe('locked');
    expect(crossingBlocker(m, 1, free)).toBe('same');
    expect(crossingBlocker(m, 3, free)).toBe('locked');
    expect(crossingBlocker(m, 2, { ...free, heroBusy: true })).toBe('heroBusy');
    expect(crossingBlocker(startCrossing(m, 2, [], T0), 2, free)).toBe('atSea');
    expect(crossingBlocker(m, 2, free)).toBeNull();
  });
});

describe('⛵ qui embarque', () => {
  it('tous les champions libres, jamais les postés, en route, blessés ou ailleurs', () => {
    const advs = [
      adv('a'),
      adv('b', { posted: 'ctl_x' }),
      adv('c', { busyUntil: T0 + H }),
      adv('d', { hurtUntil: T0 + H }),
      adv('e', { elsewhere: 2 }),
      adv('f', { busyUntil: T0 - 1 }),
    ];
    expect(crossingTravellers(advs, T0)).toEqual(['a', 'f']);
  });
  it('les embarqués sont occupés jusqu’à l’arrivée (2 h après le départ)', () => {
    const m = startCrossing(island1([FORTRESS_ID]), 2, ['a'], T0 + 1);
    expect(m.crossing!.departAt).toBe(T0 + 1);
    expect(m.crossing!.arriveAt).toBe(T0 + 1 + CROSSING.travelMs);
    const b = boardTravellers([adv('a'), adv('z')], m.crossing!);
    expect(b[0]!.busyUntil).toBe(m.crossing!.arriveAt);
    expect(b[1]!.busyUntil).toBeUndefined();
  });
});

describe('⚓ débarquer', () => {
  const start = { ...island1([FORTRESS_ID]), citadelStash: [] };
  const booked = startCrossing(start, 2, ['a'], T0);
  const arrive = booked.crossing!.arriveAt;
  it('rien avant l’arrivée', () => {
    const l = landCrossing(booked, arrive - 1, 30, undefined);
    expect(l.crossing).toBeNull();
    expect(l.map).toBe(booked);
  });
  it('vers l’île suivante, l’île quittée est PACIFIÉE : seuls ses lieux fixes restent', () => {
    // Décision de l'utilisateur (2026-10-03) : « on pacifie l'île précédente des lieux sauf
    // les lieux fixes qui produisent ».
    const l = landCrossing(booked, arrive, 30, undefined);
    expect(l.firstTime).toBe(true);
    expect(l.map.crossing).toBeUndefined();
    expect(l.map.archipel!.island).toBe(2);
    expect(l.map.archipel!.levelFloor).toBe(21);
    expect(l.map.pois.length).toBeGreaterThan(0);
    expect(l.map.citadelStash).toEqual([]);
    const left = l.map.islands!['1']!;
    expect(left.archipel!.pacifiedAt).toBe(arrive);
    expect(left.archipel!.vacatedAt).toBe(arrive);
    expect(left.archipel!.destroyed).toContain(FORTRESS_ID);
    expect(left.archipel!.destroyed).toContain('isl_obj_0');
    const fixed = start.pois.filter((p) => p.control && !p.id.startsWith('isl_'));
    expect(start.pois.length).toBeGreaterThan(fixed.length); // il y avait autre chose
    expect(left.pois.map((p) => p.id).sort()).toEqual(fixed.map((p) => p.id).sort());
    expect(left.islands).toBeUndefined();
    expect(left.crossing).toBeUndefined();
  });
  it('retraverser (retour) rend l’île 1 telle qu’on l’a laissée et range l’île 2 intacte', () => {
    const on2 = landCrossing(booked, arrive, 30, undefined).map;
    const back = startCrossing(on2, 1, [], arrive + 10);
    const l = landCrossing(back, back.crossing!.arriveAt, 30, undefined);
    expect(l.firstTime).toBe(false);
    expect(l.map.archipel!.island).toBe(1);
    expect(l.map.pois).toEqual(on2.islands!['1']!.pois);
    // ⚠️ Un RETOUR ne pacifie rien : l'île 2 est rangée telle quelle.
    expect(l.map.islands!['2']!.pois).toEqual(on2.pois);
    expect(l.map.islands!['2']!.archipel!.vacatedAt).toBeUndefined();
    expect(l.map.islands!['1']).toBeUndefined();
  });
  it('vers l’île suivante, TOUS les champions débarquent, postes levés', () => {
    const c = booked.crossing!;
    const out = landAdventurers(
      [
        adv('a'),
        adv('p', { posted: 'x' }),
        adv('w', { elsewhere: 2, posted: 'y' }),
        adv('o', { elsewhere: 3 }),
      ],
      c,
    );
    expect(out.map((a) => a.elsewhere)).toEqual([undefined, undefined, undefined, undefined]);
    // Celui qui attendait sur l'île d'arrivée garde son poste ; les autres le perdent.
    expect(out.map((a) => a.posted)).toEqual([undefined, undefined, 'y', undefined]);
  });
  it('au retour aussi, TOUT LE MONDE suit le héros (2026-10-13 : une seule île à la fois)', () => {
    const c = { from: 2, to: 1, bookedAt: T0, departAt: T0, arriveAt: T0 + 2 * H, ids: ['a'] };
    const out = landAdventurers(
      [adv('a'), adv('p', { posted: 'x' }), adv('w', { elsewhere: 1 }), adv('o', { elsewhere: 3 })],
      c,
    );
    expect(out.map((a) => a.elsewhere)).toEqual([undefined, undefined, undefined, undefined]);
    expect(out[1]!.posted).toBeUndefined();
  });
  it('un champion resté ailleurs est indisponible ici', () => {
    expect(advUnavailableReason(adv('x', { elsewhere: 1 }), T0)).toBe('away');
    expect(advUnavailableReason(adv('x'), T0)).toBeNull();
  });
});

describe('🕊️ vider l’île quittée', () => {
  const ctl = (id: string, c: Partial<ControlState>): Poi =>
    ({
      id,
      type: 'control',
      level: 10,
      x: EXPE.town.x + 12,
      y: EXPE.town.y - 6,
      distNorm: 0.3,
      spawnedAt: T0,
      expiresAt: 9e15,
      control: {
        kind: 'mine',
        owner: 'player',
        faction: 'bandits',
        size: 1,
        garrison: [],
        retakes: 0,
        ...c,
      },
    }) as Poi;
  const base = island1([FORTRESS_ID]);
  const held = ctl('ctl_mine', {
    garrison: ['a', 'mil:1', 'mil:2'],
    since: T0,
    collectedAt: T0,
    attackAt: T0 + 24 * H,
    hero: true,
    reinforcing: [
      { id: 'b', at: T0 + H },
      { id: 'mil:3', at: T0 + H },
    ],
  });
  const enemy = ctl('ctl_garden', { kind: 'garden', owner: 'enemy', attackAt: T0 + H });
  const target = ctl('isl_obj_0', { kind: 'mine', owner: 'enemy' });
  const m: ExpeditionMap = {
    ...base,
    pois: [...base.pois, held, enemy, target],
    ambushes: [{ id: 'amb', x: 1, y: 1, until: T0 + 9 * H }],
  };
  const v = vacateIsland(m, T0 + 2 * H, 18);

  it('ne garde que les lieux fixes, sans attaque ; objectifs et forteresse abattus', () => {
    expect(v.pois.map((p) => p.id).sort()).toEqual(['ctl_garden', 'ctl_mine']);
    expect(v.pois.every((p) => p.control!.attackAt === undefined)).toBe(true);
    expect(v.archipel!.destroyed).toEqual(expect.arrayContaining(['isl_obj_0', FORTRESS_ID]));
    expect(v.ambushes).toBeUndefined();
    expect(v.archipel!.pacifiedAt).toBe(T0 + 2 * H);
  });
  it('les champions et le héros partent, les miliciens restent', () => {
    const c = v.pois.find((p) => p.id === 'ctl_mine')!.control!;
    expect(c.garrison).toEqual(['mil:1', 'mil:2']);
    expect(c.reinforcing).toEqual([{ id: 'mil:3', at: T0 + H }]);
    expect(c.hero).toBeUndefined();
    // La production faite avec le champion est mise de côté avant son départ.
    expect(c.collectedAt).toBe(T0 + 2 * H);
    expect(c.banked ?? 0).toBeGreaterThan(0);
  });
  it('idempotente, et plus rien n’apparaît sur l’île quittée', () => {
    expect(vacateIsland(v, T0 + 3 * H, 18)).toBe(v);
    const later = advanceWorld(v, T0 + 72 * H, 18, 3);
    expect(later.pois.map((p) => p.id).sort()).toEqual(['ctl_garden', 'ctl_mine']);
  });

  // ⛵ 2026-10-13 (décision de l'utilisateur) : on se concentre sur UNE île.
  const on2 = (): ExpeditionMap => {
    const i2 = createMap(7, T0, 30, 3, undefined, archipelOn(2));
    return {
      ...i2,
      pois: [...i2.pois, held],
      islands: { '1': v },
      crossing: { from: 2, to: 1, bookedAt: T0, departAt: T0, arriveAt: T0 + 2 * H, ids: [] },
    };
  };
  it('en reculant, l’île pacifiée retrouvée refait apparaître ses lieux et ses failles', () => {
    const land = landCrossing(on2(), T0 + 2 * H, 30, undefined);
    expect(land.map.archipel!.island).toBe(1);
    expect(land.map.archipel!.vacatedAt).toBeUndefined();
    expect(land.map.archipel!.pacifiedAt).toBe(T0 + 2 * H); // toujours pacifiée
    const later = advanceWorld(land.map, T0 + 3 * H, 18, 3);
    expect(later.pois.filter((p) => !p.control).length).toBeGreaterThan(0);
    expect(later.pois.some((p) => p.type === 'rift')).toBe(true);
    // Toujours pacifiée : aucune attaque ne se prépare sur ses lieux fixes.
    expect(later.pois.every((p) => p.control?.attackAt === undefined)).toBe(true);
  });
  it('en reculant, l’île quittée est ABANDONNÉE : pas pacifiée, ses champions partent, ses miliciens et ses attaques restent', () => {
    const land = landCrossing(on2(), T0 + 2 * H, 30, undefined);
    const left = land.map.islands!['2']!;
    expect(left.archipel!.pacifiedAt).toBeUndefined();
    expect(left.archipel!.vacatedAt).toBeUndefined();
    const c = left.pois.find((p) => p.id === 'ctl_mine')!.control!;
    expect(c.garrison).toEqual(['mil:1', 'mil:2']);
    expect(c.hero).toBeUndefined();
    expect(c.attackAt).toBe(T0 + 24 * H);
    expect(abandonedIslandKeys(land.map)).toEqual(['2']);
  });
  it('une île pacifiée rangée n’est jamais abandonnée (elle ne s’attaque plus)', () => {
    expect(abandonedIslandKeys({ archipel: archipelOn(2), islands: { '1': v } })).toEqual([]);
  });
  it('la quitter de nouveau vers l’avant la revide', () => {
    const back = landCrossing(on2(), T0 + 2 * H, 30, undefined).map;
    const grown = advanceWorld(back, T0 + 3 * H, 18, 3);
    const again = vacateIsland(grown, T0 + 4 * H, 18);
    expect(again.pois.every((p) => !!p.control)).toBe(true);
    expect(again.archipel!.vacatedAt).toBe(T0 + 4 * H);
  });
});

describe('🛡️ la milice d’une île quittée se gère à distance', () => {
  const p = (garrison: string[]): Poi =>
    ({
      id: 'ctl_mine',
      type: 'control',
      level: 10,
      x: 50,
      y: 50,
      distNorm: 0.3,
      spawnedAt: T0,
      expiresAt: 9e15,
      control: {
        kind: 'mine',
        owner: 'player',
        faction: 'bandits',
        size: 1,
        garrison,
        retakes: 0,
        since: T0,
        collectedAt: T0,
      },
    }) as Poi;
  const im = (garrison: string[], home: number): ExpeditionMap => ({
    ...island1([FORTRESS_ID]),
    pois: [p(garrison)],
    militia: { home, producedAt: T0, seq: 5 },
  });
  it('de la réserve vers un lieu, et retour, immédiatement', () => {
    const up = moveRemoteMilitia(im([], 3), 'ctl_mine', 2, T0 + H, 18)!;
    expect(up.militia!.home).toBe(1);
    expect(up.pois[0]!.control!.garrison).toEqual(['mil:6', 'mil:7']);
    const down = moveRemoteMilitia(up, 'ctl_mine', -1, T0 + 2 * H, 18)!;
    expect(down.militia!.home).toBe(2);
    expect(down.pois[0]!.control!.garrison).toEqual(['mil:6']);
    expect(remotePoints(down)).toEqual([
      expect.objectContaining({ id: 'ctl_mine', militia: 1, room: 4 }),
    ]);
  });
  it('un lieu d’un type retiré de l’île n’apparaît que s’il garde des miliciens', () => {
    const camp = (garrison: string[]) =>
      ({
        ...p(garrison),
        id: 'ctl_training',
        control: { ...p(garrison).control!, kind: 'training' },
      }) as Poi;
    const withCamp = (garrison: string[]): ExpeditionMap => ({
      ...im([], 3),
      pois: [p([]), camp(garrison)],
    });
    expect(remotePoints(withCamp([])).map((r) => r.id)).toEqual(['ctl_mine']);
    expect(remotePoints(withCamp(['mil:1'])).map((r) => r.id)).toEqual([
      'ctl_mine',
      'ctl_training',
    ]);
  });
  it('refuse sans réserve, sans place, ou sans milicien à ramener', () => {
    expect(moveRemoteMilitia(im([], 0), 'ctl_mine', 1, T0, 18)).toBeNull();
    expect(
      moveRemoteMilitia(
        im(['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'], 3),
        'ctl_mine',
        1,
        T0,
        18,
      ),
    ).toBeNull();
    expect(moveRemoteMilitia(im(['a'], 3), 'ctl_mine', -1, T0, 18)).toBeNull();
    expect(moveRemoteMilitia(im([], 3), 'nope', 1, T0, 18)).toBeNull();
  });
});

describe('🛡️ une réserve de milice par île', () => {
  const start = island1([FORTRESS_ID]);
  const booked = startCrossing(start, 2, [], T0);
  const arrive = booked.crossing!.arriveAt;
  const mil1 = { home: 4, producedAt: T0, seq: 9 };
  it('vers l’île suivante, la réserve embarque avec le héros (2026-10-12)', () => {
    const l = landCrossing(booked, arrive, 30, mil1);
    expect(l.militia).toEqual({ home: 4, producedAt: arrive, seq: 0 });
    expect(l.map.islands!['1']!.militia).toEqual({ ...mil1, home: 0 });
    expect(l.map.militia).toBeUndefined();
  });
  it('les miliciens retirés d’un lieu fixe au départ arrivent avec le héros', () => {
    // Signalé : « j'ai vidé un lieu de ses 5 miliciens, je n'en ai qu'un à l'arrivée ».
    const mine = {
      id: 'ctl_mine',
      type: 'control',
      level: 10,
      x: 50,
      y: 50,
      distNorm: 0.3,
      spawnedAt: T0,
      expiresAt: 9e15,
      control: {
        kind: 'mine',
        owner: 'player',
        faction: 'bandits',
        size: 1,
        garrison: ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'],
        retakes: 0,
        since: T0,
        collectedAt: T0,
      },
    } as Poi;
    const held = { ...start, pois: [...start.pois, mine] };
    const go = startCrossing(held, 2, [], T0, 0, { ctl_mine: 0 });
    const l = landCrossing(go, go.crossing!.arriveAt, 30, { home: 0, producedAt: T0, seq: 5 });
    expect(l.militia.home).toBe(5);
    expect(l.map.islands!['1']!.militia!.home).toBe(0);
    const left = l.map.islands!['1']!.pois.find((p) => p.id === 'ctl_mine');
    expect(left?.control?.garrison ?? []).toEqual([]);
  });
  it('vers une île précédente, la réserve reste où elle est', () => {
    const on2 = landCrossing(booked, arrive, 30, mil1).map;
    const back = startCrossing(on2, 1, [], arrive + 10);
    const l = landCrossing(back, back.crossing!.arriveAt, 30, { home: 3, producedAt: T0, seq: 3 });
    expect(l.map.islands!['2']!.militia!.home).toBe(3);
  });
  it('au retour, la réserve de l’île 1 revient, celle de l’île 2 est rangée', () => {
    const on2 = landCrossing(booked, arrive, 30, mil1);
    const mil2 = { home: 1, producedAt: arrive, seq: 1 };
    const back = startCrossing(on2.map, 1, [], arrive + 10);
    const l = landCrossing(back, back.crossing!.arriveAt, 30, mil2);
    // Sa réserve était partie avec le héros vers l'île 2 : il n'en reste rien.
    expect(l.militia).toEqual({ ...mil1, home: 0 });
    expect(l.map.militia).toBeUndefined();
    expect(l.map.islands!['2']!.militia).toEqual(mil2);
  });
  it('la Caserne produit pour l’île rangée, bornée par son plafond', () => {
    const on2 = landCrossing(booked, arrive, 30, { home: 0, producedAt: T0, seq: 0 }).map;
    const later = produceIslandMilitia(on2, 10, T0 + 48 * H);
    const home = later.islands!['1']!.militia!.home;
    expect(home).toBeGreaterThan(0);
    expect(home).toBeLessThanOrEqual(militiaCap(10, islandMilitiaOf({ archipel: archipelOn(1) })));
    expect(produceIslandMilitia(on2, 0, T0 + 48 * H)).toBe(on2);
    expect(produceIslandMilitia(later, 10, T0 + 48 * H)).toBe(later);
  });

  it('sur une île : le plafond monte avec la Caserne jusqu’aux places EXACTES au dernier niveau', () => {
    for (const id of [1, 2, 3, 4, 5]) {
      const a = archipelOn(id);
      const isl = islandMilitiaOf({ archipel: a })!;
      // Les places : une garnison pleine (5) sur chacun des lieux fixes de l'île.
      expect(isl.seats).toBe(controlKindsOf({ archipel: a }).length * 5);
      expect(isl.minLevel).toBe(a.levelFloor);
      expect(isl.maxLevel).toBe(a.levelCap);
      // Au premier niveau de l'île : 1 milicien ; au dernier : exactement les places.
      expect(militiaCap(isl.minLevel, isl)).toBe(1);
      expect(militiaCap(isl.maxLevel, isl)).toBe(isl.seats);
      // Jamais atteint avant le dernier niveau, jamais dépassé après.
      expect(militiaCap(isl.maxLevel - 1, isl)).toBeLessThan(isl.seats);
      expect(militiaCap(isl.maxLevel + 30, isl)).toBe(isl.seats);
      // Progressif : chaque niveau débloque 0 ou 1 milicien, jamais de recul.
      for (let L = isl.minLevel + 1; L <= isl.maxLevel; L++) {
        const d = militiaCap(L, isl) - militiaCap(L - 1, isl);
        expect(d === 0 || d === 1).toBe(true);
      }
      // Une Caserne en retard sur la tranche de l'île garde au moins 1 milicien.
      if (isl.minLevel > 1) expect(militiaCap(isl.minLevel - 5, isl)).toBe(1);
      expect(militiaCap(0, isl)).toBe(0);
    }
    // Île 1 : 3 lieux fixes → 15 miliciens, atteints à la Caserne 20 (on quitte l'île).
    const i1 = islandMilitiaOf({ archipel: archipelOn(1) })!;
    expect(militiaCap(19, i1)).toBe(14);
    expect(militiaCap(20, i1)).toBe(15);
    expect(militiaCap(37, i1)).toBe(15);
    // Hors archipel : 1 par niveau, sans borne d'île.
    expect(islandMilitiaOf({})).toBeNull();
    expect(militiaCap(37, null)).toBe(37);
    // La production remplit jusqu'au plafond de l'île, pas au-delà.
    const full = produceMilitia(emptyMilitia(0), 10, 0, 1e13, i1, 0);
    expect(full.home).toBe(militiaCap(10, i1));
  });
});

describe('🎁 récompenses', () => {
  it('premier débarquement : 10 tirages, en tickets — et rien en pierres de mana (sinon 20)', () => {
    const m = landingChestMessage(islandById(2)!, T0);
    expect(m.tickets).toBe(CROSSING.firstLandingTickets);
    expect(CROSSING.firstLandingTickets).toBe(10);
    expect(m.mana ?? 0).toBe(0);
    expect(m.claimed).toBe(false);
  });
  it('forteresse abattue : un coffre une seule fois, sceaux au rang max de l’île', () => {
    expect(fortressReward(island1(), T0)).toBeNull();
    const r = fortressReward(island1([FORTRESS_ID]), T0)!;
    expect(r.msg.seals).toEqual({
      kind: 'champion',
      rank: characterRank(20).rankIndex,
      n: 5,
    });
    // ⚒️ Proportionnel au niveau max de l'île : 5 / 10 / 15 / 20 / 25.
    expect([20, 40, 60, 80, 100].map((maxLevel) => fortressSealCount({ maxLevel }))).toEqual([
      5, 10, 15, 20, 25,
    ]);
    expect(r.msg.runes).toBe(CROSSING.fortressRunesBase + 1);
    expect(fortressReward(r.map, T0 + 1)).toBeNull();
  });
});

describe('🏝️ la production des îles rangées, île par île', () => {
  const held = (id: string, kind: ControlState['kind'], garrison: string[]): Poi =>
    ({
      id,
      type: 'control',
      level: 10,
      x: 50,
      y: 50,
      distNorm: 0.3,
      spawnedAt: T0,
      expiresAt: 9e15,
      control: {
        kind,
        owner: 'player',
        faction: 'bandits',
        size: 1,
        garrison,
        retakes: 0,
        since: T0,
        collectedAt: T0,
      },
    }) as Poi;
  const stash = (pois: Poi[]): ExpeditionMap => ({ ...island1([FORTRESS_ID]), pois });
  const active = (islands: Record<string, ExpeditionMap>): ExpeditionMap => ({
    ...createMap(7, T0, 30, 3, undefined, archipelOn(3)),
    islands,
  });
  it('un bloc par île rangée, trié, avec ses lieux tenus et leur production', () => {
    const map = active({
      '2': stash([held('ctl_garden', 'garden', ['mil:1', 'mil:2'])]),
      '1': stash([held('ctl_mine', 'mine', ['mil:3'])]),
    });
    const out = storedIslandProduction(map, T0 + 2 * H, 30);
    expect(out.map((b) => b.island)).toEqual([1, 2]);
    expect(out[0]!.name).toBe(islandById(1)!.name);
    expect(out[0]!.points[0]).toEqual(
      expect.objectContaining({ id: 'ctl_mine', text: expect.stringContaining('/h') }),
    );
    // Le jardin dit son avancement ET le temps avant la prochaine unité.
    const g = out[1]!.points[0]!;
    expect(g.pct).toBeGreaterThan(0);
    expect(g.text).toMatch(/%.*·/);
  });
  it('n’affiche ni l’île active, ni un lieu ennemi, ni une île sans lieu tenu', () => {
    const enemy = held('ctl_x', 'mine', []);
    const map = active({
      '1': stash([{ ...enemy, control: { ...enemy.control!, owner: 'enemy' } }]),
      '3': stash([held('ctl_mine', 'mine', ['mil:1'])]),
    });
    expect(storedIslandProduction(map, T0 + H, 30)).toEqual([]);
    expect(storedIslandProduction(null, T0, 30)).toEqual([]);
  });
  it('un lieu d’un type RETIRÉ de l’île, resté vide, n’est pas listé (le camp de l’île 1)', () => {
    const map = active({
      '1': stash([held('ctl_mine', 'mine', ['mil:1']), held('ctl_training', 'training', [])]),
    });
    expect(storedIslandProduction(map, T0 + H, 30)[0]!.points.map((p) => p.id)).toEqual([
      'ctl_mine',
    ]);
  });
});
