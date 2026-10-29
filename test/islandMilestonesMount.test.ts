// @vitest-environment happy-dom
//
// 🏅 Les tuiles de jalons de la fiche d'île : montées pour de vrai (rendu client), car le
// typecheck ne voit pas qu'un `v-if` ne s'affiche jamais.
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ArchipelPanel from '@/components/ArchipelPanel.vue';
import { islandById } from '@/lib/archipelago';
import { milestoneViews } from '@/lib/islandMilestones';

async function render(
  props: Record<string, unknown>,
  act?: (host: HTMLElement) => void,
): Promise<{ html: string; host: HTMLElement; err: unknown }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(ArchipelPanel, props) });
  app.use(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
  });
  await router.replace('/');
  await router.isReady();
  app.use(router);
  app.config.warnHandler = () => {};
  let err: unknown = null;
  app.config.errorHandler = (e) => (err = e);
  const host = document.createElement('div');
  app.mount(host);
  await nextTick();
  host.querySelector<HTMLElement>('.arch-cur')?.click();
  await nextTick();
  if (act) {
    act(host);
    await nextTick();
  }
  const html = host.innerHTML;
  const out = { html, host, err };
  app.unmount();
  return out;
}

const map3 = (milestones?: Record<string, { at: number }>) => ({
  archipel: { island: 3, levelCap: 60, levelFloor: 41, ...(milestones ? { milestones } : {}) },
});

describe('🏅 ArchipelPanel : les jalons', () => {
  it('île 3 : quatre tuiles, le prochain en avant avec son texte et son niveau', async () => {
    const views = milestoneViews(map3({ isl_mile_3_1: { at: 1 } }), 47);
    const { html, err } = await render({
      island: islandById(3),
      busy: false,
      now: 1,
      milestones: views,
    });
    expect(err).toBeNull();
    expect(html).toContain('data-test="milestones"');
    expect(html.match(/class="am-tile /g)).toHaveLength(4);
    expect(html).toContain('La veille des cimetières');
    expect(html).toContain('✓ atteint');
    expect(html).toContain('🎯 niveau 50');
    expect(html).toContain('niveau 55');
    expect(html).toContain('niveau 60');
    expect(html.match(/data-state="next"/g)).toHaveLength(1);
    // Le texte du prochain est déplié d'office ; celui d'un jalon à venir non.
    expect(html).toContain('Le ressac du Bastion des marées');
    expect(html).not.toContain('La citadelle des morts se dresse');
  });

  it('toucher une tuile atteinte déplie son texte ; le coffre du dernier est annoncé', async () => {
    const views = milestoneViews(map3(), 60);
    const { html } = await render(
      { island: islandById(3), busy: false, now: 1, milestones: views },
      (host) => host.querySelectorAll<HTMLElement>('.am-tile')[3]?.click(),
    );
    expect(html).toContain('Coffre : 2 runes');
  });

  it('une île sans jalon : aucun bloc', async () => {
    const { html } = await render({ island: islandById(1), busy: false, now: 1, milestones: [] });
    expect(html).not.toContain('data-test="milestones"');
  });
});
