import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'studio-tests-'));
try {
  await build({ entryPoints: ['tests/studio.test.ts'], outfile: join(dir, 'suite.mjs'), bundle: true, platform: 'node', format: 'esm' });
  const result = spawnSync(process.execPath, ['--test', join(dir, 'suite.mjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
