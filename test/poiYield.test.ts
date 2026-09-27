import { describe, it, expect } from 'vitest';
import { poiHaulPreview, hourlyRates, formatRates } from '@/lib/poiYield';
import {
  harvestGold,
  harvestYield,
  heroRewardLevel,
  poiForceOf,
  type Poi,
  type PoiType,
} from '@/lib/expedition';
import { forceLootPreview } from '@/lib/camp';
import { CARAVAN } from '@/lib/caravan';
import { riftClearMana } from '@/lib/rift';

const poi = (type: PoiType, id = 'p1', level = 30): Poi =>
  ({ id, type, level, x: 120, y: 100, distNorm: 0.5, spawnedAt: 0, expiresAt: 1e12 }) as Poi;

describe('poiHaulPreview : la récolte elle-même, jamais une seconde échelle', () => {
  it('une mine = son filon + les bourses de ses gardes', () => {
    // ⚠️ Une mine gardée par des BANDITS (les seuls qui portent une bourse) : au hasard, les
    // gardes pouvaient être des bêtes, et oublier les bourses passait au vert.
    let p = poi('mine');
    for (let i = 0; poiForceOf(p)?.faction !== 'bandits'; i++) p = poi('mine', 'm' + i);
    const force = poiForceOf(p);
    const loot = force ? forceLootPreview(p, force).gold : 0;
    expect(loot).toBeGreaterThan(0);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: true }).gold).toBe(
      harvestGold(p, 30) + loot,
    );
  });
  it('une source : pleine avec le héros, à la part d’équipe sans lui', () => {
    const p = poi('well');
    const plein = harvestYield('well', heroRewardLevel(p, 30), poiForceOf(p)?.size ?? 0).energy;
    expect(plein).toBeGreaterThan(0);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: true }).energy).toBe(plein);
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: false }).energy).toBe(
      Math.round(plein * CARAVAN.energyShare),
    );
  });
  it('un sanctuaire rend des pierres, des archives des clés', () => {
    expect(
      poiHaulPreview(poi('shrine'), { playerLevel: 30, heroGoes: false }).summonStones,
    ).toBeGreaterThan(0);
    expect(
      poiHaulPreview(poi('archive'), { playerLevel: 30, heroGoes: false }).keys,
    ).toBeGreaterThan(0);
  });
});

describe('une faille', () => {
  it('rend le mana de sa fermeture, gardien compris', () => {
    const p = poi('rift');
    expect(poiHaulPreview(p, { playerLevel: 30, heroGoes: false }).mana).toBe(riftClearMana(p));
  });
});

describe('hourlyRates : la distance ne coûte que du temps', () => {
  const haul = { gold: 3000, energy: 0, summonStones: 4, keys: 1, mana: 0 };
  it('divise par la durée en heures, sans les ressources nulles', () => {
    const r = hourlyRates(haul, 120);
    expect(r.map((x) => x.key)).toEqual(['gold', 'summonStones', 'keys']);
    expect(r[0]!.perHour).toBe(1500);
    expect(r[2]!.perHour).toBe(0.5);
  });
  it('le même butin rend deux fois plus à mi-distance', () => {
    expect(hourlyRates(haul, 60)[0]!.perHour).toBe(2 * hourlyRates(haul, 120)[0]!.perHour);
  });
  it('rien sans trajet connu', () => {
    expect(hourlyRates(haul, 0)).toEqual([]);
    expect(hourlyRates(haul, NaN)).toEqual([]);
  });
  it('formatRates : entier au-delà de 10, une décimale en dessous', () => {
    expect(formatRates(hourlyRates(haul, 120))).toBe('1 500 🪙/h · 2,0 🔮/h · 0,5 🗝️/h');
  });
});
