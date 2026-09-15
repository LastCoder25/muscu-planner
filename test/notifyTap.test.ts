import { describe, it, expect, vi } from 'vitest';
import { withTapToDismiss } from '@/lib/notifyTap';

type Opts = Record<string, unknown> & { attrs?: Record<string, unknown> };

function fakeNotify() {
  const calls: Opts[] = [];
  const close = vi.fn();
  const notify = Object.assign(
    (o: Opts | string) => {
      calls.push(o as Opts);
      return close;
    },
    { setDefaults: vi.fn() },
  );
  return { notify, calls, close };
}

describe('👆 toucher une notification la ferme (v0.860)', () => {
  it('le clic sur la notification appelle SA fonction de fermeture', () => {
    const { notify, calls, close } = fakeNotify();
    const n = withTapToDismiss(notify);
    const ret = n({ message: 'x', type: 'positive' });
    expect(ret).toBe(close);
    (calls[0]!.attrs!.onClick as (e: unknown) => void)({});
    expect(close).toHaveBeenCalledTimes(1);
    expect(calls[0]!.type).toBe('positive');
  });
  it('une notification en simple texte est aussi fermable', () => {
    const { notify, calls, close } = fakeNotify();
    withTapToDismiss(notify)('bonjour');
    expect(calls[0]!.message).toBe('bonjour');
    (calls[0]!.attrs!.onClick as (e: unknown) => void)({});
    expect(close).toHaveBeenCalled();
  });
  it('garde les attributs et le clic de l’appelant', () => {
    const { notify, calls, close } = fakeNotify();
    const own = vi.fn();
    withTapToDismiss(notify)({ message: 'x', attrs: { 'data-x': 1, onClick: own } });
    expect(calls[0]!.attrs!['data-x']).toBe(1);
    (calls[0]!.attrs!.onClick as (e: unknown) => void)('evt');
    expect(own).toHaveBeenCalledWith('evt');
    expect(close).toHaveBeenCalled();
  });
  it('setDefaults reste accessible sur la fonction enveloppée', () => {
    const { notify } = fakeNotify();
    const n = withTapToDismiss(notify);
    n.setDefaults({ position: 'top' });
    expect(notify.setDefaults).toHaveBeenCalledWith({ position: 'top' });
  });
});
