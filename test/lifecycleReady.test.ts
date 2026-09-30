// ⚠️ Le cycle de vie de l'Aventure lit le NIVEAU du héros, qui vient de l'XP de fond, chargée
// en tâche de fond. Au montage, il partait AVANT : niveau 1 → la production accumulée des
// lieux fixes était versée au tarif du niveau 1 (et la réserve repartait de zéro), les reprises
// et les sièges se jouaient au niveau 1. Un test de CÂBLAGE (la page n'est pas montable dans
// le harnais) : chaque étape qui lit le niveau passe APRÈS le garde `progress.ready`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/pages/AventurePage.vue', 'utf8');
const start = src.indexOf('async function expeLifecycle()');
const body = src.slice(start, src.indexOf('\n}\n', start));
const guard = body.indexOf('if (!progress.ready.value) return;');

describe('🏰 le cycle de vie attend le niveau du héros', () => {
  it('le garde existe', () => {
    expect(start).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(0);
  });
  it.each(['attackStep(uid)', 'char.controlTick(', 'char.expeSyncMap(', 'baseLifecycle()'])(
    '%s passe après le garde',
    (call) => {
      const at = body.indexOf(call);
      expect(at).toBeGreaterThan(guard);
    },
  );
  it('le niveau n’est lu nulle part avant le garde', () => {
    expect(body.slice(0, guard)).not.toContain('level.level');
  });
});
