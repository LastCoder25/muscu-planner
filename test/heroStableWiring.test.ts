import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 🧝 Passe « héros stable » (2026-10-07) — test de CÂBLAGE : le store est hors harnais, on
// vérifie qu'il appelle bien les règles pures testées dans `heroStable.test.ts`.
const src = readFileSync('src/stores/character.ts', 'utf-8');

function body(name: string): string {
  const at = src.indexOf(`async function ${name}(`);
  expect(at).toBeGreaterThan(-1);
  const next = src.indexOf('\n  async function ', at + 10);
  return src.slice(at, next === -1 ? undefined : next);
}

describe('le store applique les règles du héros posté', () => {
  it('le siège exclut un héros retenu sur la carte', () => {
    expect(body('baseTickInner')).toMatch(/heroHomeAt\(outings, at\) && !heroAwayOnMapAt\(cur\.expedition_map, at\)/);
  });
  it('se poster suit la même règle que l’écran (heroEngaged)', () => {
    expect(body('sendHeroToPost')).toMatch(/if \(heroEngaged\.value\) return/);
  });
  it('resté sur le point pris, son voyage est séparé à l’arrivée', () => {
    const b = body('expeTick');
    expect(b).toMatch(/heroStayedSplit\(/);
    expect(b).toMatch(/expedition: split \? null : exp2/);
  });
  it('blessé au retour d’une sortie, il rentre à pied (convalescence à l’arrivée)', () => {
    const b = body('expeSettle');
    expect(b).toMatch(/heroWalksHomeFrom\(/);
    expect(b).toMatch(/heroWoundAfter\(hurtWalk\.heroReturnAt/);
  });
  it('le rappel complet d’un lieu ramène aussi le héros posté ou en route', () => {
    const b = body('recallControl');
    expect(b).toMatch(/recallPostedHero\(/);
    expect(b).toMatch(/turnBackComingHero\(/);
  });
});
