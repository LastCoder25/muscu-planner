// Joue les simulations d'économie sur un an, que `npm test` saute (cf. vitest.config.ts).
// Un script plutôt que `CALIB=1 vitest` : la syntaxe d'environnement n'est pas la même
// sous Windows, et les shims de node_modules/.bin sont bloqués sur ce poste (AppLocker).
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, CALIB: '1' },
});
process.exit(r.status ?? 1);
