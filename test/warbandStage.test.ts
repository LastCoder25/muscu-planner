import { describe, it, expect } from 'vitest';
import {
  WARBAND_STAGE,
  bodyShares,
  buildWarbandStage,
  fallenByStep,
  warbandStageInputOf,
} from '@/lib/warbandStage';
import type { WarbandBattle } from '@/lib/rift';
import type { PartyResult } from '@/lib/expedition';
import { speciesArt } from '@/data/monsterArt';

const step = (pv: number, bossPv: number) => ({
  dealt: 1,
  taken: 1,
  crit: false,
  groupTurns: 1,
  bossTurns: 1,
  pv,
  bossPv,
});

const battle = (over: Partial<WarbandBattle> = {}): WarbandBattle => ({
  maxPv: 1000,
  armyPv: 2000,
  groups: [
    { species: 'Loup famélique', emoji: '🐺', count: 40 },
    { species: 'Arachné des bois', emoji: '🕷️', count: 25, ranged: true },
    { species: 'Sanglier enragé', emoji: '🐗', count: 12 },
    { species: 'Scorpion géant', emoji: '🦂', count: 1, champion: true },
  ],
  steps: [step(900, 1500), step(700, 1000), step(600, 400), step(500, 0)],
  ...over,
});

describe('bodyShares — combien de corps par groupe', () => {
  it('ne dépasse jamais le plafond, et la somme tombe JUSTE', () => {
    const s = bodyShares(battle().groups);
    expect(s.reduce((a, n) => a + n, 0)).toBe(WARBAND_STAGE.maxBodies);
  });

  it('suit l’effectif réel : le groupe le plus nombreux montre le plus de corps', () => {
    const s = bodyShares(battle().groups);
    expect(s[0]!).toBeGreaterThan(s[1]!);
    expect(s[1]!).toBeGreaterThan(s[2]!);
  });

  it('le champion vaut UN corps, et aucune espèce ne disparaît', () => {
    const g = [{ count: 200 }, { count: 1 }, { count: 1, champion: true }];
    expect(bodyShares(g)).toEqual([WARBAND_STAGE.maxBodies - 2, 1, 1]);
  });

  it('une petite bande est montrée ENTIÈRE, sans corps inventé', () => {
    const g = [{ count: 3 }, { count: 2 }, { count: 1, champion: true }];
    expect(bodyShares(g)).toEqual([3, 2, 1]);
  });

  it('aucun groupe ne montre plus de corps qu’il n’en compte', () => {
    for (let a = 1; a < 30; a += 3)
      for (let b = 1; b < 60; b += 7) {
        const s = bodyShares([{ count: a }, { count: b }, { count: 1, champion: true }]);
        expect(s[0]!).toBeLessThanOrEqual(a);
        expect(s[1]!).toBeLessThanOrEqual(b);
      }
  });
});

describe('fallenByStep — la troupe tombe à mesure que la colonne perd sa vie', () => {
  it('monotone, et plafonnée à la part de déroute', () => {
    const f = fallenByStep(battle().steps, 2000, 29);
    for (let i = 1; i < f.length; i++) expect(f[i]!).toBeGreaterThanOrEqual(f[i - 1]!);
    expect(f[f.length - 1]).toBe(Math.floor(WARBAND_STAGE.routShare * 29));
  });

  it('un corps tombé ne se relève pas, même si le log remonte', () => {
    const f = fallenByStep([{ bossPv: 500 }, { bossPv: 1500 }], 2000, 20);
    expect(f[1]).toBe(f[0]);
  });

  it('personne ne tombe tant que la colonne n’a rien perdu', () => {
    expect(fallenByStep([{ bossPv: 2000 }], 2000, 20)).toEqual([0]);
  });
});

describe('buildWarbandStage — la chorégraphie', () => {
  it('chaque corps de troupe tombe au temps où le compte le franchit, jamais le champion', () => {
    const s = buildWarbandStage(battle(), true, 3, 1);
    const troop = s.bodies.filter((b) => !b.champion);
    s.steps.forEach((st, i) => {
      const down = troop.filter((b) => b.fallStep >= 0 && b.fallStep <= i).length;
      expect(down).toBe(st.fallen);
    });
    expect(s.bodies.filter((b) => b.champion).every((b) => b.fallStep === -1)).toBe(true);
  });

  it('le premier rang tombe d’abord (il est le plus à gauche)', () => {
    const s = buildWarbandStage(battle(), true, 3, 1);
    const troop = s.bodies.filter((b) => !b.champion);
    const first = troop.filter((b) => b.fallStep === 0 || b.fallStep === 1);
    const last = troop.filter((b) => b.fallStep === -1);
    const maxFirst = Math.max(...first.map((b) => b.x));
    const minLast = Math.min(...last.map((b) => b.x));
    expect(maxFirst).toBeLessThan(minLast);
  });

  it('les PV lus sont bornés à zéro, le reste est recopié du rapport', () => {
    const s = buildWarbandStage(battle({ steps: [step(-40, -3)] }), false, 2, 1);
    expect(s.steps[0]!.pv).toBe(0);
    expect(s.steps[0]!.bossPv).toBe(0);
    expect(s.effectif).toBe(78);
  });

  it('est déterministe, et tout le monde reste sur le terrain', () => {
    const a = buildWarbandStage(battle(), true, 7, 42);
    const b = buildWarbandStage(battle(), true, 7, 42);
    expect(a).toEqual(b);
    for (const c of a.bodies) {
      expect(c.x).toBeGreaterThan(0.5);
      expect(c.x).toBeLessThan(1);
      expect(c.y).toBeGreaterThan(0.4);
      expect(c.y).toBeLessThan(0.9);
    }
  });

  it('borne notre ligne aux places de la formation', () => {
    expect(buildWarbandStage(battle(), true, 20, 1).partySize).toBe(WARBAND_STAGE.allies.length);
    expect(buildWarbandStage(battle(), true, 0, 1).partySize).toBe(1);
  });
});

describe('ce qui se rejoue, et avec quelles images', () => {
  it('seul un rapport qui porte une bataille se rejoue', () => {
    const party = { battle: battle() } as unknown as PartyResult;
    expect(warbandStageInputOf(party)).not.toBeNull();
    expect(warbandStageInputOf({} as PartyResult)).toBeNull();
  });

  it('une espèce de faction emprunte l’illustration de son gardien', () => {
    expect(speciesArt('Loup famélique')).toBe(speciesArt('Loup famélique (gardien)') ?? 'x');
    expect(speciesArt('Loup famélique')).not.toBeNull();
    expect(speciesArt('Inconnu')).toBeNull();
  });
});
