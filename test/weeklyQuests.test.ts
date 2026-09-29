import { describe, it, expect } from 'vitest';
import {
  weeklyQuests,
  questEntries,
  questTargets,
  weekStart,
  addDays,
  WEEKLY_QUESTS,
  parseQuestMark,
  questMark,
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

const quest = (s: QuestSources, kind: string, today = MON) =>
  weeklyQuests(s, today, null).quests.find((q) => q.kind === kind)!;

describe('🗓️ quêtes de la semaine — ce qui compte', () => {
  it('compte des JOURS distincts, pas des lignes', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) }, { performed_at: at(MON) });
    s.cardio.push({ performed_at: at(MON), payload: { duration_min: 30 } });
    expect(quest(s, 'active_days', addDays(MON, 3)).done).toBe(1);
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
    expect(questEntries(s)).toEqual([
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
    expect(questEntries(s).map((e) => [e.day, e.kind])).toEqual([
      [addDays(MON, 4), 'muscu'],
      [addDays(MON, 5), 'muscu'],
    ]);
  });
  it('la variété compte les pratiques différentes', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) });
    s.tennis.push({ performed_at: at(addDays(MON, 1)) });
    const v = quest(s, 'variety');
    expect(v.done).toBe(2);
    expect(v.complete).toBe(true);
  });
  it('⚠️ une sortie cardio ou du tennis ne comptent pas comme des jours de muscu', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) });
    s.cardio.push({ performed_at: at(addDays(MON, 1)), payload: { duration_min: 40 } });
    s.tennis.push({ performed_at: at(addDays(MON, 2)) });
    expect(quest(s, 'strength_days').done).toBe(1);
    expect(quest(s, 'tennis_days').done).toBe(1);
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
  it('⚠️ un « autre sport » nommé Tennis est du tennis ; le tennis de table non', () => {
    const s = empty();
    s.sessions.push(
      { performed_at: at(MON), payload: { discipline: 'autre_sport', name: 'Tennis' } },
      { performed_at: at(addDays(MON, 1)), payload: { discipline: 'autre_sport', name: 'Tennis de table' } },
      { performed_at: at(addDays(MON, 2)), payload: { discipline: 'autre_sport', name: ' tennis ' } },
    );
    expect(questEntries(s).map((e) => e.kind)).toEqual(['tennis', 'other', 'tennis']);
    expect(quest(s, 'tennis_days', addDays(MON, 6)).done).toBe(2);
  });
  it('la régularité compte les deux moitiés de la semaine', () => {
    const s = empty();
    s.sessions.push({ performed_at: at(MON) });
    expect(quest(s, 'regularity', addDays(MON, 6)).done).toBe(1);
    s.sessions.push({ performed_at: at(addDays(MON, 3)) });
    expect(quest(s, 'regularity', addDays(MON, 6)).complete).toBe(true);
  });
  it('rien d’avant lundi ni d’après dimanche', () => {
    const s = empty();
    s.sessions.push(
      { performed_at: at(addDays(MON, -1)) },
      { performed_at: at(addDays(MON, 7)) },
    );
    expect(quest(s, 'active_days').done).toBe(0);
  });
  it('la cible tennis suit l’historique', () => {
    const t = (days: number) => {
      const s = empty();
      for (let w = 1; w <= 4; w++)
        for (let d = 0; d < days; d++)
          s.tennis.push({ performed_at: at(addDays(MON, -7 * w + d)) });
      return questTargets(questEntries(s), MON).tennis_days;
    };
    expect(t(1)).toBe(2);
    expect(t(3)).toBe(3);
  });
});

