import { describe, expect, it } from 'vitest';
import { controlProduces } from '../src/lib/controlPoints';

describe('🏳️ un lieu ennemi pris ne produit rien', () => {
  it('objectifs, forteresse et citadelle : rien à produire', () => {
    expect(controlProduces('objective')).toBe(false);
    expect(controlProduces('fortress')).toBe(false);
    expect(controlProduces('citadel')).toBe(false);
  });

  it('les lieux de production (et à effet) produisent', () => {
    for (const k of ['mine', 'garden', 'scriptorium', 'training', 'tower', 'hospice'] as const)
      expect(controlProduces(k)).toBe(true);
  });
});
