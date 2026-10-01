import { describe, it, expect } from 'vitest';
import { mapSlideDirection, MAP_SLIDE_MARGIN } from '@/lib/mapSlide';

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
