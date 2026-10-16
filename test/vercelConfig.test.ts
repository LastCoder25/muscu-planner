import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

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

  // Exhaustif par construction : un dossier d'images ajouté à public/ sans règle de cache
  // retombe sur le cache par défaut de Vercel (oubli constaté pour powers/ et militia/).
  // On demande à git ce qui est DÉPLOYÉ (Vercel construit depuis le dépôt) : un dossier
  // ignoré (public/models/, les modèles 3D bruts, locaux) faisait rougir le test sur le seul
  // poste qui l'a.
  it('chaque dossier de public/ est en cache', () => {
    const dirs = [
      ...new Set(
        execSync('git ls-files public', { encoding: 'utf8' })
          .split('\n')
          .map((f) => f.split('/'))
          .filter((p) => p.length > 2)
          .map((p) => p[1]!),
      ),
    ];
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) expect(cacheOf(`/${d}/x.webp`), d).toMatch(/max-age=86400/);
  });

  it('index.html, le service worker et le manifeste ne sont JAMAIS mis en cache', () => {
    for (const p of ['/', '/index.html', '/pwa-sw.js', '/manifest.webmanifest'])
      expect(cacheOf(p)).toBeUndefined();
  });
});
