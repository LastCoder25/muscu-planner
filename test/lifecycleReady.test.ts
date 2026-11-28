// ⚠️ Le cycle de vie de l'Aventure lit le NIVEAU du héros, qui vient de l'XP de fond, chargée
// en tâche de fond. Au montage, il partait AVANT : niveau 1 → la production accumulée des
// lieux fixes était versée au tarif du niveau 1 (et la réserve repartait de zéro), les reprises
// et les sièges se jouaient au niveau 1. Un test de CÂBLAGE (la page n'est pas montable dans
// le harnais) : chaque étape qui lit le niveau passe APRÈS le garde `progress.ready`.
// 🗺️ Une exception voulue (2026-11-28, « la carte est rarement à jour ») : la CARTE se met à
// jour avant, au niveau récompensé écrit sur la fiche, jamais sans lui.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('src/pages/AventurePage.vue', 'utf8').split('\r\n').join('\n');
const start = src.indexOf('async function expePass(');
const body = src.slice(start, src.indexOf('\n}\n', start));
const guard = body.indexOf('if (!progress.ready.value) {');
/** La fin du garde : son `return`. Tout ce qui suit a le niveau. */
const ready = body.indexOf('return;', guard);
const early = body.slice(guard, ready);

describe('🏰 le cycle de vie attend le niveau du héros', () => {
  it('le garde existe', () => {
    expect(start).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(0);
    expect(ready).toBeGreaterThan(guard);
  });
  it.each(['attackStep(uid)', 'char.controlTick(', 'baseLifecycle()'])(
    '%s passe après le garde',
    (call) => {
      expect(body.indexOf(call)).toBeGreaterThan(ready);
      expect(body.slice(0, ready)).not.toContain(call);
    },
  );
  it('le niveau du sport n’est lu nulle part avant la fin du garde', () => {
    expect(body.slice(0, ready)).not.toContain('level.level');
  });
  it('🗺️ la carte se met à jour sans attendre, au niveau récompensé et jamais sans lui', () => {
    expect(body.slice(0, guard)).not.toContain('char.expeSyncMap(');
    expect(early).toMatch(
      /if \(\(char\.row\?\.reward_level \?\? 0\) > 0\)\s+await char\.expeSyncMap\(uid, Date\.now\(\), char\.heroLevel\);/,
    );
  });
  it('⏩ à l’arrivée, au retour dans l’app et au niveau connu : un rattrapage groupé', () => {
    const catchUp = src.slice(src.indexOf('async function expeCatchUp()'), start);
    expect(catchUp).toContain('char.groupedWrites(');
    expect(catchUp).toContain('await expePass(uid);');
    expect(src).toMatch(/if \(disposed\) return;[^]*?void expeCatchUp\(\);\s+expeTimer = setInterval/);
    expect(src).toContain("document.addEventListener('visibilitychange', onExpeVisible);");
    expect(src).toMatch(/\(ready\) => \{\s+if \(ready && expeTimer\) void expeCatchUp\(\);/);
  });
});
