import { describe, it, expect } from 'vitest';
import { LABYRINTHS, type Labyrinth } from '@/data/labyrinths';
import { LABY_ARCHETYPES, pickLabyFoe } from '@/data/labyrinthFoes';
import { mulberry32 } from '@/lib/combat';
import { generateFloor } from '@/lib/dungeonCrawl';
import {
  labyrinthFoe,
  labyrinthRoomOrder,
  labyrinthTrapDamage,
  simulateLabyrinthRun,
} from '@/lib/labyrinthRun';
import { labyrinthFoeBase } from '@/lib/proceduralContent';
import { gearedFighter } from './helpers/gearedFighter';

const tier = (id: string) => LABYRINTHS.find((l) => l.id === id)!;

/** Part des runs nettoyés, moyennée sur plusieurs tirages d'équipement : avec un seul, on
 *  mesure une anecdote (d'un tirage à l'autre, un même palier va de 45 % à 95 %). */
function clearRate(laby: Labyrinth, level: number, companions = true): number {
  let w = 0;
  let n = 0;
  for (let g = 1; g <= 6; g++) {
    const p = gearedFighter(level, g, companions);
    for (let s = 0; s < 20; s++) {
      if (simulateLabyrinthRun(p, laby, s * 977 + 13 + g * 31)) w++;
      n++;
    }
  }
  return w / n;
}

describe('Labyrinthe — créatures', () => {
  it("la créature d'une salle est la base du palier modulée par son archétype", () => {
    for (const a of LABY_ARCHETYPES) {
      const foe = { name: 'x', emoji: '👾', arch: a };
      const base = labyrinthFoeBase(40, false, 0.5);
      const m = labyrinthFoe(40, false, 0.5, foe);
      expect(m.pv).toBe(Math.max(10, Math.round(base.pv * a.pvMult)));
      expect(m.damage).toBe(Math.max(1, Math.round(base.damage * a.dmgMult)));
    }
  });

  it('plus profond et gardien = plus dur', () => {
    const surface = labyrinthFoeBase(40, false, 0);
    const fond = labyrinthFoeBase(40, false, 1);
    const gardien = labyrinthFoeBase(40, true, 1);
    expect(fond.pv).toBeGreaterThan(surface.pv);
    expect(fond.damage).toBeGreaterThan(surface.damage);
    expect(gardien.pv).toBeGreaterThan(fond.pv);
  });

  it("l'auto explore d'abord et affronte le gardien en dernier", () => {
    let withBoss = 0;
    for (let s = 1; s <= 30; s++) {
      const floor = generateFloor(s, 4, 5); // dernier étage : il porte le gardien
      const order = labyrinthRoomOrder(floor);
      expect(order.some((r) => r.type === 'start' || r.type === 'stairs')).toBe(false);
      const b = order.findIndex((r) => r.type === 'boss');
      if (b >= 0) {
        withBoss++;
        expect(b).toBe(order.length - 1);
      }
    }
    expect(withBoss).toBe(30);
  });

  it('un piège à dégâts vaut 5 % des PV max, modulé par son type', () => {
    expect(labyrinthTrapDamage(1000, 1)).toBe(50);
    expect(labyrinthTrapDamage(1000, 1.7)).toBe(85);
    expect(labyrinthTrapDamage(100, 1)).toBe(8); // plancher
  });

  it('un run est rejouable : même graine, même issue', () => {
    const laby = tier('chaos');
    const p = gearedFighter(40, 1);
    for (let s = 1; s <= 10; s++)
      expect(simulateLabyrinthRun(p, laby, s)).toBe(simulateLabyrinthRun(p, laby, s));
    // Les gardiens du roster sont bien tirés (sanity du câblage roster → combat).
    expect(pickLabyFoe(mulberry32(1), 4, true).name).toBeTruthy();
  });
});

// ⚠️ Mesuré sur le VRAI parcours (toutes les salles, comme l'auto) avec un joueur complet
// (objets + familiers + talent). Avant v0.851, un build complet nettoyait 98-100 % de ses
// paliers à leur niveau dès le palier 12, et les deux premiers à 1 %.
describe('Labyrinthe — calibration (v0.851, « le sport est le plafond »)', () => {
  it('à son niveau, un build complet nettoie un palier le plus souvent, sans rouler dessus', () => {
    const rates = ['abysse', 'chaos', 'neant'].map((id) => clearRate(tier(id), tier(id).recoLevel));
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(0.88);
    for (const r of rates) expect(r).toBeLessThan(0.95);
  }, 60000);

  it('cinq niveaux plus haut, le palier devient sûr', () => {
    const rates = ['abysse', 'chaos', 'neant'].map((id) =>
      clearRate(tier(id), tier(id).recoLevel + 5),
    );
    expect(Math.min(...rates)).toBeGreaterThan(0.85);
  }, 60000);

  it("les paliers d'initiation se passent à leur niveau (rampe de début de partie)", () => {
    expect(clearRate(tier('novice'), 2)).toBeGreaterThan(0.75);
    expect(clearRate(tier('sentiers'), 3)).toBeGreaterThan(0.75);
  }, 60000);
});
