import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RESOURCE_SOURCES, type ResourceId } from '@/data/resourceSources';

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
  it('chaque ressource du plateau est cliquable', () => {
    const sfc = readFileSync('src/pages/AventurePage.vue', 'utf8');
    const opened = new Set([...sfc.matchAll(/@click="resInfo = '(\w+)'"/g)].map((m) => m[1]));
    for (const id of ids) {
      if (id === 'energy') {
        expect(sfc).toContain('RESOURCE_SOURCES.energy.sources');
        continue;
      }
      expect(opened.has(id), id).toBe(true);
    }
    for (const id of opened) expect(ids).toContain(id);
  });
});
