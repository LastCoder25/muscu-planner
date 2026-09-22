import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * ⚙️ LA CONFIGURATION VERCEL (v0.1033) — le quota Vercel arrivait au maximum.
 * Deux leviers : ne CONSTRUIRE que `main` (chaque push de branche lançait un build Preview,
 * ~100 commits par jour sur une quinzaine de branches), et METTRE EN CACHE ce qui peut l'être.
 * ⚠️ Le garde-fou qui compte autant : `index.html`, le service worker et le manifeste ne
 * doivent JAMAIS être mis en cache — l'app se redéploie plusieurs fois par jour, et un
 * `index.html` en cache servirait une version périmée (cf. `useAppUpdate`).
 */
const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
  git?: { deploymentEnabled?: Record<string, boolean> };
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};
const cacheOf = (path: string): string | undefined => {
  for (const h of cfg.headers ?? []) {
    const re = new RegExp('^' + h.source.replace(/\(\.\*\)/g, '.*') + '$');
    if (re.test(path)) return h.headers.find((x) => x.key.toLowerCase() === 'cache-control')?.value;
  }
  return undefined;
};

describe('⚙️ vercel.json', () => {
  it('seule la branche main se déploie', () => {
    const d = cfg.git?.deploymentEnabled ?? {};
    expect(d.main).toBe(true);
    // Une branche qui correspond à plusieurs règles se déploie dès qu'une vaut true (doc
    // Vercel) : `**: false` coupe tout le reste, `main: true` rouvre la production.
    expect(d['**']).toBe(false);
    expect(
      Object.entries(d)
        .filter(([, v]) => v)
        .map(([k]) => k),
    ).toEqual(['main']);
  });

  it('les assets hashés sont en cache long, immuables', () => {
    expect(cacheOf('/assets/index-abc123.js')).toMatch(/max-age=31536000.*immutable/);
  });

  it('les illustrations sont en cache (un jour)', () => {
    for (const p of ['/exercises/ex_burpees.jpg', '/champions/orsene.webp', '/monsters/x.webp'])
      expect(cacheOf(p)).toMatch(/max-age=86400/);
  });

  it('index.html, le service worker et le manifeste ne sont JAMAIS mis en cache', () => {
    for (const p of ['/', '/index.html', '/pwa-sw.js', '/manifest.webmanifest'])
      expect(cacheOf(p)).toBeUndefined();
  });
});
