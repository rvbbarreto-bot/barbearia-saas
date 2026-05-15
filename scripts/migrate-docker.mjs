#!/usr/bin/env node
/**
 * Aplica `database/migrations/*.sql` em ordem lexicográfica, com a mesma tabela
 * de controlo `_migrations` que `migrate.sh`, mas **sem** `psql` local: usa
 * `docker compose exec` no serviço `postgres`.
 *
 * Uso (na raiz do repo, com Postgres do Compose a correr):
 *   node ./scripts/migrate-docker.mjs
 *   node ./scripts/migrate-docker.mjs --dry-run
 *   node ./scripts/migrate-docker.mjs --seed   # após migrations: aplica database/seeds/001_demo.sql
 *
 * Variáveis: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB no `.env` (igual ao Compose).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'database', 'migrations');

const dryRun = process.argv.includes('--dry-run');
const withSeed = process.argv.includes('--seed');

function loadDotEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Ficheiro .env não encontrado em ${envPath}. Copie .env.example para .env.`);
  }
  const out = { ...process.env };
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function dockerPsql(env, sqlText) {
  const { POSTGRES_USER: u, POSTGRES_PASSWORD: pw, POSTGRES_DB: d } = env;
  if (!u || !pw || !d) {
    throw new Error('POSTGRES_USER, POSTGRES_PASSWORD e POSTGRES_DB são obrigatórios no .env.');
  }
  const args = [
    'compose',
    'exec',
    '-i',
    '-T',
    '-e',
    `PGPASSWORD=${pw}`,
    'postgres',
    'psql',
    '-U',
    u,
    '-d',
    d,
    '-v',
    'ON_ERROR_STOP=1',
  ];
  const r = spawnSync('docker', args, {
    cwd: repoRoot,
    input: sqlText,
    encoding: 'utf-8',
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `psql exit ${r.status}`);
  }
  return r.stdout ?? '';
}

/** Última linha numérica (psql -tAc pode misturar avisos em stderr; stdout costuma ser limpo). */
function parseCountLine(stdout) {
  const lines = (stdout ?? '')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(lines[i])) return lines[i];
  }
  throw new Error(`Resposta inesperada do COUNT: ${JSON.stringify(stdout)}`);
}

function main() {
  const env = loadDotEnv();
  console.log('=== Barbearia SaaS — Migrations (Docker Compose) ===');
  console.log(`Repo   : ${repoRoot}`);
  console.log(`Serviço: postgres (via docker compose exec)`);
  console.log('');

  dockerPsql(env, 'SELECT 1;');

  dockerPsql(
    env,
    `
CREATE TABLE IF NOT EXISTS _migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(migrationsDir, f));

  let applied = 0;
  let skipped = 0;
  let pendingDry = 0;

  for (const file of files) {
    const filename = path.basename(file);
    const count = parseCountLine(
      dockerPsql(
        env,
        `SELECT COUNT(*)::text FROM _migrations WHERE filename = '${filename.replace(/'/g, "''")}';`,
      ),
    );

    if (count === '1') {
      console.log(`  SKIP  ${filename} (já aplicada)`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      pendingDry += 1;
      console.log(`  DRY   ${filename} (pendente)`);
      continue;
    }

    console.log(`  APPLY ${filename} ...`);
    const body = fs.readFileSync(file, 'utf8');
    dockerPsql(env, body);
    dockerPsql(
      env,
      `INSERT INTO _migrations (filename) VALUES ('${filename.replace(/'/g, "''")}') ON CONFLICT DO NOTHING;`,
    );
    applied += 1;
    console.log(`  OK    ${filename}`);
  }

  console.log('');
  if (dryRun) {
    console.log(`Dry-run: ${pendingDry} pendentes (não executadas), ${skipped} já registadas em _migrations.`);
  } else {
    console.log(`Migrations: ${applied} aplicadas, ${skipped} já existentes.`);
  }

  if (withSeed && !dryRun) {
    const seedFile = path.join(repoRoot, 'database', 'seeds', '001_demo.sql');
    if (fs.existsSync(seedFile)) {
      console.log('');
      console.log(`Aplicando seed demo: ${seedFile} ...`);
      try {
        dockerPsql(env, fs.readFileSync(seedFile, 'utf8'));
        console.log('OK  seed demo aplicado.');
      } catch (e) {
        console.warn('AVISO: seed pode ter falhado (dados já existem?).', e?.message ?? e);
      }
    } else {
      console.warn(`AVISO: seed não encontrado: ${seedFile}`);
    }
  }

  console.log('Concluído.');
}

main();
