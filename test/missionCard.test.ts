import { describe, expect, it } from 'vitest';
import { caravanCard, messageCard, missionWhen } from '@/lib/missionCard';
import { characterRank } from '@/lib/characterRank';
import type { ExpeditionMessage, PartyResult, Poi } from '@/lib/expedition';
import type { Caravan } from '@/lib/caravan';

const H = 3_600_000;
const msg = (over: Partial<ExpeditionMessage> = {}): ExpeditionMessage => ({
  id: 'm1',
  poiType: 'mine',
  level: 26,
  win: true,
  text: 'Le héros revient chargé.',
  gold: 500,
  energy: 12,
  key: 0,
  resolvedAt: 0,
  read: true,
  ...over,
});
const party = (over: Partial<PartyResult> = {}): PartyResult =>
  ({
    hero: false,
    faction: 'bandits',
    escort: ['a1', 'a2'],
    win: true,
    foes: 6,
    slain: 5,
    kills: { a1: 3, a2: 2 },
    heroKills: 0,
    xp: { a1: 30, a2: 20 },
    hurt: ['a2'],
    advGear: [],
    journal: ['Assaut', 'Victoire'],
    ...over,
  }) as PartyResult;

describe('📜 messageCard — un rapport de la boîte 📬', () => {
  it('une expédition du héros seul : le héros y est, pas d’équipe ni de compte d’abattus', () => {
    const c = messageCard(msg(), []);
    expect(c.hero).toBe(true);
    expect(c.team).toEqual([]);
    expect(c.kills).toBeNull();
    expect(c.verdict).toBe('réussie');
    expect(c.gains.map((g) => g.emoji)).toEqual(['🪙', '⚡']);
  });

  it('le rang est celui du NIVEAU du lieu, dans la couleur de ce rang', () => {
    const c = messageCard(msg({ level: 26 }), []);
    const r = characterRank(26);
    expect(c.rank).toContain(r.name);
    expect(c.color).toBe(r.color);
  });

  it('un groupe : UN verdict, les abattus, l’XP de chacun', () => {
    const c = messageCard(msg({ poiType: 'camp', party: party() }), []);
    expect(c.verdict).toBe('camp pris');
    expect(c.kills).toBe('5/6 abattus');
    expect(c.totalXp).toBe(50);
    expect(c.hero).toBe(false);
    expect(c.team.map((m) => [m.id, m.xp, m.hurt])).toEqual([
      ['a1', 30, false],
      ['a2', 20, true],
    ]);
    expect(c.journal).toEqual(['Assaut', 'Victoire']);
  });

  it('une incursion se reconnaît au RÉSULTAT du groupe, même sans type de lieu', () => {
    const c = messageCard(
      msg({ poiType: undefined, party: party({ rift: { level: 26, maxPv: 1, pvTrail: [] } }) }),
      [],
    );
    expect(c.rift).toBe(true);
    expect(c.verdict).toBe('faille refermée');
  });

  it('un coffre n’a ni rang ni héros', () => {
    const c = messageCard(
      msg({ chest: true, title: 'Coffre du Défi 360', poiType: undefined }),
      [],
    );
    expect(c.rank).toBeNull();
    expect(c.hero).toBe(false);
    expect(c.title).toBe('Coffre du Défi 360');
    expect(c.emoji).toBe('🎁');
  });

  it('l’arène dit ses vagues, et le butin au-delà des objets décrits part « au sac »', () => {
    const item = { name: 'Lame', slot: 'weapon' } as never;
    const c = messageCard(
      msg({ poiType: 'arena', waves: 14, items: [item, item], itemCount: 5 }),
      [],
    );
    expect(c.verdict).toBe('14 vagues tenues');
    expect(c.loot).toHaveLength(2);
    expect(c.lootMore).toBe(3);
  });

  it('un ancien message ne portait qu’un nom d’objet : il reste lisible', () => {
    expect(messageCard(msg({ itemName: 'Vieux bouclier' }), []).legacyItem).toBe('Vieux bouclier');
    const item = { name: 'Lame', slot: 'weapon' } as never;
    expect(messageCard(msg({ itemName: 'x', item }), []).legacyItem).toBeNull();
  });
});

describe('🐫 caravanCard — un convoi rentré', () => {
  const poi = { id: 'p1', type: 'well', level: 12, distNorm: 0.5, x: 0, y: 0 } as Poi;
  const van = (events: Caravan['outcome']['events']): Caravan => ({
    id: 'v1',
    poi,
    escort: ['a1', 'a2'],
    sentAt: 0,
    midAt: 2 * H,
    returnAt: 4 * H,
    outcome: {
      gold: 100,
      energy: 30,
      summonStones: 0,
      keys: 0,
      xp: { a1: 16, a2: 8 },
      kills: { a1: 2 },
      hurt: [],
      events,
      text: 'La route fut calme.',
    },
  });

  it('une embuscade PERDUE rend le verdict rouge ; gagnée, le convoi est « rentré »', () => {
    expect(caravanCard(van([{ kind: 'bandits', won: false, text: 'x' }]), []).win).toBe(false);
    const ok = caravanCard(van([{ kind: 'bandits', won: true, slain: 2, text: 'Repoussés' }]), []);
    expect(ok.win).toBe(true);
    expect(ok.verdict).toBe('rentré');
    expect(ok.road).toEqual([{ text: 'Repoussés', slain: 2 }]);
    expect(ok.kills).toBe('2 bandits abattus');
  });

  it('le temps de voyage et l’XP par heure viennent du rapport de convoi', () => {
    const c = caravanCard(van([]), []);
    expect(c.travelMs).toBe(4 * H);
    expect(c.xpPerHour).toBe(24 / 2 / 4);
  });

  it('seuls les champions nommés dans `stars` gagnent l’étoile', () => {
    const c = caravanCard(van([]), [], ['a2']);
    expect(c.team.map((m) => m.star)).toEqual([false, true]);
  });
});

describe('🕐 missionWhen', () => {
  it('parle comme le fil d’activité', () => {
    expect(missionWhen(0, 30_000)).toBe("à l'instant");
    expect(missionWhen(0, 2 * H)).toBe('il y a 2 h');
    expect(missionWhen(0, 30 * H)).toBe('hier');
  });
});
