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
  readsPulse,
  readingText,
  recordVet,
  vetFactOf,
  vetFactionOf,
  vetLines,
  QUESTS,
  questHitOf,
  questLines,
  recordQuest,
  vocationAmbushMult,
  vocationBudget,
  vocationFree,
  vocationGuardMult,
  vocationRiftMult,
  vocationTree,
  nextRiftGrowth,
  pulseLines,
  type SpawnAhead,
} from '@/lib/vocation';
import {
  incursionWinPct,
  resolveIncursion,
  riftOverflowAt,
  riftPopulation,
  simulateIncursion,
} from '@/lib/rift';
import { attackForecast } from '@/lib/defenseForecast';
import { poiForceOf, ruinsSealKind, type PoiType } from '@/lib/expedition';
import type { RaidFaction } from '@/lib/raid';
import { partyFightSeed } from '@/lib/party';
import { fuseUnits } from '@/lib/skirmish';
import { formatDuration } from '@/lib/duration';
import { grantReportXp, partyClaimRoster } from '@/lib/party';
import {
  ambushChance,
  partyAllies,
  refChampionAdv,
  refAdvGear,
  type EscortKit,
} from '@/lib/caravan';
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
const CHAMP: Record<string, string> = {
  guerrier: 'roan',
  archer: 'sylve',
  mage: 'orsene',
  homme_armes: 'gorm',
  eclaireur: 'fila',
  caravanier: 'boulin',
};
/** Un champion de cette lignée avec ces nœuds. */
const vocAdv = (id: string, lineage: string, nodes: string[]): Adventurer => ({
  ...guerrier(id, { vocation: { nodes } }),
  championId: CHAMP[lineage]!,
});
/** Un lieu de ce type dont les gardes sont de cette faction (id trouvé par balayage : la faction
 *  est dérivée de l'id, `poiForceOf`). */
const gp = (type: PoiType, faction?: RaidFaction) => {
  for (let i = 0; i < 500; i++) {
    const id = `t${i}`;
    if (!faction || poiForceOf({ id, type, level: 20 })?.faction === faction)
      return { id, type, level: 20 };
  }
  throw new Error(`aucun id ${type}/${faction}`);
};
const risky = { perilous: true };
const calm = {};

