import { describe, expect, it } from 'vitest';
import { garrisonWithoutPost } from '@/lib/controlPoints';
import type { ExpeditionMap } from '@/lib/expedition';

// 🩹 Signalé (2026-10-16) : Thessa dans la garnison du cimetière sans y être postée —
// comptée deux fois au choix d'une équipe, l'envoi refusé ou le bouton grisé.
const map = (pts: Record<string, Record<string, unknown>>): ExpeditionMap =>
  ({
    pois: Object.entries(pts).map(([id, c]) => ({
      id,
      type: 'control',
      control: { garrison: [], ...c },
    })),
  }) as unknown as ExpeditionMap;

describe('garrisonWithoutPost — la garnison fait foi', () => {
  it('un champion en garnison sans poste y est re-posté', () => {
    const m = map({ cim: { garrison: ['thessa', 'mil:1'] } });
    expect([...garrisonWithoutPost([{ id: 'thessa' }], m)]).toEqual([['thessa', 'cim']]);
  });
  it('un poste fantôme (le point ne le porte pas) cède à la garnison', () => {
    const m = map({ cim: { garrison: ['t'] }, ars: { garrison: [] } });
    expect([...garrisonWithoutPost([{ id: 't', posted: 'ars' }], m)]).toEqual([['t', 'cim']]);
  });
  it('rien à faire : déjà posté, posté ailleurs et porté, deux garnisons, autre île', () => {
    const m = map({
      cim: { garrison: ['ok', 'two', 'isl'] },
      ars: { garrison: ['two'], reinforcing: [{ id: 'moving', at: 1 }] },
      hos: { garrison: ['moving'] },
    });
    const advs = [
      { id: 'ok', posted: 'cim' },
      { id: 'two' },
      { id: 'isl', elsewhere: 2 },
      { id: 'moving', posted: 'ars' },
      { id: 'free' },
    ];
    expect([...garrisonWithoutPost(advs, m)]).toEqual([]);
  });
});
