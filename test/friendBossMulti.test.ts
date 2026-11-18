// 🎯 BOSS ENTRE AMIS À PLUSIEURS EXERCICES (v1.320.0, migr. 0118).
//
// Un boss a de 2 à 5 exercices ; à CHAQUE frappe on choisit librement lequel. Tout se convertit en
// ÉQUIVALENT POUSSÉE par les parts de famille déjà en place : tirage ×2, jambes ×0,75, gainage
// (seconde) ×0,2. Le serveur compte en POINTS entiers (1/20 de rep de poussée) : aucun arrondi par
// frappe. Un boss d'UN exo doit se comporter EXACTEMENT comme avant (bloc « inchangé »).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { REP_XP, XP_MULT } from '@/lib/athlete';
import {
  FRIEND_BOSS,
  mixedWeight,
  eqPerUnit,
  splitHit,
  splitHitMixed,
  bossHpTotal,
  bossDamage,
  bossUnitsLeft,
  bossUnitsLeftExact,
  bossShareUnits,
  minShareUnits,
  metMinShare,
  personalShare,
  bossReservedUnits,
  bossCompletionXp,
  friendBossXp,
  friendBossChest,
  friendBossBonus,
  bossAgendaEntries,
  bossHitGrid,
  bossFromRow,
  bossExercises,
  bossExerciseIds,
  isMixedBoss,
  hitExercise,
  hitQty,
  parseBossExercises,
  unitsFromRow,
  bossJoinBlocker,
  bossLaunchBlocker,
  bossErrorMessage,
  type BossFamily,
  type BossExercise,
  type FriendBoss,
  type FriendBossHit,
  type FriendBossMember,
} from '@/lib/friendBoss';
import { bodyBalance, type BalanceInput } from '@/lib/bodyBalance';
import { makeBoss } from './helpers/friendBoss';

const H = 3600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 10, 2, 10);
const ME = 'moi';

const EXS: BossExercise[] = [
  { id: 'pushup', name: 'Pompes', family: 'push', repWeight: 1 },
  { id: 'pullup', name: 'Tractions', family: 'pull', repWeight: 1.4 },
  { id: 'squat', name: 'Squats', family: 'legs', repWeight: 0.8 },
  { id: 'plank', name: 'Gainage', family: 'core', repWeight: 1 },
  { id: 'burpee', name: 'Burpees', family: 'conditioning', repWeight: 1.2 },
];
const ex = (id: string) => EXS.find((e) => e.id === id)!;

const mixed = (over: Partial<FriendBoss> = {}): FriendBoss =>
  makeBoss({
    ownerId: ME,
    family: 'push',
    exerciseId: 'pushup',
    exerciseName: 'Pompes + Tractions + Gainage',
    exercises: [ex('pushup'), ex('pullup'), ex('plank')],
    createdAt: T0,
    startAt: T0,
    hpTotal: 60_000,
    ...over,
  });
const single = (over: Partial<FriendBoss> = {}): FriendBoss =>
  makeBoss({ ownerId: ME, createdAt: T0, startAt: T0, hpTotal: 60_000, ...over });

const member = (over: Partial<FriendBossMember> = {}): FriendBossMember => ({
  bossId: 'b1',
  userId: ME,
  pseudo: 'Moi',
  status: 'accepted',
  units: 0,
  claimed: false,
  bonusClaimed: false,
  ...over,
});
let seq = 0;
const hit = (over: Partial<FriendBossHit> = {}): FriendBossHit => ({
  id: `h${++seq}`,
  bossId: 'b1',
  userId: ME,
  units: 0,
  createdAt: T0 + H,
  ...over,
});

