import { describe, it, expect } from 'vitest';
import { simulateDungeon, simulateCombat, type Combatant } from '@/lib/combat';
import { DUNGEONS, dungeonFoes } from '@/data/dungeons';
import { BOSSES } from '@/data/bosses';
import { gearedFighter, MUSCU_PURE, BALANCED, type StatShape } from './helpers/gearedFighter';

/** ⛰️ LA COURBE DES DONJONS EST RÉGULIÈRE (audit 2026-10-15). Mesuré avant correctif, joueur de
 *  référence au niveau conseillé de chaque donjon (16 tirages d'équipement × 40 descentes) :
 *  22 → 25 : 74 % → 58 %, puis des dents de scie — 34 % au reco 34, 13 % au reco 52, 77 % au
 *  reco 58. Le budget d'équipement (`GEAR_BUDGET_BY_RANK`) supposait le joueur presque aussi
 *  fort au DÉBUT d'un rang qu'à sa fin, alors que le rang s'ouvre progressivement : le début
 *  de chaque rang était un mur, la fin une formalité.
 *  ⚠️ On mesure par `dungeonFoes`, le vrai chemin, et on MOYENNE les tirages d'équipement :
 *  un seul tirage va de 25 % à 100 % sur le même donjon. */
describe('la difficulté des donjons avance sans mur ni falaise', () => {
  const SEEDS = 8;
  const RUNS = 40;
  function clear(reco: number, shape: StatShape = BALANCED): number {
    const d = DUNGEONS.find((x) => x.recoLevel === reco)!;
    const foes = dungeonFoes(d);
    let tot = 0;
    for (let g = 1; g <= SEEDS; g++) {
      const p = gearedFighter(reco, g, true, true, shape);
      let w = 0;
      for (let s = 0; s < RUNS; s++)
        if (simulateDungeon(p, foes, { seed: s * 211 + 5 }).cleared) w++;
      tot += w / RUNS;
    }
    return tot / SEEDS;
  }

  it('de 13 à 94 : chaque donjon se nettoie dans la bande, sans saut entre deux voisins', () => {
    const recos = DUNGEONS.map((d) => d.recoLevel).filter((r) => r >= 13);
    let prev: { reco: number; c: number } | null = null;
    for (const reco of recos) {
      const c = clear(reco);
      expect(c, `reco ${reco}`).toBeGreaterThan(0.5);
      expect(c, `reco ${reco}`).toBeLessThan(0.88);
      if (prev) expect(Math.abs(c - prev.c), `${prev.reco} → ${reco}`).toBeLessThan(0.25);
      prev = { reco, c };
    }
  }, 120_000);

  /** 💪 LE SPORTIF « MUSCU PURE » N'EST PAS MURÉ (2026-10-16). La muscu donne 60/30/10 ; avec
   *  le plancher de combat à 20 % (v1.215), il nettoyait en moyenne 39 % des donjons de son
   *  niveau au-delà du reco 25 (25 à 54 %) et battait 31 % des boss de palier (19 à 48 %),
   *  contre 69 % et 57 % pour l'équilibré. Plancher à 28 % : 60 % et 45 %. Il doit rester
   *  SOUS l'équilibré (varier ses sports doit payer), mais dans la bande.
   *  ⚠️ Même butin que le joueur de référence, stats passées par `computeCharacter`. */
  function bossWin(palier: number, shape: StatShape): number {
    const foe = BOSSES.find((b) => b.unlockLevel === palier)!.combatant as Combatant;
    let tot = 0;
    for (let g = 1; g <= SEEDS; g++) {
      const p = gearedFighter(palier, g, true, true, shape);
      let w = 0;
      for (let s = 0; s < RUNS; s++)
        if (simulateCombat(p, foe, { seed: s * 97 + 3, goldOnWin: 0 }).win) w++;
      tot += w / RUNS;
    }
    return tot / SEEDS;
  }
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;

  it('💪 muscu pure : donjons de son niveau dans la bande, un peu sous l’équilibré', () => {
    const recos = DUNGEONS.map((d) => d.recoLevel).filter((r) => r >= 25);
    const muscu = recos.map((r) => clear(r, MUSCU_PURE));
    recos.forEach((r, i) => expect(muscu[i], `reco ${r}`).toBeGreaterThan(0.35));
    const m = mean(muscu);
    const eq = mean(recos.map((r) => clear(r)));
    expect(m).toBeGreaterThan(0.52);
    expect(m).toBeLessThan(eq - 0.04);
  }, 180_000);

  it('💪 muscu pure : pas muré sur les boss de palier, sous l’équilibré', () => {
    const paliers = BOSSES.map((b) => b.unlockLevel).filter((l) => l >= 25);
    const muscu = paliers.map((l) => bossWin(l, MUSCU_PURE));
    paliers.forEach((l, i) => expect(muscu[i], `palier ${l}`).toBeGreaterThan(0.25));
    const m = mean(muscu);
    expect(m).toBeGreaterThan(0.38);
    expect(m).toBeLessThan(mean(paliers.map((l) => bossWin(l, BALANCED))));
  }, 180_000);
});