describe('🎯 les points : un pool commun, rattrapé depuis le niveau 41', () => {
  it('10 au départ, +2 par niveau de héros au-delà de 41', () => {
    expect(vocationBudget(1)).toBe(10);
    expect(vocationBudget(41)).toBe(10);
    expect(vocationBudget(42)).toBe(12);
    expect(vocationBudget(55)).toBe(38);
  });

  it('📉 plafonné à 40 : atteint au niveau 56, plus rien ensuite (le choix demeure)', () => {
    expect(VOCATION.cap).toBe(40);
    expect(vocationBudget(56)).toBe(40);
    expect(vocationBudget(57)).toBe(40);
    expect(vocationBudget(61)).toBe(40);
    expect(vocationBudget(100)).toBe(40);
    // le plafond borne les TOTAUX : un vivier qui avait déjà dépensé plus n'est pas puni (≥ 0)
    const lots = Array.from({ length: 15 }, (_, i) =>
      guerrier(`g${i}`, { vocation: { nodes: ['guerrier.brise-camp'] } }),
    );
    expect(vocationFree(lots, 100, NOW)).toBe(0);
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
    expect(vocationTree({ ...archer('x'), championId: undefined })).toBeNull(); // sans lignée
    expect(learnNode(roster, 'x', 'guerrier.flair', 1, NOW).ok).toBe(false); // pas dans SON carnet
    expect(learnNode(roster, 'x', 'archer.piste', 1, NOW).ok).toBe(true);
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
    expect(vocationGuardMult([brise], gp('camp'))).toBe(0.95);
    expect(vocationGuardMult([brise], gp('lair'))).toBe(0.95);
    expect(vocationGuardMult([brise], gp('mine'))).toBe(1);
    expect(vocationGuardMult([brise], gp('den'))).toBe(1);
    expect(vocationGuardMult([garde], gp('camp'))).toBe(1);
  });

  it('Brise-camp ne se cumule pas entre champions', () => {
    const autre = guerrier('c', { vocation: { nodes: ['guerrier.brise-camp'] } });
    expect(vocationGuardMult([brise, autre], gp('camp'))).toBe(0.95);
  });

  it('🧭 UNE SEULE voie par équipe : la première QUI S’APPLIQUE AU LIEU, jamais deux', () => {
    // Brise-camp d'abord : Garde de route, portée par un autre, ne compte pas
    expect(vocationGuardMult([brise, garde], gp('camp'))).toBe(0.95);
    expect(vocationAmbushMult([brise, garde], risky)).toBe(0.9); // Brise-camp ne dit rien d'une route
    // Garde de route d'abord : elle ne s'applique pas à un camp, Brise-camp passe — l'ordre
    // n'éteint plus la voie du voisin (v1.296.0)
    expect(vocationGuardMult([garde, brise], gp('camp'))).toBe(0.95);
    expect(vocationAmbushMult([garde, brise], risky)).toBe(0.9);
    // un champion sans voie ne compte pas dans l'ordre
    expect(vocationGuardMult([guerrier('z'), brise, garde], gp('camp'))).toBe(0.95);
    // deux voies qui s'appliquent TOUTES LES DEUX au lieu : la première seule, jamais le produit
    const piste = vocAdv('p', 'archer', ['archer.traqueur']);
    expect(vocationGuardMult([piste, brise], gp('den'))).toBe(0.95);
    const exo = vocAdv('m', 'mage', ['mage.exorcisme']);
    const campMort = gp('camp', 'mortsvivants');
    expect(vocationGuardMult([exo, brise], campMort)).toBe(0.95);
    expect(vocationGuardMult([brise, exo], campMort)).toBe(0.95);
  });

  it('Garde de route : −10 % d’embuscades, sur route dangereuse seulement, jamais cumulé', () => {
    expect(vocationAmbushMult([garde], risky)).toBe(0.9);
    expect(vocationAmbushMult([garde], calm)).toBe(1);
    expect(vocationAmbushMult([brise], risky)).toBe(1);
    const autre = guerrier('c', { vocation: { nodes: ['guerrier.garde-route'] } });
    expect(vocationAmbushMult([garde, autre], risky)).toBe(0.9);
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

  it('🔗 une équipe avec LES DEUX voies : le % affiché = une seule voie (la première)', () => {
    const small = poi({ id: 'p0' });
    const both = (first: string, second: string) => {
      const t = team(2);
      t[0] = { ...t[0]!, vocation: { nodes: [first] } };
      t[1] = { ...t[1]!, vocation: { nodes: [second] } };
      return t;
    };
    const shown = (e: Adventurer[]) => partyWinChance(small, e, kit, null, NOW)!;
    // Sur un camp, seule Brise-camp s'applique : même % qu'avec elle seule, dans LES DEUX ORDRES
    expect(shown(both('guerrier.brise-camp', 'guerrier.garde-route'))).toBe(
      shown(team(2, ['guerrier.brise-camp'])),
    );
    expect(shown(both('guerrier.garde-route', 'guerrier.brise-camp'))).toBe(
      shown(team(2, ['guerrier.brise-camp'])),
    );
    // Sur une route dangereuse, seule Garde de route s'applique, dans les deux ordres
    const risky = poi({ type: 'mine', perilous: true });
    expect(ambushChance(risky, both('guerrier.brise-camp', 'guerrier.garde-route'))).toBe(
      ambushChance(risky, team(2, ['guerrier.garde-route'])),
    );
    expect(ambushChance(risky, both('guerrier.garde-route', 'guerrier.brise-camp'))).toBe(
      ambushChance(risky, team(2, ['guerrier.garde-route'])),
    );
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
    const t = readingText('fight', nextOfGroup(spawns, 'fight'), NOW);
    expect(t).toContain('Dans environ 2 h');
    // ⚠️ aucune promesse : ni type exact (la tanière « c1 » est annoncée comme un camp ou un
    // repaire), ni précision à la demi-heure
    expect(t).toContain('un camp ou un repaire');
    expect(t).not.toMatch(/tanière|demi-heure/i);
    expect(readingText('rift', null, NOW)).toContain('Rien d’annoncé');
  });
});

describe('🔭 la prévision des apparitions = ce que la carte fera vraiment', () => {
  it('chaque apparition annoncée arrive à l’heure dite, avec son type, et rien ne manque', () => {
    const H = 3600_000;
    let seen = 0;
    let dangerous = 0;
    for (const seed of [11, 4242, 90210]) {
      const start = createMap(seed, 0, 30, 30);
      const ahead = upcomingSpawns(start, 0, 30, 30);
      // On rejoue la carte pas à pas, comme l'app, et on relève ce qui apparaît.
      const known = new Set(start.pois.map((p) => p.id));
      const real: { id: string; type: string; at: number; perilous?: true }[] = [];
      let m = start;
      for (let t = H / 2; t <= 48 * H; t += H / 2) {
        m = advanceWorld(m, t, 30, 30);
        for (const p of m.pois)
          if (!known.has(p.id)) {
            known.add(p.id);
            // la route dangereuse est tirée au spawn : la lecture « route calme » la lit ici
            real.push({
              id: p.id,
              type: p.type,
              at: p.spawnedAt,
              ...(p.perilous ? { perilous: true as const } : {}),
            });
          }
      }
      expect(ahead).toEqual(real);
      expect(ahead.every((s) => s.at > 0 && !start.pois.some((p) => p.id === s.id))).toBe(true);
      seen += ahead.length;
      dangerous += ahead.filter((s) => s.perilous).length;
    }
    expect(seen, 'aucune apparition : le test ne prouve rien').toBeGreaterThan(5);
    expect(dangerous, 'aucune route dangereuse vue : le drapeau n’est pas éprouvé').toBeGreaterThan(
      0,
    );
  });
});

describe('🔭 l’horizon : 48 h par défaut, fin de fenêtre comprise', () => {
  it('une apparition pile à l’horizon est dedans, une demi-heure avant elle est dehors', () => {
    const start = createMap(11, 0, 30, 30);
    const all = upcomingSpawns(start, 0, 30, 30);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => s.at <= 48 * 3600_000)).toBe(true);
    const first = all[0]!;
    const exact = upcomingSpawns(start, 0, 30, 30, undefined, first.at);
    expect(exact.map((s) => s.id)).toContain(first.id);
    const before = upcomingSpawns(start, 0, 30, 30, undefined, first.at - 30 * 60_000);
    expect(before.map((s) => s.id)).not.toContain(first.id);
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

  it('ne compte PAS une victoire sans combat (filon, héros tombé, mine de mana : foes 0)', () => {
    for (const t of ['vein', 'fallen', 'mana_mine'] as const)
      expect(vetFactionOf(win({ foes: 0 }), t), t).toBeNull();
  });

  it('🏅 la pastille « Vétéran » de la fiche d’un lieu : le meilleur titre, ou rien', () => {
    expect(vetFactOf([guerrier('a')])).toBeNull();
    const f = vetFactOf([
      guerrier('a', { name: 'Anne', vet: { bandits: 16 } }),
      guerrier('b', { name: 'Bob', vet: { mortsvivants: 40 } }),
    ]);
    expect(f).toMatchObject({ label: 'Vétéran', value: 'Purificateur', icon: '💀' });
    expect(f!.title).toContain('Bob');
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
    const old = partyClaimRoster(p, [guerrier('a')], {
      ...ctx,
      xpGranted: false,
      vet: 'betes',
      quest: null,
    });
    expect(old.adventurers[0]!.vet).toEqual({ betes: 1 });
    const arrived = partyClaimRoster(p, [guerrier('a')], {
      ...ctx,
      xpGranted: true,
      vet: 'betes',
      quest: null,
    });
    expect(arrived.adventurers[0]!.vet).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🌳 v1.296.0 — LES CINQ AUTRES LIGNÉES
// ─────────────────────────────────────────────────────────────────────────────
const LINEAGES = ['archer', 'mage', 'homme_armes', 'eclaireur', 'caravanier'] as const;

describe('🌳 les cinq autres carnets : 2 lectures à 1 point, 2 voies à 3 points, exclusives', () => {
  it('chaque lignée a SON carnet, sans doublon d’identifiant', () => {
    const ids = new Set<string>();
    for (const l of LINEAGES) {
      const tree = vocationTree(vocAdv('x', l, []))!;
      expect(tree, l).not.toBeNull();
      const info = tree.filter((n) => n.kind === 'info');
      const major = tree.filter((n) => n.kind === 'major');
      expect(info, l).toHaveLength(2);
      expect(major, l).toHaveLength(2);
      for (const n of info) {
        expect(n.cost).toBe(1);
        expect(n.spawn || n.pulse, n.id).toBeTruthy();
      }
      for (const n of major) expect(n.cost).toBe(3);
      expect(major[0]!.excl).toBe(major[1]!.id);
      expect(major[1]!.excl).toBe(major[0]!.id);
      for (const n of tree) {
        expect(n.lineage).toBe(l);
        expect(n.id.startsWith(`${l}.`), n.id).toBe(true);
        expect(ids.has(n.id), `doublon ${n.id}`).toBe(false);
        ids.add(n.id);
      }
    }
  });

  it('l’exclusivité tient : une voie barre l’autre sur le même champion, pas sur un autre', () => {
    for (const l of LINEAGES) {
      const [a, b] = vocationTree(vocAdv('x', l, []))!.filter((n) => n.kind === 'major');
      const roster = [vocAdv('x', l, []), vocAdv('y', l, [])];
      const r = learnNode(roster, 'x', a!.id, 99, NOW);
      if (!r.ok) throw new Error(`${l} : ${r.reason}`);
      expect(learnNode(r.roster, 'x', b!.id, 99, NOW)).toEqual({
        ok: false,
        reason: 'incompatible avec son autre voie',
      });
      expect(learnNode(r.roster, 'y', b!.id, 99, NOW).ok, l).toBe(true);
    }
  });

  it('chaque voie majeure a un effet MESURABLE quelque part (aucune tuile morte)', () => {
    const types: PoiType[] = [
      'camp',
      'lair',
      'den',
      'mine',
      'well',
      'shrine',
      'archive',
      'ruins',
      'plunder',
    ];
    const factions: RaidFaction[] = ['bandits', 'betes', 'mortsvivants'];
    for (const l of LINEAGES) {
      for (const n of vocationTree(vocAdv('x', l, []))!.filter((m) => m.kind === 'major')) {
        const t = [vocAdv('x', l, [n.id])];
        // (une tanière n'a que des bêtes, une caravane pillée que des bandits : id sans faction)
        const guard = types.flatMap((ty) =>
          ty === 'den' || ty === 'plunder'
            ? [vocationGuardMult(t, gp(ty))]
            : factions.map((f) => vocationGuardMult(t, gp(ty, f))),
        );
        const ambush = [calm, risky, { riftPeril: true }, { nestPeril: true }].map((p) =>
          vocationAmbushMult(t, p),
        );
        const rift = vocationRiftMult(t);
        const acts = [...guard, ...ambush, rift.foe, rift.boss].some((v) => v < 1);
        expect(acts, n.id).toBe(true);
      }
    }
  });
});

describe('⚔️ les voies par type de lieu et par faction', () => {
  const only = (l: string, node: string) => [vocAdv('x', l, [node])];
  const g = (l: string, node: string, p: ReturnType<typeof gp>) =>
    vocationGuardMult(only(l, node), p);

  it('🐾 Traqueur : −5 % sur la bête d’une TANIÈRE seulement', () => {
    expect(g('archer', 'archer.traqueur', gp('den'))).toBe(0.95);
    for (const t of ['camp', 'lair', 'mine', 'ruins'] as const)
      expect(g('archer', 'archer.traqueur', gp(t, 'betes')), t).toBe(1);
  });

  it('🕯️ Exorcisme : −5 % sur les morts-vivants d’un camp, d’un repaire ou d’une garde', () => {
    for (const t of ['camp', 'lair', 'mine', 'well', 'shrine', 'archive', 'ruins'] as const)
      expect(g('mage', 'mage.exorcisme', gp(t, 'mortsvivants')), t).toBe(0.95);
    expect(g('mage', 'mage.exorcisme', gp('camp', 'betes'))).toBe(1);
    expect(g('mage', 'mage.exorcisme', gp('camp', 'bandits'))).toBe(1);
    expect(g('mage', 'mage.exorcisme', gp('den'))).toBe(1);
  });

  it('🐺 Pisteur : −5 % sur les bêtes d’un camp, d’un repaire ou d’une garde, SAUF en tanière', () => {
    for (const t of ['camp', 'lair', 'mine', 'archive', 'ruins'] as const)
      expect(g('eclaireur', 'eclaireur.pisteur', gp(t, 'betes')), t).toBe(0.95);
    expect(g('eclaireur', 'eclaireur.pisteur', gp('den'))).toBe(1); // la tanière est à Traqueur
    expect(g('eclaireur', 'eclaireur.pisteur', gp('camp', 'bandits'))).toBe(1);
    expect(g('eclaireur', 'eclaireur.pisteur', gp('camp', 'mortsvivants'))).toBe(1);
  });

  it('🗝️ Mots de passe : −5 % sur les bandits d’un camp, d’un repaire ou d’une garde, pillée comprise', () => {
    for (const t of ['camp', 'lair', 'mine', 'plunder', 'ruins'] as const)
      expect(g('caravanier', 'caravanier.mots-de-passe', gp(t, 'bandits')), t).toBe(0.95);
    expect(g('caravanier', 'caravanier.mots-de-passe', gp('camp', 'betes'))).toBe(1);
  });

  it('🛡️ Escorte armée : −5 % sur les gardes d’une mine, d’une source, d’un sanctuaire, d’archives', () => {
    for (const t of ['mine', 'well', 'shrine', 'archive'] as const)
      expect(g('homme_armes', 'homme_armes.escorte', gp(t)), t).toBe(0.95);
    for (const t of ['camp', 'lair', 'den', 'ruins', 'plunder'] as const)
      expect(g('homme_armes', 'homme_armes.escorte', gp(t)), t).toBe(1);
  });

  it('🧱 Briseur de garde : −5 % sur les gardes de ruines ou d’une caravane pillée', () => {
    for (const t of ['ruins', 'plunder'] as const)
      expect(g('homme_armes', 'homme_armes.brise-garde', gp(t)), t).toBe(0.95);
    for (const t of ['mine', 'well', 'camp', 'den'] as const)
      expect(g('homme_armes', 'homme_armes.brise-garde', gp(t)), t).toBe(1);
  });

  it('⛔ aucune voie par faction n’agit sur un point de contrôle, une armée en campagne, ni un lieu sans garde', () => {
    const control = {
      id: 'ctl_mine',
      type: 'control' as const,
      level: 20,
      control: {
        kind: 'mine',
        owner: 'enemy',
        faction: 'betes',
        size: 2,
        garrison: [],
        retakes: 0,
      },
    } as unknown as Poi;
    const nodes: [string, string][] = [
      ['mage', 'mage.exorcisme'],
      ['eclaireur', 'eclaireur.pisteur'],
      ['caravanier', 'caravanier.mots-de-passe'],
      ['archer', 'archer.traqueur'],
      ['homme_armes', 'homme_armes.escorte'],
      ['homme_armes', 'homme_armes.brise-garde'],
      ['guerrier', 'guerrier.brise-camp'],
    ];
    for (const [l, n] of nodes) {
      for (const f of ['bandits', 'betes', 'mortsvivants'] as const) {
        expect(
          g(l, n, { ...control, control: { ...control.control!, faction: f } } as Poi),
          n,
        ).toBe(1);
        expect(g(l, n, { ...gp('warband'), faction: f } as unknown as Poi), n).toBe(1);
      }
      for (const t of ['vein', 'fallen', 'mana_mine', 'rift'] as const)
        expect(g(l, n, gp(t)), n).toBe(1);
    }
  });

  it('🧭 la première voie qui s’applique à CE lieu, quel que soit l’ordre de l’escorte', () => {
    const traq = vocAdv('a', 'archer', ['archer.traqueur']);
    const pist = vocAdv('b', 'eclaireur', ['eclaireur.pisteur']);
    const mdp = vocAdv('c', 'caravanier', ['caravanier.mots-de-passe']);
    const esc = vocAdv('d', 'homme_armes', ['homme_armes.escorte']);
    const den = gp('den');
    const mineBetes = gp('mine', 'betes');
    for (const order of [
      [traq, pist, mdp, esc],
      [esc, mdp, pist, traq],
      [pist, traq, esc, mdp],
    ]) {
      expect(vocationGuardMult(order, den)).toBe(0.95); // Traqueur seul
      expect(vocationGuardMult(order, mineBetes)).toBe(0.95); // Pisteur OU Escorte : jamais 0,9025
      expect(vocationGuardMult(order, gp('camp', 'bandits'))).toBe(0.95); // Mots de passe seul
      expect(vocationGuardMult(order, gp('camp', 'mortsvivants'))).toBe(1); // aucune ne s'y applique
    }
  });
});

describe('🛣️ les routes', () => {
  const only = (l: string, node: string) => [vocAdv('x', l, [node])];
  const harassed = { riftPeril: true };
  const nest = { nestPeril: true };

  it('👣 Pas de loup : −10 % d’embuscades sur une route CALME seulement', () => {
    const t = only('eclaireur', 'eclaireur.pas-de-loup');
    expect(vocationAmbushMult(t, calm)).toBe(0.9);
    expect(vocationAmbushMult(t, risky)).toBe(1);
    expect(vocationAmbushMult(t, harassed)).toBe(1);
    expect(vocationAmbushMult(t, nest)).toBe(1);
  });

  it('🌫️ Détour sûr : −20 % sur une route HARCELÉE (faille débordée ou nid) seulement', () => {
    const t = only('caravanier', 'caravanier.detour');
    expect(vocationAmbushMult(t, harassed)).toBe(0.8);
    expect(vocationAmbushMult(t, nest)).toBe(0.8);
    expect(vocationAmbushMult(t, { perilous: true, riftPeril: true })).toBe(0.8);
    expect(vocationAmbushMult(t, risky)).toBe(1); // dangereuse sans harcèlement : non
    expect(vocationAmbushMult(t, calm)).toBe(1);
  });

  it('🧭 une seule voie de route : la première qui s’applique, jamais le produit', () => {
    const garde = vocAdv('g', 'guerrier', ['guerrier.garde-route']);
    const detour = vocAdv('d', 'caravanier', ['caravanier.detour']);
    const loup = vocAdv('l', 'eclaireur', ['eclaireur.pas-de-loup']);
    const both = { perilous: true, riftPeril: true };
    expect(vocationAmbushMult([garde, detour], both)).toBe(0.9);
    expect(vocationAmbushMult([detour, garde], both)).toBe(0.8);
    // Garde de route ne dit rien d'une route calme : Pas de loup, derrière elle, s'applique
    expect(vocationAmbushMult([garde, loup], calm)).toBe(0.9);
    expect(vocationAmbushMult([loup, garde], calm)).toBe(0.9);
    // et sur une route dangereuse, c'est Garde de route, jamais Pas de loup
    expect(vocationAmbushMult([loup, garde], risky)).toBe(0.9);
  });

  it('🔗 le vrai trajet : la chance d’embuscade baisse vraiment (calme, harcelée)', () => {
    const base: Poi = {
      id: 'p1',
      type: 'mine',
      level: 20,
      x: 60,
      y: 60,
      distNorm: 0.5,
      spawnedAt: 0,
      expiresAt: 9e15,
    };
    const tm = (nodes: string[]) =>
      Array.from({ length: 3 }, (_, i) => ({
        ...refChampionAdv(20, i),
        id: `adv_${i}`,
        ...(i === 0 && nodes.length ? { vocation: { nodes } } : {}),
      }));
    const loup = tm(['eclaireur.pas-de-loup']);
    expect(ambushChance(base, loup)).toBeCloseTo(ambushChance(base, tm([])) * 0.9, 10);
    const hr: Poi = { ...base, riftPeril: true };
    const det = tm(['caravanier.detour']);
    expect(ambushChance(hr, det)).toBeCloseTo(ambushChance(hr, tm([])) * 0.8, 10);
    expect(ambushChance(base, det)).toBe(ambushChance(base, tm([])));
  });
});

describe('🕳️ les failles : monstres (Pluie de flèches) ou gardien (Contre-sort)', () => {
  const none = { foe: 1, boss: 1 };
  it('Pluie de flèches : monstres ×0,85, gardien intact', () => {
    expect(vocationRiftMult([vocAdv('a', 'archer', ['archer.volee'])])).toEqual({
      foe: 0.85,
      boss: 1,
    });
  });
  it('Contre-sort : gardien ×0,93, monstres intacts', () => {
    expect(vocationRiftMult([vocAdv('m', 'mage', ['mage.contresort'])])).toEqual({
      foe: 1,
      boss: 0.93,
    });
  });
  it('sans voie, ou avec une voie qui ne touche pas les failles : aucun effet', () => {
    expect(vocationRiftMult([guerrier('z')])).toEqual(none);
    expect(vocationRiftMult([vocAdv('g', 'guerrier', ['guerrier.brise-camp'])])).toEqual(none);
    expect(vocationRiftMult([vocAdv('e', 'mage', ['mage.exorcisme'])])).toEqual(none);
  });
  it('🧭 une seule voie de faille par équipe : la première, jamais les deux', () => {
    const a = vocAdv('a', 'archer', ['archer.volee']);
    const m = vocAdv('m', 'mage', ['mage.contresort']);
    const e = vocAdv('e', 'mage', ['mage.exorcisme']);
    expect(vocationRiftMult([a, m])).toEqual({ foe: 0.85, boss: 1 });
    expect(vocationRiftMult([m, a])).toEqual({ foe: 1, boss: 0.93 });
    expect(vocationRiftMult([e, m])).toEqual({ foe: 1, boss: 0.93 }); // Exorcisme ne dit rien d'une faille
  });

  // Le MÊME facteur, du pronostic au vrai combat.
  const L = 26;
  const DAY = 24 * 3600_000;
  const rift: Poi = {
    id: 'rift_1',
    type: 'rift',
    level: L,
    x: 60,
    y: 60,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 9e15,
  };
  const tm = (nodes: string[]) =>
    Array.from({ length: 3 }, (_, i) => ({
      ...refChampionAdv(L, i),
      id: `adv_${i}`,
      ...(i === 0 && nodes.length ? { vocation: { nodes } } : {}),
    }));
  const road: EscortKit = { advGear: refAdvGear(L, 3) };

  for (const [name, node, foe, boss] of [
    ['Pluie de flèches', 'archer.volee', 0.85, 1],
    ['Contre-sort', 'mage.contresort', 1, 0.93],
  ] as const) {
    it(`🔗 ${name} : le % affiché et le VRAI combat lisent le même facteur`, () => {
      const now = 5 * DAY;
      const team = tm([node]);
      const allies = partyAllies(team, road, null);
      const shown = partyWinChance(rift, team, road, null, now, 200)!;
      expect(shown).toBe(incursionWinPct(rift, allies, now, 200, foe, boss));
      expect(shown, 'le facteur n’est pas lu').not.toBe(
        partyWinChance(rift, tm([]), road, null, now, 200),
      );
      for (let seed = 1; seed <= 60; seed++) {
        const won = resolveIncursion({
          poi: rift,
          escort: team,
          road,
          hero: null,
          seed,
          now,
          pantheonLevel: L,
          heroLevel: L,
        }).win;
        const group = fuseUnits(allies, 'Groupe');
        expect(won, `graine ${seed}`).toBe(
          simulateIncursion(group, rift, now, partyFightSeed(seed), foe, boss).cleared,
        );
      }
    });
  }

  it('🔗 Voie de faille ET lanterne : les deux facteurs se multiplient (une voie, un consommable)', () => {
    const now = 5 * DAY;
    const team = tm(['mage.contresort']);
    const lit: EscortKit = { ...road, supplies: ['lanterne'] };
    const allies = partyAllies(team, lit, null);
    expect(partyWinChance(rift, team, lit, null, now, 120)).toBe(
      incursionWinPct(rift, allies, now, 120, 0.85, 0.9 * 0.93),
    );
  });
});

describe('🔮 le pronostic d’un assaut voit Brise-camp (défaut de la v1.283 corrigé)', () => {
  const road: EscortKit = { advGear: refAdvGear(30, 3) };
  const tm = (nodes: string[]) =>
    Array.from({ length: 3 }, (_, i) => ({
      ...refChampionAdv(30, i),
      id: `adv_${i}`,
      ...(i === 0 && nodes.length ? { vocation: { nodes } } : {}),
    }));
  const camp = (id: string): Poi => ({
    id,
    type: 'camp',
    level: 30,
    x: 60,
    y: 60,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 9e15,
  });

  it('les pastilles 🔮 (attackForecast) rejouent le combat AVEC la voie, comme le 🎯 %', () => {
    // un camp dont la chance, pour trois champions, n'est ni 0 ni 1 : le facteur s'y voit
    let tested = 0;
    for (let i = 0; i < 30 && tested < 3; i++) {
      const poi = camp(`c${i}`);
      for (const n of [1, 2]) {
        const plain = attackForecast(poi, tm([]).slice(0, n), road, null, 240);
        if (!plain || plain.win < 0.1 || plain.win > 0.85) continue;
        const team = tm(['guerrier.brise-camp']).slice(0, n);
        const brave = attackForecast(poi, team, road, null, 240)!;
        expect(brave.win).toBe(partyWinChance(poi, team, road, null, 0, 40));
        expect(brave.win).toBeGreaterThan(plain.win);
        tested++;
      }
    }
    expect(tested, 'aucun camp à chance moyenne trouvé : le test ne prouve rien').toBeGreaterThan(
      0,
    );
  });
});

describe('🔭 les nouvelles lectures', () => {
  const H = 3600_000;
  const ruinsOf = (kind: 'champion' | 'gear') => {
    for (let i = 0; i < 200; i++) if (ruinsSealKind({ id: `u${i}` }) === kind) return `u${i}`;
    throw new Error('aucune ruine');
  };
  const spawns: SpawnAhead[] = [
    { id: 'd1', type: 'den', at: NOW + 9 * H },
    { id: 'c1', type: 'camp', at: NOW + 1 * H },
    { id: ruinsOf('gear'), type: 'ruins', at: NOW + 2 * H },
    { id: ruinsOf('champion'), type: 'ruins', at: NOW + 11 * H },
    { id: 's1', type: 'shrine', at: NOW + 6 * H },
    { id: 'w1', type: 'well', at: NOW + 7 * H },
    { id: 'a1', type: 'archive', at: NOW + 8 * H },
    { id: 'f1', type: 'fallen', at: NOW + 12 * H },
    { id: 'm1', type: 'mine', at: NOW + 13 * H, perilous: true },
    { id: 'm2', type: 'mine', at: NOW + 14 * H },
    { id: 'm3', type: 'vein', at: NOW + 15 * H },
  ];
  it('chaque famille ne voit que SES lieux', () => {
    expect(nextOfGroup(spawns, 'den')?.id).toBe('d1'); // pas le camp, plus proche
    expect(nextOfGroup(spawns, 'shrine')?.id).toBe('s1');
    expect(nextOfGroup(spawns, 'well')?.id).toBe('w1');
    expect(nextOfGroup(spawns, 'archive')?.id).toBe('a1');
    expect(nextOfGroup(spawns, 'fallen')?.id).toBe('f1');
    expect(nextOfGroup(spawns, 'mine')?.id).toBe('m1'); // une mine, dangereuse comprise
  });
  it('🔱 / ⚜️ : la nature des sceaux se lit dans l’id, la famille ne voit que la sienne', () => {
    expect(nextOfGroup(spawns, 'sealChamp')?.at).toBe(NOW + 11 * H);
    expect(nextOfGroup(spawns, 'sealGear')?.at).toBe(NOW + 2 * H);
    expect(nextOfGroup(spawns, 'ruins')?.at).toBe(NOW + 2 * H); // toutes les ruines
  });
  it('🧭 « route calme » : une récolte dont la route n’est pas dangereuse', () => {
    expect(nextOfGroup(spawns, 'calm')?.at).toBe(NOW + 2 * H); // les ruines (récolte), 2 h
    const dangerFirst: SpawnAhead[] = [
      { id: 'm', type: 'mine', at: NOW + 1 * H, perilous: true },
      { id: 'w', type: 'well', at: NOW + 5 * H },
    ];
    expect(nextOfGroup(dangerFirst, 'calm')?.id).toBe('w'); // la mine dangereuse ne compte pas
    expect(nextOfGroup([{ id: 'c', type: 'camp', at: NOW }], 'calm')).toBeNull(); // un camp n'est pas une récolte
    expect(nextOfGroup([{ id: 'm', type: 'mine', at: NOW, perilous: true }], 'calm')).toBeNull();
  });
  it('les lectures acquises ouvrent LEURS familles', () => {
    const a = vocAdv('a', 'archer', ['archer.piste', 'archer.sceaux', 'archer.traqueur']);
    expect(readableGroups(a)).toEqual(['den', 'sealChamp']);
    expect(
      readableGroups(vocAdv('e', 'eclaireur', ['eclaireur.source', 'eclaireur.archives'])),
    ).toEqual(['well', 'archive']);
    expect(
      readableGroups(vocAdv('h', 'homme_armes', ['homme_armes.tombe', 'homme_armes.sceaux-objet'])),
    ).toEqual(['fallen', 'sealGear']);
    expect(
      readableGroups(vocAdv('c', 'caravanier', ['caravanier.mine', 'caravanier.route'])),
    ).toEqual(['mine', 'calm']);
    expect(readableGroups(vocAdv('m', 'mage', ['mage.sanctuaire', 'mage.pouls']))).toEqual([
      'shrine',
    ]);
    expect(readsPulse(vocAdv('m', 'mage', ['mage.pouls']))).toBe(true);
    expect(readsPulse(vocAdv('m', 'mage', ['mage.sanctuaire']))).toBe(false);
  });
  it('les phrases restent vagues et nomment la famille', () => {
    expect(readingText('den', nextOfGroup(spawns, 'den'), NOW)).toContain('une tanière');
    expect(readingText('calm', nextOfGroup(spawns, 'calm'), NOW)).toMatch(/route calme/);
    expect(readingText('sealChamp', nextOfGroup(spawns, 'sealChamp'), NOW)).toContain(
      'sceaux de champion',
    );
    for (const g of [
      'fight',
      'rift',
      'ruins',
      'den',
      'sealChamp',
      'sealGear',
      'shrine',
      'well',
      'archive',
      'fallen',
      'mine',
      'calm',
    ] as const) {
      const t = readingText(g, { id: 'x', type: 'camp', at: NOW + 3 * H }, NOW);
      expect(t, g).toContain('Dans environ 3 h');
      expect(t, g).not.toMatch(/demi-heure/);
    }
  });
});

describe('💓 Pouls des failles : le prochain monstre d’une faille ouverte', () => {
  const H = 3600_000;
  const rift = { id: 'r1', type: 'rift' as const, level: 30, spawnedAt: 0 };
  it('rend l’instant EXACT où l’effectif monte, jamais avant', () => {
    for (const now of [0, 5 * H, 30 * H, 70 * H]) {
      const t = nextRiftGrowth(rift, now);
      expect(t, `à ${now}`).not.toBeNull();
      const p0 = riftPopulation(rift, now);
      expect(t!).toBeGreaterThan(now);
      expect(riftPopulation(rift, t!)).toBeGreaterThan(p0);
      expect(riftPopulation(rift, t! - 1000)).toBe(p0); // pas une seconde plus tôt
    }
  });
  it('rien quand la faille est au plus haut (elle déborde alors, rien de plus à gagner)', () => {
    const end = riftOverflowAt(rift);
    expect(nextRiftGrowth(rift, end)).toBeNull();
    expect(nextRiftGrowth(rift, end + H)).toBeNull();
  });
  it('les lignes : une par faille ouverte (3 au plus), la plus proche d’abord, vide dit « aucune »', () => {
    expect(pulseLines([], 0)).toEqual(['Aucune faille ouverte.']);
    expect(pulseLines([{ id: 'm', type: 'mine', level: 3, spawnedAt: 0 }], 0)).toEqual([
      'Aucune faille ouverte.',
    ]);
    const rifts = [0, 1, 2, 3].map((i) => ({
      id: `r${i}`,
      type: 'rift' as const,
      level: 20 + i,
      spawnedAt: -i * 17 * H,
    }));
    const lines = pulseLines(rifts, 10 * H);
    expect(lines).toHaveLength(3);
    const ats = rifts
      .map((r) => nextRiftGrowth(r, 10 * H))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    expect(lines[0]).toContain(`Dans environ ${formatDuration(ats[0]! - 10 * H)}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// 🎖️ v1.300.0 — LA QUÊTE PERSONNELLE DU GUERRIER : « Chef de bande »
// ─────────────────────────────────────────────────────────────────────────────
describe('🎖️ quête personnelle : le guerrier en tête, escorte ≤ 2, sans le héros', () => {
  const Q = QUESTS[0]!;
  /** Un rapport gagné contre des bandits, le guerrier `a` en tête, deux compagnons. */
  const win = (over: Partial<PartyResult> = {}): PartyResult =>
    ({
      hero: false,
      faction: 'bandits',
      escort: ['a', 'b', 'c'],
      win: true,
      foes: 3,
      slain: 3,
      kills: {},
      heroKills: 0,
      xp: { a: 10, b: 10, c: 10 },
      hurt: [],
      journal: [],
      ...over,
    }) as unknown as PartyResult;
  const hit = (p: PartyResult, t: PoiType = 'camp') => questHitOf(p, t);
  /** Compte un rapport pour tout le vivier (comme le fait `grantReportXp`). */
  const count = (roster: Adventurer[], p: PartyResult, t: PoiType = 'camp') =>
    roster.map((a) => recordQuest(a, hit(p, t)));

  it('un camp gagné, guerrier en tête, 3 champions sans héros : +1', () => {
    const [a] = count([guerrier('a')], win());
    expect(a!.quest).toEqual({ [Q.id]: 1 });
  });

  it('le seuil est 3 victoires, et le compte s’arrête au but', () => {
    let a = guerrier('a');
    for (let i = 0; i < 6; i++) a = recordQuest(a, hit(win()));
    expect(a.quest).toEqual({ [Q.id]: Q.wins });
    expect(Q.wins).toBe(3);
    expect(questLines(a)[0]).toMatchObject({ wins: 3, total: 3, done: true });
  });

  it('SANS le héros : avec lui, rien ne compte', () => {
    expect(hit(win({ hero: true }))).toBeNull();
  });

  it('escorte ≤ 2 : 3 champions comptent, 4 non', () => {
    const [ok] = count([guerrier('a')], win({ escort: ['a', 'b', 'c'] }));
    expect(ok!.quest?.[Q.id]).toBe(1);
    const [trop] = count([guerrier('a')], win({ escort: ['a', 'b', 'c', 'd'] }));
    expect(trop).toEqual(guerrier('a'));
    const [seul] = count([guerrier('a')], win({ escort: ['a'] }));
    expect(seul!.quest?.[Q.id]).toBe(1);
  });

  it('le guerrier doit être EN TÊTE : second ou troisième de l’escorte, rien', () => {
    const r = count([guerrier('a'), guerrier('b')], win({ escort: ['b', 'a'] }));
    expect(r[0]!.quest).toBeUndefined(); // a est second
    expect(r[1]!.quest?.[Q.id]).toBe(1); // b est en tête
  });

  it('la lignée compte : un archer en tête ne fait pas avancer la quête du guerrier', () => {
    const [x] = count([archer('a')], win());
    expect(x!.quest).toBeUndefined();
  });

  it('seuls les camps, repaires et tanières de la faction de l’île comptent', () => {
    for (const t of ['camp', 'lair', 'den'] as const)
      expect(recordQuest(guerrier('a'), hit(win(), t)).quest?.[Q.id], t).toBe(1);
    for (const t of ['mine', 'rift', 'warband'] as const)
      expect(recordQuest(guerrier('a'), hit(win(), t)).quest, t).toBeUndefined();
    expect(recordQuest(guerrier('a'), hit(win({ faction: 'betes' }))).quest).toBeUndefined();
  });

  it('défaite, convoi, point de contrôle, arrivée tardive, combat vide : aucun coup, aucune perte', () => {
    for (const over of [
      { win: false },
      { convoy: true },
      { controlId: 'ctl_x' },
      { defense: true },
      { late: true },
      { foes: 0 },
    ] as Partial<PartyResult>[])
      expect(hit(win(over)), JSON.stringify(over)).toBeNull();
    expect(hit(win(), 'control')).toBeNull();
    expect(questHitOf(win({ escort: [] }), 'camp')).toBeNull();
    // une défaite après 2 victoires ne retire rien
    const a = guerrier('a', { quest: { [Q.id]: 2 } });
    expect(recordQuest(a, hit(win({ win: false })))).toBe(a);
  });

  it('rend le MÊME objet quand rien ne bouge', () => {
    const a = guerrier('a');
    expect(recordQuest(a, null)).toBe(a);
    const done = guerrier('a', { quest: { [Q.id]: Q.wins } });
    expect(recordQuest(done, hit(win()))).toBe(done);
  });

  it('IDEMPOTENT : un rapport déjà versé (xpGranted) ne recompte pas, ni au rechargement', () => {
    const m = {
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
      party: win(),
    } as ExpeditionMessage;
    const first = grantReportXp([m], [m], [guerrier('a')], 30, 20);
    expect(first.adventurers[0]!.quest).toEqual({ [Q.id]: 1 });
    expect(first.messages[0]!.xpGranted).toBe(true);
    // le même message, rejoué (second appareil, rechargement) : plus rien à verser
    const again = grantReportXp(first.messages, first.messages, first.adventurers, 30, 20);
    expect(again.adventurers[0]!.quest).toEqual({ [Q.id]: 1 });
    // l'encaissement d'un rapport déjà versé ne recompte pas non plus
    const ctx = {
      pantheonLevel: 30,
      heroLevel: 20,
      infirmaryLevel: 0,
      backAt: 1,
      now: 1,
      healMult: 1,
      vet: 'bandits' as const,
      quest: hit(win()),
    };
    const claimed = partyClaimRoster(win(), first.adventurers, { ...ctx, xpGranted: true });
    expect(claimed.adventurers[0]!.quest).toEqual({ [Q.id]: 1 });
    // un rapport d'AVANT le versement à l'arrivée compte à l'encaissement, une fois
    const old = partyClaimRoster(win(), [guerrier('a')], { ...ctx, xpGranted: false });
    expect(old.adventurers[0]!.quest).toEqual({ [Q.id]: 1 });
  });

  it('le trait n’existe qu’à l’accomplissement, et UNE seule fois', () => {
    const a = guerrier('a', { quest: { [Q.id]: Q.wins - 1 } });
    expect(readableGroups(a)).not.toContain('fallen');
    expect(questLines(a)[0]).toMatchObject({ wins: 2, done: false });
    const b = recordQuest(a, hit(win()));
    expect(readableGroups(b)).toContain('fallen');
    expect(readableGroups(b).filter((g) => g === 'fallen')).toHaveLength(1);
    expect(readableGroups(recordQuest(b, hit(win())))).toEqual(readableGroups(b));
  });

  it('le trait est une INFORMATION : ni point, ni nœud, ni effet au combat', () => {
    const base = guerrier('a');
    const done = guerrier('a', { quest: { [Q.id]: Q.wins } });
    expect(vocationFree([done], 60, NOW)).toBe(vocationFree([base], 60, NOW));
    expect(vocationTree(done)).toEqual(vocationTree(base));
    const camp = gp('camp', 'bandits');
    expect(vocationGuardMult([done], camp)).toBe(vocationGuardMult([base], camp));
    expect(vocationAmbushMult([done], { type: 'camp', perilous: true } as never)).toBe(1);
    expect(vetLines(done)).toEqual(vetLines(base));
  });

  it('la lecture du trait s’ajoute à celles des nœuds, sans doublon', () => {
    const a = guerrier('a', { vocation: { nodes: ['guerrier.flair'] }, quest: { [Q.id]: Q.wins } });
    expect(readableGroups(a)).toEqual(['fight', 'fallen']);
  });

  it('la table : une quête par (lignée, île), île connue, trait = lecture', () => {
    const keys = QUESTS.map((q) => `${q.lineage}/${q.island}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const q of QUESTS) {
      expect(q.island).toBeGreaterThanOrEqual(1);
      expect(q.wins).toBeGreaterThan(0);
      expect(q.trait.spawn).toBeTruthy();
    }
  });

  it('rien ne s’affiche pour une lignée sans quête, ni pour un champion sans lignée', () => {
    expect(questLines(archer('a'))).toEqual([]);
    expect(questLines({ ...guerrier('a'), championId: undefined })).toEqual([]);
  });

  it('💾 la quête survit au chargement', () => {
    const a = guerrier('a', { quest: { [Q.id]: 2 } });
    const r = { adventurers: [a] } as unknown as Parameters<typeof normalizeCharacterRow>[0];
    normalizeCharacterRow(r);
    expect(r.adventurers![0]!.quest).toEqual({ [Q.id]: 2 });
  });
});
