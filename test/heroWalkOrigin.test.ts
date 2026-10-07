// 🧭 Le héros envoyé d'un lieu fixe à un autre part de CE lieu (signalé : envoyé de l'Ossuaire
// aux Archives, la carte le faisait partir de la base).
import { describe, expect, it } from 'vitest';
import {
  islandControlSpots,
  loseControl,
  sendHeroToControl,
  walkHomeMs,
  walkPoint,
} from '@/lib/controlPoints';
import { routeFromSpot, legFromSpot } from '@/lib/controlRoutes';
import { EXPE, distNormAt, type ExpeditionMap, type Poi, type PostedHero } from '@/lib/expedition';
import { heroWalkVoyage, turnBackComingHero } from '@/lib/islandConquest';
import { refFighter } from '@/lib/proceduralContent';

const unit: PostedHero = { name: 'Toi', level: 30, combatant: refFighter(30) };
const H = 3600_000;
const spot = (kind: string) => {
  const s = islandControlSpots(2).find((c) => c.kind === kind)!;
  return { x: Math.round(s.x), y: Math.round(s.y) };
};
const place = (id: string, kind: 'ossuary' | 'archives'): Poi =>
  ({
    id,
    type: 'control',
    level: 30,
    ...spot(kind),
    distNorm: distNormAt(Math.hypot(spot(kind).x - EXPE.town.x, spot(kind).y - EXPE.town.y)),
    spawnedAt: 0,
    expiresAt: Infinity,
    control: { kind, owner: 'player', garrison: [], retakes: 0 },
  }) as unknown as Poi;
const oss = place('ctl_ossuary', 'ossuary');
const arc = place('ctl_archives', 'archives');
const map = { seed: 1, pois: [oss, arc], archipel: { island: 2 } } as unknown as ExpeditionMap;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('🧭 le héros d’un lieu fixe à un autre', () => {
  it('Ossuaire → Archives (île 2) : la ligne directe, plus courte que le détour par le port', () => {
    const legOf = (p: Poi) => p.distNorm * 100;
    const r = routeFromSpot(arc, oss, legOf);
    expect(r.direct).toBe(true);
    expect(r.min).toBe(legFromSpot(arc, oss, legOf));
    expect(r.min).toBeLessThan(legOf(oss) + legOf(arc));
  });

  it('le tracé part de l’Ossuaire, pas de la base', () => {
    const m = sendHeroToControl(map, arc.id, 0, 2 * H, unit, oss);
    const v = heroWalkVoyage(m, H)!;
    expect(v.origin).toEqual({ x: oss.x, y: oss.y });
    const mid = walkPoint(arc, m.pois[1]!.control!.heroComing!, H);
    expect(mid.x).toBeCloseTo((oss.x + arc.x) / 2);
    expect(mid.y).toBeCloseTo((oss.y + arc.y) / 2);
  });

  it('depuis la base, rien ne change : pas d’origine, demi-tour en autant qu’il a marché', () => {
    const m = sendHeroToControl(map, arc.id, 0, 2 * H, unit);
    expect(heroWalkVoyage(m, H)!.origin).toBeUndefined();
    const back = turnBackComingHero(m, H / 2);
    expect(back.heroReturnAt).toBe(H / 2 + H / 2);
  });

  it('demi-tour en route : il rentre à la base depuis là où il est, à son pas', () => {
    const m = sendHeroToControl(map, arc.id, 0, 2 * H, unit, oss);
    const back = turnBackComingHero(m, H);
    const at = { x: (oss.x + arc.x) / 2, y: (oss.y + arc.y) / 2 };
    expect(back.heroReturnFrom!.x).toBeCloseTo(at.x);
    expect(back.heroReturnFrom!.y).toBeCloseTo(at.y);
    const pace = (2 * H) / dist(oss, arc);
    expect(back.heroReturnAt).toBe(H + Math.round(pace * dist(at, EXPE.town)));
    expect(walkHomeMs(arc, m.pois[1]!.control!.heroComing!, H)).toBe(back.heroReturnAt! - H);
  });

  it('les Archives tombent pendant qu’il marche : même demi-tour, depuis sa vraie position', () => {
    const m = sendHeroToControl(map, arc.id, 0, 2 * H, unit, oss);
    const lost = loseControl(m, arc.id, 30, H);
    expect(lost.heroReturnFrom!.x).toBeCloseTo((oss.x + arc.x) / 2);
    expect(lost.heroReturnAt).toBe(turnBackComingHero(m, H).heroReturnAt);
  });
});
