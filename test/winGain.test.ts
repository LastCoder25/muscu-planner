import { describe, expect, it } from 'vitest';
import { partyWinChance, winGain } from '@/lib/partyForecast';
import { refAdvGear, refChampionAdv, type EscortKit } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';
import type { Poi } from '@/lib/expedition';

// 🎯➕ Demandé : « sur chaque tuile, le +% qu'il apporte sur le lieu sélectionné, en tenant
// compte des autres sélectionnés ». L'apport = réussite AVEC lui − réussite SANS lui, l'équipe
// cochée restant la même.
const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'cp',
  type: 'lair',
  level: 30,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const champ = (i: number, level = 30): Adventurer => ({
  ...refChampionAdv(level, i % 3),
  id: `adv_${i}`,
  gear: {
    weapon: `refGear${i % 3}weapon`,
    armor: `refGear${i % 3}armor`,
    accessory: `refGear${i % 3}accessory`,
    relic: `refGear${i % 3}relic`,
  },
});
const road: EscortKit = { talents: [], advGear: refAdvGear(30, 3) };
const team = (n: number) => Array.from({ length: n }, (_, i) => champ(i));
const pct = (e: Adventurer[]) =>
  Math.round((partyWinChance(poi(), e, road, null, 0) ?? 0) * 100);

describe('winGain — ce qu’un membre apporte à la réussite', () => {
  it('c’est la différence de deux 🎯 %, avec la même fonction que l’écran', () => {
    const e = team(2);
    const g = winGain(
      poi(),
      { escort: [...e, champ(2)], hero: null },
      { escort: e, hero: null },
      road,
      0,
    );
    expect(g).toBe(pct([...e, champ(2)]) - pct(e));
  });

  // ⚠️ Signalé : le héros annonçait « +45 % » quand le 🎯 % de l'équipe passait de 0 à 53 % —
  // l'apport simulait 20 combats, le % affiché 40. On balaie plusieurs lieux et équipes : l'apport
  // doit TOUJOURS se lire comme la différence des deux % affichés.
  it('l’apport annoncé = le % affiché avec lui moins le % affiché sans lui, partout', () => {
    for (const level of [20, 30, 40])
      for (const type of ['lair', 'camp'] as const)
        for (let n = 0; n <= 3; n++) {
          const p = poi({ level, type, id: `cp_${type}_${level}` });
          const shown = (e: Adventurer[]) =>
            e.length ? Math.round((partyWinChance(p, e, road, null, 0) ?? 0) * 100) : 0;
          const g = winGain(
            p,
            { escort: [...team(n), champ(n)], hero: null },
            { escort: team(n), hero: null },
            road,
            0,
          );
          expect(g).toBe(shown([...team(n), champ(n)]) - shown(team(n)));
        }
  });

  it('⚠️ il dépend de qui est déjà coché : seul, un champion n’apporte pas ce qu’il apporte en renfort', () => {
    const seul = winGain(
      poi(),
      { escort: [champ(0)], hero: null },
      { escort: [], hero: null },
      road,
      0,
    )!;
    const renfort = winGain(
      poi(),
      { escort: team(3), hero: null },
      { escort: team(2), hero: null },
      road,
      0,
    )!;
    expect(seul).toBe(pct([champ(0)]));
    expect(renfort).toBe(pct(team(3)) - pct(team(2)));
    expect(seul).not.toBe(renfort);
  });

  it('une équipe vide vaut 0 % (elle ne part pas)', () => {
    expect(
      winGain(poi(), { escort: [champ(0)], hero: null }, { escort: [], hero: null }, road, 0),
    ).toBe(pct([champ(0)]));
  });

  it('rien à combattre (récolte sans gardes, sans route) : aucun apport annoncé', () => {
    const arene = poi({ type: 'arena' });
    expect(
      winGain(arene, { escort: [champ(0)], hero: null }, { escort: [], hero: null }, road, 0),
    ).toBeNull();
  });
});
