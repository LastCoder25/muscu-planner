import { describe, expect, it } from 'vitest';
import {
  WAVE_MAX_TRIPS,
  planReplay,
  replayDeps,
  tripAdvIds,
  waveCounts,
  waveFromRows,
  waveKey,
  waveKeyLabel,
  type LastWave,
  type ReplayDeps,
  type ReplayWorld,
  type WaveRowInput,
  type WaveTrip,
} from '@/lib/lastWave';
import { refAdvGear, refChampionAdv, type PartyHero } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';
import { advanceWorld, createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { archipelOn } from '@/lib/archipelago';
import { refFighter } from '@/lib/proceduralContent';
import { PARTY_HERO_BLOCK_LABEL, PARTY_SEND_BLOCK_LABEL } from '@/lib/party';

const poi = (id: string, type: Poi['type'] = 'mine', over: Partial<Poi> = {}): Poi => ({
  id,
  type,
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const trip = (key: string, ids: string[], over: Partial<WaveTrip> = {}): WaveTrip => ({
  key,
  wings: [{ originId: null, advIds: ids, hero: false }],
  supplies: [],
  ...over,
});
const wave = (...trips: WaveTrip[]): LastWave => ({ at: 1_000, trips });

/** Des dépendances simples : on ne teste ici que la RÉPARTITION. */
const deps = (targets: Poi[], over: Partial<ReplayDeps<Poi>> = {}): ReplayDeps<Poi> => ({
  targets,
  keyOf: waveKey,
  idOf: (p) => p.id,
  teamBlocker: () => null,
  sendBlocker: () => null,
  ...over,
});

describe('🔁 waveFromRows — ce qui est retenu d’une vague', () => {
  const row = (over: Partial<WaveRowInput> = {}): WaveRowInput => ({
    poi: { type: 'mine' },
    advs: [{ id: 'a' }, { id: 'b' }],
    hero: false,
    from: null,
    wings: null,
    supplies: [],
    ...over,
  });

  it('un départ simple : un groupe, d’où il part, avec ses consommables', () => {
    const w = waveFromRows([row({ from: { id: 'fort' }, hero: true, supplies: ['rations'] })], 42)!;
    expect(w.at).toBe(42);
    expect(w.trips).toEqual([
      {
        key: 'mine',
        wings: [{ originId: 'fort', advIds: ['a', 'b'], hero: true }],
        supplies: ['rations'],
      },
    ]);
  });

  it('une attaque combinée garde un groupe par point de départ', () => {
    const w = waveFromRows(
      [
        row({
          poi: { type: 'camp' },
          wings: [
            { from: null, advs: [{ id: 'a' }], hero: true },
            { from: { id: 'fort' }, advs: [{ id: 'b' }], hero: false },
          ],
        }),
      ],
      1,
    )!;
    expect(w.trips[0]!.wings).toEqual([
      { originId: null, advIds: ['a'], hero: true },
      { originId: 'fort', advIds: ['b'], hero: false },
    ]);
    expect(tripAdvIds(w.trips[0]!)).toEqual(['a', 'b']);
  });

  it('rien de parti : pas de vague (on ne remplace pas la précédente par du vide)', () => {
    expect(waveFromRows([], 1)).toBeNull();
  });

  it('la vague est bornée', () => {
    const many = Array.from({ length: WAVE_MAX_TRIPS + 5 }, () => row());
    expect(waveFromRows(many, 1)!.trips).toHaveLength(WAVE_MAX_TRIPS);
  });

  it('le type d’un lieu distingue les points de contrôle par leur genre', () => {
    expect(waveKey({ type: 'mine' })).toBe('mine');
    const ctl = (kind: string) =>
      ({ type: 'control', control: { kind } }) as Pick<Poi, 'type' | 'control'>;
    expect(waveKey(ctl('mine'))).toBe('control:mine');
    expect(waveKey(ctl('garden'))).not.toBe(waveKey(ctl('mine')));
    expect(waveKeyLabel('mine')).toContain('Mine');
    // Un type retiré depuis, ou un genre de point inconnu : repli lisible, jamais « undefined ».
    expect(waveKeyLabel('epave_retiree')).toBe('📍 Lieu');
    expect(waveKeyLabel('control:inconnu')).toBe('📍 Lieu');
  });

  it('pastilles : un compte par type, dans l’ordre du départ', () => {
    const c = waveCounts(wave(trip('mine', ['a']), trip('camp', ['b']), trip('mine', ['c'])));
    expect(c.map((x) => [x.key, x.n])).toEqual([
      ['mine', 2],
      ['camp', 1],
    ]);
  });
});

describe('🔁 planReplay — les mêmes équipes sur des lieux du même type', () => {
  it('chaque départ prend un lieu de SON type, et un lieu ne sert qu’une fois', () => {
    const t = [poi('m1'), poi('c1', 'camp'), poi('m2')];
    const r = planReplay(
      wave(trip('mine', ['a']), trip('mine', ['b']), trip('camp', ['c'])),
      deps(t),
    );
    expect(r.skipped).toEqual([]);
    expect(r.sends.map((s) => s.target.id)).toEqual(['m1', 'm2', 'c1']);
  });

  it('un type absent est LISTÉ avec sa raison, pas ignoré', () => {
    const r = planReplay(wave(trip('mine', ['a']), trip('rift', ['b'])), deps([poi('m1')]));
    expect(r.sends).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.trip.key).toBe('rift');
    expect(r.skipped[0]!.reason).toMatch(/aucun lieu de ce type/);
  });

  it('plus de départs que de lieux : les derniers restent, avec leur raison', () => {
    const r = planReplay(wave(trip('mine', ['a']), trip('mine', ['b'])), deps([poi('m1')]));
    expect(r.sends).toHaveLength(1);
    expect(r.skipped.map((s) => s.trip.wings[0]!.advIds[0])).toEqual(['b']);
  });

  it('une équipe qui n’est plus libre ne part pas, et dit pourquoi', () => {
    const r = planReplay(
      wave(trip('mine', ['a']), trip('mine', ['b'])),
      deps([poi('m1'), poi('m2')], {
        teamBlocker: (t) => (t.wings[0]!.advIds[0] === 'a' ? 'Léa n’est pas libre' : null),
      }),
    );
    expect(r.sends.map((s) => s.trip.wings[0]!.advIds[0])).toEqual(['b']);
    expect(r.skipped).toEqual([expect.objectContaining({ reason: 'Léa n’est pas libre' })]);
    // Le lieu de l'équipe qui reste n'est pas consommé : l'autre prend le premier.
    expect(r.sends[0]!.target.id).toBe('m1');
  });

  it('un lieu refusé laisse la place au suivant du même type', () => {
    const r = planReplay(
      wave(trip('mine', ['a'])),
      deps([poi('dur'), poi('facile')], {
        sendBlocker: (_t, p) => (p.id === 'dur' ? 'chance de 40 %' : null),
      }),
    );
    expect(r.sends[0]!.target.id).toBe('facile');
  });

  it('tous les lieux refusent : la raison du premier, avec le compte', () => {
    const r = planReplay(
      wave(trip('mine', ['a'])),
      deps([poi('m1'), poi('m2')], { sendBlocker: (_t, p) => `refus ${p.id}` }),
    );
    expect(r.sends).toEqual([]);
    expect(r.skipped[0]!.reason).toBe('refus m1 (2 lieux essayés)');
  });

  it('un champion présent dans deux départs ne part qu’une fois', () => {
    const r = planReplay(
      wave(trip('mine', ['a', 'b']), trip('mine', ['b', 'c'])),
      deps([poi('m1'), poi('m2')]),
    );
    expect(r.sends).toHaveLength(1);
    expect(r.skipped[0]!.reason).toMatch(/repart déjà/);
  });

  it('le stock de consommables se partage dans l’ordre : jamais plus de départs que d’exemplaires', () => {
    const seen: string[][] = [];
    const r = planReplay(
      wave(
        trip('mine', ['a'], { supplies: ['rations'] }),
        trip('mine', ['b'], { supplies: ['rations'] }),
      ),
      deps([poi('m1'), poi('m2')], {
        kitFor: (_t, _p, avail) => {
          seen.push([...avail]);
          return [...avail];
        },
      }),
      { rations: 1 },
    );
    expect(r.sends.map((s) => s.trip.supplies)).toEqual([['rations'], []]);
    expect(seen).toEqual([['rations'], []]);
  });

  it('sans `kitFor`, aucun consommable n’est emporté', () => {
    const r = planReplay(wave(trip('mine', ['a'], { supplies: ['rations'] })), deps([poi('m1')]), {
      rations: 5,
    });
    expect(r.sends[0]!.trip.supplies).toEqual([]);
  });

  it('un départ refusé ne consomme pas le stock', () => {
    const r = planReplay(
      wave(
        trip('camp', ['a'], { supplies: ['rations'] }),
        trip('mine', ['b'], { supplies: ['rations'] }),
      ),
      deps([poi('m1')], { kitFor: (_t, _p, avail) => [...avail] }),
      { rations: 1 },
    );
    expect(r.sends.map((s) => s.trip.supplies)).toEqual([['rations']]);
  });
});

describe('🔁 replayDeps — les VRAIES règles d’envoi (celles du planificateur et de l’écran)', () => {
  const team = (n: number, L = 26): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(L, i),
      id: `a${i}`,
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
        relic: `refGear${i}relic`,
      },
    }));
  const hero: PartyHero = { name: 'H', level: 26, combatant: refFighter(26) };
  const world = (over: Partial<ReplayWorld> = {}): ReplayWorld => {
    const advs = team(3);
    return {
      targets: [poi('m1')],
      free: new Map(advs.map((a) => [a.id, null])),
      advs: new Map(advs.map((a) => [a.id, a])),
      heroFree: true,
      heroAt: null,
      hero,
      road: { advGear: refAdvGear(26, 3) },
      base: null,
      cap: 100,
      now: 0,
      need: 0.5,
      ...over,
    };
  };

  it('une équipe libre, au même endroit, part sur une mine', () => {
    const r = planReplay(wave(trip('mine', ['a0', 'a1', 'a2'])), replayDeps(world()));
    expect(r.skipped).toEqual([]);
    expect(r.sends).toHaveLength(1);
  });

  it('un champion pas libre, ou parti ailleurs, ne repart pas', () => {
    const free = new Map<string, string | null>([
      ['a0', null],
      ['a1', 'fort'], // en garnison, alors qu'il partait de la base
    ]);
    const r = planReplay(
      wave(trip('mine', ['a0', 'a2']), trip('mine', ['a1'])),
      replayDeps(world({ free })),
    );
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/n’est pas libre/), // a2 absent de `free`
      expect.stringMatching(/n’est plus au même endroit/),
    ]);
  });

  it('le héros : libre et au même endroit, sinon la raison est dite', () => {
    const t = trip('mine', ['a0'], { wings: [{ originId: null, advIds: ['a0'], hero: true }] });
    expect(planReplay(wave(t), replayDeps(world())).sends).toHaveLength(1);
    expect(planReplay(wave(t), replayDeps(world({ heroFree: false }))).skipped[0]!.reason).toMatch(
      /héros n’est pas libre/,
    );
    expect(planReplay(wave(t), replayDeps(world({ heroAt: 'fort' }))).skipped[0]!.reason).toMatch(
      /plus au même endroit/,
    );
  });

  it('le seuil de réussite du planificateur s’applique : sous le seuil, le départ reste, chance dite', () => {
    const r = planReplay(
      wave(trip('mine', ['a0'])),
      replayDeps(world({ need: 1.01, targets: [poi('m1', 'mine', { perilous: true })] })),
    );
    expect(r.sends).toEqual([]);
    expect(r.skipped[0]!.reason).toMatch(/chance de \d+ %, sous ton seuil de 101 %/);
  });

  it('le héros ne part pas vers un filon (règle de l’écran d’envoi), la raison est dite', () => {
    const t = trip('vein', ['a0'], { wings: [{ originId: null, advIds: ['a0'], hero: true }] });
    const r = planReplay(wave(t), replayDeps(world({ targets: [poi('v1', 'vein')] })));
    expect(r.sends).toEqual([]);
    expect(r.skipped[0]!.reason).toBe(`héros : ${PARTY_HERO_BLOCK_LABEL.vein}`);
  });

  it('le refus de l’écran d’envoi (plafond du Panthéon) vaut aussi ici', () => {
    const r = planReplay(wave(trip('mine', ['a0', 'a1', 'a2'])), replayDeps(world({ cap: 2 })));
    expect(r.sends).toEqual([]);
    expect(Object.values(PARTY_SEND_BLOCK_LABEL)).toContain(r.skipped[0]!.reason);
  });

  it('un lieu d’un AUTRE type n’est pas proposé (une mine ne devient pas un camp)', () => {
    const r = planReplay(
      wave(trip('mine', ['a0'])),
      replayDeps(world({ targets: [poi('c1', 'camp')] })),
    );
    expect(r.sends).toEqual([]);
    expect(r.skipped[0]!.reason).toMatch(/aucun lieu de ce type/);
  });
});

describe('🔁 la vague vit dans la carte de l’île', () => {
  const T0 = Date.UTC(2026, 9, 3, 15, 10);
  const base = (): ExpeditionMap => ({ ...createMap(7, T0, 12, 1), archipel: archipelOn(1) });

  it('`advanceWorld` la recopie (il reconstruit la carte champ par champ, à chaque tick)', () => {
    const w = wave(trip('mine', ['a']));
    const next = advanceWorld({ ...base(), lastWave: w }, T0 + 60_000, 12, 1);
    expect(next.lastWave).toEqual(w);
  });

  it('sans vague, aucune clé n’est ajoutée (la carte ne diffère pas à chaque tick)', () => {
    expect('lastWave' in advanceWorld(base(), T0 + 60_000, 12, 1)).toBe(false);
  });
});
