import { describe, expect, it } from 'vitest';
import {
  DAILY_COUNT,
  OBJECTIVE_KINDS,
  dailyCounters,
  dailyObjectives,
  dailyStatesFor,
  dayIndex,
  dayStartMs,
  dueObjectives,
  objectiveStates,
  objectiveView,
  latchedToday,
  bonusDue,
  claimRetryKey,
  dailyReward,
  rewardStock,
  rewardView,
  type DailyCounters,
  type DailyObjective,
} from '@/lib/dailyObjectives';
import { archipelOn } from '@/lib/archipelago';
import {
  advanceWorld,
  createMap,
  type ExpeditionMap,
  type ExpeditionMessage,
} from '@/lib/expedition';
import { CONSUMABLE_IDS } from '@/lib/supplies';

const PARIS = -120; // getTimezoneOffset() en heure d'été
const T0 = Date.UTC(2026, 9, 29, 10, 0); // 29 oct. 2026, 11 h à Paris (heure d'hiver : UTC+1)

const msg = (over: Partial<ExpeditionMessage> & { rift?: boolean; partyWin?: boolean } = {}) => {
  const { rift, partyWin, ...rest } = over;
  return {
    id: 'm' + Math.random(),
    poiType: 'mine',
    level: 5,
    win: true,
    text: '',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: T0,
    read: true,
    ...(rift
      ? { party: { win: partyWin ?? true, rift: { level: 1, maxPv: 1, pvTrail: [] } } }
      : {}),
    ...rest,
  } as ExpeditionMessage;
};

describe('🎯 dailyObjectives — le tirage', () => {
  it('trois objectifs de types distincts, cibles dans leurs bornes, récompense = un consommable', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const objs = dailyObjectives(seed * 7919, seed % 5, seed);
      expect(objs).toHaveLength(DAILY_COUNT);
      expect(new Set(objs.map((o) => o.kind)).size).toBe(DAILY_COUNT);
      for (const o of objs) {
        const d = OBJECTIVE_KINDS[o.kind];
        expect(o.target).toBeGreaterThanOrEqual(d.min);
        expect(o.target).toBeLessThanOrEqual(d.max);
      }
    }
  });

  it('pur : mêmes (graine, île, jour) → mêmes objectifs', () => {
    expect(dailyObjectives(123, 2, 20_000)).toEqual(dailyObjectives(123, 2, 20_000));
  });

  it('un autre jour, une autre île ou une autre graine donne un autre tirage', () => {
    const sig = (seed: number, island: number, day: number) =>
      JSON.stringify(dailyObjectives(seed, island, day));
    const days = new Set(Array.from({ length: 30 }, (_, d) => sig(123, 1, 20_000 + d)));
    const islands = new Set([1, 2, 3, 4, 5].map((i) => sig(123, i, 20_000)));
    const seeds = new Set([1, 2, 3, 4, 5, 6].map((s) => sig(s * 1000, 1, 20_000)));
    expect(days.size).toBeGreaterThan(15); // un jeu par jour, pas le même tous les jours
    expect(islands.size).toBeGreaterThan(2);
    expect(seeds.size).toBeGreaterThan(2);
  });

  it('chaque type est tiré un jour ou l’autre (aucun type mort)', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) for (const o of dailyObjectives(99, 1, d)) seen.add(o.kind);
    expect([...seen].sort()).toEqual(Object.keys(OBJECTIVE_KINDS).sort());
  });
});

describe('🎯 le jour logique', () => {
  it('bascule à 4 h, heure locale (veiller tard ne change pas d’objectifs à minuit)', () => {
    // 29 oct. 2026 à Paris = UTC+1 (heure d'hiver) ; on passe l'offset JS, négatif à l'est.
    const tz = -60;
    const local = (h: number, m = 0) => Date.UTC(2026, 9, 29, h - 1, m);
    const d = dayIndex(local(12), tz);
    expect(dayIndex(local(23, 59), tz)).toBe(d);
    expect(dayIndex(local(3, 59), tz)).toBe(d - 1); // 3 h 59 : encore la veille
    expect(dayIndex(local(4, 0), tz)).toBe(d);
  });

  it('`dayStartMs` est l’inverse de `dayIndex`', () => {
    for (const tz of [PARIS, -60, 0, 300]) {
      const d = dayIndex(T0, tz);
      expect(dayIndex(dayStartMs(d, tz), tz)).toBe(d);
      expect(dayIndex(dayStartMs(d, tz) - 1, tz)).toBe(d - 1);
    }
  });
});

