// 🏝️🗼 LA DÉTECTION SUR UNE ÎLE (décision de l'utilisateur, 2026-10-04) : la Tour de guet voit
// toute une île quand elle atteint le niveau max de l'île ; tout lieu tenu (base comprise) voit
// à DETECT_FLOOR autour de lui, et la carte dessine ces cercles.
import { describe, expect, it } from 'vitest';
import {
  DETECT_FLOOR,
  detectionCircles,
  islandDetectRadius,
  islandDetectShare,
  islandPerception,
  retakeArmyPoi,
} from '@/lib/fieldArmy';
import { EXPE, type Poi } from '@/lib/expedition';
import { islandSpan } from '@/lib/islandShape';

const H = 3_600_000;
const T = EXPE.town;
const at = 100 * H;
const held = (id: string, x: number, y: number, owner: 'player' | 'enemy' = 'player'): Poi => ({
  id,
  type: 'control',
  level: 30,
  x,
  y,
  distNorm: 0.3,
  spawnedAt: 0,
  expiresAt: 9e15,
  control: {
    kind: 'mine',
    owner,
    faction: 'bandits',
    size: 2,
    garrison: [],
    retakes: 1,
    attackAt: at,
  },
});

describe('🗼 la part de l’île vue par la Tour', () => {
  it('totale au niveau max de l’île, proportionnelle en dessous', () => {
    expect(islandDetectShare(40, 2, 0)).toBe(1);
    expect(islandDetectShare(20, 2, 0)).toBeCloseTo(0.5, 9);
    expect(islandDetectShare(40, 3, 0)).toBeCloseTo(40 / 60, 9);
    expect(islandDetectShare(60, 3, 0)).toBe(1);
    expect(islandDetectShare(100, 3, 0)).toBe(1);
  });
  it('les Tours tenues sur la carte la multiplient', () => {
    expect(islandDetectShare(30, 3, 0.5)).toBeCloseTo(45 / 60, 9);
  });
  it('le rayon couvre toute l’île au plein, jamais sous le plancher', () => {
    expect(islandDetectRadius(40, 2, 0)).toBeCloseTo(islandSpan(2), 9);
    expect(islandDetectRadius(0, 2, 0)).toBe(DETECT_FLOOR);
    expect(islandDetectRadius(20, 2, 0)).toBeCloseTo(Math.max(DETECT_FLOOR, islandSpan(2) / 2), 9);
  });
  it('les paliers : une ligne par île, l’île active marquée', () => {
    const rows = islandPerception(40, 0, 2);
    expect(rows.map((r) => r.fullAt)).toEqual([20, 40, 60, 80, 100]);
    expect(rows[1]).toMatchObject({ id: 2, share: 1, current: true });
    expect(rows[2]!.share).toBeCloseTo(2 / 3, 9);
    expect(rows.filter((r) => r.current)).toHaveLength(1);
  });
});

describe('👁️ les cercles de détection', () => {
  it('la base (jamais sous le plancher) et chaque lieu TENU, pas ceux de l’ennemi', () => {
    const c = detectionCircles(
      {
        pois: [
          held('a', T.x + 40, T.y),
          held('b', T.x, T.y + 40, 'enemy'),
          held('port', T.x, T.y), // posé sur la ville : le cercle de la base le couvre
        ],
      },
      10,
      200,
    );
    expect(c.map((k) => k.id)).toEqual(['base', 'a']);
    expect(c[0]!.r).toBe(DETECT_FLOOR);
    expect(c[1]!.r).toBe(DETECT_FLOOR);
  });
  it('le cercle de la base reste dans la zone révélée', () => {
    expect(detectionCircles({ pois: [] }, 500, 90)[0]!.r).toBe(89);
  });
  it('un autre lieu tenu sur le trajet voit l’armée plus tôt', () => {
    const p = held('p', T.x + 80, T.y);
    const cit = { x: T.x + 200, y: T.y };
    const guard = { id: 'g', x: T.x + 130, y: T.y, r: DETECT_FLOOR };
    const base = { id: 'base', x: T.x, y: T.y, r: DETECT_FLOOR };
    // Sans le lieu « g » : vue à 30 du point → 3 h. Avec : vue à 160 de la ville (130 + 30) → 8 h.
    const seul = retakeArmyPoi(p, { seed: 1 }, [base], 200, at - 4.9 * H, 30, cit);
    expect(seul).toBeNull();
    const avec = retakeArmyPoi(p, { seed: 1 }, [base, guard], 200, at - 4.9 * H, 30, cit)!;
    expect(Math.hypot(avec.from!.x - p.x, avec.from!.y - p.y)).toBeCloseTo(80, 6);
  });
  it('quel que soit l’ordre des cercles, c’est la PREMIÈRE entrée qui compte', () => {
    const p = held('p', T.x + 80, T.y);
    const cit = { x: T.x + 200, y: T.y };
    const big = { id: 'base', x: T.x, y: T.y, r: 90 };
    const guard = { id: 'g', x: T.x + 130, y: T.y, r: DETECT_FLOOR };
    const a = retakeArmyPoi(p, { seed: 1 }, [big, guard], 200, at - H, 30, cit)!;
    expect(Math.hypot(a.from!.x - p.x, a.from!.y - p.y)).toBeCloseTo(80, 6);
  });
});
