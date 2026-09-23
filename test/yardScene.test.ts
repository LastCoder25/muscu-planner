import { describe, it, expect } from 'vitest';
import {
  YARD_SCENE,
  lungeTo,
  yardDefSpot,
  yardFoeSpot,
  yardOpenIndex,
  yardOutsideShot,
  yardRampartSpot,
  yardTurretSpot,
} from '@/lib/yardScene';
import { buildSiegeStage } from '@/lib/siegeStage';
import { resolveRaid, rollRaid, type DefenseStructure } from '@/lib/raid';

const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

describe('🧱⚔️ la cour vue de côté', () => {
  it('bascule au temps qui OUVRE la brèche, une seule fois', () => {
    const beats = [
      { kind: 'wall', opens: false },
      { kind: 'breach', opens: true },
      { kind: 'enter', opens: false },
      { kind: 'breach', opens: false }, // elle s'élargit : pas de seconde bascule
    ] as const;
    expect(yardOpenIndex(beats)).toBe(1);
    expect(yardOpenIndex([{ kind: 'wall', opens: false }])).toBe(-1);
  });

  it('sur un vrai siège percé, la bascule précède toute entrée dans la cour', () => {
    // Une enceinte à moitié : la brèche s'ouvre à coup sûr sur ces armées.
    const defs: DefenseStructure[] = [
      { typeId: 'wall', level: 10 },
      { typeId: 'turret', level: 10 },
    ];
    let vu = 0;
    for (let s = 1; s <= 30 && vu < 5; s++) {
      const rep = resolveRaid(
        { defenses: defs, playerLevel: 28, hero: null, guard: [] },
        rollRaid(s * 7919, 28, 0, 0),
        false,
      );
      const st = buildSiegeStage(rep, 8);
      const open = yardOpenIndex(st.beats);
      const firstEnter = st.beats.findIndex((b) => b.kind === 'enter');
      if (firstEnter < 0) continue;
      vu++;
      expect(open).toBeGreaterThanOrEqual(0);
      expect(open).toBeLessThan(firstEnter);
    }
    expect(vu).toBeGreaterThan(0);
  });

  it('les intrus tiennent dans la scène, sur le sol, et jamais deux à la même place', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 3 * YARD_SCENE.foeCols; k++) {
      const p = yardFoeSpot(k);
      expect(inside(p)).toBe(true);
      expect(p.y).toBeGreaterThan(YARD_SCENE.groundY);
      const key = `${p.x.toFixed(3)}:${p.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // Au-delà, on s'entasse devant la brèche — jamais hors du cadre.
    for (let k = 0; k < 60; k++) expect(inside(yardFoeSpot(k))).toBe(true);
  });

  it('le premier entré tient le front, les suivants poussent vers la brèche', () => {
    expect(yardFoeSpot(0).x).toBeGreaterThan(yardFoeSpot(3).x);
    expect(yardFoeSpot(3).x).toBeGreaterThan(yardFoeSpot(6).x);
    expect(yardFoeSpot(60).x).toBeGreaterThan(YARD_SCENE.breachX);
  });

  it('les deux camps se font face : tout intrus à gauche de tout défenseur', () => {
    let maxFoe = 0;
    for (let k = 0; k < 40; k++) maxFoe = Math.max(maxFoe, yardFoeSpot(k).x);
    for (let j = 0; j < 30; j++) {
      const d = yardDefSpot(j);
      expect(inside(d)).toBe(true);
      expect(d.x).toBeGreaterThan(maxFoe);
      expect(d.y).toBeGreaterThan(YARD_SCENE.groundY);
    }
  });

  it('le rempart est en fond : balistes et archers au-dessus du sol, dans le cadre', () => {
    for (const n of [1, 3, 8]) {
      for (let j = 0; j < n; j++) {
        const r = yardRampartSpot(j, n);
        expect(inside(r)).toBe(true);
        expect(r.y).toBeLessThan(YARD_SCENE.groundY);
      }
      for (let t = 0; t < n; t++) {
        const p = yardTurretSpot(t, n);
        expect(inside(p)).toBe(true);
        expect(p.y).toBeLessThan(YARD_SCENE.rampartY);
      }
    }
    // Des places distinctes dès qu'il y en a plusieurs.
    expect(yardTurretSpot(0, 8).x).toBeLessThan(yardTurretSpot(7, 8).x);
  });

  it('un trait vers le dehors part hors du cadre, par-dessus le mur', () => {
    const from = yardTurretSpot(3, 8);
    const to = yardOutsideShot(from);
    expect(to.x).toBeLessThan(0);
    expect(to.y).toBeLessThanOrEqual(from.y);
  });

  it('une charge s’arrête DEVANT sa cible, sans jamais reculer', () => {
    const b = { x: 0.4, y: 0.72 };
    const m = lungeTo({ x: 0.7, y: 0.6 }, b);
    expect(m.x).toBeLessThan(0.7);
    expect(m.x).toBeGreaterThan(b.x);
    // Un intrus qui charge vers la droite s'arrête aussi devant, de son côté.
    const r = lungeTo({ x: 0.2, y: 0.6 }, { x: 0.6, y: 0.6 });
    expect(r.x).toBeLessThan(0.6);
    expect(r.x).toBeGreaterThan(0.2);
    // Déjà au contact : on ne recule pas.
    expect(lungeTo({ x: 0.45, y: 0.6 }, { x: 0.42, y: 0.6 }).x).toBe(0.45);
  });

  it('trois attaquants sur une même cible restent en ÉVENTAIL (défaut vu au banc)', () => {
    const cible = yardFoeSpot(0);
    const ys = [0, 1, 2].map((j) => lungeTo(yardDefSpot(j), cible).y);
    // Ils ne convergent pas au même point : leurs files restent distinctes et ordonnées.
    expect(ys[0]).toBeLessThan(ys[1]!);
    expect(ys[1]).toBeLessThan(ys[2]!);
    expect(ys[2]! - ys[0]!).toBeGreaterThan(0.12);
  });
});
