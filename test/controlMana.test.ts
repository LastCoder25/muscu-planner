import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  collectControl,
  controlIdOf,
  controlManaPerHour,
  controlManaStock,
  controlProgress,
  ensureControls,
  seatsOf,
} from '@/lib/controlPoints';
import { EXPE, createMap, type Poi } from '@/lib/expedition';
import { riftClearMana } from '@/lib/rift';

const H = 3600_000;
const SRC = controlIdOf('mana');
const mapAt = (L: number) => ensureControls(createMap(3, 0, L, 1), 0, L);
const pt = (m: ReturnType<typeof mapAt>, id: string) => m.pois.find((p) => p.id === id)!;
const held = (L: number, n: number) =>
  captureControl(
    mapAt(L),
    SRC,
    Array.from({ length: n }, (_, i) => `a${i}`),
    0,
    7,
  );

describe('⛲ la Source de mana', () => {
  it('un point fixe de plus, à 5 places, posé à la place laissée par la forge', () => {
    const m = mapAt(30);
    const src = pt(m, SRC);
    expect(src.control!.kind).toBe('mana');
    expect(seatsOf('mana')).toBe(5);
    const town = EXPE.town;
    const ang = (p: Poi) => Math.atan2(p.y - town.y, p.x - town.x);
    let d = ang(src) - ang(pt(m, controlIdOf('mine')));
    while (d < 0) d += Math.PI * 2;
    expect(d / (Math.PI / 2)).toBeCloseTo(0.5, 1);
    // Aucun point ne se pose sur un autre.
    const ctl = m.pois.filter((p) => p.control);
    for (const a of ctl)
      for (const b of ctl)
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });

  it('une carte d’avant reçoit la Source au chargement, et une carte à jour n’est pas réécrite', () => {
    const old = mapAt(30);
    const without = { ...old, pois: old.pois.filter((p) => p.id !== SRC) };
    expect(ensureControls(without, 0, 30).pois.some((p) => p.id === SRC)).toBe(true);
    expect(ensureControls(old, 0, 30)).toBe(old);
  });

  it('à trois, la moitié d’une faille refermée par jour — DÉRIVÉ du mana des failles', () => {
    for (const L of [5, 12, 30, 60, 100])
      expect(controlManaPerHour(3, L) * 24).toBeCloseTo(
        riftClearMana({ level: L }) * CONTROL.manaSourceShare,
        9,
      );
  });

  it('mesuré : 11 · 18 · 37 · 69 · 111 💠 par jour à trois, du niveau 5 au 100', () => {
    const perDay = [5, 12, 30, 60, 100].map((L) => Math.round(controlManaPerHour(3, L) * 24));
    expect(perDay).toEqual([11, 18, 37, 69, 111]);
  });

  it('un COMPLÉMENT : à cinq, toujours sous une faille refermée par jour', () => {
    for (const L of [5, 12, 30, 60, 100])
      expect(controlManaPerHour(5, L) * 24).toBeLessThan(riftClearMana({ level: L }));
  });

  it('plus de monde, plus de mana ; personne, rien', () => {
    const r = (n: number) => controlManaPerHour(n, 30);
    expect(r(0)).toBe(0);
    for (let n = 1; n < 5; n++) expect(r(n + 1)).toBeGreaterThan(r(n));
  });

  it('la réserve se récolte en mana, la fraction entamée reste acquise', () => {
    const m = held(30, 3);
    const rate = controlManaPerHour(3, 30);
    const t = ((2.5 / rate) * H) as number; // 2,5 pierres
    expect(controlManaStock(pt(m, SRC), t, 30)).toBe(2);
    const c1 = collectControl(m, SRC, t, 30);
    expect(c1.mana).toBe(2);
    expect(c1.gold).toBe(0);
    const c2 = collectControl(c1.map, SRC, t + (0.5 / rate) * H, 30);
    expect(c2.mana).toBe(1);
  });

  it('la réserve n’a PAS de plafond : 72 h d’absence rendent 72 h de production', () => {
    // Sans reprise prévue d'ici là : la production s'arrête à l'heure de l'attaque.
    const p0 = pt(held(30, 3), SRC);
    const p = { ...p0, control: { ...p0.control!, attackAt: 9e15 } };
    const at =(h: number) => Math.floor(controlManaPerHour(3, 30) * h + 1e-9);
    expect(controlManaStock(p, 72 * H, 30)).toBe(at(72));
    expect(controlManaStock(p, 72 * H, 30)).toBeGreaterThan(controlManaStock(p, 24 * H, 30));
    // Plus de jauge de réserve (versé directement) : le bout de ligne dit le débit du jour.
    expect(controlProgress(p, 40 * H, 30)).toEqual({
      text: `💠 +${Math.round(controlManaPerHour(3, 30) * 24)}/j`,
      pct: null,
    });
  });

  it('les autres points ne rendent jamais de mana', () => {
    const m = captureControl(mapAt(30), controlIdOf('mine'), ['a0', 'a1', 'a2'], 0, 7);
    expect(collectControl(m, controlIdOf('mine'), 6 * H, 30).mana).toBe(0);
    expect(controlManaStock(pt(m, controlIdOf('mine')), 6 * H, 30)).toBe(0);
  });
});
