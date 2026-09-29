import { describe, it, expect } from 'vitest';
import { byReach } from '@/lib/combinedAttack';

describe('byReach — les lieux de départ, du plus proche de la cible au plus loin', () => {
  it('trie par trajet aller croissant', () => {
    const rows = [
      { id: 'p1', legMin: 90 },
      { id: 'base', legMin: 60 },
      { id: 'p2', legMin: 20 },
    ];
    expect(byReach(rows).map((r) => r.id)).toEqual(['p2', 'base', 'p1']);
  });
  it('à trajet égal, la base d’abord, puis l’ordre reçu', () => {
    const rows = [
      { id: 'p1', legMin: 40 },
      { id: 'p2', legMin: 40 },
      { id: 'base', legMin: 40 },
    ];
    expect(byReach(rows).map((r) => r.id)).toEqual(['base', 'p1', 'p2']);
  });
  it('ne touche pas au tableau reçu', () => {
    const rows = [
      { id: 'a', legMin: 2 },
      { id: 'b', legMin: 1 },
    ];
    byReach(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
