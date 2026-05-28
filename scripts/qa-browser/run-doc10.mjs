#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: __dirname, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['install', '--no-save', 'playwright@1.52.0']);
run('npx', ['playwright', 'install', 'chromium']);
await import('./qa-junior-doc10.mjs');
