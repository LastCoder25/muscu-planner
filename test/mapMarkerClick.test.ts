// 🖱️ Les pions des troupes en route ne volent pas le clic des lieux (v1.51.1, signalé : un
// objectif pris dont une partie de la troupe rentre ne s'ouvrait plus — le pion du retour,
// dessiné PAR-DESSUS les lieux, partait exactement de sa position). Test de COPIE assumé :
// aucune porte ne clique la carte à cet instant précis.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('src/pages/ExpeditionMapPage.vue', 'utf8');

describe('🖱️ les pions de la carte laissent passer le clic', () => {
  it('pion d’une troupe et pion du héros : pointer-events none', () => {
    const rule = /\.van-mark,\s*\.hero\s*\{[^}]*pointer-events:\s*none/;
    expect(css).toMatch(rule);
  });
  it('la cible de demi-tour, elle, reste cliquable', () => {
    expect(css).toMatch(/\.recall-hit\s*\{[^}]*cursor:\s*pointer/);
    expect(css).not.toMatch(/\.recall-hit\s*\{[^}]*pointer-events:\s*none/);
  });
});
