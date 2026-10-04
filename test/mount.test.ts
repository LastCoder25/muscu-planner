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
import { makeBoss } from './helpers/friendBoss';
import ReportDetail from '@/components/ReportDetail.vue';
import { siegeDetail } from '@/lib/reportDetail';
import { createApp, h, nextTick, type Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { advGradeBadge, advXpToNext, engageCap } from '@/lib/adventurers';

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
  /** Un geste avant la lecture du HTML (déplier une ligne, par exemple) : ce qui ne se rend
   *  qu'après un clic resterait sinon invisible au test. */
  act?: (host: HTMLElement) => void | Promise<void>,
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
  // ⚠️ Un tour de rendu : ce qu'un écran pose dans `onMounted` (un rejeu qui saute à son
  // état final, par exemple) n'est peint qu'au flush suivant.
  await nextTick();
  if (act) {
    await act(host);
    await nextTick();
  }
  html?.(host.innerHTML);
  // ⚠️ ON DÉMONTE, et ce n'est pas de l'hygiène : `HoldGame` est le premier composant du
  // projet à installer une boucle 60 Hz, qui sans ça tournerait jusqu'à la fin du fichier
  // en retenant tout son scope. Et ça fait enfin PASSER le test par `onBeforeUnmount`,
  // que rien ne couvrait — un composant qui plante au démontage restait vert.
  app.unmount();
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
    },
  ],
  inventory: [],
  equipped: {},
  talents: [],
  buildings: [{ typeId: 'pantheon', level: 3, slot: 0, collectedAt: 0 }],
  adv_gear: { stock: [], forges: [] },
};

