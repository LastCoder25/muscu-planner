import { describe, it, expect } from 'vitest';
import {
  exoAvailability,
  exoSelectable,
  fractionOnly,
  occupantReason,
  occupantsOf,
  type Occupant,
} from '@/lib/exoExclusivity';
import {
  fractionAllowed,
  isFractionChallenge,
  challengeXpPoints,
  type Challenge,
} from '@/lib/challenges';
import { comboXpPoints, exerciseHistorySets, type ComboChallenge } from '@/lib/combo';
import { doneVolume, weekMuscleSeries } from '@/lib/bodyBalance';

function ch(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c' + Math.random(),
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    muscle_primary: 'dos',
    rep_weight: 1.3,
    unit: 'reps',
    format: 'fixed',
    duration_days: 7,
    start_date: '2026-11-02',
    config: { start: 10 },
    daily_targets: [10, 10, 10, 10, 10, 10, 10],
    progress: [],
    status: 'active',
    ...over,
  } as Challenge;
}
const fracCh = (over: Partial<Challenge> = {}) =>
  ch({ config: { start: 10, fraction: true }, ...over });
const openCh = (over: Partial<Challenge> = {}) =>
  ch({ format: 'open', config: { start: 0 }, ...over });
function combo(ids: string[], over: Partial<ComboChallenge> = {}): ComboChallenge {
  return {
    id: 'k',
    name: 'Défi 360',
    status: 'active',
    start_date: '2026-11-02',
    duration_days: 7,
    legs: ids.map((id) => ({
      slot: 'pull',
      exercise_id: id,
      exercise_name: id,
      rep_weight: 1,
      target: 10,
      count_mode: 'sets',
      sets: [],
    })),
    ...over,
  } as unknown as ComboChallenge;
}
const occ = (cs: Challenge[], ks: ComboChallenge[] = []) => occupantsOf(cs, ks);

describe('🔓 l’exclusivité des exos et son exception pour le fractionné', () => {
  it('sans occupant : tout est libre, dans les deux modes', () => {
    const a = exoAvailability('ex_pullup', []);
    expect(a).toEqual({ fractionable: true, classic: null, fraction: null });
    expect(exoSelectable(a)).toBe(true);
    expect(fractionOnly(a)).toBe(false);
  });
  it('un Défi 360 qui a les tractions : un challenge n’est possible qu’en FRACTIONNÉ', () => {
    const a = exoAvailability('ex_pullup', occ([], [combo(['ex_pullup'])]));
    expect(a.classic).toMatchObject({ source: 'combo', kind: 'classic' });
    expect(a.fraction).toBeNull();
    expect(exoSelectable(a)).toBe(true);
    expect(fractionOnly(a)).toBe(true);
  });
  it('un challenge FRACTIONNÉ qui a les tractions : le 360 (classique) peut les prendre', () => {
    for (const c of [fracCh(), openCh()]) {
      const a = exoAvailability('ex_pullup', occ([c]));
      expect(a.classic).toBeNull(); // le 360 / un challenge classique passe
      expect(a.fraction).toMatchObject({ source: 'challenge', kind: 'fraction' });
    }
  });
  it('deux défis CLASSIQUES sur le même exo : toujours refusés (360 ou challenge)', () => {
    expect(exoAvailability('ex_pullup', occ([ch()])).classic).not.toBeNull();
    expect(exoAvailability('ex_pullup', occ([], [combo(['ex_pullup'])])).classic).not.toBeNull();
  });
  it('deux challenges FRACTIONNÉS sur le même exo : refusés — une prise irait dans lequel ?', () => {
    expect(exoAvailability('ex_pullup', occ([fracCh()])).fraction).not.toBeNull();
    expect(exoAvailability('ex_pullup', occ([openCh()])).fraction).not.toBeNull();
  });
  it('un exo pris des deux façons n’est plus sélectionnable du tout', () => {
    const a = exoAvailability('ex_pullup', occ([fracCh()], [combo(['ex_pullup'])]));
    expect(a.classic && a.fraction).toBeTruthy();
    expect(exoSelectable(a)).toBe(false);
  });
  it('la FAMILLE de variantes reste la maille : tractions prise neutre = tractions', () => {
    const c = occ([fracCh()]);
    expect(exoAvailability('ex_chinup', c).fraction).not.toBeNull();
    expect(exoAvailability('ex_chinup', c).classic).toBeNull();
    expect(exoAvailability('ex_dips', c).fraction).toBeNull(); // un autre mouvement
  });
  it('un exo qui NE se fractionne pas garde l’exclusivité telle quelle, fractionné ou non', () => {
    const squat = ch({ exercise_id: 'ex_squat_barbell', exercise_name: 'Squat' });
    const a = exoAvailability('ex_squat_barbell', occ([squat]));
    expect(a.fractionable).toBe(false);
    expect(a.classic).not.toBeNull();
    expect(exoSelectable(a)).toBe(false);
    // Le tirage vertical (famille des tractions, mais chargé) n'a pas l'exception : un
    // challenge fractionné sur les tractions l'occupe, comme avant.
    const lat = exoAvailability('ex_lat_pulldown', occ([fracCh()]));
    expect(lat.fractionable).toBe(false);
    expect(exoSelectable(lat)).toBe(false);
  });
  it('seuls les défis ACTIFS occupent un exo', () => {
    expect(
      occ(
        [fracCh({ status: 'done' }), ch({ status: 'abandoned' })],
        [combo(['ex_pullup'], { status: 'done' })],
      ),
    ).toEqual([]);
  });
  it('la raison dit QUI occupe l’exo (jamais un grisé muet)', () => {
    const [k] = occ([], [combo(['ex_pullup'])]);
    expect(occupantReason(k!)).toBe('déjà dans ton Défi 360');
    const [c] = occ([ch()]);
    expect(occupantReason(c!)).toBe('déjà dans ton challenge « Tractions »');
    const [f] = occ([fracCh()]);
    expect(occupantReason(f!)).toBe('déjà dans ton challenge fractionné « Tractions »');
  });
});

