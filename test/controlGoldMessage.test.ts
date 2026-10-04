import { describe, it, expect } from 'vitest';
import { AWAY_HARVEST_MS, controlGoldMessage } from '@/lib/controlPoints';
import type { Poi } from '@/lib/expedition';

const H = 3_600_000;
const mine = {
  id: 'ctl_mine',
  type: 'control',
  x: 100,
  y: 100,
  level: 20,
  control: { kind: 'mine', owner: 'player', garrison: [] },
} as unknown as Poi;

// ⛏️ Demandé (2026-10-04) : « le matin je n'ai pas l'impression d'avoir la récolte de la nuit ».
describe('⛏️ la récolte d’or d’une absence est annoncée', () => {
  it('une nuit : le message dit l’or et la durée, l’or est déjà versé', () => {
    const m = controlGoldMessage(mine, 9 * H, 33_600.7, H)!;
    expect(m.title).toContain('33');
    expect(m.title).toContain('🪙 pendant ton absence');
    expect(m.text).toContain('8 h');
    expect(m.gold).toBe(33_600);
    // Déjà crédité : il se lit, il ne s'encaisse pas.
    expect(m.claimed).toBeUndefined();
  });
  it('la récolte de chaque minute reste silencieuse', () => {
    expect(controlGoldMessage(mine, AWAY_HARVEST_MS - 1, 500, 0)).toBeNull();
    expect(controlGoldMessage(mine, AWAY_HARVEST_MS, 500, 0)).not.toBeNull();
  });
  it('pas d’or, pas de message', () => {
    expect(controlGoldMessage(mine, 9 * H, 0.4, 0)).toBeNull();
  });
});
