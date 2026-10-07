import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, EXPE, type ExpeditionMap } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  ensureIslandConquest,
  NEST,
  nestSpot,
  nestThreshold,
  razeIslandTarget,
} from '@/lib/islandConquest';
import { islandCenter, onIsland } from '@/lib/islandShape';
import { islandTerrain } from '@/lib/islandTerrain';

/**
 * 🪺 LES NIDS NAISSENT PARTOUT SUR L'ÎLE 2 (demandé le 2026-10-07). Mesuré avant le correctif :
 * jamais dans le quart de l'île qui fait face à la forteresse, toujours aux mêmes places dans
 * le même ordre pour tous les joueurs, et PLUS AUCUN après le 26ᵉ (les nids abattus
 * continuaient de bloquer leur place).
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const LV = 30;

function islandMap(seed: number): ExpeditionMap {
  const m = createMap(seed, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(2));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}

/** Fait naître `max` nids (chacun abattu aussitôt, pour garder le plafond ouvert). */
function births(seed: number, max: number) {
  let m = islandMap(seed);
  let t = NOW + 1000;
  for (let r = 0; r < max; r++) {
    const before = (m.archipel!.nests ?? []).length;
    const k = nestThreshold(m.seed, before);
    const dep = Array.from({ length: k }, (_, i) => t + i * 1000);
    t += k * 1000 + 1000;
    m = ensureIslandConquest({ ...m, departures: [...(m.departures ?? []), ...dep] }, t, LV);
    const nn = m.archipel!.nests ?? [];
    if (nn.length === before) break;
    m = razeIslandTarget(m, `isl_obj_${nn[nn.length - 1]!.i}`, t);
  }
  return m.archipel!.nests ?? [];
}

describe('🪺 où naissent les nids de l’île 2', () => {
  it('ils ne s’épuisent jamais : 200 nids d’affilée trouvent une place (un abattu libère sa place)', () => {
    for (const seed of [1, 5, 9]) expect(births(seed, 200)).toHaveLength(200);
  });

  it('ils couvrent toute l’île : chaque huitième autour du centre en reçoit', () => {
    const c = islandCenter(2);
    const sectors = new Set<number>();
    for (const seed of [1, 5, 9, 13])
      for (const n of births(seed, 40)) {
        const a = Math.atan2(n.y - c.y, n.x - c.x);
        sectors.add(Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)));
      }
    expect([...sectors].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('toujours sur la terre, hors des abords du village et de la forteresse', () => {
    const f = islandTerrain(2).fortress;
    for (const n of births(5, 40)) {
      expect(onIsland(2, n.x, n.y)).toBe(true);
      expect(Math.hypot(n.x - EXPE.town.x, n.y - EXPE.town.y)).toBeGreaterThanOrEqual(
        NEST.villageClear,
      );
      expect(Math.hypot(n.x - f.x, n.y - f.y)).toBeGreaterThanOrEqual(NEST.minGap);
    }
  });

  it('deux joueurs ne voient pas la même suite de nids', () => {
    const a = births(1, 6).map((n) => `${n.x},${n.y}`);
    const b = births(5, 6).map((n) => `${n.x},${n.y}`);
    expect(a).not.toEqual(b);
  });

  it('même carte, même nid : le tirage est déterministe', () => {
    expect(births(9, 8)).toEqual(births(9, 8));
  });

  it('un nid debout bloque sa place, un nid abattu la libère', () => {
    const m = islandMap(5);
    const s = nestSpot(m, 2, [], m.seed, 0)!;
    // Avec ce nid debout, aucune autre naissance ne tombe à moins de minGap de lui.
    for (let n = 1; n < 40; n++) {
      const t = nestSpot(m, 2, [s], m.seed, n);
      if (t) expect(Math.hypot(t.x - s.x, t.y - s.y)).toBeGreaterThanOrEqual(NEST.minGap);
    }
    // Abattu (absent des nids debout), sa place redevient tirable.
    expect(nestSpot(m, 2, [], m.seed, 0)).toEqual(s);
  });
});
