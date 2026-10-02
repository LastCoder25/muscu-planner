import { describe, expect, it } from 'vitest';
import { ISLANDS, ISLAND_OUTPOST_LEVEL, archipelOn } from '@/lib/archipelago';
import { advanceWorld, createMap, revealRadius, type ExpeditionMap } from '@/lib/expedition';
import { captureControl, controlIdOf, ensureControls, isCitadel } from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { syncFieldArmies } from '@/lib/fieldArmy';
import { onIsland } from '@/lib/islandTerrain';
import { rollRaid } from '@/lib/raid';

/**
 * 🏝️ ÉTAPE 2 BIS (demandée le 2026-10-02) : sur une île, AUCUN lieu n'apparaît hors de la côte —
 * lieux tirés, points fixes, objectifs, forteresse, failles, bandes et armées en marche. Le test
 * joue dix jours de carte sur les cinq îles et regarde chaque lieu à chaque tick.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
/** Marge en unités : le glyphe d'un lieu doit tenir sur la terre, pas seulement son centre. */
const GLYPH = 3;
const OUT = ISLAND_OUTPOST_LEVEL;

function tick(m: ExpeditionMap, t: number, L: number, raid: ReturnType<typeof rollRaid>) {
  return syncFieldArmies(
    ensureIslandConquest(ensureControls(advanceWorld(m, t, L, OUT), t, L, OUT), t, L),
    { raid, detectR: 500, reach: revealRadius(OUT), now: t, playerLevel: L },
  );
}

describe('🏝️ les îles sont bien délimitées', () => {
  for (const isl of ISLANDS)
    it(`île ${isl.id} : rien ne tombe à la mer pendant dix jours`, () => {
      const L = isl.maxLevel;
      for (const seed of [1, 7, 42]) {
        let m = ensureIslandConquest(
          ensureControls(createMap(seed, NOW, L, OUT, undefined, archipelOn(isl.id)), NOW, L, OUT),
          NOW,
          L,
        );
        // Un point tenu, pour que des armées de reprise marchent vers lui.
        m = captureControl(m, controlIdOf('mine'), ['a', 'b', 'c'], NOW, 7);
        const raid = rollRaid(seed, L, NOW + 5 * 24 * H, 8 * H);
        let seenArmy = false;
        for (let t = NOW; t <= NOW + 10 * 24 * H; t += 3 * H) {
          m = tick(m, t, L, raid);
          for (const p of m.pois) {
            if (p.army) seenArmy = true;
            expect(
              onIsland(isl.id, p.x, p.y, GLYPH),
              `île ${isl.id} · ${p.id} (${p.type}) en ${p.x},${p.y}`,
            ).toBe(true);
          }
        }
        // Le balayage a bien vu des armées en marche, pas seulement des lieux immobiles.
        expect(seenArmy).toBe(true);
      }
    });

  it('une carte qui bascule sur une île perd ses citadelles (posées au-delà de la côte)', () => {
    const plain = ensureControls(createMap(7, NOW, 30, 40), NOW, 30, 40);
    expect(plain.pois.some(isCitadel)).toBe(true);
    const isl = ensureControls({ ...plain, archipel: archipelOn(1) }, NOW, 20, OUT);
    expect(isl.pois.some(isCitadel)).toBe(false);
  });
});
