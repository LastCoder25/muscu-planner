import { describe, it, expect } from 'vitest';
import { pinchStart, pinchUpdate } from '@/lib/pinchZoom';

describe('pinchZoom — zoom à deux doigts', () => {
  const s = pinchStart(700, 100, 150, 200, 300, 100); // point visé : (450, 300) sur 700 px

  it('écarter les doigts agrandit, les rapprocher réduit, dans la proportion de l’écart', () => {
    expect(pinchUpdate(s, 200, 150, 200, 340, 1700).px).toBe(1400);
    expect(pinchUpdate(s, 50, 150, 200, 340, 1700).px).toBe(350);
  });

  it('la taille reste dans ses bornes', () => {
    expect(pinchUpdate(s, 1000, 150, 200, 340, 1700).px).toBe(1700);
    expect(pinchUpdate(s, 10, 150, 200, 340, 1700).px).toBe(340);
  });

  it('le point de la carte sous les doigts reste sous les doigts', () => {
    const r = pinchUpdate(s, 200, 150, 200, 340, 1700);
    // point visé à 450/700 et 300/700 → sous le milieu des doigts après zoom
    expect(r.scrollLeft + 150).toBeCloseTo((450 / 700) * r.px);
    expect(r.scrollTop + 200).toBeCloseTo((300 / 700) * r.px);
  });

  it('déplacer les doigts sans changer leur écart fait glisser la carte', () => {
    const r = pinchUpdate(s, 100, 190, 170, 340, 1700);
    expect(r.px).toBe(700);
    expect(r.scrollLeft).toBeCloseTo(260); // 450 − 190 : la carte suit les doigts
    expect(r.scrollTop).toBeCloseTo(130);
  });

  it('un écart nul ne casse rien', () => {
    const z = pinchStart(700, 0, 0, 0, 0, 0);
    expect(Number.isFinite(pinchUpdate(z, 0, 0, 0, 340, 1700).px)).toBe(true);
  });
});
