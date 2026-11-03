import { describe, expect, it } from 'vitest';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { useAnimationPrefs } from '@/composables/useAnimationPrefs';
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
    champxp: ['src/composables/useAdvXpFx.ts'],
  };
  it.each(ANIMATION_OPTIONS.map((o) => o.id))('« %s » est lu par son lanceur', (kind) => {
    for (const file of READERS[kind]) expect(src(file)).toContain(`anim.on.${kind}`);
  });

  it('⭐ XP des champions éteinte : la barre ne s’ouvre pas, rallumée elle s’ouvre', () => {
    const fx = useAdvXpFx();
    const prefs = useAnimationPrefs();
    const tracks = [{ xp: 40 }] as never;
    prefs.set('champxp', false);
    fx.show(tracks);
    expect(fx.current.value).toBeNull();
    prefs.set('champxp', true);
    fx.show(tracks);
    expect(fx.current.value).not.toBeNull();
    fx.dismiss();
  });

  it('la page Base affiche les interrupteurs', () => {
    expect(src('src/pages/BasePage.vue')).toContain('ANIMATION_OPTIONS');
  });
});
