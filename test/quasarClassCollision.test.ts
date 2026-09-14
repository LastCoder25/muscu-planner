import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ⚠️ BUG RÉEL (v0.848) : les cases « bonus » du Défi 360 portaient la classe `z-max`, qui
// est AUSSI un utilitaire Quasar (`.z-max { z-index: 9998 !important }`). Dans une grille,
// un z-index s'applique même sans `position` : les cases passaient au-dessus de TOUTES les
// fenêtres (z-index 6000) — on les voyait « à travers les modales », et aucun voile, même
// opaque, n'y pouvait rien (trois correctifs de voile en vain). Ce test interdit qu'une
// classe de l'app reprenne le nom d'un utilitaire Quasar qui change l'empilement.

const ROOT = resolve(__dirname, '..');
const quasarCss = readFileSync(join(ROOT, 'node_modules/quasar/dist/quasar.prod.css'), 'utf8');

// Utilitaires Quasar à UNE classe qui posent un z-index.
const Z_UTILS = new Set<string>();
for (const m of quasarCss.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  if (!/z-index/.test(m[2]!)) continue;
  for (const sel of m[1]!.split(',')) {
    const one = sel.trim().match(/^\.([a-zA-Z0-9_-]+)$/);
    if (one) Z_UTILS.add(one[1]!);
  }
}
// Usages VOULUS des utilitaires Quasar (pas des classes de l'app qui s'y heurtent).
const ALLOWED = new Map<string, string[]>([
  ['fullscreen', ['src/pages/ErrorNotFound.vue']], // page 404 du gabarit Quasar
  ['q-btn__content', ['src/pages/ExpeditionPage.vue']], // style d'un composant Quasar
]);

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : [];
  });
}

describe('classes de l’app vs utilitaires Quasar', () => {
  it('Quasar expose bien ses utilitaires de z-index (sinon le test ne vérifierait rien)', () => {
    expect(Z_UTILS.has('z-max')).toBe(true);
    expect(Z_UTILS.has('z-top')).toBe(true);
  });

  it('aucune classe de l’app ne porte le nom d’un utilitaire Quasar qui change l’empilement', () => {
    const hits: string[] = [];
    for (const file of vueFiles(join(ROOT, 'src'))) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      const src = readFileSync(file, 'utf8');
      const names = new Set<string>();
      for (const m of src.matchAll(/class="([^"]+)"/g))
        m[1]!.split(/\s+/).forEach((c) => names.add(c));
      // Sélecteurs des feuilles de style (.foo) — y compris les classes construites en chaîne
      // (`'z-' + zone`), qui n'apparaissent en entier que dans le CSS.
      const style = src.split('<style')[1] ?? '';
      for (const m of style.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) names.add(m[1]!);
      for (const n of names)
        if (Z_UTILS.has(n) && !(ALLOWED.get(n) ?? []).includes(rel)) hits.push(`${rel} : .${n}`);
    }
    expect(hits).toEqual([]);
  });

  it('aucun préfixe de classe construit en chaîne ne tombe dans l’espace `z-` de Quasar', () => {
    const hits: string[] = [];
    for (const file of vueFiles(join(ROOT, 'src'))) {
      const src = readFileSync(file, 'utf8');
      if (/['"`]z-['"`]\s*\+/.test(src)) hits.push(relative(ROOT, file));
    }
    expect(hits).toEqual([]);
  });
});
