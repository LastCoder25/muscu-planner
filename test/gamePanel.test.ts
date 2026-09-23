import { describe, expect, it } from 'vitest';
import type { Router } from 'vue-router';
import fs from 'node:fs';
import { useGamePanel } from '@/composables/useGamePanel';

/** Un router de test : on ne retient que ce qui a été demandé. */
function fakeRouter(path = '/', query: Record<string, string> = {}) {
  const calls: Array<{ kind: 'push' | 'replace'; to: unknown }> = [];
  const r = {
    currentRoute: { value: { path, query } },
    push: (to: unknown) => {
      calls.push({ kind: 'push', to });
      return Promise.resolve();
    },
    replace: (to: unknown) => {
      calls.push({ kind: 'replace', to });
      return Promise.resolve();
    },
  } as unknown as Router;
  return { r, calls };
}

describe('🕹️ openPath — volet droit en cockpit, route plein écran sinon', () => {
  it('hors cockpit : une route, avec sa query', () => {
    const { r, calls } = fakeRouter();
    const { openPath, view } = useGamePanel();
    view.value = 'expedition-map';
    openPath(r, '/aventure?tab=base', false);
    expect(calls).toEqual([{ kind: 'push', to: '/aventure?tab=base' }]);
    // ⚠️ La vue du volet n'est PAS touchée : on quitte l'écran, on ne le réarrange pas.
    expect(view.value).toBe('expedition-map');
  });

  it('en cockpit : le volet change de vue, et la query part sur la route COURANTE', () => {
    // ⚠️ C'est ce report qui permet à l'Aventure DÉJÀ montée de lire l'onglet demandé :
    // en volet elle n'est pas remontée, donc un `push` vers `/aventure?tab=base` ne lui
    // dirait rien — et emporterait au passage l'écran sport de gauche.
    const { r, calls } = fakeRouter('/stats', { autre: '1' });
    const { openPath, view } = useGamePanel();
    view.value = 'expedition-map';
    openPath(r, '/aventure?tab=base', true);
    expect(view.value).toBe('aventure');
    expect(calls).toEqual([
      { kind: 'replace', to: { path: '/stats', query: { autre: '1', tab: 'base' } } },
    ]);
  });

  it('en cockpit, sans query : on change de vue et on ne touche PAS à la route', () => {
    const { r, calls } = fakeRouter('/stats');
    const { openPath, view } = useGamePanel();
    view.value = 'aventure';
    openPath(r, '/expedition-map', true);
    expect(view.value).toBe('expedition-map');
    expect(calls).toEqual([]);
  });

  it('un chemin qui n’est pas un écran de jeu part en route, même en cockpit', () => {
    // Le volet ne sait afficher que les trois vues de jeu ; tout le reste est une page.
    const { r, calls } = fakeRouter();
    const { openPath, view } = useGamePanel();
    view.value = 'aventure';
    openPath(r, '/stats', true);
    expect(calls).toEqual([{ kind: 'push', to: '/stats' }]);
    expect(view.value).toBe('aventure');
  });

  it('🏰 le RETOUR de la carte est bien câblé sur la Base', () => {
    // ⚠️ Test de CÂBLAGE, assumé comme tel : une mutation a montré que vérifier `openPath`
    // isolément ne dit RIEN de ce que la page lui demande — et aucune porte ne voit cet
    // écran : le smoke passe la connexion depuis la v0.1103, mais il ne visite pas
    // `/expedition-map`. On lit donc le composant.
    const sfc = fs.readFileSync('src/pages/ExpeditionMapPage.vue', 'utf8');
    const back = sfc.slice(sfc.indexOf('function back()'), sfc.indexOf('function back()') + 200);
    expect(back).toContain('/aventure?tab=base');
    // …et par `openPath`, la source unique de « volet en cockpit, route sinon » : la
    // réécrire ici en ferait une copie aveugle au cockpit.
    expect(back).toContain('openPath(');
  });

  it('🏰 la carte revient à la BASE : le chemin de retour porte bien son onglet', () => {
    // Demandé par l'utilisateur. ⚠️ Sans `?tab=base`, `/aventure` rouvre l'onglet Héros —
    // l'onglet ne vit pas dans l'URL, donc un simple retour arrière ne suffirait pas.
    const { r, calls } = fakeRouter();
    const { openPath } = useGamePanel();
    openPath(r, '/aventure?tab=base', false);
    expect(calls[0]!.to).toContain('tab=base');
  });
});
