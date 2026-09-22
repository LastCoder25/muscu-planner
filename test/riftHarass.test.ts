import { describe, it, expect } from 'vitest';
import {
  EXPE,
  createMap,
  advanceWorld,
  isRiftPoi,
  irradiatedPoiIds,
  routePerilous,
  HARVEST_TYPES,
  type Poi,
  type RiftAmbush,
} from '@/lib/expedition';
import { ambushChance } from '@/lib/caravan';
// 🗺️ Avant-poste 7 = l'ancienne carte fixe (rayon 64, 16 lieux + 6 failles) : ces tests
// éprouvent la MÉCANIQUE de la carte, pas sa taille (cf. `revealRadius`, v0.1047).
const OUT = 7;

// 🐫 RÈGLE v0.1009 (demandée par l'utilisateur) : une faille qui MÛRIT ne harcèle rien. Au
// DÉBORDEMENT (7 j), une partie de ses monstres s'EMBUSQUE autour d'elle pendant 2 jours,
// l'autre marche sur la base. Ces tests réécrivent ceux de la v0.934 (harcèlement dès
// l'ouverture, rayon croissant) — ils décrivaient l'ancienne règle.

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
const ambush = (dx: number, dy: number, until: number): RiftAmbush => ({
  id: 'a',
  x: EXPE.town.x + dx,
  y: EXPE.town.y + dy,
  until,
});

describe('qui est harcelé', () => {
  it('⚠️ UNE FAILLE OUVERTE NE HARCÈLE RIEN, même à la veille de déborder', () => {
    const r = rift('r', 0, 0, 0);
    const colle = poi('a', 5, 0);
    expect(irradiatedPoiIds([r, colle], undefined, LIFE - 1).size).toBe(0);
    expect(irradiatedPoiIds([r, colle], [], LIFE - 1).size).toBe(0);
  });

  it('une embuscade EN COURS harcèle ce qui est dans son rayon, pas au-delà', () => {
    const dedans = poi('a', EXPE.irradMax - 1, 0);
    const dehors = poi('b', EXPE.irradMax + 1, 0);
    const set = irradiatedPoiIds([dedans, dehors], [ambush(0, 0, 100)], 50);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
  });

  it('une embuscade TERMINÉE ne harcèle plus rien', () => {
    expect(irradiatedPoiIds([poi('a', 1, 0)], [ambush(0, 0, 100)], 100).size).toBe(0);
  });

  it('ni une faille ni une bande en marche ne sont « harcelées » — on va s’y battre', () => {
    const pois = [rift('r', 1, 0, 0), poi('w', 2, 0, { type: 'warband' })];
    expect(irradiatedPoiIds(pois, [ambush(0, 0, 100)], 50).size).toBe(0);
  });
});

describe('le débordement pose une embuscade de deux jours', () => {
  const carte = (pois: Poi[]) => ({
    seed: 1,
    spawnCount: 99,
    nextSpawnAt: 9e15,
    riftCount: 99,
    nextRiftAt: 9e15,
    pois,
  });
  // La faille est à 30 de la ville ; la cible à 50, donc à 20 de la faille (dans le rayon).
  const faille = () => rift('r', 0, 30, 0);
  const cible = () => poi('a', 0, 50);

  it('avant le débordement : aucune embuscade, aucun drapeau', () => {
    const m = advanceWorld(carte([faille(), cible()]), LIFE - H, 20, OUT);
    expect(m.ambushes).toBeUndefined();
    expect(m.pois.find((p) => p.id === 'a')?.riftPeril).toBeUndefined();
  });

  it('au débordement : l’embuscade est posée À LA PLACE DE LA FAILLE, pour 2 jours', () => {
    const m = advanceWorld(carte([faille(), cible()]), LIFE + H, 20, OUT);
    expect(m.ambushes).toHaveLength(1);
    const a = m.ambushes![0]!;
    expect(a.x).toBe(EXPE.town.x);
    expect(a.y).toBe(EXPE.town.y + 30);
    // Datée du DÉBORDEMENT, pas de l'instant du calcul.
    expect(a.until).toBe(LIFE + EXPE.ambushMs);
    expect(m.pois.find((p) => p.id === 'a')?.riftPeril).toBe(true);
  });

  it('elle survit à la faille (devenue mine) puis s’ÉTEINT après ses deux jours', () => {
    const pendant = advanceWorld(carte([faille(), cible()]), LIFE + H, 20, OUT);
    const encore = advanceWorld(pendant, LIFE + EXPE.ambushMs - H, 20, OUT);
    expect(encore.pois.find((p) => p.id === 'a')?.riftPeril).toBe(true);
    const apres = advanceWorld(encore, LIFE + EXPE.ambushMs + H, 20, OUT);
    expect(apres.ambushes).toBeUndefined();
    expect(apres.pois.find((p) => p.id === 'a')?.riftPeril).toBeUndefined();
  });

  it('rejouer le passage ne DUPLIQUE pas l’embuscade', () => {
    const m1 = advanceWorld(carte([faille(), cible()]), LIFE + H, 20, OUT);
    const m2 = advanceWorld(m1, LIFE + 2 * H, 20, OUT);
    expect(m2.ambushes).toHaveLength(1);
  });

  it('une absence plus longue que l’embuscade ne la prolonge pas', () => {
    const m = advanceWorld(carte([faille(), cible()]), LIFE + EXPE.ambushMs + DAY, 20, OUT);
    expect(m.ambushes).toBeUndefined();
    expect(m.pois.find((p) => p.id === 'a')?.riftPeril).toBeUndefined();
  });

  it('N’ÉCRIT PAS À VIDE : sans embuscade, pas de clé `ambushes` et le POI garde sa référence', () => {
    const p = poi('b', 0, 60);
    const m = advanceWorld(carte([faille(), p]), LIFE - H, 20, OUT);
    expect('ambushes' in m).toBe(false);
    expect(m.pois.find((x) => x.id === 'b')).toBe(p);
  });
});

