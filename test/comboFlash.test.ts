// @vitest-environment happy-dom
//
// ✨ Halo sur la série qu'on vient de faire (Défi 360) : le store retient la dernière série ajoutée
// pendant quelques secondes, les écrans l'entourent d'un flash.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { useComboStore } from '@/stores/combo';
import { bubbleInSpan, isJustAdded, setSpan, type ComboChallenge, type ComboLeg } from '@/lib/combo';

const D = '2099-01-02';
const leg = (id: string, over: Partial<ComboLeg> = {}) =>
  ({
    slot: 'push',
    exercise_id: id,
    exercise_name: id,
    rep_weight: 1,
    target: 5,
    count_mode: 'sets',
    sets: [],
    ...over,
  }) as unknown as ComboLeg;
const combo = (legs: ComboLeg[]) =>
  ({
    id: 'c1',
    name: '360',
    status: 'active',
    start_date: D,
    duration_days: 7,
    legs,
  }) as unknown as ComboChallenge;

describe('isJustAdded / setSpan (purs)', () => {
  it('la série n°n (à partir de 1) du bon exo, et seulement elle', () => {
    const j = { exerciseId: 'ex_a', index: 2, key: 1 };
    expect(isJustAdded(j, 'ex_a', 3)).toBe(true);
    expect(isJustAdded(j, 'ex_a', 2)).toBe(false);
    expect(isJustAdded(j, 'ex_b', 3)).toBe(false);
    expect(isJustAdded(null, 'ex_a', 3)).toBe(false);
  });
  it('setSpan : la série commence là où s’arrêtait le cumul des précédentes', () => {
    const l = leg('ex_plank', {
      count_mode: 'time',
      sets: [
        { date: D, reps: 20 },
        { date: D, reps: 45 },
        { date: D, reps: 30 },
      ],
    });
    expect(setSpan(l, 0)).toEqual([0, 20]);
    expect(setSpan(l, 1)).toEqual([20, 65]);
    expect(setSpan(l, 2)).toEqual([65, 95]);
  });
});

describe('bubbleInSpan : les bulles touchées par une série de durée', () => {
  const b = (n: number) => ({ n, cap: 30 });
  it('une série de 20 à 65 s touche les bulles 1, 2 et 3, pas la 4', () => {
    const sp: [number, number] = [20, 65];
    expect([1, 2, 3, 4].map((n) => bubbleInSpan(b(n), sp))).toEqual([true, true, true, false]);
  });
  it('des bornes qui se touchent seulement ne comptent pas (0–30 ne touche pas la bulle 2)', () => {
    expect([1, 2].map((n) => bubbleInSpan(b(n), [0, 30]))).toEqual([true, false]);
    expect([2, 3].map((n) => bubbleInSpan(b(n), [30, 60]))).toEqual([true, false]);
  });
  it('sans halo en cours, aucune bulle', () => {
    expect(bubbleInSpan(b(1), null)).toBe(false);
  });
  it('la dernière bulle plus courte (objectif non multiple de 30) se touche sur SA durée', () => {
    expect(bubbleInSpan({ n: 2, cap: 10 }, [38, 45])).toBe(true);
    expect(bubbleInSpan({ n: 2, cap: 10 }, [41, 50])).toBe(false);
  });
});

describe('le store retient la série qu’on vient d’ajouter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  const setup = () => {
    const s = useComboStore();
    s.list = [combo([leg('ex_a'), leg('ex_b')])];
    return s;
  };

  it('addSet pose le halo sur la série ajoutée, puis le retire tout seul', () => {
    const s = setup();
    s.addSet('c1', 'ex_a', D, 10, 20);
    expect(s.justAdded).toMatchObject({ exerciseId: 'ex_a', index: 0 });
    s.addSet('c1', 'ex_a', D, 10, 20);
    expect(s.justAdded).toMatchObject({ exerciseId: 'ex_a', index: 1 });
    vi.advanceTimersByTime(2_100);
    expect(s.justAdded).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(s.justAdded).toBeNull();
  });
  it('un nouvel ajout relance le délai (la 2e série garde son halo entier)', () => {
    const s = setup();
    s.addSet('c1', 'ex_a', D, 10, 20);
    vi.advanceTimersByTime(1_500);
    s.addSet('c1', 'ex_b', D, 8, 20);
    vi.advanceTimersByTime(1_500);
    expect(s.justAdded).toMatchObject({ exerciseId: 'ex_b', index: 0 });
    vi.advanceTimersByTime(1_000);
    expect(s.justAdded).toBeNull();
  });
  it('une série refusée (exo terminé, 0 rep) ne flashe pas', () => {
    const s = setup();
    s.addSet('c1', 'ex_a', D, 0, 20);
    expect(s.justAdded).toBeNull();
    s.list = [combo([leg('ex_a', { target: 1, sets: [{ date: D, reps: 5 }] })])];
    s.addSet('c1', 'ex_a', D, 5, 20);
    expect(s.justAdded).toBeNull();
  });
  it('une série posée avec une heure PASSÉE (fin de séance générée) ne flashe pas', () => {
    const s = setup();
    s.addSet('c1', 'ex_a', D, 10, 20, false, null, Date.now() - 60_000);
    expect(s.justAdded).toBeNull();
  });
});

describe('câblage : les écrans posent la classe du halo', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('liste et fiche du 360', () => {
    expect(src('../src/pages/ChallengesPage.vue')).toContain(
      "'set-flash': isJustAdded(comboStore.justAdded, leg.exercise_id, n)",
    );
    expect(src('../src/pages/ComboDetailPage.vue')).toContain(
      "'set-flash': isJustAdded(combo.justAdded, leg.exercise_id, n)",
    );
  });
  it('bulles de durée', () => {
    expect(src('../src/components/ComboTimeBubbles.vue')).toContain("'set-flash': bubbleInSpan(b, span)");
  });
  it('séance générée : la série validée et le compteur des exos en durée', () => {
    const s = src('../src/pages/ComboSessionPage.vue');
    expect(s).toContain("'set-flash': flashKey === `${i}-${j}`");
    expect(s).toContain("'set-flash': isFlashExo(i)");
  });
  it('le halo est défini une fois, avec une variante mouvement réduit', () => {
    const s = src('../src/css/app.scss');
    expect(s).toMatch(/@keyframes set-flash/);
    expect(s).toMatch(/\.set-flash\s*\{[^}]*animation: set-flash/);
    expect(s).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.set-flash/);
  });
});
