import { describe, it, expect } from 'vitest';
import { AWAY_HARVEST_MS, controlGoldMessage } from '@/lib/controlPoints';
import type { Poi } from '@/lib/expedition';
import { messageCard } from '@/lib/missionCard';
import { missionMain } from '@/lib/reportDetail';

const H = 3_600_000;
const mine = {
  id: 'ctl_mine',
  type: 'control',
  x: 100,
  y: 100,
  level: 20,
  control: { kind: 'mine', owner: 'player', garrison: [] },
} as unknown as Poi;

// ⛏️ Demandé (2026-10-04) : « le matin je n'ai pas l'impression d'avoir la récolte de la nuit ».
describe('⛏️ la récolte d’or d’une absence est annoncée', () => {
  it('une nuit : le message dit l’or et la durée, l’or est déjà versé', () => {
    const m = controlGoldMessage(mine, 9 * H, 33_600.7, H)!;
    expect(m.title).toContain('33');
    expect(m.title).toContain('🪙 pendant ton absence');
    expect(m.text).toContain('8 h');
    expect(m.gold).toBe(33_600);
    // Déjà crédité : il se lit, il ne s'encaisse pas.
    expect(m.claimed).toBeUndefined();
  });
  it('la récolte de chaque minute reste silencieuse', () => {
    expect(controlGoldMessage(mine, AWAY_HARVEST_MS - 1, 500, 0)).toBeNull();
    expect(controlGoldMessage(mine, AWAY_HARVEST_MS, 500, 0)).not.toBeNull();
  });
  it('pas d’or, pas de message', () => {
    expect(controlGoldMessage(mine, 9 * H, 0.4, 0)).toBeNull();
  });
});

// 🏰 Demandé (2026-10-13) : le rapport de production ne parle pas du héros ; seulement de la
// récolte, et des miliciens de la garnison s'il y en a.
describe('🏰 le rapport de production : la récolte et la milice, rien d’autre', () => {
  const held = {
    ...mine,
    control: { kind: 'mine', owner: 'player', garrison: ['adv_1', 'mil:1', 'mil:2'] },
  } as unknown as Poi;
  it('sans héros, sans rang, avec les miliciens de la garnison', () => {
    const c = messageCard(controlGoldMessage(held, 9 * H, 1000, H)!, []);
    expect(c.hero).toBe(false);
    expect(c.rank).toBeNull();
    expect(c.militia).toBe(2);
    const main = missionMain(c);
    const team = main.sections.find((s) => s.id === 'team')!;
    expect(team.rows.map((r) => r.title)).toEqual(['2 miliciens']);
    expect(JSON.stringify(main)).not.toContain('Héros');
  });
  it('sans milicien : pas de section garnison', () => {
    const c = messageCard(controlGoldMessage(mine, 9 * H, 1000, H)!, []);
    expect(missionMain(c).sections.map((s) => s.id)).toEqual(['loot']);
  });
  it('un rapport d’avant (sans le champ) est reconnu à son id', () => {
    const m = { ...controlGoldMessage(mine, 9 * H, 1000, H)!, production: undefined };
    expect(messageCard(m, []).hero).toBe(false);
  });
});
