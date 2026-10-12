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

  it('mode « XP » : le champion en plus rejoint le trajet COURT (XP par heure), pas le long qui rapporte plus par voyage', async () => {
    // « court » : 10 XP par champion en 30 min (20 XP/h) ; « long » : 15 XP en 10 h (1,5 XP/h).
    // Dans le temps d'un long voyage, on refait le court vingt fois : B doit y aller.
    const targets: T[] = [
      { id: 'court', need: 3, min: 30, xp: 10 },
      { id: 'long', need: 3, min: 600, xp: 15 },
    ];
    const r = (await plan(targets, [u('A', 3), u('C', 3), u('B', 1)], 0.9, 'xp'))!;
    const court = r.trips.find((t) => t.target.id === 'court')!;
    const long = r.trips.find((t) => t.target.id === 'long')!;
    expect(court.units.map((x) => x.id)).toContain('B');
    expect(long.units.map((x) => x.id)).not.toContain('B');
  });

  it('mode « XP » : entre deux plans, garde celui qui rapporte le plus d’XP PAR HEURE', async () => {
    // « court » : 3 champions × 19 XP en 30 min = 114 XP/h ; « moyen » : 2 × 54 XP en 1 h =
    // 108 XP/h. Le second rapporte plus d'XP par voyage (108 contre 57), le premier plus par heure.
    const targets: T[] = [
      { id: 'court', need: 5, min: 30, xp: 19, cap: 3 },
      { id: 'long', need: 7, min: 600, xp: 37, cap: 1 },
      { id: 'moyen', need: 6, min: 60, xp: 54, cap: 2 },
    ];
    const units = [u('a', 1), u('b', 5), u('c', 3), u('d', 1)];
    const r = (await plan(targets, units, 0.9, 'xp'))!;
    expect(r.trips.map((t) => t.target.id)).toEqual(['court']);
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

describe('planificateur — consommables autorisés (stock)', () => {
  // 🧪 « potion » ajoute 4 de puissance ; « rations » divise le trajet par deux ; « inutile »
  // n'est jamais emporté (`kit` ne le rend pas, comme `usefulSupplies`).
  const sdeps: PlanDeps<T> = {
    ...deps,
    win: (t, us, kit) =>
      Math.min(
        1,
        (us.reduce((s, x) => s + x.power, 0) + (kit.includes('potion') ? 4 : 0)) / t.need,
      ),
    tripMin: (t, _us, kit) => (kit.includes('rations') ? t.min / 2 : t.min),
    kit: (_t, _us, avail) => avail.filter((id) => id !== 'inutile'),
  };
  const run = (targets: T[], units: PlanUnit[], stock?: Record<string, number>) =>
    planExpeditions(targets, units, {
      threshold: 0.9,
      mode: 'events',
      maxTeam: 6,
      deps: sdeps,
      ...(stock ? { stock } : {}),
    });

  it('sans stock : aucun consommable, comme avant', async () => {
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)]))!;
    expect(r.trips).toEqual([]);
    expect(r.unreachable.map((t) => t.id)).toEqual(['a']);
  });

  it('une potion autorisée rend un lieu prenable, et le pronostic la compte', async () => {
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], { potion: 1 }))!;
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0]!.kit).toEqual(['potion']);
    expect(r.trips[0]!.win).toBe(1);
  });

  it('l’effectif suffit : aucun consommable, même utile et en stock (on les économise)', async () => {
    // Avant (v1.169.0) les rations partaient sur tout voyage où elles servaient.
    const r = (await run([{ id: 'a', need: 1, min: 60, xp: 1 }], [u('A', 1)], {
      rations: 2,
      potion: 3,
      inutile: 5,
    }))!;
    expect(r.trips[0]!.kit).toEqual([]);
    expect(r.trips[0]!.tripMin).toBe(60);
  });

  it('un consommable inutile n’est jamais emporté, même quand il en faut un', async () => {
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], {
      potion: 1,
      inutile: 5,
    }))!;
    expect(r.trips[0]!.kit).toEqual(['potion']);
  });

  it('le stock se partage : jamais plus de voyages avec une potion que de potions', async () => {
    const targets = [
      { id: 'a', need: 5, min: 30, xp: 1 },
      { id: 'b', need: 5, min: 40, xp: 1 },
      { id: 'c', need: 5, min: 50, xp: 1 },
    ];
    const r = (await run(targets, [u('A', 1), u('B', 1), u('C', 1)], { potion: 2 }))!;
    expect(r.trips.filter((t) => t.kit.includes('potion'))).toHaveLength(2);
    expect(r.trips).toHaveLength(2);
    expect(r.unreachable.map((t) => t.id)).toHaveLength(1);
  });

  it('une équipe intacte qui avait compté sur une potion déjà prise est recalculée', async () => {
    // Chaque lieu n'accepte que SON champion : la première passe garde des équipes distinctes,
    // toutes avec une potion. Le stock (1) n'en sert qu'une : les deux autres sont recalculées
    // sans, et ne passent plus.
    const own: PlanDeps<T> = { ...sdeps, fits: (t, us) => us.every((x) => x.id === t.id) };
    const r = (await planExpeditions(
      [
        { id: 'a', need: 5, min: 30, xp: 1 },
        { id: 'b', need: 5, min: 40, xp: 1 },
        { id: 'c', need: 5, min: 50, xp: 1 },
      ],
      // Un point de départ chacun : la première passe trouve bien chaque champion seul.
      [u('a', 1, 'A'), u('b', 1, 'B'), u('c', 1, 'C')],
      { threshold: 0.9, mode: 'events', maxTeam: 6, deps: own, stock: { potion: 1 } },
    ))!;
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0]!.kit).toEqual(['potion']);
    expect(r.unreachable).toHaveLength(2);
  });

  it('un stock épuisé n’est plus emporté : pas de potion sans potion', async () => {
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], { potion: 0 }))!;
    expect(r.trips).toEqual([]);
  });

  it('mode XP : un champion ajouté ne fait pas prendre de consommable en plus', async () => {
    const r = (await planExpeditions(
      [{ id: 'a', need: 5, min: 60, xp: 10 }],
      [u('A', 1), u('B', 1)],
      { threshold: 0.9, mode: 'xp', maxTeam: 6, deps: sdeps, stock: { potion: 1 } },
    ))!;
    expect(r.trips.flatMap((t) => t.kit).filter((k) => k === 'potion').length).toBe(1);
  });
});

