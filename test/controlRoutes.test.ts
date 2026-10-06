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
  transferSourcesFor,
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
const CAMP = controlIdOf('training');
const GARDEN = controlIdOf('garden');
const pt = (m: ExpeditionMap, id: string) => m.pois.find((p) => p.id === id)!;
const far = (m: ExpeditionMap) => ({
  ...m,
  pois: m.pois.map((p) => (p.control ? { ...p, control: { ...p.control, attackAt: 9e15 } } : p)),
});
/** La mine tenue par `mine`, le camp par `camp` (un tableau vide = point ennemi). */
const world = (mine: string[], camp: string[] = []) => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  if (mine.length) m = captureControl(m, MINE, mine, 0, 7);
  if (camp.length) m = captureControl(m, CAMP, camp, 0, 7);
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
    const camp = pt(m, CAMP);
    const direct = leg(fromSpot(camp, mine));
    const viaTown = leg(mine) + leg(camp);
    expect(direct).toBeLessThan(viaTown);
    expect(legFromSpot(camp, mine, leg)).toBe(direct);
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
    // Un champion ne part pas vers un lieu ennemi ; on ne part pas d'un lieu ennemi.
    expect(transferBlocker(world(['a']), MINE, CAMP, ['a'])).toBe('enemy');
    expect(transferBlocker(world([], ['b']), MINE, CAMP, ['b'])).toBe('notHeld');
    expect(transferBlocker(world(['a'], ['b']), MINE, MINE, ['a'])).toBe('same');
    expect(transferBlocker(world(['a'], ['b']), MINE, CAMP, [])).toBe('empty');
  });
  it('seuls les membres ARRIVÉS du point de départ peuvent partir', () => {
    const m = world(['a'], ['b']);
    expect(transferBlocker(m, MINE, CAMP, ['z'])).toBe('notHere');
    expect(transferBlocker(m, MINE, CAMP, ['a', 'a'])).toBe('notHere');
    expect(transferBlocker(m, MINE, CAMP, ['a'])).toBeNull();
  });
  it('refusé quand le point d’arrivée n’a plus de place de champion', () => {
    const full = Array.from({ length: seatsOf('training') }, (_, i) => `f${i}`);
    expect(transferBlocker(world(['a'], full), MINE, CAMP, ['a'])).toBe('full');
  });
  it('le transfert libère la place de départ et occupe celle d’arrivée tout de suite', () => {
    const m = transferGarrison(world(['a', 'c'], ['b']), {
      fromId: MINE,
      toId: CAMP,
      now: H,
      playerLevel: L,
      champs: { ids: ['a'], at: 3 * H },
      militia: { ids: [], at: H },
    });
    expect(pt(m, MINE).control!.garrison).toEqual(['c']);
    expect(pt(m, CAMP).control!.reinforcing).toEqual([{ id: 'a', at: 3 * H, from: H, via: MINE }]);
    // Il rejoint la garnison à son arrivée, comme un renfort de la base.
    expect(pt(settleReinforcements(m, 3 * H, L), CAMP).control!.garrison).toEqual(['b', 'a']);
  });
  it('en route, le trajet se dessine DEPUIS le point de départ', () => {
    const m0 = world(['a'], ['b']);
    const m = transferGarrison(m0, {
      fromId: MINE,
      toId: CAMP,
      now: 0,
      playerLevel: L,
      champs: { ids: ['a'], at: 2 * H },
      militia: { ids: [], at: 0 },
    });
    const [trip] = reinforcementsEnRoute(m, H);
    const mine = pt(m0, MINE);
    expect(trip!.origin).toEqual({ x: mine.x, y: mine.y });
    // Au départ, il est sur la mine ; à mi-chemin, entre la mine et le camp.
    expect(travelPosition(trip!, 0)).toMatchObject({ x: mine.x, y: mine.y });
    const camp = pt(m0, CAMP);
    const mid = travelPosition(trip!, H);
    expect(mid.x).toBeCloseTo((mine.x + camp.x) / 2, 6);
    expect(mid.y).toBeCloseTo((mine.y + camp.y) / 2, 6);
    // Dessiné : il part du BORD du point de départ, pas de celui de la ville.
    const drawn = mapTravelPoint(travelPosition(trip!, 0), camp, trip!.origin);
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

describe('⇄ transferSourcesFor : qui peut venir d’un autre point (2026-09-29)', () => {
  it('propose la garnison arrivée des AUTRES points tenus, pas celle du point visé', () => {
    const m = world(['a', 'mil:1'], ['b']);
    const src = transferSourcesFor(m, MINE);
    expect(src).toEqual([{ fromId: CAMP, ids: ['b'] }]);
    expect(transferSourcesFor(m, CAMP)).toEqual([{ fromId: MINE, ids: ['a', 'mil:1'] }]);
  });
  it('un renfort encore en route vers son point n’en repart pas', () => {
    const m = world(['a'], ['b']);
    const camp = pt(m, CAMP);
    const withRoute = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === CAMP
          ? { ...p, control: { ...camp.control!, reinforcing: [{ id: 'c', from: 0, at: 9e15 }] } }
          : p,
      ),
    };
    expect(transferSourcesFor(withRoute, MINE)).toEqual([{ fromId: CAMP, ids: ['b'] }]);
  });
  it('point visé plein : personne ne peut venir', () => {
    const full = Array.from({ length: seatsOf('mine') }, (_, i) => `x${i}`);
    const m = world(full, ['b']);
    expect(transferSourcesFor(m, MINE)).toEqual([]);
  });
  it('point visé pas à nous : personne', () => {
    const m = world([], ['b']);
    expect(transferSourcesFor(m, MINE)).toEqual([]);
    expect(transferSourcesFor(null, MINE)).toEqual([]);
  });
});

describe('🛡️⚔️ des miliciens d’un autre point vers un lieu ennemi', () => {
  // Signalé : « je n'ai pas pu faire venir les miliciens depuis le scriptorium, j'ai dû les
  // envoyer depuis la base ». Ils marchent à l'avance d'un point comme de la base.
  it('des miliciens d’un point tenu partent vers un lieu ennemi, pas un champion', () => {
    const m = world(['mil:1', 'a']);
    expect(transferBlocker(m, MINE, CAMP, ['mil:1'])).toBeNull();
    expect(transferBlocker(m, MINE, CAMP, ['mil:1', 'a'])).toBe('enemy');
    expect(transferSourcesFor(m, CAMP)).toEqual([{ fromId: MINE, ids: ['mil:1'] }]);
  });
  it('jamais vers un objectif, la forteresse ni la citadelle', () => {
    const m = world(['mil:1']);
    const raze = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === CAMP ? { ...p, control: { ...p.control!, kind: 'fortress' as const } } : p,
      ),
    };
    expect(transferBlocker(raze, MINE, CAMP, ['mil:1'])).toBe('notHeld');
  });
  it('ils marchent vers le lieu ennemi, puis font demi-tour s’il l’est encore', () => {
    const m = transferGarrison(world(['mil:1', 'a']), {
      fromId: MINE,
      toId: CAMP,
      now: H,
      playerLevel: L,
      champs: { ids: [], at: H },
      militia: { ids: ['mil:1'], at: 3 * H },
    });
    expect(pt(m, MINE).control!.garrison).toEqual(['a']);
    expect(pt(m, CAMP).control!.reinforcing).toEqual([
      { id: 'mil:1', at: 3 * H, from: H, via: MINE },
    ]);
    const back = settleReinforcements(m, 4 * H, L, () => 2 * H);
    expect(pt(back, CAMP).control!.returning?.map((r) => r.id)).toEqual(['mil:1']);
  });
});
