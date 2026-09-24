import { describe, expect, it } from 'vitest';
import { travelPosition, tripTimeLabel, type Poi } from '@/lib/expedition';
import { formatDuration } from '@/lib/duration';

const H = 3_600_000;
const poi = { id: 'p', type: 'mine', x: 120, y: 80, level: 5 } as unknown as Poi;
// Aller de 1 h, retour de 2 h.
const voyage = { poi, sentAt: 0, midAt: H, returnAt: 3 * H };

describe('tripTimeLabel — ce que dit une tuile de voyage', () => {
  it('à l’aller : le temps jusqu’à l’ARRIVÉE sur le lieu, marqué →', () => {
    const l = tripTimeLabel(travelPosition(voyage, 0.25 * H));
    expect(l.time).toBe(`→ ${formatDuration(0.75 * H)}`);
    // L'info-bulle dit aussi quand il rentre, aller + retour compris.
    expect(l.untilHome).toContain(formatDuration(2.75 * H));
  });

  it('au retour : le temps jusqu’à la VILLE, marqué ↩', () => {
    const l = tripTimeLabel(travelPosition(voyage, 2 * H));
    expect(l.time).toBe(`↩ ${formatDuration(H)}`);
    expect(l.untilHome).toContain(formatDuration(H));
  });

  it('les deux sens ne se lisent jamais pareil', () => {
    const aller = tripTimeLabel(travelPosition(voyage, 0.5 * H)).time;
    const retour = tripTimeLabel(travelPosition(voyage, 2.5 * H)).time;
    expect(aller.startsWith('→')).toBe(true);
    expect(retour.startsWith('↩')).toBe(true);
  });

  it('rentré', () => {
    expect(tripTimeLabel(travelPosition(voyage, 4 * H)).time).toBe('rentré');
  });
});
