import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlGoldPerHour,
  controlProgress,
  trainingXpPerHour,
  controlStock,
  ensureControls,
  runeHoursFor,
  runeProgress,
  trainingStock,
} from '@/lib/controlPoints';
import { createMap, type ControlKind, type Poi } from '@/lib/expedition';
import { formatDuration } from '@/lib/duration';

const H = 3600_000;
const L = 30;
/** Un point tenu par trois champions, sans reprise ennemie (on mesure la production seule). */
const held = (kind: ControlKind): Poi => {
  const id = controlIdOf(kind);
  const m = captureControl(ensureControls(createMap(3, 0, L, 1), 0, L), id, ['a', 'b', 'c'], 0, 7);
  const p = m.pois.find((q) => q.id === id)!;
  return { ...p, control: { ...p.control!, attackAt: 1e15 } };
};

describe('📊 l’avancement d’une place forte, en bout de ligne', () => {
  it('⛏️ la mine dit son DÉBIT : l’or est versé directement, plus de réserve à récolter', () => {
    const p = held('mine');
    const perH = Math.round(controlGoldPerHour(p, 3, L));
    expect(controlProgress(p, 6 * H, L)).toEqual({
      text: `🪙 +${perH.toLocaleString('fr-FR')}/h`,
      pct: null,
    });
  });

  it('🎓 le camp dit l’XP versée par heure à chaque champion', () => {
    const p = held('training');
    expect(controlProgress(p, 5 * H, L)!.text).toBe(
      `🎓 +${Math.round(trainingXpPerHour(30))} XP/h`,
    );
  });

  it('📜 le Scriptorium dit le % de la rune ET le temps restant, puis « prête »', () => {
    const p = held('scriptorium');
    const half = (CONTROL.runeHoursPerItem / 2) * H;
    const r = runeProgress(p, half);
    const left = formatDuration((1 - r) * runeHoursFor(p.control!.garrison.length)! * H);
    expect(controlProgress(p, half, L)).toEqual({
      text: `📜 ${Math.round(r * 100)} % · ${left}`,
      pct: runeProgress(p, half),
    });
    expect(controlProgress(p, CONTROL.runeHoursPerItem * H, L)).toEqual({
      text: '📜 prête',
      pct: 1,
    });
  });

  it('🌿 le jardin dit ce qui est cueilli, où en est le suivant ET dans combien de temps', () => {
    // Un seul jardinier : un consommable toutes les 12 h.
    const g = held('garden');
    const p = { ...g, control: { ...g.control!, garrison: ['a'] } };
    const t = 1.5 * CONTROL.gardenHoursPerItem * H;
    const left = formatDuration(0.5 * CONTROL.gardenHoursPerItem * H);
    expect(controlProgress(p, t, L)).toEqual({ text: `🎒 1 · 50 % · ${left}`, pct: 0.5 });
  });

  it('⏳ sans personne pour produire, pas de temps restant (il ne viendrait jamais)', () => {
    const p = held('garden');
    const vide = { ...p, control: { ...p.control!, garrison: [] } };
    expect(controlProgress(vide, 0, L)!.text).toBe('🎒 0 %');
  });

  it('🗼 la tour ne stocke rien : elle dit sa réduction de trajet, sans jauge', () => {
    expect(controlProgress(held('tower'), 10 * H, L)).toEqual({
      text: `🧭 −${Math.round(CONTROL.towerCut * 100)} % trajets · 👁️ +${Math.round(CONTROL.towerDetect * 100)} % détection`,
      pct: null,
    });
  });

  it('un point ennemi n’a pas d’avancement', () => {
    const p = held('mine');
    expect(controlProgress({ ...p, control: { ...p.control!, owner: 'enemy' } }, 6 * H, L)).toBe(
      null,
    );
  });
});
