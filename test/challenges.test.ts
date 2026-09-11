import { describe, it, expect } from 'vitest';
import { cardioSessionXp, REP_XP, XP_MULT } from '@/lib/athlete';
import {
  computeDailyTargets,
  challengeXpPoints,
  challengeXpBreakdown,
  challengeStats,
  suggestConfig,
  addContribution,
  removeContribution,
  challengeLiveBalance,
  isChallengeComplete,
  repWeightFromExercise,
  isAssistedExercise,
  isBodyweightExercise,
  activeDaysOf,
  extendChallenge,
  suggestSetFromHistory,
  type Challenge,
  type ChallengeConfig,
} from '@/lib/challenges';

const cfg = (over: Partial<ChallengeConfig> = {}): ChallengeConfig => ({ start: 10, ...over });

describe('suggestSetFromHistory (conseil poids/reps)', () => {
  it('renvoie null sans historique', () => {
    expect(suggestSetFromHistory([])).toBeNull();
    expect(suggestSetFromHistory([{ reps: 0, sec: 30 } as never])).toBeNull();
  });
  it('poids médian + fourchette de reps', () => {
    const s = suggestSetFromHistory([
      { reps: 8, weight: 20 },
      { reps: 10, weight: 20 },
      { reps: 12, weight: 22 },
      { reps: 10, weight: 20 },
      { reps: 9, weight: 20 },
    ]);
    expect(s).not.toBeNull();
    expect(s!.weight).toBe(20); // médiane
    expect(s!.repMin).toBeLessThanOrEqual(s!.repMax);
    expect(s!.samples).toBe(5);
  });
  it('poids du corps → weight null', () => {
    const s = suggestSetFromHistory([{ reps: 15 }, { reps: 20 }, { reps: 18 }]);
    expect(s!.weight).toBeNull();
    expect(s!.repMin).toBe(15);
    expect(s!.repMax).toBe(20);
  });
});

describe('extendChallenge : l’affichage des jours s’adapte', () => {
  const mk = (over: Partial<Challenge> = {}): Challenge =>
    ({
      id: 'x',
      exercise_id: 'e',
      exercise_name: 'E',
      unit: 'reps',
      format: 'fixed',
      duration_days: 7,
      start_date: '2026-01-05',
      config: cfg({ start: 20 }),
      daily_targets: [20, 20, 20, 20, 20, 20, 20],
      progress: [],
      status: 'active',
      ...over,
    }) as Challenge;
  it('fixed : daily_targets ET duration_days s’allongent', () => {
    const r = extendChallenge(mk(), 3);
    expect(r.duration_days).toBe(10);
    expect(r.daily_targets).toHaveLength(10);
  });
  it('cumulative : daily_targets (zéros pour le calendrier) s’allonge aussi', () => {
    const c = mk({
      format: 'cumulative',
      config: cfg({ total: 100 }),
      daily_targets: [0, 0, 0, 0, 0, 0, 0],
    });
    const r = extendChallenge(c, 5);
    expect(r.duration_days).toBe(12);
    expect(r.daily_targets).toHaveLength(12); // avant le fix : restait à 7
  });
});

