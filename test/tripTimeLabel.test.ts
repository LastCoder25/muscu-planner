import { describe, expect, it } from 'vitest';
import { nextStepAt, travelPosition, tripTimeLabel, type Poi } from '@/lib/expedition';
import { formatDuration } from '@/lib/duration';

const H = 3_600_000;
const poi = { id: 'p', type: 'mine', x: 120, y: 80, level: 5 } as unknown as Poi;
// Aller de 1 h, retour de 2 h.
const voyage = { poi, sentAt: 0, midAt: H, returnAt: 3 * H };

describe('tripTimeLabel — ce que dit une tuile de voyage', () => {
  it('à l’aller : EN TÊTE le délai de la prochaine étape (l’arrivée), puis le total', () => {
    const l = tripTimeLabel(travelPosition(voyage, 0.25 * H));
    expect(l.time).toBe(`→ ${formatDuration(0.75 * H)}`);
    expect(l.total).toBe(formatDuration(2.75 * H));
    expect(l.untilHome).toContain(formatDuration(0.75 * H));
    expect(l.untilHome).toContain(formatDuration(2.75 * H));
  });

  it('le chiffre en tête est celui qui RANGE les tuiles (`nextStepAt`)', () => {
    for (const now of [0.1 * H, 0.5 * H, 0.9 * H, 1.5 * H, 2.5 * H]) {
      const l = tripTimeLabel(travelPosition(voyage, now));
      const shown = l.time || l.total || '';
      expect(shown.endsWith(formatDuration(nextStepAt(voyage, now) - now))).toBe(true);
    }
  });

  it('au retour : le temps de retour vit dans le bandeau, sans chiffre en tête', () => {
    const l = tripTimeLabel(travelPosition(voyage, 2 * H));
    expect(l.time).toBe('');
    expect(l.total).toBe(formatDuration(H));
    expect(l.untilHome).toContain(formatDuration(H));
  });

  it('rentré', () => {
    const l = tripTimeLabel(travelPosition(voyage, 4 * H));
    expect(l.time).toBe('rentré');
    expect(l.total).toBeNull();
  });
});
