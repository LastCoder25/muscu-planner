// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ResourceGains from '@/components/ResourceGains.vue';
import { useCharacterStore } from '@/stores/character';

async function setup() {
  localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  const char = useCharacterStore() as unknown as { row: Record<string, unknown> };
  char.row = {
    mana: 10,
    gold: 1000,
    summon_stones: 2,
    keys: 1,
    seals: null,
    gacha_tickets: 0,
    runes: { runes: 0, skills: [] },
    supplies: {},
  };
  const props = reactive({ energy: 50, ready: false });
  const host = document.createElement('div');
  // Les props d'un createApp ne sont PAS réactives : on passe par un rendu parent.
  const app = createApp({
    render: () => h(ResourceGains, { energy: props.energy, ready: props.ready }),
  });
  app.use(pinia);
  app.mount(host);
  return { char, props, host };
}

describe('ResourceGains — les « +N » sous le plateau', () => {
  it('rien au chargement, puis la hausse de chaque ressource', async () => {
    const { char, props, host } = await setup();
    // L'XP de fond arrive : l'énergie bondit, ce n'est PAS un gain.
    props.energy = 900;
    props.ready = true;
    await nextTick();
    await nextTick();
    expect(host.querySelector('.rg')).toBeNull();
    char.row = { ...char.row, gold: 13000, keys: 3 };
    await nextTick();
    await nextTick();
    const text = host.textContent ?? '';
    expect(host.querySelectorAll('.rg-chip').length).toBe(2);
    expect(text).toContain('🪙');
    expect(text).toContain('🗝️');
  });
  it('une dépense ne s’affiche pas', async () => {
    const { char, props, host } = await setup();
    props.ready = true;
    await nextTick();
    char.row = { ...char.row, gold: 10 };
    await nextTick();
    await nextTick();
    expect(host.querySelector('.rg')).toBeNull();
  });
  it('l’or ne revient pas avant une heure', async () => {
    const { char, props, host } = await setup();
    props.ready = true;
    await nextTick();
    char.row = { ...char.row, gold: 2000 };
    await nextTick();
    await nextTick();
    expect(host.textContent ?? '').toContain('🪙');
    (host.querySelector('.rg-chips') as HTMLElement).click();
    await nextTick();
    char.row = { ...char.row, gold: 3000 };
    await nextTick();
    await nextTick();
    // Le bandeau fermé s'efface (transition) en restant un instant dans le DOM : seuls les vivants comptent.
    const live = host.querySelectorAll('.rg:not(.rg-leave-active) .rg-chip');
    expect(live.length).toBe(0);
  });
  it('le mana non plus (comme l’or), chacun avec sa propre heure', async () => {
    const { char, props, host } = await setup();
    props.ready = true;
    await nextTick();
    char.row = { ...char.row, mana: 20 };
    await nextTick();
    await nextTick();
    expect(host.textContent ?? '').toContain('💠');
    (host.querySelector('.rg-chips') as HTMLElement).click();
    await nextTick();
    // Une pierre de mana de plus, puis de l'or (jamais annoncé) : l'or sort, pas le mana.
    char.row = { ...char.row, mana: 21, gold: 1500 };
    await nextTick();
    await nextTick();
    const live = [...host.querySelectorAll('.rg:not(.rg-leave-active) .rg-chip')];
    expect(live.map((c) => c.textContent ?? '').join(' ')).not.toContain('💠');
    expect(live.map((c) => c.textContent ?? '').join(' ')).toContain('🪙');
  });
});
