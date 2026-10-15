import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';
import { buildDeployment, buildDeploymentAsync, DEPLOY_HERO_ID } from '@/lib/deployPlan';
import type { SkillId } from '@/lib/skillRunes';
import { gearedFighter } from './helpers/gearedFighter';

/** 🧭 « Répartir » de bout en bout : vrais champions, vraie règle de trajet (2026-10-15). */
const champ = (n: string, skills: { id: SkillId; level: number }[] = []): Adventurer => ({
  id: n,
  name: n,
  seed: 1,
  path: [],
  level: 30,
  xp: 0,
  championId: CHAMPIONS[0]!.id,
  copies: 1,
  skills,
});
const input = (advs: Adventurer[], withHero = true) => ({
  map: null,
  atBase: advs,
  garrisons: new Map<string, Adventurer[]>(),
  hero: withHero
    ? { party: { name: 'H', level: 30, combatant: gearedFighter(30) }, loc: 'base' }
    : null,
  road: { advGear: [] },
  heroLevel: 30,
  travelMult: 1,
  outpostLevel: 1,
});

describe('buildDeployment', () => {
  it('tout le monde est placé, le héros compris', () => {
    const advs = ['a', 'b', 'c'].map((n) => champ(n));
    const out = buildDeployment(input(advs))!;
    expect(out.units.map((u) => u.id).sort()).toEqual(['__hero', 'a', 'b', 'c']);
    for (const u of out.units) expect(out.plan.spotOf.get(u.id)).toBeDefined();
    expect(out.plan.spotOf.get(DEPLOY_HERO_ID)).toBe('base');
    expect(out.plan.reach).toBeGreaterThan(0);
  });

  it('personne à placer : rien', () => {
    expect(buildDeployment(input([], false))).toBeNull();
  });

  it('la vitesse des champions raccourcit le temps rendu (règle des missions)', () => {
    const slow = buildDeployment(
      input(
        ['a', 'b'].map((n) => champ(n)),
        false,
      ),
    )!;
    const fast = buildDeployment(
      input(
        ['a', 'b'].map((n) => champ(n, [{ id: 'speed', level: 5 }])),
        false,
      ),
    )!;
    expect(fast.plan.reach).toBeLessThan(slow.plan.reach);
  });

  it('la version qui rend la main donne la même répartition', async () => {
    const advs = ['a', 'b', 'c'].map((n) => champ(n));
    const a = buildDeployment(input(advs))!;
    const b = (await buildDeploymentAsync(input(advs)))!;
    expect([...b.plan.spotOf].sort()).toEqual([...a.plan.spotOf].sort());
  });
});