describe('computeDailyTargets', () => {
  it('fixed : objectif constant', () => {
    const t = computeDailyTargets('fixed', cfg({ start: 20 }), 5, '2026-01-05');
    expect(t).toEqual([20, 20, 20, 20, 20]);
  });

  it('progressive : start + increment×jour', () => {
    const t = computeDailyTargets('progressive', cfg({ start: 10, increment: 5 }), 4, '2026-01-05');
    expect(t).toEqual([10, 15, 20, 25]);
  });

  it('ramp : linéaire de start à peak', () => {
    const t = computeDailyTargets('ramp', cfg({ start: 10, peak: 20 }), 3, '2026-01-05');
    expect(t[0]).toBe(10);
    expect(t[2]).toBe(20);
    expect(t[1]).toBeGreaterThan(10);
    expect(t[1]).toBeLessThan(20);
  });

  it('cumulative : pas d’objectif journalier', () => {
    expect(computeDailyTargets('cumulative', cfg({ total: 1000 }), 4, '2026-01-05')).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('un jour de repos par semaine → exactement un 0 sur 7 jours', () => {
    const t = computeDailyTargets('fixed', cfg({ start: 30, rest_weekdays: [3] }), 7, '2026-01-05');
    expect(t.filter((x) => x === 0)).toHaveLength(1);
    expect(t.filter((x) => x === 30)).toHaveLength(6);
  });

  it('les objectifs sont des entiers ≥ 0', () => {
    const t = computeDailyTargets('pyramid', cfg({ start: 5, peak: 17 }), 7, '2026-01-05');
    for (const v of t) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    exercise_id: 'ex',
    exercise_name: 'Pompes',
    unit: 'reps',
    format: 'fixed',
    duration_days: 3,
    start_date: '2026-01-05',
    config: cfg({ start: 10 }),
    daily_targets: [10, 10, 10],
    progress: [],
    status: 'active',
    ...over,
  };
}

describe('addContribution (report cardio → défi)', () => {
  const distanceCh = () =>
    challenge({
      unit: 'distance',
      duration_days: 5,
      daily_targets: [5, 5, 5, 5, 5],
      config: cfg({ start: 5 }),
    });

  it('crée le jour et cumule la distance sur le bon index', () => {
    const p = addContribution(distanceCh(), '2026-01-07', 3); // jour 2
    expect(p).not.toBeNull();
    const e = p!.find((x) => x.day === 2)!;
    expect(e.done).toBe(3);
    expect(e.completed).toBe(false);
  });

  it("cumule sur un jour déjà entamé et valide dès l'objectif atteint", () => {
    const ch = distanceCh();
    ch.progress = [
      { day: 2, date: '2026-01-07', target: 5, done: 3, elapsed_sec: 0, completed: false },
    ];
    const p = addContribution(ch, '2026-01-07', 3);
    const e = p!.find((x) => x.day === 2)!;
    expect(e.done).toBe(6);
    expect(e.completed).toBe(true);
  });

  it('renvoie null hors plage ou pour une contribution nulle', () => {
    expect(addContribution(distanceCh(), '2026-01-04', 3)).toBeNull(); // avant le début
    expect(addContribution(distanceCh(), '2026-01-11', 3)).toBeNull(); // après la fin
    expect(addContribution(distanceCh(), '2026-01-06', 0)).toBeNull();
  });

  it('ne mute pas la progression d’origine', () => {
    const ch = distanceCh();
    addContribution(ch, '2026-01-05', 4);
    expect(ch.progress).toEqual([]);
  });

  it('removeContribution : soustrait (plancher 0) et recalcule completed', () => {
    const ch = distanceCh();
    ch.progress = [
      { day: 2, date: '2026-01-07', target: 5, done: 53, elapsed_sec: 0, completed: true },
    ];
    // Faute de frappe 53 → on retire la sortie erronée : le faux surplus disparaît.
    const p = removeContribution(ch, '2026-01-07', 53)!;
    const e = p.find((x) => x.day === 2)!;
    expect(e.done).toBe(0);
    expect(e.completed).toBe(false);
  });
  it('removeContribution : ne descend jamais sous 0, null si rien à retirer', () => {
    const ch = distanceCh();
    ch.progress = [
      { day: 2, date: '2026-01-07', target: 5, done: 3, elapsed_sec: 0, completed: false },
    ];
    expect(removeContribution(ch, '2026-01-07', 10)!.find((x) => x.day === 2)!.done).toBe(0);
    expect(removeContribution(ch, '2026-01-08', 5)).toBeNull(); // jour sans progrès
    expect(removeContribution(ch, '2026-01-11', 5)).toBeNull(); // hors plage
  });
});

describe('challengeLiveBalance (avance/retard en direct)', () => {
  const day = (d: number, done: number, target = 10): DayProgressLite => ({
    day: d,
    date: `2026-01-0${5 + d}`,
    target,
    done,
    elapsed_sec: 0,
    completed: done >= target,
  });
  const fiveDay = (progress: DayProgressLite[]) =>
    challenge({ duration_days: 5, daily_targets: [10, 10, 10, 10, 10], progress });

  it('jours passés à l’objectif + surplus du jour → avance', () => {
    const ch = fiveDay([day(0, 10), day(1, 10), day(2, 15)]);
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(5); // +5 aujourd’hui
  });

  it('le jour en cours non fini ne crée pas de retard', () => {
    const ch = fiveDay([day(0, 10), day(1, 10), day(2, 4)]); // 4/10 en cours
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(0);
  });

  it('un jour CLÔTURÉ en déficit compte tout de suite', () => {
    const closed = {
      day: 2,
      date: '2026-01-07',
      target: 10,
      done: 4,
      elapsed_sec: 0,
      completed: false,
      closed: true,
    };
    const ch = fiveDay([day(0, 10), day(1, 10), closed]); // clôturé à 4/10 → −6
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(-6);
  });

  it('un jour passé manqué compte en retard', () => {
    const ch = fiveDay([day(0, 7), day(1, 10)]); // −3 la veille
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(-3);
  });

  it('cumulé : renvoie le solde global (réalisé − attendu au prorata)', () => {
    const ch = challenge({
      format: 'cumulative',
      duration_days: 5,
      daily_targets: [0, 0, 0, 0, 0],
      config: cfg({ total: 100 }),
      progress: [day(0, 30, 0), day(1, 20, 0)], // 50 réalisés ; attendu j2 = 40
    });
    expect(challengeLiveBalance(ch, '2026-01-07')).toBe(10);
  });
});

type DayProgressLite = {
  day: number;
  date: string;
  target: number;
  done: number;
  elapsed_sec: number;
  completed: boolean;
};

describe('isChallengeComplete (basé sur le total)', () => {
  it('terminé dès que le TOTAL est atteint, même réparti n’importe comment', () => {
    // total prévu 30 ; tout fait le 1er jour → terminé (jours 2/3 non requis)
    const done = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 30, elapsed_sec: 0, completed: true },
      ],
    });
    expect(isChallengeComplete(done)).toBe(true);
  });
  it('pas terminé si le total n’est pas atteint', () => {
    const partial = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 25, elapsed_sec: 0, completed: true },
      ],
    });
    expect(isChallengeComplete(partial)).toBe(false);
  });
});

