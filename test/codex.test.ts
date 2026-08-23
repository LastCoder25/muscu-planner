import { describe, it, expect } from 'vitest';
import { discoveredMonsterIds, bestiary, setCollection, codexSummary } from '@/lib/codex';
import { MONSTERS } from '@/data/monsters';
import { ITEM_SETS, type Item, type ItemSlot } from '@/lib/items';

const setItem = (slot: ItemSlot, setId: string): Item => ({
  id: `${setId}_${slot}`,
  slot,
  name: 'Pièce',
  emoji: '🐲',
  rarity: 'B',
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

describe('codex — journal des sets (voie)', () => {
  const BERS = 'voie:berserker';
  it('rien possédé → 0/4, non complet', () => {
    const sets = setCollection({}, []);
    const bers = sets.find((s) => s.set.id === BERS)!;
    expect(bers.owned).toBe(0);
    expect(bers.complete).toBe(false);
  });

  it('4 slots distincts d’un set → complet', () => {
    const inv = [
      setItem('weapon', BERS),
      setItem('armor', BERS),
      setItem('accessory', BERS),
      setItem('relic', BERS),
    ];
    const bers = setCollection({}, inv).find((s) => s.set.id === BERS)!;
    expect(bers.owned).toBe(4);
    expect(bers.complete).toBe(true);
  });

  it('doublons de slot ne comptent qu’une fois (slots DISTINCTS)', () => {
    const inv = [setItem('weapon', BERS), setItem('weapon', BERS)];
    const bers = setCollection({}, inv).find((s) => s.set.id === BERS)!;
    expect(bers.owned).toBe(1);
  });

  it('compte les pièces équipées ET du sac', () => {
    const equipped = { weapon: setItem('weapon', 'voie:gardien') };
    const inv = [setItem('armor', 'voie:gardien')];
    const gardien = setCollection(equipped, inv).find((s) => s.set.id === 'voie:gardien')!;
    expect(gardien.owned).toBe(2);
  });
});

describe('codex — résumé', () => {
  it('agrège monstres trouvés et sets complets', () => {
    const s = codexSummary(['clairiere'], {}, []);
    expect(s.monstersFound).toBe(1);
    expect(s.monstersTotal).toBe(MONSTERS.length);
    expect(s.setsComplete).toBe(0);
    expect(s.setsTotal).toBe(ITEM_SETS.length);
  });
});
