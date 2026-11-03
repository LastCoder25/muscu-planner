import { describe, expect, it } from 'vitest';
import { useAdvXpFx } from '@/composables/useAdvXpFx';
import { useAnimationPrefs } from '@/composables/useAnimationPrefs';
import { useGameFx } from '@/composables/useGameFx';
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
    runes: ['src/composables/useGameFx.ts', 'src/components/RuneBankSheet.vue'],
    summon: ['src/components/SummonPanel.vue'],
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

  it('🔮 Runes éteintes : la pose d’une rune ne met rien en file, rallumée elle y entre', () => {
    const fx = useGameFx();
    const prefs = useAnimationPrefs();
    fx.queue.value.length = 0;
    prefs.set('runes', false);
    fx.celebrateRune('rise', 'speed', 'Aldo', 1);
    expect(fx.queue.value.length).toBe(0);
    prefs.set('runes', true);
    fx.celebrateRune('rise', 'speed', 'Aldo', 1);
    expect(fx.queue.value.length).toBe(1);
    fx.queue.value.length = 0;
  });

  it('🎰 Tirages et 🔮 runes : coupés, l’écran ne s’ouvre pas MAIS le résultat est annoncé', () => {
    // Le tirage est déjà crédité : sans écran, une ligne doit le dire (jamais muet).
    expect(src('src/components/SummonPanel.vue')).toContain('announcePull');
    expect(src('src/components/RuneBankSheet.vue')).toContain('showFuse');
  });

  it('la page Base range notifications et animations dans une section Réglages', () => {
    const page = src('src/pages/BasePage.vue');
    expect(page).toContain('settings-head');
    expect(page.indexOf('settings-head')).toBeLessThan(page.indexOf('🔔 Me prévenir'));
    expect(page.indexOf('🔔 Me prévenir')).toBeLessThan(page.indexOf('🎬 Animations'));
  });

  it('la page Base affiche les interrupteurs', () => {
    expect(src('src/pages/BasePage.vue')).toContain('ANIMATION_OPTIONS');
  });
});