describe('🗓️ quêtes de la semaine — tous les objectifs, tes sports en tête', () => {
  const kinds = (s: QuestSources) => weeklyQuests(s, MON, null).quests;

  it('les six objectifs, toujours, « jours actifs » en tête', () => {
    for (const s of [empty(), history(3, 0), history(0, 90), history(3, 60)]) {
      const q = kinds(s);
      expect(q).toHaveLength(6);
      expect(new Set(q.map((x) => x.kind)).size).toBe(6);
      expect(q[0]!.kind).toBe('active_days');
    }
  });
  it('100 % muscu : la muscu en tête, cardio/tennis/variété proposés en retrait', () => {
    const q = kinds(history(3, 0));
    expect(q.filter((x) => x.mine).map((x) => x.kind)).toEqual([
      'active_days',
      'strength_days',
      'regularity',
    ]);
    // Les objectifs « à toi » passent avant les autres.
    const firstExtra = q.findIndex((x) => !x.mine);
    expect(q.slice(firstExtra).every((x) => !x.mine)).toBe(true);
  });
  it('100 % cardio : la muscu n’est pas « à toi »', () => {
    const q = kinds(history(0, 90));
    expect(q.find((x) => x.kind === 'cardio_minutes')!.mine).toBe(true);
    expect(q.find((x) => x.kind === 'strength_days')!.mine).toBe(false);
  });
  it('la variété n’est « à toi » qu’à partir de deux sports pratiqués', () => {
    expect(kinds(history(3, 0)).find((x) => x.kind === 'variety')!.mine).toBe(false);
    expect(kinds(history(3, 60)).find((x) => x.kind === 'variety')!.mine).toBe(true);
  });
  it('une sortie isolée ne fait pas du cardio « ta » pratique', () => {
    const s = history(3, 0);
    s.cardio.push({ performed_at: at(addDays(MON, -20)), payload: { duration_min: 30 } });
    expect(kinds(s).find((x) => x.kind === 'cardio_minutes')!.mine).toBe(false);
  });
  it('⚠️ l’ordre ne bouge pas en route : la semaine en cours n’y entre pas', () => {
    const s = history(3, 0);
    const before = kinds(s).map((q) => [q.kind, q.mine]);
    for (let d = 0; d < 5; d++)
      s.cardio.push({ performed_at: at(addDays(MON, d)), payload: { duration_min: 40 } });
    expect(
      weeklyQuests(s, addDays(MON, 5), null).quests.map((q) => [q.kind, q.mine]),
    ).toEqual(before);
  });
});

describe('🗓️ quêtes de la semaine — les paliers de récompense', () => {
  /** Une semaine où `n` jours de muscu sont faits (et rien d'autre). */
  const week = (days: number, cardioMin = 0) => {
    const s = empty();
    for (let d = 0; d < days; d++) s.sessions.push({ performed_at: at(addDays(MON, d)) });
    if (cardioMin)
      s.cardio.push({ performed_at: at(addDays(MON, 6)), payload: { duration_min: cardioMin } });
    return s;
  };
  const tickets = (t: number) => WEEKLY_QUESTS.tiers.find((x) => x.tickets === t)!;

  it('les paliers : 2 → 1, 3 → 2 (les 2 d’avant), 5 → 3', () => {
    expect(WEEKLY_QUESTS.tiers.map((t) => [t.at, t.tickets])).toEqual([
      [2, 1],
      [3, 2],
      [5, 3],
    ]);
  });
  it('rien d’atteint, rien à prendre', () => {
    const b = weeklyQuests(empty(), MON, null);
    expect(b.doneCount).toBe(0);
    expect(b.earned).toBe(0);
    expect(b.claimable).toBe(0);
  });
  it('les tickets suivent le NOMBRE d’objectifs atteints, pas lesquels', () => {
    // Joueur neuf : jours actifs 2, muscu 1, régularité 2 moitiés.
    const two = weeklyQuests(week(2), addDays(MON, 6), null); // actifs + muscu
    expect(two.doneCount).toBe(2);
    expect(two.earned).toBe(tickets(1).tickets);
    const three = weeklyQuests(week(4), addDays(MON, 6), null); // + régularité
    expect(three.doneCount).toBe(3);
    expect(three.earned).toBe(2);
    const five = weeklyQuests(week(4, 60), addDays(MON, 6), null); // + cardio + variété
    expect(five.doneCount).toBe(5);
    expect(five.earned).toBe(3);
  });
  it('on récupère palier par palier, sans jamais payer deux fois', () => {
    const s = week(4, 60);
    const day = addDays(MON, 6);
    const b = weeklyQuests(s, day, questMark(MON, 1));
    expect(b.claimedTickets).toBe(1);
    expect(b.claimable).toBe(2);
    const all = weeklyQuests(s, day, questMark(MON, 3));
    expect(all.claimable).toBe(0);
    expect(all.complete).toBe(true);
  });
  it('la marque d’une AUTRE semaine ne compte pas', () => {
    const b = weeklyQuests(week(2), addDays(MON, 6), questMark(addDays(MON, -7), 3));
    expect(b.claimedTickets).toBe(0);
    expect(b.claimable).toBe(1);
  });
  it('⚠️ une marque d’avant les paliers (lundi seul) vaut les 2 tickets déjà pris', () => {
    expect(parseQuestMark(MON, MON)).toBe(2);
    expect(parseQuestMark(addDays(MON, -7), MON)).toBe(0);
    const b = weeklyQuests(week(4, 60), addDays(MON, 6), MON);
    expect(b.claimable).toBe(1); // seul le palier ajouté reste à prendre
  });
  it('une marque illisible ne donne pas de tickets en trop', () => {
    expect(parseQuestMark(`${MON}:abc`, MON)).toBe(0);
    expect(parseQuestMark(`${MON}:-4`, MON)).toBe(0);
    expect(parseQuestMark(null, MON)).toBe(0);
  });
});
