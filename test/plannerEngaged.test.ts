import { describe, expect, it } from 'vitest';
import { withoutEngaged } from '@/lib/expeditionPlanner';

describe('🪄 planificateur : un lieu attaqué depuis le calcul', () => {
  const rows = [
    { key: 'a', poi: { id: 'p1' } },
    { key: 'b', poi: { id: 'p2' } },
    { key: 'c', poi: { id: 'p3' } },
  ];

  it('efface la proposition dont le lieu a quitté les cibles, garde les autres', () => {
    const out = withoutEngaged(rows, [{ id: 'p1' }, { id: 'p3' }]);
    expect(out.map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('ne touche à rien tant que tous les lieux restent visables', () => {
    expect(withoutEngaged(rows, [{ id: 'p3' }, { id: 'p2' }, { id: 'p1' }])).toEqual(rows);
  });
});
