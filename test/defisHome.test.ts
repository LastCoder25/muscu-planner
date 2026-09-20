import { describe, it, expect } from 'vitest';
import { defisSummary } from '@/lib/defisHome';
import type { Challenge } from '@/lib/challenges';
import type { ComboChallenge } from '@/lib/combo';

const TODAY = '2026-09-20';

function ch(over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    exercise_id: 'ex_ch_pompes',
    exercise_name: 'Pompes',
    unit: 'reps',
    format: 'fixed',
    start_date: TODAY,
    duration_days: 7,
    daily_targets: [20, 20, 20, 20, 20, 20, 20],
    progress: [],
    status: 'active',
    config: {},
    ...over,
  } as Challenge;
}

/** ⚠️ `series` = un NOMBRE DE SÉRIES, pas de reps : en mode « sets » (le défaut) chaque
 *  entrée de `progress` EST une série. Un premier jet mettait `reps: 12` dans UNE entrée
 *  et comptait donc 1 série — le fixture mentait, pas le code. */
function leg(target: number, series: number) {
  return {
    slot: 'push',
    exercise_id: 'e',
    exercise_name: 'Pompes',
    rep_weight: 1,
    target,
    progress: Array.from({ length: series }, () => ({ date: TODAY, reps: 10 })),
  };
}
function combo(over: Partial<ComboChallenge> = {}): ComboChallenge {
  return {
    id: 'k1',
    name: 'Full-body',
    start_date: TODAY,
    duration_days: 7,
    status: 'active',
    // ⚠️ 10/10 est PILE à l'objectif mais PAS au palier maximal (12) : sans ce cas, « on
    // compte ce qui n'est pas au max » et « on compte ce qui n'est pas bouclé » rendent le
    // même chiffre et le test ne distingue rien (mutation survivante).
    legs: [leg(10, 0), leg(10, 12), leg(10, 5), leg(10, 10)],
    config: {},
    ...over,
  } as ComboChallenge;
}

describe('🔥 CE QUE LA GRANDE TUILE ANNONCE', () => {
  it('⚠️ ON NE COMPTE QUE CE QUI APPELLE — ni terminé, ni abandonné', () => {
    // Un défi clos n'a plus rien à demander : le compter gonflerait un nombre qui doit
    // vouloir dire « il y a à faire ».
    const s = defisSummary(
      [ch(), ch({ id: 'c2', status: 'done' }), ch({ id: 'c3', status: 'abandoned' })],
      [],
      TODAY,
    );
    expect(s.active).toBe(1);
  });

  it('« à faire aujourd’hui » = l’objectif du JOUR n’est pas atteint', () => {
    const fait = ch({ id: 'c2', progress: [{ date: TODAY, day: 0, done: 20 }] } as never);
    const s = defisSummary([ch(), fait], [], TODAY);
    expect(s.active).toBe(2);
    expect(s.dueToday).toBe(1);
  });

  it('⚠️ UN DÉFI ENTAMÉ À MOITIÉ APPELLE ENCORE — la règle du badge a changé', () => {
    // L'ancien badge du header comptait « pas encore TOUCHÉ aujourd'hui » : 5 reps sur 20
    // le faisaient disparaître, alors qu'il reste 15 à faire. Le libellé dit « à faire ».
    const partiel = ch({ progress: [{ date: TODAY, day: 0, done: 5 }] } as never);
    expect(defisSummary([partiel], [], TODAY).dueToday).toBe(1);
    const fini = ch({ progress: [{ date: TODAY, day: 0, done: 20 }] } as never);
    expect(defisSummary([fini], [], TODAY).dueToday).toBe(0);
  });

  it('⚠️ un jour de REPOS n’appelle pas — et une date HORS PÉRIODE non plus', () => {
    // La propriété vit ici plutôt que dans un garde `todayTarget > 0`, qui serait dormant :
    // « fait < objectif » l'implique déjà, puisqu'on ne peut pas faire un nombre négatif.
    const repos = ch({ daily_targets: [0, 20, 20, 20, 20, 20, 20] });
    expect(defisSummary([repos], [], TODAY).dueToday).toBe(0);
    const futur = ch({ start_date: '2027-01-01' });
    expect(defisSummary([futur], [], TODAY).dueToday).toBe(0);
    const passe = ch({ start_date: '2020-01-01' });
    expect(defisSummary([passe], [], TODAY).dueToday).toBe(0);
  });

  it('le 360 : son nom, son avancement, et ce qu’il RESTE à travailler', () => {
    const s = defisSummary([], [combo()], TODAY);
    expect(s.combo?.name).toBe('Full-body');
    // ⚠️ Le palier MAXIMAL (120 %), pas l'objectif : la zone bonus compte et paie (v0.647),
    // donc un exo PILE à 100 % a encore de quoi faire. Seul le 12/10 est au max, donc il
    // reste 3 exos — dont celui qui a bouclé son objectif.
    expect(s.combo?.left).toBe(3);
    expect(s.combo?.pct).toBeGreaterThan(0);
    expect(Number.isInteger(s.combo?.pct)).toBe(true);
  });

  it('⚠️ un 360 ABANDONNÉ ou hors période n’est plus « en cours »', () => {
    // ⚠️ Un abandon est DÉFINITIF ; un 360 marqué « done » dont la période court encore est
    // au contraire ROUVERT (v0.825) — le statut stocké ne fait pas foi, et c'est voulu.
    expect(defisSummary([], [combo({ status: 'abandoned' })], TODAY).combo).toBeNull();
    // Sa période est passée : `activeCombo` recalcule le statut plutôt que de lire le
    // champ stocké — un 360 périmé ne doit pas rester affiché comme actif (v0.905).
    expect(defisSummary([], [combo({ start_date: '2026-01-01' })], TODAY).combo).toBeNull();
    // …et le 360 encore en période reste bien là, lui.
    expect(defisSummary([], [combo({ status: 'done' })], TODAY).combo).not.toBeNull();
  });

  it('rien du tout : des zéros et un 360 absent, jamais une erreur', () => {
    const s = defisSummary([], [], TODAY);
    expect(s).toEqual({ active: 0, dueToday: 0, combo: null });
  });
});
