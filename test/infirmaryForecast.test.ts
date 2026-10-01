import { describe, expect, it } from 'vitest';
import { advAtInfirmary, advUnavailableReason, advWalkingHurt } from '@/lib/adventurers';
import { advHealCost, advHurtMs, woundedAdventurers } from '@/lib/raid';
import { partyAllies, refAdventurer } from '@/lib/caravan';
import { campWinPct } from '@/lib/camp';
import { harvestGuardOf, type Poi } from '@/lib/expedition';
import { CAMP_SAMPLE_MULT, FORECAST_SAMPLES, partyWinChance } from '@/lib/partyForecast';

const NOW = 1_800_000_000_000;
const H = 3_600_000;

describe('🏥 l’infirmerie commence à l’arrivée (signalé : « ils rentrent blessés mais sont déjà à l’infirmerie »)', () => {
  const walker = { ...refAdventurer(20, 0), busyUntil: NOW + 2 * H, hurtUntil: NOW + 3 * H };
  const inBed = { ...refAdventurer(20, 1), busyUntil: NOW - H, hurtUntil: NOW + H };
  const fine = { ...refAdventurer(20, 2), busyUntil: 0, hurtUntil: NOW - H };

  it('un blessé encore en route n’est pas à l’infirmerie, il rentre blessé', () => {
    expect(advAtInfirmary(walker, NOW)).toBe(false);
    expect(advWalkingHurt(walker, NOW)).toBe(true);
    expect(advUnavailableReason(walker, NOW)).toBe('busy');
    expect(advAtInfirmary(inBed, NOW)).toBe(true);
    expect(advWalkingHurt(inBed, NOW)).toBe(false);
    expect(advAtInfirmary(fine, NOW)).toBe(false);
  });

  it('l’Infirmerie ne liste ni ne fait payer le temps de marche', () => {
    expect(woundedAdventurers([walker, inBed, fine], NOW).map((a) => a.id)).toEqual([inBed.id]);
    expect(advHurtMs(walker, NOW)).toBe(0);
    expect(advHealCost(walker, NOW, 30)).toBe(0);
    expect(advHurtMs(inBed, NOW)).toBe(H);
    // Arrivé : il entre à l'infirmerie avec toute sa convalescence.
    expect(advHurtMs(walker, NOW + 2 * H)).toBe(H);
  });
});

describe('🎯 le pronostic d’un combat de camp simule plus de combats (signalé : « 98 % et je rate »)', () => {
  it('les gardes d’un lieu se pronostiquent sur FORECAST_SAMPLES × CAMP_SAMPLE_MULT combats', () => {
    expect(CAMP_SAMPLE_MULT).toBeGreaterThanOrEqual(6);
    const poi = {
      id: 'poi_t_3',
      type: 'ruins',
      level: 19,
      x: 0,
      y: 0,
      distNorm: 0.5,
      expiresAt: 0,
      spawnedAt: 0,
    } as Poi;
    const escort = [refAdventurer(21, 0), refAdventurer(21, 1), refAdventurer(21, 2)];
    const road = { advGear: [] };
    const spec = harvestGuardOf(poi)!;
    const allies = partyAllies(escort, road, null);
    expect(partyWinChance(poi, escort, road, null, NOW, FORECAST_SAMPLES, false)).toBe(
      campWinPct(poi, spec, allies, FORECAST_SAMPLES * CAMP_SAMPLE_MULT),
    );
  });
});
