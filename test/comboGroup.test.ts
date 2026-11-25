// @vitest-environment happy-dom
//
// 🧩 Défi 360 « PAR GROUPE » (v1.357.0) : un volume de séries par groupe musculaire, réparti
// librement entre les exos du groupe. Le mode « par exercice » est épinglé à part
// (`comboModeExo.test.ts`, nombres relevés avant l'abstraction).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useComboStore } from '@/stores/combo';
import {
  comboGoals,
  comboGoalsLeft,
  comboLegBlocked,
  comboMode,
  comboProgressPct,
  comboComplete,
  comboPace,
  comboBar,
  comboTieredBonus,
  comboXpPoints,
  comboClosed,
  comboChestEligible,
  comboExportText,
  comboDayQuota,
  comboProrata,
  comboMoveShare,
  comboSplit,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
  type ComboPick,
} from '@/lib/combo';
import { bodyBalance } from '@/lib/bodyBalance';
import { defisSummary } from '@/lib/defisHome';

const sets = (n: number, date = '2026-09-14', reps = 10): ComboSet[] =>
  Array.from({ length: n }, () => ({ date, reps, weight: 20 }));
const leg = (over: Partial<ComboLeg>): ComboLeg => ({
  slot: 'push',
  exercise_id: 'bench',
  exercise_name: 'Développé couché',
  muscle_primary: 'pectoraux',
  rep_weight: 1,
  target: 0,
  count_mode: 'sets',
  sets: [],
  ...over,
});
/** Deux groupes : Poussée (2 exos au menu, 6 séries) et Tirage (1 exo, 4 séries). */
function groupe(over: Partial<ComboChallenge> = {}, push = [0, 0], pull = 0): ComboChallenge {
  return {
    id: 'g1',
    name: 'Défi 360',
    start_date: '2026-09-14',
    duration_days: 7,
    status: 'active',
    config: {
      mode: 'group',
      groups: [
        { slot: 'push', target: 6 },
        { slot: 'pull', target: 4 },
      ],
    },
    legs: [
      leg({ sets: sets(push[0]!) }),
      leg({ exercise_id: 'pushup', exercise_name: 'Pompes', sets: sets(push[1]!) }),
      leg({
        slot: 'pull',
        exercise_id: 'row',
        exercise_name: 'Rowing',
        muscle_primary: 'dos',
        sets: sets(pull),
      }),
    ],
    ...over,
  };
}

describe('comboGoals', () => {
  it('mode exo (config absente ou sans mode) : un objectif par exo, dans l’unité de l’exo', () => {
    const c = groupe({ config: undefined });
    c.legs[0]!.target = 6;
    c.legs[0]!.sets = sets(2);
    expect(comboMode(c)).toBe('exo');
    const g = comboGoals(c);
    expect(g).toHaveLength(3);
    expect(g[0]).toMatchObject({ key: 'bench', done: 2, target: 6, group: false });
    expect(comboMode({ ...c, config: { closed_by_user: true } })).toBe('exo');
  });

  it('mode groupe : un objectif par groupe, fait = séries de TOUS les exos du groupe', () => {
    const c = groupe({}, [2, 3], 1);
    expect(comboMode(c)).toBe('group');
    const g = comboGoals(c);
    expect(g.map((x) => [x.key, x.done, x.target])).toEqual([
      ['push', 5, 6],
      ['pull', 1, 4],
    ]);
    expect(g[0]!.legs.map((l) => l.exercise_id)).toEqual(['bench', 'pushup']);
    expect(comboGoalsLeft(c)).toBe(2);
  });

  it('une série de tenue au temps vaut UNE série, pas ses secondes', () => {
    const c = groupe();
    c.legs.push(
      leg({
        slot: 'core',
        exercise_id: 'plank',
        count_mode: 'time',
        sets: [{ date: '2026-09-14', reps: 45 }],
      }),
    );
    c.config!.groups!.push({ slot: 'core', target: 3 });
    expect(comboGoals(c).find((x) => x.key === 'core')).toMatchObject({ done: 1, target: 3 });
  });
});

