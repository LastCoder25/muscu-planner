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
import { createApp, h, nextTick, type Component } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { advGradeBadge, engageCap } from '@/lib/adventurers';

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
  // ⚠️ Un tour de rendu : ce qu'un écran pose dans `onMounted` (un rejeu qui saute à son
  // état final, par exemple) n'est peint qu'au flush suivant.
  await nextTick();
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
    // ⚠️ RÉÉCRIT (v0.958) : le compteur opposait le DÉPLOIEMENT au plafond (« 2/2 »),
    // ce qui n'a plus de sens depuis qu'aucun champion n'est mis au banc. Il annonce
    // désormais la COLLECTION, puis ce que le Panthéon permet d'engager à la fois — et
    // le second nombre est DÉRIVÉ de `engageCap`, jamais une copie de sa formule.
    expect(out).toContain(String(ROW.adventurers.length));
    expect(out).toContain(`${engageCap(3)} engagés à la fois`);
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
    const { CHAMPIONS } = await import('@/data/champions');
    const { mulberry32 } = await import('@/lib/combat');
    const champ = CHAMPIONS[0]!;
    const v = { duplicate: false, copies: 1, manaBack: 0, awaken: 0 };
    // ⚠️ L'INVOCATION (v1.002) : c'est le `watch` immédiat qui ouvre le maintien du cercle,
    // donc le chemin qui a déjà cassé une fois (zone morte temporelle, v0.910).
    const plan = buildReveal(cellOfChampion(champ), mulberry32(1));
    expect(
      await mountIt(GachaReveal, { plan, verdict: v, canAgain: true, busy: false }),
    ).toBeNull();
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
    // …et le tirage DEMANDÉ mais pas payé (v1.003) : cercle ouvert SANS plan, bouton Retour.
    expect(
      await mountIt(GachaReveal, {
        plan: null,
        pending: 10,
        verdict: null,
        canAgain: false,
        busy: false,
      }),
    ).toBeNull();
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
        0,
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
    expect(out).toContain('pvbar');

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

  it('🕳️ le rapport n’offre le rejeu QUE sur une incursion', async () => {
    const { default: PartyReportView } = await import('@/components/PartyReportView.vue');
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
      wages: 8,
      journal: [],
    };
    // Un CAMP : pas de bouton, et le verbe d'un camp.
    let camp = '';
    expect(
      await mountIt(
        PartyReportView,
        { party: base, roster: ROW.adventurers },
        undefined,
        undefined,
        '/',
        (h) => (camp = h),
      ),
    ).toBeNull();
    expect(camp).not.toContain('pr-replay');
    expect(camp).toContain('camp pris');

    // Une INCURSION : le bouton, et le verbe de la faille.
    let faille = '';
    const rift = { ...base, rift: { level: 26, maxPv: 800, pvTrail: [700, 600, 500, 420, 300] } };
    expect(
      await mountIt(
        PartyReportView,
        { party: rift, roster: ROW.adventurers },
        undefined,
        undefined,
        '/',
        (h) => (faille = h),
      ),
    ).toBeNull();
    expect(faille).toContain('pr-replay');
    expect(faille).toContain('faille refermée');
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
      wages: 10,
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
        ],
      }),
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
    expect(stockHtml).toContain(avecStock.adv_gear.stock[0]!.name);
    expect(stockHtml).toMatch(/class="adv-rname[^"]*">B</);
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
      ],
      base: {
        seed: 7,
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
    // 🛕 v0.1006 : le Panthéon bâti trône au CENTRE (cible tactile à 100 ± 10), et
    // l'Infirmerie a quitté sa place sous le centre (100, 116) pour son emplacement.
    expect(out, 'une tuile au centre de la cour').toMatch(/x="90" y="90"/);
    expect(out, 'plus rien sous le centre').not.toMatch(/x="90" y="106"/);
    // ⚠️ CE QUE CE TEST NE COUVRE PAS : l'affichage du BUTIN. Il vit dans l'écran de fin du
    // rejeu et dans la feuille de la Tour de guet — deux chemins qui demandent une
    // interaction (ouvrir une structure) ou un rejeu animé. Ce qui le garde, c'est
    // `battleLootPills` (lib, testée) plus la mutation « le butin n'est plus rendu à
    // l'appelant », qui fait rougir `raid.test`.
  }, 30_000);

  it('📖 ChampionCollection se monte et compte par lettre', async () => {
    const { default: C } = await import('@/components/ChampionCollection.vue');
    const { CHAMPIONS } = await import('@/data/champions');
    const { championGroups } = await import('@/lib/codex');
    const advs = ROW.adventurers;
    let out = '';
    expect(await mountIt(C, { advs }, undefined, undefined, '/', (h) => (out = h))).toBeNull();
    // Un en-tête par lettre, et le compteur de chacun rendu à l'écran.
    expect(championGroups(advs).some((g) => g.owned > 0)).toBe(true);
    for (const g of championGroups(advs)) {
      expect(out).toContain(`>${g.grade}<`);
      expect(out).toContain(g.owned + '/' + g.total);
    }
    expect(out.match(/class="cc-tile/g)?.length).toBe(CHAMPIONS.length);
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
