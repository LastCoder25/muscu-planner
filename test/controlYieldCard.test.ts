// 🧺 La tuile de production d'un point tenu : ce qui attend, le temps restant, le débit.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlIdOf,
  controlGoldPerHour,
  controlManaPerHour,
  controlYieldCard,
  ensureControls,
  gardenHoursFor,
  gardenStock,
  runeHoursFor,
  runeProgress,
  tierYieldMult,
} from '@/lib/controlPoints';
import { createMap, type ControlKind, type Poi } from '@/lib/expedition';
import { formatDuration } from '@/lib/duration';

const H = 3600_000;
const L = 30;
const held = (kind: ControlKind, crew: string[] = ['a', 'b', 'c']): Poi => {
  const id = controlIdOf(kind);
  const m = captureControl(ensureControls(createMap(3, 0, L, 1), 0, L), id, crew, 0, 7);
  const p = m.pois.find((q) => q.id === id)!;
  return { ...p, control: { ...p.control!, attackAt: 1e15 } };
};

describe('🧺 la tuile de production', () => {
  it('📜 la rune dit son % en gros, et le temps avant qu’elle soit prête', () => {
    const p = held('scriptorium');
    const every = runeHoursFor(3)!;
    const c = controlYieldCard(p, (every / 4) * H, L)!;
    expect(c.value).toBe(`${Math.round(runeProgress(p, (every / 4) * H) * 100)} %`);
    expect(c.pct).toBeCloseTo(0.25, 2);
    expect(c.gauge).toBe(`Prête dans ${formatDuration(every * 0.75 * H)}`);
    expect(c.rate).toContain(`1 rune toutes les ${formatDuration(every * H)}`);
    expect(c.rate).toContain('3/5 copistes');
    expect(c.rate).toContain(`${formatDuration(runeHoursFor(5)! * H)} au complet`);
    expect(c.ready).toBe(false);
  });
  it('📜 une rune copiée : « Prête », à récupérer pour lancer la suivante', () => {
    const c = controlYieldCard(held('scriptorium'), 200 * H, L)!;
    expect(c.value).toBe('Prête');
    expect(c.ready).toBe(true);
    expect(c.full).toBe(true);
    expect(c.gauge).toMatch(/copie suivante/);
  });
  it('⛏️ la mine : son débit, versé directement — ni réserve, ni jauge, rien à récolter', () => {
    const p = held('mine');
    const c = controlYieldCard(p, 30 * H, L)!;
    expect(c.value).toBe(
      // 🏅 À 30 h, le point tenu depuis 0 est au cran 1.
      `+${Math.round(controlGoldPerHour(p, 3, L) * tierYieldMult(1)).toLocaleString('fr-FR')} 🪙/h`,
    );
    expect(c.what).toMatch(/directement/);
    expect(c.pct).toBeNull();
    expect(c.ready).toBe(false);
    expect(c.full).toBe(false);
  });
  it('⛲ la source : son débit du jour, versé directement', () => {
    const p = held('mana');
    const c = controlYieldCard(p, 12 * H, L)!;
    expect(c.value).toBe(`+${Math.round(controlManaPerHour(3, L) * 24)} 💠/jour`);
    expect(c.ready).toBe(false);
  });
  it('🌿 le jardin : le nombre prêt, sinon le % du prochain et son temps', () => {
    const p = held('garden');
    const every = gardenHoursFor(3)!;
    const early = controlYieldCard(p, (every / 2) * H, L)!;
    expect(early.value).toBe('50 %');
    expect(early.gauge).toBe(`Prochain dans ${formatDuration((every / 2) * H)}`);
    const later = controlYieldCard(p, every * 1.5 * H, L)!;
    expect(later.value).toBe(`${gardenStock(p, every * 1.5 * H)} 🎒`);
    expect(later.ready).toBe(true);
  });
  it('sans garnison, la tuile dit que la production est arrêtée', () => {
    const c = controlYieldCard(held('mine', []), 6 * H, L)!;
    expect(c.gauge).toMatch(/production est arrêtée/);
    expect(c.rate).toContain('0/5 mineurs');
  });
  it('🗼 la tour n’a rien à récolter : sa réduction, sans jauge', () => {
    const c = controlYieldCard(held('tower'), 6 * H, L)!;
    expect(c.pct).toBeNull();
    expect(c.value).toMatch(/^−\d+ %$/);
    expect(c.ready).toBe(false);
  });
  it('un point ennemi n’a pas de tuile', () => {
    const m = ensureControls(createMap(3, 0, L, 1), 0, L);
    expect(controlYieldCard(m.pois.find((q) => q.id === controlIdOf('mine'))!, 0, L)).toBeNull();
  });
});