describe('🎯 dailyCounters — la progression, LUE', () => {
  const since = T0 - 3_600_000;
  const map = (departures: number[]) => ({ departures });

  it('départs : depuis le début du jour, ceux encore en route compris', () => {
    const c = dailyCounters(map([since - 1, since, T0, T0 + 99_999_999]), [], since, T0);
    expect(c.sends).toBe(3); // `since` inclus, la veille exclue, le futur (en route) compris
  });

  it('récoltes : un rapport GAGNÉ sur un lieu de récolte ; une défaite ne compte pas', () => {
    const c = dailyCounters(
      map([]),
      [
        msg({ poiType: 'mine' }),
        msg({ poiType: 'well' }),
        msg({ poiType: 'mine', win: false }),
        msg({ poiType: 'camp' }),
      ],
      since,
      T0,
    );
    expect(c.harvests).toBe(2);
    expect(c.camps).toBe(1);
  });

  it('camps : camp, repaire et tanière', () => {
    const c = dailyCounters(
      map([]),
      [msg({ poiType: 'camp' }), msg({ poiType: 'lair' }), msg({ poiType: 'den' })],
      since,
      T0,
    );
    expect(c.camps).toBe(3);
  });

  it('failles : seule une incursion GAGNÉE referme', () => {
    const c = dailyCounters(
      map([]),
      [
        msg({ poiType: 'rift', rift: true, partyWin: true }),
        msg({ poiType: 'rift', rift: true, partyWin: false, win: false }),
        // Le verdict du GROUPE tranche : une incursion qui « tient » n'a pas refermé la faille.
        msg({ poiType: 'rift', rift: true, partyWin: false, win: true }),
      ],
      since,
      T0,
    );
    expect(c.rifts).toBe(1);
  });

  it('consommables trouvés : additionnés, gagné ou non', () => {
    const c = dailyCounters(
      map([]),
      [msg({ supplies: { rations: 2, potion: 1 } }), msg({ win: false, supplies: { carte: 1 } })],
      since,
      T0,
    );
    expect(c.finds).toBe(4);
  });

  it('la fenêtre du jour : ni la veille, ni le futur, ni les coffres', () => {
    const c = dailyCounters(
      map([]),
      [
        msg({ resolvedAt: since - 1 }),
        msg({ resolvedAt: T0 + 1 }),
        msg({ chest: true }),
        msg({ resolvedAt: since }),
      ],
      since,
      T0,
    );
    expect(c.harvests).toBe(1);
  });
});

describe('🎯 états, bonus dus, marque « payé »', () => {
  const objs: DailyObjective[] = [
    { kind: 'sends', target: 4 },
    { kind: 'camps', target: 2 },
    { kind: 'rifts', target: 1 },
  ];
  const counters = (over: Partial<DailyCounters> = {}): DailyCounters => ({
    sends: 0,
    harvests: 0,
    camps: 0,
    rifts: 0,
    finds: 0,
    ...over,
  });

  it('progression bornée à la cible (jamais « 7/4 »), complète à la cible', () => {
    const s = objectiveStates(objs, counters({ sends: 7, camps: 1 }), []);
    expect(s[0]).toMatchObject({ progress: 4, complete: true, latched: false });
    expect(s[1]).toMatchObject({ progress: 1, complete: false });
    expect(s[2]).toMatchObject({ progress: 0, complete: false });
    // Pile à la cible : atteint (pas seulement au-dessus).
    expect(objectiveStates(objs, counters({ camps: 2 }), [])[1]).toMatchObject({ complete: true });
    expect(objectiveStates(objs, counters({ camps: 1 }), [])[1]).toMatchObject({ complete: false });
  });

  it('seuls les objectifs ATTEINTS et PAS ENCORE PAYÉS sont dus', () => {
    const c = counters({ sends: 9, camps: 5 });
    expect(dueObjectives(objectiveStates(objs, c, [])).map((o) => o.kind)).toEqual([
      'sends',
      'camps',
    ]);
    // `sends` déjà payé : jamais deux fois.
    expect(dueObjectives(objectiveStates(objs, c, ['sends'])).map((o) => o.kind)).toEqual([
      'camps',
    ]);
    expect(dueObjectives(objectiveStates(objs, c, ['sends', 'camps']))).toEqual([]);
  });

  it('un objectif payé reste complet même si la progression RECULE (rapports sortis de la boîte)', () => {
    const s = objectiveStates(objs, counters({ sends: 0 }), ['sends']);
    expect(s[0]).toMatchObject({ complete: true, latched: true, progress: 4 });
    expect(dueObjectives(s)).toEqual([]);
  });

  it('la marque d’un AUTRE jour ne vaut rien', () => {
    expect(latchedToday({ day: 10, done: ['sends'] }, 10)).toEqual(['sends']);
    expect(latchedToday({ day: 10, done: ['sends'] }, 11)).toEqual([]);
    expect(latchedToday(undefined, 11)).toEqual([]);
  });

  it('le bonus : UN SEUL consommable, versé quand les trois sont atteints, jamais deux fois', () => {
    const all = counters({ sends: 9, camps: 5, rifts: 3 });
    // Deux sur trois : rien.
    expect(bonusDue(objectiveStates(objs, counters({ sends: 9, camps: 5 }), []))).toBe(false);
    // Les trois d'un coup : dû.
    expect(bonusDue(objectiveStates(objs, all, []))).toBe(true);
    // Le troisième s'ajoute aux deux déjà notés : dû (c'est lui qui complète).
    expect(bonusDue(objectiveStates(objs, all, ['sends', 'camps']))).toBe(true);
    // Les trois déjà notés : déjà payé, plus rien.
    expect(bonusDue(objectiveStates(objs, all, ['sends', 'camps', 'rifts']))).toBe(false);
    // Les trois notés puis la progression recule : toujours payé, jamais redû.
    expect(bonusDue(objectiveStates(objs, counters(), ['sends', 'camps', 'rifts']))).toBe(false);
    // Jamais sans trois objectifs (une carte sans objectifs, une liste tronquée).
    expect(bonusDue([])).toBe(false);
    expect(bonusDue(objectiveStates(objs.slice(0, 2), all, []))).toBe(false);
    expect(rewardStock('rations')).toEqual({ rations: 1 });
  });

  it('la récompense du jour : un consommable, pure, qui change avec le jour', () => {
    expect(CONSUMABLE_IDS).toContain(dailyReward(5, 1, 100));
    expect(dailyReward(5, 1, 100)).toBe(dailyReward(5, 1, 100));
    const seen = new Set(Array.from({ length: 40 }, (_, d) => dailyReward(5, 1, d)));
    expect(seen.size).toBeGreaterThan(2);
    expect(rewardView('rations').emoji).toBeTruthy();
  });

  it('le paiement est RETENTÉ chaque minute tant qu’il y a quelque chose à noter', () => {
    expect(claimRetryKey(1, 60_000)).toBe(60_000);
    expect(claimRetryKey(2, 120_000)).not.toBe(claimRetryKey(2, 60_000));
    expect(claimRetryKey(0, 60_000)).toBe(0);
  });

  it('la tuile dit le but, le sens du compteur et la récompense', () => {
    const v = objectiveView({ kind: 'camps', target: 1 });
    expect(v.label).toBe('Prends 1 camp');
    expect(v.how).toMatch(/rapport gagné/);
    expect(objectiveView({ kind: 'camps', target: 3 }).label).toBe('Prends 3 camps');
  });
});

