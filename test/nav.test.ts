import { describe, it, expect } from 'vitest';
import { pathOf, samePage, shouldGoBack } from '@/lib/nav';

describe('retour arrière sans doublon', () => {
  it('pathOf : la query et le fragment ne font pas la page', () => {
    expect(pathOf('/muscu?tab=hist')).toBe('/muscu');
    expect(pathOf('/bilan/12?h=1#top')).toBe('/bilan/12');
    expect(pathOf('/challenges')).toBe('/challenges');
  });

  it('samePage : même écran malgré une query différente', () => {
    expect(samePage('/muscu', '/muscu?tab=hist')).toBe(true);
    expect(samePage('/challenges', '/challenges/42')).toBe(false);
  });

  it('⚠️ LE CAS RÉEL : venir de la liste puis y « revenir » par replace la duplique', () => {
    // Historique [/, /challenges, /challenges/42] : abandonner le défi remplaçait
    // l'entrée courante par /challenges — soit deux entrées identiques adjacentes, et
    // un bouton retour qui semblait mort (il fallait appuyer deux fois).
    expect(shouldGoBack('/challenges', '/challenges')).toBe(true);
    // Séance de Défi 360 lancée depuis le détail : même piège.
    expect(shouldGoBack('/combo/7', '/combo/7')).toBe(true);
  });

  it('sinon on remplace bel et bien : la destination n’est pas d’où l’on vient', () => {
    expect(shouldGoBack('/', '/challenges')).toBe(false);
    expect(shouldGoBack('/challenges/42', '/challenges')).toBe(false);
    expect(shouldGoBack(null, '/challenges')).toBe(false); // entrée directe / PWA
    expect(shouldGoBack(undefined, '/challenges')).toBe(false);
  });

  it('la query ne doit pas faire rater le doublon', () => {
    // Revenir sur /muscu depuis /muscu?tab=hist ne se VOIT pas : c'est un doublon.
    expect(shouldGoBack('/muscu?tab=hist', '/muscu')).toBe(true);
  });
});