// ── 1. La conversion en équivalent poussée ───────────────────────────────────────────────
describe('🎯 conversion par famille : les valeurs exactes de la décision', () => {
  it('une unité vaut 1 · 2 · 0,75 · 0,2 · 1 équivalent poussée (tirage, jambes, gainage…)', () => {
    expect(eqPerUnit('push')).toBe(1);
    expect(eqPerUnit('pull')).toBe(2);
    expect(eqPerUnit('legs')).toBe(0.75);
    expect(eqPerUnit('core')).toBe(0.2);
    expect(eqPerUnit('conditioning')).toBe(1);
  });

  it('en points entiers (1/20) : 20 · 40 · 15 · 4 · 20 — jamais une fraction', () => {
    expect(mixedWeight('push')).toBe(20);
    expect(mixedWeight('pull')).toBe(40);
    expect(mixedWeight('legs')).toBe(15);
    expect(mixedWeight('core')).toBe(4);
    expect(mixedWeight('conditioning')).toBe(20);
    for (const f of Object.keys(FRIEND_BOSS.shareUnits) as BossFamily[])
      expect(Number.isInteger(mixedWeight(f)), f).toBe(true);
  });

  it('une saisie de 40 unités rend 40 · 80 · 30 · 8 · 40 éq. pompes (un cran Sérieux)', () => {
    const units = (f: BossFamily, asked: number) => splitHitMixed(f, asked, 9999, 0).units;
    expect(units('push', 40)).toBe(40);
    expect(units('pull', 40)).toBe(80);
    expect(units('legs', 40)).toBe(30);
    expect(units('core', 40)).toBe(8);
    expect(units('conditioning', 40)).toBe(40);
  });

  it('⚠️ le plafond d’une saisie retombe sur ceux d’avant, exo par exo (150 · 75 · 200 · 750)', () => {
    const cap = (f: BossFamily, tier?: string) => splitHitMixed(f, 99_999, 9999, 0, tier).accepted;
    expect(cap('push')).toBe(150);
    expect(cap('pull')).toBe(75);
    expect(cap('legs')).toBe(200);
    expect(cap('core')).toBe(750);
    // …et ce sont exactement ceux d'un boss d'UN exo de la même famille.
    for (const f of ['push', 'pull', 'legs', 'core'] as const)
      expect(cap(f), f).toBe(splitHit(f, 99_999, 9999, 0).accepted);
    // Le cran multiplie la part, donc le plafond (×5 : 750 pompes, 375 tractions).
    expect(cap('push', 'inhumain')).toBe(750);
    expect(cap('pull', 'inhumain')).toBe(375);
    expect(cap('push', 'echauffement')).toBe(75);
  });

  it('⚠️ AUCUN ARRONDI PAR FRAPPE : découper ses séries ne rapporte pas un point de plus', () => {
    // Un arrondi par frappe ferait valoir 1 rep de jambes 1 éq. (au lieu de 0,75) : cent frappes
    // d'une rep rapporteraient +33 %. En points entiers, la somme égale la frappe unique.
    const total = (f: BossFamily, n: number, per: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += splitHitMixed(f, per, 9999, 0).units;
      return sum;
    };
    expect(total('legs', 100, 1)).toBe(splitHitMixed('legs', 100, 9999, 0).units); // 75
    expect(total('legs', 100, 1)).toBe(75);
    expect(total('core', 100, 1)).toBeCloseTo(20, 9);
    expect(total('core', 100, 1)).toBeCloseTo(splitHitMixed('core', 100, 9999, 0).units, 9);
    expect(total('pull', 7, 3)).toBe(splitHitMixed('pull', 21, 9999, 0).units);
  });

  it('les PV d’un boss à choix valent ceux d’un boss de poussée du même cran', () => {
    // Une part de POUSSÉE par participant (60 × cran), lanceur compris : `family` = 'push'.
    expect(bossHpTotal('push', 1, 'serieux')).toBe(60_000);
    expect(bossHpTotal('push', 3, 'costaud')).toBe(360_000);
    // Et la part, le plafond et la demi-part sont ceux de la poussée.
    expect(bossShareUnits('push', 'inhumain')).toBe(300);
    expect(minShareUnits('push', 'serieux')).toBe(30);
  });

  it('⚠️ les dégâts sont arrondis, jamais tronqués (12,75 éq. = 12 750) ; un entier ne bouge pas', () => {
    expect(bossDamage(12.75)).toBe(12_750);
    expect(bossDamage(0.2 * 263)).toBe(52_600);
    expect(bossDamage(25)).toBe(25_000);
    expect(bossDamage(-3)).toBe(0);
  });

  it('l’équivalent poussée restant se lit au point près (1/20), pas à la rep entière', () => {
    // 107 250 PV restants = 107,25 éq. pompes ; `bossUnitsLeft` (boss d'un exo) arrondit à 108.
    const b = { hpTotal: 120_000, damage: 12_750 };
    expect(bossUnitsLeftExact(b)).toBe(107.25);
    expect(bossUnitsLeft(b)).toBe(108);
    expect(bossUnitsLeftExact({ hpTotal: 1000, damage: 1000 })).toBe(0);
  });
});

// ── 2. Plafond, réserve et surplus avec des exercices mixtes ─────────────────────────────
describe('🎯 réserve et surplus en équivalent poussée', () => {
  it('une saisie de tirage entame le boss à 2 éq. la rep, le reste devient du surplus', () => {
    // Reste 10 éq. ; 4 gardés pour un ami ; 10 tractions = 20 éq. → 6 de dégâts, 14 de surplus.
    const s = splitHitMixed('pull', 10, 10, 4);
    expect(s).toEqual({ accepted: 10, damage: 6, surplus: 14, units: 20 });
  });

  it('jambes et gainage : les fractions tombent juste (0,75 et 0,2)', () => {
    expect(splitHitMixed('legs', 20, 10, 0)).toEqual({
      accepted: 20,
      damage: 10,
      surplus: 5,
      units: 15,
    });
    expect(splitHitMixed('core', 25, 2.5, 0)).toEqual({
      accepted: 25,
      damage: 2.5,
      surplus: 2.5,
      units: 5,
    });
  });

  it('un boss déjà à 0 : toute la saisie est du surplus, rien n’est refusé', () => {
    const s = splitHitMixed('push', 30, 0, 0);
    expect(s).toEqual({ accepted: 30, damage: 0, surplus: 30, units: 30 });
  });

  it('une saisie à zéro ou négative ne passe pas', () => {
    expect(splitHitMixed('pull', 0, 99, 0).accepted).toBe(0);
    expect(splitHitMixed('pull', -5, 99, 0).accepted).toBe(0);
  });

  it('la réserve garde la demi-part qui manque aux AUTRES, en éq. fractionnaires (la règle du serveur)', () => {
    const b = mixed();
    const members = [
      member({ userId: ME, units: 3 }),
      member({ userId: 'ami', units: 12.75 }),
      member({ userId: 'ami2', units: 0 }),
    ];
    // demi-part = 30 éq. : l'ami à 12,75 en garde 17,25, l'ami à 0 en garde 30.
    expect(bossReservedUnits(b, members, ME, T0 + D)).toBe(47.25);
    // Le dernier jour, les réserves tombent.
    expect(bossReservedUnits(b, members, ME, T0 + 6 * D + H)).toBe(0);
  });

  it('⚠️ le coffre et la prime se jouent sur l’équivalent poussée, au point près', () => {
    // La demi-part (30 éq.) : 29,95 ne la passe pas, 30 oui — la même règle que le serveur
    // (`points >= 600`).
    expect(metMinShare('push', 29.95, 'serieux')).toBe(false);
    expect(metMinShare('push', 30, 'serieux')).toBe(true);
    expect(personalShare('push', 60, 'serieux')).toBe(1);
    expect(personalShare('push', 15, 'serieux')).toBeCloseTo(0.125, 10);
  });
});

