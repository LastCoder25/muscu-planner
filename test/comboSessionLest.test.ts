// 🧱 Lest d'une tenue dans la SÉANCE GÉNÉRÉE du Défi 360 : le stepper s'affiche pour une tenue
// lestable, le lest choisi part avec chaque série chronométrée (`LoggedSet.lest`) et arrive au
// défi (`combo.addSet(…, lest)`), jamais comme poids.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../src/pages/ComboSessionPage.vue', import.meta.url), 'utf8');
const fn = (name: string) => {
  const from = page.indexOf(`function ${name}(`);
  const to = page.indexOf('\nfunction ', from + 1);
  return page.slice(from, to < 0 ? undefined : to);
};

describe('🧱 séance générée : lest des tenues', () => {
  it('le stepper n’apparaît que pour une tenue lestable de la séance', () => {
    expect(page).toMatch(/<HoldLestStepper\s+v-if="exo\.time && legOf\(exo\) && legHoldLoadable\(legOf\(exo\)!\)"/);
  });
  it('chaque série chronométrée porte le lest choisi, à part du poids', () => {
    const v = fn('validateTimeSet');
    expect(v).toMatch(/legHoldLest\(legOf\(exo\)/);
    expect(v).toMatch(/\.\.\.\(lest > 0 \? \{ lest \} : \{\}\)/);
    expect(v).toMatch(/weight: null/);
  });
  it('à l’enregistrement, le lest part au défi (9ᵉ argument de addSet)', () => {
    const c = fn('commitLogged');
    expect(c).toMatch(/v\.at,\s+v\.lest,/);
  });
});
