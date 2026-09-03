import { describe, it, expect } from 'vitest';
import { weatherIcon } from '@/lib/weather';

describe('weatherIcon', () => {
  it('mappe le ciel dégagé', () => {
    expect(weatherIcon(0)).toEqual({ emoji: '☀️', label: 'Ciel dégagé' });
  });

  it('mappe la pluie et ses variantes d’intensité', () => {
    expect(weatherIcon(61).label).toBe('Pluie légère');
    expect(weatherIcon(63).label).toBe('Pluie');
    expect(weatherIcon(65).label).toBe('Pluie forte');
  });

  it('mappe l’orage', () => {
    expect(weatherIcon(95).emoji).toBe('⛈️');
  });

  it('retombe sur un repli neutre pour un code inconnu', () => {
    expect(weatherIcon(9999)).toEqual({ emoji: '🌡️', label: 'Météo' });
  });
});
