import { describe, it, expect } from 'vitest';
import { buildFriendFeed, feedWhen, FEED_RECENT_DAYS, type FriendTraining } from '@/lib/friendFeed';
import type { Challenge } from '@/lib/challenges';
import type { ComboChallenge } from '@/lib/combo';

const NOW = '2026-09-10T12:00:00.000Z';
const TODAY = '2026-09-10';

function ch(o: Partial<Challenge> & { id: string }): Challenge {
  return {
    exercise_id: 'ex_pushup',
    exercise_name: '100 pompes',
    unit: 'reps',
    format: 'fixed',
    duration_days: 7,
    start_date: '2026-09-04',
    config: {},
    daily_targets: [20, 20, 20, 20, 20, 20, 20],
    progress: [],
    status: 'active',
    created_at: '2026-09-04T08:00:00.000Z',
    updated_at: '2026-09-09T18:00:00.000Z',
    ...o,
  } as unknown as Challenge;
}
function co(o: Partial<ComboChallenge> & { id: string }): ComboChallenge {
  return {
    name: 'Défi 360',
    start_date: '2026-09-04',
    duration_days: 7,
    status: 'active',
    legs: [
      { slot: 'push', exercise_id: 'ex', target: 10, count_mode: 'sets', sets: [], progress: [] },
    ],
    created_at: '2026-09-04T08:00:00.000Z',
    updated_at: '2026-09-09T18:00:00.000Z',
    ...o,
  } as unknown as ComboChallenge;
}
function friend(o: Partial<FriendTraining> = {}): FriendTraining {
  return { userId: 'u1', pseudo: 'Marie', challenges: [], combos: [], ...o };
}

describe('buildFriendFeed', () => {
  it('dérive « a lancé » et « en est à N % » sans rien ajouter en base', () => {
    const feed = buildFriendFeed([friend({ challenges: [ch({ id: 'a' })] })], NOW, TODAY);
    expect(feed.map((i) => i.kind)).toEqual(['progress', 'started']);
    expect(feed[0]!.text).toMatch(/en est à \d+ % de « 100 pompes »/);
    expect(feed[1]!.text).toBe('a lancé « 100 pompes »');
    expect(feed[0]!.pseudo).toBe('Marie');
  });

  it('un défi bouclé donne UN seul événement, à 100 %', () => {
    const feed = buildFriendFeed(
      [friend({ challenges: [ch({ id: 'a', status: 'done' })] })],
      NOW,
      TODAY,
    );
    expect(feed).toHaveLength(1);
    expect(feed[0]!.kind).toBe('done');
    expect(feed[0]!.text).toBe('a bouclé « 100 pompes »');
    expect(feed[0]!.pct).toBe(100);
  });

  it('pas de doublon « lancé » + « en cours » le jour même', () => {
    const sameDay = ch({
      id: 'a',
      created_at: '2026-09-09T08:00:00.000Z',
      updated_at: '2026-09-09T09:00:00.000Z',
    });
    const feed = buildFriendFeed([friend({ challenges: [sameDay] })], NOW, TODAY);
    expect(feed.map((i) => i.kind)).toEqual(['started']);
  });

  it("n'expose pas les abandons — le fil motive, il ne dénonce pas", () => {
    const feed = buildFriendFeed(
      [
        friend({
          challenges: [ch({ id: 'a', status: 'abandoned' })],
          combos: [co({ id: 'b', status: 'abandoned' })],
        }),
      ],
      NOW,
      TODAY,
    );
    expect(feed).toEqual([]);
  });

  it('oublie ce qui est trop vieux', () => {
    const old = ch({
      id: 'a',
      status: 'done',
      updated_at: '2026-08-01T08:00:00.000Z',
    });
    expect(buildFriendFeed([friend({ challenges: [old] })], NOW, TODAY)).toEqual([]);
    const fresh = ch({
      id: 'b',
      status: 'done',
      updated_at: new Date(Date.parse(NOW) - (FEED_RECENT_DAYS - 1) * 86400000).toISOString(),
    });
    expect(buildFriendFeed([friend({ challenges: [fresh] })], NOW, TODAY)).toHaveLength(1);
  });

  it('ignore un horodatage dans le futur (horloge client décalée)', () => {
    const future = ch({ id: 'a', status: 'done', updated_at: '2026-12-01T08:00:00.000Z' });
    expect(buildFriendFeed([friend({ challenges: [future] })], NOW, TODAY)).toEqual([]);
  });

  it('mélange les amis, le plus récent en tête, et borne la longueur', () => {
    const a = friend({
      userId: 'u1',
      pseudo: 'Marie',
      challenges: [ch({ id: 'a', status: 'done', updated_at: '2026-09-08T10:00:00.000Z' })],
    });
    const b = friend({
      userId: 'u2',
      pseudo: 'Paul',
      combos: [co({ id: 'b', status: 'done', updated_at: '2026-09-09T10:00:00.000Z' })],
    });
    const feed = buildFriendFeed([a, b], NOW, TODAY);
    expect(feed.map((i) => i.pseudo)).toEqual(['Paul', 'Marie']);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1]!.at >= feed[i]!.at).toBe(true);

    const many = friend({
      challenges: Array.from({ length: 30 }, (_, i) => ch({ id: 'c' + i })),
    });
    expect(buildFriendFeed([many], NOW, TODAY, 5)).toHaveLength(5);
  });

  it('donne des clés de rendu uniques', () => {
    const feed = buildFriendFeed(
      [friend({ challenges: [ch({ id: 'a' })], combos: [co({ id: 'b' })] })],
      NOW,
      TODAY,
    );
    expect(new Set(feed.map((i) => i.id)).size).toBe(feed.length);
  });
});

describe('feedWhen', () => {
  it('se lit d’un coup d’œil', () => {
    expect(feedWhen('2026-09-10T11:59:40.000Z', NOW)).toBe("à l'instant");
    expect(feedWhen('2026-09-10T11:30:00.000Z', NOW)).toBe('il y a 30 min');
    expect(feedWhen('2026-09-10T09:00:00.000Z', NOW)).toBe('il y a 3 h');
    expect(feedWhen('2026-09-09T09:00:00.000Z', NOW)).toBe('hier');
    expect(feedWhen('2026-09-06T09:00:00.000Z', NOW)).toBe('il y a 4 j');
  });
});
