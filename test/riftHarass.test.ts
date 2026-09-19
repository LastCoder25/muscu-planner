import { describe, it, expect } from 'vitest';
import {
  EXPE,
  createMap,
  advanceWorld,
  isRiftPoi,
  irradiatedPoiIds,
  riftIrradiationRadius,
  routePerilous,
  HARVEST_TYPES,
  type Poi,
} from '@/lib/expedition';
import { ambushChance } from '@/lib/caravan';

const H = 3600_000;
const DAY = 24 * H;
const LIFE = EXPE.lifespanMs.rift;

/** ⚠️ Coordonnées RELATIVES À LA VILLE (elle est au centre, pas à l'origine) et niveau 1 :
 *  `advanceWorld` écarte ce qui sort de la terre ferme ou dont le niveau ne colle pas à la
 *  distance. Un POI posé en (0,0) serait simplement filtré, et le test mesurerait un vide. */
const poi = (id: string, dx: number, dy: number, extra: Partial<Poi> = {}): Poi => ({
  id,
  type: 'well',
  level: 1,
  x: EXPE.town.x + dx,
  y: EXPE.town.y + dy,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...extra,
});
const rift = (id: string, x: number, y: number, spawnedAt: number): Poi =>
  poi(id, x, y, { type: 'rift', spawnedAt });

