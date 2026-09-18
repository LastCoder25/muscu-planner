// @vitest-environment happy-dom
//
// 🚪 LA PORTE QUI MANQUAIT : est-ce que le composant se MONTE ?
//
// ⚠️ POURQUOI ELLE EXISTE. La Guilde a cessé de s'ouvrir (« le bouton "Voir mes
// aventuriers" ne fonctionne plus ») parce qu'un `watch` évalue sa source DÈS LE SETUP et
// que cette source appelait une `const` fléchée déclarée cinquante lignes plus bas — une
// zone morte temporelle. AUCUNE des cinq portes ne pouvait le voir : le typecheck ne suit
// pas la TDZ à travers une closure, le lint non plus, le build compile sans exécuter, et
// le smoke UI s'arrête à l'écran de connexion. C'est l'utilisateur qui l'a trouvé.
//
// ⚠️ IL FAUT UN RENDU CLIENT, pas du SSR : en SSR, Vue rend les `watch` INERTES — un
// premier essai en `renderToString` passait au vert avec le défaut en place, donc il
// n'aurait rien gardé. Mesuré : avec la TDZ remise, ce test échoue ; sans elle, il passe.
//
// ⚠️ ET IL FAUT DES DONNÉES : avec un vivier VIDE, la boucle qui déclenche l'appel fautif
// ne s'exécute jamais et le défaut reste invisible. Un seul aventurier suffit.
import { describe, it, expect } from 'vitest';
import { createApp, h, type Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

/** Monte un composant pour de vrai et rend l'erreur de setup s'il y en a une. */
async function mountIt(comp: Component, props: Record<string, unknown>, row?: unknown) {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (row !== undefined) {
    const { useCharacterStore } = await import('@/stores/character');
    (useCharacterStore() as unknown as { row: unknown }).row = row;
  }
  const app = createApp({ render: () => h(comp, props) });
  app.use(pinia);
  // Les composants Quasar ne sont pas enregistrés ici : leurs warnings « failed to
  // resolve » sont attendus et sans rapport avec ce qu'on éprouve — l'exécution du setup.
  app.config.warnHandler = () => {};
  let err: unknown = null;
  app.config.errorHandler = (e) => (err = e);
  app.mount(document.createElement('div'));
  return err;
}

/** Un personnage minimal mais NON VIDE : c'est le vivier peuplé qui réveille les boucles. */
const ROW = {
  adventurers: [
    { id: 'a1', name: 'Léa', seed: 1, path: ['guerrier'], level: 3, xp: 0 },
    { id: 'a2', name: 'Marc', seed: 2, path: ['archer'], level: 5, xp: 10, busyUntil: 9e15 },
  ],
  inventory: [],
  equipped: {},
  talents: [],
  buildings: [{ typeId: 'guild', level: 3, slot: 0, collectedAt: 0 }],
  adv_gear: { stock: [], forges: [] },
};

describe('🚪 montage des écrans (erreurs de setup)', () => {
  it('GuildPanel s’ouvre avec un vivier peuplé', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    expect(await mountIt(GuildPanel, { open: true }, ROW)).toBeNull();
  }, 30_000);

  it('GuildPanel s’ouvre aussi sur un vivier VIDE, et en mode recrutement', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    const vide = { ...ROW, adventurers: [] };
    expect(await mountIt(GuildPanel, { open: true }, vide)).toBeNull();
    expect(await mountIt(GuildPanel, { open: true, mode: 'recruit' }, ROW)).toBeNull();
  }, 30_000);

  it('AdventurerPortrait se monte, avec et sans teinte d’état', async () => {
    const { default: P } = await import('@/components/AdventurerPortrait.vue');
    const base = {
      adv: ROW.adventurers[0],
      look: { shape: 'polyvalent' as const, gear: {} },
      familiar: null,
      power: 42,
      gear: [],
    };
    expect(await mountIt(P, base)).toBeNull();
    expect(await mountIt(P, { ...base, tone: 'busy', state: '🐫 en route · 2 h' })).toBeNull();
  }, 30_000);
});
