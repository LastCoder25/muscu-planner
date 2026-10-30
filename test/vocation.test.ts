// 📓 CARNET DE VOCATION (v1.283.0, livraison L1) — points, arbre du guerrier, deux effets,
// lectures d'information, vétérance. Chaque garantie a été vue ROUGE par mutation (cf. docs).
import { describe, it, expect } from 'vitest';
import {
  VET,
  VOCATION,
  bestVetTitle,
  forgetNode,
  learnNode,
  nextOfGroup,
  nodeState,
  pendingPoints,
  readableGroups,
  readingText,
  recordVet,
  vetFactionOf,
  vetLines,
  vocationAmbushMult,
  vocationBudget,
  vocationFree,
  vocationGuardMult,
  vocationTree,
  type SpawnAhead,
} from '@/lib/vocation';
import { grantReportXp, partyClaimRoster } from '@/lib/party';
import { ambushChance, refChampionAdv, refAdvGear, type EscortKit } from '@/lib/caravan';
import { fightCampForce, type PartyInput } from '@/lib/camp';
import { partyWinChance } from '@/lib/partyForecast';
import { normalizeCharacterRow } from '@/lib/characterRow';
import type { Adventurer } from '@/lib/adventurers';
import {
  advanceWorld,
  createMap,
  upcomingSpawns,
  type ExpeditionMessage,
  type PartyResult,
  type Poi,
} from '@/lib/expedition';

const NOW = 1_000_000_000;
const guerrier = (id: string, extra: Partial<Adventurer> = {}): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path: [],
  level: 20,
  xp: 0,
  championId: 'roan', // 🗡️ guerrier
  copies: 1,
  ...extra,
});
const archer = (id: string): Adventurer => ({ ...guerrier(id), championId: 'sylve' }); // 🏹

