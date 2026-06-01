#!/usr/bin/env node
/**
 * Sincroniza workflow 01 (router) do JSON versionado → workflow_entity (n8n DB).
 * Uso: node scripts/sync-n8n-workflow-01.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readDotEnv(key) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const pgUser = readDotEnv('POSTGRES_USER') || 'barbearia_test';
const pgDb = readDotEnv('POSTGRES_DB') || 'barbearia_saas';

const wfPath = path.join(root, 'n8n', 'workflows', '01_whatsapp_router_multitenant.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

const patch = {
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings ?? {},
};

const tmpDir = path.join(root, '.tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const patchPath = path.join(tmpDir, 'wf01-patch.json');
fs.writeFileSync(patchPath, JSON.stringify(patch), 'utf8');

const sqlPath = path.join(tmpDir, 'wf01-update.sql');
const patchJson = JSON.stringify(patch).replace(/'/g, "''");
const sql = `
UPDATE workflow_entity
SET nodes = '${JSON.stringify(patch.nodes).replace(/'/g, "''")}'::json,
    connections = '${JSON.stringify(patch.connections).replace(/'/g, "''")}'::json,
    settings = '${JSON.stringify(patch.settings).replace(/'/g, "''")}'::json,
    "updatedAt" = NOW()
WHERE name = '01_whatsapp_router_multitenant';

SELECT name,
  CASE WHEN nodes::text LIKE '%CORE_WEBHOOK_TOKEN%' THEN 'CORE_OK' ELSE 'CORE_MISSING' END AS token_check,
  CASE WHEN nodes::text LIKE '%httpRequestWithTimeout%' THEN 'HTTP_OK' ELSE 'HTTP_MISSING' END AS http_check,
  active
FROM workflow_entity WHERE name = '01_whatsapp_router_multitenant';
`;
fs.writeFileSync(sqlPath, sql, 'utf8');

console.log('[sync] Aplicando workflow 01 no PostgreSQL n8n...');
const out = execSync(
  `docker exec -i barbearia-postgres psql -U ${pgUser} -d ${pgDb} -v ON_ERROR_STOP=1`,
  { input: sql, encoding: 'utf8', cwd: root },
);
console.log(out);

console.log('[sync] Reiniciando barbearia-n8n...');
execSync('docker compose restart n8n', { cwd: root, stdio: 'inherit' });
console.log('[sync] Concluido.');
