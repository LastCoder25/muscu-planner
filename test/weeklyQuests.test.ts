import { describe, it, expect } from 'vitest';
import {
  weeklyQuests,
  questEntries,
  questTargets,
  weekStart,
  addDays,
  WEEKLY_QUESTS,
  type QuestSources,
} from '@/lib/weeklyQuests';
import type { ComboChallenge } from '@/lib/combo';

const empty = (): QuestSources => ({
  sessions: [],
  cardio: [],
  tennis: [],
  challenges: [],
  combos: [],
  bossHits: [],
});
// Lundi 21 septembre 2026.
const MON = '2026-09-21';
const at = (d: string) => `${d}T10:00:00Z`;

/** Quatre semaines d'historique : `days` jours de muscu et `min` minutes de cardio par semaine. */
function history(days: number, min: number): QuestSources {
  const s = empty();
  for (let w = 1; w <= 4; w++) {
    const mon = addDays(MON, -7 * w);
    for (let d = 0; d < days; d++) s.sessions.push({ performed_at: at(addDays(mon, d)) });
    if (min) s.cardio.push({ performed_at: at(addDays(mon, 6)), payload: { duration_min: min } });
  }
  return s;
}

describe('🗓️ quêtes de la semaine — calendrier', () => {
  it('la semaine commence le lundi, quel que soit le jour', () => {
    for (let i = 0; i < 7; i++) expect(weekStart(addDays(MON, i))).toBe(MON);
    expect(weekStart(addDays(MON, 7))).toBe(addDays(MON, 7));
    expect(weekStart(addDays(MON, -1))).toBe(addDays(MON, -7));
  });
  it('à l’abri du fuseau : 365 jours consécutifs retombent sur un lundi', () => {
    for (let i = 0; i < 365; i++) {
      const w = weekStart(addDays('2026-01-01', i));
      expect(new Date(`${w}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });
});

describe('🗓️ quêtes de la semaine — les cibles suivent l’historique', () => {
  it('un débutant sans historique a des cibles accessibles', () => {
    const t = questTargets([], MON);
    expect(t.active_days).toBe(2);
    expect(t.strength_days).toBe(1);
    expect(t.cardio_minutes).toBe(WEEKLY_QUESTS.cardioMin);
    expect(t.variety).toBe(2);
  });
  it('un cran au-dessus d’une moyenne modeste, jamais au-delà de 6 jours', () => {
    expect(questTargets(questEntries(history(2, 0)), MON).active_days).toBe(3); // 2 jours/sem → +1
    expect(questTargets(questEntries(history(3, 60)), MON).active_days).toBe(4); // 4 jours actifs (3 muscu + 1 sortie) → pas de +1
    expect(questTargets(questEntries(history(7, 0)), MON).active_days).toBe(6);
  });
  it('les minutes de sortie : moyenne × marge, arrondie à la dizaine SUPÉRIEURE', () => {
    expect(questTargets(questEntries(history(0, 100)), MON).cardio_minutes).toBe(120);
    expect(questTargets(questEntries(history(0, 1000)), MON).cardio_minutes).toBe(
      WEEKLY_QUESTS.cardioMax,
    );
  });
  it('⚠️ la semaine EN COURS ne compte pas dans les cibles (elles ne bougent pas en route)', () => {
    const s = history(2, 0);
    const before = questTargets(questEntries(s), MON);
    for (let d = 0; d < 7; d++) s.sessions.push({ performed_at: at(addDays(MON, d)) });
    expect(questTargets(questEntries(s), MON)).toEqual(before);
  });
});

describe('🗓️ quêtes de la semaine — ce qui compte', () => {
  it('compte des JOURS distincts, pas des lignes', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) }, { performed_at: at(MON) });
    s.cardio.push({ performed_at: at(MON), payload: { duration_min: 30 } });
    const b = weeklyQuests(s, addDays(MON, 3), 'u', null);
    expect(b.quests.find((q) => q.kind === 'active_days')!.done).toBe(1);
  });
  it('une journée de défi VIDE ne compte pas ; un défi de sortie compte en cardio', () => {
    const s = empty();
    s.challenges.push({
      unit: 'reps',
      exercise_id: 'ex_pushup',
      progress: [
        { date: MON, done: 0 },
        { date: addDays(MON, 1), done: 20 },
      ],
    });
    s.challenges.push({
      unit: 'distance',
      exercise_id: 'ex_ch_marche_course',
      progress: [{ date: addDays(MON, 2), done: 3 }],
    });
    const e = questEntries(s);
    expect(e).toEqual([
      { day: addDays(MON, 1), kind: 'muscu', minutes: 0 },
      { day: addDays(MON, 2), kind: 'cardio', minutes: 0 },
    ]);
  });
  it('le Défi 360 et le boss entre amis rendent actif (muscu)', () => {
    const s = empty();
    s.combos.push({
      legs: [{ sets: [{ reps: 10, date: addDays(MON, 4) }] }],
    } as unknown as ComboChallenge);
    s.bossHits.push({ createdAt: Date.parse(at(addDays(MON, 5))) });
    const days = questEntries(s).map((e) => [e.day, e.kind]);
    expect(days).toEqual([
      [addDays(MON, 4), 'muscu'],
      [addDays(MON, 5), 'muscu'],
    ]);
  });
  it('la variété compte les pratiques différentes', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) });
    s.tennis.push({ performed_at: at(addDays(MON, 1)) });
    // La variété n'est pas toujours tirée : on la cherche sur plusieurs joueurs.
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) {
      const v = weeklyQuests(s, MON, 'u' + i, null).quests.find((q) => q.kind === 'variety');
      if (v) {
        seen = true;
        expect(v.done).toBe(2);
        expect(v.complete).toBe(true);
      }
    }
    expect(seen).toBe(true);
  });
  it('⚠️ une sortie cardio ne compte pas comme un jour de muscu', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) });
    s.cardio.push({ performed_at: at(addDays(MON, 1)), payload: { duration_min: 40 } });
    s.tennis.push({ performed_at: at(addDays(MON, 2)) });
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) {
      const q = weeklyQuests(s, MON, 'u' + i, null).quests.find((x) => x.kind === 'strength_days');
      if (q) {
        seen = true;
        expect(q.done).toBe(1);
      }
    }
    expect(seen).toBe(true);
  });
  it('rien d’avant lundi ni d’après dimanche', () => {
    const s = empty();
    s.sessions.push(
      { performed_at: at(addDays(MON, -1)) },
      { performed_at: at(addDays(MON, 7)) },
    );
    expect(weeklyQuests(s, MON, 'u', null).quests[0]!.done).toBe(0);
  });
});

describe('🗓️ quêtes de la semaine — le tableau et la récompense', () => {
  it('3 quêtes, « jours actifs » toujours, les deux autres fixes pour la semaine', () => {
    for (const u of ['a', 'b', 'c', 'd']) {
      const b1 = weeklyQuests(empty(), MON, u, null);
      const b2 = weeklyQuests(empty(), addDays(MON, 6), u, null);
      expect(b1.quests).toHaveLength(3);
      expect(b1.quests[0]!.kind).toBe('active_days');
      expect(new Set(b1.quests.map((q) => q.kind)).size).toBe(3);
      expect(b2.quests.map((q) => q.kind)).toEqual(b1.quests.map((q) => q.kind));
    }
  });
  it('les deux quêtes tirées varient d’un joueur à l’autre', () => {
    const sets = new Set<string>();
    for (let i = 0; i < 30; i++)
      sets.add(
        weeklyQuests(empty(), MON, 'joueur' + i, null)
          .quests.map((q) => q.kind)
          .join(','),
      );
    expect(sets.size).toBeGreaterThan(1);
  });
  it('les trois bouclées → 2 tickets, une seule fois par semaine', () => {
    const s = empty();
    for (let d = 0; d < 6; d++) {
      s.sessions.push({ performed_at: at(addDays(MON, d)) });
      s.cardio.push({ performed_at: at(addDays(MON, d)), payload: { duration_min: 60 } });
    }
    const b = weeklyQuests(s, addDays(MON, 6), 'u', null);
    expect(b.complete).toBe(true);
    expect(b.claimable).toBe(WEEKLY_QUESTS.tickets);
    expect(WEEKLY_QUESTS.tickets).toBe(2);
    const again = weeklyQuests(s, addDays(MON, 6), 'u', MON);
    expect(again.claimed).toBe(true);
    expect(again.claimable).toBe(0);
    // La semaine d'avant récupérée n'empêche pas celle-ci.
    expect(weeklyQuests(s, MON, 'u', addDays(MON, -7)).claimable).toBe(2);
  });
  it('une semaine pas bouclée ne paie rien', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) });
    const b = weeklyQuests(s, MON, 'u', null);
    expect(b.complete).toBe(false);
    expect(b.claimable).toBe(0);
  });
});

describe('🗓️ quêtes de la semaine — elles suivent TA pratique', () => {
  /** Les deux quêtes tirées, sur plusieurs joueurs (le tirage dépend de la graine). */
  const drawn = (s: QuestSources) => {
    const all = new Set<string>();
    for (let i = 0; i < 40; i++)
      for (const q of weeklyQuests(s, MON, 'j' + i, null).quests.slice(1)) all.add(q.kind);
    return all;
  };
  const tennisHistory = (days: number): QuestSources => {
    const s = empty();
    for (let w = 1; w <= 4; w++)
      for (let d = 0; d < days; d++) s.tennis.push({ performed_at: at(addDays(MON, -7 * w + d)) });
    return s;
  };

  it('100 % muscu : jamais de cardio ni de variété imposés', () => {
    expect(drawn(history(3, 0))).toEqual(new Set(['strength_days', 'regularity']));
  });
  it('100 % cardio : jamais de quête muscu', () => {
    expect(drawn(history(0, 90))).toEqual(new Set(['cardio_minutes', 'regularity']));
  });
  it('100 % tennis : une quête tennis, jamais muscu ni cardio', () => {
    const d = drawn(tennisHistory(2));
    expect(d).toEqual(new Set(['tennis_days', 'regularity']));
  });
  it('muscu + cardio : leurs deux quêtes et la variété, rien d’autre', () => {
    expect(drawn(history(3, 60))).toEqual(new Set(['strength_days', 'cardio_minutes', 'variety']));
  });
  it('joueur neuf : la découverte d’avant', () => {
    expect(drawn(empty())).toEqual(new Set(['strength_days', 'cardio_minutes', 'variety']));
  });
  it('une sortie isolée ne suffit pas à faire du cardio « ta » pratique', () => {
    const s = history(3, 0);
    s.cardio.push({ performed_at: at(addDays(MON, -20)), payload: { duration_min: 30 } });
    expect(drawn(s).has('cardio_minutes')).toBe(false);
  });
  it('⚠️ le tirage ne bouge pas en route : la semaine en cours n’y entre pas', () => {
    const s = history(3, 0);
    const before = weeklyQuests(s, MON, 'u', null).quests.map((q) => q.kind);
    for (let d = 0; d < 5; d++)
      s.cardio.push({ performed_at: at(addDays(MON, d)), payload: { duration_min: 40 } });
    expect(weeklyQuests(s, addDays(MON, 5), 'u', null).quests.map((q) => q.kind)).toEqual(before);
  });
  it('toujours 3 quêtes distinctes, quelle que soit la pratique', () => {
    const cases = [empty(), history(3, 0), history(0, 90), history(3, 60), tennisHistory(2)];
    const other = empty();
    for (let w = 1; w <= 4; w++)
      other.sessions.push({
        performed_at: at(addDays(MON, -7 * w)),
        payload: { discipline: 'autre_sport' },
      });
    cases.push(other);
    for (const s of cases)
      for (let i = 0; i < 10; i++) {
        const k = weeklyQuests(s, MON, 'x' + i, null).quests.map((q) => q.kind);
        expect(k).toHaveLength(3);
        expect(new Set(k).size).toBe(3);
      }
  });
  it('« autre sport » et prépa physique ne sont pas des jours de muscu', () => {
    const s = empty();
    s.sessions.push(
      { performed_at: at(MON), payload: { discipline: 'autre_sport' } },
      { performed_at: at(addDays(MON, 1)), payload: { discipline: 'prepa_physique' } },
      { performed_at: at(addDays(MON, 2)), payload: { discipline: 'musculation' } },
    );
    expect(questEntries(s).map((e) => e.kind)).toEqual(['other', 'tennis', 'muscu']);
  });
  it('la régularité compte les deux moitiés de la semaine', () => {
    const s = history(3, 0);
    s.sessions.push({ performed_at: at(MON) });
    const reg = () => {
      for (let i = 0; i < 40; i++) {
        const q = weeklyQuests(s, addDays(MON, 6), 'r' + i, null).quests.find(
          (x) => x.kind === 'regularity',
        );
        if (q) return q;
      }
      throw new Error('régularité jamais tirée');
    };
    expect(reg().done).toBe(1);
    s.sessions.push({ performed_at: at(addDays(MON, 3)) });
    expect(reg().done).toBe(2);
    expect(reg().complete).toBe(true);
  });
  it('la cible tennis suit l’historique', () => {
    expect(questTargets(questEntries(tennisHistory(1)), MON).tennis_days).toBe(2);
    expect(questTargets(questEntries(tennisHistory(3)), MON).tennis_days).toBe(3);
  });
});
