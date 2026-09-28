// ⚔️ Bataille imminente : un point tenu prévient dans les dernières heures avant sa reprise,
// jamais avant (la règle « sans préavis » de la v0.1239 reste vraie hors de cette fenêtre).
import { describe, expect, it } from 'vitest';
import { CONTROL, attackImminent, imminentControlKey } from '@/lib/controlPoints';
import type { ExpeditionMap, Poi } from '@/lib/expedition';

const H = 3_600_000;
const NOW = 1_000 * H;

function point(id: string, owner: 'player' | 'enemy', attackAt?: number): Poi {
  return {
    id,
    type: 'control',
    level: 10,
    x: 100,
    y: 100,
    distNorm: 0.3,
    spawnedAt: 0,
    expiresAt: 9e15,
    control: { kind: 'mine', owner, garrison: [], collectedAt: 0, attackAt },
  } as unknown as Poi;
}

describe('attackImminent', () => {
  it('prévient dans la fenêtre, pas avant', () => {
    expect(attackImminent(point('a', 'player', NOW + CONTROL.imminentMs), NOW)).toBe(true);
    expect(attackImminent(point('a', 'player', NOW + H), NOW)).toBe(true);
    expect(attackImminent(point('a', 'player', NOW + CONTROL.imminentMs + 1), NOW)).toBe(false);
    expect(attackImminent(point('a', 'player', NOW + 24 * H), NOW)).toBe(false);
  });

  it('une attaque déjà due reste signalée jusqu’à sa résolution', () => {
    expect(attackImminent(point('a', 'player', NOW - 1), NOW)).toBe(true);
  });

  it('seulement pour un point que NOUS tenons, et qui a une attaque programmée', () => {
    expect(attackImminent(point('a', 'enemy', NOW + H), NOW)).toBe(false);
    expect(attackImminent(point('a', 'player', undefined), NOW)).toBe(false);
    expect(attackImminent({ ...point('a', 'player', NOW + H), control: undefined }, NOW)).toBe(
      false,
    );
  });

  it('la fenêtre reste courte : un avertissement, pas un planning', () => {
    expect(CONTROL.imminentMs).toBeGreaterThanOrEqual(H);
    expect(CONTROL.imminentMs).toBeLessThanOrEqual(4 * H);
  });
});

describe('imminentControlKey', () => {
  it('liste les seuls points menacés, joints par « | »', () => {
    const map = {
      pois: [
        point('a', 'player', NOW + H),
        point('b', 'player', NOW + 20 * H),
        point('c', 'enemy', NOW + H),
        point('d', 'player', NOW + 90 * 60_000),
      ],
    } as unknown as ExpeditionMap;
    expect(imminentControlKey(map, NOW)).toBe('a|d');
    expect(imminentControlKey(null, NOW)).toBe('');
  });
});
