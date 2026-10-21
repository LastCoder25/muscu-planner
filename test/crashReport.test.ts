import { describe, it, expect } from 'vitest';
import { crashReportText, describeCrash, isIgnorableError } from '@/lib/crashReport';
import { reportCrash, useCrash } from '@/composables/useCrash';

describe('⚠️ crashReport — dire ce qui a planté', () => {
  it('met en forme une Error : nom, message, où, pile tronquée', () => {
    const e = new TypeError('x is undefined');
    const c = describeCrash(e, 'vue · setup function');
    expect(c.message).toBe('TypeError: x is undefined');
    expect(c.detail).toContain('où : vue · setup function');
    expect(c.detail.split('\n').length).toBeLessThanOrEqual(13);
  });
  it('une valeur jetée qui n’est pas une Error se lit quand même', () => {
    expect(describeCrash('boum', 'promesse rejetée').message).toBe('boum');
  });
  it('les bruits connus sont ignorés, une vraie erreur non', () => {
    expect(isIgnorableError('ResizeObserver loop completed with undelivered notifications.')).toBe(
      true,
    );
    expect(isIgnorableError('TypeError: Failed to fetch dynamically imported module: x.js')).toBe(
      true,
    );
    expect(isIgnorableError('Script error.')).toBe(true);
    expect(isIgnorableError('TypeError: Cannot read properties of undefined')).toBe(false);
  });
  it('le texte envoyé porte la version et l’écran, borné', () => {
    const t = crashReportText({ message: 'M', detail: 'D'.repeat(9000) }, '/aventure', '1.2.3');
    expect(t.startsWith('⚠️ Plantage v1.2.3 sur /aventure\nM\n')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(4000);
  });
  it('le panneau garde la PREMIÈRE erreur, ignore les bruits', () => {
    const c = useCrash();
    c.dismiss();
    reportCrash(new Error('ResizeObserver loop limit exceeded'), 'window.onerror');
    expect(c.current.value).toBeNull();
    reportCrash(new Error('première'), 'vue · render');
    reportCrash(new Error('seconde'), 'vue · render');
    expect(c.current.value?.message).toBe('Error: première');
    c.dismiss();
    expect(c.current.value).toBeNull();
  });
});
