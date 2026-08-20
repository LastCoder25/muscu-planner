import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { RANK_ORDER } from '@/lib/items';
import {
  CHEST_GRADES,
  chestGradeIndexForRank,
  rollChestGrade,
  LABY_TRAPS,
  pickLabyTrap,
} from '@/data/labyrinthLoot';

describe('labyrinthLoot — coffres', () => {
  it('4 grades ordonnés, contenu croissant (luck/niveau)', () => {
    expect(CHEST_GRADES).toHaveLength(4);
    for (let i = 1; i < CHEST_GRADES.length; i++) {
      expect(CHEST_GRADES[i]!.luckBonus).toBeGreaterThanOrEqual(CHEST_GRADES[i - 1]!.luckBonus);
      expect(CHEST_GRADES[i]!.levelBonus).toBeGreaterThanOrEqual(CHEST_GRADES[i - 1]!.levelBonus);
    }
  });

  it('rang → grade : G F E → bronze · D C → argent · B A → or · S SS SSS → platine', () => {
    expect(chestGradeIndexForRank('G')).toBe(0);
    expect(chestGradeIndexForRank('E')).toBe(0);
    expect(chestGradeIndexForRank('D')).toBe(1);
    expect(chestGradeIndexForRank('C')).toBe(1);
    expect(chestGradeIndexForRank('B')).toBe(2);
    expect(chestGradeIndexForRank('A')).toBe(2);
    expect(chestGradeIndexForRank('S')).toBe(3);
    expect(chestGradeIndexForRank('SSS')).toBe(3);
  });

  it('grade moyen MONTE avec le niveau du contenu (frise glissante)', () => {
    const meanGrade = (level: number) => {
      let sum = 0;
      const N = 2000;
      for (let s = 1; s <= N; s++)
        sum += CHEST_GRADES.indexOf(rollChestGrade(mulberry32(s * 7 + level), level, 0.4));
      return sum / N;
    };
    expect(meanGrade(60)).toBeGreaterThan(meanGrade(20));
    expect(meanGrade(20)).toBeGreaterThan(meanGrade(4));
    // Bas niveau : surtout bronze.
    expect(meanGrade(3)).toBeLessThan(1);
  });
});

describe('labyrinthLoot — pièges', () => {
  it('plusieurs types (dégâts + vols), pondérés, tous tirables', () => {
    expect(LABY_TRAPS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(LABY_TRAPS.map((t) => t.kind)).size).toBeGreaterThanOrEqual(2); // dmg + gold/dust
    const seen = new Set<string>();
    for (let s = 0; s < 3000; s++) seen.add(pickLabyTrap(mulberry32(s * 13 + 1)).id);
    expect(seen.size).toBe(LABY_TRAPS.length); // tous sortent
  });
  it("les pièges de dégâts modulent l'intensité (pointes < flammes)", () => {
    const spikes = LABY_TRAPS.find((t) => t.id === 'spikes')!;
    const flames = LABY_TRAPS.find((t) => t.id === 'flames')!;
    expect(flames.mult).toBeGreaterThan(spikes.mult);
  });
});

// garde-fou : RANK_ORDER couvre bien les 10 rangs utilisés par le mapping
it('RANK_ORDER complet', () => expect(RANK_ORDER).toHaveLength(10));
