import { describe, expect, it } from 'vitest';
import {
  militiaSailingToPoint,
  seaDestinations,
  settleMilitiaSailings,
  shipMilitiaToPoint,
  shipPointBlocker,
} from '@/lib/militiaSea';
import { archipelOn } from '@/lib/archipelago';
import { createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { militiaFreeSeats } from '@/lib/controlPoints';
import { militiaIn } from '@/lib/militia';
import { FORTRESS_ID } from '@/lib/islandConquest';

const H = 3600_000;
const T0 = Date.UTC(2026, 9, 12, 10, 0, 0);

const point = (id: string, garrison: string[], owner: 'player' | 'enemy' = 'player'): Poi =>
  ({
    id,
    type: 'control',
    level: 15,
    x: 50,
    y: 50,
    distNorm: 0.3,
    spawnedAt: T0,
    expiresAt: 9e15,
    control: {
      kind: 'mine',
      owner,
      faction: 'bandits',
      size: 1,
      garrison,
      retakes: 0,
      since: T0 - 24 * H,
      collectedAt: T0 - 24 * H,
    },
  }) as Poi;

/** L'île 1 rangée : 3 miliciens sur sa mine, une mine vide. */
function stored1(): ExpeditionMap {
  const m = createMap(42, T0, 18, 3, undefined, archipelOn(1));
  return {
    ...m,
    archipel: { ...m.archipel!, destroyed: [FORTRESS_ID] },
    pois: [point('i1_mine', ['mil:1', 'mil:2', 'mil:3']), point('i1_empty', [])],
    militia: { home: 0, producedAt: T0, seq: 3 },
  };
}

/** L'île 2 active (2 miliciens sur sa mine, une mine vide, un lieu ennemi), l'île 1 rangée. */
function active2(): ExpeditionMap {
  const m = createMap(7, T0, 21, 3, undefined, archipelOn(2));
  return {
    ...m,
    pois: [
      point('i2_mine', ['mil:1', 'mil:2']),
      point('i2_empty', []),
      point('i2_enemy', [], 'enemy'),
    ],
    islands: { '1': stored1() },
  };
}

const gar = (m: ExpeditionMap, id: string) =>
  militiaIn(m.pois.find((p) => p.id === id)!.control!.garrison);

describe('⛵🏰 un lieu fixe vers un lieu fixe d’une autre île', () => {
  it('d’une île rangée vers un lieu de l’île active : quittent le lieu, 2 h de mer', () => {
    const out = shipMilitiaToPoint(
      active2(),
      null,
      { island: 1, pointId: 'i1_mine' },
      { island: 2, pointId: 'i2_empty' },
      2,
      T0,
      21,
    )!;
    const mine = out.islands!['1']!.pois.find((p) => p.id === 'i1_mine')!.control!;
    expect(militiaIn(mine.garrison)).toHaveLength(1);
    // La production faite est mise de côté avant le départ.
    expect(mine.collectedAt).toBe(T0);
    expect(out.sailings![0]).toMatchObject({ from: 1, to: 2, militia: 2, militiaTo: 'i2_empty' });
    expect(militiaSailingToPoint(out, 2, 'i2_empty')).toBe(2);
  });

  it('à l’accostage sur l’île active, ils marchent en renfort sur le lieu choisi', () => {
    const sent = shipMilitiaToPoint(
      active2(),
      null,
      { island: 1, pointId: 'i1_mine' },
      { island: 2, pointId: 'i2_empty' },
      2,
      T0,
      21,
    )!;
    const done = settleMilitiaSailings(sent, null, T0 + 2 * H, 21)!;
    const c = done.map.pois.find((p) => p.id === 'i2_empty')!.control!;
    expect(c.reinforcing).toHaveLength(2);
    expect(done.reserve!.home).toBe(0);
    expect(done.map.sailings).toBeUndefined();
  });

  it('de l’île active vers un lieu d’une île rangée : ils y entrent à l’accostage', () => {
    const sent = shipMilitiaToPoint(
      active2(),
      null,
      { island: 2, pointId: 'i2_mine' },
      { island: 1, pointId: 'i1_empty' },
      2,
      T0,
      21,
    )!;
    expect(gar(sent, 'i2_mine')).toHaveLength(0);
    const done = settleMilitiaSailings(sent, null, T0 + 2 * H, 21)!;
    const im = done.map.islands!['1']!;
    expect(gar(im, 'i1_empty')).toHaveLength(2);
    expect(im.militia!.home).toBe(0);
  });

  it('un lieu d’arrivée plein à l’accostage : ils restent dans la réserve de l’île', () => {
    const sent = shipMilitiaToPoint(
      active2(),
      null,
      { island: 2, pointId: 'i2_mine' },
      { island: 1, pointId: 'i1_empty' },
      2,
      T0,
      21,
    )!;
    // Le lieu est perdu pendant la mer.
    const im = sent.islands!['1']!;
    const lost = {
      ...sent,
      islands: {
        '1': {
          ...im,
          pois: im.pois.map((p) =>
            p.id === 'i1_empty' ? { ...p, control: { ...p.control!, owner: 'enemy' as const } } : p,
          ),
        },
      },
    };
    const done = settleMilitiaSailings(lost, null, T0 + 2 * H, 21)!;
    expect(done.map.islands!['1']!.militia!.home).toBe(2);
  });

  it('la place d’arrivée est gardée pendant la mer', () => {
    const room = militiaFreeSeats(active2().islands!['1']!.pois[1]!.control);
    let m = active2();
    // Remplit le lieu vide de l'île 1 depuis l'île active, deux par deux.
    const from = { island: 2, pointId: 'i2_mine' };
    const to = { island: 1, pointId: 'i1_empty' };
    m = shipMilitiaToPoint(m, null, from, to, 2, T0, 21)!;
    const left = room - 2;
    expect(seaDestinations(m, null, 2).find((d) => d.pointId === 'i1_empty')!.room).toBe(left);
    expect(shipPointBlocker(m, null, { island: 2, pointId: 'i2_mine' }, to, 1)).toBe('tooMany');
  });

  it('refuse ce qui ne se peut pas, avec sa raison', () => {
    const m = active2();
    const src = { island: 1, pointId: 'i1_mine' };
    expect(shipPointBlocker(m, null, src, { island: 1, pointId: 'i1_empty' }, 1)).toBe('same');
    expect(shipPointBlocker(m, null, src, { island: 3, pointId: 'x' }, 1)).toBe('notVisited');
    expect(shipPointBlocker(m, null, src, { island: 2, pointId: 'i2_empty' }, 0)).toBe('empty');
    expect(shipPointBlocker(m, null, src, { island: 2, pointId: 'i2_empty' }, 4)).toBe('tooMany');
    expect(shipPointBlocker(m, null, src, { island: 2, pointId: 'i2_enemy' }, 1)).toBe(
      'noTarget',
    );
    expect(
      shipPointBlocker(m, null, { island: 1, pointId: 'nope' }, { island: 2, pointId: 'i2_empty' }, 1),
    ).toBe('noSource');
    expect(
      shipMilitiaToPoint(m, null, src, { island: 2, pointId: 'i2_enemy' }, 1, T0, 21),
    ).toBeNull();
  });

  it('les destinations : les lieux tenus des AUTRES îles, jamais ceux de l’île de départ', () => {
    const d = seaDestinations(active2(), null, 2);
    expect(d.map((x) => x.pointId).sort()).toEqual(['i1_empty', 'i1_mine']);
    expect(d.every((x) => x.island === 1)).toBe(true);
    const back = seaDestinations(active2(), null, 1);
    expect(back.map((x) => x.pointId).sort()).toEqual(['i2_empty', 'i2_mine']);
  });
});
