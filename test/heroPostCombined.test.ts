import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 🧝 Signalé : le héros posté (Ossuaire) quittait son poste dès l'ENVOI d'une attaque
// combinée, alors que son groupe n'était pas encore parti. Il ne le quitte qu'au départ.
// Test de câblage (le store est hors harnais) : il lit la source.
const src = readFileSync('src/stores/character.ts', 'utf-8');

function body(name: string): string {
  const at = src.indexOf(`async function ${name}(`);
  expect(at).toBeGreaterThan(-1);
  const next = src.indexOf('\n  async function ', at + 10);
  return src.slice(at, next === -1 ? undefined : next);
}

describe('héros posté et attaque combinée', () => {
  it("l'envoi de l'attaque ne retire pas le héros de son poste", () => {
    expect(body('sendCombinedAttack')).not.toMatch(/unpostHero\(/);
  });

  it('il le quitte au départ de son groupe', () => {
    expect(body('attackTick')).toMatch(/if \(d\.hero && map\) map = unpostHero\(map\)/);
  });
});
