// @vitest-environment happy-dom
//
// ⏱ Contrôle du CHRONO d'une tenue (v1.370.0) : « j'ai tenu 20 s mais le temps d'arrêter le chrono il
// est monté à 21 s : je veux corriger ». Après « Terminer » en mode chrono, le temps relevé est
// modifiable avant d'être enregistré ; le minuteur, lui, enregistre sa cible exacte sans passer par là.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { DEFAULT_HOLD_SETTINGS, type HoldSettings } from '@/lib/holdTimer';

const S = (over: Partial<HoldSettings>): HoldSettings => ({ ...DEFAULT_HOLD_SETTINGS, ...over });

describe('HoldTimerButton : contrôle du chrono avant enregistrement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());
  const mount = async (settings: Partial<HoldSettings>) => {
    localStorage.setItem('muscu:hold:settings', JSON.stringify(S(settings)));
    const { default: HoldTimerButton } = await import('@/components/HoldTimerButton.vue');
    const got: number[] = [];
    const app = createApp({
      render: () => h(HoldTimerButton, { label: 'Jambes tendues', onFinish: (s: number) => got.push(s) }),
    });
    app.config.warnHandler = () => {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    const q = (t: string) => host.querySelector(`[data-test="${t}"]`) as HTMLElement | null;
    const tap = async (t: string) => {
      expect(q(t), t).not.toBeNull();
      q(t)!.click();
      await nextTick();
    };
    const runFor = async (ms: number) => {
      await tap('hold-start');
      vi.advanceTimersByTime(ms);
      await nextTick();
    };
    return { host, got, q, tap, runFor, unmount: () => app.unmount() };
  };
  const val = (m: Awaited<ReturnType<typeof mount>>) => m.q('hold-review-val')?.textContent?.trim();

  it('chrono arrêté à 21 s : le contrôle montre 0:21, RIEN n’est enregistré, −1 → 20 s, « Valider » enregistre 20', async () => {
    const m = await mount({ mode: 'chrono', prepSec: 0 });
    await m.runFor(21_000);
    await m.tap('hold-stop');
    expect(m.q('hold-review')).not.toBeNull();
    expect(val(m)).toBe('0:21');
    expect(m.got).toEqual([]);
    await m.tap('hold-review-minus');
    expect(val(m)).toBe('0:20');
    expect(m.q('hold-review-hint')?.textContent).toContain('retiré 1 s');
    await m.tap('hold-review-ok');
    expect(m.got).toEqual([20]);
    expect(m.q('hold-review')).toBeNull();
    m.unmount();
  });
  it('les pastilles −5 / −2 / +2 / +5 corrigent d’un coup ; le temps ne descend jamais sous 1 s', async () => {
    const m = await mount({ mode: 'chrono', prepSec: 0 });
    await m.runFor(30_000);
    await m.tap('hold-stop');
    await m.tap('hold-review--5');
    expect(val(m)).toBe('0:25');
    await m.tap('hold-review-2');
    expect(val(m)).toBe('0:27');
    for (let i = 0; i < 8; i++) await m.tap('hold-review--5');
    expect(val(m)).toBe('0:01');
    expect((m.q('hold-review-minus') as HTMLButtonElement).disabled).toBe(true);
    await m.tap('hold-review-ok');
    expect(m.got).toEqual([1]);
    m.unmount();
  });
  it('le temps corrigé ne dépasse jamais la borne haute des tenues (10 min)', async () => {
    const m = await mount({ mode: 'chrono', prepSec: 0 });
    await m.runFor(598_000);
    await m.tap('hold-stop');
    await m.tap('hold-review-5');
    expect(val(m)).toBe('10:00');
    expect((m.q('hold-review-plus') as HTMLButtonElement).disabled).toBe(true);
    await m.tap('hold-review-ok');
    expect(m.got).toEqual([600]);
    m.unmount();
  });
  it('« Ne pas enregistrer » abandonne la série', async () => {
    const m = await mount({ mode: 'chrono', prepSec: 0 });
    await m.runFor(12_000);
    await m.tap('hold-stop');
    await m.tap('hold-review-cancel');
    expect(m.got).toEqual([]);
    expect(m.q('hold-review')).toBeNull();
    m.unmount();
  });
  it('quitter l’écran pendant le contrôle garde le temps relevé (rien ne se perd en silence)', async () => {
    const m = await mount({ mode: 'chrono', prepSec: 0 });
    await m.runFor(18_000);
    await m.tap('hold-stop');
    m.unmount();
    expect(m.got).toEqual([18]);
  });
  it('le MINUTEUR ne passe pas par le contrôle : « Terminer » enregistre tout de suite', async () => {
    const m = await mount({ mode: 'timer', targetSec: 30, prepSec: 0 });
    await m.runFor(12_000);
    await m.tap('hold-stop');
    expect(m.q('hold-review')).toBeNull();
    expect(m.got).toEqual([12]);
    m.unmount();
  });
});
