import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

// 🐢 Le store du personnage (~149 Ko compressés avec ce qu'il importe) ne doit pas être
// préchargé par l'accueil : on suit les imports STATIQUES depuis ce qui se charge au
// démarrage, et on exige de ne jamais l'atteindre. Les `import('…')` dynamiques ne comptent
// pas — c'est précisément le chemin de `useLazyCharacter`.
const ENTRIES = ['src/App.vue', 'src/layouts/MainLayout.vue', 'src/pages/HomePage.vue'];
const TARGET = normalize('src/stores/character.ts');

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = join(dirname(from), spec);
  else return null; // paquet npm
  for (const c of [base, base + '.ts', base + '.vue', join(base, 'index.ts')])
    if (existsSync(c) && /\.(ts|vue)$/.test(c)) return normalize(c);
  return null;
}

function staticImports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+'([^']+)'/gms)) out.push(m[1]!);
  for (const m of src.matchAll(/^\s*import\s+'([^']+)'/gm)) out.push(m[1]!);
  return out;
}

function reach(): { seen: Set<string>; path: Map<string, string> } {
  const seen = new Set<string>();
  const path = new Map<string, string>();
  const stack = ENTRIES.map((e) => normalize(e));
  for (const e of stack) seen.add(e);
  while (stack.length) {
    const f = stack.pop()!;
    for (const spec of staticImports(f)) {
      const r = resolve(f, spec);
      if (r && !seen.has(r)) {
        seen.add(r);
        path.set(r, f);
        stack.push(r);
      }
    }
  }
  return { seen, path };
}

describe('🐢 le store du personnage n’est pas préchargé par l’accueil', () => {
  const { seen, path } = reach();

  it('le parcours des imports n’est pas creux', () => {
    expect(seen.size).toBeGreaterThan(40);
    expect(seen.has(normalize('src/composables/useProgress.ts'))).toBe(true);
    expect(seen.has(normalize('src/composables/useLazyCharacter.ts'))).toBe(true);
  });

  it('aucun import statique n’atteint src/stores/character.ts', () => {
    const chain: string[] = [];
    let cur: string | undefined = seen.has(TARGET) ? TARGET : undefined;
    while (cur) {
      chain.unshift(cur);
      cur = path.get(cur);
    }
    expect(chain).toEqual([]);
  });
});
