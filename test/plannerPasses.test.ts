import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseModes,
  planExpeditions,
  planInPasses,
  toggleMode,
  type PlanDeps,
  type PlanMode,
  type PlanUnit,
} from '@/lib/expeditionPlanner';

/** 🪄 Priorités multiples du planificateur (2026-10-30, demandé : « de 1 à 3 choix, dans l'ordre
 *  cliqué »). Lieu de test : `need` de puissance cumulée pour être sûr de gagner. */
interface T {
  id: string;
  need: number;
  min: number;
}
const u = (id: string, power: number, origin = 'base', hero = false): PlanUnit => ({
  id,
  power,
  origin,
  hero,
});
const deps: PlanDeps<T> = {
  fits: (_t, us) => us.length > 0,
  // Une potion vaut +4 de puissance : elle pallie un manque d'effectif.
  win: (t, us, kit) => Math.min(1, (us.reduce((s, x) => s + x.power, 0) + 4 * kit.length) / t.need),
  tripMin: (t) => t.min,
  xp: (_t, us) => us.filter((x) => !x.hero).length,
  kit: (_t, _us, avail) => avail.filter((id) => id === 'potion'),
};
const base = { threshold: 0.9, maxTeam: 6, deps };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

const rift: T = { id: 'rift', need: 5, min: 90 };
const lieu: T = { id: 'lieu', need: 5, min: 20 };
const lieu2: T = { id: 'lieu2', need: 5, min: 30 };
/** Les failles ne visent que `rift` ; les autres priorités, tout. */
const targetsOf =
  (all: T[]) =>
  (m: PlanMode): T[] =>
    m === 'rifts' ? all.filter((t) => t.id === 'rift') : all;

describe('priorités : la préférence sauvegardée', () => {
  it('une ancienne valeur seule reste lue ; la liste garde l’ordre', () => {
    expect(parseModes('rifts')).toEqual(['rifts']);
    expect(parseModes('xp')).toEqual(['xp']);
    expect(parseModes('rifts,events')).toEqual(['rifts', 'events']);
    expect(parseModes('xp,rifts,events')).toEqual(['xp', 'rifts', 'events']);
  });
  it('défaut = lieux ; inconnues et doublons écartés ; 3 au plus', () => {
    expect(parseModes(null)).toEqual(['events']);
    expect(parseModes('')).toEqual(['events']);
    expect(parseModes('n’importe quoi')).toEqual(['events']);
    expect(parseModes('rifts,zzz,rifts,xp')).toEqual(['rifts', 'xp']);
    expect(parseModes('rifts,xp,events,rifts,xp').length).toBeLessThanOrEqual(3);
  });
});

describe('priorités : toucher une tuile', () => {
  it('ajoute en fin de liste (l’ordre cliqué)', () => {
    expect(toggleMode(['events'], 'rifts')).toEqual(['events', 'rifts']);
    expect(toggleMode(['rifts', 'events'], 'xp')).toEqual(['rifts', 'events', 'xp']);
  });
  it('retire une tuile choisie, les suivantes remontent', () => {
    expect(toggleMode(['rifts', 'events', 'xp'], 'rifts')).toEqual(['events', 'xp']);
    expect(toggleMode(['rifts', 'events', 'xp'], 'events')).toEqual(['rifts', 'xp']);
  });
  it('garde toujours au moins une priorité : retirer la dernière est refusé', () => {
    expect(toggleMode(['xp'], 'xp')).toEqual(['xp']);
  });
});

describe('priorités : câblage du composable (lecture de la source, pas un comportement)', () => {
  it('lit et écrit la préférence en liste, et calcule par passes', () => {
    const src = readFileSync('src/composables/useExpeditionPlanner.ts', 'utf8').replace(/\s+/g, '');
    expect(src).toContain('parseModes(readStr(MODE_KEY))');
    expect(src).toContain("save(MODE_KEY,v.join(','))");
    expect(src).toContain('planInPasses(units,{modes:modes.value');
  });
});