describe('rayon d’irradiation', () => {
  it('part de l’ESPACEMENT DE LA CARTE et grandit jusqu’à irradMax', () => {
    expect(riftIrradiationRadius(0, 0)).toBeCloseTo(EXPE.minDistPoi, 6);
    expect(riftIrradiationRadius(0, LIFE)).toBeCloseTo(EXPE.irradMax, 6);
    // Plafonné : une faille ne mûrit pas au-delà de son débordement.
    expect(riftIrradiationRadius(0, LIFE * 3)).toBeCloseTo(EXPE.irradMax, 6);
  });

  it('a un plancher DÉRIVÉ de minDistPoi — en dessous, il ne toucherait rien', () => {
    // La propriété structurelle : le plancher N'EST PAS un nombre écrit à la main. Une
    // faille neuve ne peut atteindre que ce qui est au strict minimum d'écart.
    expect(riftIrradiationRadius(0, 0)).toBe(EXPE.minDistPoi);
    expect(riftIrradiationRadius(0, 0)).toBeLessThan(EXPE.irradMax);
  });

  it('CROÎT de façon accélérée : à mi-vie, loin d’être à mi-rayon', () => {
    const mid = riftIrradiationRadius(0, LIFE / 2);
    const plat = EXPE.minDistPoi + (EXPE.irradMax - EXPE.minDistPoi) / 2;
    expect(mid).toBeLessThan(plat);
    let prev = -1;
    for (let k = 0; k <= 10; k++) {
      const r = riftIrradiationRadius(0, (LIFE * k) / 10);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe('qui est harcelé', () => {
  it('irradie ce qui est DANS le rayon, pas au-delà', () => {
    const r = rift('r', 0, 0, 0);
    const dedans = poi('a', EXPE.irradMax - 1, 0);
    const dehors = poi('b', EXPE.irradMax + 1, 0);
    const set = irradiatedPoiIds([r, dedans, dehors], LIFE);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
  });

  it('une faille N’IRRADIE NI ELLE-MÊME NI SES SŒURS', () => {
    const a = rift('r1', 0, 0, 0);
    const b = rift('r2', 2, 0, 0);
    expect(irradiatedPoiIds([a, b], LIFE).size).toBe(0);
  });

  it('une faille JEUNE ne harcèle quasiment rien, une MÛRE beaucoup', () => {
    const cible = poi('a', 20, 0);
    const at = (age: number) => irradiatedPoiIds([rift('r', 0, 0, 0), cible], age);
    expect(at(0).has('a')).toBe(false); // rayon 14 < 20
    expect(at(LIFE).has('a')).toBe(true); // rayon 25 > 20
  });

  it('sans aucune faille, personne n’est harcelé', () => {
    expect(irradiatedPoiIds([poi('a', 1, 1), poi('b', 2, 2)], LIFE).size).toBe(0);
  });
});

describe('le drapeau vit et s’éteint', () => {
  const carte = (pois: Poi[]) => ({
    seed: 1,
    spawnCount: 99,
    nextSpawnAt: 9e15,
    riftCount: 99,
    nextRiftAt: 9e15,
    pois,
  });

  // La faille est à 30 de la ville ; la cible à 50, donc à 20 de la faille (dans le rayon
  // d'une faille mûre, 25). Le témoin est à 60 de la ville, donc à 30 de la faille : dehors.
  const faille = () => rift('r', 0, 30, 0);
  const cible = () => poi('a', 0, 50);
  const loin = () => poi('b', 0, 60);

  it('advanceWorld POSE le drapeau sur ce qui est à portée', () => {
    const m = advanceWorld(carte([faille(), cible(), loin()]), LIFE - H, 20);
    expect(m.pois.find((p) => p.id === 'a')?.riftPeril).toBe(true);
    expect(m.pois.find((p) => p.id === 'b')?.riftPeril).toBeUndefined();
  });

  it('…et l’ÉTEINT quand la faille disparaît — sinon refermer ne se verrait jamais', () => {
    const avec = advanceWorld(carte([faille(), cible()]), LIFE - H, 20);
    const marque = avec.pois.find((p) => p.id === 'a')!;
    expect(marque.riftPeril).toBe(true);
    const apres = advanceWorld(carte([marque]), LIFE - H, 20);
    expect(apres.pois.find((p) => p.id === 'a')?.riftPeril).toBeUndefined();
  });

  it('N’ÉCRIT PAS À VIDE : un POI dont le drapeau ne change pas garde sa RÉFÉRENCE', () => {
    // Sans ça, la carte différerait à chaque tick et serait persistée toutes les secondes.
    const p = loin();
    const m = advanceWorld(carte([faille(), p]), LIFE - H, 20);
    expect(m.pois.find((x) => x.id === 'b')).toBe(p);
  });
});

describe('ce que ça COÛTE', () => {
  it('routePerilous réunit les DEUX causes, et rien d’autre', () => {
    expect(routePerilous(poi('a', 0, 0))).toBe(false);
    expect(routePerilous(poi('a', 0, 0, { perilous: true }))).toBe(true);
    expect(routePerilous(poi('a', 0, 0, { riftPeril: true }))).toBe(true);
  });

  it('une route irradiée coûte AUTANT qu’une route dangereuse tirée au spawn', () => {
    const irr = poi('a', 0, 0, { riftPeril: true });
    const tire = poi('a', 0, 0, { perilous: true });
    const calme = poi('a', 0, 0);
    expect(ambushChance(irr, [])).toBe(ambushChance(tire, []));
    expect(ambushChance(irr, [])).toBeGreaterThan(ambushChance(calme, []));
  });
});

describe('le levier : tenir le rythme garde les routes propres', () => {
  /** Part des lieux de RÉCOLTE harcelés sur 30 jours, selon ce qu'on ferme par jour. */
  function partIrradiee(perDay: number, seed: number): number {
    const t0 = 1_700_000_000_000;
    let map = createMap(seed, t0, 30);
    let budget = 0;
    const parts: number[] = [];
    for (let t = t0 + H; t <= t0 + 30 * DAY; t += H) {
      budget += perDay * (H / DAY);
      while (budget >= 1) {
        const rs = map.pois.filter(isRiftPoi).sort((a, b) => a.spawnedAt - b.spawnedAt);
        if (!rs.length) break;
        map = { ...map, pois: map.pois.filter((p) => p.id !== rs[0]!.id) };
        budget -= 1;
      }
      map = advanceWorld(map, t, 30);
      const rec = map.pois.filter((p) => HARVEST_TYPES.has(p.type) && !isRiftPoi(p));
      parts.push(rec.length ? rec.filter((p) => p.riftPeril).length / rec.length : 0);
    }
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }
  const moy = (perDay: number) =>
    [1, 2, 3, 4].reduce((a, s) => a + partIrradiee(perDay, s * 7919), 0) / 4;

  it('on ne ferme rien → une part NETTE des routes de récolte est harcelée', () => {
    const p = moy(0);
    expect(p).toBeGreaterThan(0.1);
    // …mais jamais au point de tout couvrir : il reste toujours des routes propres.
    expect(p).toBeLessThan(0.4);
  });

  it('⚠️ LA FALAISE EST AU RYTHME DE SPAWN : fermer 2/jour ramène le harcèlement à ~rien', () => {
    expect(moy(2)).toBeLessThan(0.05);
    // Et c'est bien un ÉCART, pas un plancher : ignorer coûte nettement plus cher.
    expect(moy(0)).toBeGreaterThan(moy(2) * 3);
  });

  it('il reste des lieux de récolte PROPRES même quand on ignore tout', () => {
    const t0 = 1_700_000_000_000;
    let map = createMap(4242, t0, 30);
    let creux = Infinity;
    for (let t = t0 + H; t <= t0 + 30 * DAY; t += H) {
      map = advanceWorld(map, t, 30);
      const rec = map.pois.filter((p) => HARVEST_TYPES.has(p.type) && !isRiftPoi(p));
      creux = Math.min(creux, rec.filter((p) => !p.riftPeril).length);
    }
    // Un choix, jamais une taxe : on n'est jamais acculé à n'avoir que des routes sales.
    expect(creux).toBeGreaterThan(0);
  });
});