// ── 3. L'exercice de chaque frappe ───────────────────────────────────────────────────────
describe('🎯 l’exercice de chaque frappe', () => {
  it('on retrouve l’exo de la frappe dans la liste du boss ; à défaut, le premier', () => {
    const b = mixed();
    expect(hitExercise(b, { exerciseId: 'pullup' }).family).toBe('pull');
    expect(hitExercise(b, { exerciseId: 'plank' }).name).toBe('Gainage');
    expect(hitExercise(b, { exerciseId: null }).id).toBe('pushup');
    expect(hitExercise(b, { exerciseId: 'inconnu' }).id).toBe('pushup');
  });

  it('un boss d’un exo n’a qu’un exo : celui de ses colonnes', () => {
    const b = single({ family: 'legs', exerciseId: 'squat', exerciseName: 'Squats' });
    expect(isMixedBoss(b)).toBe(false);
    expect(bossExercises(b)).toEqual([
      { id: 'squat', name: 'Squats', family: 'legs', repWeight: 1 },
    ]);
    expect(bossExerciseIds(b)).toEqual(['squat']);
  });

  it('la quantité brute d’une frappe : `qty`, sinon `units` (frappe d’avant)', () => {
    expect(hitQty({ units: 12.75, qty: 17 })).toBe(17);
    expect(hitQty({ units: 40 })).toBe(40);
    expect(hitQty({ units: 40, qty: null })).toBe(40);
  });

  it('la liste lue en base est défensive : moins de 2 exos valides = boss d’un exo', () => {
    expect(
      parseBossExercises([
        { id: 'a', name: 'A', family: 'push', rep_weight: 1 },
        { id: 'b', name: 'B', family: 'pull', rep_weight: 1.2 },
      ]),
    ).toEqual([
      { id: 'a', name: 'A', family: 'push', repWeight: 1 },
      { id: 'b', name: 'B', family: 'pull', repWeight: 1.2 },
    ]);
    expect(parseBossExercises(null)).toBeNull();
    expect(parseBossExercises('x')).toBeNull();
    expect(parseBossExercises([{ id: 'a', family: 'push' }])).toBeNull();
    // Une famille inconnue est ignorée (jamais une part « undefined »).
    expect(
      parseBossExercises([
        { id: 'a', name: 'A', family: 'push' },
        { id: 'b', name: 'B', family: 'sorcellerie' },
      ]),
    ).toBeNull();
  });

  it('une ligne de base : la liste est relue, et une ligne d’avant n’en a pas', () => {
    const row = {
      id: 'b1',
      owner_id: 'u1',
      family: 'push',
      exercise_id: 'pushup',
      exercise_name: 'Pompes + Tractions',
      rep_weight: 1,
      created_at: '2026-11-02T10:00:00Z',
      start_at: null,
      defeated_at: null,
      hp_total: 60_000,
      damage: 0,
    };
    const m = bossFromRow({
      ...row,
      exercises: [
        { id: 'pushup', name: 'Pompes', family: 'push', rep_weight: 1 },
        { id: 'pullup', name: 'Tractions', family: 'pull', rep_weight: 1.4 },
      ],
    });
    expect(isMixedBoss(m)).toBe(true);
    expect(m.family).toBe('push');
    expect(m.exercises).toHaveLength(2);
    expect(bossFromRow(row)).not.toHaveProperty('exercises');
    expect(isMixedBoss(bossFromRow({ ...row, exercises: null }))).toBe(false);
  });

  it('⚠️ les points d’une ligne se lisent en éq. poussée ; sans points, la valeur d’avant', () => {
    expect(unitsFromRow(255, 13)).toBe(12.75);
    expect(unitsFromRow(0, 5)).toBe(0);
    expect(unitsFromRow(null, 13)).toBe(13);
    expect(unitsFromRow(undefined, 13)).toBe(13);
  });
});