describe('🚪 montage des écrans (erreurs de setup)', () => {
  // 🏠 La base comme un lieu fixe : qui y est, et une sélection qui propose les lieux tenus.
  it('BaseGarrisonSheet montre la base et propose d’envoyer la sélection', async () => {
    const { default: BaseGarrisonSheet } = await import('@/components/BaseGarrisonSheet.vue');
    let out = '';
    const control = {
      kind: 'mine',
      owner: 'player',
      garrison: [],
      retakes: 0,
      faction: 'bandits',
      size: 1,
    };
    expect(
      await mountIt(
        BaseGarrisonSheet,
        {
          modelValue: true,
          champs: [ROW.adventurers[0]],
          away: 2,
          milHome: 2,
          heroHome: true,
          heroStatus: '✅ à la base',
          targets: [{ id: 'm1', emo: '⛏️', label: 'Mine d’or', control }],
          legMin: () => 42,
          busy: false,
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
        (host) => host.querySelector<HTMLElement>('.bgs-mil-tile')?.click(),
      ),
    ).toBeNull();
    expect(out).toContain('Ta base');
    expect(out).toContain('2 champions ailleurs');
    // 🦸 Le héros vit DANS la grille des effectifs, en première tuile — plus au-dessus.
    const grid = out.indexOf('class="bgs-pick"');
    expect(grid).toBeGreaterThan(-1);
    expect(out.indexOf('class="bgs-hero')).toBeGreaterThan(grid);
    expect(out.indexOf('class="bgs-hero')).toBeLessThan(out.indexOf('class="car-adv'));
    expect(out).toContain('Envoyer en renfort');
    expect(out).toContain('Mine d’or');
  });

  // 🏝️ Les cinq îles en sélecteur : l'active pleine, les verrouillées sous cadenas ; toucher
  // une île déplie sa fiche.
  it("ArchipelPanel : les cinq îles, l'active marquée, la fiche au toucher", async () => {
    const { default: ArchipelPanel } = await import('@/components/ArchipelPanel.vue');
    const { islandById } = await import('@/lib/archipelago');
    let closed = '';
    let open = '';
    const props = { island: islandById(1), busy: false, now: Date.now() };
    await mountIt(ArchipelPanel, props, undefined, undefined, '/', (h) => (closed = h));
    // Replié : la seule pastille de l'île actuelle, ni îles ni fiche.
    expect(closed).toContain('class="arch-cur"');
    expect(closed).toContain('Île 1 · ');
    expect(closed.match(/class="isl(?=[ "])/g)).toBeNull();
    expect(closed).not.toContain('Tu es ici');
    expect(
      await mountIt(
        ArchipelPanel,
        props,
        undefined,
        undefined,
        '/',
        (h) => (open = h),
        (host) => host.querySelector<HTMLElement>('.arch-cur')?.click(),
      ),
    ).toBeNull();
    // Déplié : cinq îles, l'active marquée, les quatre autres sous cadenas, et sa fiche.
    expect(open.match(/class="isl(?=[ "])/g)?.length).toBe(5);
    expect(open).toContain('aria-current="location"');
    expect(open.split('🔒').length - 1).toBeGreaterThanOrEqual(4);
    expect(open).toContain('Tu es ici');
    expect(open).toContain('Le Fort des pillards');
    // 🏝️ Étape 7 : tout le monde joue l'archipel, plus d'interrupteur pour en sortir.
    expect(open).not.toContain('Quitter le mode archipel');
  });

  // ⛵ L'île 2 ouverte : toucher sa silhouette montre le bouton de traversée ; la milice de
  // l'île active est dite.
  it('ArchipelPanel : la traversée vers une île ouverte, et la milice de chaque île', async () => {
    const { default: ArchipelPanel } = await import('@/components/ArchipelPanel.vue');
    const { islandById } = await import('@/lib/archipelago');
    let here = '';
    let there = '';
    const props = {
      island: islandById(1),
      busy: false,
      now: Date.UTC(2026, 9, 2, 10, 30),
      openIds: [1, 2],
      visitedIds: [1],
      blocks: { 1: null, 2: null, 3: null, 4: null, 5: null },
      away: {},
      militia: { 1: 4 },
    };
    const openHead = (host: HTMLElement) => host.querySelector<HTMLElement>('.arch-cur')?.click();
    await mountIt(ArchipelPanel, props, undefined, undefined, '/', (h) => (here = h), openHead);
    expect(here).toMatch(/🛡️ 4 miliciens/);
    await mountIt(
      ArchipelPanel,
      props,
      undefined,
      undefined,
      '/',
      (h) => (there = h),
      async (host) => {
        host.querySelector<HTMLElement>('.arch-cur')?.click();
        await nextTick();
        host.querySelectorAll<HTMLElement>('.isl')[1]?.click();
        await nextTick();
      },
    );
    expect(there).toContain('Traverser vers l');
    expect(there).toContain('avec le héros, tu choisis les champions');
    // ⛵ Option A : une île déjà visitée où attendent des champions propose de les faire venir,
    // même si le héros est retenu (sa traversée bloquée n'empêche pas la leur).
    let back = '';
    await mountIt(
      ArchipelPanel,
      {
        ...props,
        visitedIds: [1, 2],
        fetchable: { 2: 3 },
        blocks: { 1: null, 2: 'Ton héros doit être rentré pour embarquer.' },
      },
      undefined,
      undefined,
      '/',
      (h) => (back = h),
      async (host) => {
        host.querySelector<HTMLElement>('.arch-cur')?.click();
        await nextTick();
        host.querySelectorAll<HTMLElement>('.isl')[1]?.click();
        await nextTick();
      },
    );
    expect(back).toMatch(/Faire venir 3\s+champions/);
    expect(back).toContain('avec ou sans le héros');
  });

  it('CrossingSheet : héros imposé vers une île neuve, facultatif vers une île visitée', async () => {
    const { default: CrossingSheet } = await import('@/components/CrossingSheet.vue');
    const adv = (id: string) =>
      ({ id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0 }) as unknown;
    const base = {
      modelValue: true,
      from: 1,
      to: 2,
      activeId: 1,
      heroBlock: null,
      candidates: [adv('a'), adv('b')],
      departAt: Date.UTC(2026, 9, 3, 18),
      heroDepartAt: Date.UTC(2026, 9, 3, 20),
    };
    let forced = '';
    await mountIt(
      CrossingSheet,
      { ...base, heroMode: 'forced' },
      undefined,
      undefined,
      '/',
      (h) => (forced = h),
    );
    expect(forced).toContain('Première traversée vers cette île');
    // ⛵ Vers l'île suivante : pas de choix, tout le monde part et l'île quittée est pacifiée.
    expect(forced).toContain('Tous tes champions te suivent');
    expect(forced).toContain('île 1 est pacifiée');
    expect(forced).not.toMatch(/2\/2\s+champions/);
    expect(forced).toContain('Le départ attend le retour de tes troupes');
    let back = '';
    await mountIt(
      CrossingSheet,
      { ...base, from: 2, to: 1, activeId: 2, heroMode: 'optional' },
      undefined,
      undefined,
      '/',
      (h) => (back = h),
    );
    // Au retour, on choisit toujours qui embarque.
    expect(back).toMatch(/2\/2\s+champions/);
    expect(back).not.toContain('Tous tes champions te suivent');
    let alone = '';
    await mountIt(
      CrossingSheet,
      { ...base, heroMode: 'optional' },
      undefined,
      undefined,
      '/',
      (h) => (alone = h),
      (host) => host.querySelector<HTMLElement>('.cs-hero')?.click(),
    );
    expect(alone).toContain('Les champions naviguent seuls');
  });

  // 🏝️ Le sol d'une île : la côte, le port et la forteresse portuaire nommée.
  it('IslandTerrain : côte et décor, sans port ni forteresse dessinés (ce sont des lieux fixes)', async () => {
    const { default: IslandTerrain } = await import('@/components/IslandTerrain.vue');
    const { islandTerrain } = await import('@/lib/islandTerrain');
    const { MAP_VIEW } = await import('@/lib/expedition');
    let out = '';
    expect(
      await mountIt(
        IslandTerrain,
        { t: islandTerrain(2), view: MAP_VIEW },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('it-land');
    expect(out).not.toContain('⚓ Port');
    expect(out).not.toContain('it-fort');
    expect(out).toContain('k-pine');
  });

  // 🧝 Le héros est une tuile PARMI les effectifs : cochable, ou grisé AVEC sa raison.
  it('HeroPickTile : coché, ou grisé avec la raison', async () => {
    const { default: HeroPickTile } = await import('@/components/HeroPickTile.vue');
    let on = '';
    await mountIt(
      HeroPickTile,
      { on: true, block: null, sub: 'sans XP', gain: 12 },
      undefined,
      undefined,
      '/',
      (h) => (on = h),
    );
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('+12 %');
    let off = '';
    await mountIt(
      HeroPickTile,
      { on: false, block: 'à l’infirmerie', sub: 'sans XP' },
      undefined,
      undefined,
      '/',
      (h) => (off = h),
    );
    expect(off).toContain('disabled');
    expect(off).toContain('à l’infirmerie');
  });

  // 👥 v0.1108 : toucher un voyage montre son équipe en tuiles LECTURE SEULE — ni case
  // cochée, ni cible au clavier (elles ne proposent rien).
  it('AdvPickTile en lecture seule ne se présente pas comme un choix', async () => {
    const { default: AdvPickTile } = await import('@/components/AdvPickTile.vue');
    let out = '';
    const adv = ROW.adventurers[0];
    expect(
      await mountIt(
        AdvPickTile,
        { adv, on: true, readonly: true },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('Léa');
    expect(out).toContain('tabindex="-1"');
    expect(out).not.toContain('aria-pressed');
  }, 30_000);

  // 🔮🏆 v0.1305 : une relique et un trophée montrent l'illustration de LEUR pouvoir ; une
  // arme garde son icône (aucune image devinée pour un autre emplacement).
  it('ItemIcon illustre le pouvoir d’une relique et d’un trophée', async () => {
    const { default: ItemIcon } = await import('@/components/ItemIcon.vue');
    const rendu = async (item: Record<string, unknown>) => {
      let out = '';
      expect(await mountIt(ItemIcon, { item }, ROW, undefined, '/', (h) => (out = h))).toBeNull();
      return out;
    };
    const base = { name: 'x', rarity: 'commun', level: 1, roll: 0.5 };
    expect(await rendu({ ...base, slot: 'relic', power: 'brasier' })).toContain(
      'src="/powers/relic-brasier.webp"',
    );
    expect(await rendu({ ...base, slot: 'trophy', power: 'achever' })).toContain(
      'src="/powers/trophy-achever.webp"',
    );
    const arme = await rendu({
      ...base,
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 5 },
    });
    expect(arme).not.toContain('/powers/');
  }, 30_000);

  // 🧭 v0.1154 : la ligne des disponibilités, partagée par l'Aventure et la carte. Sur la
  // carte, les champions LIBRES se détaillent par rang (une pastille par rang représenté).
  it('AvailabilityLine détaille les champions libres par rang', async () => {
    const { default: AvailabilityLine } = await import('@/components/AvailabilityLine.vue');
    let out = '';
    expect(
      await mountIt(
        AvailabilityLine,
        { now: 1, byRank: true },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    // 2 libres sur 3 (Marc est en convoi) ; tous Bronze → UNE pastille, « 2/3 », avec une
    // MÉDAILLE à la couleur du rang (plus le nom en lettres, v0.1158) : le nom ne vit plus que
    // dans l’infobulle et l’aria-label. Le
    // total 🏅 disparaît : les rangs le remplacent, on ne dit pas deux fois la même chose.
    const pills = [...out.matchAll(/class="av-rank[^"]*"[^>]*>(.*?)<\/span>\s*<\/span>/g)].map(
      (m) => m[1]!.replace(/<[^>]+>/g, '').trim(),
    );
    expect(pills).toEqual(['2/3']);
    expect(out).toContain('class="av-medal"');
    expect(out).toContain('aria-label="Bronze : 2 disponible(s) sur 3"');
    expect(out).not.toContain('av-ico">🏅');
    // Sans milice, pas de pastille 🛡️ (une pastille 0/0 n'apprend rien).
    expect(out).not.toContain('mil-portrait');
  }, 30_000);

  // 🐞 Signalé : « ça me met le héros dispo alors qu'il est en attaque combinée ».
  it('AvailabilityLine : un héros engagé dans une attaque combinée n’est pas « dispo »', async () => {
    const { default: AvailabilityLine } = await import('@/components/AvailabilityLine.vue');
    const wing = {
      originId: null,
      members: [],
      hero: true,
      legMin: 30,
      departAt: 5_000_000,
      returnAt: 9_000_000,
      state: 'waiting',
    };
    const attacks = [
      {
        id: 'atk',
        poi: { id: 'cp', type: 'camp', level: 5, x: 0, y: 0, distNorm: 0.5 },
        seed: 1,
        createdAt: 0,
        arriveAt: 6_000_000,
        midAt: 7_000_000,
        playerLevel: 5,
        supplies: [],
        wings: [wing, { ...wing, originId: 'pt1', hero: false, members: ['a1'] }],
      },
    ];
    let out = '';
    expect(
      await mountIt(
        AvailabilityLine,
        { now: 1 },
        { ...ROW, attacks },
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    // La case du héros, pas « disponible(s) » des champions dans l'infobulle.
    expect(out).toMatch(/🦸<\/span>⚔️/);
    expect(out).not.toMatch(/🦸<\/span>dispo/);
  }, 30_000);

  // 🐞 Signalé : « comment on voit que le héros est en traversée ? » — la ligne disait « dispo ».
  it('AvailabilityLine : un héros en traversée n’est pas « dispo »', async () => {
    const { default: AvailabilityLine } = await import('@/components/AvailabilityLine.vue');
    const crossing = {
      from: 1,
      to: 2,
      bookedAt: 0,
      departAt: 3_600_000,
      arriveAt: 10_800_000,
      ids: [],
    };
    const map = { seed: 1, spawnCount: 0, nextSpawnAt: 0, pois: [], crossing };
    let out = '';
    expect(
      await mountIt(
        AvailabilityLine,
        { now: 1 },
        { ...ROW, expedition_map: map },
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toMatch(/🦸<\/span>⛵/);
    expect(out).toMatch(/title="Héros en traversée vers l.{1,6}île 2/);
  }, 30_000);

  // 🎯 Demandé : l'apport de chaque membre à la réussite, sur sa tuile.
  it('AdvPickTile affiche ce qu’il apporte à la réussite', async () => {
    const { default: AdvPickTile } = await import('@/components/AdvPickTile.vue');
    const adv = ROW.adventurers[0];
    const rendu = async (gain: number | null) => {
      let out = '';
      await mountIt(AdvPickTile, { adv, on: false, gain }, ROW, undefined, '/', (h) => (out = h));
      return out;
    };
    expect(await rendu(12)).toContain('🎯 +12 %');
    expect(await rendu(0)).toMatch(/ca-gain zero[^>]*>🎯 0 %/);
    expect(await rendu(-5)).toMatch(/ca-gain neg[^>]*>🎯 −5 %/);
    expect(await rendu(null)).not.toContain('ca-gain');
  }, 30_000);

  // 💰 Le plateau de ressources, partagé par l'Aventure et la carte (demandé 2026-09-30).
  it('ResourceTray affiche les ressources du personnage, et une partie seulement si demandé', async () => {
    const { default: ResourceTray } = await import('@/components/ResourceTray.vue');
    const row = {
      ...ROW,
      mana: 1234,
      gold: 56789,
      summon_stones: 7,
      keys: 3,
      gacha_tickets: 2,
      seals: undefined,
      runes: { runes: 3, skills: [], opened: 0, comp: 2 },
    };
    let all = '';
    expect(
      await mountIt(ResourceTray, { energy: 420 }, row, undefined, '/', (h) => (all = h)),
    ).toBeNull();
    for (const ico of ['⚡', '💠', '🪙', '🔮', '🗝️', '🔱', '⚜️', '🎟️']) expect(all).toContain(ico);
    let main = '';
    await mountIt(
      ResourceTray,
      { energy: 420, part: 'main' },
      row,
      undefined,
      '/',
      (h) => (main = h),
    );
    expect(main).toContain('⚡');
    expect(main).toContain('💠');
    expect(main).not.toContain('🪙');
  }, 30_000);

  // 🛡️ 2026-09-28 : les miliciens postés sur des places fortes / tous ceux qui existent.
  it('AvailabilityLine compte les miliciens postés sur le total', async () => {
    const { default: AvailabilityLine } = await import('@/components/AvailabilityLine.vue');
    const control = {
      kind: 'mine',
      owner: 'player',
      garrison: ['mil:1', 'mil:2', 'a1'],
      reinforcing: [{ id: 'mil:3', at: 9e15 }],
      retakes: 0,
      faction: 'bandits',
      size: 1,
    };
    const poi = { id: 'ctl_mine', type: 'control', level: 5, x: 0, y: 0, distNorm: 0.5 };
    const row = {
      ...ROW,
      base: { militia: { home: 4, producedAt: 0, seq: 9 } },
      expedition_map: { pois: [{ ...poi, spawnedAt: 0, expiresAt: 9e15, control }] },
    };
    let out = '';
    expect(
      await mountIt(AvailabilityLine, { now: 1 }, row, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    // 4 disponibles à la base sur 7 (3 hors de la base : 2 postés + 1 en route).
    // Le milicien a désormais son portrait (l'emoji 🛡️ n'est plus que le repli).
    expect(out).toMatch(
      /av-ico">(<!--[^]*?-->)?<img[^>]*mil-portrait[^>]*><\/span><b[^>]*>4<\/b>\/7/,
    );
    expect(out).toContain("4 milicien(s) disponible(s) sur l'île, 3 posté(s)");
    // 🏝️ Nouvelle île, personne à la base : la pastille dit quand vient le prochain.
    const fresh = {
      ...ROW,
      buildings: [{ slot: 0, level: 10, typeId: 'barracks', collectedAt: 0 }],
      base: { militia: { home: 0, producedAt: 0, seq: 0 } },
    };
    let out2 = '';
    expect(
      await mountIt(AvailabilityLine, { now: 1 }, fresh, undefined, '/', (h) => (out2 = h)),
    ).toBeNull();
    expect(out2).toMatch(/<b[^>]*>0<\/b>\/0<span[^>]*class="av-cap"[^>]*>·\+1 dans /);
  }, 30_000);

  // 🗺️ v0.1202 : la carte d'expédition est découpée — ses trois morceaux se montent seuls.
  const MAP_POIS = [
    {
      id: 'p1',
      type: 'mine',
      level: 3,
      x: 90,
      y: 90,
      distNorm: 0.3,
      spawnedAt: 0,
      expiresAt: 9e15,
    },
    {
      id: 'p2',
      type: 'archive',
      level: 5,
      x: 110,
      y: 95,
      distNorm: 0.4,
      spawnedAt: 0,
      expiresAt: 9e15,
    },
  ];
  it('🗺️ MapPoiLayer dessine les lieux, la sélection et les lieux grisés', async () => {
    const { default: MapPoiLayer } = await import('@/components/MapPoiLayer.vue');
    let out = '';
    expect(
      await mountIt(
        MapPoiLayer,
        {
          pois: MAP_POIS,
          selectedId: 'p1',
          dimmedKey: 'p2',
          veiledKey: '',
          imminentKey: '',
          target: null,
          travelTargets: [{ id: 'g1', poi: { ...MAP_POIS[0], id: 'p9' }, kind: 'party' }],
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    // Deux lieux à prendre + une cible d'équipe.
    expect(out.match(/class="poi[ "]/g)?.length).toBe(3);
    expect(out).toMatch(/class="poi sel"/);
    expect(out).toMatch(/class="poi dim"/);
    expect(out).toContain('van-target party');
  }, 30_000);
  it('⚔️ MapPoiLayer signale un point de contrôle sous attaque imminente', async () => {
    const { default: MapPoiLayer } = await import('@/components/MapPoiLayer.vue');
    const fort = {
      ...MAP_POIS[0],
      id: 'c1',
      type: 'control',
      control: { kind: 'mine', owner: 'player', garrison: [], collectedAt: 0 },
    } as unknown as (typeof MAP_POIS)[number];
    const render = async (key: string) => {
      let out = '';
      await mountIt(
        MapPoiLayer,
        {
          pois: [fort],
          selectedId: null,
          dimmedKey: '',
          veiledKey: '',
          imminentKey: key,
          target: null,
          travelTargets: [],
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      );
      return out;
    };
    expect(await render('c1')).toContain('ctl-alert');
    expect(await render('')).not.toContain('ctl-alert');
  }, 30_000);
  it('🔴 MapPoiLayer : point rouge sous un lieu attaqué, fort agrandi', async () => {
    const { default: MapPoiLayer } = await import('@/components/MapPoiLayer.vue');
    const fort = {
      ...MAP_POIS[0],
      id: 'c1',
      type: 'control',
      control: { kind: 'citadel', owner: 'enemy', garrison: [], collectedAt: 0 },
    } as unknown as (typeof MAP_POIS)[number];
    const render = async (attackedKey: string) => {
      let out = '';
      await mountIt(
        MapPoiLayer,
        {
          pois: [MAP_POIS[0], fort],
          selectedId: null,
          dimmedKey: '',
          veiledKey: '',
          imminentKey: '',
          attackedKey,
          target: null,
          travelTargets: [],
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      );
      return out;
    };
    const one = await render(MAP_POIS[0]!.id);
    expect(one.match(/attack-dot/g)?.length).toBe(1);
    expect(await render('')).not.toContain('attack-dot');
    // Le fort (citadelle) est agrandi, le lieu ordinaire non.
    expect(one).toMatch(/scale\(1\.35\)/);
    expect(one.match(/scale\(/g)?.length).toBe(1);
  }, 30_000);
  it('⚫ MapPoiLayer dessine la garnison en points sous le fort', async () => {
    const { default: MapPoiLayer } = await import('@/components/MapPoiLayer.vue');
    const fort = {
      ...MAP_POIS[0],
      id: 'c1',
      type: 'control',
      control: { kind: 'mine', owner: 'player', garrison: ['a'], collectedAt: 0 },
    } as unknown as (typeof MAP_POIS)[number];
    const render = async (garrisonKey: string) => {
      let out = '';
      await mountIt(
        MapPoiLayer,
        {
          pois: [fort],
          selectedId: null,
          dimmedKey: '',
          veiledKey: '',
          imminentKey: '',
          garrisonKey,
          target: null,
          travelTargets: [],
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      );
      return out;
    };
    const held = await render('c1:cmrff');
    expect(held.match(/class="d-[cmrf]"/g)?.length).toBe(5);
    expect(held).toContain('class="d-r"');
    expect(held).not.toMatch(/ctl-dots[^"]*empty/);
    // Personne ne tient le point : les places libres le disent en rouge.
    expect(await render('c1:fff')).toMatch(/ctl-dots[^"]*empty/);
    expect(await render('')).not.toContain('ctl-dots');
  }, 30_000);

  it('🗂️ PoiCard : la fiche d’un lieu — nom, rang, infos, trajet/réussite, sceau', async () => {
    const { default: PoiCard } = await import('@/components/PoiCard.vue');
    const { poiRank } = await import('@/lib/poiRank');
    const rift = { ...MAP_POIS[0], id: 'r1', type: 'rift' as const, riftPeril: false };
    let out = '';
    expect(
      await mountIt(
        PoiCard,
        {
          poi: rift,
          rank: poiRank(rift),
          sub: { foe: '🐺 Bêtes ×4/12', res: 'mana 💠' },
          facts: [
            { icon: '💠', label: 'Si refermée', value: '~120' },
            { icon: '🎯', label: 'Fermeture', value: '72 %', go: true, cls: 'wp-good' },
          ],
          ambushLeft: 0,
          isRift: true,
          warband: null,
          sealStock: 2,
          busySeal: false,
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('🐺 Bêtes ×4/12');
    expect(out).toContain('Si refermée');
    // Trajet/réussite sur LEUR ligne, pas mélangés aux infos.
    const go = out.indexOf('class="pc-go"');
    expect(go).toBeGreaterThan(out.indexOf('Si refermée'));
    expect(out.indexOf('Fermeture')).toBeGreaterThan(go);
    expect(out).toContain('pc-fact wp-good');
    expect(out).toContain('Comment marche une faille');
    expect(out).toContain('Poser un sceau de brèche');
  }, 30_000);

  it('⚔️ PoiCard : un lieu déjà attaqué garde ce qu’il rapporte, sans notes ni sceau', async () => {
    const { default: PoiCard } = await import('@/components/PoiCard.vue');
    const { poiRank } = await import('@/lib/poiRank');
    const rift = { ...MAP_POIS[0], id: 'r1', type: 'rift' as const, riftPeril: true };
    let out = '';
    await mountIt(
      PoiCard,
      {
        poi: rift,
        rank: poiRank(rift),
        sub: { foe: '🐺 Bêtes ×4/12', res: 'mana 💠' },
        engaged: 'Une équipe y est partie — en route',
        facts: [{ icon: '💠', label: 'Si refermée', value: '~120' }],
        ambushLeft: 0,
        isRift: true,
        warband: null,
        sealStock: 2,
        busySeal: false,
      },
      ROW,
      undefined,
      '/',
      (h) => (out = h),
    );
    expect(out).toContain('Une équipe y est partie');
    expect(out).toContain('Si refermée');
    expect(out).not.toContain('Poser un sceau de brèche');
    expect(out).not.toContain('Comment marche une faille');
    expect(out).not.toContain('pc-alert');
  }, 30_000);

  it('⚔️ MapPoiLayer : la cible d’un voyage est sélectionnable', async () => {
    const { default: MapPoiLayer } = await import('@/components/MapPoiLayer.vue');
    let out = '';
    await mountIt(
      MapPoiLayer,
      {
        pois: MAP_POIS,
        selectedId: 'p9',
        dimmedKey: '',
        veiledKey: '',
        imminentKey: '',
        target: null,
        travelTargets: [
          { id: 'g1', poi: { ...MAP_POIS[0], id: 'p9' }, kind: 'party', down: false },
        ],
      },
      ROW,
      undefined,
      '/',
      (h) => (out = h),
    );
    expect(out).toMatch(/van-target party sel/);
  }, 30_000);

  it('🎒 SupplyPicker : utiles en tuiles, inutiles repliés avec leur raison', async () => {
    const { default: SupplyPicker } = await import('@/components/SupplyPicker.vue');
    const { SUPPLIES } = await import('@/lib/supplies');
    let out = '';
    const rows = [
      { id: 'rations' as const, def: SUPPLIES.rations, n: 2, on: true, why: null },
      { id: 'lanterne' as const, def: SUPPLIES.lanterne, n: 1, on: false, why: 'pas une faille' },
    ];
    // Replié par défaut : l'en-tête dit ce qui est emporté, aucune tuile.
    let folded = '';
    expect(
      await mountIt(SupplyPicker, { rows }, undefined, undefined, '/', (h) => (folded = h)),
    ).toBeNull();
    expect(folded).toContain('1 emporté');
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).not.toContain('class="sup on"');
    expect(
      await mountIt(
        SupplyPicker,
        { rows, startOpen: true },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out.match(/class="sup on"/g)?.length).toBe(1);
    expect(out).toContain('Inutiles ici');
    expect(out).toContain('pas une faille');
    let vide = '';
    await mountIt(SupplyPicker, { rows: [] }, undefined, undefined, '/', (h) => (vide = h));
    expect(vide).toContain('aucun en stock');
  }, 30_000);

  // 🗺️ Demandé : voir la carte d'une île rangée pour gérer sa milice sans traverser.
  it('🗺️ RemoteIslandMap : la carte d’une île rangée, ses lieux tenus et leur milice', async () => {
    const { default: RemoteIslandMap } = await import('@/components/RemoteIslandMap.vue');
    const { ISLANDS } = await import('@/lib/archipelago');
    const isl = ISLANDS[0]!;
    const map = {
      seed: 1,
      pois: [{ id: 'ctl_mine', type: 'control', x: 110, y: 95, level: 10 }],
      archipel: { island: 1, levelCap: 20, levelFloor: 1 },
    };
    let out = '';
    expect(
      await mountIt(
        RemoteIslandMap,
        {
          island: isl,
          map,
          remote: [{ id: 'ctl_mine', label: 'Mine fortifiée', emoji: '⛏️', militia: 5, room: 0 }],
          reserve: 10,
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain(`Île 1 · ${isl.name}`);
    expect(out).toContain('10 en réserve');
    expect(out).toContain('Mine fortifiée');
    expect(out).toMatch(/class="rim-n"[^>]*>5</);
    // 🏰 L'île 1 est la capitale : sa carte rangée montre la base.
    expect(out).toContain('mt-wall');
  }, 30_000);

  // 🏘️ Signalé : « on a une base sur l'île 2 alors qu'on devait avoir un village portuaire ».
  it('🏘️ MapTown : la base sur l’île 1 et hors archipel, un gros lieu fixe pour le village du port des îles 2 à 5', async () => {
    const { default: MapTown } = await import('@/components/MapTown.vue');
    for (const [island, base] of [
      [null, true],
      [1, true],
      [2, false],
      [5, false],
    ] as const) {
      let out = '';
      expect(await mountIt(MapTown, { island }, ROW, undefined, '/', (h) => (out = h))).toBeNull();
      expect(out.includes('mt-wall'), `île ${island}`).toBe(base);
      expect(out.includes('mt-place'), `île ${island}`).toBe(!base);
      // 👑 Demandé : ta base porte un cadre à part, base comme village.
      expect(out, `île ${island}`).toContain('qg mine');
    }
  }, 30_000);

  // 🏰 Demandé : « juste un gros lieu fixe » pour la forteresse — à l'échelle d'une citadelle.
  it('🏰 MapPoiLayer : la forteresse est un GROS lieu fixe, une mine un lieu fixe ordinaire', async () => {
    const { default: MapPoiLayer } = await import('@/components/MapPoiLayer.vue');
    const ctl = (id: string, kind: string) => ({
      id,
      type: 'control',
      x: 100,
      y: 100,
      level: 20,
      control: { kind, owner: 'enemy', garrison: [] },
    });
    const scaleOf = async (kind: string) => {
      let out = '';
      await mountIt(
        MapPoiLayer,
        {
          pois: [ctl('p', kind)],
          selectedId: null,
          dimmedKey: '',
          veiledKey: '',
          imminentKey: '',
          target: null,
          travelTargets: [],
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      );
      return { scale: out.match(/scale\(([\d.]+)\)/)?.[1], frame: out.includes('qg foe') };
    };
    // 🏰 Demandé : la forteresse adverse porte un cadre que nul autre lieu ne porte.
    expect(await scaleOf('fortress')).toEqual({ scale: '1.35', frame: true });
    expect(await scaleOf('mine')).toEqual({ scale: '1.15', frame: false });
    expect((await scaleOf('citadel')).frame).toBe(false);
  }, 30_000);

  // ⛵ Demandé : la traversée du héros apparaît dans la rangée des voyages.
  it('⛵ TripsPanel : une traversée montre les îles de départ et d’arrivée', async () => {
    const { default: TripsPanel } = await import('@/components/TripsPanel.vue');
    let out = '';
    const trip = {
      key: 'sea',
      kind: 'hero',
      who: '⛵',
      cat: 'trips',
      pending: true,
      sea: { from: 1, to: 2 },
      poi: MAP_POIS[0],
      from: MAP_POIS[0],
      time: '⏳ 1 h 02',
      pct: 0,
      back: false,
      title: 'Ton héros vers l’île 2',
      withHero: true,
      members: ['a1'],
      haul: [],
      legs: {
        go: null,
        back: '⚓ 00:00',
        detail: 'Départ à 22:00, arrivée à 00:00 (2 h de mer)',
      },
    };
    expect(
      await mountIt(
        TripsPanel,
        { trips: [trip], focus: 'sea', heroProfile: 'polyvalent' },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toMatch(/title="Île 1">🏝️<sub[^>]*>1</);
    expect(out).toMatch(/title="Île 2">\s*🏝️<sub[^>]*>2</);
    expect(out).toContain('⚓ 00:00');
    // ⛵ Demandé : une traversée prend toute la ligne (classe sea, flex-basis 100 %).
    expect(out).toMatch(/class="trip hero[^"]*sea/);
    expect(out).toMatch(/Partira vers\s+l(&#39;|')île 2/);
  }, 30_000);

  it('🧭 TripsPanel : la rangée des voyages, et l’équipe du voyage touché', async () => {
    const { default: TripsPanel } = await import('@/components/TripsPanel.vue');
    let out = '';
    const trip = {
      key: 'g1',
      kind: 'van',
      who: '⚔️',
      poi: MAP_POIS[0],
      time: '→ 1 h 20',
      pct: 40,
      back: false,
      title: 'Groupe',
      withHero: false,
      members: ['a1', 'gone'],
      haul: [{ emoji: '🪙', n: 50 }],
    };
    expect(
      await mountIt(
        TripsPanel,
        { trips: [trip], focus: 'g1', heroProfile: 'polyvalent' },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('→ 1 h 20');
    // 🧭 En haut à gauche, d'où part la troupe : la base 🏰 sans point de départ.
    expect(out).toMatch(/class="tr-from"[^>]*>🏰</);
    expect(out).toContain('Léa'); // l'équipe du voyage touché
    expect(out).toContain('plus dans ton vivier'); // le champion renvoyé depuis
    // ⚠️ À l'ALLER le butin n'est pas montré : il révélerait l'issue d'un combat à venir.
    expect(out).not.toContain('Ramène');
    // 🔙 Sans `recallable`, pas de bouton ; avec, la tuile propose le demi-tour.
    expect(out).not.toContain('Faire demi-tour');
    let rc = '';
    await mountIt(
      TripsPanel,
      { trips: [trip], focus: 'g1', heroProfile: 'polyvalent', recallable: new Set(['g1']) },
      ROW,
      undefined,
      '/',
      (h) => (rc = h),
    );
    expect(rc).toContain('Faire demi-tour');
    // ✖ Une mission ratée se voit sur la tuile, une réussite non.
    expect(out).not.toContain('tr-fail');
    let ko = '';
    await mountIt(
      TripsPanel,
      {
        trips: [
          { ...trip, key: 'k1', back: true, failed: 'lost' },
          { ...trip, key: 'k2', back: true, failed: 'turned' },
        ],
        heroProfile: 'polyvalent',
      },
      ROW,
      undefined,
      '/',
      (h) => (ko = h),
    );
    expect(ko).toContain('✖ Échec');
    expect(ko).toContain('🔙 Demi-tour');
    expect(ko).toMatch(/class="trip van back failed"/);
    // ⏳ Un départ PROGRAMMÉ : le filtre « Programmés » apparaît avec son compte, la tuile est
    // en pointillés, et l'équipe propose de l'annuler.
    let pl = '';
    await mountIt(
      TripsPanel,
      {
        trips: [trip, { ...trip, key: 'pplan_1', pending: true, cancelPlan: 'plan_1' }],
        focus: 'pplan_1',
        heroProfile: 'polyvalent',
      },
      ROW,
      undefined,
      '/',
      (h) => (pl = h),
    );
    expect(pl).toMatch(/⏳ <b[^>]*>1</);
    expect(pl).toMatch(/🧭 <b[^>]*>1</);
    expect(pl).toMatch(/class="trip van[^"]*pending/);
    expect(pl).toContain('Annuler ce départ programmé');
    expect(pl).toContain('Partira vers');
    // 🛡️ Renfort programmé : compté dans « Programmés », pas dans « Renforts » (vide → absent).
    expect(pl).not.toContain('aria-label="Renforts');
    // 🛡️🗡️ Renforts et attaques du joueur ont leur filtre ; une catégorie vide n'est pas proposée.
    let cats = '';
    await mountIt(
      TripsPanel,
      {
        trips: [
          trip,
          { ...trip, key: 'r1', cat: 'reinf' },
          { ...trip, key: 'g2', cat: 'raids' },
          { ...trip, key: 'g3', cat: 'raids' },
        ],
        focus: null,
        heroProfile: 'polyvalent',
      },
      ROW,
      undefined,
      '/',
      (h) => (cats = h),
    );
    expect(cats).toMatch(/🛡️ <b[^>]*>1</);
    expect(cats).toMatch(/🗡️ <b[^>]*>2</);
    expect(cats).toMatch(/🧭 <b[^>]*>1</);
    expect(cats).not.toContain('aria-label="Ennemis');
    expect(cats).not.toContain('aria-label="Programmés');
    // Toucher « Renforts » ne garde que le renfort.
    let onlyReinf = '';
    await mountIt(
      TripsPanel,
      {
        trips: [trip, { ...trip, key: 'r1', cat: 'reinf', time: 'RENFORT' }],
        focus: null,
        heroProfile: 'polyvalent',
      },
      ROW,
      undefined,
      '/',
      (h) => (onlyReinf = h),
      (host) => host.querySelector<HTMLElement>('.trf.trf-reinf')?.click(),
    );
    expect(onlyReinf).toContain('RENFORT');
    expect(onlyReinf).not.toContain('→ 1 h 20');
    // 🧭 Partie d'un point fixe : l'encart montre SON emoji, plus la base.
    const mine = {
      id: 'ctl_mine',
      type: 'control',
      level: 5,
      x: 1,
      y: 1,
      control: { kind: 'mine' },
    };
    let fromPt = '';
    await mountIt(
      TripsPanel,
      { trips: [{ ...trip, from: mine }], focus: null, heroProfile: 'polyvalent' },
      ROW,
      undefined,
      '/',
      (h) => (fromPt = h),
    );
    expect(fromPt).toMatch(/class="tr-from"[^>]*>⛏️</);
    // 👥 Une EXPÉDITION (pas seulement un renfort) montre les portraits de son équipe.
    expect(fromPt).toContain('class="tr-faces"');
    expect(fromPt).toMatch(/class="tr-face" title="Léa"/);
    // ⚔️ Les attaques ennemies, à la suite des voyages, au MÊME format : le lieu attaqué en
    // haut-droit (ici la mine reprise), la tenue, la marche en sous-lignage.
    const army = {
      id: 'wb',
      type: 'warband',
      level: 5,
      x: 2,
      y: 2,
      spawnedAt: 0,
      expiresAt: 9e15,
      army: { kind: 'retake', targetId: 'ctl_mine', at: 100, faction: 'undead', size: 2 },
    };
    let atk = '';
    await mountIt(
      TripsPanel,
      {
        trips: [],
        focus: null,
        heroProfile: 'polyvalent',
        attacks: [
          { army, kind: 'retake', target: mine, inMs: 30 * 60_000, size: 2, faction: 'undead' },
        ],
        holds: { wb: 82 },
        now: 50,
      },
      ROW,
      undefined,
      '/',
      (h) => (atk = h),
    );
    expect(atk).toMatch(/class="trip attack soon"/);
    expect(atk).toMatch(/class="tr-poi"[^>]*>⛏️</);
    expect(atk).toContain('🛡️ 82 %');
    expect(atk).toContain('width: 50%');
    // ⏱️ Voyages et attaques mêlés dans l'ORDRE D'ARRIVÉE : l'armée qui frappe à 100 passe
    // entre le voyage qui finit à 50 et celui qui finit à 200.
    let mix = '';
    await mountIt(
      TripsPanel,
      {
        trips: [
          { ...trip, key: 'late', title: 'VOYAGE-TARD', endsAt: 200 },
          { ...trip, key: 'early', title: 'VOYAGE-TOT', endsAt: 50 },
        ],
        focus: null,
        heroProfile: 'polyvalent',
        attacks: [{ army, kind: 'retake', target: mine, inMs: 60_000, size: 2, faction: 'undead' }],
        now: 40,
      },
      ROW,
      undefined,
      '/',
      (h) => (mix = h),
    );
    const iTot = mix.indexOf('VOYAGE-TOT');
    const iAtk = mix.indexOf('trip attack');
    const iTard = mix.indexOf('VOYAGE-TARD');
    expect(iTot).toBeGreaterThan(-1);
    expect(iTot).toBeLessThan(iAtk);
    expect(iAtk).toBeLessThan(iTard);
    // ❓ Au RETOUR, ce qu'on ramène se touche et se lit, comme dans les rapports (demandé).
    let tip = '';
    await mountIt(
      TripsPanel,
      { trips: [{ ...trip, back: true }], focus: 'g1', heroProfile: 'polyvalent' },
      ROW,
      undefined,
      '/',
      (h) => (tip = h),
      (host) => host.querySelector<HTMLElement>('.tc-haul .hp')?.click(),
    );
    expect(tip).toContain('Ramène');
    expect(tip).toContain('🪙 Or');
    expect(tip).toContain('Construire et améliorer les bâtiments');
    // ⚡ Les boosts possédés, chiffrés : les minutes perdues sont dites AVANT de toucher.
    let bst = '';
    await mountIt(
      TripsPanel,
      {
        trips: [trip],
        focus: 'g1',
        heroProfile: 'polyvalent',
        boosts: {
          key: 'g1',
          plan: {
            choices: [
              { id: 'boost10', count: 2, minutes: 10, gainMs: 600_000, lostMs: 0 },
              { id: 'boost60', count: 1, minutes: 60, gainMs: 600_000, lostMs: 3_000_000 },
            ],
          },
        },
      },
      ROW,
      undefined,
      '/',
      (h) => (bst = h),
    );
    expect(bst).toContain('⚡ 10 min');
    expect(bst).toContain('⚡ 1 h');
    expect(bst).toContain('perdues');
    let blk = '';
    await mountIt(
      TripsPanel,
      {
        trips: [trip],
        focus: 'g1',
        heroProfile: 'polyvalent',
        boosts: { key: 'g1', plan: { block: 'intercept' } },
      },
      ROW,
      undefined,
      '/',
      (h) => (blk = h),
    );
    expect(blk).toContain('on ne presse pas une interception');
  }, 30_000);

  // 📜 Demandé : toucher une tuile cale la DERNIÈRE tuile en bas de l'écran (toutes les tuiles
  // visibles, le maximum de carte au-dessus). On mesure la RANGÉE, jamais le détail dessous.
  it('🧭 TripsPanel : toucher une tuile cale la dernière tuile en bas de l’écran', async () => {
    const { revealScrollDelta } = await import('@/lib/reveal');
    const { default: TripsPanel } = await import('@/components/TripsPanel.vue');
    const { reactive } = await import('vue');
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useCharacterStore } = await import('@/stores/character');
    (useCharacterStore() as unknown as { row: unknown }).row = ROW;
    // La rangée sous l'écran, les filtres au-dessus ; le reste (dont le détail) à 0.
    const RECT: Record<string, { top: number; bottom: number }> = {
      trips: { top: 900, bottom: 1100 },
      'tr-filter': { top: 860, bottom: 890 },
    };
    const rectProto = Element.prototype as unknown as { getBoundingClientRect: () => unknown };
    const beforeRect = rectProto.getBoundingClientRect;
    rectProto.getBoundingClientRect = function (this: Element) {
      const r = RECT[this.className.split(' ')[0] ?? ''] ?? { top: 0, bottom: 0 };
      return { ...r, left: 0, right: 0, width: 0, height: r.bottom - r.top, x: 0, y: r.top };
    };
    const scrolled: number[] = [];
    const beforeScroll = window.scrollBy;
    window.scrollBy = ((o: ScrollToOptions) => scrolled.push(o.top ?? 0)) as typeof window.scrollBy;
    const state = reactive({
      trips: [
        {
          key: 'g1',
          kind: 'van',
          who: '⚔️',
          poi: MAP_POIS[0],
          time: '1 h',
          pct: 10,
          back: false,
          title: 'Groupe',
          withHero: false,
          members: ['a1'],
          haul: [],
        },
      ],
      focus: null as string | null,
      heroProfile: 'polyvalent',
      'onUpdate:focus': (k: string | null) => (state.focus = k),
    });
    const app = createApp({ render: () => h(TripsPanel, state) });
    app.use(pinia);
    app.config.warnHandler = () => {};
    const host = document.createElement('div');
    try {
      app.mount(host);
      await nextTick();
      expect(scrolled).toHaveLength(0); // rien au montage
      host.querySelector<HTMLElement>('.trip')!.click();
      for (let i = 0; i < 4; i++) await nextTick();
      expect(scrolled).toEqual([
        revealScrollDelta({ top: 860, bottom: 1100, viewTop: 0, viewBottom: window.innerHeight }),
      ]);
      // Retoucher la tuile referme l'équipe : on ne fait rien défiler.
      host.querySelector<HTMLElement>('.trip')!.click();
      for (let i = 0; i < 4; i++) await nextTick();
      expect(scrolled).toHaveLength(1);
    } finally {
      app.unmount();
      rectProto.getBoundingClientRect = beforeRect;
      window.scrollBy = beforeScroll;
    }
  }, 30_000);

  it('GuildPanel s’ouvre avec un vivier peuplé', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    let out = '';
    const row = {
      ...ROW,
      runes: { runes: 3, skills: [{ uid: 'sk1', id: 'pv', level: 1 }], opened: 1, comp: 2 },
    };
    expect(await mountIt(GuildPanel, { open: true }, row, undefined, '/', (h) => (out = h))).toBe(
      null,
    );
    // ⚠️ RÉÉCRIT (v0.958) : le compteur opposait le DÉPLOIEMENT au plafond (« 2/2 »),
    // ce qui n'a plus de sens depuis qu'aucun champion n'est mis au banc. Il annonce
    // désormais la COLLECTION, puis ce que le Panthéon permet d'engager à la fois — et
    // le second nombre est DÉRIVÉ de `engageCap`, jamais une copie de sa formule.
    expect(out).toContain(String(ROW.adventurers.length));
    expect(out).toContain(`${engageCap(3)} engagés à la fois`);
    // 🪬 Le rappel des runes se voit AVANT d'ouvrir un champion (bascule des runes).
    expect(out).toContain('3 runes à ouvrir');
    expect(out).toContain('1 compétence');
    // 🏅 …et la rareté TIRÉE de chaque champion se LIT (v0.959) : elle ne vivait qu'en
    // teinte et en `title`, donc invisible sur un téléphone, qui n'a pas de survol.
    // ⚠️ ON LIT LA PASTILLE ELLE-MÊME, pas « le mot est quelque part dans la page » : une
    // première version cherchait le nom n'importe où et passait au VERT alors que la
    // pastille était retirée — le mot apparaît aussi dans le `title` et le sous-titre.
    const pastilles = [...out.matchAll(/class="ap-rar[^"]*"[^>]*>([^<]*)</g)].map((m) =>
      m[1]!.trim(),
    );
    const champs = (ROW.adventurers as Parameters<typeof advGradeBadge>[0][]).filter(
      (a) => a.championId,
    );
    expect(pastilles).toHaveLength(ROW.adventurers.length);
    // ⚠️ EN LETTRE (S / A, refonte 2026-09-21), jamais en rang : un champion porte les
    // DEUX échelles, et les nommer pareil faisait lire « Or » à côté de « Bronze ★2 ».
    for (const a of champs) expect(pastilles).toContain(advGradeBadge(a).label);
  }, 30_000);

  it('🎰 GachaReveal se monte, et respecte prefers-reduced-motion', async () => {
    const { default: GachaReveal } = await import('@/components/GachaReveal.vue');
    const { buildReveal, cellOfChampion } = await import('@/lib/gachaReveal');
    const { CHAMPIONS, GRADE_LABEL } = await import('@/data/champions');
    const { mulberry32 } = await import('@/lib/combat');
    const champ = CHAMPIONS[0]!;
    const v = { duplicate: false, copies: 1, manaBack: 0, awaken: 0 };
    // ⚠️ L'INVOCATION (v1.002) : c'est le `watch` immédiat qui ouvre le maintien du cercle,
    // donc le chemin qui a déjà cassé une fois (zone morte temporelle, v0.910).
    const plan = buildReveal(cellOfChampion(champ), mulberry32(1));
    let lance = '';
    expect(
      await mountIt(
        GachaReveal,
        { plan, verdict: v, canAgain: true, busy: false },
        undefined,
        undefined,
        '/',
        (h) => (lance = h),
      ),
    ).toBeNull();
    // ⚠️ LA CHARGE PART TOUTE SEULE (v0.1101) : sans elle, le cercle tournerait à vide pour
    // toujours et le tirage ne se montrerait jamais. Un levier qu'aucun test ne regarde
    // reste vert quand on le retire (la leçon de la v0.772) — d'où l'état lisible au DOM.
    expect(lance).toContain('ivs small charging');
    // …et l'état FINAL direct, qui emprunte l'autre branche du même `watch`.
    const court = buildReveal(cellOfChampion(champ), mulberry32(1), { reduced: true });
    expect(
      await mountIt(GachaReveal, { plan: court, verdict: v, canAgain: false, busy: false }),
    ).toBeNull();
    // …et le ×10 : le grand cercle et les cartes — une autre branche du template.
    const { buildLotReveal } = await import('@/lib/gachaReveal');
    // ⚠️ Un lot MÉLANGÉ : des champions ET des B (pièces), les deux branches du template.
    const lot = CHAMPIONS.slice(0, 10).map((c, i) =>
      i % 2
        ? {
            grade: 'B' as const,
            champion: null,
            gear: { name: 'Épée', emoji: '🗡️' },
            duplicate: false,
            copies: 0,
            manaBack: 0,
          }
        : { grade: c.grade, champion: c, gear: null, duplicate: false, copies: 1, manaBack: 0 },
    );
    expect(
      await mountIt(GachaReveal, {
        plan: buildLotReveal(lot, mulberry32(2)),
        verdict: null,
        canAgain: true,
        busy: false,
        lot,
      }),
    ).toBeNull();
    // …et le ×10 en mouvement réduit : les cartes directement, toutes retournées.
    expect(
      await mountIt(GachaReveal, {
        plan: buildLotReveal(lot, mulberry32(2), { reduced: true }),
        verdict: null,
        canAgain: true,
        busy: false,
        lot,
      }),
    ).toBeNull();
    // 🔮 LE PRÉSAGE DE LA SCÈNE (v0.1101) : l'écran le LIT et le PEINT. ⚠️ Une règle juste
    // dans la lib mais jamais branchée reste verte partout ailleurs — c'est le levier mort
    // de la v0.772. On regarde donc le HTML rendu, pas seulement l'absence d'erreur.
    const { GRADE_COLOR } = await import('@/data/champions');
    const { OMEN_STRENGTH } = await import('@/lib/gachaReveal');
    const gradeCell = (g: 'B' | 'A' | 'S') =>
      g === 'B'
        ? { grade: g, emoji: '🗡️', name: 'Épée', championId: null }
        : cellOfChampion(CHAMPIONS.find((c) => c.grade === g)!);
    for (const g of ['A', 'S'] as const) {
      let out = '';
      expect(
        await mountIt(
          GachaReveal,
          {
            plan: buildReveal(gradeCell(g), mulberry32(1)),
            verdict: v,
            canAgain: false,
            busy: false,
          },
          undefined,
          undefined,
          '/',
          (h) => (out = h),
        ),
      ).toBeNull();
      // ⚠️ ON VISE L'ATTRIBUT, PAS LE MOT : « omened » apparaît aussi dans un commentaire
      // du template, et une première rédaction passait au vert pour cette seule raison.
      expect(out, `présage ${g}`).toContain('class="ivk omened"');
      expect(out, `couleur du présage ${g}`).toContain(`--omen: ${GRADE_COLOR[g]}`);
      // …et son INTENSITÉ : c'est elle qui distingue un A d'un S, la couleur seule se
      // fondrait dans un sanctuaire déjà violet et doré.
      expect(out, `force du présage ${g}`).toContain(`--omen-k: ${OMEN_STRENGTH[g]}`);
    }
    // …et RIEN sur un B : c'est la ligne de base, et c'est elle qui fait le signal.
    let sansPresage = '';
    expect(
      await mountIt(
        GachaReveal,
        {
          plan: buildReveal(gradeCell('B'), mulberry32(1)),
          verdict: v,
          canAgain: false,
          busy: false,
        },
        undefined,
        undefined,
        '/',
        (h) => (sansPresage = h),
      ),
    ).toBeNull();
    expect(sansPresage).not.toContain('class="ivk omened"');
    expect(sansPresage).not.toContain('--omen:');

    // …et le tirage DEMANDÉ dont le plan n'est pas encore revenu (v0.1101) : l'écran s'ouvre
    // sur un cercle qui tourne à vide le temps de l'aller-retour réseau. ⚠️ C'est la branche
    // du `watch` où `startCharge` N'EST PAS appelée — celle qui casserait en silence.
    for (const pending of [1, 10]) {
      expect(
        await mountIt(GachaReveal, {
          plan: null,
          pending,
          verdict: null,
          canAgain: false,
          busy: false,
        }),
      ).toBeNull();
    }
  }, 30_000);
  it('🧱⚔️ SiegeStage bascule dans la cour de côté quand la brèche s’ouvre', async () => {
    const { default: SiegeStage } = await import('@/components/SiegeStage.vue');
    const { resolveRaid, rollRaid } = await import('@/lib/raid');
    const { buildSiegeStage } = await import('@/lib/siegeStage');
    // Une enceinte à moitié : la brèche s'ouvre et des intrus entrent dans la cour.
    const defs = [
      { typeId: 'wall' as const, level: 10 },
      { typeId: 'turret' as const, level: 10 },
    ];
    let report = null as ReturnType<typeof resolveRaid> | null;
    for (let s2 = 1; s2 <= 40 && !report; s2++) {
      const r = resolveRaid(
        { defenses: defs, playerLevel: 28, hero: null, guard: [] },
        rollRaid(s2 * 7919, 28, 0, 0),
        false,
      );
      if (buildSiegeStage(r, 8).beats.some((b) => b.kind === 'enter')) report = r;
    }
    expect(report).not.toBeNull();
    // ⚠️ prefers-reduced-motion : le rejeu saute à l'état FINAL, donc à la cour — c'est le
    // seul moyen de monter la scène de côté sans rejouer des dizaines de secondes.
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    let out = '';
    try {
      expect(
        await mountIt(
          SiegeStage,
          { report: report!, turretLevel: 10 },
          undefined,
          undefined,
          '/',
          (h) => (out = h),
        ),
      ).toBeNull();
    } finally {
      window.matchMedia = mm;
    }
    // ⚠️ SANS CETTE LECTURE LE TEST SERAIT CREUX : on compte les intrus DANS la cour.
    const entres = new Set(
      buildSiegeStage(report!, 8)
        .beats.filter((b) => b.kind === 'enter')
        .flatMap((b) => b.attackers),
    );
    expect(out).toContain('yard-wrap');
    expect([...out.matchAll(/class="foe[^"]*"/g)]).toHaveLength(entres.size);
  }, 30_000);

  it('⚔️ WarbandStage peint la colonne corps par corps, avec ses illustrations', async () => {
    const { default: WarbandStage } = await import('@/components/WarbandStage.vue');
    const { buildWarbandStage } = await import('@/lib/warbandStage');
    const step = (pv: number, bossPv: number) => ({
      dealt: 10,
      taken: 5,
      crit: false,
      groupTurns: 1,
      bossTurns: 1,
      pv,
      bossPv,
    });
    const stage = buildWarbandStage(
      {
        maxPv: 500,
        armyPv: 900,
        groups: [
          { species: 'Loup famélique', emoji: '🐺', count: 18 },
          { species: 'Arachné des bois', emoji: '🕷️', count: 9, ranged: true },
          { species: 'Scorpion géant', emoji: '🦂', count: 1, champion: true },
        ],
        steps: [step(400, 500), step(300, 0)],
      },
      true,
      2,
      5,
    );
    let out = '';
    const props = {
      stage,
      faction: 'betes',
      hero: null,
      cast: [{ kind: 'champion' as const, name: 'Léa', emoji: '⚔️', championId: null }],
    };
    expect(
      await mountIt(WarbandStage, props, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    // ⚠️ Sans cette lecture le test serait creux : on compte les corps, champion compris.
    expect([...out.matchAll(/class="body[ "]/g)]).toHaveLength(stage.bodies.length);
    expect(out).toContain('/monsters/g_loup.webp');
    expect(out).toContain('28 en marche');
  }, 30_000);

  it('🕳️ RiftStage peint les corps, le gardien et la barre du groupe', async () => {
    const { default: RiftStage } = await import('@/components/RiftStage.vue');
    const { buildRiftStage } = await import('@/lib/riftStage');
    const stage = buildRiftStage(
      {
        level: 26,
        faction: 'bandits',
        population: 6,
        killed: 6,
        cleared: true,
        maxPv: 900,
        pvTrail: [800, 700, 640, 560, 480, 400, 320],
      },
      7,
    );
    let out = '';
    const props = {
      stage,
      level: 26,
      hero: null,
      cast: [{ kind: 'champion' as const, name: 'Léa', emoji: '⚔️', championId: null }],
    };
    expect(await mountIt(RiftStage, props, undefined, undefined, '/', (h) => (out = h))).toBeNull();
    // ⚠️ SANS CETTE LECTURE LE TEST SERAIT CREUX : un plateau qui ne rendrait RIEN se
    // monterait tout aussi bien. On compte les corps, gardien compris.
    expect([...out.matchAll(/class="foe[^"]*"/g)]).toHaveLength(stage.foes.length);
    expect(out).toContain('Faille niv 26');
    expect(out).toContain('lbar ours');
    expect(out).toContain('Ton groupe');
    // 🌀 Deux portails (l'entrée et la porte du gardien), à la couleur du RANG de la faille.
    const { characterRank } = await import('@/lib/characterRank');
    const rk = characterRank(26).color.toLowerCase();
    expect([...out.matchAll(/class="portal/g)]).toHaveLength(2);
    expect(out.toLowerCase()).toContain(`--pc: ${rk}`);

    // …et un rapport d'AVANT (sans sillage) : la scène tient, sans barre inventée.
    const vieux = buildRiftStage(
      {
        level: 12,
        faction: 'betes',
        population: 3,
        killed: 1,
        cleared: false,
        maxPv: 0,
        pvTrail: [],
      },
      3,
    );
    let out2 = '';
    expect(
      await mountIt(
        RiftStage,
        { ...props, stage: vieux, level: 12 },
        undefined,
        undefined,
        '/',
        (h) => (out2 = h),
      ),
    ).toBeNull();
    expect(out2).not.toContain('pvbar');
  }, 30_000);

  it('📜 le rapport compact : rejeu QUE sur une incursion, une ligne une fois encaissé', async () => {
    const { default: MissionReportCard } = await import('@/components/MissionReportCard.vue');
    const { messageCard } = await import('@/lib/missionCard');
    const base = {
      hero: true,
      faction: 'bandits' as const,
      escort: ['a1'],
      win: true,
      foes: 4,
      slain: 4,
      kills: {},
      heroKills: 0,
      xp: { a1: 9 },
      hurt: [],
      advGear: [],
      journal: [],
    };
    const msg = (party: typeof base & { rift?: unknown }) =>
      messageCard(
        {
          id: 'm1',
          poiType: party.rift ? 'rift' : 'camp',
          level: 26,
          win: true,
          text: 'récit',
          gold: 120,
          energy: 0,
          key: 0,
          party: party as never,
          resolvedAt: Date.now() - 3_600_000,
          read: true,
        },
        ROW.adventurers,
      );
    const render = async (card: unknown, state: string, folded = false) => {
      let html = '';
      expect(
        await mountIt(
          MissionReportCard,
          { card, state, now: Date.now(), folded },
          undefined,
          undefined,
          '/',
          (h) => (html = h),
        ),
      ).toBeNull();
      return html;
    };
    // ❓ Toucher une ressource dit ce que c'est (demandé), dans une bulle.
    let tip = '';
    expect(
      await mountIt(
        MissionReportCard,
        { card: msg(base), state: 'claim', now: Date.now() },
        undefined,
        undefined,
        '/',
        (h) => (tip = h),
        (host) => host.querySelector<HTMLElement>('.hp')?.click(),
      ),
    ).toBeNull();
    expect(tip).toContain('🪙 Or');
    expect(tip).toContain('Construire et améliorer les bâtiments');
    // Un CAMP : pas de rejeu, le verbe d'un camp, le bouton d'encaissement.
    const camp = await render(msg(base), 'claim');
    expect(camp).not.toContain('class="replay"');
    expect(camp).toContain('camp pris');
    expect(camp).toContain('class="take"');
    // 🧭 Un blessé sorti d'un point fixe : le rapport dit d'où il venait et où le renvoyer.
    const back = await render(
      msg({
        ...base,
        hero: false,
        hurt: ['a1'],
        from: { a1: { id: 'ctl', label: 'Mine fortifiée' } },
      } as never),
      'claim',
    );
    expect(back).toContain('Mine fortifiée →');
    expect(back).toContain('à renvoyer vers Mine fortifiée');
    // Une INCURSION : le rejeu, et le verbe de la faille.
    const rift = { ...base, rift: { level: 26, maxPv: 800, pvTrail: [700, 600, 500, 420, 300] } };
    const faille = await render(msg(rift), 'none');
    expect(faille).toContain('class="replay"');
    expect(faille).toContain('faille refermée');
    // Encaissé : une seule ligne, sans bouton ni détails.
    const done = await render(msg(base), 'done');
    expect(done).toContain('mrc folded');
    expect(done).toContain(' done');
    expect(done).not.toContain('class="take"');
    expect(done).not.toContain('more-btn');
    // La boîte 📬 les replie TOUS : un butin à prendre garde son bouton sur la ligne.
    const box = await render(msg(base), 'claim', true);
    expect(box).toContain('mrc folded');
    expect(box).toContain('take mini');
    expect(box).not.toContain('more-btn');
  }, 30_000);

  it('🕳️ RiftReplayDialog construit sa scène au setup', async () => {
    const { default: RiftReplayDialog } = await import('@/components/RiftReplayDialog.vue');
    const party = {
      hero: true,
      faction: 'mortsvivants' as const,
      escort: ['a1'],
      win: true,
      foes: 4,
      slain: 4,
      kills: {},
      heroKills: 0,
      xp: { a1: 12 },
      hurt: [],
      advGear: [],
      journal: [],
      rift: { level: 30, maxPv: 700, pvTrail: [640, 580, 520, 470, 400] },
    };
    expect(
      await mountIt(
        RiftReplayDialog,
        { replay: party, roster: ROW.adventurers, heroProfile: 'polyvalent', heroEquipped: {} },
        ROW,
      ),
    ).toBeNull();
  }, 30_000);

  it('🗡️ GuildPanel se SÉPARE en deux feuilles : champions / équipements (v0.991)', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    let champ = '';
    let gear = '';
    expect(
      await mountIt(GuildPanel, { open: true }, ROW, undefined, '/', (h) => (champ = h)),
    ).toBeNull();
    expect(
      await mountIt(
        GuildPanel,
        { open: true, section: 'gear' },
        ROW,
        undefined,
        '/',
        (h) => (gear = h),
      ),
    ).toBeNull();
    // Le stock a sa tuile : il n'est plus un onglet des champions…
    expect(champ).toContain('Mes champions');
    expect(champ).not.toContain('🗡️ Stock');
    // …et la feuille d'équipement ne montre que lui, sans les onglets du vivier.
    expect(gear).toContain('Équipements');
    expect(gear).not.toContain('Collection');
    expect(gear).not.toContain('Mes champions');
  }, 30_000);

  it('GuildPanel s’ouvre aussi sur un vivier VIDE', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    const vide = { ...ROW, adventurers: [] };
    expect(await mountIt(GuildPanel, { open: true }, vide)).toBeNull();
  }, 30_000);

  it('🎰 SummonPanel : l’invocation vit dans SA feuille (v0.989), avec ses deux tuiles', async () => {
    // Séparée de « Mes champions » (demandé) : le vivier d'un côté, le tirage de l'autre.
    const { default: SummonPanel } = await import('@/components/SummonPanel.vue');
    const riche = { ...ROW, adventurers: [], mana: 5_000 };
    let out = '';
    expect(
      await mountIt(SummonPanel, { open: true }, riche, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('×1');
    expect(out).toContain('×10');
    // Sans mana : la feuille se monte, et chaque tuile DIT ce qui manque.
    let pauvre = '';
    expect(
      await mountIt(
        SummonPanel,
        { open: true },
        { ...riche, mana: 0 },
        undefined,
        '/',
        (h) => (pauvre = h),
      ),
    ).toBeNull();
    expect(pauvre).toContain('il manque');
  }, 30_000);

  it('GuildPanel : une pièce en stock ATTEND un porteur (case en appel)', async () => {
    // ⚠️ IL FAUT DES DONNÉES : avec un stock VIDE, `pendingAdvGear` rend une carte vide et
    // le chemin « case en appel » du portrait n'est jamais exécuté — il resterait invisible.
    // Ici une épée de guerrier libre face à Léa (guerrier, classe commune) : elle attend.
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    // ⚠️ PASSÉ PAR LA NORMALISATION DU CHARGEMENT, comme en jeu : la pièce d'avant la lettre
    // y devient un B nommé sur son modèle. Sans ça la tuile rendait un état que le jeu ne
    // produit jamais (et plantait sur la lettre absente).
    const { normalizeAdvGearState } = await import('@/lib/advGear');
    const avecStock = {
      ...ROW,
      adv_gear: normalizeAdvGearState({
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
          // Une armure PORTÉE par Léa : le stock s'ouvre sur « Portées » (demandé le
          // 2026-09-27), c'est elle que la feuille montre d'emblée.
          {
            id: 'r1',
            lineage: 'guerrier',
            slot: 'armor',
            name: 'Cotte',
            emoji: '🛡️',
            rarity: 'commun',
            roll: 0.5,
            level: 3,
            effect: { type: 'max_pv_pct', value: 10 },
          },
        ],
      }),
      adventurers: [{ ...ROW.adventurers[0]!, gear: { armor: 'r1' } }],
    };
    expect(await mountIt(GuildPanel, { open: true }, avecStock)).toBeNull();
    // Et la feuille d'équipement, qui rend les tuiles de pièces, rangées par lettre avec
    // les séparateurs du vivier (une pièce d'avant la lettre se relit en B).
    let stockHtml = '';
    expect(
      await mountIt(
        GuildPanel,
        { open: true, section: 'gear' },
        avecStock,
        undefined,
        '/',
        (h) => (stockHtml = h),
      ),
    ).toBeNull();
    // Ouvert sur « Portées » : l'armure de Léa est là, l'épée libre non.
    const [epee, cotte] = ['w1', 'r1'].map(
      (id) => avecStock.adv_gear.stock.find((g) => g.id === id)!,
    );
    expect(stockHtml).toMatch(/class="af-chip tone-busy on"/);
    expect(stockHtml).toContain(cotte!.name);
    expect(stockHtml).not.toContain(`>${epee!.name}<`);
    // Et le filtre des pièces à ★5, vide ici (niveau 3).
    expect(stockHtml).toMatch(/⬆️ Ascension <span[^>]*>0</);
    // Le séparateur dit le NOM de la rareté (B s'affiche SILVER), jamais le code brut.
    const { GRADE_LABEL: GL } = await import('@/data/champions');
    expect(stockHtml).toMatch(new RegExp(`class="adv-rname[^"]*">${GL.B}<`));
    // 📊 v0.1129 : la tuile porte le rang de la pièce et son avancement vers l'étoile
    // suivante (niveau 3 d'une Bronze = début de ★2, donc 0 %).
    expect(stockHtml).toContain('role="progressbar"');
    expect(stockHtml).toMatch(/class="gsb-pct[^"]*">0 %</);
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

  it('🏰 BasePage se monte — enceinte, cour et rapport du dernier assaut', async () => {
    // ⚠️ AJOUTÉE APRÈS AVOIR FAILLI LIVRER UNE ZONE MORTE TEMPORELLE ICI : en dérivant le
    // nombre de places de services de `YARD_SERVICES`, `SVC_POS` s'est retrouvé à lire une
    // `const` déclarée PLUS BAS. Le typecheck, le lint et le build ne voient rien, et le
    // smoke s'arrête au login — c'est exactement le défaut que cette porte existe pour
    // attraper (v0.910), sur le fichier qui dessine toute la base.
    //
    // ⚠️ IL FAUT UNE BASE NON VIDE : un `base` null ne rend que l'état « construis ton
    // enceinte », donc ni la cour, ni les tuiles, ni la feuille d'une structure — le test
    // serait CREUX. On pose donc des défenses, un champ de bataille (le décor) et le
    // rapport du dernier assaut AVEC son butin, qui est le chemin neuf du chantier.
    const { default: BasePage } = await import('@/pages/BasePage.vue');
    const now = Date.now();
    const avecBase = {
      ...ROW,
      gold: 500_000,
      scrap: 900,
      buildings: [
        ...ROW.buildings,
        { typeId: 'outpost', level: 4, slot: 1, collectedAt: 0 },
        { typeId: 'energy_font', level: 3, slot: 2, collectedAt: 0 },
        { typeId: 'barracks', level: 12, slot: 3, collectedAt: 0 },
      ],
      base: {
        seed: 7,
        // 🛡️ Un milicien à la base, le suivant en cours : la Caserne montre son compte à rebours.
        militia: { home: 1, producedAt: now - 600_000, seq: 1 },
        defenses: [
          { typeId: 'wall', level: 6 },
          { typeId: 'turret', level: 5, damaged: true },
          { typeId: 'watchtower', level: 3 },
          { typeId: 'kennel', level: 4 },
          { typeId: 'infirmary', level: 2 },
        ],
        raid: null,
        nextRaidAt: now + 3_600_000,
        field: {
          corpses: [{ id: 'c1', emoji: '🗡️', name: 'Brigand', level: 6, x: 30, y: 40 }],
          expiresAt: now + 3_600_000,
        },
        freeze: null,
        lastReport: {
          raidId: 'r1',
          faction: 'bandits',
          level: 6,
          groups: [],
          held: true,
          defeated: 2,
          total: 2,
          finalPv: 100,
          maxPv: 200,
          heroHome: true,
          log: [],
          breached: false,
          resolvedAt: now - 60_000,
        },
        lastLoot: { corpses: 12, gold: 840, keys: 1, summonStones: 3, items: 2 },
      },
    };
    let out = '';
    expect(
      await mountIt(BasePage, { inTab: true }, avecBase, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    // ⚠️ ON LIT LE HTML : sans ça un fixture périmé ferait rendre l'état vide et le test
    // deviendrait creux — le piège déjà rencontré sur GuildPanel.
    expect(out, 'la cour doit être dessinée').toContain('yard');
    expect(out, 'le champ de bataille est du décor, mais il se dessine').toContain('corpse');
    // 🛕 Le Panthéon bâti trône au CENTRE (v0.1006) et s'y dessine PLUS GRAND que les
    // ateliers (v0.1107). ⚠️ On lit les carrés dessinés et on raisonne sur leur GÉOMÉTRIE,
    // jamais sur une coordonnée écrite à la main : la version d'avant épinglait `x="90"`
    // — le centre moins la cible tactile d'alors — et tombait au moindre réglage de
    // taille sans rien protéger de plus.
    const pads = [...out.matchAll(/<rect[^>]*class="yard-pad"[^>]*>/g)].map((m) => {
      const n = (a: string) => Number(m[0].match(new RegExp(a + '="([-0-9.]+)"'))?.[1] ?? NaN);
      const w = n('width');
      return { cx: n('x') + w / 2, cy: n('y') + n('height') / 2, w };
    });
    expect(pads.length, 'la cour dessine ses tuiles').toBeGreaterThan(1);
    const centre = pads.find((t) => Math.abs(t.cx - 100) < 0.5 && Math.abs(t.cy - 100) < 0.5);
    expect(centre, 'une tuile trône au centre de la cour').toBeTruthy();
    const autres = pads.filter((t) => t !== centre);
    expect(
      Math.min(...autres.map((t) => centre!.w / t.w)),
      'et elle est nettement plus grande que les ateliers',
    ).toBeGreaterThan(1.5);
    // Rien ne doit plus occuper la place sous le centre : l'Infirmerie l'a quittée pour
    // l'emplacement libéré par le Panthéon.
    expect(
      pads.some((t) => Math.abs(t.cx - 100) < 0.5 && Math.abs(t.cy - 116) < 0.5),
      'plus rien sous le centre',
    ).toBe(false);
    // ⏳ La Caserne affiche le temps avant le prochain milicien (demandé : « je ne vois pas le
    // temps restant avant le nouveau milicien sur le bâtiment »).
    expect(out, 'la Caserne montre son compte à rebours').toMatch(
      /class="yard-timer"[^>]*>\s*\d+ h/,
    );
    // ⚠️ CE QUE CE TEST NE COUVRE PAS : l'affichage du BUTIN. Il vit dans l'écran de fin du
    // rejeu et dans la feuille de la Tour de guet — deux chemins qui demandent une
    // interaction (ouvrir une structure) ou un rejeu animé. Ce qui le garde, c'est
    // `battleLootPills` (lib, testée) plus la mutation « le butin n'est plus rendu à
    // l'appelant », qui fait rougir `raid.test`.
  }, 30_000);

  it('📖 ChampionCollection se monte et compte par lettre', async () => {
    const { default: C } = await import('@/components/ChampionCollection.vue');
    const { CHAMPIONS, GRADE_LABEL } = await import('@/data/champions');
    const { championGroups } = await import('@/lib/codex');
    const advs = ROW.adventurers;
    let out = '';
    expect(await mountIt(C, { advs }, undefined, undefined, '/', (h) => (out = h))).toBeNull();
    // Un en-tête par lettre, et le compteur de chacun rendu à l'écran.
    expect(championGroups(advs).some((g) => g.owned > 0)).toBe(true);
    for (const g of championGroups(advs)) {
      expect(out).toContain(`>${GRADE_LABEL[g.grade]}<`);
      expect(out).toContain(g.owned + '/' + g.total);
    }
    expect(out.match(/class="cc-tile/g)?.length).toBe(CHAMPIONS.length);
  }, 30_000);

  it('CountUp se monte et affiche la valeur formatée', async () => {
    const { default: C } = await import('@/components/CountUp.vue');
    let out = '';
    const err = await mountIt(
      C,
      { value: 1234, format: (n: number) => 'P' + Math.round(n) },
      undefined,
      undefined,
      '/',
      (h) => (out = h),
    );
    expect(err).toBeNull();
    expect(out).toContain('P1234');
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
    // 🪬 Les compétences en miniature : emoji + niveau, et les emplacements libres.
    if (base.adv.championId) {
      let mini = '';
      await mountIt(
        P,
        { ...base, adv: { ...base.adv, skills: [{ id: 'speed', level: 3 }] } },
        undefined,
        undefined,
        '/',
        (h) => (mini = h),
      );
      expect(mini).toContain('Vitesse · niveau 3');
      expect(mini).toContain('Emplacement libre');
    }
    // ⬆️ Une pièce PRÊTE a son bouton d'ascension sur le portrait (demandé : on ne pouvait
    // monter les pièces que depuis le stock) ; une pièce non listée n'en a pas.
    const piece = { id: 'g1', name: 'Épée courte' };
    const cell = { slot: 'weapon', emoji: '🗡️', name: 'Arme', filled: true, piece };
    let out = '';
    await mountIt(
      P,
      { ...base, gear: [cell], ascendGear: ['g1'] },
      undefined,
      undefined,
      '/',
      (h) => (out = h),
    );
    expect(out).toContain('Ascension : Épée courte');
    await mountIt(
      P,
      { ...base, gear: [cell], ascendGear: [] },
      undefined,
      undefined,
      '/',
      (h) => (out = h),
    );
    expect(out).not.toContain('Ascension : Épée courte');
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
        makeBoss({ ownerId: 'me', tier: null, createdAt: now, startAt: now, hpTotal: 120_000 }),
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

  // 🎟️ v0.992 : les tuiles de tirage lisent `pullPayment` (la règle du store). ⚠️ Avec des
  // TICKETS en poche, sinon la branche « payé en tickets » n'est jamais rendue.
  it('SummonPanel annonce le prix en tickets quand on en a', async () => {
    const { default: SummonPanel } = await import('@/components/SummonPanel.vue');
    const row = {
      ...ROW,
      mana: 50,
      gacha_tickets: 3,
      gacha: { sinceTop: 0, sinceFloor: 0, pulls: 0, v: 2 },
    };
    let out = '';
    expect(
      await mountIt(SummonPanel, { open: true }, row, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('1 🎟️');
    expect(out).toContain('🎟️ 3');
  }, 30_000);

  // 🐉 v0.1006 : le rejeu de combat affiche l'illustration d'un ennemi connu, et l'emoji
  // pour tout autre (Labyrinthe, arène…). ⚠️ On LIT le HTML : un composant qui rendrait
  // l'emoji partout se monterait tout aussi bien.
  it("CombatStage rend l'illustration d'un ennemi connu, l'emoji sinon", async () => {
    const { default: CombatStage } = await import('@/components/CombatStage.vue');
    const base = {
      playerName: 'Héros',
      playerMaxPv: 100,
      playerProfile: 'polyvalent' as const,
      playerEquipped: {},
    };
    let out = '';
    const connu = { ...base, fights: [{ name: 'Dragon', emoji: '🐉', maxPv: 50, log: [] }] };
    expect(
      await mountIt(CombatStage, connu, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('/monsters/dragon.webp');
    const inconnu = {
      ...base,
      fights: [{ name: 'Créature sans illustration', emoji: '🐀', maxPv: 50, log: [] }],
    };
    expect(
      await mountIt(CombatStage, inconnu, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).not.toContain('/monsters/');
    expect(out).toContain('🐀');
  }, 30_000);
});

// ⚠️ PREMIER ÉCRAN SPORT DANS CETTE PORTE. Elle ne couvrait que du jeu (Guilde, invocation,
// faille, combat) — or le mur de records vit dans une page qu'AUCUNE porte ne regarde : le
// smoke s'arrête à l'écran de connexion, et `personalRecords` peut être parfaite pendant que
// la page ne l'appelle pas. On éprouve donc le CÂBLAGE, pas la formule.
describe('TrophiesPage — le mur de records', () => {
  /** Amorce le cache PARTAGÉ des bilans : `sportEntries` et les records en dérivent tous deux. */
  async function seedLogs(exercises: unknown[]) {
    const { useLogsStore } = await import('@/stores/logs');
    const s = useLogsStore();
    s.all = [
      {
        id: 'l1',
        name: 'Séance',
        performed_at: '2026-01-10T18:00:00Z',
        payload: { id: 'l1', exercises } as never,
      },
    ] as never;
    // ⚠️ Sinon `useProgress` part chercher Supabase, qui n'existe pas ici.
    s.allLoaded = true;
  }

  it('se monte et affiche le record avec la série qui l’a produit', async () => {
    const TrophiesPage = (await import('@/pages/TrophiesPage.vue')).default;
    let out = '';
    const err = await mountIt(
      TrophiesPage,
      {},
      undefined,
      () =>
        seedLogs([
          {
            id: 'ex_dc',
            name: 'Développé couché',
            muscle_primary: 'pectoraux',
            planned: {},
            performed: [{ set: 1, load_kg: 100, reps: 5, difficulty: 2 }],
          },
        ]),
      '/',
      (h) => (out = h),
    );
    expect(err).toBeNull();
    expect(out).toContain('Records de force');
    expect(out).toContain('Développé couché');
    // La SÉRIE réelle, pas seulement le 1RM estimé (116,7 kg).
    expect(out).toContain('100 kg × 5');
  }, 30_000);

  it('n’annonce aucun record de force quand rien n’a été chargé', async () => {
    const TrophiesPage = (await import('@/pages/TrophiesPage.vue')).default;
    let out = '';
    const err = await mountIt(
      TrophiesPage,
      {},
      undefined,
      () =>
        seedLogs([
          {
            id: 'ex_pompes',
            name: 'Pompes',
            planned: {},
            performed: [{ set: 1, load_kg: 0, reps: 30, difficulty: 2 }],
          },
        ]),
      '/',
      (h) => (out = h),
    );
    expect(err).toBeNull();
    expect(out).not.toContain('Records de force');
  }, 30_000);
});

describe('HoldGame — les mini-jeux du gainage', () => {
  it('se monte en cours de partie', async () => {
    // ⚠️ CE QUI EST VRAIMENT ÉPROUVÉ ICI, c'est le SETUP : `HoldGame` porte un `watch`
    // IMMÉDIAT, donc évalué pendant le setup, qui lit `score` — exactement la forme qui a
    // fait tomber la Guilde (v0.910). Le contenu du `q-dialog`, lui, ne rend rien dans ce
    // harnais (les composants Quasar n'y sont pas enregistrés) : c'est pour ça que les
    // SCÈNES sont éprouvées séparément juste en dessous, elles, sur leur HTML.
    const { default: HoldGame } = await import('@/components/HoldGame.vue');
    expect(
      await mountIt(HoldGame, {
        modelValue: true,
        game: 'repousse',
        targetSec: 45,
        elapsedSec: 12,
        running: true,
      }),
    ).toBeNull();
  }, 30_000);

  it('se monte aussi fermé, et en pause', async () => {
    const { default: HoldGame } = await import('@/components/HoldGame.vue');
    for (const [modelValue, running] of [
      [false, false],
      [true, false],
    ] as const) {
      expect(
        await mountIt(HoldGame, {
          modelValue,
          game: 'tri',
          targetSec: 30,
          elapsedSec: 0,
          running,
        }),
      ).toBeNull();
    }
  }, 30_000);

  it('chaque scène dessine vraiment ce qui arrive', async () => {
    const { activeBeats, buildHoldPlan } = await import('@/lib/holdGames');
    const scenes = {
      repousse: () => import('@/components/hold/HoldSceneRepousse.vue'),
      cadence: () => import('@/components/hold/HoldSceneCadence.vue'),
      tri: () => import('@/components/hold/HoldSceneTri.vue'),
    } as const;

    for (const game of ['repousse', 'cadence', 'tri'] as const) {
      const plan = buildHoldPlan(game, 45, 3);
      const beat = plan.beats[6]!;
      const beats = activeBeats(plan, beat.at, new Set());
      expect(beats.length, `${game} : rien à dessiner`).toBeGreaterThan(0);

      const { default: Scene } = await scenes[game]();
      let out = '';
      const err = await mountIt(
        Scene,
        { beats, pulse: { side: 'left', verdict: 'perfect', at: beat.at }, reduced: false },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      );
      expect(err, `${game} : erreur de setup`).toBeNull();
      // ⚠️ On lit le HTML : sans ça, une scène qui ne rendrait RIEN resterait verte et le
      // test ne garderait que son propre montage.
      expect(out.length, `${game} : scène vide`).toBeGreaterThan(80);
    }
  }, 30_000);
});

describe('HoldGameLauncher — le bouton 🎮 à côté du chrono', () => {
  it("s'affiche sur un gainage à deux mains, pas ailleurs", async () => {
    const { default: HoldGameLauncher } = await import('@/components/HoldGameLauncher.vue');
    const render = async (exerciseId: string) => {
      let out = '';
      const err = await mountIt(
        HoldGameLauncher,
        { exerciseId, targetSec: 45, elapsedSec: 0, running: false },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      );
      expect(err).toBeNull();
      return out;
    };
    expect(await render('ex_plank')).toContain('hgl-btn');
    // Le gainage latéral n'a qu'une main libre : pas de jeu (cf. HOLD_GAME_EXERCISES).
    expect(await render('ex_side_plank')).not.toContain('hgl-btn');
  }, 30_000);
});

describe('⬆️ AscensionReveal — la scène d’ascension se monte', () => {
  it('portrait du champion, rangs et récompense', async () => {
    const AscensionReveal = (await import('@/components/AscensionReveal.vue')).default;
    const { CHARACTER_RANKS } = await import('@/lib/characterRank');
    const { CHAMPIONS, GRADE_LABEL } = await import('@/data/champions');
    const c = CHAMPIONS[0]!;
    let out = '';
    const props = {
      from: CHARACTER_RANKS[2],
      to: CHARACTER_RANKS[3],
      name: c.name,
      championId: c.id,
      emoji: c.emoji,
      mana: 33,
    };
    expect(
      await mountIt(AscensionReveal, props, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain(c.name);
    expect(out).toContain('Or noir');
    expect(out).toContain('+33');
    expect(out).toContain('<img');
  }, 30_000);

  it('une PIÈCE de champion : son illustration à la place du portrait, et la ligne de gain', async () => {
    const AscensionReveal = (await import('@/components/AscensionReveal.vue')).default;
    const { CHARACTER_RANKS } = await import('@/lib/characterRank');
    const { advGearArt, ADV_GEAR_MODELS } = await import('@/data/advGearModels');
    const model = ADV_GEAR_MODELS.find((m) => advGearArt(m.id))!;
    let out = '';
    const props = {
      from: CHARACTER_RANKS[0],
      to: CHARACTER_RANKS[1],
      name: model.name,
      emoji: '🗡️',
      mana: 0,
      gear: true,
      gearModel: model.id,
      note: '⚔️ 120 → 131 (+11) pour Orsène',
    };
    expect(
      await mountIt(AscensionReveal, props, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain(advGearArt(model.id)!);
    expect(out).toContain('(+11) pour Orsène');
    expect(out).not.toContain('pierres de mana');
  }, 30_000);
});

describe('📊 barre d’étoile au retour de mission', () => {
  // ⬆️ 2026-09-28 : l'ascension se propose dans l'animation (place forte comprise).
  it('AscendOfferButton : rang visé et prix, raison d’un refus, ascension faite', async () => {
    const AscendOfferButton = (await import('@/components/AscendOfferButton.vue')).default;
    const offer = { next: 1, cost: { gold: 1200, seals: 1 }, have: 1, block: null, why: null };
    const html = async (props: Record<string, unknown>) => {
      let out = '';
      const base = { offer, done: false, err: null, busy: false };
      expect(
        await mountIt(AscendOfferButton, { ...base, ...props }, undefined, undefined, '/', (h) => {
          out = h;
        }),
      ).toBeNull();
      return out;
    };
    const ok = await html({});
    expect(ok).toContain('Ascension → ⚪');
    expect(ok).toContain('Argent');
    expect(ok).toContain('🔱 1/1');
    expect(ok).not.toContain('disabled');
    const no = await html({ offer: { ...offer, block: 'gold', why: 'Il manque de l’or.' } });
    expect(no).toContain('disabled');
    expect(no).toContain('Il manque de l’or.');
    expect(no).toContain('Voir au Panthéon');
    expect(await html({ gear: true })).toContain('⚜️ 1/1');
    expect(await html({ done: true })).toContain('Ascension faite');
  });

  it('AdvXpGainOverlay propose l’ascension d’un champion arrivé à ★★★★★', async () => {
    const { useAdvXpFx } = await import('@/composables/useAdvXpFx');
    const AdvXpGainOverlay = (await import('@/components/AdvXpGainOverlay.vue')).default;
    const seg = { from: 0.4, to: 1, starUp: false, rankUp: false, star: 5 };
    const s = { ...seg, rankEmoji: '🟤', rankName: 'Bronze', rankColor: '#b87333' };
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    const fx = useAdvXpFx();
    fx.show([
      { id: 'pret', name: 'Orsène', xp: 50, ascendReady: true, segments: [s] },
      { id: 'a1', name: 'Léa', xp: 20, ascendReady: false, segments: [s] },
    ]);
    const row = {
      ...ROW,
      gold: 1e9,
      seals: { champion: { 1: 5 }, gear: {} },
      adventurers: [
        { id: 'pret', name: 'Orsène', seed: 3, path: ['guerrier'], level: 10, xp: advXpToNext(10) },
        // Léa est AUSSI à ★★★★★, mais n'y arrive pas par cette mission : pas de bouton.
        ...ROW.adventurers.map((x) => (x.id === 'a1' ? { ...x, level: 10 } : x)),
      ],
    };
    let out = '';
    expect(await mountIt(AdvXpGainOverlay, {}, row, undefined, '/', (h) => (out = h))).toBeNull();
    fx.dismiss();
    window.matchMedia = mm;
    // Un seul bouton : celui du champion prêt, jamais celui de Léa.
    expect(out.match(/class="aob-b"/g) ?? []).toHaveLength(1);
    expect(out).toContain('Ascension → ⚪');
    expect(out).toContain('🔱 5/4');
  });

  it('AdvXpGainOverlay se monte et part de l’avancement AVANT', async () => {
    const { advXpTracks } = await import('@/lib/adventurers');
    const { useAdvXpFx } = await import('@/composables/useAdvXpFx');
    const AdvXpGainOverlay = (await import('@/components/AdvXpGainOverlay.vue')).default;
    const a = (level: number, xp: number) => ({
      id: 'a3',
      name: 'Orsène',
      seed: 3,
      path: [],
      level,
      xp,
      championId: 'orsene',
    });
    const tracks = advXpTracks([a(2, 10)], [a(4, 30)]);
    expect(tracks).toHaveLength(1);
    let out = '';
    const fx = useAdvXpFx();
    fx.show(tracks);
    expect(await mountIt(AdvXpGainOverlay, {}, undefined, undefined, '/', (h) => (out = h))).toBe(
      null,
    );
    fx.dismiss();
    expect(out).toContain('Orsène');
    expect(out).toContain(`+${tracks[0]!.xp} XP`);
    // Avant l'animation : la barre montre l'avancement d'AVANT la mission, pas celui d'après.
    const from = tracks[0]!.segments[0]!.from;
    expect(out).toContain(`width: ${from * 100}%`);
  });

  // 🗡️ v0.1129 : les pièces qu'il porte ont LEUR barre sous la sienne, elles aussi parties
  // de leur avancement d'avant la mission.
  it('AdvXpGainOverlay : les pièces portées ont leur barre sous le champion', async () => {
    const { useAdvXpFx } = await import('@/composables/useAdvXpFx');
    const AdvXpGainOverlay = (await import('@/components/AdvXpGainOverlay.vue')).default;
    const s = (from: number, to: number) => ({
      star: 2,
      rankEmoji: '🟤',
      rankName: 'Bronze',
      rankColor: '#b87333',
      from,
      to,
      starUp: false,
      rankUp: false,
    });
    let out = '';
    const fx = useAdvXpFx();
    fx.show([
      {
        id: 'a1',
        name: 'Orsène',
        xp: 40,
        ascendReady: false,
        segments: [s(0.1, 0.4)],
        gear: [
          {
            id: 'g1',
            name: 'Épée courte',
            emoji: '🗡️',
            ascendReady: false,
            segments: [s(0.25, 0.75)],
          },
        ],
      },
    ]);
    expect(await mountIt(AdvXpGainOverlay, {}, undefined, undefined, '/', (h) => (out = h))).toBe(
      null,
    );
    fx.dismiss();
    expect(out).toContain('Épée courte');
    expect(out).toContain('width: 25%');
    // 🔨 Un langage de forge, distinct de la barre du champion (v0.1256.0).
    expect(out).toContain('ax-bar forge');
    expect(out).toContain('Ses pièces');
  });

  // ⬆️ v0.1119 : un champion « prêt pour l'ascension » au retour de mission se TOUCHE — la
  // ligne dépose son id et ferme l'overlay ; la Base ouvre alors le Panthéon sur sa fiche.
  it('AdvXpGainOverlay : toucher un champion prêt mène à son ascension', async () => {
    const { useAdvXpFx } = await import('@/composables/useAdvXpFx');
    const { useChampionFocus } = await import('@/composables/useChampionFocus');
    const AdvXpGainOverlay = (await import('@/components/AdvXpGainOverlay.vue')).default;
    const seg = { from: 0.4, to: 1, starUp: false, rankUp: false };
    const track = (id: string, ascendReady: boolean) => ({
      id,
      name: id,
      xp: 50,
      ascendReady,
      segments: [{ ...seg, star: 5, rankEmoji: '🟤', rankName: 'Bronze', rankColor: '#b87333' }],
    });
    // Mouvement réduit : l'état FINAL d'emblée, c'est lui qui rend la ligne cliquable.
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    const fx = useAdvXpFx();
    const focus = useChampionFocus();
    focus.take();
    fx.show([track('pret', true), track('pas-pret', false)] as never);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp({ render: () => h(AdvXpGainOverlay) });
    app.use(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
    });
    await router.replace('/');
    app.use(router);
    app.config.warnHandler = () => {};
    const host = document.createElement('div');
    app.mount(host);
    await nextTick();
    const rows = host.querySelectorAll<HTMLElement>('.ax-row');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.classList.contains('ready'), 'une ligne sans ascension reste inerte').toBe(
      false,
    );
    // (un toucher sur la ligne inerte remonte au fond : il FERME l'overlay, sans rien cibler)
    expect(rows[0]!.classList.contains('ready')).toBe(true);
    rows[0]!.click();
    expect(focus.pending.value).toBe('pret');
    expect(fx.current.value, 'l’overlay se ferme').toBeNull();
    app.unmount();
    window.matchMedia = mm;
    focus.take();
  });

  it('GuildPanel s’ouvre SUR la fiche du champion ciblé', async () => {
    const { default: GuildPanel } = await import('@/components/GuildPanel.vue');
    let sans = '';
    let avec = '';
    await mountIt(GuildPanel, { open: true }, ROW, undefined, '/', (h) => (sans = h));
    await mountIt(
      GuildPanel,
      { open: true, focusId: 'a1' },
      ROW,
      undefined,
      '/',
      (h) => (avec = h),
    );
    expect(sans).not.toContain('d-pow-val');
    expect(avec).toContain('d-pow-val');
  }, 30_000);
});

describe('🧩 SetPieceCmp — une pièce de set face à SA pièce du set', () => {
  it('verdict, pièce comparée et puissance du set avant → après', async () => {
    const SetPieceCmp = (await import('@/components/SetPieceCmp.vue')).default;
    const other = {
      id: 'o',
      slot: 'weapon',
      name: 'Hache · Carapace',
      emoji: '🪓',
      rarity: 'rare',
      level: 20,
      effect: { type: 'damage_pct', value: 10 },
      setId: 'voie:berserker',
    };
    let out = '';
    const cmp = { verdict: 'better', other, before: 1200, after: 1260 };
    expect(
      await mountIt(SetPieceCmp, { cmp }, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('Meilleure');
    expect(out).toContain('Hache · Carapace');
    expect(out).toContain('1200');
    expect(out).toContain('+60');
    // Hors set : rien du tout.
    let vide = '';
    expect(
      await mountIt(SetPieceCmp, { cmp: null }, undefined, undefined, '/', (h) => (vide = h)),
    ).toBeNull();
    expect(vide).not.toContain('spc');
  }, 30_000);
});

describe('🎨 Barre du Défi 360 par zone (ComboProgressBar)', () => {
  it('se monte et peint les trois zones', async () => {
    const { default: ComboProgressBar } = await import('@/components/ComboProgressBar.vue');
    const { NO_PACE } = await import('@/lib/combo');
    const leg = (name: string, faites: number) => ({
      slot: 'push',
      exercise_id: name,
      exercise_name: name,
      rep_weight: 1,
      target: 10,
      sets: Array.from({ length: faites }, () => ({ date: '2026-01-05', reps: 10 })),
    });
    const combo = { id: 'c', legs: [leg('A', 12), leg('B', 3)], status: 'active' };
    let out = '';
    expect(
      await mountIt(
        ComboProgressBar,
        { combo, pace: NO_PACE },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    // Les barres sont des boutons (elles filtrent), avec leur compte d’exos ; une zone vide
    // (ici l’objectif : A au bonus, B au secondaire) n’est pas cliquable.
    expect((out.match(/<button/g) ?? []).length).toBe(3);
    expect((out.match(/disabled/g) ?? []).length).toBe(1);
    // Trois barres SÉPARÉES, chacune avec son remplissage.
    for (const c of ['cpb-sec', 'cpb-obj', 'cpb-bonus']) expect(out).toContain(c);
    expect((out.match(/cpb-fill/g) ?? []).length).toBe(3);
    // 🔎 Et elles DISENT qu'elles filtrent — sans cette ligne, rien ne l'indiquait.
    expect(out).toContain('cpb-hint');
    expect(out).toContain('Touche une barre');
  }, 30_000);
});

describe('🐺🏚️ les plateaux de la tanière et des ruines se montent', () => {
  const cast = [{ kind: 'champion' as const, name: 'Aurore', emoji: '⚔️', championId: null }];
  it('🐺 DenStage : la bête et les deux barres', async () => {
    const { default: DenStage } = await import('@/components/DenStage.vue');
    let out = '';
    const battle = {
      name: 'Ours des cavernes',
      emoji: '🐻',
      maxPv: 100,
      beastPv: 80,
      steps: [{ dealt: 80, taken: 20, crit: true, groupTurns: 1, bossTurns: 1, pv: 80, bossPv: 0 }],
    };
    expect(
      await mountIt(
        DenStage,
        { battle, win: true, hero: null, cast },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('Ours des cavernes');
    expect(out).toContain('Ton groupe');
  }, 30_000);
  it('🏚️ FallenStage : une tuile par trouvaille', async () => {
    const { default: FallenStage } = await import('@/components/FallenStage.vue');
    let out = '';
    expect(
      await mountIt(
        FallenStage,
        { supplies: { potion: 2, rations: 1 }, hero: null, cast },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out.match(/class="find/g)?.length).toBe(3);
    expect(out).toContain('Ruines d’un héros tombé');
  }, 30_000);

  it('🎯 la séance générée du Défi 360 se monte (anneaux d’XP branchés au setup)', async () => {
    // Éprouve le SETUP : useProgress et useXpFx instanciés, imports résolus. L'animation
    // elle-même se joue après l'enregistrement des séries — hors de portée d'un montage.
    const { default: ComboSessionPage } = await import('@/pages/ComboSessionPage.vue');
    expect(await mountIt(ComboSessionPage, {})).toBeNull();
  }, 30_000);
});

describe('🕳️💥 le plateau du débordement se monte', () => {
  it('OverflowStage : la faction, le compte à rebours et la ville', async () => {
    const { default: OverflowStage } = await import('@/components/OverflowStage.vue');
    let out = '';
    expect(
      await mountIt(
        OverflowStage,
        { overflow: { faction: 'mortsvivants', level: 30, ambushed: 3, marching: true } },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('Morts-vivants');
    expect(out).toContain('avant débordement');
    expect(out).toContain('class="city');
  }, 30_000);

  it('✨ XpGainOverlay se monte et joue un anneau avec passage de niveau', async () => {
    const { default: XpGainOverlay } = await import('@/components/XpGainOverlay.vue');
    const { useXpFx, xpRing } = await import('@/composables/useXpFx');
    useXpFx().show([
      xpRing(
        'muscu',
        '🏋️',
        'Muscu',
        { level: 7, progressPct: 62, xp: 5000 },
        { level: 8, progressPct: 35, xp: 5420 },
      ),
    ]);
    expect(
      await mountIt(XpGainOverlay, {}, undefined, undefined, '/', (out) => {
        expect(out).toContain('Muscu');
        expect(out).toContain('+');
      }),
    ).toBeNull();
    useXpFx().dismiss();
  }, 30_000);
});

describe('🪬 SkillRunesPanel', () => {
  it('rend les emplacements, le stock et la décision en attente', async () => {
    const { default: SkillRunesPanel } = await import('@/components/SkillRunesPanel.vue');
    const { CHAMPIONS } = await import('@/data/champions');
    const c = CHAMPIONS.find((x) => x.grade === 'A')!;
    const adv = {
      id: 'c1',
      name: c.name,
      seed: 1,
      path: [],
      level: 25,
      xp: 0,
      championId: c.id,
      copies: 1,
      skills: [
        { id: 'speed', level: 2 },
        { id: 'haul', level: 1 },
      ],
    };
    let out = '';
    expect(
      await mountIt(
        SkillRunesPanel,
        {
          adv,
          stock: 2,
        },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('Vitesse');
    expect(out).toContain('Nv 2');
    // 🪬 Plus de pose ici : la fiche renvoie à la tuile Runes, avec le stock en attente.
    expect(out).toContain('Runes du Panthéon');
    expect(out).toContain('2 au stock');
    expect(out).not.toContain('Garder les siennes');
  }, 30_000);
});

describe('🪬 RuneBankSheet', () => {
  it('ouvre, liste le stock par couleur et propose le lot à partir de 9 runes', async () => {
    const { default: RuneBankSheet } = await import('@/components/RuneBankSheet.vue');
    const row = {
      ...ROW,
      runes: {
        runes: 12,
        skills: [
          { uid: 'sk1', id: 'speed', level: 1 },
          { uid: 'sk2', id: 'crit', level: 2 },
        ],
        opened: 2,
        comp: 2,
      },
    };
    let out = '';
    expect(
      await mountIt(RuneBankSheet, { open: true }, row, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('Compétences au stock · 2');
    expect(out).toContain('×10');
    // La plus rare en tête : la violette (Critique) avant la verte (Vitesse).
    expect(out.indexOf('Nv 2')).toBeLessThan(out.indexOf('Nv 1'));
  }, 30_000);
});

describe('🪬 RuneReveal', () => {
  const opened1 = [{ uid: 'o1', id: 'crit', level: 1 }];
  const opened10 = [
    'speed',
    'care',
    'crit',
    'haul',
    'pv',
    'scout',
    'speed',
    'damage',
    'care',
    'haul',
  ].map((id, i) => ({ uid: 'l' + i, id, level: 1 }));

  it('à l’unité : la scène se monte (mur, alcôve, douze glyphes)', async () => {
    const { default: RuneReveal } = await import('@/components/RuneReveal.vue');
    let out = '';
    expect(
      await mountIt(
        RuneReveal,
        { opened: opened1, stock: opened1, canAgain: true, busy: false },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('rr-alcove');
    expect(out.match(/class="rr-glyph[ "]/g)?.length).toBe(12);
  }, 30_000);

  it('prefers-reduced-motion : la compétence se lit tout de suite, lot compris', async () => {
    const { default: RuneReveal } = await import('@/components/RuneReveal.vue');
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as typeof window.matchMedia;
    let one = '';
    let lot = '';
    try {
      expect(
        await mountIt(
          RuneReveal,
          {
            opened: opened1,
            stock: [...opened1, { uid: 'x', id: 'crit', level: 2 }],
            canAgain: true,
            busy: false,
          },
          undefined,
          undefined,
          '/',
          (h) => (one = h),
        ),
      ).toBeNull();
      expect(
        await mountIt(
          RuneReveal,
          { opened: opened10, stock: opened10, canAgain: false, busy: false },
          undefined,
          undefined,
          '/',
          (h) => (lot = h),
        ),
      ).toBeNull();
    } finally {
      window.matchMedia = mm;
    }
    expect(one).toContain('Critique');
    expect(one).toContain('Rune violette');
    expect(one).toContain('2 exemplaires au stock');
    expect(one).toContain('Ouvrir encore');
    // Le lot révèle ses dix alcôves et résume par couleur.
    expect(lot.match(/rr-cell-emo/g)?.length).toBe(10);
    expect(lot).toContain('rr-sum-pill');
    expect(lot).not.toContain('Ouvrir encore');
  }, 30_000);
});

describe('🪨 RuneIcon', () => {
  it('une pierre par couleur et la variante « toutes », sans dégradé partagé sur la page', async () => {
    const { default: RuneIcon } = await import('@/components/RuneIcon.vue');
    const tiers = ['green', 'blue', 'violet', 'gold', null];
    const page = {
      render: () =>
        h(
          'div',
          tiers.map((tier) => h(RuneIcon, { tier })),
        ),
    };
    let out = '';
    expect(await mountIt(page, {}, undefined, undefined, '/', (x) => (out = x))).toBeNull();
    for (const t of tiers) expect(out).toContain(t ? 'rune-icon t-' + t : 'rune-icon all');
    // Cinq icônes sur la même page : aucun dégradé ne doit porter l'id d'un autre.
    const ids = [...out.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ids).size).toBe(ids.length);
  }, 30_000);
});

describe('🔀 FusionPanel', () => {
  it('fermé : un bouton ; ouvert : les pastilles par rareté et la barre de sélection', async () => {
    const { default: FusionPanel } = await import('@/components/FusionPanel.vue');
    let closed = '';
    expect(
      await mountIt(
        FusionPanel,
        {
          noun: 'talents',
          active: false,
          counts: [],
          selected: 0,
          rank: null,
          to: null,
          busy: false,
        },
        undefined,
        undefined,
        '/',
        (x) => (closed = x),
      ),
    ).toBeNull();
    expect(closed).toContain('Fusionner des talents');
    let open = '';
    expect(
      await mountIt(
        FusionPanel,
        {
          noun: 'familiers',
          active: true,
          counts: [
            { rank: 'commun', rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], to: 'inhabituel' },
          ],
          selected: 2,
          rank: 'commun',
          to: 'inhabituel',
          busy: false,
        },
        undefined,
        undefined,
        '/',
        (x) => (open = x),
      ),
    ).toBeNull();
    expect(open).toContain('fz-chip');
    expect(open).toContain('2/3');
    expect(open).toMatch(/Bronze[\s\S]*Argent/);
  }, 30_000);
  it('🏰 ControlPointsSheet liste les points fixes, garnison comprise', async () => {
    const { default: ControlPointsSheet } = await import('@/components/ControlPointsSheet.vue');
    const { captureControl, controlIdOf, controlRoster, ensureControls } =
      await import('@/lib/controlPoints');
    const { createMap } = await import('@/lib/expedition');
    const map = captureControl(
      ensureControls(createMap(3, 0, 30, 1), 0, 30),
      controlIdOf('mine'),
      ['a1'],
      0,
      7,
    );
    let out = '';
    expect(
      await mountIt(
        ControlPointsSheet,
        { modelValue: true, rows: controlRoster(map, [], 3600_000, 30), advs: ROW.adventurers },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('Places fortes');
    // Tenue : son débit en bout de ligne (l’or est versé directement, plus de jauge).
    expect(out).toMatch(/cps-yield prog[^>]*><span[^>]*>🪙 \+[0-9]/);
    expect(out).not.toContain('cps-gauge');
    // Ennemie : ce qu’elle rapporterait, à la même place.
    expect(out).toContain('XP pour la garnison 🎓');
    expect(out).toContain('1/5 tenus');
    // Une mine prend 5 personnes depuis le 2026-09-28 (`seatsOf`) : 5 cases, 1 occupée,
    // 4 libres numérotées — elles remplacent la pastille « 🛡️ 1/5 ».
    expect(out).not.toContain('🛡️ 1/5');
    expect(out.match(/class="mini"/g)?.length).toBe(1);
    expect(out.match(/class="mini free"/g)?.length).toBe(4);
    expect(out).toMatch(/Place 5 libre/);
    // 🔎 Les filtres par statut, avec leur nombre (une tenue, quatre ennemies ; aucune vide).
    expect(out).toContain('🏰 Tenues · 1');
    expect(out).toContain('☠️ Pas tenues · 4');
    expect(out).not.toContain('⚠️ Vides');
    // 🏳️ La place TENUE est neutre : pas de pastille de rang (les quatre ennemies gardent la leur).
    expect(out.match(/class="pill rk"/g)?.length).toBe(4);
  }, 30_000);

  it('⚔️🏰 un champion en sortie garde sa case, marquée « en sortie »', async () => {
    const { default: ControlPointsSheet } = await import('@/components/ControlPointsSheet.vue');
    const { captureControl, controlIdOf, controlRoster, ensureControls, sortieLeaves } =
      await import('@/lib/controlPoints');
    const { createMap } = await import('@/lib/expedition');
    const id = controlIdOf('mine');
    const map = sortieLeaves(
      captureControl(ensureControls(createMap(3, 0, 30, 1), 0, 30), id, ['a1'], 0, 7),
      id,
      ['a1'],
      1000,
      30,
    );
    let out = '';
    expect(
      await mountIt(
        ControlPointsSheet,
        { modelValue: true, rows: controlRoster(map, [], 3600_000, 30), advs: ROW.adventurers },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).toContain('class="mini away"');
    expect(out).toContain('en sortie, revient sur ce point');
    // Sa case n'est pas libre : toujours 4 places libres sur 5.
    expect(out.match(/class="mini free"/g)?.length).toBe(4);
  }, 30_000);

  it('🛡️ la garnison montre les MILICIENS, et toucher un lieu ouvre sa gestion', async () => {
    // Signalé : « dans la liste de garnison des lieux fixes on ne voit pas les miliciens ».
    // Puis (demandé) : toucher un lieu ouvre DIRECTEMENT sa gestion — la tuile ne se déplie plus.
    const { default: ControlPointsSheet } = await import('@/components/ControlPointsSheet.vue');
    const { captureControl, controlIdOf, controlRoster, ensureControls } =
      await import('@/lib/controlPoints');
    const { createMap } = await import('@/lib/expedition');
    const id = controlIdOf('mine');
    const base = captureControl(
      ensureControls(createMap(3, 0, 30, 1), 0, 30),
      id,
      ['a1', 'mil:1', 'mil:2'],
      0,
      7,
    );
    const map = {
      ...base,
      pois: base.pois.map((p) =>
        p.id === id
          ? {
              ...p,
              control: { ...p.control!, reinforcing: [{ id: 'mil:3', from: 0, at: 7200_000 }] },
            }
          : p,
      ),
    };
    let out = '';
    const opened: string[] = [];
    expect(
      await mountIt(
        ControlPointsSheet,
        {
          modelValue: true,
          rows: controlRoster(map, [], 3600_000, 30),
          advs: ROW.adventurers,
          onOpen: (p: { id: string }) => opened.push(p.id),
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
        (host) => host.querySelector<HTMLElement>('.st-held')?.click(),
      ),
    ).toBeNull();
    expect(opened).toEqual([id]);
    expect(out).not.toContain('cps-body');
    // 🖼️ La garnison, dans sa pastille : une miniature par champion posté, une par milicien
    // posté, et une case 🧭 par renfort en route (2026-09-29 : laissée « libre », elle
    // invitait à en envoyer un second) — lui aussi compté dans « 🧭 +1 en route ».
    expect(out).toContain('Garnison 3 sur 5');
    expect(out.match(/class="mini"/g)?.length).toBe(1);
    expect(out.match(/class="mini mil"/g)?.length).toBe(2);
    // Chaque milicien porte son portrait (l’emoji 🛡️ n’est plus que le repli).
    expect(out.match(/class="mil-portrait"/g)?.length).toBe(2);
    expect(out.match(/class="mini route"/g)?.length).toBe(1);
    expect(out.match(/class="mini free"/g)?.length).toBe(1);
    expect(out).toContain('🧭 +1 en route');
    // Retiré (demandé) : il fallait de toute façon ouvrir le lieu pour récolter.
    expect(out).not.toContain('à récolter');
  }, 30_000);
});

describe('➕ renfort direct depuis une place libre (2026-09-29)', () => {
  const held = async () => {
    const { captureControl, controlIdOf, controlRoster, ensureControls } =
      await import('@/lib/controlPoints');
    const { createMap } = await import('@/lib/expedition');
    const id = controlIdOf('mine');
    const map = captureControl(ensureControls(createMap(3, 0, 30, 1), 0, 30), id, ['a1'], 0, 7);
    return { id, map, rows: controlRoster(map, [], 3600_000, 30) };
  };
  it('une place libre devient un bouton qui ENVOIE, sans ouvrir la gestion du lieu', async () => {
    const { default: ControlPointsSheet } = await import('@/components/ControlPointsSheet.vue');
    const { id, rows } = await held();
    const opened: string[] = [];
    const reinf: string[] = [];
    let out = '';
    expect(
      await mountIt(
        ControlPointsSheet,
        {
          modelValue: true,
          rows,
          advs: ROW.adventurers,
          reinforceable: [id],
          onOpen: (p: { id: string }) => opened.push(p.id),
          onReinforce: (p: { id: string }) => reinf.push(p.id),
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
        (host) => host.querySelector<HTMLElement>('.mini.free.go')?.click(),
      ),
    ).toBeNull();
    expect(out.match(/class="mini free go"/g)?.length).toBe(4);
    expect(reinf).toEqual([id]);
    expect(opened).toEqual([]);
  }, 30_000);
  it('sans renfort possible, les places libres restent de simples cases numérotées', async () => {
    const { default: ControlPointsSheet } = await import('@/components/ControlPointsSheet.vue');
    const { rows } = await held();
    let out = '';
    expect(
      await mountIt(
        ControlPointsSheet,
        { modelValue: true, rows, advs: ROW.adventurers, reinforceable: [] },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    expect(out).not.toContain('mini free go');
    expect(out).toMatch(/Place 5 libre/);
  }, 30_000);
  it('le sélecteur coche plusieurs renforts, annonce la tenue avec eux, et les envoie ensemble', async () => {
    const { default: QuickReinforceSheet } = await import('@/components/QuickReinforceSheet.vue');
    const { id, map } = await held();
    const poi = map.pois.find((p) => p.id === id)!;
    const champs: string[] = [];
    const moved: string[] = [];
    const mil: number[] = [];
    let sent = 0;
    let out = '';
    expect(
      await mountIt(
        QuickReinforceSheet,
        {
          poi,
          champs: ROW.adventurers,
          champFree: 4,
          milFree: 4,
          milHome: 2,
          militiaMin: 45,
          sources: [
            {
              fromId: 'forge',
              emo: '⚒️',
              label: 'Forge',
              members: [
                { id: 'a2', adv: ROW.adventurers[1], min: 30 },
                { id: 'mil:9', adv: null, min: 50 },
              ],
            },
          ],
          busy: false,
          delayMin: 0,
          maxDelayMin: 2880,
          departLabel: null,
          planned: [],
          sel: { champs: [ROW.adventurers[0].id], militia: 1, transfers: [] },
          champMin: { [ROW.adventurers[0].id]: 80 },
          arrival: { min: 80, at: '21:40' },
          selHold: { pct: 78, late: 1 },
          hold: { pct: 62, mil: 4, champ: { [ROW.adventurers[0].id]: 11 }, trans: { a2: -3 } },
          onToggleChamp: (a: string) => champs.push(a),
          onMilitia: (n: number) => mil.push(n),
          onSend: () => sent++,
          onTransfer: (from: string, id: string) => moved.push(from + ':' + id),
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
        (host) => {
          host.querySelectorAll<HTMLElement>('.qr-step-b')[1]?.click();
          host.querySelector<HTMLElement>('.qr-pick button')?.click();
          host.querySelectorAll<HTMLElement>('.qr-mem')[1]?.click();
          host.querySelector<HTMLElement>('.qr-go')?.click();
        },
      ),
    ).toBeNull();
    expect(out).toContain('Renfort');
    expect(out).toContain('2 à la base');
    expect(mil).toEqual([2]);
    expect(sent).toBe(1);
    // ➕ La tenue AVEC la sélection, avant d'envoyer.
    expect(out).toContain('Avec ces renforts');
    expect(out).toContain('78 %');
    expect(out).toContain('(+16)');
    expect(out).toContain('1 arrivera trop tard');
    expect(out).toContain('Envoyer 2 renforts');
    // 🧭 Le trajet de chaque champion, et celui de la sélection, AVANT de valider.
    expect(out).toContain('🧭 1 h 20');
    const trip = out.slice(out.indexOf('class="qr-trip"'));
    const tripLine = trip.slice(0, trip.indexOf('</p>'));
    expect(tripLine).toContain('1 h 20');
    expect(tripLine).toContain('arrivée vers');
    expect(tripLine).toContain('21:40');
    expect(champs).toEqual([ROW.adventurers[0].id]);
    // ⇄ Depuis un autre lieu : le lieu, ses membres, et un toucher lance le transfert.
    expect(out).toContain('Depuis un autre lieu');
    expect(out).toContain('Forge');
    expect(out.match(/class="qr-mem"/g)?.length).toBe(2);
    expect(moved).toEqual(['forge:mil:9']);
    // 🛡️ La tenue à l'attaque et ce que chaque renfort y ajoute.
    expect(out).toContain('62 %');
    expect(out).toContain('🎯 +4 %');
    expect(out).toContain('🎯 +11 %');
    expect(out).toContain('🎯 −3 %');
  }, 30_000);
  it('⏳ programmer : le délai se règle, le bouton le dit, un départ programmé s’annule', async () => {
    const { default: QuickReinforceSheet } = await import('@/components/QuickReinforceSheet.vue');
    const { id, map } = await held();
    const poi = map.pois.find((p) => p.id === id)!;
    const delays: number[] = [];
    const cancelled: string[] = [];
    let out = '';
    expect(
      await mountIt(
        QuickReinforceSheet,
        {
          poi,
          champs: ROW.adventurers,
          champFree: 4,
          milFree: 4,
          milHome: 2,
          militiaMin: 45,
          sources: [],
          busy: false,
          delayMin: 85,
          maxDelayMin: 2880,
          departLabel: '22:45',
          planned: [{ id: 'plan_1', count: 3, departIn: '2 h 10', departAt: '23:30' }],
          sel: { champs: [ROW.adventurers[0].id], militia: 1, transfers: [] },
          champMin: {},
          arrival: null,
          selHold: { pct: 78, late: 0 },
          hold: null,
          onDelay: (n: number) => delays.push(n),
          onCancel: (x: string) => cancelled.push(x),
        },
        ROW,
        undefined,
        '/',
        (h) => (out = h),
        (host) => {
          host.querySelectorAll<HTMLElement>('.dd-when-b')[0]?.click();
          host.querySelectorAll<HTMLElement>('.dd-delay .dd-step-b')[0]?.click();
          host.querySelector<HTMLElement>('.qr-plan-x')?.click();
        },
      ),
    ).toBeNull();
    expect(out).toContain('1 h');
    expect(out).toContain('25 min');
    expect(out).toContain('départ à 22:45');
    expect(out).toContain('Programmer 2 renforts');
    expect(out).toContain('départ dans 2 h 10');
    expect(delays).toEqual([0, 25]);
    expect(cancelled).toEqual(['plan_1']);
  }, 30_000);
});

describe('🧺 GameFxOverlay — récolte', () => {
  it('les consommables et les runes sortent du panier, avec leur nombre', async () => {
    const { default: GameFxOverlay } = await import('@/components/GameFxOverlay.vue');
    const { useGameFx } = await import('@/composables/useGameFx');
    const fx = useGameFx();
    fx.queue.value = [];
    fx.celebrateHarvest({ potion: 2 }, 1, 'Scriptorium');
    let out = '';
    expect(
      await mountIt(GameFxOverlay, {}, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('fx-harvest');
    expect(out.match(/class="fx-hv(?: rune)?"/g)?.length).toBe(2);
    expect(out).toContain('×2');
    expect(out).toContain('rune-icon');
    expect(out).toContain('+1 rune · +2 consommables');
    fx.queue.value = [];
    // Rien récolté : aucune animation.
    fx.celebrateHarvest({}, 0, 'Jardin');
    expect(fx.queue.value.length).toBe(0);
  }, 30_000);
});

describe('🏯 GameFxOverlay — citadelle découverte', () => {
  it('la brume s’écarte, la forteresse rouge se dresse, le titre se lit', async () => {
    const { default: GameFxOverlay } = await import('@/components/GameFxOverlay.vue');
    const { useGameFx } = await import('@/composables/useGameFx');
    const fx = useGameFx();
    fx.queue.value = [];
    fx.celebrate({ kind: 'citadel', emoji: '🏯', title: 'Citadelle découverte !', subtitle: 'x' });
    let out = '';
    expect(
      await mountIt(GameFxOverlay, {}, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('fx-cit-keep');
    expect(out.match(/fx-cit-fog/g)?.length).toBe(2);
    expect(out.toLowerCase()).toContain('#ff5d45');
    expect(out).toContain('Citadelle découverte !');
    expect(out).not.toContain('class="fx-emoji"');
    fx.queue.value = [];
  }, 30_000);
});

describe('🔮 GameFxOverlay — rune posée', () => {
  it('la pierre de la couleur de la compétence se brise, la compétence en sort', async () => {
    const { default: GameFxOverlay } = await import('@/components/GameFxOverlay.vue');
    const { useGameFx } = await import('@/composables/useGameFx');
    const { SKILLS, RUNE_COLOR } = await import('@/lib/skillRunes');
    const fx = useGameFx();
    const gold = (Object.keys(SKILLS) as (keyof typeof SKILLS)[]).find(
      (id) => SKILLS[id].tier === 'gold',
    )!;
    fx.queue.value = [];
    fx.celebrateRune('new', gold, 'Nyx', 1);
    let out = '';
    expect(
      await mountIt(GameFxOverlay, {}, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    expect(out).toContain('fx-rune');
    expect(out).toContain('rune-icon');
    expect(out).toContain('fx-rn-rays'); // une dorée a ses rayons
    expect(out.toLowerCase()).toContain(RUNE_COLOR.gold.toLowerCase());
    expect(out).toContain(`Nyx apprend ${SKILLS[gold].name}`);
    fx.queue.value = [];
  }, 30_000);
  // 📋 Le détail d'un siège se peint au MODÈLE COMMUN des rapports.
  it('ReportDetail peint les chiffres clés et les sections d’un siège', async () => {
    let out = '';
    const d = siegeDetail(
      {
        raidId: 'r',
        faction: 'bandits',
        level: 20,
        held: true,
        defeated: 2,
        total: 2,
        finalPv: 800,
        maxPv: 1000,
        heroHome: false,
        log: [],
        breached: false,
        resolvedAt: 0,
        groups: [{ species: 'Archer', emoji: '🏹', count: 4, level: 18, kind: 'ranged' }],
      } as never,
      { corpses: 4, gold: 90, keys: 1, summonStones: 0, items: 0 },
    );
    await mountIt(ReportDetail, { detail: d }, undefined, undefined, '/', (hh) => (out = hh));
    expect(out).toContain('groupes repoussés');
    expect(out).toContain('80 %');
    expect(out).toContain('Archer');
    expect(out).toContain('×4');
    expect(out).toContain('+90 🪙');
  }, 30_000);
  it('🔙 RecallSheet : le chemin, qui rentre, et les deux choix chiffrés', async () => {
    const { default: RecallSheet } = await import('@/components/RecallSheet.vue');
    const { recallPreview } = await import('@/lib/party');
    let out = '';
    await mountIt(
      RecallSheet,
      {
        modelValue: true,
        ask: {
          kind: 'party',
          label: 'L’équipe (2 champions)',
          emo: '⚔️',
          poi: {
            id: 'p',
            type: 'mine',
            level: 22,
            x: 1,
            y: 1,
            distNorm: 0.5,
            spawnedAt: 0,
            expiresAt: 9e15,
          },
          hero: true,
        },
        preview: recallPreview(
          { sentAt: 0, arriveAt: 40 * 60_000, returnAt: 80 * 60_000 },
          10 * 60_000,
        ),
        crew: [{ id: 'a', name: 'Orsène', emoji: '🗡️' }],
        militia: 1,
      },
      undefined,
      undefined,
      '/',
      (hh) => (out = hh),
    );
    expect(out).toContain('Faire demi-tour ?');
    expect(out).toContain('left: 25%');
    expect(out).toContain('Orsène');
    expect(out).toContain('1 milicien');
    // Continuer : arrivée dans 30 min, base dans 70 ; demi-tour : base dans 10 → 60 min plus tôt.
    expect(out).toContain('À la base dans 10 min');
    expect(out).toContain('1 h 00 plus tôt');
  }, 30_000);

  it('🏠🔙 RecallSheet : un retour vers la base qui retourne sur son point', async () => {
    const { default: RecallSheet } = await import('@/components/RecallSheet.vue');
    const { recallPreview } = await import('@/lib/party');
    let out = '';
    await mountIt(
      RecallSheet,
      {
        modelValue: true,
        ask: {
          kind: 'return',
          label: 'Le retour (1 champion)',
          emo: '🏠',
          poi: {
            id: 'p',
            type: 'control',
            level: 22,
            x: 1,
            y: 1,
            distNorm: 0.5,
            spawnedAt: 0,
            expiresAt: 9e15,
          },
          hero: false,
          homeName: 'De retour sur la mine',
        },
        preview: recallPreview({ sentAt: 0, arriveAt: 40 * 60_000 }, 10 * 60_000),
        crew: [{ id: 'a', name: 'Orsène', emoji: '🗡️' }],
        militia: 0,
      },
      undefined,
      undefined,
      '/',
      (hh) => (out = hh),
    );
    expect(out).toContain('vers la base, depuis');
    expect(out).toContain('rc-route rev');
    expect(out).toContain('À la base dans 30 min');
    expect(out).toContain('De retour sur la mine dans 10 min');
    expect(out).toContain('reprennent leur poste');
  }, 30_000);

  it('🧭⚔️ TripsPanel : voyages et attaques dans la même rangée, filtrables', async () => {
    const { default: TripsPanel } = await import('@/components/TripsPanel.vue');
    const army = {
      id: 'a',
      type: 'warband',
      level: 20,
      x: 50,
      y: 50,
      distNorm: 0.5,
      spawnedAt: 0,
      expiresAt: 9e15,
      army: { kind: 'siege', targetId: 'r', at: 1, faction: 'bandits', size: 3 },
    };
    const atk = {
      army,
      kind: 'siege',
      target: null,
      inMs: 40 * 60_000,
      size: 3,
      faction: 'bandits',
    };
    let out = '';
    await mountIt(
      TripsPanel,
      { trips: [], focus: null, heroProfile: 'polyvalent', attacks: [atk], holds: { a: 82 } },
      undefined,
      undefined,
      '/',
      (h) => (out = h),
    );
    // Le filtre est là, « Expéditions » absent (vide), et « Tout » actif.
    expect(out).toContain('tr-filter');
    // ⚠️ Jamais la classe nue de la catégorie : `trips` est celle de la GRILLE des tuiles,
    // dont le padding décentrait « Expéditions » dans sa pastille (signalé).
    expect(out).not.toMatch(/class="trf (trips|attacks|all)/);
    expect(out).not.toContain('trf-trips');
    expect(out).toMatch(/class="trf trf-attacks"/);
    expect(out).toMatch(/class="trf trf-all on"/);
    expect(out).toContain('trip attack soon');
    expect(out).toContain('🛡️ 82 %');
    // Filtrer sur les expéditions (vides) retombe sur « Tout » : la rangée ne se vide pas.
    let fil = '';
    await mountIt(
      TripsPanel,
      { trips: [], focus: null, heroProfile: 'polyvalent', attacks: [atk] },
      undefined,
      undefined,
      '/',
      (h) => (fil = h),
      (host) => host.querySelector<HTMLElement>('.trf.trf-attacks')?.click(),
    );
    expect(fil).toMatch(/class="trf trf-attacks on"/);
    expect(fil).toContain('trip attack');
    // Avec un voyage ET une armée, chaque filtre masque l'autre catégorie.
    const trip = {
      key: 'g1',
      kind: 'van',
      who: '⚔️',
      poi: { ...army, id: 'p1', type: 'mine' },
      time: '→ 1 h 20',
      pct: 40,
      back: false,
      title: 'Groupe',
      withHero: false,
      members: [],
      haul: [],
    };
    const both = { trips: [trip], focus: null, heroProfile: 'polyvalent', attacks: [atk] };
    let onlyAtk = '';
    await mountIt(
      TripsPanel,
      both,
      ROW,
      undefined,
      '/',
      (h) => (onlyAtk = h),
      (host) => host.querySelector<HTMLElement>('.trf.trf-attacks')?.click(),
    );
    expect(onlyAtk).toContain('trip attack');
    expect(onlyAtk).not.toContain('→ 1 h 20');
    let onlyTrips = '';
    await mountIt(
      TripsPanel,
      both,
      ROW,
      undefined,
      '/',
      (h) => (onlyTrips = h),
      (host) => host.querySelector<HTMLElement>('.trf.trf-trips')?.click(),
    );
    expect(onlyTrips).toContain('→ 1 h 20');
    expect(onlyTrips).not.toContain('trip attack');
  }, 30_000);
});

describe('⇄ ComboSwapSheet — changer d’exo en cours de Défi 360', () => {
  it('propose les exos du même groupe déjà dans le défi, et dit ce qui bascule', async () => {
    const { default: ComboSwapSheet } = await import('@/components/ComboSwapSheet.vue');
    const leg = (id: string, name: string, n: number) => ({
      slot: 'push',
      exercise_id: id,
      exercise_name: name,
      muscle_primary: 'pectoraux',
      rep_weight: 1,
      target: 6,
      count_mode: 'sets',
      sets: Array.from({ length: n }, () => ({ date: '2099-01-05', reps: 10 })),
    });
    let out = '';
    const err = await mountIt(
      ComboSwapSheet,
      { modelValue: true, comboId: 'c1', exerciseId: 'ex_bench_barbell' },
      undefined,
      async () => {
        const { useComboStore } = await import('@/stores/combo');
        const { useChallengesStore } = await import('@/stores/challenges');
        const { useLibraryStore } = await import('@/stores/library');
        useComboStore().list = [
          {
            id: 'c1',
            name: '360',
            start_date: '2099-01-05',
            duration_days: 7,
            status: 'active',
            legs: [leg('ex_bench_barbell', 'Développé couché', 2), leg('ex_dips', 'Dips', 3)],
          },
        ] as never;
        // Un défi en liste : le composant ne va pas chercher les challenges au serveur.
        useChallengesStore().list = [{ status: 'done', exercise_id: 'x' }] as never;
        useLibraryStore().fetchAll = () => Promise.resolve([]);
      },
      '/',
      (h) => (out = h),
    );
    expect(err).toBeNull();
    expect(out).toContain('Changer « Développé couché »');
    expect(out).toContain('Tes 2 séries déjà faites');
    expect(out).toContain('Déjà dans ton défi');
    expect(out).toContain('Dips');
    expect(out).toContain('3/6 → 5/12');
  }, 30_000);

  it('choisir une cible ouvre la correction des séries basculées', async () => {
    const { default: ComboSwapSheet } = await import('@/components/ComboSwapSheet.vue');
    const leg = (id: string, name: string, reps: number[], weight: number | null) => ({
      slot: 'push',
      exercise_id: id,
      exercise_name: name,
      muscle_primary: 'pectoraux',
      rep_weight: 1,
      target: 6,
      count_mode: 'sets',
      rep_min: 8,
      rep_max: 12,
      sets: reps.map((r) => ({ date: '2099-01-05', reps: r, weight })),
    });
    let out = '';
    const err = await mountIt(
      ComboSwapSheet,
      { modelValue: true, comboId: 'c1', exerciseId: 'ex_bench_barbell' },
      undefined,
      async () => {
        const { useComboStore } = await import('@/stores/combo');
        const { useChallengesStore } = await import('@/stores/challenges');
        const { useLibraryStore } = await import('@/stores/library');
        useComboStore().list = [
          {
            id: 'c1',
            name: '360',
            start_date: '2099-01-05',
            duration_days: 7,
            status: 'active',
            legs: [
              leg('ex_bench_barbell', 'Développé couché', [6, 5], 60),
              leg('ex_dips', 'Dips', [12, 11], null),
            ],
          },
        ] as never;
        useChallengesStore().list = [{ status: 'done', exercise_id: 'x' }] as never;
        useLibraryStore().fetchAll = () => Promise.resolve([]);
      },
      '/',
      (h) => (out = h),
      (host) => (host.querySelector('button.sw-tile') as HTMLButtonElement).click(),
    );
    expect(err).toBeNull();
    expect(out).toContain('Toutes les séries');
    // La vraie série, puis la valeur proposée : la dernière série de dips (11 reps).
    expect(out).toContain('Développé couché · 6 reps · 60 kg');
    expect(out).toMatch(/<b[^>]*>11<\/b><small[^>]*>reps/);
    expect(out).toContain('quitte le défi');
  }, 30_000);
});

describe('⇄ ComboLegHead — le bouton « changer d’exo »', () => {
  it('n’apparaît que si le défi le permet', async () => {
    const { default: ComboLegHead } = await import('@/components/ComboLegHead.vue');
    const leg = {
      slot: 'push',
      exercise_id: 'ex_dips',
      exercise_name: 'Dips',
      muscle_primary: 'pectoraux',
      rep_weight: 1,
      target: 6,
      count_mode: 'sets',
      sets: [],
    };
    let on = '';
    let off = '';
    await mountIt(
      ComboLegHead,
      { leg, swappable: true },
      undefined,
      undefined,
      '/',
      (h) => (on = h),
    );
    await mountIt(ComboLegHead, { leg }, undefined, undefined, '/', (h) => (off = h));
    expect(on).toContain('class="lh-swap"');
    expect(off).not.toContain('lh-swap');
  }, 30_000);
});
