import { describe, it, expect, afterEach } from 'vitest';
import type { Router } from 'vue-router';
import { pathOf, samePage, shouldGoBack, hasPreviousEntry, backOr } from '@/lib/nav';

describe('retour arrière sans page précédente (backOr)', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });
  function fakeRouter() {
    const calls: string[] = [];
    const router = {
      back: () => calls.push('back'),
      push: (to: string) => {
        calls.push(`push:${to}`);
        return Promise.resolve();
      },
    } as unknown as Router;
    return { router, calls };
  }
  function withHistoryBack(back: string | null) {
    g.window = { history: { state: back === null ? {} : { back } } };
  }

  it('hasPreviousEntry : seule une URL précédente non vide permet de revenir', () => {
    expect(hasPreviousEntry('/challenges')).toBe(true);
    expect(hasPreviousEntry('')).toBe(false);
    expect(hasPreviousEntry(null)).toBe(false);
    expect(hasPreviousEntry(undefined)).toBe(false);
  });

  it('⚠️ LE CAS RÉEL : arrivé par une notification, rien derrière → la page parente, pas un bouton mort', () => {
    const { router, calls } = fakeRouter();
    withHistoryBack(null);
    backOr(router, '/tennis');
    expect(calls).toEqual(['push:/tennis']);
  });

  it('avec une page précédente, on revient simplement en arrière', () => {
    const { router, calls } = fakeRouter();
    withHistoryBack('/challenges');
    backOr(router, '/tennis');
    expect(calls).toEqual(['back']);
  });
});

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
