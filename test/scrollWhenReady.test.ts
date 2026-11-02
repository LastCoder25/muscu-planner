// @vitest-environment happy-dom
//
// 📜 Après le calcul du planificateur, l'écran défile pour mettre « Tout lancer » et les
// propositions en haut. On monte le vrai composable et on regarde `scrollIntoView`.
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { useScrollWhenReady } from '@/composables/useScrollWhenReady';

function setup(opts: { running?: boolean; ready?: boolean } = {}) {
  const running = ref(opts.running ?? false);
  const ready = ref(opts.ready ?? true);
  const el = ref<HTMLElement | null>(null);
  const spy = vi.fn();
  const Host = defineComponent({
    setup() {
      useScrollWhenReady(running, () => ready.value, el);
      return () =>
        h('div', {
          ref: (n) => {
            el.value = n as HTMLElement | null;
            if (n) (n as HTMLElement).scrollIntoView = spy;
          },
        });
    },
  });
  createApp(Host).mount(document.createElement('div'));
  return { running, ready, spy };
}
const flush = async () => {
  await nextTick();
  await nextTick();
};

describe('useScrollWhenReady', () => {
  it('calcul terminé avec un résultat : l’écran défile, cible en haut', async () => {
    const { running, spy } = setup({ running: true });
    running.value = false;
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({ block: 'start' });
  });

  it('⚠️ rien à montrer (aucune proposition) : pas de défilement', async () => {
    const { running, spy } = setup({ running: true, ready: false });
    running.value = false;
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('⚠️ le départ du calcul ne défile pas (seule la fin compte)', async () => {
    const { running, spy } = setup();
    running.value = true;
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('⚠️ ouvrir un panneau qui garde des résultats ne fait pas sauter l’écran', async () => {
    const { spy } = setup({ running: false, ready: true });
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });
});