describe('challengeXpPoints', () => {
  it('total NON atteint : reps×0,2 seulement, pas de prime', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 7, elapsed_sec: 0, completed: false },
      ],
    });
    // total prévu 30, réalisé 17 < 30 → pas de prime. reps 17×0,2=3,4 ×XP_MULT(2)=6,8 → 7
    expect(challengeXpPoints([c])).toBe(7);
  });

  it('total ATTEINT : reps×0,2 + prime de complétion', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 2, date: '2026-01-07', target: 10, done: 10, elapsed_sec: 0, completed: true },
      ],
    });
    // reps 30×0,2=6 ; prime round(0,25×30×1,1=8,25)=8 ; (6+8)×XP_MULT(2)=28
    expect(challengeXpPoints([c])).toBe(28);
  });

  // Mode Séries : done = nb de séries ; les reps/poids viennent de `sets`.
  const setsCh = (sets: { reps: number; weight?: number; assisted?: boolean }[]): Challenge =>
    challenge({
      format: 'fixed',
      config: cfg({ start: 3, count_mode: 'sets' }),
      daily_targets: [3, 3, 3],
      progress: [
        {
          day: 0,
          date: '2026-01-05',
          target: 3,
          done: sets.length,
          elapsed_sec: 0,
          completed: false,
          sets,
        },
      ],
    });
  it('mode séries : le poids (tonnage) augmente l’XP', () => {
    const light = setsCh([{ reps: 10 }, { reps: 10 }]);
    const heavy = setsCh([
      { reps: 10, weight: 40 },
      { reps: 10, weight: 40 },
    ]);
    expect(challengeXpPoints([heavy])).toBeGreaterThan(challengeXpPoints([light]));
  });
  it('mode séries : une série assistée vaut moins', () => {
    const strict = setsCh([{ reps: 10 }]);
    const assisted = setsCh([{ reps: 10, assisted: true }]);
    expect(challengeXpPoints([assisted])).toBeLessThan(challengeXpPoints([strict]));
  });
  // Ticket 0f18ade6 : même exo, même effort → même XP, quelle que soit la façon de
  // marquer « assisté ». La pénalité ×0,6 est appliquée EXACTEMENT une fois.
  it('assisté cohérent : variante intrinsèque ≡ exo normal + case « assisté » (même XP)', () => {
    const prog = [
      { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
      { day: 1, date: '2026-01-06', target: 10, done: 10, elapsed_sec: 0, completed: true },
      { day: 2, date: '2026-01-07', target: 10, done: 10, elapsed_sec: 0, completed: true },
    ];
    // « Dips assisté » : la pénalité est FIGÉE dans rep_weight (0,6), pas de case.
    const intrinseque = challenge({ rep_weight: 0.6, progress: prog });
    // « Dips » normal + case « assisté » cochée à la création (config.assisted).
    const normalCoche = challenge({
      rep_weight: 1,
      config: cfg({ start: 10, assisted: true }),
      progress: prog,
    });
    expect(challengeXpPoints([intrinseque])).toBe(challengeXpPoints([normalCoche]));
  });

  it('gainage (temps) : XP d’effort selon le temps même sans complétion', () => {
    const c = challenge({
      unit: 'time',
      exercise_id: 'ex_plank',
      format: 'cumulative',
      config: cfg({ total: 400 }), // total non atteint
      daily_targets: [0, 0, 0],
      progress: [
        { day: 0, date: '2026-01-05', target: 0, done: 120, elapsed_sec: 120, completed: false },
      ],
    });
    // 120 s → 30 pts × REP_XP(0,2) × XP_MULT(2) = 12 ; total non atteint → pas de prime
    expect(challengeXpPoints([c])).toBe(12);
  });

  it('cardio en temps : pas d’XP d’effort ici (compté via les sorties)', () => {
    const c = challenge({
      unit: 'time',
      exercise_id: 'ex_ch_velo',
      format: 'cumulative',
      config: cfg({ total: 400 }), // non atteint → pas de prime, on isole l'effort
      daily_targets: [0, 0, 0],
      progress: [
        { day: 0, date: '2026-01-05', target: 0, done: 60, elapsed_sec: 0, completed: false },
      ],
    });
    // cardio (temps) → effort 0 ; total non atteint → prime 0 → total 0
    expect(challengeXpPoints([c])).toBe(0);
  });

  it('défi marqué terminé (sous le total) : prime tout de même versée', () => {
    const c = challenge({
      format: 'cumulative',
      status: 'done',
      config: cfg({ total: 100 }),
      daily_targets: [0, 0, 0],
      progress: [
        { day: 0, date: '2026-01-05', target: 0, done: 90, elapsed_sec: 0, completed: false },
      ],
    });
    // sous le total mais status 'done' → prime comptée (donc > la seule XP de reps)
    const repsOnly = 90 * 0.2 * 1 * 2;
    expect(challengeXpPoints([c])).toBeGreaterThan(repsOnly);
  });

  it('le poids de rep pondère reps ET prime', () => {
    // même défi complété (30 reps) : poids 0,6 (mollets) vs 1,3 (composé)
    const base = {
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 2, date: '2026-01-07', target: 10, done: 10, elapsed_sec: 0, completed: true },
      ],
    };
    const light = challengeXpPoints([challenge({ ...base, rep_weight: 0.6 })]);
    const heavy = challengeXpPoints([challenge({ ...base, rep_weight: 1.3 })]);
    const neutral = challengeXpPoints([challenge({ ...base })]); // défaut 1
    expect(light).toBeLessThan(neutral);
    expect(heavy).toBeGreaterThan(neutral);
  });
});

