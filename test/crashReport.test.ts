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
  // ⚠️ Signalé en v1.262.0 (« [object Object] » sur /aventure, régulièrement) : Supabase
  // rend ses erreurs en OBJETS SIMPLES { message, details, hint, code }, pas en Error.
  it('une erreur Supabase (objet simple) se lit : message, code, détails', () => {
    const c = describeCrash(
      { message: 'new row violates row-level security', code: '42501', details: 'D', hint: 'H' },
      'promesse rejetée',
    );
    expect(c.message).toBe('new row violates row-level security (42501)');
    expect(c.detail).toContain('D');
    expect(c.detail).toContain('H');
    expect(describeCrash({ foo: 1 }, 'promesse rejetée').message).toBe('{"foo":1}');
  });
  it('une coupure réseau rendue par Supabase est un bruit, comme une Error réseau', () => {
    const coupure = { message: 'TypeError: Load failed', details: '', hint: '', code: '' };
    const c = useCrash();
    c.dismiss();
    reportCrash(coupure, 'promesse rejetée');
    reportCrash({ message: 'TypeError: Failed to fetch', code: '' }, 'promesse rejetée');
    expect(c.current.value).toBeNull();
  });
  it('seule une erreur de l’AFFICHAGE (Vue) dit que l’écran a planté', () => {
    expect(describeCrash(new Error('x'), 'vue · render').screen).toBe(true);
    expect(describeCrash(new Error('x'), 'promesse rejetée').screen).toBe(false);
    expect(describeCrash(new Error('x'), 'window.onerror').screen).toBe(false);
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
    const t = crashReportText(
      { message: 'M', detail: 'D'.repeat(9000), screen: true },
      '/aventure',
      '1.2.3',
    );
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
