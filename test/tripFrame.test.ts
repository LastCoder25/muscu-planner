import { describe, expect, it } from 'vitest';
import { tripFrame } from '@/lib/tripFrame';

describe('tripFrame — cadrer le trajet d’une troupe', () => {
  it('centre sur le milieu du départ et de l’arrivée', () => {
    const f = tripFrame(
      [
        { x: 100, y: 100 },
        { x: 140, y: 60 },
      ],
      700,
      200,
      390,
      400,
    );
    expect(f.cx).toBe(120);
    expect(f.cy).toBe(80);
  });

  it('garde le zoom quand le trajet tient dans le cadre', () => {
    const f = tripFrame(
      [
        { x: 100, y: 100 },
        { x: 110, y: 105 },
      ],
      700,
      200,
      390,
      400,
    );
    expect(f.px).toBe(700);
  });

  it('dézoome juste assez pour que le trajet tienne, marges comprises', () => {
    const pts = [
      { x: 20, y: 100 },
      { x: 180, y: 100 },
    ];
    const f = tripFrame(pts, 1700, 200, 390, 400, 48);
    expect(f.px).toBeLessThan(1700);
    // Largeur rendue du trajet = largeur dispo (390 − 2 × 48).
    expect(((180 - 20) / 200) * f.px).toBeCloseTo(390 - 96, 5);
  });

  it('prend le plus contraignant des deux axes', () => {
    const f = tripFrame(
      [
        { x: 100, y: 20 },
        { x: 110, y: 180 },
      ],
      1700,
      200,
      600,
      300,
      0,
    );
    expect(((180 - 20) / 200) * f.px).toBeCloseTo(300, 5);
  });

  it('un trajet par la ville (retour à la base) l’inclut dans le cadre', () => {
    const f = tripFrame(
      [
        { x: 60, y: 100 },
        { x: 140, y: 100 },
        { x: 100, y: 40 },
      ],
      700,
      200,
      390,
      400,
    );
    expect(f.cy).toBe(70);
  });

  it('un seul point ne change pas le zoom', () => {
    expect(tripFrame([{ x: 50, y: 50 }], 900, 200, 390, 400).px).toBe(900);
  });
});