describe('🎯 les points : un pool commun, rattrapé depuis le niveau 41', () => {
  it('10 au départ, +2 par niveau de héros au-delà de 41', () => {
    expect(vocationBudget(1)).toBe(10);
    expect(vocationBudget(41)).toBe(10);
    expect(vocationBudget(42)).toBe(12);
    expect(vocationBudget(61)).toBe(50);
  });

  it('un nœud coûte son prix sur le pool de TOUT le vivier', () => {
    const roster = [guerrier('a'), guerrier('b')];
    const r = learnNode(roster, 'a', 'guerrier.brise-camp', 1, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(vocationFree(r.roster, 1, NOW)).toBe(7);
    // le second champion dépense sur le MÊME pool
    const r2 = learnNode(r.roster, 'b', 'guerrier.flair', 1, NOW);
    expect(r2.ok && vocationFree(r2.roster, 1, NOW)).toBe(6);
  });

  it('refuse quand il manque des points, en le disant', () => {
    let roster = [guerrier('a'), guerrier('b'), guerrier('c'), guerrier('d')];
    for (const id of ['a', 'b', 'c']) {
      const r = learnNode(roster, id, 'guerrier.brise-camp', 1, NOW);
      if (r.ok) roster = r.roster;
    }
    // 10 points : 3 + 3 (second majeur impossible pour la même voie mais autre champion ok) …
    const spent = roster.reduce((n, a) => n + (a.vocation?.nodes.length ?? 0) * 3, 0);
    expect(spent).toBe(9);
    const last = learnNode(roster, 'd', 'guerrier.brise-camp', 1, NOW);
    expect(last).toEqual({ ok: false, reason: 'il te manque 2 points' });
  });

  it('refuse une lignée sans carnet, un nœud déjà acquis et la voie exclusive', () => {
    const roster = [guerrier('a'), archer('x')];
    expect(vocationTree(archer('x'))).toBeNull();
    expect(learnNode(roster, 'x', 'guerrier.flair', 1, NOW).ok).toBe(false);
    const r = learnNode(roster, 'a', 'guerrier.brise-camp', 1, NOW);
    if (!r.ok) throw new Error('attendu');
    expect(learnNode(r.roster, 'a', 'guerrier.brise-camp', 1, NOW)).toEqual({
      ok: false,
      reason: 'déjà acquis',
    });
    const excl = learnNode(r.roster, 'a', 'guerrier.garde-route', 99, NOW);
    expect(excl).toEqual({ ok: false, reason: 'incompatible avec son autre voie' });
    const node = vocationTree(r.roster[0]!)!.find((n) => n.id === 'guerrier.garde-route')!;
    expect(nodeState(r.roster, r.roster[0]!, node, 99, NOW)).toBe('excluded');
  });
});

describe('↩️ retirer : l’effet cesse, les points reviennent après 24 h', () => {
  const learned = () => {
    const r = learnNode([guerrier('a')], 'a', 'guerrier.brise-camp', 1, NOW);
    if (!r.ok) throw new Error('attendu');
    return r.roster;
  };

  it('le nœud disparaît tout de suite, mais le point n’est pas rendu avant 24 h', () => {
    const r = forgetNode(learned(), 'a', 'guerrier.brise-camp', NOW);
    if (!r.ok) throw new Error('attendu');
    expect(r.roster[0]!.vocation!.nodes).toEqual([]);
    expect(vocationGuardMult(r.roster, { type: 'camp' })).toBe(1);
    expect(vocationFree(r.roster, 1, NOW)).toBe(7); // 10 − 3 en attente
    expect(pendingPoints(r.roster, NOW)).toHaveLength(3);
    expect(vocationFree(r.roster, 1, NOW + VOCATION.refundMs - 1)).toBe(7);
    expect(vocationFree(r.roster, 1, NOW + VOCATION.refundMs)).toBe(10);
  });

  it('une échéance écoulée est purgée à l’écriture suivante (le JSONB ne grossit pas)', () => {
    const r = forgetNode(learned(), 'a', 'guerrier.brise-camp', NOW);
    if (!r.ok) throw new Error('attendu');
    const later = NOW + VOCATION.refundMs + 1;
    const again = learnNode(r.roster, 'a', 'guerrier.flair', 1, later);
    if (!again.ok) throw new Error('attendu');
    expect(again.roster[0]!.vocation!.freeAt).toBeUndefined();
  });

  it('retirer ce qui n’est pas acquis ne fait rien', () => {
    expect(forgetNode([guerrier('a')], 'a', 'guerrier.flair', NOW).ok).toBe(false);
  });
});

describe('⚔️ les deux voies : situation modeste, jamais cumulée', () => {
  const brise = guerrier('a', { vocation: { nodes: ['guerrier.brise-camp'] } });
  const garde = guerrier('b', { vocation: { nodes: ['guerrier.garde-route'] } });

  it('Brise-camp : −5 % sur un camp ou un repaire seulement', () => {
    expect(vocationGuardMult([brise], { type: 'camp' })).toBe(0.95);
    expect(vocationGuardMult([brise], { type: 'lair' })).toBe(0.95);
    expect(vocationGuardMult([brise], { type: 'mine' })).toBe(1);
    expect(vocationGuardMult([brise], { type: 'den' })).toBe(1);
    expect(vocationGuardMult([garde], { type: 'camp' })).toBe(1);
  });

  it('Brise-camp ne se cumule pas entre champions', () => {
    const autre = guerrier('c', { vocation: { nodes: ['guerrier.brise-camp'] } });
    expect(vocationGuardMult([brise, autre], { type: 'camp' })).toBe(0.95);
  });

  it('Garde de route : −10 % d’embuscades, sur route dangereuse seulement, jamais cumulé', () => {
    expect(vocationAmbushMult([garde], true)).toBe(0.9);
    expect(vocationAmbushMult([garde], false)).toBe(1);
    expect(vocationAmbushMult([brise], true)).toBe(1);
    const autre = guerrier('c', { vocation: { nodes: ['guerrier.garde-route'] } });
    expect(vocationAmbushMult([garde, autre], true)).toBe(0.9);
  });

  const poi = (over: Partial<Poi> = {}): Poi => ({
    id: 'p1',
    type: 'camp',
    level: 20,
    x: 60,
    y: 60,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 9e15,
    ...over,
  });
  const team = (n: number, nodes: string[] = []): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(20, i),
      id: `adv_${i}`,
      ...(i === 0 && nodes.length ? { vocation: { nodes } } : {}),
    }));
  const kit: EscortKit = { advGear: refAdvGear(20, 3) };

  it('🔗 la route : la chance d’embuscade baisse vraiment sur une route dangereuse', () => {
    const calm = poi({ type: 'mine' });
    const risky = poi({ type: 'mine', perilous: true });
    const plain = team(3);
    const guarded = team(3, ['guerrier.garde-route']);
    expect(ambushChance(risky, guarded)).toBeCloseTo(ambushChance(risky, plain) * 0.9, 10);
    expect(ambushChance(calm, guarded)).toBe(ambushChance(calm, plain));
  });

  it('🔗 le camp : le VRAI combat et le % affiché lisent le même facteur', () => {
    const p = poi();
    const base: Omit<PartyInput, 'escort'> = {
      poi: p,
      spec: { faction: 'bandits', size: 3.5 },
      road: kit,
      hero: null,
      seed: 1,
      playerLevel: 20,
      pantheonLevel: 20,
      heroLevel: 20,
    };
    let plainWins = 0;
    let braveWins = 0;
    for (let s = 1; s <= 80; s++) {
      if (fightCampForce({ ...base, escort: team(3), seed: s }).skirmish.win) plainWins++;
      if (
        fightCampForce({ ...base, escort: team(3, ['guerrier.brise-camp']), seed: s }).skirmish.win
      )
        braveWins++;
    }
    expect(braveWins, 'le combat réel ne voit pas Brise-camp').toBeGreaterThan(plainWins);
    // le % affiché (pronostic) bouge dans le même sens
    // (camp « p0 » : deux ennemis ; deux champions y gagnent ~2 % — la courbe est raide, c'est
    // là que le facteur se voit)
    const small = poi({ id: 'p0' });
    const shown = (e: Adventurer[]) => partyWinChance(small, e, kit, null, NOW);
    expect(shown(team(2, ['guerrier.brise-camp']))!).toBeGreaterThan(shown(team(2))!);
    // et rien ne bouge sur un lieu qui n'est pas un camp
    const mine = poi({ type: 'mine' });
    const m = (e: Adventurer[]) => partyWinChance(mine, e, kit, null, NOW);
    expect(m(team(3, ['guerrier.brise-camp']))).toBe(m(team(3)));
  });
});

