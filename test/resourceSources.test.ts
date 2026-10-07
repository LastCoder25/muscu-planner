import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RESOURCE_SOURCES,
  sourceContext,
  sourcesFor,
  type ResourceId,
} from '@/data/resourceSources';
import type { ExpeditionMap, Poi } from '@/lib/expedition';
import { archipelOn } from '@/lib/archipelago';
import { FORTRESS_ID } from '@/lib/islandConquest';

const ids = Object.keys(RESOURCE_SOURCES) as ResourceId[];

describe('d’où vient chaque ressource', () => {
  it('chaque ressource dit à quoi elle sert et où la trouver', () => {
    for (const id of ids) {
      const r = RESOURCE_SOURCES[id];
      expect(r.use.length, id).toBeGreaterThan(0);
      expect(r.sources.length, id).toBeGreaterThan(0);
      for (const s of r.sources) expect(s.label.length, id).toBeGreaterThan(0);
    }
  });

  it('pas deux fois la même source pour une ressource', () => {
    for (const id of ids) {
      const labels = RESOURCE_SOURCES[id].sources.map((s) => s.label);
      expect(new Set(labels).size, id).toBe(labels.length);
    }
  });

  // Câblage : chaque puce du plateau ouvre SA fiche, et aucune fiche n'est orpheline.
  // L'énergie montre ses sources dans sa propre fenêtre (historique).
  // ⚠️ Le plateau vit dans `ResourceTray` (partagé avec la carte, 2026-09-30) : chaque puce y
  // porte son id, et l'Aventure ouvre la fiche de l'id touché.
  it('chaque ressource du plateau est cliquable', () => {
    const tray = readFileSync('src/components/ResourceTray.vue', 'utf8');
    const chips = new Set([...tray.matchAll(/^\s+id: '(\w+)',\r?$/gm)].map((m) => m[1]));
    for (const id of ids) expect(chips.has(id), id).toBe(true);
    for (const id of chips) expect(ids).toContain(id);
    const sfc = readFileSync('src/pages/AventurePage.vue', 'utf8');
    expect(sfc).toContain('interactive @pick="pickResource"');
    expect(sfc).toContain('else resInfo.value = id;');
    expect(sfc).toContain("sourcesFor('energy', srcCtx)");
    expect(sfc).toContain('sourcesFor(resInfo!, srcCtx)');
  });
});

describe('🏝️ les sources à portée de l’île', () => {
  const ctrl = (kind: string, owner: 'player' | 'enemy') =>
    ({ id: `c_${kind}`, type: 'control', control: { kind, owner } }) as unknown as Poi;
  const mapOn = (island: number, extra: Partial<ExpeditionMap> = {}) =>
    ({ pois: [], archipel: archipelOn(island), ...extra }) as unknown as ExpeditionMap;
  const labels = (id: ResourceId, map: ExpeditionMap | null) =>
    sourcesFor(id, sourceContext(map)).map((s) => s.label);

  it('un lieu fixe ne compte que sur son île', () => {
    expect(labels('sealsChamp', mapOn(2))).toContain('Ossuaire');
    expect(labels('sealsChamp', mapOn(1))).not.toContain('Ossuaire');
    expect(labels('sealsGear', mapOn(3))).toContain('Arsenal');
    expect(labels('sealsGear', mapOn(2))).not.toContain('Arsenal');
  });

  it('…ou s’il est tenu sur une île quittée, et il le dit', () => {
    const map = mapOn(3, {
      islands: { '2': { ...mapOn(2), pois: [ctrl('ossuary', 'player')] } },
    });
    const s = sourcesFor('sealsChamp', sourceContext(map)).find((x) => x.label === 'Ossuaire');
    expect(s?.detail).toContain('île 2');
    const lost = mapOn(3, { islands: { '2': { ...mapOn(2), pois: [ctrl('ossuary', 'enemy')] } } });
    expect(labels('sealsChamp', lost)).not.toContain('Ossuaire');
  });

  it('la brèche maudite seulement sur l’île 5, le coffre tant que la forteresse tient', () => {
    expect(labels('sealsChamp', mapOn(5))).toContain('Brèche maudite');
    expect(labels('sealsChamp', mapOn(4))).not.toContain('Brèche maudite');
    const fort = 'Coffre de la forteresse de l’île';
    expect(labels('runes', mapOn(2))).toContain(fort);
    const down = mapOn(2);
    down.archipel = { ...down.archipel!, destroyed: [FORTRESS_ID], chestAt: 1 };
    expect(labels('runes', down)).not.toContain(fort);
  });

  it('les sources de partout restent partout', () => {
    expect(labels('sealsChamp', mapOn(1))).toContain('Ruines anciennes de la carte');
    expect(labels('energy', null)).toEqual(RESOURCE_SOURCES.energy.sources.map((s) => s.label));
  });
});
