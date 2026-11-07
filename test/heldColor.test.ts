import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HELD_COLOR } from '@/lib/controlPoints';
import { CHARACTER_RANKS } from '@/lib/characterRank';

const read = (f: string) => readFileSync(f, 'utf8');

/** Les couleurs des trajets, lues dans la feuille de style de la carte. */
function trailColors(): string[] {
  const css = read('src/pages/ExpeditionMapPage.vue');
  const out: string[] = [];
  for (const m of css.matchAll(/\.trail[^{]*\{[^}]*?stroke:\s*(#[0-9a-fA-F]{6})/g)) out.push(m[1]!.toLowerCase());
  return out;
}

describe('🏰 la couleur d’un lieu fixe tenu', () => {
  it('le jeton CSS --held vaut HELD_COLOR', () => {
    const m = read('src/css/app.scss').match(/--held:\s*(#[0-9a-fA-F]{6})/);
    expect(m?.[1]?.toLowerCase()).toBe(HELD_COLOR.toLowerCase());
  });
  it('aucun trajet ni aucun rang ne la partage', () => {
    const trails = trailColors();
    expect(trails.length).toBeGreaterThan(2);
    expect(trails).not.toContain(HELD_COLOR.toLowerCase());
    expect(CHARACTER_RANKS.map((r) => r.color.toLowerCase())).not.toContain(HELD_COLOR.toLowerCase());
  });
  it('le fort et le drapeau d’un lieu tenu lisent le jeton, plus le violet des équipes', () => {
    const css = read('src/components/MapPoiLayer.vue');
    for (const sel of ['.ctl-bg.player', '.ctl-flag.player']) {
      const block = css.slice(css.indexOf(sel + ' {'), css.indexOf('}', css.indexOf(sel + ' {')));
      expect(block).toContain('var(--held)');
      expect(block).not.toContain('#b57bff');
    }
  });
});
