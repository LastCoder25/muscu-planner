// @vitest-environment happy-dom
//
// ⏱️ Un exo AU TEMPS compté en SÉRIES de tenues, MONTÉ pour de bon (rendu client : le SSR rend les
// `watch` inertes) : en-tête (ComboLegHead), fiche du défi, onglet 🎯 et séance générée. On y voit les
// secondes de chaque tenue, jamais les bulles de 30 s, et la saisie passe par le chrono — pas par la
// fenêtre « reps & poids ». Le même 360 porte une planche en DURÉE : ses bulles, elles, restent.
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { logicalToday } from '@/lib/challenges';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';

const D = logicalToday();
const tenue = (reps: number, extra: object = {}) => ({ date: D, reps, ...extra });
const legs = (): ComboLeg[] =>
  [
    {
      slot: 'core',
      exercise_id: 'ex_plank',
      exercise_name: 'Planche',
      muscle_primary: 'abdominaux',
      rep_weight: 0.6,
      target: 4,
      count_mode: 'sets',
      hold: true,
      rep_min: 30,
      rep_max: 60,
      sets: [tenue(45), tenue(40, { lest: 5 }), tenue(38)],
    },
    {
      slot: 'core',
      exercise_id: 'ex_wall_sit',
      exercise_name: 'Chaise',
      muscle_primary: 'quadriceps',
      rep_weight: 0.6,
      target: 120,
      count_mode: 'time',
      rep_min: 30,
      rep_max: 60,
      sets: [tenue(45)],
    },
    {
      slot: 'push',
      exercise_id: 'bench',
      exercise_name: 'Développé couché',
      muscle_primary: 'pectoraux',
      rep_weight: 1,
      target: 3,
      count_mode: 'sets',
      rep_min: 8,
      rep_max: 12,
      sets: [tenue(10, { weight: 40 })],
    },
  ] as ComboLeg[];
const COMBO = {
  id: 'c1',
  name: 'Défi 360',
  start_date: D,
  duration_days: 7,
  status: 'active',
  legs: legs(),
} as unknown as ComboChallenge;

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
};
const visible = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');

async function mountIt(
  comp: Component,
  props: Record<string, unknown>,
  route: string,
  act?: (host: HTMLElement) => Promise<void>,
): Promise<{ err: unknown; html: string }> {
  localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useComboStore } = await import('@/stores/combo');
  const { useChallengesStore } = await import('@/stores/challenges');
  const { useCharacterStore } = await import('@/stores/character');
  const s = useComboStore() as unknown as Record<string, unknown>;
  s.list = [JSON.parse(JSON.stringify(COMBO))];
  s.loaded = true;
  s.fetchMine = async () => s.list;
  const ch = useChallengesStore() as unknown as Record<string, unknown>;
  ch.fetchMine = async () => [];
  ch.fetchAchievements = async () => undefined;
  ch.unlock = async () => undefined;
  (useCharacterStore() as unknown as Record<string, unknown>).fetchMine = async () => undefined;
  const app = createApp({ render: () => h(comp, props) });
  app.use(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/session/:id', component: { render: () => null } },
      { path: '/:all(.*)*', component: { render: () => null } },
    ],
  });
  await router.replace(route);
  await router.isReady();
  app.use(router);
  app.config.warnHandler = () => {};
  let err: unknown = null;
  app.config.errorHandler = (e) => (err = e);
  const host = document.createElement('div');
  app.mount(host);
  await nextTick();
  await settle();
  if (act) {
    await act(host);
    await settle();
  }
  const html = host.innerHTML;
  app.unmount();
  return { err, html };
}

/** Le bloc d'UN exo dans une fiche : du nom à l'exo suivant. */
const block = (html: string, name: string) => {
  const parts = html.split(/<div[^>]*class="leg[ "]/);
  const hit = parts.find((p) => p.includes(name));
  expect(hit, name).toBeTruthy();
  return hit!;
};

describe('⏱️ fiche du défi : une tenue comptée en séries', () => {
  it('les secondes de chaque tenue dans la barre de séries — pas de bulles — et le chrono', async () => {
    const { default: ComboDetailPage } = await import('@/pages/ComboDetailPage.vue');
    const { err, html } = await mountIt(ComboDetailPage, {}, '/session/c1');
    expect(err).toBeNull();
    const plank = block(html, 'Planche');
    expect(plank).toContain('seg-bar');
    expect(plank).not.toContain('tb-bar'); // jamais les bulles de 30 s
    expect(visible(plank)).toMatch(/45 s/);
    expect(visible(plank)).toMatch(/40 s \+5 kg/); // le lest se lit
    expect(visible(plank)).toMatch(/38 s/);
    expect(visible(plank)).toContain('3/4 séries');
    expect(plank).toContain('leg-actions'); // chrono / minuteur
    expect(plank).toContain('dur-adds'); // + 15 s / 30 s / 1 min
    expect(plank).toContain('hold-muscle'); // pastille du muscle visé
    // La barre n'ajoute pas de série en un tap (il n'y a pas de fenêtre reps & poids pour une tenue).
    expect(plank).not.toMatch(/class="seg-bar tap"/);
    expect(plank).not.toContain('Ajouter une série : Planche');
    // Le « ＋ » de la prochaine case n'y est pas non plus.
    expect(visible(plank)).not.toContain('＋');
  }, 30_000);

  it('la même planche en DURÉE garde ses bulles, et un exo en reps garde sa barre d’avant', async () => {
    const { default: ComboDetailPage } = await import('@/pages/ComboDetailPage.vue');
    const { html } = await mountIt(ComboDetailPage, {}, '/session/c1');
    const chaise = block(html, 'Chaise');
    expect(chaise).toContain('tb-bar');
    expect(chaise).not.toContain('seg-bar');
    const bench = block(html, 'Développé couché');
    expect(bench).toContain('seg-bar tap');
    expect(visible(bench)).toMatch(/10×40kg/);
    expect(bench).not.toContain('leg-actions');
  }, 30_000);
});