describe('🎯 dailyStatesFor — source unique de l’écran et du store', () => {
  const base = (): ExpeditionMap => ({ ...createMap(7, T0, 12, 1), archipel: archipelOn(2) });
  const day = dayIndex(T0, PARIS);

  it('tire sur (graine, île, jour) et lit la marque de la carte', () => {
    const m = base();
    const objs = dailyObjectives(m.seed, 2, day);
    const r = dailyStatesFor(m, [], T0, PARIS);
    expect(r.day).toBe(day);
    expect(r.states.map((s) => s.obj)).toEqual(objs);
    const paid = dailyStatesFor({ ...m, daily: { day, done: [objs[0]!.kind] } }, [], T0, PARIS);
    expect(paid.states[0]!.latched).toBe(true);
    expect(paid.states[1]!.latched).toBe(false);
  });

  it('une île quittée (plus rien n’y apparaît) n’a pas d’objectifs', () => {
    const m = base();
    m.archipel = { ...m.archipel!, vacatedAt: T0 };
    expect(dailyStatesFor(m, [], T0, PARIS).states).toEqual([]);
  });

  it('la progression vient des départs de la carte et des rapports de la boîte', () => {
    // Une carte dont le tirage du jour contient les deux types (cherchée, pas supposée).
    let m = base();
    for (let s = 1; s < 500; s++) {
      const kinds = dailyObjectives(s, 2, day).map((o) => o.kind);
      if (kinds.includes('sends') && kinds.includes('camps')) {
        m = { ...m, seed: s };
        break;
      }
    }
    const kinds = dailyObjectives(m.seed, 2, day).map((o) => o.kind);
    expect(kinds).toContain('sends');
    expect(kinds).toContain('camps');
    const d0 = dayStartMs(day, PARIS);
    const none = dailyStatesFor(m, [], T0, PARIS).states;
    expect(none.every((s) => !s.complete)).toBe(true);
    const withDeps = { ...m, departures: Array.from({ length: 12 }, (_, i) => d0 + i * 1000) };
    const r = dailyStatesFor(withDeps, [], T0, PARIS);
    expect(r.states.find((x) => x.obj.kind === 'sends')!.complete).toBe(true);
    expect(r.states.find((x) => x.obj.kind === 'camps')!.complete).toBe(false);
    const msgs = Array.from({ length: 6 }, () => msg({ poiType: 'camp', resolvedAt: d0 + 5_000 }));
    const r2 = dailyStatesFor(m, msgs, T0, PARIS);
    expect(r2.states.find((x) => x.obj.kind === 'camps')!.complete).toBe(true);
    expect(r2.states.find((x) => x.obj.kind === 'sends')!.complete).toBe(false);
  });

  it('`advanceWorld` recopie la marque (il reconstruit la carte champ par champ)', () => {
    const m: ExpeditionMap = { ...base(), daily: { day, done: ['sends'] } };
    expect(advanceWorld(m, T0 + 60_000, 12, 1).daily).toEqual(m.daily);
    expect('daily' in advanceWorld(base(), T0 + 60_000, 12, 1)).toBe(false);
  });
});
