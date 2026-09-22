import { describe, expect, it } from 'vitest';
import type { Combatant } from '@/lib/combat';
import { RATING_CAPS, chanceChanges, playerWithGear, ratingChance, type Item } from '@/lib/items';

const base: Combatant = { name: 'H', pv: 100, damage: 10, crit: 0.38, dodge: 0.1, initiative: 1 };

describe('chanceChanges — les chances RÉELLES, jamais la note (refonte, § 11)', () => {
  it('liste seulement les canaux qui bougent, avant → après, en pourcentage arrondi', () => {
    expect(chanceChanges(base, { ...base, crit: 0.41 })).toEqual(['critique 38 % → 41 %']);
    expect(chanceChanges(base, { ...base })).toEqual([]);
    expect(chanceChanges(base, { ...base, crit: 0.382 })).toEqual([]); // < 1 point arrondi
  });

  it('un canal absent vaut 0', () => {
    expect(chanceChanges(base, { ...base, block: 0.25 })).toEqual(['blocage 0 % → 25 %']);
    expect(chanceChanges({ ...base, parry: 0.1 }, base)).toEqual(['parade 10 % → 0 %']);
  });

  it('un bouclier affiche le blocage APRÈS la courbe, pas sa note', () => {
    const stats = { puissance: 50, endurance: 50, agilite: 50 };
    const note = 0.3; // « +30 % blocage » sur l'objet
    const shield = {
      id: 's',
      slot: 'shield',
      name: 'Écu',
      emoji: '',
      rarity: 'rare',
      level: 1,
      baseLevel: 1,
      effect: { type: 'block_pct', value: note * 100 },
      roll: 0.5,
    } as Item;
    const before = playerWithGear('h', stats, {}, {}, 30);
    const after = playerWithGear('h', stats, { shield }, {}, 30);
    const real = Math.round(ratingChance(RATING_CAPS.block, note) * 100);
    expect(real).not.toBe(30);
    expect(chanceChanges(before, after)).toContain(`blocage 0 % → ${real} %`);
  });
});