// ── 4. XP, agenda, radar : la famille de CHAQUE frappe ───────────────────────────────────
describe('🎯 XP et agenda : par frappe, jamais par boss', () => {
  const day = (ms: number) => String(Math.floor((ms - T0) / D));
  const frappes: FriendBossHit[] = [
    hit({ exerciseId: 'pullup', qty: 20, units: 40, createdAt: T0 + H }),
    hit({ exerciseId: 'plank', qty: 60, units: 12, createdAt: T0 + 2 * H }),
    hit({ exerciseId: 'plank', qty: 30, units: 6, createdAt: T0 + 3 * H }),
    hit({ exerciseId: 'pushup', qty: 10, units: 10, createdAt: T0 + D + H }),
  ];

  it('une ligne d’agenda par (jour, EXERCICE) : famille, unité et titre sont ceux de l’exo choisi', () => {
    const rows = bossAgendaEntries([mixed()], [member()], frappes, ME, day);
    expect(rows).toHaveLength(3);
    const pull = rows.find((r) => r.exerciseId === 'pullup')!;
    expect(pull).toMatchObject({ family: 'pull', unit: 'reps', title: 'Tractions', total: 20 });
    const core = rows.find((r) => r.exerciseId === 'plank')!;
    // Deux frappes de gainage le même jour : UNE ligne, en secondes brutes.
    expect(core).toMatchObject({ family: 'core', unit: 's', units: [60, 30], total: 90, day: '0' });
    expect(rows.find((r) => r.exerciseId === 'pushup')).toMatchObject({ day: '1', family: 'push' });
  });

  it('l’XP d’une ligne suit le poids de rep et la règle de SON exo (seconde de gainage = ¼ de rep)', () => {
    const rows = bossAgendaEntries([mixed()], [member()], frappes, ME, day);
    const xp = (id: string) => rows.find((r) => r.exerciseId === id)!.xp;
    expect(xp('pullup')).toBe(Math.round(20 * REP_XP * 1.4 * XP_MULT));
    expect(xp('plank')).toBe(Math.round((90 / 4) * REP_XP * XP_MULT));
  });

  it('une frappe d’un AUTRE joueur, ou sans adhésion acceptée, ne remonte pas', () => {
    const autre = [hit({ userId: 'ami', exerciseId: 'pullup', qty: 20, units: 40 })];
    expect(bossAgendaEntries([mixed()], [member()], autre, ME, day)).toEqual([]);
    expect(bossAgendaEntries([mixed()], [member({ status: 'invited' })], frappes, ME, day)).toEqual(
      [],
    );
  });

  it('⚠️ friendBossXp lit les FRAPPES : sans elles un boss à choix rendrait 0 en silence', () => {
    const b = mixed();
    const m = member({ units: 58 }); // 40 + 12 + 6 = 58 éq. (aucune demi-part de 30 manquante)
    const xp = friendBossXp([b], [m], ME, frappes.slice(0, 3));
    const raw = 20 * REP_XP * 1.4 + (90 / 4) * REP_XP;
    expect(xp.muscu).toBe(Math.round(raw * XP_MULT));
    expect(xp.cardio).toBe(0);
    expect(friendBossXp([b], [m], ME, []).muscu).toBe(0);
  });

  it('un exo de conditionnement nourrit le CARDIO, les autres la muscu — dans le même boss', () => {
    const b = mixed({ exercises: [ex('pushup'), ex('burpee')] });
    const hits = [
      hit({ exerciseId: 'burpee', qty: 30, units: 30 }),
      hit({ exerciseId: 'pushup', qty: 20, units: 20 }),
    ];
    const xp = friendBossXp([b], [member({ units: 50 })], ME, hits);
    expect(xp.cardio).toBe(Math.round(30 * REP_XP * 1.2 * XP_MULT));
    expect(xp.muscu).toBe(Math.round(20 * REP_XP * 1 * XP_MULT));
  });

  it('la XP est arrondie UNE fois sur la somme : 100 frappes d’1 s de gainage ne valent pas 0', () => {
    const b = mixed();
    const hits = Array.from({ length: 100 }, () =>
      hit({ exerciseId: 'plank', qty: 1, units: 0.2 }),
    );
    const xp = friendBossXp([b], [member({ units: 20 })], ME, hits);
    expect(xp.muscu).toBe(Math.round((100 / 4) * REP_XP * XP_MULT));
    expect(xp.muscu).toBeGreaterThan(0);
  });

  it('la prime exige boss mort ET demi-part ; elle est plafonnée à 2 parts d’éq. poussée', () => {
    const hits = [hit({ exerciseId: 'pushup', qty: 120, units: 120 })];
    const reps = Math.round(120 * REP_XP * XP_MULT);
    const alive = friendBossXp([mixed()], [member({ units: 120 })], ME, hits);
    expect(alive.muscu).toBe(reps);
    const dead = mixed({ defeatedAt: T0 + 2 * D });
    // 120 éq. = 2 parts : tout compte → la prime double l'XP des reps.
    expect(friendBossXp([dead], [member({ units: 120 })], ME, hits).muscu).toBe(reps * 2);
    // 400 éq. : seules 120 comptent pour la prime (×1 + 120/400).
    const big = [hit({ exerciseId: 'pushup', qty: 400, units: 400 })];
    const bigXp = friendBossXp([dead], [member({ units: 400 })], ME, big).muscu;
    expect(bigXp).toBe(Math.round(400 * REP_XP * XP_MULT * (1 + 120 / 400)));
    // Sous la demi-part (29 éq.), rien.
    const few = [hit({ exerciseId: 'pushup', qty: 29, units: 29 })];
    expect(friendBossXp([dead], [member({ units: 29 })], ME, few).muscu).toBe(
      Math.round(29 * REP_XP * XP_MULT),
    );
  });

  it('⚠️ le RADAR lit la famille de la FRAPPE : un exo de conditionnement du boss ne creuse aucun muscle', () => {
    const b = mixed({ exercises: [ex('pushup'), { ...ex('burpee'), id: 'bench' }, ex('plank')] });
    const hits = [
      hit({ exerciseId: 'pushup', qty: 30, units: 30 }),
      hit({ exerciseId: 'bench', qty: 60, units: 60 }), // « bench » est un exo de conditionnement ICI
      hit({ exerciseId: 'plank', qty: 90, units: 18 }),
    ];
    const entries = bossAgendaEntries([b], [member()], hits, ME, () => '2026-11-02');
    const input: BalanceInput = {
      sessions: [],
      combos: [],
      challenges: [],
      bossHits: entries,
      targets: { pectoraux: 10, abdominaux: 6 },
      objective: 'hypertrophie',
      secondaries: () => undefined,
      primaries: (id) => ({ bench: 'pectoraux', pushup: 'pectoraux', plank: 'abdominaux' })[id],
      today: '2026-11-04',
    } as BalanceInput;
    const done = (m: string) => bodyBalance(input, 'week').find((r) => r.muscle === m)?.done ?? 0;
    // 30 pompes ÷ 10 = 3 séries — les 60 « bench » (conditionnement) sont écartées.
    expect(done('pectoraux')).toBeCloseTo(3, 5);
    // 90 s de gainage ÷ 45 = 2 séries : la famille de CETTE frappe est le temps.
    expect(done('abdominaux')).toBeCloseTo(2, 5);
  });
});

