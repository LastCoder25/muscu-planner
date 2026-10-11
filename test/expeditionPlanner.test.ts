import { describe, expect, it } from 'vitest';
import { planExpeditions, type PlanDeps, type PlanUnit } from '@/lib/expeditionPlanner';

/** Un lieu de test : il faut `need` de puissance cumulée pour être sûr de gagner. */
interface T {
  id: string;
  need: number;
  min: number;
  xp: number;
  noHero?: boolean;
  cap?: number;
}
const u = (id: string, power: number, origin = 'base', hero = false): PlanUnit => ({
  id,
  power,
  origin,
  hero,
});
const deps: PlanDeps<T> = {
  fits: (t, us) =>
    us.length <= (t.cap ?? 9) && !(t.noHero && us.some((x) => x.hero)) && us.length > 0,
  win: (t, us) => Math.min(1, us.reduce((s, x) => s + x.power, 0) / t.need),
  tripMin: (t) => t.min,
  xp: (t, us) => t.xp * us.filter((x) => !x.hero).length,
};
const plan = (targets: T[], units: PlanUnit[], threshold = 0.9, mode: 'events' | 'xp' = 'events') =>
  planExpeditions(targets, units, { threshold, mode, maxTeam: 6, deps });

describe('planificateur d’expéditions', () => {
  it('mode XP : le héros ne part jamais seul (il n’apprend rien à personne)', async () => {
    // Le champion part seul sur le lieu facile ; sans la règle, le héros partirait SEUL sur
    // l'autre (il suffit), pour 0 XP.
    const t = [
      { id: 'facile', need: 1, min: 30, xp: 10 },
      { id: 'dur', need: 5, min: 30, xp: 10 },
    ];
    const units = [u('H', 9, 'base', true), u('W', 1)];
    const xp = (await plan(t, units, 0.9, 'xp'))!;
    expect(xp.trips.some((tr) => tr.units.every((x) => x.hero))).toBe(false);
    expect(xp.trips).toHaveLength(1);
    // En mode Événements, le héros seul reste permis : on prend les deux lieux.
    const ev = (await plan(t, units, 0.9, 'events'))!;
    expect(ev.trips).toHaveLength(2);
  });

  it('garde le fort pour le lieu difficile : le faible suffit au facile', async () => {
    const r = (await plan(
      [
        { id: 'facile', need: 3, min: 30, xp: 10 },
        { id: 'dur', need: 10, min: 60, xp: 10 },
      ],
      [u('S', 10), u('W', 3)],
    ))!;
    expect(
      r.trips.map((t) => `${t.target.id}:${t.units.map((x) => x.id).join('')}`).sort(),
    ).toEqual(['dur:S', 'facile:W']);
    expect(r.unreachable).toEqual([]);
  });

  it('respecte le seuil : un lieu hors de portée est listé à part', async () => {
    const r = (await plan([{ id: 'x', need: 100, min: 30, xp: 1 }], [u('A', 5), u('B', 5)]))!;
    expect(r.trips).toEqual([]);
    expect(r.unreachable.map((t) => t.id)).toEqual(['x']);
    // Chance de 50 % : passe à un seuil de 40 %, pas à 90 %.
    const low = (await plan([{ id: 'x', need: 20, min: 30, xp: 1 }], [u('A', 5), u('B', 5)], 0.4))!;
    expect(low.trips.length).toBe(1);
    expect(low.trips[0]!.win).toBeCloseTo(0.5);
  });

  it('chaque champion ne part qu’une fois', async () => {
    const r = (await plan(
      [
        { id: 'a', need: 3, min: 30, xp: 1 },
        { id: 'b', need: 3, min: 40, xp: 1 },
        { id: 'c', need: 3, min: 50, xp: 1 },
      ],
      [u('A', 3), u('B', 3)],
    ))!;
    const ids = r.trips.flatMap((t) => t.units.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.trips.length).toBe(2);
    expect(r.unreachable.length).toBe(1);
  });

  it('une équipe part d’un seul endroit (jamais base + garnison mélangées)', async () => {
    const r = (await plan(
      [{ id: 'a', need: 6, min: 30, xp: 1 }],
      [u('A', 3, 'base'), u('B', 3, 'mine')],
    ))!;
    expect(r.trips).toEqual([]);
    const ok = (await plan(
      [{ id: 'a', need: 6, min: 30, xp: 1 }],
      [u('A', 3, 'mine'), u('B', 3, 'mine')],
    ))!;
    expect(ok.trips[0]!.units.every((x) => x.origin === 'mine')).toBe(true);
  });

  it('le héros n’est pas emmené là où il est refusé (filon)', async () => {
    const r = (await plan(
      [{ id: 'filon', need: 3, min: 30, xp: 1, noHero: true }],
      [u('H', 50, 'base', true), u('A', 3)],
    ))!;
    expect(r.trips[0]!.units.map((x) => x.id)).toEqual(['A']);
  });

  it('respecte la taille d’équipe permise', async () => {
    const r = (await plan(
      [{ id: 'a', need: 9, min: 30, xp: 1, cap: 2 }],
      [u('A', 3), u('B', 3), u('C', 3)],
    ))!;
    expect(r.trips).toEqual([]);
  });

  it('mode « événements » : le plus d’événements, les trajets les plus courts en tête', async () => {
    const r = (await plan(
      [
        { id: 'long', need: 3, min: 300, xp: 1 },
        { id: 'court', need: 3, min: 30, xp: 1 },
      ],
      [u('A', 3), u('B', 3)],
    ))!;
    expect(r.trips.map((t) => t.target.id)).toEqual(['court', 'long']);
    // ⚠️ L'ordre AFFICHÉ suit le trajet, même quand le lieu court demande une plus grande équipe
    // (servi après, mais montré d'abord).
    const mix = (await plan(
      [
        { id: 'solo-long', need: 3, min: 300, xp: 1 },
        { id: 'duo-court', need: 6, min: 30, xp: 1 },
      ],
      [u('A', 3), u('B', 3), u('C', 3)],
    ))!;
    expect(mix.trips.map((t) => t.target.id)).toEqual(['duo-court', 'solo-long']);
  });

  it('mode « XP » : à vivier limité, le lieu qui rapporte le plus d’XP par heure passe d’abord', async () => {
    const targets: T[] = [
      { id: 'maigre', need: 3, min: 60, xp: 10 },
      { id: 'riche', need: 3, min: 60, xp: 100 },
    ];
    const xp = (await plan(targets, [u('A', 3)], 0.9, 'xp'))!;
    expect(xp.trips.map((t) => t.target.id)).toEqual(['riche']);
    // L'XP annoncée est pondérée par la chance (ici 100 %).
    expect(xp.trips[0]!.xp).toBe(100);
  });

  it('mode « XP » : un champion qui resterait à la base rejoint une équipe, pas en mode événements', async () => {
    const targets: T[] = [{ id: 'camp', need: 3, min: 60, xp: 50 }];
    const units = [u('A', 3), u('B', 1)];
    const ev = (await plan(targets, units))!;
    expect(ev.trips[0]!.units.map((x) => x.id)).toEqual(['A']);
    const xp = (await plan(targets, units, 0.9, 'xp'))!;
    expect(xp.trips[0]!.units.map((x) => x.id).sort()).toEqual(['A', 'B']);
    expect(xp.trips[0]!.xp).toBe(100);
    // Pas d'ajout si l'équipe n'a plus le droit de grossir, ni d'un autre point de départ.
    const capped = (await plan([{ ...targets[0]!, cap: 1 }], units, 0.9, 'xp'))!;
    expect(capped.trips[0]!.units.length).toBe(1);
    const far = (await plan(targets, [u('A', 3), u('B', 1, 'mine')], 0.9, 'xp'))!;
    expect(far.trips[0]!.units.map((x) => x.id)).toEqual(['A']);
  });

  it('mode « XP » : un Mentor n’est pas remplacé par un plus faible qui rapporte moins', async () => {
    // 🎓 « M » double l'XP de son équipe ; « W » suffit pourtant au combat.
    const mentorDeps: PlanDeps<T> = {
      ...deps,
      xp: (t, us) => t.xp * us.length * (us.some((x) => x.id === 'M') ? 2 : 1),
    };
    const run = (mode: 'events' | 'xp') =>
      planExpeditions([{ id: 'camp', need: 3, min: 60, xp: 50, cap: 1 }], [u('M', 5), u('W', 3)], {
        threshold: 0.9,
        mode,
        maxTeam: 6,
        deps: mentorDeps,
      });
    // Événements : le plus faible part, le Mentor reste libre.
    expect((await run('events'))!.trips[0]!.units.map((x) => x.id)).toEqual(['W']);
    // XP : le Mentor part (100 XP au lieu de 50).
    const xp = (await run('xp'))!;
    expect(xp.trips[0]!.units.map((x) => x.id)).toEqual(['M']);
    expect(xp.trips[0]!.xp).toBe(100);
  });

  it('s’arrête si un nouveau calcul démarre', async () => {
    const r = await planExpeditions([{ id: 'a', need: 3, min: 30, xp: 1 }], [u('A', 3)], {
      threshold: 0.9,
      mode: 'events',
      maxTeam: 6,
      deps,
      cancelled: () => true,
    });
    expect(r).toBeNull();
  });
});

