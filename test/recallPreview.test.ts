// 🔙 L'écran de demi-tour annonce ce que le demi-tour fera vraiment.
import { describe, expect, it } from 'vitest';
import { recallPreview, recallVoyage, startParty } from '@/lib/party';
import type { Poi } from '@/lib/expedition';

const M = 60_000;
const poi = {
  id: 'p1',
  type: 'mine',
  level: 20,
  x: 100,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
} as Poi;
const trip = () => ({
  ...startParty({ poi, seed: 1 } as never, 0, 40, { win: true } as never),
  id: 'g1',
});

describe('🔙 aperçu du demi-tour', () => {
  it('le retour annoncé est celui que fait le demi-tour', () => {
    const v = trip();
    const now = 10 * M;
    const p = recallPreview({ sentAt: v.sentAt, arriveAt: v.midAt, returnAt: v.returnAt }, now);
    expect(p.backMs).toBe(recallVoyage(v, now)!.returnAt - now);
    expect(p.walkedMs).toBe(10 * M);
    expect(p.toGoMs).toBe(v.midAt - now);
    expect(p.frac).toBeCloseTo(10 / 40);
    expect(p.homeIfContinueMs).toBe(v.returnAt - now);
  });
  it('des renforts qui continuent restent sur le point', () => {
    expect(recallPreview({ sentAt: 0, arriveAt: 40 * M }, 10 * M).homeIfContinueMs).toBeNull();
  });
  it('bornes : jamais négatif, jamais au-delà du lieu', () => {
    const early = recallPreview({ sentAt: 10 * M, arriveAt: 40 * M }, 0);
    expect(early.walkedMs).toBe(0);
    expect(early.frac).toBe(0);
    const late = recallPreview({ sentAt: 0, arriveAt: 40 * M, returnAt: 60 * M }, 90 * M);
    expect(late.frac).toBe(1);
    expect(late.toGoMs).toBe(0);
    expect(late.homeIfContinueMs).toBe(0);
  });
});
