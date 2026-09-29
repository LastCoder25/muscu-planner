// 🏰🧭 Les points fixes comme avant-postes : transferts entre points, sorties depuis un point.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlIdOf,
  ensureControls,
  reinforcementsEnRoute,
  settleReinforcements,
  seatsOf,
} from '@/lib/controlPoints';
import {
  fromSpot,
  garrisonChampionIds,
  legFromSpot,
  rejoinHome,
  sortieBlocker,
  transferBlocker,
  transferGarrison,
} from '@/lib/controlRoutes';
import {
  EXPE,
  MAP_RIM,
  createMap,
  mapTravelPoint,
  travelPosition,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';
import { partyLegMin } from '@/lib/party';

const H = 3600_000;
const L = 30;
const MINE = controlIdOf('mine');
const FORGE = controlIdOf('forge');
const GARDEN = controlIdOf('garden');
const pt = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!;
const far = (m: ExpeditionMap) => ({
  ...m,
  pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p)),
});
/** La mine tenue par `mine`, la forge par `forge` (un tableau vide = point ennemi). */
const world = (mine: string[], forge: string[] = []) => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  if (mine.length) m = captureControl(m, MINE, mine, 0, 7);
  if (forge.length) m = captureControl(m, FORGE, forge, 0, 7);
  return far(m);
};
const leg = (p: Poi) => partyLegMin(p, [], { hero: true, travelMult: 1, gearSpeed: 0 });

describe('🧭 trajet depuis un point fixe', () => {
  it('la distance se mesure depuis le point, pas depuis la ville', () => {
    const m = world(['a']);
    const mine = pt(m, MINE);
    expect(fromSpot(mine, mine).distNorm).toBe(0);
    // (les coordonnées d'un point sont arrondies à l'unité : la distance stockée non)
    expect(fromSpot(mine, EXPE.town).distNorm).toBeCloseTo(mine.distNorm, 1);
  });
  it('deux points voisins : la ligne directe, bien plus courte que le détour par la ville', () => {
    const m = world(['a']);
    const mine = pt(m, MINE);
    const forge = pt(m, FORGE);
    const direct = leg(fromSpot(forge, mine));
    const viaTown = leg(mine) + leg(forge);
    expect(direct).toBeLessThan(viaTown);
    expect(legFromSpot(forge, mine, leg)).toBe(direct);
  });
  it('deux points opposés : jamais plus long que le détour par la ville', () => {
    const m = world(['a']);
    const mine = pt(m, MINE);
    const garden = pt(m, GARDEN); // un demi-tour plus loin
    const viaTown = leg(mine) + leg(garden);
    expect(leg(fromSpot(garden, mine))).toBeGreaterThan(viaTown);
    expect(legFromSpot(garden, mine, leg)).toBe(viaTown);
  });
});

