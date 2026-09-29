import { describe, expect, it } from 'vitest';
import {
  EXPE,
  VEIN_MAX_CHAMPIONS,
  advanceWorld,
  createMap,
  dwellMsFor,
  harvestGuardOf,
  harvestYield,
  veinDwellMs,
  type Poi,
} from '@/lib/expedition';
import { riftClearMana } from '@/lib/rift';
import { partyCapFor, partyHeroBlocker, partySendBlocker, startParty } from '@/lib/party';
import { poiOffers, refChampionAdv } from '@/lib/caravan';
import { resolveHarvestParty } from '@/lib/harvestParty';
import type { ExpeditionOutcome } from '@/lib/expedition';

const H = 3600_000;
const vein = (level = 30): Poi =>
  ({
    id: 'poi_1_7',
    type: 'vein',
    level,
    travelLevel: level,
    x: 120,
    y: 100,
    distNorm: 0.4,
    spawnedAt: 0,
    expiresAt: EXPE.lifespanMs.vein,
  }) as Poi;

describe('💎 le filon éphémère', () => {
  it('plus il y a de champions, plus l’extraction va vite : 6 h, 3 h, 2 h', () => {
    expect(veinDwellMs(1)).toBe(6 * H);
    expect(veinDwellMs(2)).toBe(3 * H);
    expect(veinDwellMs(3)).toBe(2 * H);
    // Bornes : au moins un champion, jamais plus de trois.
    expect(veinDwellMs(0)).toBe(6 * H);
    expect(veinDwellMs(5)).toBe(2 * H);
    expect(dwellMsFor(vein(), 2)).toBe(3 * H);
    // Les autres lieux ne changent pas : la fouille des ruines reste d'une heure.
    expect(dwellMsFor({ type: 'fallen' }, 3)).toBe(dwellMsFor({ type: 'fallen' }, 1));
    expect(dwellMsFor({ type: 'mine' }, 3)).toBe(0);
  });

  it('le voyage d’une équipe reste sur place le temps de l’extraction', () => {
    const out = { win: true } as ExpeditionOutcome;
    const t = (n: number) => {
      const v = startParty({ poi: vein(), hero: null, seed: 7, champions: n }, 0, 60, out);
      return { stay: v.dwellMs ?? 0, back: v.returnAt };
    };
    expect(t(1).stay).toBe(6 * H);
    expect(t(3).stay).toBe(2 * H);
    expect(t(1).back - t(3).back).toBe(4 * H);
  });

  it('sa réserve vaut 40 à 80 % d’une faille refermée, et bien plus qu’une mine de mana', () => {
    for (const L of [5, 12, 30, 60, 100]) {
      const m = harvestYield('vein', L).mana;
      const r = m / riftClearMana({ level: L });
      expect(r).toBeGreaterThan(0.4);
      expect(r).toBeLessThan(0.8);
      expect(m).toBeGreaterThan(2 * harvestYield('mana_mine', L).mana);
    }
  });

  it('1 à 3 champions, jamais le héros', () => {
    const p = vein();
    const send = (n: number, hero = false) => partySendBlocker(p, n, hero, 20, null);
    expect(send(1)).toBeNull();
    expect(send(3)).toBeNull();
    expect(send(4)).toBe('veinFull');
    expect(send(2, true)).toBe('veinHero');
    expect(partyCapFor(20, p)).toBe(VEIN_MAX_CHAMPIONS);
    expect(partyHeroBlocker({ onExpedition: false, healMs: 0, outpost: true, poi: p })).toBe(
      'vein',
    );
    expect(
      partyHeroBlocker({ onExpedition: false, healMs: 0, outpost: true, poi: { type: 'mine' } }),
    ).toBeNull();
    const offers = poiOffers(p, {
      heroAway: false,
      comptoirLevel: 0,
      advsAvailable: 2,
    });
    expect(offers.hero).toBe(false);
    expect(offers.party).toBe(true);
  });

  it('aucun garde : on revient toujours avec du mana', () => {
    expect(harvestGuardOf(vein())).toBeNull();
    for (const n of [1, 2, 3]) {
      const escort = Array.from({ length: n }, (_, i) => ({
        ...refChampionAdv(30, i),
        id: `a${i}`,
      }));
      const o = resolveHarvestParty({
        poi: vein(),
        escort,
        road: { advGear: [] },
        hero: null,
        seed: 11,
        playerLevel: 30,
        pantheonLevel: 30,
      });
      expect(o.mana).toBeGreaterThan(0);
    }
  });

  it('rare, un à la fois, et éphémère', () => {
    let seen = 0;
    let days = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let m = createMap(seed, 0, 30, 5);
      const ids = new Set<string>();
      for (let t = 0; t <= 14 * 24 * H; t += H) {
        m = advanceWorld(m, t, 30, 5);
        const vs = m.pois.filter((p) => p.type === 'vein');
        expect(vs.length).toBeLessThanOrEqual(1);
        for (const v of vs) {
          ids.add(v.id);
          expect(v.expiresAt - v.spawnedAt).toBe(EXPE.lifespanMs.vein);
        }
      }
      seen += ids.size;
      days += 14;
    }
    const perDay = seen / days;
    // Mesuré : ~0,3 filon par jour.
    expect(perDay).toBeGreaterThan(0.15);
    expect(perDay).toBeLessThan(0.8);
  }, 60_000);
});
