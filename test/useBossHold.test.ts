// @vitest-environment happy-dom
// ⏱️ Le chrono du boss : le temps vient de l'horloge, et rien ne fuit (intervalle, Wake Lock).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { useBossHold } from '@/composables/useBossHold';

type Hold = ReturnType<typeof useBossHold>;

function mountHold() {
  let hold!: Hold;
  const el = document.createElement('div');
  const app = createApp(
    defineComponent({
      setup() {
        hold = useBossHold();
        return () => h('div');
      },
    }),
  );
  app.mount(el);
  return { hold, unmount: () => app.unmount() };
}

/** Faux Wake Lock : `request` ne rend la main que quand le test le décide. */
function fakeWakeLock() {
  const release = vi.fn(() => Promise.resolve());
  const pending: ((s: { release: typeof release }) => void)[] = [];
  const request = vi.fn(
    () =>
      new Promise<{ release: typeof release }>((res) => {
        pending.push(res);
      }),
  );
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { release, request, grant: () => pending.shift()?.({ release }) };
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

describe('useBossHold', () => {
  it('le temps suit l’horloge (Date.now), pas le nombre de ticks', async () => {
    vi.useFakeTimers();
    const { hold, unmount } = mountHold();
    hold.start();
    vi.setSystemTime(Date.now() + 47_000); // l'onglet dormait : aucun tick entre-temps
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(Math.floor(hold.seconds.value)).toBe(47);
    expect(hold.tier.value).toBe(2);
    expect(hold.effective.value).toBe(49); // 30 + 15×1,1 + 2×1,2 = 48,9
    unmount();
  });

  it('le démontage libère l’intervalle ET le Wake Lock', async () => {
    vi.useFakeTimers();
    const wl = fakeWakeLock();
    const { hold, unmount } = mountHold();
    hold.start();
    wl.grant();
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(wl.release).toHaveBeenCalledTimes(1);
  });

  it('un verrou accordé APRÈS l’arrêt est relâché aussitôt (pas de fuite)', async () => {
    const wl = fakeWakeLock();
    const { hold, unmount } = mountHold();
    hold.start();
    hold.stop(); // la demande est encore en vol
    wl.grant();
    await Promise.resolve();
    await Promise.resolve();
    expect(wl.release).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('au retour sur l’onglet, une demande déjà en vol n’est pas redoublée', async () => {
    const wl = fakeWakeLock();
    const { hold, unmount } = mountHold();
    hold.start();
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wl.request).toHaveBeenCalledTimes(1);
    wl.grant();
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    expect(wl.release).toHaveBeenCalledTimes(1);
  });

  it('annonce toujours le palier suivant, et « Maximum » au plafond', async () => {
    vi.useFakeTimers();
    const { hold, unmount } = mountHold();
    hold.start();
    const at = async (s: number) => {
      vi.setSystemTime(hold.startedAt.value + s * 1000);
      vi.advanceTimersByTime(200);
      await nextTick();
      return (
        hold.next.value && { mult: hold.next.value.mult, left: Math.ceil(hold.next.value.left) }
      );
    };
    expect(await at(20)).toEqual({ mult: 1.1, left: 10 });
    expect(await at(51)).toEqual({ mult: 1.3, left: 9 });
    expect(await at(160)).toEqual({ mult: 2, left: 5 });
    expect(await at(170)).toBeNull();
    expect(await at(400)).toBeNull();
    unmount();
  });
});