describe('avancement, retard, clôture (mode groupe)', () => {
  it('moyenne des fractions bornées à 100 % PAR GROUPE', () => {
    // push 3/6 = 50 %, pull 4/4 = 100 % → 75
    expect(comboProgressPct(groupe({}, [2, 1], 4))).toBe(75);
    // le reste d'un groupe ne compense pas le retard d'un autre : push 9/6 borné à 100, pull 0
    expect(comboProgressPct(groupe({}, [5, 4], 0))).toBe(50);
  });

  it('bouclé quand TOUS les groupes sont atteints, sur n’importe quelle répartition', () => {
    expect(comboComplete(groupe({}, [6, 0], 4))).toBe(true); // tout sur un exo
    expect(comboComplete(groupe({}, [1, 5], 4))).toBe(true); // 1-5, comme l'utilisateur le veut
    expect(comboComplete(groupe({}, [3, 2], 4))).toBe(false); // push 5/6
  });

  it('pas d’exo à cible : un défi sans groupe n’est jamais « bouclé »', () => {
    expect(comboComplete(groupe({ config: { mode: 'group', groups: [] } }))).toBe(false);
    expect(comboProgressPct(groupe({ config: { mode: 'group', groups: [] } }))).toBe(0);
  });

  it('retard : la barre unique garde sa forme, rose = attendu − fait', () => {
    const p = comboPace(groupe({}, [2, 1], 4), '2026-09-17'); // 4e jour : 57 % attendus
    expect(p.donePct).toBe(75);
    expect(p.latePct).toBe(0);
    const p2 = comboPace(groupe({}, [1, 0], 0), '2026-09-17');
    expect(p2.donePct).toBeCloseTo(8.3, 1);
    expect(p2.latePct).toBeCloseTo(57 - 8.3, 1);
    expect(p2.state).toBe('behind');
    const b = comboBar(p2);
    expect(b.ticks).toHaveLength(6);
    expect(b.fill).toBeCloseTo(8.3, 1);
  });

  it('clôture et coffre : à l’objectif partout dans les temps', () => {
    const fini = groupe({}, [4, 2], 4);
    expect(comboClosed(fini, '2026-09-15')).toBe(true);
    expect(comboChestEligible(fini)).toBe(true);
    const partiel = groupe({}, [4, 1], 4);
    expect(comboClosed(partiel, '2026-09-15')).toBe(false);
    expect(comboClosed(partiel, '2026-09-22')).toBe(true);
    expect(comboChestEligible(partiel)).toBe(false);
  });

  it('3 jours : objectifs au prorata, barre en 3 jours', () => {
    expect(comboProrata(12, 3)).toBe(5);
    expect(comboProrata(8, 3)).toBe(3);
    const c = groupe({ duration_days: 3 }, [2, 1], 4);
    c.config!.groups = [
      { slot: 'push', target: comboProrata(12, 3) },
      { slot: 'pull', target: comboProrata(8, 3) },
    ];
    expect(comboProgressPct(c)).toBeCloseTo(((3 / 5 + 1) / 2) * 100, 0);
    expect(comboBar(comboPace(c, '2026-09-15')).ticks).toHaveLength(2);
  });

  it('pas de quota du jour par exo en mode groupe', () => {
    expect(comboDayQuota(groupe({}, [0, 0], 0), '2026-09-17')).toEqual({});
  });
});

