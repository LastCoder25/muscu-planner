import { describe, it, expect } from 'vitest';
import { championsOf } from '@/data/champions';
import { grantChampion, saturatedPull } from '@/lib/gacha';
import type { Adventurer } from '@/lib/adventurers';

const adv = (championId: string, copies: number): Adventurer =>
  ({
    id: 'a_' + championId,
    name: championId,
    seed: 1,
    path: [],
    championId,
    copies,
    level: 1,
    xp: 0,
  }) as Adventurer;

describe('🗡️ lettre saturée : une pièce de la même lettre, plus de mana (audit 2026-10-15)', () => {
  const champ = championsOf('A')[0]!;

  it('le prédicat coïncide EXACTEMENT avec la conversion de grantChampion', () => {
    for (let copies = 1; copies <= 12; copies++) {
      const roster = [adv(champ.id, copies)];
      const g = grantChampion(roster, champ, { id: 'x' });
      expect(saturatedPull(roster, champ), `copies ${copies}`).toBe(g.manaBack > 0);
    }
  });

  it('un champion jamais tiré, ou encore éveillable, n’est pas saturé', () => {
    expect(saturatedPull([], champ)).toBe(false);
    expect(saturatedPull([adv(champ.id, 1)], champ)).toBe(false);
  });
});
