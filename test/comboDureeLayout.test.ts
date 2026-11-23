import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('⏱️ exo en durée : les bulles ne partagent pas leur ligne avec le chrono', () => {
  const page = src('../src/pages/ChallengesPage.vue');
  it('la rangée bulles + chrono s’empile pour un exo en durée', () => {
    expect(page).toMatch(/class="cl-bottom" :class="\{ stacked: legMode\(leg\) === 'time' \}"/);
  });
  it('empilée : colonne, bulles en pleine largeur, chrono sur sa ligne', () => {
    const css = page.slice(page.indexOf('.cl-bottom.stacked {'));
    expect(css).toMatch(/\.cl-bottom\.stacked \{\s*flex-direction: column;/);
    expect(css).toMatch(/\.cl-bottom\.stacked > :deep\(\.tb-bar\) \{\s*flex: none;/);
  });
});

describe('🎮 plus de jeu sur les exos en durée du Défi 360', () => {
  it('ni l’onglet 🎯 ni la fiche du défi ne proposent le jeu', () => {
    for (const p of ['../src/pages/ChallengesPage.vue', '../src/pages/ComboDetailPage.vue']) {
      expect(src(p), p).not.toContain('HoldGameLauncher');
      expect(src(p), p).not.toContain('holdTargetSec');
    }
  });
  it('le chrono, lui, reste — désormais le minuteur partagé (v1.346.0), avec son chrono', () => {
    for (const p of ['../src/pages/ChallengesPage.vue', '../src/pages/ComboDetailPage.vue']) {
      expect(src(p), p).toContain('<HoldTimerButton');
    }
    expect(src('../src/components/HoldTimerButton.vue')).toContain('data-test="hold-mode-chrono"');
  });
  it('les défis classiques gardent leur jeu (hors périmètre)', () => {
    expect(src('../src/pages/ChallengeDetailPage.vue')).toContain('HoldGameLauncher');
  });
});
