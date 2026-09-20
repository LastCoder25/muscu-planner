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
import { createRouter, createMemoryHistory } from 'vue-router';
import { deployCap, deployedCount } from '@/lib/adventurers';

/** Monte un composant pour de vrai et rend l'erreur de setup s'il y en a une. */
async function mountIt(
  comp: Component,
  props: Record<string, unknown>,
  row?: unknown,
  /** Amorce d'AUTRES stores que `character`, une fois la pinia active. */
  seed?: () => Promise<void>,
  /** Route initiale — ⚠️ nécessaire pour atteindre un ONGLET : un écran à onglets ne rend
   *  que celui qui est actif, donc son code resterait invisible sur l'onglet par défaut. */
  route = '/',
  /** Reçoit le HTML rendu — ⚠️ c'est la seule façon de voir qu'un fixture périmé fait
   *  rendre un ÉTAT VIDE : sans ça, le montage reste vert et le test devient creux. */
  html?: (out: string) => void,
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (row !== undefined) {
    const { useCharacterStore } = await import('@/stores/character');
    (useCharacterStore() as unknown as { row: unknown }).row = row;
  }
  if (seed) await seed();
  const app = createApp({ render: () => h(comp, props) });
  app.use(pinia);
  // ⚠️ UN ROUTEUR, même factice : sans lui `useRoute()` rend `undefined` et tout écran qui
  // lit `route.query` au setup échoue pour une raison qui n'existe pas en vrai. C'est le
  // harnais qu'il faut élargir, pas l'écran qu'il faut contourner.
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
  });
  await router.replace(route);
  await router.isReady();
  app.use(router);
  // Les composants Quasar ne sont pas enregistrés ici : leurs warnings « failed to
  // resolve » sont attendus et sans rapport avec ce qu'on éprouve — l'exécution du setup.
  app.config.warnHandler = () => {};
  let err: unknown = null;
  app.config.errorHandler = (e) => (err = e);
  const host = document.createElement('div');
  app.mount(host);
  html?.(host.innerHTML);
  return err;
}

/** Un personnage minimal mais NON VIDE : c'est le vivier peuplé qui réveille les boucles.
 *
 *  ⚠️ LE PANTHÉON DOIT ÊTRE BÂTI, sinon le panneau ne rend que son état vide (« construis
 *  le Panthéon ») et le test devient CREUX — il ne monterait plus rien de ce qu'on croit
 *  éprouver. Le fixture disait `guild`, un type retiré par la fusion (v0.949).
 *
 *  ⚠️ ET IL PORTE UN CHAMPION EN COLLECTION (`deployed: false`) : c'est le seul état qui
 *  exerce le compteur de déploiement et la ligne « en tout ». */
const ROW = {
  adventurers: [
    { id: 'a1', name: 'Léa', seed: 1, path: ['guerrier'], level: 3, xp: 0 },
    { id: 'a2', name: 'Marc', seed: 2, path: ['archer'], level: 5, xp: 10, busyUntil: 9e15 },
    {
      id: 'a3',
      name: 'Orsène',
      seed: 3,
      path: [],
      level: 4,
      xp: 0,
      championId: 'orsene',
      copies: 1,
      deployed: false,
    },
  ],
  inventory: [],
  equipped: {},
  talents: [],
  buildings: [{ typeId: 'pantheon', level: 3, slot: 0, collectedAt: 0 }],
  adv_gear: { stock: [], forges: [] },
};

