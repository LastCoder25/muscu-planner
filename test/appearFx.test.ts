import { describe, expect, it } from 'vitest';
import {
  APPEAR_STAGGER_MS,
  appearInput,
  appearKey,
  appearVariant,
  freshAppearances,
} from '../src/lib/appearFx';
import type { Poi } from '../src/lib/expedition';

// ✨ Apparitions d'objectifs ennemis (2026-10-07).
function target(id: string, emoji: string, spawnedAt = 1, owner: 'enemy' | 'player' = 'enemy'): Poi {
  return { id, x: 10, y: 20, spawnedAt, control: { owner, emoji } } as unknown as Poi;
}
const map = (...pois: Poi[]) => ({ pois });

describe('la variante suit l’objectif de l’île', () => {
  it('chaque emblème a sa propre animation', () => {
    const v = ['⛺', '🪺', '🪦', '🚩', '🔮', '🌀', '🏯', '🏰'].map((e) => appearVariant(target('x', e)));
    expect(v).toEqual(['camp', 'nest', 'grave', 'warcamp', 'shrine', 'breach', 'citadel', 'fortress']);
    expect(appearVariant(target('x', '❓'))).toBe('generic');
  });
});

describe('ce qui s’anime', () => {
  const nest = target('isl_obj_0', '🪺', 5);
  it('aucun relevé sur l’appareil : rien ne s’anime, mais on retient', () => {
    const r = freshAppearances(map(nest), null, false);
    expect(r.fresh).toEqual([]);
    expect(r.seen).toEqual([appearKey(nest)]);
  });
  it('on débarque sur l’île : tout apparaît, l’un après l’autre', () => {
    const r = freshAppearances(map(nest, target('isl_obj_1', '🪺', 6)), null, true);
    expect(r.fresh.map((a) => a.delay)).toEqual([0, APPEAR_STAGGER_MS]);
    expect(r.fresh[0]).toMatchObject({ x: 10, y: 20, variant: 'nest' });
  });
  it('seul le nouveau s’anime', () => {
    const r = freshAppearances(map(nest, target('isl_obj_1', '🪺', 6)), [appearKey(nest)], false);
    expect(r.fresh.map((a) => a.id)).toEqual(['isl_obj_1']);
  });
  it('un cimetière abattu qui se relève (même id, nouvelle date) réapparaît', () => {
    const r = freshAppearances(map(target('isl_obj_0', '🪦', 99)), [appearKey(target('isl_obj_0', '🪦', 5))], false);
    expect(r.fresh).toHaveLength(1);
  });
  it('un lieu tenu ou qui n’est pas un objectif d’île ne s’anime pas', () => {
    const r = freshAppearances(map(target('isl_obj_0', '🪺', 1, 'player'), target('mine_1', '⛏️')), [], false);
    expect(r.fresh).toEqual([]);
  });
  it('le relevé ne garde que ce qui est encore sur la carte', () => {
    expect(freshAppearances(map(nest), ['vieux@1', appearKey(nest)], false).seen).toEqual([appearKey(nest)]);
  });
});

describe('le relevé de l’appareil', () => {
  it('aucun relevé : lecture silencieuse ; relevé sans l’île : débarquement', () => {
    expect(appearInput(null, 2)).toEqual({ seen: null, firstTime: false });
    expect(appearInput({ '1': [] }, 2)).toEqual({ seen: null, firstTime: true });
    expect(appearInput({ '2': ['a@1'] }, 2)).toEqual({ seen: ['a@1'], firstTime: false });
  });
});