describe('prime par format (anti-abus durée)', () => {
  it('activeDaysOf compte les jours réellement faits, pas la durée planifiée', () => {
    const crammed = challenge({
      duration_days: 30,
      progress: [
        { day: 0, date: '2026-01-05', target: 0, done: 100, elapsed_sec: 0, completed: true },
      ],
    });
    expect(activeDaysOf(crammed)).toBe(1);
    const spread = challenge({
      duration_days: 30,
      progress: Array.from({ length: 10 }, (_, i) => ({
        day: i,
        date: '2026-01-05',
        target: 0,
        done: 10,
        elapsed_sec: 0,
        completed: false,
      })),
    });
    expect(activeDaysOf(spread)).toBe(10);
  });

  it('CUMULÉ : finir en avance récompense (∝ reps × avance), petit total reste petit', () => {
    const base = { format: 'cumulative' as const, duration_days: 30, config: cfg({ total: 100 }) };
    const early = challenge({
      ...base,
      progress: [
        { day: 0, date: '2026-01-05', target: 0, done: 100, elapsed_sec: 0, completed: true },
      ],
    });
    const late = challenge({
      ...base,
      progress: [
        { day: 29, date: '2026-02-03', target: 0, done: 100, elapsed_sec: 0, completed: true },
      ],
    });
    // même total (100) → finir jour 0 rapporte PLUS que finir le dernier jour
    expect(challengeXpPoints([early])).toBeGreaterThan(challengeXpPoints([late]));
    // petit total (5) fini jour 0 → prime minuscule (indexée sur les reps, pas d'abus)
    const tiny = challenge({
      format: 'cumulative',
      duration_days: 30,
      config: cfg({ total: 5 }),
      progress: [
        { day: 0, date: '2026-01-05', target: 0, done: 5, elapsed_sec: 0, completed: true },
      ],
    });
    expect(challengeXpPoints([tiny])).toBeLessThan(challengeXpPoints([early]));
  });

  it('X/JOUR : prime récompense les jours tenus (étaler > bourrer)', () => {
    const base = { format: 'fixed' as const, duration_days: 3, daily_targets: [100, 100, 100] };
    const crammed = challenge({
      ...base,
      progress: [
        { day: 0, date: '2026-01-05', target: 100, done: 300, elapsed_sec: 0, completed: true },
      ],
    });
    const spread = challenge({
      ...base,
      progress: [
        { day: 0, date: '2026-01-05', target: 100, done: 100, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 100, done: 100, elapsed_sec: 0, completed: true },
        { day: 2, date: '2026-01-07', target: 100, done: 100, elapsed_sec: 0, completed: true },
      ],
    });
    expect(challengeXpPoints([spread])).toBeGreaterThan(challengeXpPoints([crammed]));
  });
});

