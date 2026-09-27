// 🏴‍☠️ La caravane pillée se notifie à son apparition (v0.1225).
import { describe, expect, it } from 'vitest';
import { EXPE, advanceWorld, createMap, nextPlunderSpawn } from '@/lib/expedition';
import { planPushes } from '@/lib/push';

const H = 3600_000;

describe('🔔 la prochaine caravane pillée', () => {
  it('annonce EXACTEMENT celle que la carte fera apparaître', () => {
    let found = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const start = createMap(seed * 7919, 0, 30, 30);
      const next = nextPlunderSpawn(start, 0, 30, 30);
      if (!next) continue;
      found++;
      // On rejoue la carte telle que l'app le fera, heure par heure.
      let m = start;
      let seen: { id: string; at: number } | null = null;
      for (let t = H / 2; t <= 48 * H && !seen; t += H / 2) {
        m = advanceWorld(m, t, 30, 30);
        const p = m.pois.find((x) => x.type === 'plunder');
        if (p) seen = { id: p.id, at: p.spawnedAt };
      }
      expect(seen).toEqual(next);
    }
    // Sans ce compte, le test ne vérifierait rien.
    expect(found).toBeGreaterThan(3);
  });
  it('rien à annoncer si une caravane est déjà sur la carte', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let m = createMap(seed * 7919, 0, 30, 30);
      for (let t = H; t <= 72 * H; t += H) {
        m = advanceWorld(m, t, 30, 30);
        if (m.pois.some((p) => p.type === 'plunder')) {
          expect(nextPlunderSpawn(m, t, 30, 30)).toBeNull();
          return;
        }
      }
    }
    throw new Error('aucune caravane en 60 cartes');
  });
  it('la notification part à son apparition, avare, idempotente', () => {
    const base = {
      base: null,
      expedition: null,
      parties: [],
      watchtowerLevel: 0,
      activeDays7: 0,
      playerLevel: 30,
    };
    const plans = planPushes({ ...base, plunder: { id: 'poi_9', at: 5 * H } }, 0);
    const p = plans.find((x) => x.kind === 'plunder')!;
    expect(p.sendAt).toBe(5 * H);
    expect(p.dedupe).toBe('plunder:poi_9');
    expect(p.url).toBe('/expedition-map');
    expect(planPushes({ ...base, plunder: null }, 0).some((x) => x.kind === 'plunder')).toBe(false);
    // Jamais dans le passé.
    expect(planPushes({ ...base, plunder: { id: 'poi_9', at: 5 * H } }, 6 * H)).toEqual([]);
  });
  it('elle reste 8 h sur la carte', () => {
    expect(EXPE.lifespanMs.plunder).toBe(8 * H);
  });
});