describe('🔁 ce qui rend un challenge « fractionné »', () => {
  it('config.fraction, ou le format Découverte (fractionné par nature)', () => {
    expect(isFractionChallenge(ch())).toBe(false);
    expect(isFractionChallenge(fracCh())).toBe(true);
    expect(isFractionChallenge(openCh())).toBe(true);
  });
  it('« +1 » n’est offert que sur un défi fractionné… ou qui contient déjà des prises (hérité)', () => {
    expect(fractionAllowed(ch())).toBe(false);
    expect(fractionAllowed(fracCh())).toBe(true);
    expect(fractionAllowed(openCh())).toBe(true);
    const legacy = ch({
      progress: [
        {
          day: 0,
          date: '2026-11-02',
          target: 10,
          done: 1,
          elapsed_sec: 0,
          completed: false,
          sets: [{ reps: 1, mini: true }],
        },
      ],
    });
    expect(fractionAllowed(legacy)).toBe(true);
    // Jamais en séries ni sur un exo qui ne se fractionne pas.
    expect(
      fractionAllowed(fracCh({ config: { start: 3, fraction: true, count_mode: 'sets' } })),
    ).toBe(false);
    expect(fractionAllowed(fracCh({ exercise_id: 'ex_squat_barbell' }))).toBe(false);
  });
});

