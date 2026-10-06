// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { lockPageScroll, mapScrollLocked, scrollContainerOf } from '@/lib/mapSlide';

// 🔒 Demandé : « quand j'arrive sur la carte, je ne peux pas glisser l'écran ; je n'ai accès
// au dessous que par la flèche. Par contre, quand je touche un lieu, la fenêtre pour choisir
// les troupes doit pouvoir défiler. »
const bare = {
  viewed: false,
  panel: false,
  selected: false,
  focusTrip: false,
  baseOpen: false,
  quick: false,
  fits: true,
};

describe('🔒 quand la page de la carte est verrouillée', () => {
  it('sur la carte seule : verrouillée', () => {
    expect(mapScrollLocked(bare)).toBe(true);
  });
  it('une fenêtre ouverte depuis la carte la déverrouille', () => {
    expect(mapScrollLocked({ ...bare, selected: true })).toBe(false);
    expect(mapScrollLocked({ ...bare, focusTrip: true })).toBe(false);
    expect(mapScrollLocked({ ...bare, baseOpen: true })).toBe(false);
    expect(mapScrollLocked({ ...bare, quick: true })).toBe(false);
    expect(mapScrollLocked({ ...bare, panel: true })).toBe(false);
  });
  it('la vue d’une autre île (pas de carte) : déverrouillée', () => {
    expect(mapScrollLocked({ ...bare, viewed: true })).toBe(false);
  });
  it('une carte qui commence trop bas (récompense du jour au-dessus) : on y descend au doigt', () => {
    expect(mapScrollLocked({ ...bare, fits: false })).toBe(false);
  });
});

describe('🔒 lockPageScroll', () => {
  it('coupe le défilement du conteneur, puis le rend tel qu’il était', () => {
    document.body.innerHTML = '<div id="pane" style="overflow-y:auto"><div id="in"></div></div>';
    const pane = document.getElementById('pane')!;
    Object.defineProperty(pane, 'scrollHeight', { value: 2000 });
    Object.defineProperty(pane, 'clientHeight', { value: 800 });
    const inner = document.getElementById('in')!;
    const unlock = lockPageScroll(inner);
    expect(pane.style.overflowY).toBe('hidden');
    // Les flèches retrouvent le volet verrouillé (elles le font défiler par le code).
    expect(scrollContainerOf(inner)).toBe(pane);
    unlock();
    expect(pane.style.overflowY).toBe('auto');
  });
});
