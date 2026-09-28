import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlProgress,
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
  it('⛏️ la mine dit l’or en attente — le MÊME chiffre que la récolte', () => {
    const p = held('mine');
    const pr = controlProgress(p, 6 * H, L)!;
    const gold = controlStock(p, 6 * H, L);
    expect(gold).toBeGreaterThan(0);
    expect(pr.text).toBe(`🪙 ${gold.toLocaleString('fr-FR')}`);
    // 6 h sur une réserve de 24 h.
    expect(pr.pct).toBeCloseTo(0.25, 2);
    expect(controlProgress(p, 48 * H, L)!.pct).toBe(1);
  });

  it('🎓 le camp dit l’XP en attente par champion', () => {
    const p = held('training');
    expect(controlProgress(p, 5 * H, L)!.text).toBe(`🎓 +${trainingStock(p, 5 * H)} XP`);
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
    const p = held('garden');
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
      text: `🧭 −${Math.round(CONTROL.towerCut * 100)} % trajets`,
      pct: null,
    });
  });

  it('récolter remet la jauge à zéro, et un point ennemi n’a pas d’avancement', () => {
    const p = held('mine');
    const map = createMap(3, 0, L, 1);
    const withP = { ...map, pois: [...map.pois, p] };
    const after = collectControl(withP, p.id, 6 * H, L).map.pois.find((q) => q.id === p.id)!;
    expect(controlProgress(after, 6 * H, L)!.pct).toBe(0);
    expect(controlProgress({ ...p, control: { ...p.control!, owner: 'enemy' } }, 6 * H, L)).toBe(
      null,
    );
  });
});
