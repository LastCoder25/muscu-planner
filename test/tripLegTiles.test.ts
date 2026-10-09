import { describe, expect, it } from 'vitest';
import {
  ALL_LEGS,
  legPillOn,
  shownLegs,
  toggleLeg,
  tripLegTiles,
  type LegSource,
} from '@/lib/tripLegTiles';
import { tripLegs } from '@/lib/expedition';

const MIN = 60_000;
/** Un voyage RÉEL : départ à 10 min, arrivée à 40, fouille d'une heure (jusqu'à 100), retour à
 *  130 — les étapes viennent de `tripLegs`, la règle du jeu. */
const VOY = { sentAt: 10 * MIN, midAt: 100 * MIN, returnAt: 130 * MIN, dwellMs: 60 * MIN };
const trip = (now: number, o: Partial<LegSource> = {}): LegSource => ({
  key: 'g1',
  back: now >= VOY.midAt,
  time: 'IGNORÉ',
  total: 'TOTAL',
  pct: 30,
  legs: tripLegs(VOY, now),
  ...o,
});
const show = (now: number) =>
  tripLegTiles(trip(now)).map((t) => ({ leg: t.leg, time: t.time || t.total, future: t.future }));

describe('⏳→🔍↩ une tuile par étape, chacune son seul temps', () => {
  it('avant le départ : attente, aller, sur place, retour — l’attente décompte, les autres durent', () => {
    expect(show(0)).toEqual([
      { leg: 'wait', time: '⏳ 10 min', future: false },
      { leg: 'go', time: '→ 30 min', future: true },
      { leg: 'dwell', time: '🔍 1 h 00', future: true },
      { leg: 'back', time: '30 min', future: true },
    ]);
  });
  it('à l’aller : l’aller décompte, l’attente a disparu', () => {
    expect(show(25 * MIN)).toEqual([
      { leg: 'go', time: '→ 15 min', future: false },
      { leg: 'dwell', time: '🔍 1 h 00', future: true },
      { leg: 'back', time: '30 min', future: true },
    ]);
  });
  it('sur place puis sur le retour : il ne reste que les étapes à venir', () => {
    expect(show(70 * MIN)).toEqual([
      { leg: 'dwell', time: '🔍 30 min', future: false },
      { leg: 'back', time: '30 min', future: true },
    ]);
    expect(show(110 * MIN)).toEqual([{ leg: 'back', time: '20 min', future: false }]);
  });
  it('sans fouille, pas de tuile « sur place »', () => {
    const v = { sentAt: 0, midAt: 30 * MIN, returnAt: 60 * MIN };
    const tiles = tripLegTiles(trip(5 * MIN, { legs: tripLegs(v, 5 * MIN) }));
    expect(tiles.map((t) => t.leg)).toEqual(['go', 'back']);
  });
  it('⏱️ seul le temps de l’étape : jamais le total du voyage, jamais de sous-titre', () => {
    for (const t of tripLegTiles(trip(0))) {
      expect(t.line).toBeNull();
      expect(`${t.time} ${t.total ?? ''}`).not.toContain('TOTAL');
      expect(`${t.time} ${t.total ?? ''}`).not.toContain('IGNORÉ');
    }
  });
  it('chaque tuile se range à la fin de son étape, sous le même voyage', () => {
    const tiles = tripLegTiles(trip(0));
    expect(tiles.map((t) => t.at)).toEqual([10 * MIN, 40 * MIN, 100 * MIN, 130 * MIN]);
    expect(new Set(tiles.map((t) => t.tripKey))).toEqual(new Set(['g1']));
    expect(new Set(tiles.map((t) => t.key)).size).toBe(4);
  });
  it('avancement DANS l’étape en cours', () => {
    expect(tripLegTiles(trip(25 * MIN))[0]!.pct).toBe(50);
    expect(tripLegTiles(trip(25 * MIN))[1]!.pct).toBe(0);
  });
  it('🏰 assaut de point fixe : le retour garde ses deux durées « pris/raté »', () => {
    const v = { ...VOY, dwellMs: 0, returnLegs: { won: 20, lost: 60 } };
    const back = tripLegTiles(trip(20 * MIN, { legs: tripLegs(v, 20 * MIN) })).at(-1)!;
    expect(back.total).toBe('20 min/1 h 00');
  });

  it('mer, programmé, rappel, sans étapes : une seule tuile', () => {
    expect(tripLegTiles(trip(0, { legs: null }))).toMatchObject([{ leg: 'go', key: 'g1' }]);
    expect(tripLegTiles(trip(0, { legs: null, pending: true }))).toMatchObject([{ leg: 'wait' }]);
    expect(tripLegTiles(trip(0, { sea: { from: 1, to: 2 } }))).toMatchObject([{ leg: 'go' }]);
    expect(tripLegTiles(trip(0, { toBase: true }))).toMatchObject([{ leg: 'back', back: true }]);
  });
});

describe('🔎 filtre des étapes', () => {
  it('les deux affichées : toucher ISOLE ; retoucher l’étape allumée retire le filtre', () => {
    const both = ['go', 'back'] as const;
    expect([...both].filter((l) => legPillOn(ALL_LEGS, l, both))).toEqual([]);
    const a = toggleLeg(ALL_LEGS, 'go', both);
    expect([...a]).toEqual(['go']);
    expect([...both].filter((l) => legPillOn(a, l, both))).toEqual(['go']);
    expect([...toggleLeg(a, 'go', both)].sort()).toEqual(['back', 'go']);
    expect([...toggleLeg(a, 'back', both)].sort()).toEqual(['back', 'go']);
  });
  it('une étape choisie qui se vide retombe sur tout, une rangée vidée reste vide', () => {
    expect([...shownLegs(new Set(['go']), ['back'])]).toEqual(['back']);
    expect(shownLegs(new Set(), ['go', 'back']).size).toBe(0);
    expect([...shownLegs(new Set(['back']), ['go', 'back'])]).toEqual(['back']);
  });
});