describe('🔭 lectures d’information', () => {
  const spawns: SpawnAhead[] = [
    { id: 'r1', type: 'rift', at: NOW + 7 * 3600_000 },
    { id: 'c2', type: 'camp', at: NOW + 5 * 3600_000 },
    { id: 'c1', type: 'den', at: NOW + 2 * 3600_000 },
    { id: 'u1', type: 'ruins', at: NOW + 20 * 3600_000 },
    { id: 'm1', type: 'mine', at: NOW + 1 * 3600_000 },
  ];

  it('la première apparition de CHAQUE famille, et rien d’autre', () => {
    expect(nextOfGroup(spawns, 'fight')?.id).toBe('c1');
    expect(nextOfGroup(spawns, 'rift')?.id).toBe('r1');
    expect(nextOfGroup(spawns, 'ruins')?.id).toBe('u1');
    expect(nextOfGroup([], 'fight')).toBeNull();
  });

  it('seuls les nœuds de lecture ACQUIS ouvrent une lecture', () => {
    expect(readableGroups(guerrier('a'))).toEqual([]);
    const a = guerrier('a', { vocation: { nodes: ['guerrier.failles', 'guerrier.brise-camp'] } });
    expect(readableGroups(a)).toEqual(['rift']);
  });

  it('dit quand, ou qu’il n’y a rien dans l’horizon', () => {
    expect(readingText(nextOfGroup(spawns, 'fight'), NOW)).toContain('dans environ 2 h');
    expect(readingText(null, NOW)).toContain('Rien d’annoncé');
  });
});

describe('🔭 la prévision des apparitions = ce que la carte fera vraiment', () => {
  it('chaque apparition annoncée arrive à l’heure dite, avec son type, et rien ne manque', () => {
    const H = 3600_000;
    let seen = 0;
    for (const seed of [11, 4242, 90210]) {
      const start = createMap(seed, 0, 30, 30);
      const ahead = upcomingSpawns(start, 0, 30, 30);
      // On rejoue la carte pas à pas, comme l'app, et on relève ce qui apparaît.
      const known = new Set(start.pois.map((p) => p.id));
      const real: { id: string; type: string; at: number }[] = [];
      let m = start;
      for (let t = H / 2; t <= 48 * H; t += H / 2) {
        m = advanceWorld(m, t, 30, 30);
        for (const p of m.pois)
          if (!known.has(p.id)) {
            known.add(p.id);
            real.push({ id: p.id, type: p.type, at: p.spawnedAt });
          }
      }
      expect(ahead).toEqual(real);
      expect(ahead.every((s) => s.at > 0 && !start.pois.some((p) => p.id === s.id))).toBe(true);
      seen += ahead.length;
    }
    expect(seen, 'aucune apparition : le test ne prouve rien').toBeGreaterThan(5);
  });
});

