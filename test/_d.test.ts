import { describe, it } from 'vitest';
import fs from 'node:fs';
import { ambushCombatant, poiCombatant } from '@/lib/expedition';
import { playerCombatant, simulateCombat } from '@/lib/combat';
import { computeCharacter } from '@/lib/character';
import { playerWithGear, type Equipped } from '@/lib/items';
const xpFor = (L: number) => {
  let s = 0;
  for (let i = 1; i < L; i++) s += 200 + (i - 1) * 100;
  return s;
};
// 5 arguments : powerXp, enduranceXp, agilityXp, energy, energySpent
const c = computeCharacter(15000, 12000, 8000, 5000, 0);
const eq = JSON.parse(fs.readFileSync('.tmp/eq.json', 'utf8')) as Equipped;
describe('d', () => {
  it('verif', () => {
    console.log(
      'niveau derive',
      c.level.level,
      '| puiss',
      Math.round(c.puissance),
      'end',
      Math.round(c.endurance),
      'agi',
      Math.round(c.agilite),
    );
    const nu = playerCombatant(
      'Nu',
      { puissance: c.puissance, endurance: c.endurance, agilite: c.agilite },
      c.level.level,
    );
    const arme = playerWithGear('Equipe', c, eq, {}, c.level.level, 'frenetique');
    console.log('nu     pv', nu.pv, 'dmg', nu.damage);
    console.log('equipe pv', arme.pv, 'dmg', arme.damage);
    for (const [nom, h] of [
      ['nu', nu],
      ['equipe', arme],
    ] as const) {
      let w = 0;
      for (let s = 0; s < 200; s++)
        if (
          simulateCombat(h, ambushCombatant(h, c.level.level), { seed: s * 97 + 1, goldOnWin: 0 })
            .win
        )
          w++;
      const parts: string[] = [];
      for (const d of [0, 5, 10]) {
        let v = 0;
        for (let s = 0; s < 100; s++)
          if (
            simulateCombat(h, poiCombatant(c.level.level + d, 'lair'), {
              seed: s * 131 + 3,
              goldOnWin: 0,
            }).win
          )
            v++;
        parts.push(`+${d}: ${v}%`);
      }
      console.log(`${nom.padEnd(7)} embuscade ${Math.round(w / 2)}% | REPAIRE ${parts.join(' ')}`);
    }
  });
});
