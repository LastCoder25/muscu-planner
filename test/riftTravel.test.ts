import { describe, it, expect } from 'vitest';
import {
  EXPE,
  createMap,
  advanceWorld,
  isQuotaPoi,
  isRiftPoi,
  poiTravelLevel,
  travelOneWayMin,
  type Poi,
} from '@/lib/expedition';
// 🗺️ Avant-poste 7 = l'ancienne carte fixe (rayon 64, 16 lieux + 6 failles) : ces tests
// éprouvent la MÉCANIQUE de la carte, pas sa taille (cf. `revealRadius`, v0.1040).
const OUT = 7;

// 🕳️ v0.1012 : le TRAJET d'une faille se calcule sur le niveau que sa DISTANCE justifie,
// pas sur son niveau (tiré par rang, v0.929). Avant, mesuré au niveau 60 : une faille
// mettait 30 à 34 % de temps en moins qu'un autre lieu au même endroit, et deux failles à
// la même distance variaient d'un facteur 2,15 — le trajet ne se lisait plus sur la carte.

const H = 3600_000;
const DAY = 24 * H;

/** Toutes les failles et tous les lieux de quota vus sur 14 jours de carte. */
function collect(seed: number, level: number) {
  const t0 = 1_700_000_000_000;
  let map = createMap(seed, t0, level, OUT);
  const seen = new Map<string, Poi>();
  for (let t = t0; t <= t0 + 14 * DAY; t += 6 * H) {
    map = advanceWorld(map, t, level, OUT);
    for (const p of map.pois) seen.set(p.id, p);
  }
  return [...seen.values()];
}

describe('🕳️ le trajet d’une faille se lit sur la carte', () => {
  it('tout lieu porte un niveau de trajet — depuis que le niveau ne suit plus la distance', () => {
    // v0.1013 : le niveau d'un lieu ordinaire est tiré au hasard, donc lui AUSSI a besoin
    // d'un niveau de trajet dérivé de sa distance (avant, seule la faille en portait un).
    const pois = collect(7, 60);
    const rifts = pois.filter(isRiftPoi);
    expect(rifts.length).toBeGreaterThan(3);
    for (const p of pois) expect(p.travelLevel, p.id).toBeTypeOf('number');
    for (const p of pois.filter(isQuotaPoi)) expect(p.travelLevel, p.id).toBeGreaterThanOrEqual(60);
  });
  it('sans niveau de trajet, on retombe sur le niveau du lieu (cartes d’avant)', () => {
    expect(poiTravelLevel({ level: 12 })).toBe(12);
    expect(poiTravelLevel({ level: 12, travelLevel: 30 })).toBe(30);
  });

  it('⚠️ à distance égale, une faille met AUTANT de temps qu’un autre lieu (±15 %)', () => {
    // On compare chaque faille au lieu ordinaire le plus proche en distance.
    for (const seed of [7, 11, 23]) {
      const pois = collect(seed, 60);
      const quota = pois.filter(isQuotaPoi);
      for (const r of pois.filter(isRiftPoi)) {
        const voisin = quota.reduce((a, b) =>
          Math.abs(b.distNorm - r.distNorm) < Math.abs(a.distNorm - r.distNorm) ? b : a,
        );
        if (Math.abs(voisin.distNorm - r.distNorm) > 0.03) continue;
        const tr = travelOneWayMin(poiTravelLevel(r), r.distNorm);
        const tv = travelOneWayMin(poiTravelLevel(voisin), voisin.distNorm);
        expect(tr / tv, `${r.id} ${tr} contre ${tv}`).toBeGreaterThan(0.85);
        expect(tr / tv, `${r.id} ${tr} contre ${tv}`).toBeLessThan(1.15);
      }
    }
  });

  it('la mine et la bande qu’elle laisse héritent du même niveau de trajet', () => {
    const faille: Poi = {
      id: 'r',
      type: 'rift',
      level: 5,
      travelLevel: 40,
      x: EXPE.town.x,
      y: EXPE.town.y + 30,
      distNorm: 0.3,
      spawnedAt: 0,
      expiresAt: EXPE.lifespanMs.rift,
    };
    const m = advanceWorld(
      {
        seed: 1,
        spawnCount: 99,
        nextSpawnAt: 9e15,
        riftCount: 99,
        nextRiftAt: 9e15,
        pois: [faille],
      },
      EXPE.lifespanMs.rift + H,
      60,
      OUT,
    );
    expect(m.pois.find((p) => p.type === 'mana_mine')?.travelLevel).toBe(40);
    expect(m.pois.find((p) => p.type === 'warband')?.travelLevel).toBe(40);
  });
});
