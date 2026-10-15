import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// Tests unitaires des libs PURES (src/lib) + un smoke de MONTAGE des composants.
// Lancé via `node node_modules/vitest/vitest.mjs run` (AppLocker : pas de shim .bin).
//
// ⚠️ Le plugin Vue et le DOM ne servent QU'aux tests de montage (`*.mount.test.ts`) : les
// libs, elles, restent pures et tournent en `node`. Un environnement par fichier
// (`// @vitest-environment happy-dom`) évite de payer un DOM pour 1800 tests qui n'en
// veulent pas.
// ⚖️ Les simulations d'ÉCONOMIE sur un an (camps, puits d'or, rythme des ascensions) prennent
// ~6 min à elles trois — plus que tout le reste de la suite (mesuré à l'audit du 2026-10-15 :
// 181 s, 104 s et 102 s). Elles ne changent qu'avec un réglage d'équilibrage : `npm test` les
// saute, `npm run test:calib` les joue (CALIB=1), et toute modification d'équilibrage DOIT
// passer par lui avant d'être annoncée.
const CALIBRATION = [
  'test/campEconomy.test.ts',
  'test/goldSink.test.ts',
  'test/ascensionRhythm.test.ts',
  // ~45 s : la courbe des donjons 13 → 94 au niveau conseillé (8 tirages × 40 descentes × 31).
  'test/dungeonCurve.test.ts',
];
const calib = process.env.CALIB === '1';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Le client Supabase est construit à l'import : sans URL il jette, et tout montage
    // d'un composant qui touche un store échouerait avant d'avoir rien prouvé.
    env: { SUPABASE_URL: 'http://localhost:54321', SUPABASE_ANON_KEY: 'test-anon-key' },
    include: calib ? CALIBRATION : ['test/**/*.test.ts'],
    exclude: calib ? [] : CALIBRATION,
    setupFiles: ['test/setup/offlineSupabase.ts'],
    // ⚠️ 30 s au lieu de 5 : les tests de CALIBRATION simulent des centaines de combats
    // (~1-3 s seuls) et, sous la charge de la suite complète sur ce poste, dépassaient
    // 5 s au hasard — un fichier différent à chaque passage, jamais seul. Le délai avait
    // été relevé au cas par cas trois fois déjà (v0.867, v0.910, v0.911.1) : le même
    // défaut revenait ailleurs. Un test qui ne TERMINE pas reste attrapé.
    testTimeout: 30_000,
  },
});
