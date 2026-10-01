import { describe, expect, it } from 'vitest';
import { revealScrollDelta } from '@/lib/reveal';

const view = { viewTop: 0, viewBottom: 800, margin: 0 };

describe('revealScrollDelta — tuiles + détail, le maximum de carte au-dessus', () => {
  it('le bas du détail descend jusqu’au bas de la vue (rien de vide dessous)', () => {
    // Tuiles en haut de l'écran, détail court : on REMONTE la page pour revoir de la carte.
    expect(revealScrollDelta({ ...view, top: 0, bottom: 500 })).toBe(-300);
  });
  it('un détail sous l’écran est révélé par son bas', () => {
    expect(revealScrollDelta({ ...view, top: 600, bottom: 1000 })).toBe(200);
  });
  it('jamais au point de cacher le haut des tuiles', () => {
    // Bloc plus grand que la vue : c'est le haut qui gagne.
    expect(revealScrollDelta({ ...view, top: 300, bottom: 1500 })).toBe(300);
  });
  it('déjà calé : ne bouge pas', () => {
    expect(revealScrollDelta({ ...view, top: 200, bottom: 800 })).toBe(0);
  });
  it('la marge écarte le bloc des bords', () => {
    expect(revealScrollDelta({ viewTop: 0, viewBottom: 800, top: 0, bottom: 500 })).toBe(-292);
  });
});