describe('repWeightFromExercise', () => {
  it('isolation poids du corps = 0,6 ; composé = 1,0 ; composé chargé ≈ 1,63', () => {
    expect(repWeightFromExercise([], [])).toBe(0.6); // mollets (1 muscle, BW)
    expect(repWeightFromExercise(['triceps'], [])).toBe(1); // pompes (2, BW)
    // squat barre : 3 muscles (1,3) × chargé (1,25) = 1,625 → 1,63
    expect(repWeightFromExercise(['fessiers', 'ischio-jambiers'], ['barbell', 'rack'])).toBe(1.63);
  });
  it('isolation chargé (leg extension machine) = 0,75', () => {
    expect(repWeightFromExercise([], ['machine'])).toBe(0.75);
  });
  it('variante ASSISTÉE (nom) → rep_weight × 0,6 (parité avec la case « assisté »)', () => {
    // Tractions : 2 muscles, poids du corps → 1,0. Version assistée → 0,6.
    expect(repWeightFromExercise(['biceps'], ['pullup_bar', 'bands'])).toBe(1);
    expect(
      repWeightFromExercise(['biceps'], ['pullup_bar', 'bands'], 'Tractions assistées (élastique)'),
    ).toBe(0.6);
    expect(isAssistedExercise('Tractions assistées (élastique)')).toBe(true);
    expect(isAssistedExercise('Tractions')).toBe(false);
    // Pas d'option « assisté » sur un exo déjà assisté.
    expect(isBodyweightExercise(['pullup_bar', 'bands'], 'Dips assistés (élastique)')).toBe(false);
    expect(isBodyweightExercise(['pullup_bar', 'bands'], 'Tractions')).toBe(true);
  });
});

