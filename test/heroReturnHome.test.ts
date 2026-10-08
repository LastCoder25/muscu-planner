import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { EXPE, travelPosition, voyageHome, type Poi } from '@/lib/expedition';

// 🧝 LE HÉROS PARTI DE SON POSTE Y RENTRE — À L'ÉCRAN AUSSI (v1.106.4, signalé : « il est parti
// de l'Ossuaire avec des champions et au retour, après sa réussite, il repart vers la base »).
// Les données le ramenaient bien à l'Ossuaire (`heroBackToPost`), mais la carte dessinait son
// tracé restant et ses chevrons vers la VILLE : il semblait rentrer à la base.

const post = { x: 156, y: 81 };
const poi = { id: 'p', x: 127, y: 67 } as Poi;
const trip = { poi, sentAt: 0, midAt: 1000, returnAt: 2000, origin: post };

describe('voyageHome', () => {
  it('un voyage parti d’un poste y rentre, sinon la ville', () => {
    expect(voyageHome(trip)).toEqual(post);
    expect(voyageHome({ ...trip, origin: undefined })).toBe(EXPE.town);
  });

  it('au retour, la position avance vers le poste et y finit', () => {
    const mid = travelPosition(trip, 1500);
    expect(mid.phase).toBe('return');
    // À mi-retour : à mi-chemin entre le lieu et le POSTE, jamais vers la ville.
    expect(mid.x).toBeCloseTo((poi.x + post.x) / 2);
    expect(mid.y).toBeCloseTo((poi.y + post.y) / 2);
    const end = travelPosition(trip, 2500);
    expect({ x: end.x, y: end.y }).toEqual(post);
  });
});

describe('la carte dessine le retour du héros vers son poste', () => {
  const src = fs.readFileSync('src/pages/ExpeditionMapPage.vue', 'utf8');

  it('le tracé restant part de `heroHome`, pas de la ville', () => {
    const block = src.slice(src.indexOf('Trajet du héros'), src.indexOf('Chevrons de direction'));
    expect(block).toContain(':x1="heroHome.x"');
    expect(block).not.toContain('TOWN.x');
  });

  it('les chevrons du retour visent `voyageHome`', () => {
    const fn = src.slice(src.indexOf('const travelArrows'), src.indexOf('return arrows;'));
    expect(fn).toContain("h.phase === 'return' ? voyageHome(a)");
  });

  it('`heroHome` lit la source unique', () => {
    expect(src).toMatch(
      /const heroHome = computed\(\(\) => \(active\.value \? voyageHome\(active\.value\)/,
    );
  });
});
