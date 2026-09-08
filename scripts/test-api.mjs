import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Portable npm entry point. Integration still requires an explicit isolated URL.
const integration = process.argv.includes('--empty-db');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test',
  ...(integration ? ['integration/emptyDatabaseJourney.test.ts'] : ['src/**/*.test.ts'])], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