describe('🏅 vétérance : un titre à 15 victoires, titre seul', () => {
  const win = (over: Partial<PartyResult> = {}): PartyResult =>
    ({
      hero: false,
      faction: 'betes',
      escort: ['a'],
      win: true,
      foes: 2,
      slain: 2,
      kills: {},
      heroKills: 0,
      xp: { a: 10 },
      hurt: [],
      journal: [],
      ...over,
    }) as unknown as PartyResult;

  it('compte une victoire sur un camp, une faille, une tanière, des gardes', () => {
    for (const t of ['camp', 'lair', 'den', 'rift', 'mine', 'warband'] as const)
      expect(vetFactionOf(win(), t), t).toBe('betes');
  });

  it('ne compte NI défaite, NI point de contrôle, NI convoi, NI arrivée tardive, NI défense', () => {
    expect(vetFactionOf(win({ win: false }), 'camp')).toBeNull();
    expect(vetFactionOf(win(), 'control')).toBeNull();
    expect(vetFactionOf(win({ controlId: 'ctl_mine' }), 'camp')).toBeNull();
    expect(vetFactionOf(win({ defense: true }), 'camp')).toBeNull();
    expect(vetFactionOf(win({ convoy: true }), 'warband')).toBeNull();
    expect(vetFactionOf(win({ late: true }), 'camp')).toBeNull();
    expect(vetFactionOf(win(), undefined)).toBeNull();
  });

  it('recordVet incrémente la faction, et ne touche pas à l’objet sans faction', () => {
    const a = guerrier('a');
    expect(recordVet(a, null)).toBe(a);
    expect(recordVet(recordVet(a, 'betes'), 'betes').vet).toEqual({ betes: 2 });
  });

  it('le titre tombe à 15 victoires, pas avant', () => {
    const near = guerrier('a', { vet: { bandits: VET.tier - 1 } });
    expect(vetLines(near).find((l) => l.faction === 'bandits')!.earned).toBe(false);
    expect(bestVetTitle([near])).toBeNull();
    const got = recordVet(near, 'bandits');
    expect(vetLines(got).find((l) => l.faction === 'bandits')!.earned).toBe(true);
    expect(bestVetTitle([got])?.label).toBe('Fléau des bandits');
  });

  it('le meilleur titre de l’équipe est UN seul : celui de la plus longue série', () => {
    const a = guerrier('a', { name: 'Anne', vet: { bandits: 16 } });
    const b = guerrier('b', { name: 'Bob', vet: { mortsvivants: 40, betes: 20 } });
    expect(bestVetTitle([a, b])).toMatchObject({ label: 'Purificateur', by: 'Bob' });
  });

  // ── Le versement : à l'arrivée du rapport OU, pour un rapport d'avant, à l'encaissement ──
  const msg = (p: PartyResult, over: Partial<ExpeditionMessage> = {}): ExpeditionMessage =>
    ({
      id: 'm1',
      level: 20,
      win: true,
      text: '',
      gold: 0,
      energy: 0,
      key: 0,
      resolvedAt: 0,
      claimAt: 0,
      claimed: false,
      read: false,
      poiType: 'camp',
      party: p,
      ...over,
    }) as ExpeditionMessage;

  it('à l’arrivée du rapport : +1, y compris pour un champion AU PLAFOND (gain d’XP nul)', () => {
    const capped = guerrier('a');
    // missionXpFor donne une entrée à 0 pour un champion au plafond : le compte doit bouger quand même
    const m = msg(win({ xp: { a: 0 } }));
    const r = grantReportXp([m], [m], [capped], 30, 20);
    expect(r.adventurers[0]!.vet).toEqual({ betes: 1 });
  });

  it('à l’arrivée : ni défaite ni point de contrôle ne comptent ; un absent du rapport non plus', () => {
    const lost = msg(win({ win: false }));
    expect(
      grantReportXp([lost], [lost], [guerrier('a')], 30, 20).adventurers[0]!.vet,
    ).toBeUndefined();
    const ctl = msg(win(), { poiType: 'control' });
    expect(
      grantReportXp([ctl], [ctl], [guerrier('a')], 30, 20).adventurers[0]!.vet,
    ).toBeUndefined();
    const m = msg(win());
    expect(grantReportXp([m], [m], [guerrier('z')], 30, 20).adventurers[0]!.vet).toBeUndefined();
  });

  const ctx = {
    pantheonLevel: 30,
    heroLevel: 20,
    infirmaryLevel: 0,
    backAt: 1,
    now: 1,
    healMult: 1,
  };
  it('à l’encaissement : compté UNE fois (jamais si l’XP l’a été à l’arrivée)', () => {
    const p = win();
    const old = partyClaimRoster(p, [guerrier('a')], { ...ctx, xpGranted: false, vet: 'betes' });
    expect(old.adventurers[0]!.vet).toEqual({ betes: 1 });
    const arrived = partyClaimRoster(p, [guerrier('a')], { ...ctx, xpGranted: true, vet: 'betes' });
    expect(arrived.adventurers[0]!.vet).toBeUndefined();
  });
});

describe('💾 le carnet survit au chargement', () => {
  it('normalizeCharacterRow garde vocation et vet', () => {
    const a = guerrier('a', {
      vocation: { nodes: ['guerrier.flair'], freeAt: [NOW + 5] },
      vet: { betes: 3 },
    });
    // normalizeCharacterRow modifie la ligne reçue sur place
    const r = { adventurers: [a] } as unknown as Parameters<typeof normalizeCharacterRow>[0];
    normalizeCharacterRow(r);
    expect(r.adventurers![0]!.vocation).toEqual(a.vocation);
    expect(r.adventurers![0]!.vet).toEqual({ betes: 3 });
  });
});