describe('séries en trop : bloquées au niveau du GROUPE', () => {
  it('tant que le groupe n’est pas atteint, chaque exo reçoit des séries', () => {
    const c = groupe({}, [3, 2], 0);
    expect(comboLegBlocked(c, c.legs[0]!)).toBe(false);
    expect(comboLegBlocked(c, c.legs[1]!)).toBe(false);
  });
  it('une fois atteint, TOUS les exos du groupe sont bloqués, pas ceux des autres', () => {
    const c = groupe({}, [3, 3], 0);
    expect(comboLegBlocked(c, c.legs[0]!)).toBe(true);
    expect(comboLegBlocked(c, c.legs[1]!)).toBe(true);
    expect(comboLegBlocked(c, c.legs[2]!)).toBe(false);
  });
  it('mode exo : bloqué seulement sur l’exo bouclé (comme legComplete)', () => {
    const c = groupe({ config: undefined });
    c.legs[0]!.target = 2;
    c.legs[0]!.sets = sets(2);
    c.legs[1]!.target = 2;
    expect(comboLegBlocked(c, c.legs[0]!)).toBe(true);
    expect(comboLegBlocked(c, c.legs[1]!)).toBe(false);
  });

  describe('le store refuse la série en trop', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      setActivePinia(createPinia());
    });
    it('5e et 6e séries passent, la 7e est refusée, même sur l’autre exo du groupe', () => {
      const s = useComboStore();
      s.list = [groupe({}, [0, 0], 0)];
      for (let i = 0; i < 4; i++) s.addSet('g1', 'bench', '2026-09-14', 10, 20);
      s.addSet('g1', 'pushup', '2026-09-14', 10, null);
      s.addSet('g1', 'pushup', '2026-09-14', 10, null);
      s.addSet('g1', 'pushup', '2026-09-14', 10, null); // 7e : refusée
      s.addSet('g1', 'bench', '2026-09-14', 10, 20); // refusée aussi
      const c = s.list[0]!;
      expect(c.legs[0]!.sets).toHaveLength(4);
      expect(c.legs[1]!.sets).toHaveLength(2);
      // Les autres groupes restent libres.
      s.addSet('g1', 'row', '2026-09-14', 10, 20);
      expect(c.legs[2]!.sets).toHaveLength(1);
      vi.useRealTimers();
    });
  });
});