describe('🚪 montage des écrans (erreurs de setup)', () => {
  it('GuildPanel s’ouvre avec un vivier peuplé', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    let out = '';
    expect(await mountIt(GuildPanel, { open: true }, ROW, undefined, '/', (h) => (out = h))).toBe(
      null,
    );
    // ⚠️ LE COMPTEUR OPPOSE LE DÉPLOIEMENT AU PLAFOND, jamais la collection : Panthéon 3
    // → `deployCap` 2, deux legacy engagés, un champion en collection. Il affichait
    // « 3/2 » parce qu'il comptait `roster.length` contre une COPIE de la formule.
    const cap = deployCap(3);
    const engages = deployedCount(ROW.adventurers as Parameters<typeof deployedCount>[0]);
    expect(out).toContain(`${engages}/${cap}`);
    // …et la collection se dit À PART, sinon on perdrait le champion mis au banc.
    expect(out).toContain(`${ROW.adventurers.length} en tout`);
  }, 30_000);

  it('GuildPanel s’ouvre aussi sur un vivier VIDE — et l’invocation reste offerte', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    const vide = { ...ROW, adventurers: [] };
    expect(await mountIt(GuildPanel, { open: true }, vide)).toBeNull();
    // ⚠️ Le mode « recrutement » a disparu avec l'arbre de classes (v0.951) : c'est
    // l'INVOCATION qui remplit le vivier, et elle est offerte dans les deux cas.
    const riche = { ...vide, mana: 5_000 };
    expect(await mountIt(GuildPanel, { open: true }, riche)).toBeNull();
  }, 30_000);

  it('GuildPanel : une pièce en stock ATTEND un porteur (case en appel)', async () => {
    // ⚠️ IL FAUT DES DONNÉES : avec un stock VIDE, `pendingAdvGear` rend une carte vide et
    // le chemin « case en appel » du portrait n'est jamais exécuté — il resterait invisible.
    // Ici une épée de guerrier libre face à Léa (guerrier, classe commune) : elle attend.
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    const avecStock = {
      ...ROW,
      adv_gear: {
        forges: [],
        stock: [
          {
            id: 'w1',
            lineage: 'guerrier',
            slot: 'weapon',
            name: 'Épée',
            emoji: '🗡️',
            rarity: 'commun',
            roll: 0.5,
            level: 3,
            effect: { type: 'damage_pct', value: 10 },
          },
        ],
      },
    };
    expect(await mountIt(GuildPanel, { open: true }, avecStock)).toBeNull();
    // Et l'onglet Stock, qui rend les tuiles de pièces.
    expect(await mountIt(GuildPanel, { open: true, tab: 'stock' }, avecStock)).toBeNull();
  }, 30_000);

  it('VillagePlots se monte, Équipementier ouvert sur un aventurier', async () => {
    // ⚠️ La feuille de l'Équipementier calcule le plan de forge (`planOutfitBatch`) et le
    // coût de chaque ligne DÈS l'ouverture : c'est du travail fait au setup, donc
    // exactement ce que cette porte existe pour éprouver.
    const { default: VillagePlots } = await import('@/components/VillagePlots.vue');
    const avecForge = {
      ...ROW,
      gold: 50_000,
      buildings: [...ROW.buildings, { typeId: 'outfitter', level: 5, slot: 1, collectedAt: 0 }],
      inventory: [
        {
          id: 'i1',
          slot: 'weapon',
          name: 'Lame',
          emoji: '🗡️',
          rarity: 'rare',
          roll: 0.5,
          level: 20,
          effect: { type: 'damage_pct', value: 10 },
        },
      ],
    };
    const props = { heroLevel: 30, now: Date.now(), slot: 1 };
    expect(await mountIt(VillagePlots, props, avecForge)).toBeNull();
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
  // ⚠️ AventurePage N'EST PAS ICI, et c'est une décision mesurée. Monté dans ce harnais,
  // l'écran rend son formulaire de CRÉATION DE PSEUDO : le store `character` recharge sa
  // ligne au montage et écrase celle qu'on lui pose, donc `char.row` est null. Le test
  // passait au VERT en n'ayant rendu ni la carte des mondes, ni les onglets, ni rien de ce
  // qu'on voulait éprouver — vérifié en lisant le HTML produit, et confirmé par une mutation
  // qui cassait `nextDungeonItem` sans faire rougir quoi que ce soit. Un test creux donne la
  // confiance sans la couvrir. L'y remettre suppose de pouvoir empêcher ce rechargement.

  it('l’Agenda se monte, avec des frappes de boss entre amis', async () => {
    // ⚠️ CE QUE CE TEST COUVRE, ET CE QU'IL NE COUVRE PAS. Il éprouve le SETUP de l'écran
    // (les stores instanciés, les imports résolus) — pas le rendu des entrées : `loading`
    // vaut `true` au montage, donc le `computed` qui les bâtit n'est jamais évalué.
    // MESURÉ : une erreur glissée dans la boucle des boss laisse ce test au VERT. C'est
    // pourquoi la règle vit dans `bossAgendaEntries` (lib) et y est testée pour de bon.
    // On amorce quand même l'auth et des frappes : c'est l'état réaliste, et `myHits`
    // filtre sur l'id de l'auth.
    const { default: AgendaPage } = await import('@/pages/AgendaPage.vue');
    const seed = async () => {
      const { useAuthStore } = await import('@/stores/auth');
      const { useFriendBossStore } = await import('@/stores/friendBoss');
      (useAuthStore() as unknown as { user: unknown }).user = { id: 'me' };
      const fb = useFriendBossStore() as unknown as {
        bosses: unknown[];
        members: unknown[];
        hits: unknown[];
        loaded: boolean;
      };
      const now = Date.now();
      fb.bosses = [
        {
          id: 'b1',
          ownerId: 'me',
          family: 'push',
          exerciseId: 'ex_pushup',
          exerciseName: 'Pompes',
          repWeight: 1,
          tier: null,
          createdAt: now,
          startAt: now,
          defeatedAt: null,
          hpTotal: 120_000,
          damage: 0,
        },
      ];
      fb.members = [
        {
          bossId: 'b1',
          userId: 'me',
          pseudo: 'Last',
          status: 'accepted',
          units: 50,
          claimed: false,
        },
      ];
      // Deux frappes le MÊME jour : c'est le regroupement par jour qu'on éprouve.
      fb.hits = [
        { id: 'h1', bossId: 'b1', userId: 'me', units: 20, createdAt: now },
        { id: 'h2', bossId: 'b1', userId: 'me', units: 30, createdAt: now },
      ];
      fb.loaded = true; // sinon le montage lance un fetch Supabase inutile
    };
    expect(await mountIt(AgendaPage, {}, undefined, seed)).toBeNull();
  }, 30_000);
});
