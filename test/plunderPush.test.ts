// 🏴‍☠️ La caravane pillée se notifie à son apparition (v0.1225).
import { describe, expect, it } from 'vitest';
import {
  EXPE,
  advanceWorld,
  createMap,
  nextPlunderSpawn,
  type ExpeditionMap,
} from '@/lib/expedition';
import {
  ISLAND_OUTPOST_LEVEL,
  archipelOn,
  mapOutpostLevel,
  mapPlayerLevel,
  plunderForecast,
} from '@/lib/archipelago';
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
  // 🏝️ Signalé (2026-10-04) : sur une île, les notifications annonçaient des caravanes qui
  // n'apparaissaient jamais — la prévision ne jouait pas la carte avec les réglages de l'île.
  it('sur une île, annonce EXACTEMENT celle que le jeu fera apparaître', () => {
    const LV = 60; // au-dessus du plafond de l'île 2 (40) : c'est là que tout divergeait
    const OUTPOST = 30; // le vrai Avant-poste, plus grand que la taille de l'île
    let found = 0;
    let naiveWrong = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const start: ExpeditionMap = {
        ...createMap(
          seed * 7919,
          0,
          mapPlayerLevel({ archipel: archipelOn(2) }, LV),
          ISLAND_OUTPOST_LEVEL,
        ),
        archipel: archipelOn(2),
      };
      // Déjà une caravane sur la carte : rien à annoncer (testé plus bas).
      if (start.pois.some((p) => p.type === 'plunder')) continue;
      const next = plunderForecast(start, 0, LV, OUTPOST);
      // Ce que l'ancien appel annonçait (niveau du héros, vrai Avant-poste).
      const naive = nextPlunderSpawn(start, 0, LV, OUTPOST);
      // Le jeu : la carte avance avec les réglages de l'île (`expeSyncMap`).
      let m = start;
      let seen: { id: string; at: number } | null = null;
      for (let t = H / 2; t <= 48 * H && !seen; t += H / 2) {
        m = advanceWorld(m, t, mapPlayerLevel(m, LV), mapOutpostLevel(m, OUTPOST));
        const p = m.pois.find((x) => x.type === 'plunder');
        if (p) seen = { id: p.id, at: p.spawnedAt };
      }
      expect(next).toEqual(seen);
      if (seen) found++;
      if (JSON.stringify(naive) !== JSON.stringify(seen)) naiveWrong++;
    }
    expect(found).toBeGreaterThan(2);
    // Sans ce compte, le test ne prouverait pas qu'il mord sur le défaut signalé.
    expect(naiveWrong).toBeGreaterThan(0);
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
      controls: [],
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
