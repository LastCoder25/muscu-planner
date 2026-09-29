import { describe, expect, it } from 'vitest';
import {
  missionDetail,
  missionMain,
  siegeDetail,
  splitJournal,
  storyExtra,
} from '@/lib/reportDetail';
import { messageCard, type MissionCard } from '@/lib/missionCard';
import type { ExpeditionMessage, PartyResult } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';
import type { RaidReport } from '@/lib/raid';

const msg = (over: Partial<ExpeditionMessage> = {}): ExpeditionMessage => ({
  id: 'm1',
  poiType: 'camp',
  level: 26,
  win: true,
  text: 'Le camp est tombé.',
  gold: 500,
  energy: 0,
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
    kills: { a1: 3, a2: 0 },
    heroKills: 0,
    xp: { a1: 30, a2: 20 },
    hurt: ['a2'],
    advGear: [],
    journal: ['Assaut', 'Victoire'],
    ...over,
  }) as PartyResult;
const adv = (id: string, name: string) =>
  ({ id, name, level: 5, xp: 0, path: ['guerrier'], seed: 1 }) as unknown as Adventurer;

const section = (d: ReturnType<typeof missionDetail>, id: string) =>
  d.sections.find((s) => s.id === id);

describe('📋 missionMain — le corps visible : butin, puis équipe', () => {
  const card = messageCard(msg({ party: party() }), [adv('a1', 'Léa'), adv('a2', 'Bran')]);
  const d = missionMain(card);

  it('le butin d’abord, l’équipe ensuite — et rien d’autre', () => {
    expect(d.sections.map((s) => s.id)).toEqual(['loot', 'team']);
    expect(d.stats).toEqual([]);
  });

  it('le butin s’affiche même sans objet : ses ressources se dessinent au-dessus', () => {
    const loot = section(d, 'loot')!;
    expect(loot.keep).toBe(true);
    expect(loot.rows).toEqual([]);
  });

  it('l’équipe porte le total en résumé : abattus et XP, une seule fois', () => {
    expect(section(d, 'team')!.aside).toBe('⚔️ 5/6 · +50 XP');
  });

  it('une ligne d’équipe : nom, abattus et état en sous-titre, XP à droite, marque', () => {
    const team = section(d, 'team')!;
    const lea = team.rows.find((r) => r.title === 'Léa')!;
    expect(lea.value).toBe('+30 XP');
    expect(lea.sub).toBe('⚔️ 3 abattus');
    const bran = team.rows.find((r) => r.title === 'Bran')!;
    expect(bran.sub).toBe('à l’infirmerie');
    expect(bran.tags?.map((t) => t.icon)).toEqual(['🤕']);
  });

  it('le butin décrit chaque objet, et compte ce qui est parti au sac sans être décrit', () => {
    const c: MissionCard = {
      ...card,
      loot: [{ name: 'Lame', slot: 'weapon', rarity: 'rare', level: 20 } as never],
      lootMore: 2,
    };
    const loot = section(missionMain(c), 'loot')!;
    expect(loot.rows[0]!.item).toBeDefined();
    expect(loot.rows[1]!.title).toBe('+2 objets au sac');
  });

  it('le héros ouvre l’équipe quand il était du voyage — même seul', () => {
    const team = section(missionMain({ ...card, hero: true, team: [] }), 'team')!;
    expect(team.rows.map((r) => r.title)).toEqual(['Héros']);
  });
});

describe('📜 missionDetail — le déroulé replié : récit, combat, route', () => {
  const journal = [
    '🧝 Last abat 🗡️ Coupe-jarret',
    '👺 Chef de bande met à terre 🌿 Orsène',
    'Une embuscade repoussée.',
    'Route tranquille.',
    'Route tranquille.',
  ];
  const card = messageCard(
    msg({
      text: '🗡️ 3/3 gardes abattus. Une embuscade repoussée. Route tranquille. Route tranquille.',
      party: party({ journal }),
    }),
    [adv('a1', 'Léa')],
  );
  const d = missionDetail(card);

  it('le combat et la route se séparent ; un récit qui répète le journal se tait', () => {
    expect(d.sections.map((s) => s.id)).toEqual(['combat', 'road']);
  });

  it('une ligne de combat : l’icône de celui qui frappe, teintée selon qui tombe', () => {
    const [win, lose] = section(d, 'combat')!.rows;
    expect(win).toMatchObject({ icon: '🧝', title: 'Last abat 🗡️ Coupe-jarret', tone: 'win' });
    expect(lose).toMatchObject({ icon: '👺', tone: 'lose' });
  });

  it('deux lignes de route identiques à la suite n’en font qu’une, comptée', () => {
    const road = section(d, 'road')!.rows;
    expect(road.map((r) => [r.title, r.value])).toEqual([
      ['Une embuscade repoussée.', undefined],
      ['Route tranquille.', '×2'],
    ]);
  });

  it('une incursion n’a pas de route : tout son journal est du combat', () => {
    const j = ['⚔️ 🧟 Revenant abattu.', '🚪 La porte s’ouvre.', '💀 Le gardien tient.'];
    const s = splitJournal(j, true);
    expect(s.events).toEqual([]);
    expect(s.combat.map((r) => r.tone)).toEqual(['win', 'dim', 'lose']);
  });

  it('sans journal, le récit est tout ce qu’on a : il s’affiche', () => {
    const solo = messageCard(msg({ text: 'Le camp est tombé.' }), []);
    expect(section(missionDetail(solo), 'story')!.text).toBe('Le camp est tombé.');
  });
});

