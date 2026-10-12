// 🪦 Les lieux ennemis des îles portent l'icône de leur nom (cimetière, nid, camp de guerre…),
// et la carte la dessine — plus l'icône générique du type.
import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '@/lib/archipelago';
import { createMap, poiEmo, type ExpeditionMap } from '@/lib/expedition';
import { CONTROL, controlIdOf, controlRoster, ensureControls, garrisonDots } from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';

const NOW = 1_800_000_000_000;
const islandMap = (id: number, L: number): ExpeditionMap => {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
};

describe('🪦 icônes des lieux ennemis des îles', () => {
  it('île 3 : les cimetières sont des 🪦, la citadelle des morts 💀, la forteresse 🌊', () => {
    const m = islandMap(3, 50);
    const emos = m.pois.filter((p) => p.control?.kind === 'objective').map(poiEmo);
    expect(emos.filter((e) => e === '🪦').length).toBe(2);
    expect(emos).toContain('💀');
    expect(poiEmo(m.pois.find((p) => p.control?.kind === 'fortress')!)).toBe('🌊');
  });

  it('chaque forteresse porte l’icône de son île', () => {
    for (const isl of ISLANDS) {
      const L = isl.minLevel + 5;
      const f = islandMap(isl.id, L).pois.find((p) => p.control?.kind === 'fortress')!;
      expect(poiEmo(f)).toBe(isl.fortressEmoji);
    }
  });

  it('un lieu posé avant prend la nouvelle icône au passage suivant', () => {
    const m = islandMap(3, 50);
    const old: ExpeditionMap = {
      ...m,
      pois: m.pois.map((p) =>
        p.control?.kind === 'fortress' || p.control?.kind === 'objective'
          ? { ...p, control: { ...p.control, emoji: '⛺' } }
          : p,
      ),
    };
    const next = ensureIslandConquest(old, NOW, 50);
    const objs = next.pois.filter((p) => p.control?.kind === 'objective').map(poiEmo);
    expect(objs).not.toContain('⛺');
    expect(poiEmo(next.pois.find((p) => p.control?.kind === 'fortress')!)).toBe('🌊');
  });
});

describe('⚫ un assaut mené par le héros se dessine', () => {
  it('le héros prend 2 places reliées, puis ses champions', () => {
    const L = 30;
    const m = ensureControls(createMap(3, 0, L, 1), 0, L);
    const id = controlIdOf(CONTROL.kinds[0]!);
    const rows = controlRoster(
      m,
      [{ poiId: id, midAt: 5 * 3600_000, ids: ['a'], hero: true }],
      3600_000,
      L,
      new Set(),
      null,
    );
    const r = rows.find((x) => x.poi.id === id)!;
    expect(r.assault?.hero).toBe(true);
    expect(garrisonDots(r).startsWith('ggr')).toBe(true);
  });
});
