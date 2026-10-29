import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔌 Le store et la page sont hors harnais (Supabase, Pinia, horloge) : ces garde-fous lisent la
 * SOURCE. Ce ne sont PAS des tests de comportement du store — seulement la preuve que le câblage
 * attendu (une écriture, le bon recalcul, le bon chemin d'envoi) n'a pas été retiré. Pour rester
 * stables : on ne lit que le CODE de la fonction (commentaires retirés) et les espaces sont
 * supprimés, donc un saut de ligne déplacé par Prettier ne casse rien.
 */
const store = readFileSync('src/stores/character.ts', 'utf-8');
const planner = readFileSync('src/composables/useExpeditionPlanner.ts', 'utf-8');
const page = readFileSync('src/pages/ExpeditionMapPage.vue', 'utf-8');

/** Le code d'une fonction : de `function name(` jusqu'au prochain commentaire de bloc au même niveau,
 *  sans commentaires ni espaces. */
function code(src: string, name: string): string {
  const at = src.indexOf(`function ${name}(`);
  expect(at, `fonction ${name} introuvable`).toBeGreaterThan(-1);
  const next = src.indexOf('\n  /**', at + 10);
  return strip(src.slice(at, next === -1 ? undefined : next));
}
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '');
}

describe('🔌 vague : une écriture, par le chemin d’envoi de « Tout lancer »', () => {
  it('le store écrit la vague dans la carte, en UNE écriture', () => {
    const b = code(store, 'recordWave');
    expect(b.match(/persist\(/g)).toHaveLength(1);
    expect(b).toMatch(/expedition_map:\{\.\.\.map,lastWave:wave\}/);
  });

  it('« Tout lancer » retient ce qui est PARTI, pas ce qui était proposé', () => {
    const b = code(planner, 'launchAll');
    expect(b).toMatch(/sent\.push\(r\)/);
    expect(b).toMatch(/awaitrememberWave\(sent\)/);
    expect(b.indexOf('sent.push(r)')).toBeGreaterThan(b.indexOf('constrefused=awaitsendRow(r)'));
  });

  it('la relance part par le MÊME chemin d’envoi et liste les refus, sans réécrire la vague', () => {
    const b = code(planner, 'relaunchWave');
    expect(b).toMatch(/planReplay\(wave,replayDeps\(replayWorld\(\)\)/);
    expect(b).toMatch(/awaitsendRow\(/);
    expect(b).toMatch(/if\(refused\)skipped\.push/);
    expect(b).not.toMatch(/recordWave|rememberWave/);
  });
});

describe('🔌 objectifs : le store recalcule, écrit une fois, ne croit pas l’écran', () => {
  const b = code(store, 'claimDailyObjectives');

  it('il recalcule lui-même (même fonction que l’écran) et ne note que le dû', () => {
    expect(b).toMatch(/dailyStatesFor\(map,cur\.messages/);
    expect(b).toMatch(/constdue=dueObjectives\(states\)/);
    expect(b).toMatch(/if\(!due\.length\)returnnone/);
  });

  it('UNE écriture : la marque du jour, et le consommable seulement quand les trois sont atteints', () => {
    expect(b.match(/persist\(/g)).toHaveLength(1);
    expect(b).toMatch(/daily:\{day,done:\[\.\.\.latchedToday\(map\.daily,day\),\.\.\.due\.map/);
    expect(b).toMatch(/constpay=bonusDue\(states\)/);
    expect(b).toMatch(
      /\.\.\.\(pay\?\{supplies:addSupplies\(cur\.supplies,rewardStock\(reward\)\)\}:\{\}\)/,
    );
  });

  it('le bonus n’est jamais de l’or, un ticket ni de l’énergie (le code, pas les commentaires)', () => {
    expect(b).not.toMatch(/gold|ticket|energy|mana/i);
  });

  it('tick de fond : il passe son tour si une écriture vole, et refuse la réentrée', () => {
    expect(b).toMatch(/dailyBusy\|\|!tickMayWrite\(cur\)/);
    expect(b).toMatch(/finally\{dailyBusy=false;/);
  });

  it('la page RETENTE le paiement à chaque minute et le déclenche avec le fuseau du joueur', () => {
    const p = strip(page);
    expect(p).toMatch(
      /watch\(\(\)=>claimRetryKey\(dueObjectives\(daily\.value\)\.length,coarseNow\.value\)/,
    );
    expect(p).toMatch(
      /char\.claimDailyObjectives\(uid,Date\.now\(\),newDate\(\)\.getTimezoneOffset\(\)\)/,
    );
  });
});
