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
