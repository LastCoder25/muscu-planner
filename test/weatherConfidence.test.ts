import { describe, it, expect } from 'vitest';
import { forecastConfidence } from '@/lib/weather';

const T = '2026-11-23';
const at = (n: number) => {
  const d = new Date(`${T}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('forecastConfidence — l’erreur croît avec l’éloignement', () => {
  it('aujourd’hui à J+2 : fiable', () => {
    for (const n of [0, 1, 2]) expect(forecastConfidence(at(n), T).level).toBe('sure');
  });
  it('J+3 à J+5 : correcte ; J+6 et plus : incertaine', () => {
    for (const n of [3, 4, 5]) expect(forecastConfidence(at(n), T).level).toBe('fair');
    for (const n of [6, 9, 15]) expect(forecastConfidence(at(n), T).level).toBe('low');
  });
  it('l’écart typique ne diminue jamais avec l’éloignement', () => {
    let prev = 0;
    for (let n = 0; n <= 16; n++) {
      const c = forecastConfidence(at(n), T);
      expect(c.tempC).toBeGreaterThanOrEqual(prev);
      prev = c.tempC;
    }
  });
  it('les jours lointains gardent un écart large (J+4 ≥ 3°, J+9 ≥ 5°, J+16 ≥ 6°)', () => {
    expect(forecastConfidence(at(4), T).tempC).toBeGreaterThanOrEqual(3);
    expect(forecastConfidence(at(9), T).tempC).toBeGreaterThanOrEqual(5);
    expect(forecastConfidence(at(16), T).tempC).toBeGreaterThanOrEqual(6);
  });
  it('un jour passé ne donne pas de jours négatifs', () => {
    expect(forecastConfidence(at(-2), T).days).toBe(0);
  });
  it('compte bien les jours d’avance, y compris à travers un changement d’heure', () => {
    expect(forecastConfidence('2026-11-30', T).days).toBe(7);
    expect(forecastConfidence('2026-03-30', '2026-03-27').days).toBe(3);
  });
});
