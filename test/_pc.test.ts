import { it } from 'vitest';
import fs from 'node:fs';
import { simulateCombat } from '@/lib/combat';
import { refAdvGear, refChampionAdv, refCompanions, roadPairs, roadUnits } from '@/lib/caravan';
import { fuseUnits, type SkirmishUnit } from '@/lib/skirmish';
import { campFoe, CAMP } from '@/lib/camp';
import type { Poi } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const poiAt = (L: number): Poi => ({
  id: 'p',
  type: 'camp',
  level: L,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});
const team = (n: number, L: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(L, i),
    id: `a${i}`,
    familiarId: `refFam${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const familiars = (n: number, L: number) => {
  const b = refCompanions(L);
  return Array.from({ length: n }, (_, i) => ({ ...b[i % b.length]!, id: `refFam${i}` }));
};
const units = (n: number, L: number): SkirmishUnit[] => {
  const e = team(n, L);
  return roadUnits(
    e,
    roadPairs(e, { familiars: familiars(n, L), talents: [], advGear: refAdvGear(L, n) }),
  );
};
const win = (n: number, L: number, size: number, k = 600) => {
  const g = fuseUnits(units(n, L), 'g');
  const f = campFoe(poiAt(L), { faction: 'bandits', size });
  let w = 0;
  for (let s = 0; s < k; s++)
    if (simulateCombat({ ...g }, { ...f }, { seed: s * 131 + 5, goldOnWin: 0 }).win) w++;
  return w / k;
};
it('pc', () => {
  const out = [`pvTurns=${CAMP.pvTurns} dmgPctPv=${CAMP.dmgPctPv}`];
  for (const L of [12, 26, 45, 70]) {
    const l: string[] = [];
    for (const size of [2, 3, 4, 5, 7, 10])
      l.push(
        `t${size}: N=${win(size, L, size).toFixed(2)} N-1=${win(size - 1, L, size).toFixed(2)} 3=${win(3, L, size).toFixed(2)}`,
      );
    out.push(`niv ${L} · ` + l.join(' | '));
  }
  fs.writeFileSync('pc.out.txt', out.join('\n'));
});
