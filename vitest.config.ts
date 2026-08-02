import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests unitaires des libs PURES (src/lib) — aucun DOM, aucun Supabase.
// Lancé via `node node_modules/vitest/vitest.mjs run` (AppLocker : pas de shim .bin).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