describe('⏱️ fiche du défi : les gestes sur la barre de tenues', () => {
  /** Le bloc DOM d'un exo (par son nom), pour y cliquer. */
  const legEl = (host: HTMLElement, name: string) =>
    [...host.querySelectorAll<HTMLElement>('.leg')].find((e) => e.textContent?.includes(name))!;
  const title = (host: HTMLElement) => host.querySelector('.sl-title')?.textContent?.trim() ?? '';

  it('toucher une case FAITE ouvre l’éditeur de tenue (secondes + lest), pas la fenêtre reps & poids', async () => {
    const { default: ComboDetailPage } = await import('@/pages/ComboDetailPage.vue');
    let seen = { sec: '', setlog: 'x' };
    const { err } = await mountIt(ComboDetailPage, {}, '/session/c1', async (host) => {
      expect(host.querySelector('[data-test="hold-edit-sec"]')).toBeNull();
      (legEl(host, 'Planche').querySelector('.seg.on') as HTMLElement).click();
      await settle();
      seen = {
        sec: (host.querySelector('[data-test="hold-edit-sec"]') as HTMLInputElement)?.value,
        setlog: title(host),
      };
    });
    expect(err).toBeNull();
    expect(seen.sec).toBe('45');
    expect(seen.setlog).toBe(''); // la fenêtre reps & poids ne s'est pas ouverte
  }, 30_000);

  it('toucher la barre n’ajoute rien (le chrono le fait) — alors que pour un exo en reps elle ouvre la saisie', async () => {
    const { default: ComboDetailPage } = await import('@/pages/ComboDetailPage.vue');
    const seen: string[] = [];
    const { err } = await mountIt(ComboDetailPage, {}, '/session/c1', async (host) => {
      (legEl(host, 'Planche').querySelector('.seg-bar') as HTMLElement).click();
      await settle();
      seen.push(title(host));
      (legEl(host, 'Développé couché').querySelector('.seg-bar') as HTMLElement).click();
      await settle();
      seen.push(title(host));
    });
    expect(err).toBeNull();
    expect(seen).toEqual(['', 'Développé couché']);
  }, 30_000);
});

describe('⏱️ onglet 🎯 : une tenue comptée en séries', () => {
  it('secondes par tenue, chrono sur sa ligne, aucune bulle', async () => {
    const { default: ChallengesPage } = await import('@/pages/ChallengesPage.vue');
    const { err, html } = await mountIt(ChallengesPage, {}, '/?mode=combo');
    expect(err).toBeNull();
    const idx = html.indexOf('Planche');
    expect(idx).toBeGreaterThan(-1);
    const zone = html.slice(idx, idx + 6000).split('Chaise')[0]!;
    expect(zone).toContain('seg-bar hold');
    expect(zone).not.toContain('tb-bar');
    expect(visible(zone)).toMatch(/45 s/);
    expect(visible(zone)).toMatch(/38 s/);
    expect(zone).toContain('cl-actions');
  }, 30_000);
});

describe('⏱️ séance générée : une tenue comptée en séries', () => {
  it('la config propose « séries » (reste N séries), puis le runner pose des tenues au chrono', async () => {
    const { default: ComboSessionPage } = await import('@/pages/ComboSessionPage.vue');
    let config = '';
    let plankRow = '';
    const { err, html } = await mountIt(ComboSessionPage, {}, '/session/c1', async (host) => {
      config = host.innerHTML;
      plankRow =
        [...host.querySelectorAll<HTMLElement>('.exo-row')].find((r) =>
          r.textContent?.includes('Planche'),
        )?.innerHTML ?? '';
      const rows = [...host.querySelectorAll<HTMLElement>('.exo-row')];
      const row = rows.find((r) => r.textContent?.includes('Planche'))!;
      (row.querySelector('.exo-check') as HTMLElement).click();
      await nextTick();
      (host.querySelector('.full-width') as HTMLElement).click();
      await settle();
    });
    expect(err).toBeNull();
    // Config : l'exo se règle en SÉRIES (pas en secondes) avec le muscle visé.
    expect(visible(config)).toMatch(/reste 1 séries?/); // (accord « 1 séries » préexistant)
    // Le réglage dit « sér. », jamais « s » (qui se lirait en secondes à côté de « 30–60 s »).
    expect(visible(plankRow)).toContain('sér.');
    const stepper = (plankRow.match(/stp-u">([^<]*)</) ?? [])[1];
    expect(stepper).toBe('sér.');
    expect(plankRow).toContain('hold-muscle'); // sa ligne, pas celle de la chaise
    // Runner : le minuteur de tenue (inline) à la place de la grille reps.
    expect(html).toContain('se-sets');
    expect(html).toContain('ec-prog');
    expect(visible(html)).toMatch(/0\/1 séries/);
    expect(visible(html)).toMatch(/vise \d+ s/);
    expect(html).not.toContain('s-set"'); // pas de case reps pour la planche
  }, 30_000);
});
