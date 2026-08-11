import { describe, it, expect } from 'vitest';
import {
  discoveredMonsterIds,
  bestiary,
  setCollection,
  codexSummary,
} from '@/lib/codex';
import { MONSTERS } from '@/data/monsters';
import type { Item, ItemSlot } from '@/lib/items';

const setItem = (slot: ItemSlot, setId: string): Item => ({
  id: `${setId}_${slot}`,
  slot,
  name: 'Pièce',
  emoji: '🐲',
  rarity: 'epic',
  level: 10,
  baseLevel: 10,
  effect: { type: 'damage_pct', value: 8 },
  setId,
});

describe('codex — bestiaire', () => {
  it('rien nettoyé → aucun monstre découvert', () => {
    expect(discoveredMonsterIds([]).size).toBe(0);
  });
  it('donjon nettoyé → ses monstres sont découverts', () => {
    expect([...discoveredMonsterIds(['clairiere'])]).toEqual(['slime']);
    const caverne = discoveredMonsterIds(['caverne']);
    expect(caverne.has('wolf')).toBe(true);
    expect(caverne.has('golem')).toBe(true);
  });
  it('bestiary : tout le bestiaire, trié par tier, avec les flags découvert', () => {
    const b = bestiary(['clairiere']);
    expect(b).toHaveLength(MONSTERS.length);
    for (let i = 1; i < b.length; i++) expect(b[i]!.tier).toBeGreaterThanOrEqual(b[i - 1]!.tier);
    expect(b.find((e) => e.id === 'slime')!.discovered).toBe(true);
    expect(b.find((e) => e.id === 'dragon')!.discovered).toBe(false);
  });
});

describe('codex — journal des sets', () => {
  it('rien possédé → 0/4, non complet, boss non vaincu', () => {
    const sets = setCollection({}, [], []);
    const dragon = sets.find((s) => s.set.id === 'dragon')!;
    expect(dragon.owned).toBe(0);
    expect(dragon.complete).toBe(false);
    expect(dragon.bossDefeated).toBe(false);
    expect(dragon.bossId).toBe('dragon_primordial');
  });

  it('4 slots distincts d’un set → complet ; boss vaincu reconnu', () => {
    const inv = [
      setItem('weapon', 'dragon'),
      setItem('armor', 'dragon'),
      setItem('accessory', 'dragon'),
      setItem('relic', 'dragon'),
    ];
    const sets = setCollection({}, inv, ['dragon_primordial']);
    const dragon = sets.find((s) => s.set.id === 'dragon')!;
    expect(dragon.owned).toBe(4);
    expect(dragon.complete).toBe(true);
    expect(dragon.bossDefeated).toBe(true);
  });

  it('doublons de slot ne comptent qu’une fois (slots DISTINCTS)', () => {
    const inv = [setItem('weapon', 'dragon'), setItem('weapon', 'dragon')];
    const dragon = setCollection({}, inv, []).find((s) => s.set.id === 'dragon')!;
    expect(dragon.owned).toBe(1);
  });

  it('compte les pièces équipées ET du sac', () => {
    const equipped = { weapon: setItem('weapon', 'golem') };
    const inv = [setItem('armor', 'golem')];
    const golem = setCollection(equipped, inv, []).find((s) => s.set.id === 'golem')!;
    expect(golem.owned).toBe(2);
  });
});

describe('codex — résumé', () => {
  it('agrège monstres trouvés et sets complets', () => {
    const s = codexSummary(['clairiere'], {}, [], []);
    expect(s.monstersFound).toBe(1);
    expect(s.monstersTotal).toBe(MONSTERS.length);
    expect(s.setsComplete).toBe(0);
    expect(s.setsTotal).toBe(5);
  });
});
