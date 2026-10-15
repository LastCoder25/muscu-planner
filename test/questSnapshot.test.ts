import { describe, it, expect } from 'vitest';
import { weeklyQuests, addDays, type QuestSources } from '@/lib/weeklyQuests';
import { questSnapshot, readQuestSnapshot } from '@/lib/questSnapshot';

const MON = '2026-09-21';
const empty = (): QuestSources => ({
  sessions: [],
  cardio: [],
  tennis: [],
  challenges: [],
  combos: [],
  bossHits: [],
});
/** 4 semaines de muscu 3 j, puis 3 jours cette semaine. */
function src(): QuestSources {
  const s = empty();
  for (let w = 1; w <= 4; w++)
    for (let d = 0; d < 3; d++)
      s.sessions.push({ performed_at: `${addDays(MON, -7 * w + d)}T10:00:00Z` });
  for (let d = 0; d < 3; d++) s.sessions.push({ performed_at: `${addDays(MON, d * 2)}T10:00:00Z` });
  return s;
}

describe('🗓️👥 instantané des quêtes d’un ami', () => {
  const board = weeklyQuests(src(), addDays(MON, 5), null);
  const snap = questSnapshot(board);

  it('aller-retour : l’ami lit exactement ce que le joueur voit', () => {
    const v = readQuestSnapshot(JSON.parse(JSON.stringify(snap)), MON)!;
    expect(v.quests.map((q) => [q.kind, q.target, q.done, q.complete, q.mine])).toEqual(
      board.quests.map((q) => [q.kind, q.target, q.done, q.complete, q.mine]),
    );
    expect(v.doneCount).toBe(board.doneCount);
    expect(v.earned).toBe(board.earned);
    expect(v.tiers).toEqual(board.tiers);
  });

  it('ne publie ni marque de tickets ni historique', () => {
    expect(Object.keys(snap).sort()).toEqual(['monday', 'quests']);
    for (const q of snap.quests)
      expect(Object.keys(q).sort()).toEqual(['done', 'kind', 'mine', 'target']);
  });

  it('un instantané d’une autre semaine n’est pas montré', () => {
    expect(readQuestSnapshot(snap, addDays(MON, 7))).toBeNull();
  });

  it('relecture défensive : JSON d’un autre client', () => {
    expect(readQuestSnapshot(null, MON)).toBeNull();
    expect(readQuestSnapshot('x', MON)).toBeNull();
    expect(readQuestSnapshot({ monday: MON, quests: 'x' }, MON)).toBeNull();
    const v = readQuestSnapshot(
      {
        monday: MON,
        quests: [
          { kind: 'inconnu', target: 2, done: 1 },
          { kind: 'active_days', target: 0, done: 1 },
          { kind: 'variety', target: 2, done: -3 },
          { kind: 'regularity', target: 2, done: 2, mine: 'oui' },
          { kind: 'regularity', target: 2, done: 0 },
        ],
      },
      MON,
    )!;
    expect(v.quests.map((q) => q.kind)).toEqual(['regularity']);
    expect(v.quests[0]!.complete).toBe(true);
    expect(v.quests[0]!.mine).toBe(false);
  });

  it('les libellés viennent de la table des quêtes', () => {
    const v = readQuestSnapshot(snap, MON)!;
    const days = v.quests.find((q) => q.kind === 'active_days')!;
    expect(days.label).toContain(String(days.target));
  });
});

describe('🗓️👥 instantané d’avant la v1.203', () => {
  it('⚠️ les objectifs des sports que l’ami ne pratique pas sont retirés (signalé : Cypher)', () => {
    const old = {
      monday: MON,
      quests: [
        { kind: 'active_days', target: 6, done: 2, mine: true },
        { kind: 'strength_days', target: 4, done: 2, mine: true },
        { kind: 'cardio_minutes', target: 130, done: 40, mine: true },
        { kind: 'regularity', target: 2, done: 1, mine: true },
        { kind: 'variety', target: 2, done: 2, mine: true },
        { kind: 'tennis_days', target: 1, done: 0, mine: false },
      ],
    };
    const v = readQuestSnapshot(old, MON)!;
    expect(v.quests.map((q) => q.kind)).not.toContain('tennis_days');
    expect(v.quests).toHaveLength(5);
  });
  it('un joueur sans sport connu garde tout (rien n’est « à lui »)', () => {
    const v = readQuestSnapshot(
      {
        monday: MON,
        quests: [
          { kind: 'active_days', target: 2, done: 0, mine: true },
          { kind: 'tennis_days', target: 1, done: 0, mine: false },
        ],
      },
      MON,
    )!;
    expect(v.quests).toHaveLength(2);
  });
  it('la sortie nommée voyage jusqu’à l’ami', () => {
    const v = readQuestSnapshot(
      {
        monday: MON,
        quests: [{ kind: 'cardio_minutes', target: 130, done: 40, mine: true, activity: 'course' }],
      },
      MON,
    )!;
    expect(v.quests[0]!.label).toBe('130 min de course à pied');
  });
});
