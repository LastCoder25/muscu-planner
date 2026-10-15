import { describe, it, expect } from 'vitest';
import { simulateDungeon } from '@/lib/combat';
import { DUNGEONS, dungeonFoes } from '@/data/dungeons';
import { gearedFighter } from './helpers/gearedFighter';

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
  function clear(reco: number): number {
    const d = DUNGEONS.find((x) => x.recoLevel === reco)!;
    const foes = dungeonFoes(d);
    let tot = 0;
    for (let g = 1; g <= SEEDS; g++) {
      const p = gearedFighter(reco, g);
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
  }, 60_000);
});