describe('ce que ça COÛTE', () => {
  it('routePerilous réunit les DEUX causes, et rien d’autre', () => {
    expect(routePerilous(poi('a', 0, 0))).toBe(false);
    expect(routePerilous(poi('a', 0, 0, { perilous: true }))).toBe(true);
    expect(routePerilous(poi('a', 0, 0, { riftPeril: true }))).toBe(true);
  });

  it('une route embusquée coûte AUTANT qu’une route dangereuse tirée au spawn', () => {
    const irr = poi('a', 0, 0, { riftPeril: true });
    const tire = poi('a', 0, 0, { perilous: true });
    const calme = poi('a', 0, 0);
    expect(ambushChance(irr, [])).toBe(ambushChance(tire, []));
    expect(ambushChance(irr, [])).toBeGreaterThan(ambushChance(calme, []));
  });
});

describe('le levier : refermer ses failles avant 7 jours empêche toute embuscade', () => {
  /** Part des lieux de RÉCOLTE harcelés sur 30 jours, selon ce qu'on ferme par jour. */
  function partIrradiee(perDay: number, seed: number): number {
    const t0 = 1_700_000_000_000;
    let map = createMap(seed, t0, 30, OUT);
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
      map = advanceWorld(map, t, 30, OUT);
      const rec = map.pois.filter((p) => HARVEST_TYPES.has(p.type) && !isRiftPoi(p));
      parts.push(rec.length ? rec.filter((p) => p.riftPeril).length / rec.length : 0);
    }
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }
  const moy = (perDay: number) =>
    [1, 2, 3, 4].reduce((a, s) => a + partIrradiee(perDay, s * 7919), 0) / 4;

  // MESURÉ (v0.1009, 30 j × 4 graines) : 0 fermeture/jour → 19,3 % des lieux de récolte
  // harcelés · 0,5/jour → 9,9 % · 1/jour → 0 % · 2/jour → 0 %. (Ancienne règle v0.934 :
  // 21 % · — · 14 % · 1 %.) Ignorer ses failles coûte à peu près autant qu'avant ; les tenir
  // ne coûte plus RIEN.
  it('on ne ferme rien → une part NETTE des routes de récolte est harcelée, jamais tout', () => {
    const p = moy(0);
    expect(p).toBeGreaterThan(0.1);
    expect(p).toBeLessThan(0.4);
  });

  it('⚠️ fermer 1 faille par jour suffit à n’avoir AUCUNE embuscade', () => {
    // Plus aucun débordement dès une fermeture par jour (v0.933), donc plus aucune embuscade :
    // le harcèlement n'est plus une taxe de fond, c'est la sanction d'une faille laissée
    // aller au bout.
    expect(moy(1)).toBe(0);
  });

  it('c’est bien un DÉGRADÉ : en fermer une sur deux jours coupe le harcèlement de moitié', () => {
    const rien = moy(0);
    const demi = moy(0.5);
    expect(demi).toBeGreaterThan(0);
    expect(demi).toBeLessThan(rien * 0.75);
  });

  it('il reste des lieux de récolte PROPRES même quand on ignore tout', () => {
    const t0 = 1_700_000_000_000;
    let map = createMap(4242, t0, 30, OUT);
    let creux = Infinity;
    for (let t = t0 + H; t <= t0 + 30 * DAY; t += H) {
      map = advanceWorld(map, t, 30, OUT);
      const rec = map.pois.filter((p) => HARVEST_TYPES.has(p.type) && !isRiftPoi(p));
      creux = Math.min(creux, rec.filter((p) => !p.riftPeril).length);
    }
    // Un choix, jamais une taxe : on n'est jamais acculé à n'avoir que des routes sales.
    expect(creux).toBeGreaterThan(0);
  });
});
