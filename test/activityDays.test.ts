// 📅 Ce qui compte comme « avoir fait du sport » — et pour qui.
//
// ⚠️ Ce fichier existe à cause d'un défaut réel : le rythme des sièges ne regardait que
// les SÉANCES enregistrées, si bien qu'un joueur qui ne s'entraîne qu'au Défi 360 était
// compté à zéro — donc jamais attaqué du tout (`raidsEnabled` exige un jour actif).
import { describe, it, expect } from 'vitest';
import { activeDaysSince, type ActivitySources } from '@/lib/activityDays';
import { raidsEnabled, raidIntervalMs, type BaseState } from '@/lib/raid';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';

const vide: ActivitySources = {
  sessions: [],
  cardio: [],
  tennis: [],
  challenges: [],
  combos: [],
};
const leg = (dates: string[], reps = 12): ComboLeg =>
  ({
    slot: 'push',
    exercise_id: 'ex',
    exercise_name: 'Pompes',
    rep_weight: 1,
    target: 12,
    sets: dates.map((date) => ({ date, reps, weight: null })),
  }) as ComboLeg;
const combo = (legs: ComboLeg[]): ComboChallenge =>
  ({
    id: 'c',
    name: '360',
    start_date: '2026-09-01',
    duration_days: 7,
    status: 'active',
    legs,
  }) as ComboChallenge;

describe('un joueur qui ne fait QUE du Défi 360', () => {
  it('⚠️ est compté actif — et se fait donc bien attaquer', () => {
    const src: ActivitySources = {
      ...vide,
      combos: [combo([leg(['2026-09-08', '2026-09-10']), leg(['2026-09-10', '2026-09-11'])])],
    };
    expect(activeDaysSince(src, '2026-09-05')).toBe(3);

    // La conséquence, bout en bout : c'est ce nombre qui allume les sièges.
    const base = {
      defenses: [
        { typeId: 'wall', level: 26 },
        { typeId: 'turret', level: 26 },
      ],
    } as BaseState;
    expect(raidsEnabled(base, activeDaysSince(src, '2026-09-05'), 26)).toBe(true);
    // ⚠️ Et l'assertion qui donne son sens à la précédente : à zéro jour actif, personne
    // ne vient — c'est exactement l'état où ce joueur se trouvait.
    expect(raidsEnabled(base, 0, 26)).toBe(false);
  });

  it('… et son rythme suit son assiduité, comme celui d’un joueur en séances', () => {
    // Deux pratiques différentes, le même nombre de jours → le même délai. C'est tout
    // l'objet du changement : le rythme regarde l'ENTRAÎNEMENT, pas sa forme.
    const jours = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
    const enSeances: ActivitySources = {
      ...vide,
      sessions: jours.map((d) => ({ performed_at: d })),
    };
    const en360: ActivitySources = { ...vide, combos: [combo([leg(jours)])] };
    expect(activeDaysSince(en360, '2026-09-05')).toBe(activeDaysSince(enSeances, '2026-09-05'));
  });
});

describe('ce qu’on compte, et ce qu’on ne compte pas', () => {
  it('⚠️ des JOURS, pas des lignes : dix séries dans la journée valent un jour', () => {
    // Sans ça, une journée de 360 vaudrait dix séances et le rythme s'emballerait.
    const dix = Array.from({ length: 10 }, () => '2026-09-10');
    expect(activeDaysSince({ ...vide, combos: [combo([leg(dix)])] }, '2026-09-05')).toBe(1);
  });

  it('⚠️ CHAQUE pratique rend actif à elle seule', () => {
    // ⚠️ Test ajouté après une mutation passée au VERT : le test du "pas de double
    // comptage" met les trois sources le même jour, donc en retirer une n'y change rien.
    // Il faut les éprouver SÉPARÉMENT, sinon une source peut disparaître en silence.
    const j = [{ performed_at: '2026-09-10' }];
    expect(activeDaysSince({ ...vide, sessions: j }, '2026-09-05')).toBe(1);
    expect(activeDaysSince({ ...vide, cardio: j }, '2026-09-05')).toBe(1);
    expect(activeDaysSince({ ...vide, tennis: j }, '2026-09-05')).toBe(1);
    expect(
      activeDaysSince(
        { ...vide, challenges: [{ progress: [{ date: '2026-09-10', done: 5 }] }] },
        '2026-09-05',
      ),
    ).toBe(1);
    expect(activeDaysSince({ ...vide, combos: [combo([leg(['2026-09-10'])])] }, '2026-09-05')).toBe(
      1,
    );
  });

  it('⚠️ une même journée sur DEUX pratiques ne compte pas double', () => {
    const src: ActivitySources = {
      ...vide,
      sessions: [{ performed_at: '2026-09-10T18:00:00Z' }],
      cardio: [{ performed_at: '2026-09-10' }],
      tennis: [{ performed_at: '2026-09-10' }],
    };
    expect(activeDaysSince(src, '2026-09-05')).toBe(1);
  });

  it('⚠️ une journée de défi MANQUÉE ne rend pas actif', () => {
    // Les journées d'un défi sont créées à l'avance et clôturées même vides : compter
    // leur simple existence rendrait actif un joueur qui n'a rien fait.
    const src: ActivitySources = {
      ...vide,
      challenges: [
        {
          progress: [
            { date: '2026-09-08', done: 0 },
            { date: '2026-09-09', done: 40 },
          ],
        },
      ],
    };
    expect(activeDaysSince(src, '2026-09-05')).toBe(1);
  });

  it('ne regarde pas au-delà de la fenêtre, et encaisse une date absente', () => {
    const src: ActivitySources = {
      ...vide,
      sessions: [{ performed_at: '2026-08-30' }, { performed_at: null }, { performed_at: '' }],
      combos: [combo([leg(['2026-09-10'])])],
    };
    expect(activeDaysSince(src, '2026-09-05')).toBe(1);
  });

  it('le seuil est INCLUSIF : le jour de la borne compte', () => {
    expect(
      activeDaysSince({ ...vide, sessions: [{ performed_at: '2026-09-05' }] }, '2026-09-05'),
    ).toBe(1);
  });
});

describe('le rythme reste celui que la base promet', () => {
  it('plus on s’entraîne, plus souvent on est attaqué', () => {
    // Non-régression : le changement porte sur QUI est compté actif, jamais sur la courbe.
    expect(raidIntervalMs(7)).toBeLessThan(raidIntervalMs(0));
  });
});
