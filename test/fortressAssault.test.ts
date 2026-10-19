import { describe, expect, it } from 'vitest';
import { campWinPct } from '@/lib/camp';
import { heroPartyCombatant, refEscortUnits } from '@/lib/caravan';
import { fortressRankWeight, fortressWeights, isEnemyFortress } from '@/lib/fortressAssault';
import type { Poi } from '@/lib/expedition';
import type { SkirmishUnit } from '@/lib/skirmish';

const place = (kind: 'fortress' | 'objective', owner: 'enemy' | 'player' = 'enemy'): Poi =>
  ({
    id: 'isl_fortress',
    type: 'control',
    level: 60,
    distNorm: 0.5,
    control: { kind, owner, faction: 'mortsvivants', size: 10, garrison: [], retakes: 0 },
  }) as unknown as Poi;

/** `n` champions de référence 3 niveaux sous le héros, et le héros (2 champions). */
function army(hero: number, n: number): SkirmishUnit[] {
  const ref = refEscortUnits(hero - 3);
  const out: SkirmishUnit[] = Array.from({ length: n }, (_, i) => ({
    ...ref[i % ref.length]!,
    id: `c${String(i).padStart(2, '0')}`,
  }));
  const strong = { ...ref[0]!.combatant, pv: 1e7, damage: 1e6 };
  out.push({
    id: 'hero',
    name: 'Héros',
    emoji: '🧝',
    level: hero,
    combatant: heroPartyCombatant({ name: 'Héros', level: hero, combatant: strong }),
  });
  return out;
}

describe('🏰 assaut de forteresse à rendement décroissant', () => {
  it('les 6 premiers comptent en entier, chaque suivant 0,7 fois le précédent', () => {
    expect([0, 5, 6, 7, 8].map(fortressRankWeight)).toEqual([1, 1, 0.7, 0.7 ** 2, 0.7 ** 3]);
  });

  it('les plus forts comptent en premier, le héros toujours en entier', () => {
    const weak = refEscortUnits(20).map((u, i) => ({ ...u, id: `w${i}` }));
    const strong = refEscortUnits(60).map((u, i) => ({ ...u, id: `s${i}` }));
    const units = [...weak, ...weak.map((u) => ({ ...u, id: `${u.id}b` })), ...strong];
    const hero = army(60, 0)[0]!;
    const w = fortressWeights([...units, hero]);
    for (const u of strong) expect(w.get(u.id)).toBe(1);
    expect(w.get('hero')).toBe(1);
    expect([...w.values()].filter((x) => x < 1)).toHaveLength(3);
    // Le classement ne dépend pas de l'ordre d'arrivée.
    expect(fortressWeights([hero, ...[...units].reverse()])).toEqual(w);
  });

  it('seulement contre une forteresse ENNEMIE', () => {
    expect(isEnemyFortress(place('fortress'))).toBe(true);
    expect(isEnemyFortress(place('fortress', 'player'))).toBe(false);
    expect(isEnemyFortress(place('objective'))).toBe(false);
  });

  it('30 champions ne valent plus trois fois 10 : la forteresse résiste au nombre', () => {
    const spec = { faction: 'mortsvivants' as const, size: 10 };
    // Plein (un objectif) : 30 champions au niveau 45 l'écrasent.
    expect(campWinPct(place('objective'), spec, army(45, 30), 120)).toBeGreaterThan(0.9);
    // Forteresse : toujours hors de portée à ce niveau.
    expect(campWinPct(place('fortress'), spec, army(45, 30), 120)).toBeLessThan(0.1);
    // Le joueur actif garde un avantage : 30 font mieux que 10 au niveau 55.
    const ten = campWinPct(place('fortress'), spec, army(55, 10), 120);
    const thirty = campWinPct(place('fortress'), spec, army(55, 30), 120);
    expect(thirty).toBeGreaterThan(ten);
  }, 60_000);
});
