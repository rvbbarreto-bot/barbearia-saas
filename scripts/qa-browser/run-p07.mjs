#!/usr/bin/env node
/** Instala Playwright Chromium se necessário e executa portal-p07.spec.mjs */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptDir = __dirname;

function run(cmd, args, cwd = scriptDir) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['install', '--no-save', 'playwright@1.52.0'], scriptDir);
run('npx', ['playwright', 'install', 'chromium'], scriptDir);

await import('./portal-p07.spec.mjs');