describe('priorités : le calcul par passes', () => {
  it('un seul mode = exactement planExpeditions (mêmes voyages, mêmes inaccessibles)', async () => {
    const targets = [lieu, lieu2, rift];
    const units = [u('A', 3), u('B', 2), u('C', 2)];
    for (const mode of ['events', 'xp', 'rifts'] as PlanMode[]) {
      const direct = await planExpeditions(targets, units, { ...base, mode, stock: { potion: 1 } });
      const passes = await planInPasses(units, {
        ...base,
        modes: [mode],
        targetsOf: () => targets,
        stock: { potion: 1 },
      });
      expect(passes!.trips).toEqual(direct!.trips);
      expect(passes!.unreachable).toEqual(direct!.unreachable);
    }
  });

  it('la 1re priorité est servie d’abord, la suivante avec ce qui reste', async () => {
    const all = [rift, lieu];
    const units = [u('A', 5)];
    const failleD = (await planInPasses(units, {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf(all),
    }))!;
    expect(ids(failleD.trips.map((t) => t.target))).toEqual(['rift']);
    expect(failleD.tripModes).toEqual(['rifts']);
    expect(ids(failleD.unreachable)).toEqual(['lieu']);
    // Dans l'autre ordre, le lieu (voyage court) prend l'unique champion.
    const lieuD = (await planInPasses(units, {
      ...base,
      modes: ['events', 'rifts'],
      targetsOf: targetsOf(all),
    }))!;
    expect(ids(lieuD.trips.map((t) => t.target))).toEqual(['lieu']);
    expect(ids(lieuD.unreachable)).toEqual(['rift']);
  });

  it('les voyages s’enchaînent dans l’ordre des passes, chacun étiqueté de sa priorité', async () => {
    const res = (await planInPasses([u('A', 5), u('B', 5)], {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf([rift, lieu]),
    }))!;
    expect(ids(res.trips.map((t) => t.target))).toEqual(['rift', 'lieu']);
    expect(res.tripModes).toEqual(['rifts', 'events']);
    expect(res.unreachable).toEqual([]);
  });

  it('qui est parti dans une passe ne repart pas dans la suivante', async () => {
    const targets = [rift, lieu, lieu2];
    const res = (await planInPasses([u('A', 5), u('B', 5)], {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf(targets),
    }))!;
    expect(res.trips).toHaveLength(2); // 2 champions : 2 voyages, pas 3
    const used = res.trips.flatMap((t) => ids(t.units));
    expect(new Set(used).size).toBe(used.length);
    expect(ids(res.unreachable)).toEqual(['lieu2']);
  });

  it('un lieu déjà planifié n’est pas replanifié par la passe suivante', async () => {
    // `rift` est dans les cibles des deux passes ; deux champions suffiraient à le planifier deux fois.
    const res = (await planInPasses([u('A', 5), u('B', 5)], {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf([rift]),
    }))!;
    expect(ids(res.trips.map((t) => t.target))).toEqual(['rift']);
  });

  it('le stock de consommables se partage entre les passes', async () => {
    // Chaque lieu exige une potion (1 de puissance contre 5 requis) ; une seule en stock.
    const a: T = { id: 'rift', need: 5, min: 90 };
    const b: T = { id: 'lieu', need: 5, min: 20 };
    const res = (await planInPasses([u('A', 1), u('B', 1)], {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf([a, b]),
      stock: { potion: 1 },
    }))!;
    expect(res.trips.filter((t) => t.kit.includes('potion'))).toHaveLength(1);
    expect(ids(res.trips.map((t) => t.target))).toEqual(['rift']);
    expect(ids(res.unreachable)).toEqual(['lieu']);
  });

  it('inaccessible = hors de portée de TOUTES les passes (une passe suivante peut l’atteindre)', async () => {
    // Le héros seul : refusé en mode XP (il n’apprend rien à personne), permis en lieux.
    const res = (await planInPasses([u('__hero', 5, 'base', true)], {
      ...base,
      modes: ['xp', 'events'],
      targetsOf: () => [lieu],
    }))!;
    expect(ids(res.trips.map((t) => t.target))).toEqual(['lieu']);
    expect(res.tripModes).toEqual(['events']);
    expect(res.unreachable).toEqual([]);
  });

  it('à 3 passes : un lieu hors de portée de toutes reste inaccessible, un lieu rattrapé par une passe suivante en sort', async () => {
    // Un lieu que personne n'atteint (puissance 99) ; un lieu que le héros seul n'atteint qu'en
    // mode « lieux » (le mode XP refuse le héros seul).
    const hors: T = { id: 'hors', need: 99, min: 10 };
    const res = (await planInPasses([u('__hero', 5, 'base', true)], {
      ...base,
      modes: ['xp', 'rifts', 'events'],
      // Passe 1 (xp) : lieu refusé (héros seul) et hors ; passe 2 (rifts) : lieu atteint ;
      // passe 3 (events) : plus personne pour lieu2.
      targetsOf: (m) => (m === 'xp' ? [lieu, hors] : m === 'rifts' ? [lieu] : [lieu2]),
    }))!;
    expect(ids(res.trips.map((t) => t.target))).toEqual(['lieu']);
    expect(res.tripModes).toEqual(['rifts']);
    expect(ids(res.unreachable)).toEqual(['hors', 'lieu2']);
  });

  it('plus personne pour la passe suivante : ses lieux sont inaccessibles', async () => {
    const res = (await planInPasses([u('A', 5)], {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf([rift, lieu, lieu2]),
    }))!;
    expect(ids(res.trips.map((t) => t.target))).toEqual(['rift']);
    expect(ids(res.unreachable).sort()).toEqual(['lieu', 'lieu2']);
  });

  it('un calcul annulé rend null', async () => {
    const res = await planInPasses([u('A', 5)], {
      ...base,
      modes: ['rifts', 'events'],
      targetsOf: targetsOf([rift, lieu]),
      cancelled: () => true,
    });
    expect(res).toBeNull();
  });
});