describe('prime et XP (mode groupe)', () => {
  const FIN = '2026-09-22';
  it('rien avant la fin, puis la part du palier PAR GROUPE (80 % → 15 %, 100 % → entier)', () => {
    expect(comboTieredBonus(groupe({}, [3, 1], 4), undefined, '2026-09-16')).toBe(0);
    const plein = comboTieredBonus(groupe({}, [4, 2], 4), undefined, FIN);
    const quatreCinq = comboTieredBonus(groupe({}, [3, 1], 4), undefined, FIN); // push 4/6 : < 80 %
    const sec = comboTieredBonus(groupe({ config: { mode: 'group', groups: [{ slot: 'push', target: 5 }, { slot: 'pull', target: 4 }] } }, [2, 2], 4), undefined, FIN); // push 4/5 = 80 %
    expect(plein).toBeGreaterThan(0);
    expect(quatreCinq).toBeLessThan(sec);
    expect(sec).toBeLessThan(plein);
    // push n'ayant que 15 % de sa part : pull seul (entier) + 0,15 × push
    const pullSeul = comboTieredBonus(groupe({}, [0, 0], 4), undefined, FIN);
    expect(quatreCinq).toBeCloseTo(pullSeul, 6);
  });
  it('abandonné : pas de prime', () => {
    expect(comboTieredBonus(groupe({ status: 'abandoned' }, [4, 2], 4), undefined, FIN)).toBe(0);
  });
  it('la répartition entre exos de même poids de rep ne change pas l’XP', () => {
    const a = comboXpPoints([groupe({}, [6, 0], 4)]);
    const b = comboXpPoints([groupe({}, [3, 3], 4)]);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
  it('chaque série paie l’XP de SON exo : un exo à plus gros poids de rep rapporte plus', () => {
    const lourd = groupe({}, [6, 0], 4);
    lourd.legs[0]!.rep_weight = 2;
    expect(comboXpPoints([lourd])).toBeGreaterThan(comboXpPoints([groupe({}, [6, 0], 4)]));
  });
});

describe('équilibre du corps (mode groupe)', () => {
  const base = (c: ComboChallenge) => ({
    sessions: [],
    combos: [c],
    challenges: [],
    bossHits: [],
    targets: { pectoraux: 10, dos: 10, épaules: 10, mollets: 10 },
    objective: null,
    secondaries: () => [],
    primaries: () => null,
    today: '2026-09-16',
  });
  const by = (c: ComboChallenge) =>
    Object.fromEntries(bodyBalance(base(c), 'week').map((r) => [r.muscle, [r.done, r.value]]));

  it('la cible du groupe est créditée aux muscles de l’emplacement ; le fait, aux muscles réels', () => {
    // push : 6 visées, 2 faites (pompes) ; pull : 4 visées, 0 faite
    expect(by(groupe({}, [0, 2], 0))).toMatchObject({ pectoraux: [2, 6], dos: [0, 4] });
  });
  it('un groupe à deux muscles partage sa cible (Épaules & mollets)', () => {
    const c = groupe({}, [0, 0], 0);
    c.config!.groups = [{ slot: 'shoulders', target: 6 }];
    expect(by(c)).toMatchObject({ épaules: [0, 3], mollets: [0, 3] });
  });
  it('ce qui est fait avant lundi est déduit du restant, pas compté deux fois', () => {
    const c = groupe({ start_date: '2026-09-10' }, [0, 0], 0);
    c.legs[0]!.sets = sets(2, '2026-09-11');
    // 2 séries faites la semaine d'avant : il reste 4 sur les 6 pour cette semaine
    expect(by(c).pectoraux![1]).toBe(4);
  });
});

describe('export texte et accueil', () => {
  it('l’export décrit les groupes puis les exos du menu', () => {
    const t = comboExportText(groupe({}, [2, 1], 0), '2026-09-16');
    expect(t).toContain('Poussée — 3/6 séries');
    expect(t).toContain('Pompes : 1 série');
    expect(t).toContain('Développé couché : 2 séries');
    expect(t).not.toMatch(/\d\/0 /);
  });
  it('l’accueil compte des groupes', () => {
    const s = defisSummary([], [groupe({}, [3, 3], 0)], '2026-09-16');
    expect(s.combo).toMatchObject({ left: 1, group: true });
  });
});

describe('répartition : déplacer une série, total du groupe fixe', () => {
  const pick = (ids: string[], target: number, alloc?: Record<string, number>): ComboPick => ({
    exercise_ids: ids,
    target,
    setsTarget: target,
    count_mode: 'sets',
    alloc,
  });
  const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

  it('+ prend à l’exo le mieux doté, la somme ne change pas', () => {
    const p = pick(['a', 'b', 'c'], 9, { a: 5, b: 3, c: 1 });
    const r = comboMoveShare(p, 'c', 1, 1);
    expect(r.alloc).toEqual({ a: 4, b: 3, c: 2 });
    expect(r.target).toBe(9);
    expect(sum(r.alloc)).toBe(9);
  });
  it('− rend à l’exo le moins doté', () => {
    const p = pick(['a', 'b', 'c'], 9, { a: 5, b: 3, c: 1 });
    const r = comboMoveShare(p, 'a', -1, 1);
    expect(r.alloc).toEqual({ a: 4, b: 3, c: 2 });
    expect(sum(r.alloc)).toBe(9);
  });
  it('jamais sous 1 série : sans donneur possible, rien ne bouge', () => {
    const p = pick(['a', 'b'], 2, { a: 1, b: 1 });
    expect(comboMoveShare(p, 'a', 1, 1)).toEqual({ target: 2, setsTarget: 2, alloc: p.alloc });
    expect(comboMoveShare(p, 'a', -1, 1)).toEqual({ target: 2, setsTarget: 2, alloc: p.alloc });
  });
  it('un seul exo : rien à déplacer', () => {
    const p = pick(['a'], 5);
    expect(comboMoveShare(p, 'a', 1, 1).target).toBe(5);
    expect(comboMoveShare(p, 'a', 1, 1).alloc).toBeUndefined();
  });
  it('part par défaut (égale) conservée : on part du partage actuel', () => {
    const p = pick(['a', 'b', 'c'], 10);
    const base = comboSplit(10, ['a', 'b', 'c'], undefined, 1);
    const r = comboMoveShare(p, 'b', 1, 1);
    expect(sum(r.alloc)).toBe(10);
    expect(r.alloc!.b).toBe(base.b! + 1);
  });
  it('en reps : pas de 10, un exo reste ≥ 10', () => {
    const p: ComboPick = {
      exercise_ids: ['a', 'b'],
      target: 60,
      setsTarget: 6,
      count_mode: 'reps',
      alloc: { a: 40, b: 20 },
    };
    const r = comboMoveShare(p, 'b', 1, 10);
    expect(r.alloc).toEqual({ a: 30, b: 30 });
    expect(comboMoveShare({ ...p, alloc: { a: 50, b: 10 } }, 'a', 1, 10).alloc).toEqual({
      a: 50,
      b: 10,
    });
    expect(r.setsTarget).toBe(6);
  });
});
