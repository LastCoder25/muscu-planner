import { describe, it, expect } from 'vitest';
import { interceptLeg } from '@/lib/party';
import { EXPE, travelOneWayMin, warbandAt, type Poi } from '@/lib/expedition';

const T0 = 1_700_000_000_000;
const H = 3600_000;
const band = (over: Partial<Poi> = {}): Poi => ({
  id: 'r1_war',
  type: 'warband',
  level: 30,
  faction: 'betes',
  from: { x: EXPE.town.x + 60, y: EXPE.town.y - 20 },
  x: EXPE.town.x + 60,
  y: EXPE.town.y - 20,
  distNorm: 0.9,
  spawnedAt: T0,
  expiresAt: T0 + EXPE.lifespanMs.warband,
  ...over,
});
/** La règle de trajet du jeu : le héros vers un lieu de ce niveau à cette distance. */
const leg = (p: Poi) => travelOneWayMin(p.level, p.distNorm);
const dist = (p: Pick<Poi, 'x' | 'y'>) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);

describe('⚔️ interceptLeg — on va là où on CROISERA la bande', () => {
  it('les deux colonnes arrivent ENSEMBLE : le trajet tient en τ, pas une minute de moins', () => {
    const now = T0 + 2 * H;
    const r = interceptLeg(warbandAt(band(), now), now, leg);
    const at = (m: number) => warbandAt(band(), now + m * 60_000);
    expect(leg(at(r.legMin))).toBeLessThanOrEqual(r.legMin);
    expect(leg(at(r.legMin - 1))).toBeGreaterThan(r.legMin - 1);
    expect(r.poi.x).toBeCloseTo(at(r.legMin).x, 6);
  });

  it('le PREMIER instant où l’on se croise, sur tout un balayage de niveaux et d’heures', () => {
    for (const level of [5, 12, 30, 60, 90])
      for (let h = 0; h < 22; h += 3) {
        const now = T0 + h * H;
        const b = band({ level });
        const r = interceptLeg(warbandAt(b, now), now, leg);
        const at = (m: number) => warbandAt(b, now + m * 60_000);
        const tag = 'niv ' + level + ' h' + h;
        expect(leg(at(r.legMin)), tag).toBeLessThanOrEqual(r.legMin);
        if (r.legMin > 1) expect(leg(at(r.legMin - 1)), tag).toBeGreaterThan(r.legMin - 1);
      }
  });

  it('plus court que d’aller là où on l’a vue, et plus près de la ville', () => {
    const now = T0 + 2 * H;
    const seen = warbandAt(band(), now);
    const r = interceptLeg(seen, now, leg);
    expect(r.legMin).toBeLessThan(leg(seen));
    expect(dist(r.poi)).toBeLessThan(dist(seen));
  });

  it('la rencontre garde la bande : même id, même faction, sa faille d’origine', () => {
    const r = interceptLeg(band(), T0, leg);
    expect(r.poi.id).toBe('r1_war');
    expect(r.poi.faction).toBe('betes');
    expect(r.poi.from).toEqual(band().from);
  });

  it('trop lents pour la rejoindre : on la croise au pied des murs', () => {
    const now = T0;
    const r = interceptLeg(band(), now, () => 100_000);
    expect(dist(r.poi)).toBeCloseTo(0, 6);
    expect(r.legMin).toBe(100_000);
  });

  it('un lieu immobile ne change rien', () => {
    const camp = band({ type: 'camp', from: undefined });
    const r = interceptLeg(camp, T0, leg);
    expect(r.poi).toBe(camp);
    expect(r.legMin).toBe(leg(camp));
  });
});
