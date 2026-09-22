import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { splitStat } from '@/lib/statText';
import { effectLabelFor, type EffectType } from '@/lib/items';

// Tous les types de stat, lus dans la SOURCE : un type ajouté plus tard est éprouvé sans
// qu'on ait à penser à l'ajouter ici.
const src = fs.readFileSync('src/lib/items.ts', 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('export type EffectType =');
const union = src.slice(start, src.indexOf(';', start));
const TYPES = [...union.matchAll(/\| '([a-z_]+)'/g)].map((m) => m[1] as EffectType);

describe('splitStat — le chiffre d’une stat, mis en avant', () => {
  it('lit tous les types de stat du jeu', () => {
    expect(TYPES.length).toBeGreaterThan(15);
  });

  it('toute stat du jeu a une valeur, et rien ne se perd au découpage', () => {
    for (const t of TYPES)
      for (const v of [12, 4.5, 0.3]) {
        const line = effectLabelFor(t, v);
        const p = splitStat(line);
        expect(p.value, `${t} : « ${line} »`).not.toBe('');
        // Recollé, on retrouve la ligne À L'IDENTIQUE — espaces compris. ⚠️ Une première
        // version comparait « au blanc près » et laissait passer « de 1.4volée ».
        expect(`${p.pre}${p.value}${p.post}`, t).toBe(line);
      }
  });

  it('garde le signe et le pourcentage dans la valeur, où qu’elle soit', () => {
    expect(splitStat('+12% dégâts')).toEqual({ pre: '', value: '+12%', post: ' dégâts' });
    expect(splitStat('−4,5% dégâts reçus')).toEqual({
      pre: '',
      value: '−4,5%',
      post: ' dégâts reçus',
    });
    expect(splitStat('renvoie 12% des dégâts reçus')).toEqual({
      pre: 'renvoie ',
      value: '12%',
      post: ' des dégâts reçus',
    });
  });

  it('l’espace qui SUIT le nombre reste au texte', () => {
    const p = splitStat('une riposte critique entière de 1.4 volée');
    expect(p.value).toBe('1.4');
    expect(p.post).toBe(' volée');
  });

  it('une ligne sans chiffre reste entière (jamais de valeur inventée)', () => {
    expect(splitStat('🔥 Bourreau')).toEqual({ pre: '🔥 Bourreau', value: '', post: '' });
  });
});