describe('suggestConfig (distance / cardio)', () => {
  it('vélo : base ~20 km/j (intermédiaire)', () => {
    const c = suggestConfig('distance', 'intermediaire', 'fixed', 30, 'ex_ch_velo');
    expect(c.start).toBe(20);
    expect(c.max).toBe(20);
  });
  it('marche : base plus faible que le vélo', () => {
    const velo = suggestConfig('distance', 'intermediaire', 'fixed', 30, 'ex_ch_velo');
    const marche = suggestConfig('distance', 'intermediaire', 'fixed', 30, 'ex_ch_marche');
    expect(marche.start!).toBeLessThan(velo.start!);
  });
  it('progressif distance : increment ≥ 1', () => {
    const c = suggestConfig('distance', 'debutant', 'progressive', 30, 'ex_ch_course');
    expect(c.increment!).toBeGreaterThanOrEqual(1);
  });
});

describe('challengeStats', () => {
  it('calcule le total réalisé et le pourcentage', () => {
    const c = challenge({
      progress: [
        { day: 0, date: '2026-01-05', target: 10, done: 10, elapsed_sec: 0, completed: true },
        { day: 1, date: '2026-01-06', target: 10, done: 5, elapsed_sec: 0, completed: false },
      ],
    });
    const s = challengeStats(c);
    expect(s.totalDone).toBe(15);
    expect(s.completionPct).toBeGreaterThan(0);
    expect(s.completionPct).toBeLessThanOrEqual(100);
  });
});

