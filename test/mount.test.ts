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
  }, 30_000);

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
    // Un CAMP : pas de rejeu, le verbe d'un camp, le bouton d'encaissement.
    const camp = await render(msg(base), 'claim');
    expect(camp).not.toContain('class="replay"');
    expect(camp).toContain('camp pris');
    expect(camp).toContain('class="take"');
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
    const { CHAMPIONS } = await import('@/data/champions');
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

describe('🔎 Filtres du Défi 360 (ComboLegFilter)', () => {
  it('une pastille par étape non vide, avec son compte', async () => {
    const { default: ComboLegFilter } = await import('@/components/ComboLegFilter.vue');
    const leg = (name: string, faites: number) => ({
      slot: 'push',
      exercise_id: name,
      exercise_name: name,
      rep_weight: 1,
      target: 10,
      sets: Array.from({ length: faites }, () => ({ date: '2026-01-05', reps: 10 })),
    });
    let out = '';
    const legs = [leg('A', 0), leg('B', 9), leg('C', 10), leg('D', 12)];
    expect(
      await mountIt(
        ComboLegFilter,
        { legs, modelValue: 'all' },
        undefined,
        undefined,
        '/',
        (h) => (out = h),
      ),
    ).toBeNull();
    for (const l of ['Tous', 'Secondaire', 'Objectif', 'Bonus', 'Terminés'])
      expect(out).toContain(l);
    let seul = '';
    await mountIt(
      ComboLegFilter,
      { legs: [leg('A', 0)], modelValue: 'all' },
      undefined,
      undefined,
      '/',
      (h) => (seul = h),
    );
    // Une étape vide reste affichée (c'est aussi la légende), mais inactive.
    expect(seul).toContain('Bonus');
    expect((seul.match(/disabled/g) ?? []).length).toBe(3);
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
      await mountIt(ComboProgressBar, { combo, pace: NO_PACE }, undefined, undefined, '/', (h) => (out = h)),
    ).toBeNull();
    for (const c of ['cpb-f-sec', 'cpb-f-obj', 'cpb-f-bonus']) expect(out).toContain(c);
  }, 30_000);
});
