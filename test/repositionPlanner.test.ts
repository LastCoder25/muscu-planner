import { describe, expect, it } from 'vitest';
import { planReposition, type RepoTeam, type RepoUnit } from '../src/lib/repositionPlanner';

// Une carte en ligne : la base en 0, des lieux fixes A (10) et B (100), des cibles à x.
const POS: Record<string, number> = { base: 0, A: 10, B: 100 };
const u = (id: string, loc: string, hero = false): RepoUnit => ({ id, loc, hero });
const team = (x: number, ...units: RepoUnit[]): RepoTeam<number> => ({ target: x, units });
const deps = {
  tripMin: (t: RepoTeam<number>, o: string) => 2 * Math.abs(t.target - POS[o]!),
  moveMin: (un: RepoUnit, to: string) => Math.abs(POS[un.loc]! - POS[to]!),
  canHost: () => true,
};

describe('planReposition — répartir pour raccourcir les trajets', () => {
  it('déplace une équipe vers le lieu fixe proche de sa cible', () => {
    const r = planReposition([team(95, u('a', 'base'))], deps, {
      free: { A: 3, B: 3 },
      payback: 3,
    });
    expect(r.assignments[0]!.origin).toBe('B');
    expect(r.moves).toEqual([{ unit: u('a', 'base'), from: 'base', to: 'B', min: 100 }]);
  });

  it('ne bouge pas quand le déplacement ne se rentabilise pas', () => {
    // Cible à 6 : partir de A gagne 4 min par expé, le déplacement en coûte 10.
    const r = planReposition([team(6, u('a', 'base'))], deps, { free: { A: 3 }, payback: 1 });
    expect(r.assignments[0]!.origin).toBe('base');
    expect(r.moves).toEqual([]);
  });

  it('respecte les places libres, et le héros en prend deux', () => {
    const r = planReposition([team(95, u('h', 'base', true)), team(96, u('a', 'base'))], deps, {
      free: { B: 2 },
      payback: 3,
    });
    const at = r.assignments.filter((a) => a.origin === 'B');
    expect(at.length).toBe(1);
    // La place libérée en partant compte : un posté de B qui part rend sa place.
    const r2 = planReposition([team(5, u('x', 'B')), team(96, u('a', 'base'))], deps, {
      free: { B: 0 },
      payback: 3,
    });
    expect(r2.assignments.find((a) => a.team.units[0]!.id === 'a')!.origin).toBe('B');
  });

  it('à égalité, personne ne bouge (un déplacement qui ne gagne rien est un clic de trop)', () => {
    const flat = { tripMin: () => 50, moveMin: () => 0, canHost: () => true };
    const r = planReposition([team(50, u('a', 'A'))], flat, { free: { A: 3, B: 3 }, payback: 3 });
    expect(r.assignments[0]!.origin).toBe('A');
    expect(r.moves).toEqual([]);
  });

  it('une équipe dispersée se réunit en un seul endroit', () => {
    const r = planReposition([team(98, u('a', 'A'), u('b', 'B'))], deps, {
      free: { A: 3, B: 3 },
      payback: 3,
    });
    expect(r.assignments[0]!.origin).toBe('B');
    expect(r.assignments[0]!.nowTripMin).toBeNull();
    expect(r.moves.map((m) => m.unit.id)).toEqual(['a']);
  });

  it("un endroit qui refuse un membre n'est pas choisi", () => {
    const r = planReposition(
      [team(95, u('h', 'base', true))],
      { ...deps, canHost: (un, to) => !(un.hero && to === 'B') },
      {
        free: { A: 3, B: 3 },
        payback: 3,
      },
    );
    expect(r.assignments[0]!.origin).not.toBe('B');
  });

  it("sert d'abord l'équipe qui a le plus à gagner", () => {
    const r = planReposition([team(60, u('a', 'base')), team(100, u('b', 'base'))], deps, {
      free: { B: 1 },
      payback: 3,
    });
    expect(r.assignments.find((a) => a.team.units[0]!.id === 'b')!.origin).toBe('B');
  });
});
