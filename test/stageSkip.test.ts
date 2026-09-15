import { describe, it, expect } from 'vitest';
import { stageSkipReason, SURE_WIN_PCT } from '@/lib/stageSkip';

describe('stageSkipReason', () => {
  it('le réglage « toujours passer » passe tout, découverte comprise, sans simuler', () => {
    let simulated = false;
    const winPct = () => {
      simulated = true;
      return 10;
    };
    expect(stageSkipReason({ always: true, firstVisit: true, winPct })).toBe('setting');
    expect(stageSkipReason({ always: true, firstVisit: false, winPct })).toBe('setting');
    expect(simulated).toBe(false);
  });

  it('sans le réglage : passé seulement en rejeu gagné d’avance', () => {
    const at = (pct: number, firstVisit = false) =>
      stageSkipReason({ always: false, firstVisit, winPct: () => pct });
    expect(at(SURE_WIN_PCT)).toBe('sure');
    expect(at(100)).toBe('sure');
    expect(at(SURE_WIN_PCT - 1)).toBeNull();
    expect(at(100, true)).toBeNull(); // la découverte reste animée
    expect(SURE_WIN_PCT).toBe(90);
  });
});
