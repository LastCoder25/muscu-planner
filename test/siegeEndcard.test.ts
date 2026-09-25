import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// L'écran de fin du siège se lisait « en transparence » : la vue de la cour (YardStage)
// ne formait pas de contexte d'empilement, donc ses balistes, combattants et projectiles
// (z-index 5 à 60) passaient AU-DESSUS de l'écran de fin (z-index 4). Test de copie
// assumé : aucune porte ne voit ce rendu (le smoke ne joue pas de siège).

function rule(file: string, selector: string): string {
  const src = readFileSync(file, 'utf8');
  const i = src.indexOf(`\n${selector} {`);
  expect(i, `règle ${selector} introuvable dans ${file}`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
}

describe("écran de fin du siège", () => {
  it('la vue de la cour est un seul calque', () => {
    expect(rule('src/components/YardStage.vue', '.yard')).toMatch(/isolation:\s*isolate/);
  });

  it("le fond de l'écran de fin est opaque", () => {
    const r = rule('src/components/SiegeStage.vue', '.endcard');
    const bg = /background:\s*([^;]+);/.exec(r)?.[1] ?? '';
    expect(bg).not.toMatch(/rgba|transparent|color-mix/);
    expect(bg).not.toBe('');
  });
});
