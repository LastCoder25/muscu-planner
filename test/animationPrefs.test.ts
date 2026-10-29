import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANIMATION_OPTIONS,
  animationKey,
  parseAnimationPref,
  type AnimationKind,
} from '@/lib/animationPrefs';

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('animationPrefs', () => {
  it('tout est activé par défaut ; seul « 0 » éteint', () => {
    expect(parseAnimationPref(null)).toBe(true);
    expect(parseAnimationPref('1')).toBe(true);
    expect(parseAnimationPref('')).toBe(true);
    expect(parseAnimationPref('false')).toBe(true);
    expect(parseAnimationPref('0')).toBe(false);
  });

  it('chaque type a sa clé et son libellé, sans doublon', () => {
    const ids = ANIMATION_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids.map(animationKey)).size).toBe(ids.length);
    for (const o of ANIMATION_OPTIONS) expect(o.label.length).toBeGreaterThan(0);
  });

  // Le câblage : un interrupteur que rien ne lit serait un bouton qui ne fait rien.
  const READERS: Record<AnimationKind, string[]> = {
    siege: ['src/pages/AventurePage.vue'],
    rift: ['src/composables/useRiftAutoReplay.ts'],
    overflow: ['src/composables/useOverflowReplay.ts'],
    fboss: ['src/pages/FriendBossPage.vue'],
  };
  it.each(ANIMATION_OPTIONS.map((o) => o.id))('« %s » est lu par son lanceur', (kind) => {
    for (const file of READERS[kind]) expect(src(file)).toContain(`anim.on.${kind}`);
  });

  it('la page Base affiche les interrupteurs', () => {
    expect(src('src/pages/BasePage.vue')).toContain('ANIMATION_OPTIONS');
  });
});
