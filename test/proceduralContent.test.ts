import { describe, it, expect } from 'vitest';
import { simulateCombat, simulateDungeon, type DungeonFoe } from '@/lib/combat';
import {
  cumXpForLevel,
  refFighter,
  proceduralMonster,
  proceduralDungeon,
  proceduralDungeonMonsters,
  proceduralRecos,
  proceduralRegions,
  proceduralBoss,
  proceduralSet,
  buildProceduralContent,
  BOSS_MILESTONES,
  PROC_REGION_COUNT,
} from '@/lib/proceduralContent';

describe('procedural — courbe XP', () => {
  it('cumXpForLevel = forme fermée des coûts de niveau', () => {
    // Coût niveau k = 200+(k-1)×100 ; cumul jusqu'à L.
    let cum = 0;
    for (let k = 1; k < 12; k++) {
      expect(cumXpForLevel(k)).toBe(cum);
      cum += 200 + (k - 1) * 100;
    }
  });
});

describe('procedural — génération', () => {
  it('proceduralMonster : stats croissantes weak < mid < strong, ids/skin déterministes', () => {
    const w = proceduralMonster(30, 'weak', 0);
    const m = proceduralMonster(30, 'mid', 0);
    const s = proceduralMonster(30, 'strong', 0);
    expect(w.pv).toBeLessThan(m.pv);
    expect(m.pv).toBeLessThan(s.pv);
    expect(w.damage).toBeLessThan(s.damage);
    expect(proceduralMonster(30, 'mid', 0)).toEqual(proceduralMonster(30, 'mid', 0));
  });
  it('les stats montent avec la reco', () => {
    expect(proceduralMonster(50, 'mid', 0).pv).toBeGreaterThan(proceduralMonster(30, 'mid', 0).pv);
  });
  it('proceduralRecos : croissant, PROC_REGION_COUNT×3 donjons, à partir de 25', () => {
    const r = proceduralRecos();
    expect(r.length).toBe(PROC_REGION_COUNT * 3);
    expect(r[0]).toBe(25);
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThan(r[i - 1]!);
  });
  it('proceduralDungeon : trio de 3 monstres, recoLevel = reco', () => {
    const d = proceduralDungeon(31, 2);
    expect(d.monsterIds.length).toBe(3);
    expect(d.recoLevel).toBe(31);
    expect(proceduralDungeonMonsters(31).map((m) => m.id)).toEqual(d.monsterIds);
  });
  it('proceduralRegions : couvre TOUS les donjons procéduraux, sans doublon', () => {
    const regs = proceduralRegions();
    expect(regs.length).toBe(PROC_REGION_COUNT);
    const ids = regs.flatMap((r) => r.dungeonIds);
    const expected = proceduralRecos().map((reco) => `proc_dungeon_${reco}`);
    expect(new Set(ids)).toEqual(new Set(expected));
    expect(ids.length).toBe(expected.length); // pas de doublon
  });
  it('buildProceduralContent : ids de monstres uniques et référencés par les donjons', () => {
    const { monsters, dungeons } = buildProceduralContent();
    const ids = monsters.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // uniques
    const monSet = new Set(ids);
    for (const d of dungeons) for (const mid of d.monsterIds) expect(monSet.has(mid)).toBe(true);
  });
});

describe('procedural — calibration (clear ~systématique au reco)', () => {
  function trioFoes(reco: number): DungeonFoe[] {
    return proceduralDungeonMonsters(reco).map((m) => ({ combatant: m, gold: m.gold }));
  }
  function clearPct(reco: number, atLevel: number, n = 100): number {
    const foes = trioFoes(reco);
    const p = refFighter(atLevel);
    let c = 0;
    for (let s = 0; s < n; s++) if (simulateDungeon(p, foes, { seed: s * 211 + 5 }).cleared) c++;
    return c / n;
  }
  it('GEAR-GATÉ (v0.600) : un build NU ne clear PLUS à son reco — il faut de l’équipement', () => {
    // Le contenu suppose désormais un joueur ÉQUIPÉ (gearExpect appliqué à proceduralMonster) :
    // un joueur NU de son niveau est GATÉ (clear bas). C'est l'ancre de « sport = plafond »
    // côté difficulté — le gear fait la différence, pas le simple niveau. (Un joueur équipé de
    // son niveau clear ~65-85 %, cf. harnais de calibration hors-suite.)
    for (const reco of [25, 40, 60, 85]) {
      expect(clearPct(reco, reco)).toBeLessThan(0.5);
    }
  });
  it('mur sous-niveau : plus dur 2 niveaux en dessous (monotone)', () => {
    expect(clearPct(25, 23)).toBeLessThanOrEqual(clearPct(25, 25));
    expect(clearPct(34, 32)).toBeLessThanOrEqual(clearPct(34, 34));
  });
});

describe('procedural — boss de palier + sets', () => {
  it('BOSS_MILESTONES : 30→100 tous les 5', () => {
    expect(BOSS_MILESTONES[0]).toBe(30);
    expect(BOSS_MILESTONES[BOSS_MILESTONES.length - 1]).toBe(100);
    for (let i = 1; i < BOSS_MILESTONES.length; i++)
      expect(BOSS_MILESTONES[i]! - BOSS_MILESTONES[i - 1]!).toBe(5);
  });
  it('proceduralBoss : unlockLevel = palier, setId lié à proceduralSet', () => {
    const b = proceduralBoss(45, 3);
    expect(b.unlockLevel).toBe(45);
    expect(b.dropLevel).toBe(45);
    expect(b.setId).toBe(proceduralSet(45, 3).id);
  });
  it('proceduralSet : 3 paliers 2/3/4 pièces', () => {
    const s = proceduralSet(30, 0);
    expect(s.tiers.map((t) => t.pieces)).toEqual([2, 3, 4]);
  });
  it('proceduralBoss : baseline NU croissante (l’attente d’équipement est appliquée dans BOSSES)', () => {
    // v0.600 : proceduralBoss rend une baseline NUE (refFighter) ; l'attente d'équipement
    // (bossGearExpect) est appliquée UNIFORMÉMENT dans bosses.ts (BOSSES.map). On vérifie ici
    // la cohérence du générateur : stats strictement croissantes avec le palier, dur nu.
    const b30 = proceduralBoss(30, 0).combatant;
    const b60 = proceduralBoss(60, 0).combatant;
    const b100 = proceduralBoss(100, 0).combatant;
    expect(b60.pv).toBeGreaterThan(b30.pv);
    expect(b100.pv).toBeGreaterThan(b60.pv);
    expect(b60.damage).toBeGreaterThan(b30.damage);
    expect(b100.damage).toBeGreaterThan(b60.damage);
    // Nu, le boss est censé être quasi-imbattable (il faut du gear).
    const p = refFighter(30);
    let w = 0;
    for (let s = 0; s < 60; s++)
      if (simulateCombat(p, b30, { seed: s * 89 + 1, goldOnWin: 0 }).win) w++;
    expect(w / 60).toBeLessThan(0.5);
  });
  it('buildProceduralContent : bosses + sets alignés (même count, ids appariés)', () => {
    const { bosses, sets } = buildProceduralContent();
    expect(bosses.length).toBe(BOSS_MILESTONES.length);
    expect(sets.length).toBe(BOSS_MILESTONES.length);
    const setIds = new Set(sets.map((s) => s.id));
    for (const b of bosses) expect(setIds.has(b.setId)).toBe(true);
  });
});