describe('planificateur — le consommable pallie un manque d’effectif, au minimum', () => {
  // 🧪 Bonus de puissance par consommable ; « baume » vaut une potion (pour départager au stock).
  // Un lieu avec `road` a une route : sans assez de puissance (carte : +3 pour la route seule),
  // une embuscade sur deux est perdue — la « réussite » compte l'attaque ET la route.
  interface R extends T {
    road?: number;
  }
  const BONUS: Record<string, number> = { potion: 4, baume: 4, pierre: 2, elixir: 1, gemme: 1 };
  const power = (us: PlanUnit[], kit: readonly string[]) =>
    us.reduce((s, x) => s + x.power, 0) + kit.reduce((s, id) => s + (BONUS[id] ?? 0), 0);
  const rdeps: PlanDeps<R> = {
    ...(deps as unknown as PlanDeps<R>),
    win: (t, us, kit) => {
      const attack = Math.min(1, power(us, kit) / t.need);
      const roadP = power(us, kit) + (kit.includes('carte') ? 3 : 0);
      const road = t.road === undefined || roadP >= t.road ? 1 : 0.5;
      return attack * road;
    },
    tripMin: (t) => t.min,
    kit: (_t, _us, avail) => [...avail],
  };
  const run = (targets: R[], units: PlanUnit[], stock: Record<string, number>) =>
    planExpeditions(targets, units, { threshold: 0.9, mode: 'events', maxTeam: 6, deps: rdeps, stock });

  it('l’effectif passe avant : jamais moins de champions grâce à un consommable', async () => {
    // B seul + potion passerait (8/5), mais A + B passent sans rien : on envoie les deux.
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1), u('B', 4)], {
      potion: 3,
    }))!;
    expect(r.trips[0]!.units.map((x) => x.id).sort()).toEqual(['A', 'B']);
    expect(r.trips[0]!.kit).toEqual([]);
  });

  it('le minimum : un seul consommable quand il suffit, pas tout ce qui sert', async () => {
    // 1 + potion = 5 passe ; pierre et élixir serviraient aussi, mais ne sont pas nécessaires.
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], {
      potion: 2,
      pierre: 2,
      elixir: 2,
    }))!;
    expect(r.trips[0]!.kit).toEqual(['potion']);
  });

  it('le minimum en NOMBRE : deux quand deux suffisent, pas trois', async () => {
    // Il faut +3 : pierre + élixir (ou gemme) suffisent ; les trois ensemble, non.
    const r = (await run([{ id: 'a', need: 4, min: 60, xp: 1 }], [u('A', 1)], {
      pierre: 1,
      elixir: 2,
      gemme: 1,
    }))!;
    // À deux exemplaires égaux, l'élixir (stock 2) passe devant la gemme (stock 1).
    expect([...r.trips[0]!.kit].sort()).toEqual(['elixir', 'pierre']);
  });

  it('à nombre égal, le consommable dont on a le plus de stock (on garde les rares)', async () => {
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], {
      potion: 1,
      baume: 6,
    }))!;
    expect(r.trips[0]!.kit).toEqual(['baume']);
    const r2 = (await run([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], {
      potion: 6,
      baume: 1,
    }))!;
    expect(r2.trips[0]!.kit).toEqual(['potion']);
  });

  it('seuil hors d’atteinte même avec tout le stock : rien n’est emporté ni gaspillé', async () => {
    const r = (await run([{ id: 'a', need: 100, min: 60, xp: 1 }], [u('A', 1)], {
      potion: 5,
      pierre: 5,
    }))!;
    expect(r.trips).toEqual([]);
    expect(r.unreachable.map((t) => t.id)).toEqual(['a']);
  });

  it('les embuscades comptent : un consommable pour la route, même si l’attaque passe', async () => {
    // L'attaque passe seule (5/5) ; la route demande 7 : la carte (+3) suffit, la potion aussi
    // (+4) — à nombre égal, la plus fournie.
    const r = (await run([{ id: 'a', need: 5, min: 60, xp: 1, road: 7 }], [u('A', 5)], {
      carte: 4,
      potion: 1,
    }))!;
    expect(r.trips[0]!.kit).toEqual(['carte']);
    // Sans consommable : la route fait échouer le lieu.
    const none = (await run([{ id: 'a', need: 5, min: 60, xp: 1, road: 7 }], [u('A', 5)], {}))!;
    expect(none.trips).toEqual([]);
  });

  it('jamais un consommable que l’équipe n’a pas le droit d’emporter (`kit` le refuse)', async () => {
    // « interdit » ferait passer le seuil, mais `kit` ne le rend jamais (le store le refuserait).
    const strict: PlanDeps<R> = {
      ...rdeps,
      win: (t, us, kit) => Math.min(1, (power(us, kit) + (kit.includes('interdit') ? 4 : 0)) / t.need),
      kit: (_t, _us, avail) => avail.filter((id) => id !== 'interdit'),
    };
    const r = (await planExpeditions([{ id: 'a', need: 5, min: 60, xp: 1 }], [u('A', 1)], {
      threshold: 0.9,
      mode: 'events',
      maxTeam: 6,
      deps: strict,
      stock: { interdit: 9, potion: 1 },
    }))!;
    expect(r.trips[0]!.kit).toEqual(['potion']);
  });

  it('le stock se partage : le lieu qui n’en a pas besoin n’en prend pas', async () => {
    const r = (await run(
      [
        { id: 'facile', need: 1, min: 30, xp: 1 },
        { id: 'dur', need: 5, min: 40, xp: 1 },
      ],
      [u('A', 1, 'A'), u('B', 1, 'B')],
      { potion: 1 },
    ))!;
    expect(r.trips).toHaveLength(2);
    expect(r.trips.find((t) => t.target.id === 'facile')!.kit).toEqual([]);
    expect(r.trips.find((t) => t.target.id === 'dur')!.kit).toEqual(['potion']);
  });
});
