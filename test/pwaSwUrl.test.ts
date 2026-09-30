import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Le service worker vit hors du bundle (public/) : on lit sa fonction dans le fichier
 *  pour éprouver ce que la notification ouvre VRAIMENT quand l'app est fermée. */
const src = readFileSync('public/pwa-sw.js', 'utf-8');
const body = /function appUrl\(url\) \{([\s\S]*?)\r?\n\}/.exec(src)?.[1] ?? '';
const appUrl = new Function('url', body) as (u: unknown) => string;

describe('notification : ouverture d’une fenêtre neuve (routeur en mode hash)', () => {
  it('convertit un chemin de routeur en fragment', () => {
    expect(appUrl('/expedition-map?report=1')).toBe('/#/expedition-map?report=1');
    expect(appUrl('/aventure?tab=base')).toBe('/#/aventure?tab=base');
  });
  it('ne double pas un fragment déjà présent, et garde la racine', () => {
    expect(appUrl('/#/aventure')).toBe('/#/aventure');
    expect(appUrl('/')).toBe('/');
  });
  it('replie sur la racine sans URL', () => {
    expect(appUrl(undefined)).toBe('/');
  });
  it('la fenêtre neuve passe bien par la conversion', () => {
    expect(src).toContain('openWindow(appUrl(url))');
  });
});
