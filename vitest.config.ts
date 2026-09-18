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
    include: ['test/**/*.test.ts'],
  },
});
