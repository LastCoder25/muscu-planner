import { describe, it, expect } from 'vitest';
import { CARAVAN, caravanLegMin, championOutpostMult, refAdventurer } from '@/lib/caravan';
import { partyLegMin } from '@/lib/party';
import { travelTimeMult, type Building } from '@/lib/buildings';
import { travelOneWayMin, type Poi } from '@/lib/expedition';

/**
 * 🧭 LES CHAMPIONS REÇOIVENT LA MOITIÉ DE L'AVANT-POSTE (v0.1047, demandé par l'utilisateur).
 * Jusque-là ils allaient au pas du héros SANS Avant-poste : dès qu'un champion accompagnait
 * le héros, la réduction de l'Avant-poste disparaissait (l'équipe va au pas du plus lent).
 * Le débit des camps et le puits d'or sont re-mesurés dans `campEconomy.test` / `goldSink.test`.
 */
const outpost = (level: number): Building[] => [
  { typeId: 'outpost', level, slot: 0, collectedAt: 0 },
];
const poi = (): Poi =>
  ({ id: 'p', type: 'camp', level: 30, distNorm: 0.5, x: 0, y: 0 }) as unknown as Poi;
const esc = () => [{ ...refAdventurer(30, 1), id: 'e' }];

describe('🧭 la part de l’Avant-poste des champions', () => {
  it('vaut exactement la moitié de la réduction du héros, à tout niveau', () => {
    expect(CARAVAN.outpostShare).toBe(0.5);
    for (const lvl of [0, 1, 10, 30, 40, 60, 100]) {
      const hero = travelTimeMult(outpost(lvl));
      expect(1 - championOutpostMult(hero), `Avant-poste ${lvl}`).toBeCloseTo((1 - hero) / 2, 10);
    }
  });

  it('est bornée : ni trajet négatif, ni ralentissement', () => {
    expect(championOutpostMult(1)).toBe(1);
    expect(championOutpostMult(1.5)).toBe(1);
    expect(championOutpostMult(-3)).toBe(1 - CARAVAN.outpostShare);
  });

  it('raccourcit vraiment le trajet d’une équipe de champions', () => {
    const p = poi();
    const m = travelTimeMult(outpost(30));
    const sans = caravanLegMin(p, esc(), 0, 1);
    const avec = caravanLegMin(p, esc(), 0, m);
    expect(avec).toBe(Math.round(travelOneWayMin(30, 0.5) * championOutpostMult(m)));
    expect(avec).toBeLessThan(sans);
  });

  it('⚠️ le héros garde plus que les champions : son équipe va au pas des champions', () => {
    const p = poi();
    const m = travelTimeMult(outpost(30));
    const seul = partyLegMin(p, [], { hero: true, travelMult: m, gearSpeed: 0 });
    const groupe = partyLegMin(p, esc(), { hero: true, travelMult: m, gearSpeed: 0 });
    const sansAP = partyLegMin(p, esc(), { hero: true, travelMult: 1, gearSpeed: 0 });
    expect(groupe).toBeGreaterThan(seul);
    expect(groupe).toBeLessThan(sansAP);
  });
});