describe('🧮 un 360 ET un challenge fractionné sur le même exo : deux efforts, deux comptes', () => {
  const D = '2026-11-03';
  const takes = fracCh({
    progress: [
      {
        day: 1,
        date: D,
        target: 10,
        done: 30,
        elapsed_sec: 0,
        completed: true,
        sets: Array.from({ length: 30 }, () => ({ reps: 1, mini: true as const })),
      },
    ],
  });
  const k = combo(['ex_pullup']);
  k.legs[0]!.count_mode = 'reps';
  k.legs[0]!.target = 60;
  k.legs[0]!.muscle_primary = 'dos';
  k.legs[0]!.sets = [
    { date: D, reps: 10 },
    { date: D, reps: 10 },
    { date: D, reps: 10 },
  ];
  it('l’équilibre du corps additionne les deux : 30 reps de prises + 30 reps de 360 = 6 séries', () => {
    const base = {
      sessions: [],
      bossHits: [],
      objective: null,
      secondaries: () => undefined,
      primaries: () => undefined,
    };
    const only = (c: Challenge[], ks: ComboChallenge[]) =>
      doneVolume({ ...base, combos: ks, challenges: c } as never, D, '2026-11-10').totalSets;
    expect(only([takes], [])).toBeCloseTo(3, 5);
    expect(only([], [k])).toBeCloseTo(3, 5);
    expect(only([takes], [k])).toBeCloseTo(6, 5);
  });
  it('l’objectif engagé : chaque défi garde le sien, sans dédoublonnage ni double saisie', () => {
    const i = {
      sessions: [],
      bossHits: [],
      objective: null,
      secondaries: () => undefined,
      primaries: () => undefined,
      today: '2026-11-04',
    };
    const both = weekMuscleSeries({ ...i, combos: [k], challenges: [takes] } as never);
    const c = weekMuscleSeries({ ...i, combos: [], challenges: [takes] } as never);
    const kk = weekMuscleSeries({ ...i, combos: [k], challenges: [] } as never);
    expect(c.challenges.dos).toBeGreaterThan(0);
    expect(kk.combo.dos).toBeGreaterThan(0);
    // Deux engagements distincts (reps différentes, saisies à part) : ils s'additionnent.
    expect(both.challenges.dos).toBe(c.challenges.dos);
    expect(both.combo.dos).toBe(kk.combo.dos);
    expect(both.real.dos).toBeCloseTo((c.real.dos ?? 0) + (kk.real.dos ?? 0), 5);
  });
  it('l’XP est la somme des deux (aucun recoupement)', () => {
    const a = challengeXpPoints([takes]);
    const b = comboXpPoints([k]);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    // Même exo, deux défis : chacun garde son propre calcul.
    expect(challengeXpPoints([takes, takes])).toBe(2 * a);
  });
  it('l’historique d’un défi ne se mélange pas à celui de l’autre', () => {
    // Le 360 ne lit que ses propres séries (jamais les prises du challenge).
    expect(exerciseHistorySets([k], 'ex_pullup')).toHaveLength(3);
    expect(exerciseHistorySets([combo(['ex_pullup'])], 'ex_pullup')).toHaveLength(0);
  });
});

describe('🔒 types', () => {
  it('Occupant est exporté sans autre dépendance qu’un nom et une famille', () => {
    const o: Occupant = { family: 'ex_pullup', kind: 'fraction', source: 'challenge', name: 'x' };
    expect(o.kind).toBe('fraction');
  });
});

// ── Câblage : les trois écrans lisent la règle de la lib, pas leur propre copie ──────────────
import { readFileSync } from 'node:fs';
const src = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('🔌 les écrans appliquent la règle unique', () => {
  it('le wizard du 360 : un challenge classique bloque un exo, un challenge fractionné non', () => {
    const s = src('src/pages/ComboNewPage.vue');
    expect(s).toContain('exoAvailability(exerciseId, challengeOccupants.value).classic');
    expect(s).toContain('!takenByChallenge(e.id)');
    expect(s).toContain('selectedIds.some((id) => takenByChallenge(id))');
    expect(s).not.toContain('challengeFamilies');
  });
  it('le changement d’exo du 360 suit la même règle', () => {
    const s = src('src/components/ComboSwapSheet.vue');
    expect(s).toContain('!exoAvailability(e.id, occ).classic');
  });
  it('le wizard challenge : liste, modes, garde de création, drapeau et « Relever un défi »', () => {
    const s = src('src/pages/ChallengeNewPage.vue');
    expect(s).toContain('exoSelectable(availOf(e)) &&');
    expect(s).not.toContain('activeExoFamilies');
    expect(s).toContain('fractionMode.value = fractionOnly(availOf(e));');
    expect(s).toContain(
      'fractioned && avail.value?.fractionable\n      ? avail.value.fraction\n      : (avail.value?.classic ?? null)',
    );
    expect(s).toContain('if (fractionMode.value && canFraction.value) cfg.fraction = true;');
    expect(s).toContain("route.query.frac === '1'");
    expect(src('src/components/OpenChallengeView.vue')).toContain("frac: '1'");
  });
});
