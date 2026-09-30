import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

// ⚔️ Signalé : « les icônes des attaques passent sous les bâtiments, celle en cours disparaît
// derrière la base ». En SVG, l'ordre du document EST l'ordre d'empilement : les armées doivent
// être dessinées APRÈS la ville et les autres lieux. La page n'est pas montable dans le
// harnais (trop de stores) : ce test lit son gabarit — un test de COPIE assumé.
describe('carte : les armées au premier plan', () => {
  const src = readFileSync('src/pages/ExpeditionMapPage.vue', 'utf8');
  const tpl = src.slice(0, src.indexOf('<script'));
  it('le calque des armées suit la ville, celui des lieux la précède', () => {
    const town = tpl.indexOf('class="town"');
    expect(town).toBeGreaterThan(0);
    expect(tpl.indexOf(':pois="placePois"')).toBeLessThan(town);
    expect(tpl.indexOf(':pois="armyPois"')).toBeGreaterThan(town);
    // Les bandes interceptées et l'aura d'une armée touchée aussi.
    expect(tpl.indexOf('class="band-march"')).toBeGreaterThan(town);
    expect(tpl.indexOf('army-focus-halo')).toBeGreaterThan(town);
  });
  it('une armée ne se dessine qu’une fois', () => {
    expect(src).toMatch(
      /placePois = computed\(\(\) => mapPois\.value\.filter\(\(p\) => !isMarching\(p\)\)\)/,
    );
    expect(src).toMatch(/armyPois = computed\(\(\) => mapPois\.value\.filter\(isMarching\)\)/);
  });
});
