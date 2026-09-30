// ⛏️ La mine d'un lieu fixe produit selon une courbe CONTINUE du niveau du héros : plus de
// paliers (avant : aucun gain du niveau 10 au 20 ni du 85 au 100, parce que son niveau de
// récompense passait par la « difficulté » de gardes tirés sur son id — qu'elle n'a pas).
import { describe, expect, it } from 'vitest';
import { controlGoldPerHour, controlMineLevel } from '@/lib/controlPoints';
import { EXPE, mineVeinGold } from '@/lib/expedition';

const gold = (L: number) => controlGoldPerHour({ id: 'ctl_mine' }, 3, L);

describe('⛏️ la mine d’un lieu fixe suit le niveau du héros, sans palier', () => {
  it('chaque niveau gagné rapporte plus, du 1 au 100', () => {
    for (let L = 2; L <= 100; L++) expect(gold(L)).toBeGreaterThan(gold(L - 1));
  });
  it('jusqu’au plancher de début de partie, c’est le niveau du héros', () => {
    for (let L = 1; L <= EXPE.earlySpawnCapLevel; L++) expect(controlMineLevel(L)).toBe(L);
  });
  it('jamais au-dessus du niveau du héros', () => {
    for (let L = 1; L <= 100; L++) expect(controlMineLevel(L)).toBeLessThanOrEqual(L);
  });
  it('la courbe ne dépend pas de l’id du lieu', () => {
    expect(controlGoldPerHour({ id: 'x' }, 3, 37)).toBe(gold(37));
  });
  it('une garnison de 3 produit un filon de son niveau toutes les 8 h', () => {
    expect(gold(37) * 8).toBeCloseTo(mineVeinGold(controlMineLevel(37)), 6);
  });
});