describe('📖 storyExtra — ce que le récit dit de plus que le journal', () => {
  it('répète le journal et le compte des abattus : rien à ajouter', () => {
    expect(storyExtra('⚔️ Camp pris ! 🐺 3/3 abattus.', ['🧝 Last abat 🐺 Loup'])).toBeNull();
  });

  it('répète le verdict et le butin (« · +54 💠 ») : rien à ajouter', () => {
    const t = '🌀 Faille refermée — le gardien est tombé. 2/2 abattus · +54 💠';
    expect(storyExtra(t, [], 'faille refermée')).toBeNull();
  });

  it('dit ce que le journal ne dit pas : on le garde, sans les redites', () => {
    const t = '💠 Aucun garde — ses monstres sont partis vers ta base. Route tranquille.';
    expect(storyExtra(t, ['Route tranquille.'])).toBe(
      '💠 Aucun garde — ses monstres sont partis vers ta base.',
    );
  });
});

describe('🏰 siegeDetail — le dernier siège, au MÊME modèle', () => {
  const r = {
    raidId: 'r1',
    faction: 'bandits',
    level: 20,
    groups: [
      { species: 'Archer', emoji: '🏹', count: 5, level: 18, kind: 'ranged' },
      { species: 'Chef', emoji: '👹', count: 1, level: 22, champion: true },
    ],
    held: false,
    defeated: 1,
    total: 2,
    finalPv: 250,
    maxPv: 1000,
    heroHome: true,
    log: [],
    breached: true,
    resolvedAt: 0,
    defenders: [
      { id: 'a1', name: 'Léa', emoji: '⚔️', kind: 'melee' },
      { id: 'a2', name: 'Bran', emoji: '🏹', kind: 'ranged' },
    ],
    wounded: ['a1'],
  } as unknown as RaidReport;
  const d = siegeDetail(r, { corpses: 3, gold: 120, keys: 0, summonStones: 0, items: 0 });

  it('les chiffres clés : groupes repoussés, rempart restant, brèche, héros', () => {
    expect(d.stats.map((s) => s.val)).toEqual(['1/2', '25 %', 'ouverte', 'présent']);
    expect(d.stats[0]!.tone).toBe('lose');
  });

  it('l’armée compte ses corps, et chaque groupe dit son effectif et sa nature', () => {
    const army = d.sections.find((s) => s.id === 'army')!;
    expect(army.count).toBe(6);
    expect(army.rows[0]).toMatchObject({ title: 'Archer', value: '×5' });
    expect(army.rows[0]!.sub).toContain('tir');
    expect(army.rows[1]!.title).toContain('👑');
  });

  it('un défenseur à terre porte la marque de l’infirmerie', () => {
    const defs = d.sections.find((s) => s.id === 'defenders')!;
    expect(defs.rows.find((x) => x.title === 'Léa')!.tags).toHaveLength(1);
    expect(defs.rows.find((x) => x.title === 'Bran')!.tags).toHaveLength(0);
  });

  it('le butin des corps est la même mise en forme que partout (`battleLootPills`)', () => {
    const loot = d.sections.find((s) => s.id === 'loot')!;
    expect(loot.rows.map((x) => x.title)).toEqual(['+120 🪙']);
  });

  it('sans défenseurs connus ni butin, ces sections disparaissent', () => {
    const bare = siegeDetail({ ...r, defenders: undefined }, null);
    expect(bare.sections.map((s) => s.id)).toEqual(['army']);
  });
});