// ── 5. Un boss occupe tous ses exercices ─────────────────────────────────────────────────
describe('🎯 « un seul boss en cours par exercice », étendu à la liste', () => {
  const enCours = mixed({ exercises: [ex('pushup'), ex('pullup'), ex('plank')] });
  const at = T0 + 2 * D;
  const base = { tokens: 6, tier: 'serieux', owned: [] as FriendBoss[] };

  it('un boss à choix en cours bloque TOUT exercice de sa liste, pas seulement le premier', () => {
    for (const id of ['pushup', 'pullup', 'plank'])
      expect(bossJoinBlocker({ exerciseIds: [id], mine: [enCours] }, at), id).toBe('same_exercise');
    expect(bossJoinBlocker({ exerciseIds: ['squat'], mine: [enCours] }, at)).toBeNull();
  });

  it('un chevauchement d’un seul exo suffit à bloquer un autre boss à choix', () => {
    expect(bossJoinBlocker({ exerciseIds: ['squat', 'plank'], mine: [enCours] }, at)).toBe(
      'same_exercise',
    );
    expect(bossJoinBlocker({ exerciseIds: ['squat', 'burpee'], mine: [enCours] }, at)).toBeNull();
    expect(
      bossLaunchBlocker({ ...base, exerciseIds: ['burpee', 'pullup'], mine: [enCours] }, at),
    ).toBe('same_exercise');
  });

  it('l’ancienne forme (un `exerciseId`) marche toujours, contre un boss à choix aussi', () => {
    expect(bossJoinBlocker({ exerciseId: 'pullup', mine: [enCours] }, at)).toBe('same_exercise');
    expect(bossLaunchBlocker({ ...base, exerciseId: 'squat', mine: [enCours] }, at)).toBeNull();
  });

  it('un boss fini libère tous ses exercices', () => {
    const mort = mixed({ defeatedAt: T0 + D });
    expect(bossJoinBlocker({ exerciseIds: ['pullup'], mine: [mort] }, at)).toBeNull();
  });

  it('le refus d’une liste invalide est traduit', () => {
    expect(bossErrorMessage('bad_exercises')).toContain('2 à 5');
  });
});

