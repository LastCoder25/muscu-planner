import { describe, it, expect } from 'vitest';
import { innerCanScrollY, mapSlideDirection, MAP_SLIDE_MARGIN } from '@/lib/mapSlide';

describe('↕️ bouton de glissement de la carte', () => {
  it('tuiles hors de l’écran → on descend vers elles', () => {
    expect(mapSlideDirection(1200, 800)).toBe('down');
  });
  it('tuiles à l’écran → on remonte en haut', () => {
    expect(mapSlideDirection(300, 800)).toBe('up');
    expect(mapSlideDirection(-50, 800)).toBe('up'); // déjà défilées au-dessus
  });
  it('un simple liseré en bas de l’écran ne compte pas comme visible', () => {
    expect(mapSlideDirection(800 - MAP_SLIDE_MARGIN / 2, 800)).toBe('down');
    expect(mapSlideDirection(800 - MAP_SLIDE_MARGIN - 1, 800)).toBe('up');
  });
});

// 👆 Demandé : « on ne peut pas défiler avec le doigt sous la carte » — seules les flèches y
// mènent. Un glissé vertical n'est laissé que s'il fait défiler un bloc INTÉRIEUR (la carte,
// une liste) ; sinon il ferait défiler la page, et on l'annule.
describe('👆 glissé vertical : la page ne défile qu’aux flèches', () => {
  const box = (scrollTop: number, scrollsY = true) => ({
    scrollTop,
    scrollHeight: 1000,
    clientHeight: 400,
    scrollsY,
  });
  it('aucun bloc intérieur qui défile → le glissé ferait défiler la page', () => {
    expect(innerCanScrollY([], -30)).toBe(false);
    expect(innerCanScrollY([box(0, false)], -30)).toBe(false);
  });
  it('la carte peut encore descendre → on la laisse défiler', () => {
    expect(innerCanScrollY([box(100)], -30)).toBe(true);
    expect(innerCanScrollY([box(100)], 30)).toBe(true);
  });
  it('la carte en butée → le glissé passerait à la page : annulé', () => {
    expect(innerCanScrollY([box(600)], -30)).toBe(false);
    expect(innerCanScrollY([box(0)], 30)).toBe(false);
  });
  it('un bloc parent qui peut encore défiler prend le relais', () => {
    expect(innerCanScrollY([box(600), box(200)], -30)).toBe(true);
  });
});
