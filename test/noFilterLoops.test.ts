import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 🔋 Aucune animation EN BOUCLE n'anime `filter` (audit du 2026-10-15).
 * Sur du SVG, un filtre n'est pas composité : l'animer repeint tout le dessin à chaque image.
 * Mesuré sur l'écran Base (voyants du Panthéon) : ~8 % d'un cœur en continu, rien qu'en
 * restant sur l'écran. Une animation jouée UNE fois (éclat, révélation) n'est pas concernée.
 * Exceptions assumées : deux scènes qui ne durent que le temps d'une révélation.
 */
const ALLOWED = new Set(['FriendBossStage.vue fbs-beam-pulse', 'GachaReveal.vue ivk-apex-veins']);

function infiniteFilterLoops(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) infiniteFilterLoops(p, out);
    else if (/\.(vue|scss)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8').replace(/\r/g, '');
      const re = /@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const name = m[1]!;
        if (!/filter\s*:/.test(m[2]!)) continue;
        if (new RegExp(`animation:[^;]*\\b${name}\\b[^;]*infinite`).test(s)) out.push(`${e.name} ${name}`);
      }
    }
  }
  return out;
}

describe('🔋 animations en boucle', () => {
  it('aucune n’anime filter (hors scènes de révélation)', () => {
    expect(infiniteFilterLoops('src').filter((x) => !ALLOWED.has(x))).toEqual([]);
  });
});
