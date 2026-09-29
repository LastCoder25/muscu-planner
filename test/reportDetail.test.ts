import { describe, expect, it } from 'vitest';
import { missionDetail, siegeDetail } from '@/lib/reportDetail';
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

describe('📋 missionDetail — le détail d’un rapport de mission, au modèle commun', () => {
  const card = messageCard(msg({ party: party() }), [adv('a1', 'Léa'), adv('a2', 'Bran')]);
  const d = missionDetail(card);

  it('range le récit, l’équipe et le journal, dans cet ordre', () => {
    expect(d.sections.map((s) => s.id)).toEqual(['story', 'team', 'journal']);
  });

  it('une ligne d’équipe : nom, abattus en sous-titre, XP à droite, blessure en marque', () => {
    const team = section(d, 'team')!;
    expect(team.count).toBe(2);
    const lea = team.rows.find((r) => r.title === 'Léa')!;
    expect(lea.value).toBe('+30 XP');
    expect(lea.sub).toContain('3 abattus');
    const bran = team.rows.find((r) => r.title === 'Bran')!;
    expect(bran.sub).toBeUndefined();
    expect(bran.tags?.map((t) => t.icon)).toEqual(['🤕']);
  });

  it('les chiffres clés reprennent les abattus et l’XP du rapport, sans recalcul', () => {
    expect(d.stats.map((s) => s.val)).toEqual(['5/6', '+50']);
  });

  it('une section vide n’apparaît pas', () => {
    expect(section(d, 'loot')).toBeUndefined();
    expect(section(d, 'road')).toBeUndefined();
  });

  it('le butin décrit chaque objet, et compte ce qui est parti au sac sans être décrit', () => {
    const c: MissionCard = {
      ...card,
      loot: [{ name: 'Lame', slot: 'weapon', rarity: 'rare', level: 20 } as never],
      lootMore: 2,
    };
    const loot = section(missionDetail(c), 'loot')!;
    expect(loot.count).toBe(3);
    expect(loot.rows[0]!.item).toBeDefined();
    expect(loot.rows[1]!.title).toBe('+2 objets au sac');
  });

  it('le héros figure dans l’équipe quand il était du voyage avec des champions', () => {
    const c: MissionCard = { ...card, hero: true };
    const team = section(missionDetail(c), 'team')!;
    expect(team.rows[0]!.title).toBe('Héros');
    expect(team.count).toBe(3);
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
