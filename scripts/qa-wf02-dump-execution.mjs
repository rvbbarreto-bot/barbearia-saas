#!/usr/bin/env node
/**
 * Extrai nós com erro de uma execução n8n (execution_data.data comprimido).
 * Uso: node scripts/qa-wf02-dump-execution.mjs 145
 */
import { execSync } from 'node:child_process';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const execId = process.argv[2] || '145';

function readDotEnv(key, fallback) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return process.env[key] ?? fallback;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env[key] ?? fallback;
}

function psql(sql) {
  const user = readDotEnv('POSTGRES_USER', 'barbearia_test');
  const db = readDotEnv('POSTGRES_DB', 'barbearia_saas');
  return execSync(`docker exec -i barbearia-postgres psql -U ${user} -d ${db} -t -A`, {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
}

const raw = psql(`SELECT data FROM execution_data WHERE "executionId" = ${Number(execId)};`);
if (!raw) {
  console.error('Sem execution_data para', execId);
  process.exit(1);
}

function tryParse(buf) {
  const attempts = [
    () => JSON.parse(buf.toString('utf8')),
    () => JSON.parse(zlib.gunzipSync(buf).toString('utf8')),
    () => JSON.parse(zlib.inflateSync(buf).toString('utf8')),
    () => JSON.parse(zlib.brotliDecompressSync(buf).toString('utf8')),
  ];
  for (const fn of attempts) {
    try {
      return fn();
    } catch (_) {
      /* next */
    }
  }
  return null;
}

// psql -t -A may return base64 or hex; n8n often stores as string in text column
let parsed = null;
if (raw.startsWith('\\x')) {
  const hex = raw.slice(2);
  parsed = tryParse(Buffer.from(hex, 'hex'));
} else {
  parsed = tryParse(Buffer.from(raw, 'utf8'));
  if (!parsed) parsed = tryParse(Buffer.from(raw, 'base64'));
}

if (!parsed) {
  console.log('Raw prefix:', raw.slice(0, 120));
  console.error('Falha ao parsear execution_data');
  process.exit(1);
}

const outPath = path.join(root, '.tmp', `wf02-exec-${execId}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
console.log('Saved', outPath);

function walkNodes(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkNodes(v, `${path}[${i}]`));
    return;
  }
  if (obj.error && (obj.error.message || obj.error.description)) {
    console.log('\n--- ERROR ---');
    console.log('path:', path);
    console.log('message:', obj.error.message || obj.error.description);
    if (obj.error.httpCode) console.log('httpCode:', obj.error.httpCode);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'error') continue;
    walkNodes(v, path ? `${path}.${k}` : k);
  }
}

walkNodes(parsed);

// n8n structure: resultData.runData has node names
const runData = parsed?.resultData?.runData ?? parsed?.data?.resultData?.runData;
if (runData) {
  console.log('\n==> Nodes executados:');
  for (const [name, runs] of Object.entries(runData)) {
    const last = Array.isArray(runs) ? runs[runs.length - 1] : runs;
    const err = last?.error ?? last?.data?.error;
    const status = err ? 'ERROR' : 'OK';
    console.log(`  [${status}] ${name}`);
    if (err) {
      console.log('       ', err.message || JSON.stringify(err).slice(0, 200));
    }
  }
}
