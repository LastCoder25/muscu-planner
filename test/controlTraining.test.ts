import { describe, expect, it } from 'vitest';
import {
  captureControl,
  collectControl,
  controlIdOf,
  controlProgress,
  ensureControls,
  reinforceControl,
  releaseFromControl,
  settleReinforcements,
  trainingStock,
  trainingStockBy,
  trainingXpPerHour,
} from '@/lib/controlPoints';
import { createMap } from '@/lib/expedition';

// 🎯 2026-09-28 (demandé) : au camp d'entraînement, CHAQUE champion a sa barre d'XP selon le
// temps qu'il y passe — une valeur commune donnerait à un renfort arrivé tard l'XP de ceux
// qui étaient là avant lui.

const H = 3600_000;
const CAMP = controlIdOf('training');
const mapAt = (L: number) => ensureControls(createMap(3, 0, L, 1), 0, L, 100);
const pt = (m: ReturnType<typeof mapAt>) => m.pois.find((p) => p.id === CAMP)!;
const at = (m: ReturnType<typeof mapAt>, t: number) => settleReinforcements(m, t, 30);

describe('🎯 camp d’entraînement : chaque champion a sa barre d’XP', () => {
  it('un renfort arrivé plus tard gagne moins, et part de zéro', () => {
    let m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
    m = reinforceControl(m, CAMP, ['a1'], 4 * H);
    m = at(m, 5 * H);
    const p = pt(m);
    const r = trainingXpPerHour(30);
    const by = trainingStockBy(p, 10 * H, 30);
    expect(by.a0).toBeCloseTo(10 * r, 6);
    expect(by.a1).toBeCloseTo(6 * r, 6); // arrivé à 4 h
    const c = collectControl(m, CAMP, 10 * H, 30);
    expect(c.xpBy.a0).toBe(Math.floor(10 * r + 1e-9));
    expect(c.xpBy.a1).toBe(Math.floor(6 * r + 1e-9));
    // ⚒️ Leurs pièces portées reçoivent le double (la forge est fondue dans le camp).
    expect(c.gearXp).toEqual({ a0: 2 * c.xpBy.a0!, a1: 2 * c.xpBy.a1! });
  });

  it('un renfort en route n’apprend rien', () => {
    let m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
    m = reinforceControl(m, CAMP, ['a1'], 8 * H);
    expect(trainingStockBy(pt(m), 6 * H, 30).a1).toBeUndefined();
  });

  it('un champion ramené garde ce qu’il a gagné, puis n’avance plus', () => {
    let m = captureControl(mapAt(30), CAMP, ['a0', 'a1'], 0, 7);
    m = releaseFromControl(m, CAMP, ['a1'], 3 * H, 30);
    const p = pt(m);
    const r = trainingXpPerHour(30);
    const by = trainingStockBy(p, 9 * H, 30);
    expect(by.a1).toBeCloseTo(3 * r, 6);
    expect(by.a0).toBeCloseTo(9 * r, 6);
    const c = collectControl(m, CAMP, 9 * H, 30);
    expect(c.xpBy.a1).toBe(Math.floor(3 * r + 1e-9));
    expect(trainingStockBy(pt(c.map), 12 * H, 30).a1).toBeUndefined();
  });

  it('les miliciens postés n’apprennent rien', () => {
    const m = captureControl(mapAt(30), CAMP, ['a0', 'mil:1'], 0, 7);
    const by = trainingStockBy(pt(m), 6 * H, 30);
    expect(Object.keys(by)).toEqual(['a0']);
  });

  it('un camp d’avant (réserve commune) vaut pour chaque champion posté', () => {
    const m = captureControl(mapAt(30), CAMP, ['a0', 'a1'], 0, 7);
    const p = pt(m);
    const legacy = { ...p, control: { ...p.control!, banked: 40 } };
    expect(trainingStockBy(legacy, 0, 30)).toEqual({ a0: 40, a1: 40 });
  });

  it('chaque barre plafonne à 24 h, et le bout de ligne montre la plus avancée', () => {
    let m = captureControl(mapAt(30), CAMP, ['a0'], 0, 7);
    m = reinforceControl(m, CAMP, ['a1'], 12 * H);
    m = at(m, 12 * H);
    const p = pt(m);
    const r = trainingXpPerHour(30);
    expect(trainingStockBy(p, 60 * H, 30).a0).toBeCloseTo(24 * r, 6);
    expect(trainingStock(p, 18 * H, 30)).toBe(Math.floor(18 * r + 1e-9));
    // Le bout de ligne dit le débit par champion : l'XP arrive directement (plus de jauge).
    const pr = controlProgress(p, 18 * H, 30)!;
    expect(pr.text).toBe(`🎓 +${Math.round(r).toLocaleString('fr-FR')} XP/h`);
    expect(pr.pct).toBeNull();
  });
});
