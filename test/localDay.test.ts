import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { localDayIso } from '@/lib/localDay';

describe('📅 localDayIso — LA règle « quel jour (local) est-ce ? »', () => {
  it('rend la date LOCALE, jamais la date UTC', () => {
    // 00 h 30 le 21 : en France c'est le 21, en UTC c'est encore le 20. On veut le 21.
    expect(localDayIso(new Date(2026, 8, 21, 0, 30))).toBe('2026-09-21');
    expect(localDayIso(new Date(2026, 8, 21, 23, 59))).toBe('2026-09-21');
  });

  it('complète mois et jour sur deux chiffres', () => {
    expect(localDayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('⚠️ PERSONNE NE LA RECOPIE : aucun autre fichier de src/ ne fabrique une date à la main', () => {
    // v0.1010 : douze copies identiques vivaient dans les écrans, faute de pouvoir importer
    // la règle sans cycle. Une copie finit toujours par diverger — ce test les interdit.
    const src = resolve(__dirname, '../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|vue)$/.test(n)) files.push(p);
      }
    };
    walk(src);
    const copies = files.filter(
      (f) =>
        !f.endsWith('localDay.ts') &&
        /getFullYear\(\)\}-\$\{String\(\w+\.getMonth\(\) \+ 1\)/.test(readFileSync(f, 'utf8')),
    );
    expect(copies.map((f) => relative(src, f))).toEqual([]);
  });
});
