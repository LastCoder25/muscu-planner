// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { holdPosition, scrollParent } from '@/lib/scrollAnchor';

function box(top: { v: number }) {
  return () => ({ top: top.v }) as DOMRect;
}

describe('holdPosition — la tuile touchée reste sous le doigt', () => {
  it('fait défiler le conteneur de ce dont la tuile a glissé', () => {
    const sc = document.createElement('div');
    sc.style.overflowY = 'auto';
    Object.defineProperty(sc, 'scrollHeight', { value: 2000 });
    Object.defineProperty(sc, 'clientHeight', { value: 500 });
    const tile = document.createElement('button');
    sc.appendChild(tile);
    document.body.appendChild(sc);
    const top = { v: 300 };
    tile.getBoundingClientRect = box(top);
    sc.scrollTop = 100;
    const restore = holdPosition(tile);
    top.v = 380; // la fiche au-dessus a grandi de 80
    restore();
    expect(sc.scrollTop).toBe(180);
    expect(scrollParent(tile)).toBe(sc);
  });

  it('ne fait rien si rien n’a bougé, ni si la tuile a disparu', () => {
    const sc = document.createElement('div');
    sc.style.overflowY = 'auto';
    Object.defineProperty(sc, 'scrollHeight', { value: 2000 });
    Object.defineProperty(sc, 'clientHeight', { value: 500 });
    const tile = document.createElement('button');
    sc.appendChild(tile);
    document.body.appendChild(sc);
    const top = { v: 300 };
    tile.getBoundingClientRect = box(top);
    sc.scrollTop = 40;
    holdPosition(tile)();
    expect(sc.scrollTop).toBe(40);
    const r = holdPosition(tile);
    tile.remove();
    top.v = 900;
    r();
    expect(sc.scrollTop).toBe(40);
  });
});