describe('⇄ transfert entre deux points', () => {
  it('refusé si l’un des deux points n’est pas à toi, ou si c’est le même', () => {
    expect(transferBlocker(world(['a']), MINE, FORGE, ['a'])).toBe('notHeld');
    expect(transferBlocker(world(['a'], ['b']), MINE, MINE, ['a'])).toBe('same');
    expect(transferBlocker(world(['a'], ['b']), MINE, FORGE, [])).toBe('empty');
  });
  it('seuls les membres ARRIVÉS du point de départ peuvent partir', () => {
    const m = world(['a'], ['b']);
    expect(transferBlocker(m, MINE, FORGE, ['z'])).toBe('notHere');
    expect(transferBlocker(m, MINE, FORGE, ['a', 'a'])).toBe('notHere');
    expect(transferBlocker(m, MINE, FORGE, ['a'])).toBeNull();
  });
  it('refusé quand le point d’arrivée n’a plus de place de champion', () => {
    const full = Array.from({ length: seatsOf('forge') }, (_, i) => `f${i}`);
    expect(transferBlocker(world(['a'], full), MINE, FORGE, ['a'])).toBe('full');
  });
  it('le transfert libère la place de départ et occupe celle d’arrivée tout de suite', () => {
    const m = transferGarrison(world(['a', 'c'], ['b']), {
      fromId: MINE,
      toId: FORGE,
      now: H,
      playerLevel: L,
      champs: { ids: ['a'], at: 3 * H },
      militia: { ids: [], at: H },
    });
    expect(pt(m, MINE).control!.garrison).toEqual(['c']);
    expect(pt(m, FORGE).control!.reinforcing).toEqual([{ id: 'a', at: 3 * H, from: H, via: MINE }]);
    // Il rejoint la garnison à son arrivée, comme un renfort de la base.
    expect(pt(settleReinforcements(m, 3 * H, L), FORGE).control!.garrison).toEqual(['b', 'a']);
  });
  it('en route, le trajet se dessine DEPUIS le point de départ', () => {
    const m0 = world(['a'], ['b']);
    const m = transferGarrison(m0, {
      fromId: MINE,
      toId: FORGE,
      now: 0,
      playerLevel: L,
      champs: { ids: ['a'], at: 2 * H },
      militia: { ids: [], at: 0 },
    });
    const [trip] = reinforcementsEnRoute(m, H);
    const mine = pt(m0, MINE);
    expect(trip!.origin).toEqual({ x: mine.x, y: mine.y });
    // Au départ, il est sur la mine ; à mi-chemin, entre la mine et la forge.
    expect(travelPosition(trip!, 0)).toMatchObject({ x: mine.x, y: mine.y });
    const forge = pt(m0, FORGE);
    const mid = travelPosition(trip!, H);
    expect(mid.x).toBeCloseTo((mine.x + forge.x) / 2, 6);
    expect(mid.y).toBeCloseTo((mine.y + forge.y) / 2, 6);
    // Dessiné : il part du BORD du point de départ, pas de celui de la ville.
    const drawn = mapTravelPoint(travelPosition(trip!, 0), forge, trip!.origin);
    expect(Math.hypot(drawn.x - mine.x, drawn.y - mine.y)).toBeCloseTo(MAP_RIM.poi, 6);
  });
});

describe('⚔️ sortie depuis un point', () => {
  it('seuls les champions arrivés de la garnison peuvent sortir, jamais un milicien', () => {
    const m = world(['a', 'mil:1'], ['b']);
    expect(sortieBlocker(m, MINE, ['a'])).toBeNull();
    expect(sortieBlocker(m, MINE, ['mil:1'])).toBe('notHere');
    expect(sortieBlocker(m, MINE, ['b'])).toBe('notHere');
    expect(sortieBlocker(m, MINE, [])).toBe('empty');
    expect(sortieBlocker(world([]), MINE, ['a'])).toBe('notHeld');
    expect(garrisonChampionIds(m, MINE)).toEqual(['a']);
  });
  it('au retour, reprend son poste s’il y a de la place', () => {
    const m = world(['c']);
    const r = rejoinHome(m, MINE, ['a', 'b'], 5 * H);
    expect(r.back).toEqual(['a', 'b']);
    expect(r.out).toEqual([]);
    expect(pt(settleReinforcements(r.map, 5 * H, L), MINE).control!.garrison).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
  it('point perdu entre-temps : tout le monde rentre à la base', () => {
    const r = rejoinHome(world([]), MINE, ['a'], 5 * H);
    expect(r.back).toEqual([]);
    expect(r.out).toEqual(['a']);
  });
  it('places reprises entre-temps : ceux de trop rentrent à la base', () => {
    const full = Array.from({ length: seatsOf('mine') - 1 }, (_, i) => `g${i}`);
    const r = rejoinHome(world(full), MINE, ['a', 'b'], 5 * H);
    expect(r.back).toEqual(['a']);
    expect(r.out).toEqual(['b']);
  });
});