describe('⚖️ L’UNITÉ DE LA PRIME : un kilomètre n’est pas une pompe', () => {
  // ⚠️ SIGNALÉ PAR L’UTILISATEUR : « j’ai fait un challenge marche/course 150 km en un
  // mois que j’ai fini en 2 semaines mais je n’ai pas eu ma prime de complétion ». Il
  // l’avait eue : elle valait **115 XP** pour un effort réel de ~6 000. La prime se
  // calculait sur `0,25 × le nombre de l${Q}objectif` — 150 pour des kilomètres, 3000 pour
  // un défi de pompes. Un kilomètre comptait exactement comme une pompe.
  //
  // ⚠️ Mesuré sur le compte réel (23 défis) : le ratio prime/effort des défis en reps va
  // de 1,20 à 2,16 ; celui des deux défis en distance valait **0,02**. Après conversion
  // il tombe à 1,81 et 2,14 — dans la bande, sans y avoir été forcé.
  const base = (over: Record<string, unknown>) =>
    ({
      id: 'c1',
      exercise_id: 'ex_pushup',
      unit: 'reps',
      format: 'cumulative',
      status: 'done',
      start_date: '2026-08-01',
      duration_days: 30,
      daily_targets: new Array(30).fill(0),
      config: { total: 100 },
      progress: [{ day: 0, done: 100 }],
      ...over,
    }) as unknown as Challenge;

  it('⚠️ un KILOMÈTRE pèse bien plus qu’une rep, et le facteur est DÉRIVÉ', () => {
    // ⚠️ Pas un nombre écrit à la main : il sort de `cardioSessionXp`, la formule qui
    // paie déjà les sorties. Si les intensités d’activité bougent, la conversion suit.
    // Mesuré : ~95 équivalent-reps par km de marche. On vérifie l’ORDRE DE GRANDEUR
    // contre la formule elle-même, jamais contre une constante recopiée.
    const km = base({ exercise_id: 'ex_ch_marche_course', unit: 'distance' });
    const reps = base({});
    const parKm = challengeXpBreakdown(km).bonus / challengeXpBreakdown(reps).bonus;
    // Ce que la formule du jeu dit qu’un km de marche vaut, en équivalent-reps.
    const attendu =
      cardioSessionXp({ activity: 'marche', distance_km: 1, duration_min: 12 } as never) /
      XP_MULT /
      REP_XP;
    // ⚠️ RÉÉCRIT : la prime d’une sortie porte DEUX facteurs depuis la v0.769 — la
    // conversion (un km vaut ~95 équivalent-reps) ET la part d’engagement (10 % au lieu
    // de 25 %, parce que le journal Cardio a déjà payé l’effort). Le test épinglait le
    // premier seul ; il épingle maintenant le PRODUIT, seul observable depuis dehors.
    expect(parKm).toBeCloseTo(attendu * ((0.1 * REP_XP) / 0.25), 0);
    expect(attendu).toBeGreaterThan(50);
  });

  it('⚠️ LA CONVERSION S’APPLIQUE DES DEUX CÔTÉS — aucun défi ne change d’état', () => {
    // C’est LE risque de ce changement : ne convertir que l’objectif aurait rendu tous
    // les défis en km instantanément terminés (ou jamais terminables). Le ratio réalisé
    // ÷ objectif doit rester intact, quelle que soit l’unité.
    const presque = base({
      exercise_id: 'ex_ch_marche_course',
      unit: 'distance',
      config: { total: 150 },
      progress: [{ day: 0, done: 149.9 }],
    });
    const pile = base({
      exercise_id: 'ex_ch_marche_course',
      unit: 'distance',
      config: { total: 150 },
      progress: [{ day: 0, done: 150 }],
    });
    expect(isChallengeComplete(presque)).toBe(false);
    expect(isChallengeComplete(pile)).toBe(true);
  });

  it('⚠️ UNE MINUTE DE SORTIE N’EST PAS UNE SECONDE DE GAINAGE', () => {
    // Le `/4` vient du gainage, où une unité est une SECONDE (4 s = 1 rep). Appliqué
    // à un défi cardio dont les unités sont des MINUTES, il faisait valoir une minute de
    // marche un quart de pompe. Deux unités homonymes, deux barèmes.
    const sortie = base({ exercise_id: 'ex_ch_marche_course', unit: 'time' });
    const gainage = base({ exercise_id: 'ex_plank', unit: 'time' });
    // ⚠️ Le facteur brut est d’environ 32 (une minute de sortie contre une seconde de
    // gainage), mais la sortie ne touche que 10 % là où le gainage touche 25 % — son
    // effort, lui, n’est payé nulle part ailleurs. Reste un écart NET, qui est le point.
    expect(challengeXpBreakdown(sortie).bonus).toBeGreaterThan(
      challengeXpBreakdown(gainage).bonus * 1.5,
    );
  });

  it('le VÉLO vaut moins du kilomètre que la marche — on y va deux fois plus vite', () => {
    // ⚠️ Ce n’est pas un jugement sur l’activité : l’XP des sorties est dominée par la
    // DURÉE (choix pro-endurance), donc à distance égale on passe moitié moins de temps
    // en zone. La conversion en hérite, et c’est cohérent.
    const velo = base({ exercise_id: 'ex_ch_velo', unit: 'distance' });
    const marche = base({ exercise_id: 'ex_ch_marche_course', unit: 'distance' });
    expect(challengeXpBreakdown(velo).bonus).toBeLessThan(challengeXpBreakdown(marche).bonus);
  });
});