// ── 6. Un boss d'UN exo reste EXACTEMENT comme avant ─────────────────────────────────────
describe('🎯 un boss d’un seul exo est inchangé (valeurs figées de l’ancien comportement)', () => {
  it('PV, plafond, réserve et surplus d’un boss de jambes : les nombres d’avant', () => {
    expect(bossHpTotal('legs', 2, 'serieux')).toBe(160_000);
    expect(splitHit('legs', 500, 100, 10)).toEqual({ accepted: 200, damage: 90, surplus: 110 });
    expect(splitHit('core', 9999, 99_999, 0, 'costaud')).toEqual({
      accepted: 1500,
      damage: 1500,
      surplus: 0,
    });
    expect(bossUnitsLeft({ hpTotal: 160_000, damage: 12_000 })).toBe(148);
    expect(bossDamage(37)).toBe(37_000);
  });

  it('XP d’un boss d’un exo : la formule d’avant, frappes ou non (3 ou 4 arguments)', () => {
    const b = single({ family: 'pull', repWeight: 1.4, defeatedAt: T0 + D });
    const m = member({ units: 45 });
    const reps = Math.round(45 * REP_XP * 1.4 * XP_MULT);
    const prime = bossCompletionXp('pull', 45, 1.4, true);
    const sans = friendBossXp([b], [m], ME, []);
    expect(sans.muscu).toBe(reps + prime);
    // Les frappes ne comptent pour rien : le calcul reste sur `units` du membre.
    const avec = friendBossXp([b], [m], ME, [hit({ units: 45, exerciseId: 'autre', qty: 3 })]);
    expect(avec).toEqual(sans);
    expect(
      friendBossXp([single({ family: 'conditioning' })], [member({ units: 10 })], ME, []).cardio,
    ).toBe(Math.round(10 * REP_XP * XP_MULT));
  });

  it('agenda : une ligne par (boss, jour) avec le titre, la famille et l’XP du boss', () => {
    const b = single({
      family: 'core',
      exerciseId: 'plank',
      exerciseName: 'Gainage',
      repWeight: 1,
    });
    const rows = bossAgendaEntries(
      [b],
      [member()],
      [hit({ units: 40, createdAt: T0 + H }), hit({ units: 50, createdAt: T0 + 2 * H })],
      ME,
      () => 'J',
    );
    expect(rows).toEqual([
      {
        bossId: 'b1',
        exerciseId: 'plank',
        family: 'core',
        day: 'J',
        title: 'Gainage',
        units: [40, 50],
        total: 90,
        xp: Math.round((90 / 4) * REP_XP * XP_MULT),
        unit: 's',
      },
    ]);
  });

  it('tableau des frappes, coffre et prime : mêmes valeurs qu’avant', () => {
    const b = single({ family: 'push', defeatedAt: T0 + 2 * D });
    const grid = bossHitGrid(
      b,
      [member()],
      [hit({ units: 25, createdAt: T0 + D + H })],
      T0 + 3 * D,
    );
    expect(grid.total).toBe(25);
    expect(grid.rows[0]!.cells[1]).toBe(25);
    const chest = friendBossChest(b, ME, 20, 60);
    expect(chest.share).toBe(1);
    expect(chest.tickets).toBe(1);
    expect(chest.trophy).not.toBeNull();
    expect(friendBossBonus(b, 20, 90).help).toBeCloseTo(0.5, 10);
    expect(personalShare('push', 15, 'serieux')).toBeCloseTo(0.125, 10);
  });

  it('une ligne d’avant (sans liste) donne un boss d’un exo et ses frappes gardent leurs reps', () => {
    const b = bossFromRow({
      id: 'b1',
      owner_id: 'u1',
      family: 'legs',
      exercise_id: 'squat',
      exercise_name: 'Squats',
      rep_weight: 0.8,
      created_at: '2026-09-16T00:00:00Z',
      start_at: null,
      defeated_at: null,
      hp_total: 80_000,
      damage: 0,
    });
    expect(isMixedBoss(b)).toBe(false);
    expect(Object.keys(b)).not.toContain('exercises');
    expect(hitExercise(b, {}).id).toBe('squat');
    expect(hitQty({ units: 33 })).toBe(33);
  });
});

