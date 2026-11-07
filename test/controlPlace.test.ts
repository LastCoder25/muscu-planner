// 🛡️ UN LIEU FIXE D'ÎLE HORS DE SA PLACE Y RETOURNE (v1.50.1). Signalé sur un compte réel :
// l'Ossuaire de l'île 2, posé avant la ligne de défense (2026-10-04), restait à (149, 126) au
// lieu de (159, 89) — `ensureControls` ne crée que les lieux manquants, donc il ne bougeait
// jamais, collé aux Archives (16 unités : sous la distance mini, trajet entre eux à 4 min).
import { describe, expect, it } from 'vitest';
import { createMap } from '@/lib/expedition';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { controlSpot, ensureControls } from '@/lib/controlPoints';

const NOW = Date.UTC(2026, 9, 4);
const island2 = () =>
  ensureControls(
    createMap(7, NOW, 30, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(2)),
    NOW,
    30,
    ISLAND_OUTPOST_LEVEL,
  );

describe('🛡️ un lieu fixe d’île retourne sur sa place', () => {
  it('un lieu TENU déplacé revient à sa place, sa garnison et son état intacts', () => {
    const m = island2();
    const oss = m.pois.find((p) => p.control?.kind === 'ossuary')!;
    expect(oss).toBeDefined();
    const want = controlSpot(m, 'ossuary');
    const control = { ...oss.control!, owner: 'player' as const, garrison: ['a1', 'a2'] };
    const moved = {
      ...m,
      pois: m.pois.map((p) => (p.id === oss.id ? { ...p, x: want.x - 10, y: want.y + 37, control } : p)),
    };
    const out = ensureControls(moved, NOW, 30, ISLAND_OUTPOST_LEVEL);
    const back = out.pois.find((p) => p.id === oss.id)!;
    expect({ x: back.x, y: back.y, distNorm: back.distNorm }).toEqual(want);
    expect(back.control).toMatchObject(control);
    expect(back.level).toBe(oss.level);
  });

  it('un lieu déjà à sa place ne bouge pas (même objet : rien à réécrire)', () => {
    const m = island2();
    const out = ensureControls(m, NOW, 30, ISLAND_OUTPOST_LEVEL);
    for (const p of m.pois.filter((q) => q.type === 'control'))
      expect(out.pois.find((q) => q.id === p.id)).toBe(p);
  });

  it('les objectifs et la forteresse ne sont pas concernés', () => {
    const m = island2();
    const fort = m.pois.find((p) => p.control?.kind === 'fortress');
    if (!fort) return;
    const moved = { ...m, pois: m.pois.map((p) => (p.id === fort.id ? { ...p, x: p.x + 5 } : p)) };
    const out = ensureControls(moved, NOW, 30, ISLAND_OUTPOST_LEVEL);
    expect(out.pois.find((p) => p.id === fort.id)!.x).toBe(fort.x + 5);
  });
});