describe('planificateur — attaque combinée et temps occupé', () => {
  // Trajet selon le point de départ : A et B sont près du lieu, la base est loin.
  const near: Record<string, number> = { base: 300, A: 30, B: 40 };
  const geo: PlanDeps<T> = {
    ...deps,
    tripMin: (_t, us) => Math.max(...us.map((x) => near[x.origin]!)),
  };
  const run = (units: PlanUnit[], combined: boolean) =>
    planExpeditions([{ id: 'dur', need: 10, min: 0, xp: 1 }], units, {
      threshold: 0.9,
      mode: 'events',
      maxTeam: 6,
      deps: geo,
      combined,
    });

  it('réunit une équipe de deux endroits proches plutôt que de partir de loin', async () => {
    // La base en tête de liste : seul l'ordre « plus proche d'abord » trouve A + B.
    const units = [u('x', 5, 'base'), u('y', 5, 'base'), u('a', 5, 'A'), u('b', 5, 'B')];
    const r = (await run(units, true))!;
    expect(r.trips[0]!.units.map((x) => x.origin).sort()).toEqual(['A', 'B']);
    expect(r.trips[0]!.tripMin).toBe(40);
    // Sans attaque combinée, seule la base a deux champions : 300 min.
    const solo = (await run(units, false))!;
    expect(solo.trips[0]!.tripMin).toBe(300);
  });

  it('juge sur le temps occupé (champions × trajet), pas sur le nombre seul', async () => {
    // Un champion seul de la base (300 min) contre deux de A (30 min) : 300 > 60.
    const units = [u('x', 10, 'base'), u('a', 5, 'A'), u('b', 5, 'A')];
    const r = (await run(units, false))!;
    expect(r.trips[0]!.units.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });
});