describe('💸 UNE PRIME NE PAIE PAS DEUX FOIS LE MÊME EFFORT', () => {
  // ⚠️ SIGNALÉ PAR L’UTILISATEUR — « 24k d’XP ??? ». Corriger l’unité (v0.768) rendait aux
  // défis en kilomètres une prime arithmétiquement cohérente… et **+24 100 XP d’un coup**
  // sur un compte réel, donc **+24 100 d’énergie** (602 runs de donjon offerts), alors que
  // toute la doctrine tient sur « l’énergie lie le jeu au volume d’entraînement ».
  //
  // ⚠️ LA CONVERSION N’Y ÉTAIT POUR RIEN : mesuré, la marche était payée 2,8× son effort
  // contre 3,5× pour les pompes. Le déséquilibre est ailleurs — pour un défi de pompes la
  // prime est la récompense PRINCIPALE (rien d’autre ne paie ces reps) ; pour une sortie,
  // le journal Cardio a DÉJÀ tout payé, donc la prime n’est qu’un bonus d’engagement.
  const base = (over: Record<string, unknown>) =>
    ({
      id: 'c1',
      exercise_id: 'ex_pushup',
      unit: 'reps',
      format: 'cumulative',
      status: 'done',
      start_date: '2026-08-01',
      duration_days: 30,
      daily_targets: new Array(30).fill(0),
      config: { total: 100 },
      progress: [{ day: 0, done: 100 }],
      ...over,
    }) as unknown as Challenge;

  it('⚠️ un défi dont l’effort est DÉJÀ payé par les sorties ne touche qu’un bonus', () => {
    // À effort planifié ÉGAL, la sortie reçoit une fraction de ce que touche un défi de
    // reps : `OUTING_BONUS_PCT` (10 %) contre `COMPLETION_SHARE` (25 % de l’effort).
    const km = base({ exercise_id: 'ex_ch_marche_course', unit: 'distance' });
    const reps = base({});
    const b = challengeXpBreakdown(km).bonus;
    const r = challengeXpBreakdown(reps).bonus;
    // Un km vaut ~95 équivalent-reps, donc la prime reste plus GROSSE en valeur absolue —
    // ce qu’on vérifie est le RAPPORT, seul endroit où la règle vit.
    const parUnite = b / r;
    expect(parUnite).toBeGreaterThan(0);
    // Sans la règle, ce rapport vaudrait ~95 (la conversion seule). Avec elle, ~12,5 fois
    // moins. On borne largement : c’est l’ORDRE DE GRANDEUR qui est la garantie.
    expect(parUnite).toBeLessThan(20);
  });

  it('⚠️ UN DÉFI DE REPS NE PERD RIEN — la règle ne touche que les sorties', () => {
    // Non-régression : la prime des pompes est la récompense principale du défi, et ce
    // chantier ne devait pas y toucher. Elle vaut exactement 25 % de l’effort planifié.
    const reps = base({});
    const km = base({ exercise_id: 'ex_ch_marche_course', unit: 'distance' });
    // La prime des reps vaut COMPLETION_SHARE / COMPLETION_OUTING fois celle d’une
    // sortie à effort planifié ÉGAL — autrement dit 12,5 fois plus. On lit le rapport
    // sur la même paire, ce qui ne dépend d’aucun helper privé.
    const parEquivalentRep = challengeXpBreakdown(km).bonus / challengeXpBreakdown(reps).bonus;
    const kmEnReps =
      cardioSessionXp({ activity: 'marche', distance_km: 1, duration_min: 12 } as never) /
      XP_MULT /
      REP_XP;
    expect(parEquivalentRep).toBeCloseTo(kmEnReps * ((0.1 * REP_XP) / 0.25), 0);
  });

  it('⚠️ LE GAINAGE AU CHRONO GARDE SA PRIME PLEINE', () => {
    // Piège d’homonymie : gainage et sortie cardio sont tous deux en `unit: 'time'`. Mais
    // une planche n’est payée NULLE PART ailleurs — aucun journal ne l’enregistre. La règle
    // se lit donc sur « qui paie l’effort », pas sur le nom de l’unité.
    const planche = base({ exercise_id: 'ex_plank', unit: 'time' });
    const sortie = base({ exercise_id: 'ex_ch_marche_course', unit: 'time' });
    const parUnite =
      challengeXpBreakdown(sortie).bonus / Math.max(1, challengeXpBreakdown(planche).bonus);
    // Une minute de marche pèse ~8-17 équivalent-reps contre 0,25 pour une seconde de
    // gainage ; sans la règle le rapport dépasserait 30. Avec elle, il reste modeste.
    expect(parUnite).toBeLessThan(12);
    expect(challengeXpBreakdown(planche).bonus).toBeGreaterThan(0);
  });
});
