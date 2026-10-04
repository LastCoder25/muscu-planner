import { describe, expect, it } from 'vitest';
import { archipelOn, islandPacified, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, routePerilous, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { ensureControls, holdSeats } from '@/lib/controlPoints';
import { heroCanStay } from '@/lib/party';
import {
  FORTRESS_ID,
  NEST,
  nestLayMs,
  nestLevel,
  heldNests,
  takeObjective,
  nestSpot,
  ensureIslandConquest,
  islandConquest,
  razeIslandTarget,
  takeFortress,
} from '@/lib/islandConquest';
import { onIsland } from '@/lib/islandTerrain';
import { islandView } from '@/lib/islandShape';

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;
const LV = 30;

function islandMap(id: number, seed = 5): ExpeditionMap {
  const m = createMap(seed, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
const nests = (m: ExpeditionMap): Poi[] =>
  m.pois.filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy');

describe('🪺 les nids de l’île 2 pondent', () => {
  it('chaque nid debout pond tous les 3 jours, 6 nids au plus', () => {
    let m = islandMap(2);
    expect(nests(m)).toHaveLength(3);
    m = tick(m, NOW + 3 * DAY - 1);
    expect(nests(m)).toHaveLength(3);
    m = tick(m, NOW + 3 * DAY);
    expect(nests(m)).toHaveLength(6);
    m = tick(m, NOW + 9 * DAY);
    expect(nests(m)).toHaveLength(NEST.cap);
  });
  it('rattrape une absence et rend la même carte au tick suivant', () => {
    const m = tick(islandMap(2), NOW + 30 * DAY);
    expect(nests(m)).toHaveLength(NEST.cap);
    expect(tick(m, NOW + 30 * DAY)).toBe(m);
  });
  it('un nid abattu ne pond plus ; les autres continuent', () => {
    let m = islandMap(2);
    m = razeIslandTarget(m, 'isl_obj_0', NOW + DAY);
    m = razeIslandTarget(m, 'isl_obj_1', NOW + DAY);
    m = tick(m, NOW + 3 * DAY);
    expect(nests(m)).toHaveLength(2);
  });
  it('les nids naissent sur la terre, à 10 unités au moins des autres lieux fixes', () => {
    for (const seed of [1, 5, 9, 13]) {
      const m = tick(islandMap(2, seed), NOW + 30 * DAY);
      const fixed = m.pois.filter((p) => p.control);
      for (const n of nests(m)) {
        expect(onIsland(2, n.x, n.y, 6), n.id).toBe(true);
        for (const o of fixed)
          if (o.id !== n.id)
            expect(Math.hypot(n.x - o.x, n.y - o.y), `${n.id}/${o.id}`).toBeGreaterThanOrEqual(10);
      }
    }
  });
  it('pas de ponte hors de l’île 2', () => {
    const m = tick(islandMap(1), NOW + 30 * DAY);
    expect(m.archipel!.nests ?? []).toEqual([]);
  });
});

describe('🪺 tous les nids debout comptent pour pacifier', () => {
  it('forteresse prise et nids d’origine abattus : pas pacifiée tant qu’un nid né tient', () => {
    let m = tick(islandMap(2), NOW + 3 * DAY);
    for (const id of ['isl_obj_0', 'isl_obj_1', 'isl_obj_2'])
      m = razeIslandTarget(m, id, NOW + 4 * DAY);
    m = takeFortress(m, ['a'], false, NOW + 4 * DAY);
    expect(islandPacified(m)).toBe(false);
    expect(islandConquest(m)!.objectivesTotal).toBe(6);
    for (const n of nests(m)) m = razeIslandTarget(m, n.id, NOW + 5 * DAY);
    expect(islandPacified(m)).toBe(true);
    expect(m.pois.find((p) => p.id === FORTRESS_ID)!.control!.owner).toBe('player');
  });
});

describe('🪺 routes dangereuses autour des nids', () => {
  it('les lieux à portée d’un nid sont périlleux ; le nid abattu, la marque tombe', () => {
    let m = islandMap(2, 9);
    for (let d = 1; d <= 2; d++) m = tick(m, NOW + d * 3600_000);
    const near = (x: ExpeditionMap) =>
      x.pois.filter(
        (p) =>
          !p.id.startsWith('isl_') &&
          nests(x).some((n) => Math.hypot(p.x - n.x, p.y - n.y) <= NEST.radius),
      );
    expect(near(m).length).toBeGreaterThan(0);
    for (const p of near(m)) expect(routePerilous(p)).toBe(true);
    for (const p of m.pois.filter((q) => !near(m).includes(q))) expect(!!p.nestPeril).toBe(false);
    for (const n of nests(m)) m = razeIslandTarget(m, n.id, NOW + DAY);
    m = tick(m, NOW + DAY);
    expect(m.pois.some((p) => p.nestPeril)).toBe(false);
  });
  it('rien sur l’île 1', () => {
    const m = tick(islandMap(1), NOW + 3600_000);
    expect(m.pois.some((p) => p.nestPeril)).toBe(false);
  });
});

describe('🪺 la ponte suit l’activité sur la carte', () => {
  it('à plein régime (21 départs sur 7 jours), un nid pond chaque jour', () => {
    let m = islandMap(2);
    m = { ...m, departures: Array.from({ length: 21 }, (_, k) => NOW - k * 3600_000) };
    expect(nestLayMs(m, NOW)).toBe(NEST.layMinMs);
    expect(nests(tick(m, NOW + DAY - 1))).toHaveLength(3);
    expect(nests(tick(m, NOW + DAY))).toHaveLength(6);
  });
  it('sans sortir, 3 jours ; à mi-régime, entre les deux', () => {
    const m = islandMap(2);
    expect(nestLayMs(m, NOW)).toBe(NEST.layMaxMs);
    const half = { ...m, departures: Array.from({ length: 10 }, (_, k) => NOW - k * 3600_000) };
    expect(nestLayMs(half, NOW)).toBeGreaterThan(NEST.layMinMs);
    expect(nestLayMs(half, NOW)).toBeLessThan(NEST.layMaxMs);
  });
});

describe('🪺 le rang des nids suit le joueur', () => {
  const isl = { minLevel: 21, maxLevel: 40 };
  it('le même rang, un en dessous, un au-dessus, bornés à l’île', () => {
    expect([0, 1, 2].map((i) => nestLevel(i, 30, isl))).toEqual([30, 21, 40]);
    expect([0, 1, 2].map((i) => nestLevel(i, 21, isl))).toEqual([21, 21, 31]);
    expect([0, 1, 2].map((i) => nestLevel(i, 40, isl))).toEqual([40, 30, 40]);
  });
  it('sur la carte, les nids montent avec le joueur', () => {
    const lv = (m: ExpeditionMap) =>
      nests(m)
        .map((p) => p.level)
        .sort((a, b) => a - b);
    const m21 = ensureIslandConquest(islandMap(2), NOW, 21);
    expect(lv(m21)).toEqual([21, 21, 31]);
    expect(lv(ensureIslandConquest(m21, NOW, 35))).toEqual([25, 35, 40]);
  });
});

describe('🪺 un nid pris est abattu, jamais tenu', () => {
  it('il quitte la carte, personne n’y reste, et il ne revient pas', () => {
    const m = islandMap(2);
    const nest = nests(m)[0]!;
    expect(nest.control!.razes).toBe(true);
    expect(holdSeats(nest.control!)).toBe(0);
    expect(heroCanStay(nest)).toBe(false);
    const taken = takeObjective(m, nest.id, ['a', 'b'], NOW + DAY);
    expect(taken.pois.some((p) => p.id === nest.id)).toBe(false);
    expect(tick(taken, NOW + DAY + 1).pois.some((p) => p.id === nest.id)).toBe(false);
  });
  it('ailleurs, un objectif pris se tient toujours', () => {
    const m = islandMap(1);
    const obj = nests(m)[0]!;
    expect(obj.control!.razes).toBeUndefined();
    expect(holdSeats(obj.control!)).toBeGreaterThan(0);
    const taken = takeObjective(m, obj.id, ['a'], NOW + DAY);
    expect(taken.pois.find((p) => p.id === obj.id)?.control?.owner).toBe('player');
  });
  it('un nid TENU d’avant la règle : sa garnison est rappelée, puis il quitte la carte', () => {
    const m = islandMap(2);
    const nest = nests(m)[0]!;
    // L'ancienne règle : pris, il se tenait (on rejoue la prise d'avant).
    const held: ExpeditionMap = {
      ...razeIslandTarget(m, nest.id, NOW),
      pois: [
        ...razeIslandTarget(m, nest.id, NOW).pois,
        {
          ...nest,
          control: { ...nest.control!, razes: undefined, owner: 'player', garrison: ['a'] },
        },
      ],
    };
    expect(heldNests(held).map((p) => p.id)).toEqual([nest.id]);
    // Garnison encore là : il reste (le store la rappelle d'abord).
    expect(tick(held, NOW + 1).pois.some((p) => p.id === nest.id)).toBe(true);
    const empty: ExpeditionMap = {
      ...held,
      pois: held.pois.map((p) =>
        p.id === nest.id ? { ...p, control: { ...p.control!, garrison: [] } } : p,
      ),
    };
    expect(heldNests(empty)).toEqual([]);
    expect(tick(empty, NOW + 1).pois.some((p) => p.id === nest.id)).toBe(false);
  });
});

describe('🪺 la place d’un nid', () => {
  it('aucune place à 10 unités des autres : pas de nid (jamais posé sur un autre)', () => {
    const m = islandMap(2);
    const crowd: Poi[] = [];
    // Toute la fenêtre de l'île : elle s'étend devant le village du port (v1.29.0).
    const v = islandView(2, 110);
    for (let x = v.x; x <= v.x + v.size; x += 6)
      for (let y = v.y; y <= v.y + v.size; y += 6)
        crowd.push({ ...m.pois.find((p) => p.control)!, id: `c${x}_${y}`, x, y });
    expect(nestSpot({ pois: crowd }, 2, [])).toBeNull();
    expect(nestSpot(m, 2, [])).not.toBeNull();
  });
});
