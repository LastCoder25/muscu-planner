import { describe, expect, it } from 'vitest';
import { COMBINED_COLORS, combinedColors, combinedKey } from '@/lib/combinedAttack';

describe('combinedColors — une couleur par attaque combinée', () => {
  it('deux attaques en cours ne partagent jamais la même couleur (tant que la palette suffit)', () => {
    for (let n = 1; n <= COMBINED_COLORS.length; n++) {
      const keys = Array.from({ length: n }, (_, i) => combinedKey(`poi${i * 7}`, 1000 + i * 13));
      const colors = new Set(combinedColors(keys).values());
      expect(colors.size).toBe(n);
    }
  });

  it('tous les groupes d’une même attaque reçoivent la même couleur', () => {
    const k = combinedKey('mine', 42);
    const m = combinedColors([k, k, combinedKey('camp', 7), k]);
    expect(m.size).toBe(2);
    expect(COMBINED_COLORS).toContain(m.get(k));
  });

  it('ne dépend pas de l’ordre de la rangée', () => {
    const keys = ['a:1', 'b:2', 'c:3', 'd:4'];
    const x = combinedColors(keys);
    const y = combinedColors([...keys].reverse());
    for (const k of keys) expect(x.get(k)).toBe(y.get(k));
  });
});
