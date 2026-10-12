import { describe, expect, it } from 'vitest';
import { archipelOn } from '@/lib/archipelago';
import {
  controlIdOf,
  controlSpot,
  convertReplacedControls,
  ensureControls,
} from '@/lib/controlPoints';
import type { ExpeditionMap, Poi } from '@/lib/expedition';

const NOW = 1_800_000_000_000;

function island3(pois: Poi[]): ExpeditionMap {
  return { seed: 4242, pois, archipel: archipelOn(3) } as unknown as ExpeditionMap;
}

/** Le lapidaire tenu, posé là où la distillerie se pose désormais sur l'île 3. */
function heldLapidary(map: ExpeditionMap): Poi {
  const spot = controlSpot(map, 'distillery');
  return {
    id: controlIdOf('lapidary'),
    type: 'control',
    level: 41,
    ...spot,
    spawnedAt: 1,
    expiresAt: 9e15,
    control: {
      kind: 'lapidary',
      owner: 'player',
      faction: 'bandits',
      size: 1.5,
      retakes: 0,
      garrison: ['adv_a'],
      reinforcing: [{ id: 'mil:3', at: NOW + 5000, from: NOW - 5000 }],
      attackAt: NOW + 86_400_000,
      lapis: 'adv_a',
      banked: 3,
    },
  } as unknown as Poi;
}

function enemyDistillery(map: ExpeditionMap): Poi {
  return {
    id: controlIdOf('distillery'),
    type: 'control',
    level: 41,
    ...controlSpot(map, 'distillery'),
    spawnedAt: 2,
    expiresAt: 9e15,
    control: {
      kind: 'distillery',
      owner: 'enemy',
      faction: 'bandits',
      size: 2,
      retakes: 0,
      garrison: [],
    },
  } as unknown as Poi;
}

describe('convertReplacedControls', () => {
  it('un lapidaire tenu à la place de la distillerie devient la distillerie, tout gardé', () => {
    const base = island3([]);
    const map = island3([heldLapidary(base)]);
    const r = convertReplacedControls(map, NOW);
    expect(r).not.toBeNull();
    expect(r!.renamed.get('ctl_lapidary')).toBe('ctl_distillery');
    const p = r!.map.pois.find((q) => q.id === 'ctl_distillery')!;
    expect(p.control!.kind).toBe('distillery');
    expect(p.control!.owner).toBe('player');
    expect(p.control!.garrison).toEqual(['adv_a']);
    expect(p.control!.reinforcing).toHaveLength(1);
    expect(p.control!.attackAt).toBe(NOW + 86_400_000);
    expect(p.control!.lapis).toBeUndefined();
    expect(p.control!.banked).toBe(0);
    expect(r!.map.pois.some((q) => q.id === 'ctl_lapidary')).toBe(false);
  });

  it('la distillerie ennemie neuve posée à sa place est retirée (cas réel du joueur)', () => {
    const base = island3([]);
    const map = island3([heldLapidary(base), enemyDistillery(base)]);
    const r = convertReplacedControls(map, NOW)!;
    const d = r.map.pois.filter((q) => q.id === 'ctl_distillery');
    expect(d).toHaveLength(1);
    expect(d[0]!.control!.owner).toBe('player');
  });

  it('une distillerie ennemie déjà attaquée n’est pas écrasée', () => {
    const base = island3([]);
    const e = enemyDistillery(base);
    e.control!.assault = true;
    expect(convertReplacedControls(island3([heldLapidary(base), e]), NOW)).toBeNull();
  });

  it('un lieu visé par un voyage en cours attend son retour', () => {
    const base = island3([]);
    expect(
      convertReplacedControls(island3([heldLapidary(base)]), NOW, new Set(['ctl_lapidary'])),
    ).toBeNull();
  });

  it('un lieu retiré qui n’est PAS à la place d’un nouveau type n’est pas converti', () => {
    const base = island3([]);
    const p = heldLapidary(base);
    p.x += 30;
    expect(convertReplacedControls(island3([p]), NOW)).toBeNull();
  });

  it('un lieu ennemi d’un type retiré n’est pas converti', () => {
    const base = island3([]);
    const p = heldLapidary(base);
    p.control!.owner = 'enemy';
    expect(convertReplacedControls(island3([p]), NOW)).toBeNull();
  });

  it('après conversion, ensureControls ne repose pas de distillerie ennemie', () => {
    const base = island3([]);
    const r = convertReplacedControls(island3([heldLapidary(base)]), NOW)!;
    const after = ensureControls(r.map, NOW, 45, 0);
    const d = after.pois.filter((q) => q.control?.kind === 'distillery');
    expect(d).toHaveLength(1);
    expect(d[0]!.control!.owner).toBe('player');
  });
});