// ── 7. La migration 0118 dit la même chose que la lib ────────────────────────────────────
describe('🎯 la lib et la migration 0118 disent la même chose', () => {
  const all = () =>
    fs
      .readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => ({ f, s: fs.readFileSync(`supabase/migrations/${f}`, 'utf8') }));
  const sql = fs.readFileSync('supabase/migrations/0118_fboss_multi_exos.sql', 'utf8');
  /** Le corps d'UNE fonction de la 0118 (jusqu'à sa fin `$$;`). */
  const def = (fn: string) => {
    const re = new RegExp(`create or replace function public\\.${fn}\\(`);
    const m = re.exec(sql);
    if (!m) throw new Error(`absent de la 0118 : ${fn}`);
    const j = sql.indexOf('\n$$;', m.index);
    return sql.slice(m.index, j < 0 ? undefined : j);
  };
  /** La dernière définition d'une fonction, toutes migrations confondues. */
  const lastDef = (fn: string) => {
    const re = new RegExp(`create (?:or replace )?function public\\.${fn}\\(`, 'g');
    let last = '';
    for (const { s } of all()) {
      const starts = [...s.matchAll(re)].map((x) => x.index!);
      if (starts.length) {
        const i = starts[starts.length - 1]!;
        const j = s.indexOf('\n$$;', i);
        last = s.slice(i, j < 0 ? undefined : j);
      }
    }
    return last;
  };

  it('⚠️ COMPATIBLE : la migration est additive, et ne touche NI fboss_declare NI la signature de fboss_hit', () => {
    expect(sql).not.toMatch(/\bdrop\s+(function|table|column|constraint)/i);
    expect(sql).not.toMatch(/\brename\b/i);
    expect(sql).not.toMatch(/alter\s+column/i);
    // Les colonnes ajoutées sont NULLABLES et sans valeur par défaut (aucun boss existant ne bouge).
    expect(sql).toMatch(/add column if not exists exercises jsonb;/);
    expect(sql).toMatch(/add column if not exists points integer;/);
    // `fboss_declare` (6 arguments, appelée par les anciens clients) n'est pas redéfinie ici.
    expect(sql).not.toContain('function public.fboss_declare(');
    expect(lastDef('fboss_declare')).toContain('p_family text');
    expect(lastDef('fboss_declare')).not.toContain('p_exercises');
    // `fboss_hit(p_boss, p_units)` garde sa signature et aiguille un boss à choix vers l'exo 1.
    const h = def('fboss_hit');
    expect(h).toContain('fboss_hit(p_boss uuid, p_units integer)');
    expect(h).toContain('if public.fboss_is_multi(b) then');
    expect(h).toContain('return public.fboss_hit_exo(p_boss, p_units, null);');
    // …et un boss d'un exo garde SON corps d'avant (plafond, réserve, surplus, dégâts).
    expect(h).toContain(`floor(v_share * ${FRIEND_BOSS.hitMaxShare})`);
    expect(h).toContain('v_dmg := least(v_acc, greatest(0, v_left - v_reserved));');
    expect(h).toContain('damage = damage + v_dmg * v_dpu');
  });

  it('mêmes poids et même échelle : 20 points par rep de poussée, poids = 1200 ÷ part', () => {
    expect(def('fboss_mixed_scale')).toContain(`select ${FRIEND_BOSS.mixedScale};`);
    expect(def('fboss_mixed_weight')).toContain(
      "(public.fboss_mixed_scale() * public.fboss_share('push')) / public.fboss_share(p_family)",
    );
    // Les parts serveur sont celles de la lib : donc les poids aussi (entiers).
    const share = lastDef('fboss_share');
    for (const [f, n] of Object.entries(FRIEND_BOSS.shareUnits))
      expect(share).toContain(`when '${f}' then ${n}`);
    for (const f of Object.keys(FRIEND_BOSS.shareUnits))
      expect(
        (FRIEND_BOSS.mixedScale * FRIEND_BOSS.shareUnits.push) %
          FRIEND_BOSS.shareUnits[f as BossFamily],
      ).toBe(0);
  });

  it('⚠️ fboss_hit_exo : le plafond, la réserve et les dégâts sont ceux de splitHitMixed', () => {
    const h = def('fboss_hit_exo');
    expect(h).toContain('public.fboss_share_tier(b.family, b.tier) * public.fboss_mixed_scale()');
    expect(h).toContain(`floor(floor(v_share * ${FRIEND_BOSS.hitMaxShare})::numeric / v_w)`);
    expect(h).toContain(`ceil(v_share * ${FRIEND_BOSS.minShare})::integer - coalesce(m.points, 0)`);
    expect(h).toContain("m.status = 'accepted' and m.user_id <> v_uid");
    const days = (FRIEND_BOSS.durationMs - FRIEND_BOSS.reserveReleaseMs) / D;
    expect(h).toContain(`public.fboss_start(b) + interval '${days} days'`);
    expect(h).toContain('v_dmg := least(v_pts, greatest(0, v_left - v_reserved));');
    expect(h).toContain(
      'v_dpp integer := public.fboss_damage_per_unit() / public.fboss_mixed_scale()',
    );
    expect(h).toContain('damage = damage + v_dmg * v_dpp');
    expect(h).toContain('ceil((b.hp_total - b.damage)::numeric / v_dpp)::integer');
  });

  it('⚠️ famille et poids sont relus dans la liste FIGÉE du boss ; un id hors liste est refusé', () => {
    const h = def('fboss_hit_exo');
    expect(h).toContain('from jsonb_array_elements(b.exercises) e');
    expect(h).toContain("where e ->> 'id' = coalesce(p_exercise_id, b.exercise_id);");
    expect(h).toContain('select e into v_ex');
    expect(h).toContain("if v_ex is null then raise exception 'bad_exercise'; end if;");
    expect(h).toContain("public.fboss_mixed_weight(v_ex ->> 'family')");
    // La frappe n'envoie QUE l'id : aucun paramètre de famille ni de poids.
    expect(h).not.toMatch(/p_family|p_weight/);
    // Sur un boss d'un exo : un id qui n'est pas le sien est refusé, sinon on rend la main.
    expect(h).toContain('p_exercise_id <> b.exercise_id');
    expect(h).toContain('return public.fboss_hit(p_boss, p_units);');
  });

  it('les points exacts sont enregistrés ; `units` (ce que lit un ancien client) en est DÉRIVÉ', () => {
    const h = def('fboss_hit_exo');
    expect(h).toContain('exercise_id, qty,');
    expect(h).toContain("v_ex ->> 'id', v_qty, v_pts, v_sur");
    expect(h).toContain('points = coalesce(points, 0) + v_pts');
    expect(h).toContain(
      'units = round((coalesce(points, 0) + v_pts) / public.fboss_mixed_scale()::numeric)::integer',
    );
    // `check (units > 0)` : au moins 1.
    expect(h).toContain('greatest(1, round(v_pts / public.fboss_mixed_scale()::numeric)::integer)');
  });

  it('fboss_declare_multi : 2 à 5 exercices distincts, `family` = push, mêmes garde-fous que fboss_declare', () => {
    const d = def('fboss_declare_multi');
    expect(d).toContain(
      `if v_n < ${FRIEND_BOSS.minExercises} or v_n > ${FRIEND_BOSS.maxExercises} then raise exception 'bad_exercises'`,
    );
    expect(d).toContain("if v_exid = any (v_ids) then raise exception 'bad_exercises'");
    expect(d).toContain("raise exception 'bad_exercise'");
    expect(d).toContain("raise exception 'bad_tier'");
    expect(d).toContain("raise exception 'no_altar'");
    expect(d).toContain("raise exception 'no_tokens'");
    expect(d).toContain("raise exception 'cooldown'");
    expect(d).toContain("raise exception 'same_exercise'");
    expect(d).toContain('v_cost integer := public.fboss_token_cost(p_tier)');
    expect(d).toContain("public.fboss_ended(b) + interval '48 hours' > now()");
    expect(d).toContain(`cardinality(v_invitees) > ${FRIEND_BOSS.maxInvites}`);
    // PV : une part de POUSSÉE par participant, comme un boss de pompes du même cran.
    expect(d).toContain("public.fboss_share_tier('push', p_tier) * public.fboss_damage_per_unit()");
    expect(d).toContain("left(array_to_string(v_names, ' + '), 80), 'push',");
    // Un client ne fixe pas les PV, la famille ni la liste brute : elle est NORMALISÉE.
    expect(d).toContain('jsonb_build_object(');
    expect(d).toContain('public.fboss_ids_busy(v_uid, v_ids)');
  });

  it('un boss occupe TOUS ses exercices : chevauchement de la liste, à la déclaration et en rejoignant', () => {
    expect(def('fboss_ids_busy')).toContain('public.fboss_boss_ids(b) && p_ids');
    expect(def('fboss_ids_busy')).toContain('now() < public.fboss_ended(b)');
    expect(def('fboss_same_exercise')).toContain(
      'public.fboss_ids_busy(p_uid, array[p_exercise_id])',
    );
    const r = def('fboss_respond');
    expect(r).toContain('public.fboss_ids_busy(v_uid, public.fboss_boss_ids(b))');
    expect(r).toContain("raise exception 'same_exercise'");
    expect(r).not.toContain('no_tokens');
    expect(r).toContain('public.fboss_share_tier(family, tier) * public.fboss_damage_per_unit()');
    expect(def('fboss_boss_ids')).toContain(
      "array(select e->>'id' from jsonb_array_elements(b.exercises) e)",
    );
  });

  it('coffre et bonus : la part se compte en POINTS pour un boss à choix, en reps sinon', () => {
    for (const fn of ['fboss_claim', 'fboss_claim_bonus']) {
      const c = def(fn);
      expect(c, fn).toContain(
        'case when public.fboss_is_multi(b) then coalesce(points, 0) else units end',
      );
      expect(c, fn).toContain('public.fboss_unit_scale(b)');
    }
    expect(def('fboss_unit_scale')).toContain(
      'case when public.fboss_is_multi(b) then public.fboss_mixed_scale() else 1 end',
    );
  });

  it('la notification « un ami a frappé » lit les dégâts en points d’un boss à choix', () => {
    const p = def('fboss_push_hit');
    expect(p).toContain('when new.points is not null');
    expect(p).toContain('(new.points - coalesce(new.surplus_points, 0))::bigint');
    expect(p).toContain('(v_dpu / public.fboss_mixed_scale())');
    // La formule d'avant, pour les frappes sans points.
    expect(p).toContain('(new.units - new.surplus)::bigint * v_dpu');
    expect(p).toContain('if v_after >= b.hp_total then return new; end if;');
    expect(p).toContain('m.user_id <> new.user_id');
    expect(p).toContain('on conflict (user_id, dedupe) do nothing');
  });

  it('droits : les deux nouvelles fonctions sont fermées à public et anon, ouvertes aux connectés', () => {
    expect(sql).toContain(
      'revoke all on function public.fboss_declare_multi(jsonb, uuid[], text) from public, anon;',
    );
    expect(sql).toContain(
      'revoke all on function public.fboss_hit_exo(uuid, integer, text) from public, anon;',
    );
    expect(sql).toContain(
      'grant execute on function public.fboss_declare_multi(jsonb, uuid[], text) to authenticated;',
    );
    expect(sql).toContain(
      'grant execute on function public.fboss_hit_exo(uuid, integer, text) to authenticated;',
    );
    for (const fn of [
      'fboss_declare_multi',
      'fboss_hit_exo',
      'fboss_respond',
      'fboss_hit',
      'fboss_claim',
    ])
      expect(def(fn), fn).toContain('security definer');
  });
});
