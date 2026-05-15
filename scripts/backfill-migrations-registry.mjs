#!/usr/bin/env node
/**
 * Regista em `_migrations` um prefixo ordenado de `database/migrations/*.sql` **sem**
 * executar o SQL. Use quando o Postgres foi inicializado por `docker-entrypoint-initdb.d`
 * (schema já aplicado) mas `_migrations` está vazia ou desactualizada.
 *
 * O operador deve passar o **último** ficheiro que já está efectivamente aplicado no volume
 * (ordem lexicográfica igual a `migrate.sh`). Depois: `npm run db:migrate` aplica só o que falta.
 *
 * Uso:
 *   npm run db:migrate:backfill -- --through 102_qa_customer_uuid_fix.sql
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'database', 'migrations');

function loadDotEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Ficheiro .env não encontrado em ${envPath}.`);
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

function parseThroughArg() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--through');
  if (i === -1 || !argv[i + 1]) {
    console.error('Uso: npm run db:migrate:backfill -- --through <nome-ficheiro.sql>');
    console.error('Ex.: --through 102_qa_customer_uuid_fix.sql');
    process.exit(1);
  }
  return argv[i + 1].trim();
}

function main() {
  const through = parseThroughArg();
  const env = loadDotEnv();

  const sorted = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (!sorted.includes(through)) {
    throw new Error(`Ficheiro não encontrado em database/migrations: ${through}`);
  }

  console.log('=== Backfill _migrations (sem executar SQL) ===');
  console.log(`Até (inclusive): ${through}`);
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

  let n = 0;
  for (const filename of sorted) {
    if (filename > through) break;
    const esc = filename.replace(/'/g, "''");
    dockerPsql(
      env,
      `INSERT INTO _migrations (filename) VALUES ('${esc}') ON CONFLICT (filename) DO NOTHING;`,
    );
    console.log(`  REG  ${filename}`);
    n += 1;
  }

  console.log('');
  console.log(`Registados ${n} ficheiros (ordem lexicográfica até ${through}).`);
  console.log('Seguinte passo: npm run db:migrate');
}

main();
