#!/usr/bin/env node
/**
 * Cria credencial httpHeaderAuth (Bearer JWT Core API) no n8n e liga ao workflow 02.
 * Idempotente — safe re-run (refresh JWT).
 *
 * Uso (host, stack Docker a correr):
 *   node scripts/setup-n8n-workflow-02-core-credential.mjs
 *
 * Variáveis (.env ou ambiente):
 *   N8N_ENCRYPTION_KEY (ou lida do container barbearia-n8n)
 *   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
 *   CORE_API_LOGIN_EMAIL, CORE_API_LOGIN_PASSWORD, CORE_API_TENANT_ID
 *   API_URL (default http://localhost:3000)
 *   N8N_WORKFLOW_02_ID (default l0zOd4CUKvdFA6HD)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const CRED_ID = 'barbearia-core-api-jwt-001';
const CRED_NAME = 'Barbearia Core API - Bearer JWT';
const HTTP_NODE_NAMES = new Set([
  'Catalogo servicos Core API',
  'Catalogo profissionais Core API',
  'Contexto agenda Core API',
  'GET disponibilidade Core API',
  'Criar agendamento Core API',
  'Enfileirar resposta WhatsApp outbox',
]);

function readDotEnv(key, fallback = null) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return process.env[key] ?? fallback;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env[key] ?? fallback;
}

function dockerEnv(container, key) {
  try {
    return execSync(`docker exec ${container} printenv ${key}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function psql(sql) {
  const user = readDotEnv('POSTGRES_USER', 'barbearia_test');
  const db = readDotEnv('POSTGRES_DB', 'barbearia_saas');
  return execSync(`docker exec -i barbearia-postgres psql -U ${user} -d ${db} -v ON_ERROR_STOP=1 -t -A`, {
    input: sql,
    encoding: 'utf8',
  }).trim();
}

const RANDOM_BYTES = Buffer.from('53616c7465645f5f', 'hex');

function getKeyAndIv(salt, encryptionKey) {
  const password = Buffer.concat([Buffer.from(encryptionKey, 'binary'), salt]);
  const hash1 = createHash('md5').update(password).digest();
  const hash2 = createHash('md5').update(Buffer.concat([hash1, password])).digest();
  const iv = createHash('md5').update(Buffer.concat([hash2, password])).digest();
  const key = Buffer.concat([hash1, hash2]);
  return [key, iv];
}

/** Compatível com n8n-core Cipher (OpenSSL Salted__ + MD5 KDF). */
function encryptN8n(data, encryptionKey) {
  const salt = randomBytes(8);
  const [key, iv] = getKeyAndIv(salt, encryptionKey);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([RANDOM_BYTES, salt, encrypted]).toString('base64');
}

function decryptN8n(data, encryptionKey) {
  const input = Buffer.from(data, 'base64');
  const salt = input.subarray(8, 16);
  const [key, iv] = getKeyAndIv(salt, encryptionKey);
  const contents = input.subarray(16);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(contents), decipher.final()]).toString('utf8');
}

function patchHttpNode(node) {
  if (!HTTP_NODE_NAMES.has(node.name)) return node;
  node.credentials = node.credentials || {};
  node.credentials.httpHeaderAuth = { id: CRED_ID, name: CRED_NAME };
  node.parameters = node.parameters || {};
  node.parameters.authentication = 'genericCredentialType';
  node.parameters.genericAuthType = 'httpHeaderAuth';
  if (
    node.name === 'Contexto agenda Core API' ||
    node.name === 'Catalogo servicos Core API' ||
    node.name === 'Catalogo profissionais Core API'
  ) {
    node.continueOnFail = true;
  }
  node.parameters.sendHeaders = true;
  node.parameters.headerParameters = {
    parameters: [
      {
        name: 'x-tenant-id',
        value: "={{ String($env.CORE_API_TENANT_ID || '00000000-0000-0000-0000-000000000001').trim() }}",
      },
    ],
  };
  return node;
}

function patchWorkflowJson(obj) {
  obj.meta = obj.meta || {};
  obj.meta.templateCredsSetupCompleted = true;
  obj.nodes = (obj.nodes || []).map(patchHttpNode);
  return obj;
}

async function fetchJwt() {
  const apiUrl = (readDotEnv('API_URL') || 'http://localhost:3000').replace(/\/$/, '');
  const email = readDotEnv('CORE_API_LOGIN_EMAIL', 'admin@demo.local');
  const password = readDotEnv('CORE_API_LOGIN_PASSWORD', 'admin12345');
  const tenantId = readDotEnv(
    'CORE_API_TENANT_ID',
    '00000000-0000-0000-0000-000000000001',
  );

  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant_id: tenantId }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login Core API falhou HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.access_token) throw new Error('Login OK mas access_token ausente');
  return { jwt: body.access_token, tenantId, email };
}

function upsertCredential(jwt) {
  const encKey =
    readDotEnv('N8N_ENCRYPTION_KEY') || dockerEnv('barbearia-n8n', 'N8N_ENCRYPTION_KEY');
  if (!encKey) throw new Error('N8N_ENCRYPTION_KEY ausente (.env ou container n8n)');

  const credData = JSON.stringify({
    name: 'Authorization',
    value: `Bearer ${jwt}`,
  });
  const encrypted = encryptN8n(credData, encKey).replace(/'/g, "''");
  const now = new Date().toISOString();

  psql(`
DELETE FROM shared_credentials WHERE "credentialsId" = '${CRED_ID}';
DELETE FROM credentials_entity WHERE id = '${CRED_ID}';
INSERT INTO credentials_entity (id, name, type, data, "createdAt", "updatedAt", "isManaged")
VALUES (
  '${CRED_ID}',
  '${CRED_NAME}',
  'httpHeaderAuth',
  '${encrypted}',
  '${now}',
  '${now}',
  false
);
INSERT INTO shared_credentials ("credentialsId", "projectId", role, "createdAt", "updatedAt")
SELECT '${CRED_ID}', p.id, 'credential:owner', '${now}', '${now}'
FROM project p
JOIN project_relation pr ON pr."projectId" = p.id
WHERE p.type = 'personal'
LIMIT 1;
`);
}

function patchWorkflowInDb(wf02Id) {
  const raw = psql(`SELECT nodes::text FROM workflow_entity WHERE id = '${wf02Id}';`);
  if (!raw) throw new Error(`Workflow 02 nao encontrado: ${wf02Id}`);
  const nodes = JSON.parse(raw).map(patchHttpNode);
  const nodesJson = JSON.stringify(nodes).replace(/'/g, "''");
  psql(`
UPDATE workflow_entity
SET nodes = '${nodesJson}'::json,
    "updatedAt" = now()
WHERE id = '${wf02Id}';
`);
}

function patchJsonExports() {
  for (const rel of ['n8n/workflows/02_ai_scheduling_agent_multitenant.json', 'docs/n8n/02_ai_scheduling_agent_multitenant.json']) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const j = patchWorkflowJson(JSON.parse(fs.readFileSync(fp, 'utf8')));
    fs.writeFileSync(fp, `${JSON.stringify(j, null, 2)}\n`, 'utf8');
    console.log('[patch] JSON', rel);
  }
}

async function main() {
  const wf02Id = readDotEnv('N8N_WORKFLOW_02_ID', 'l0zOd4CUKvdFA6HD');
  console.log('[setup] Login Core API...');
  const { jwt, tenantId, email } = await fetchJwt();
  console.log(`[setup] JWT OK (tenant=${tenantId}, user=${email}, len=${jwt.length})`);

  console.log('[setup] Credencial n8n httpHeaderAuth...');
  upsertCredential(jwt);

  console.log(`[setup] Workflow 02 (${wf02Id}) — ligar credencial + x-tenant-id...`);
  patchWorkflowInDb(wf02Id);
  patchJsonExports();

  const credCount = psql(`SELECT count(*) FROM credentials_entity WHERE id = '${CRED_ID}';`);
  const encKeyVerify =
    readDotEnv('N8N_ENCRYPTION_KEY') || dockerEnv('barbearia-n8n', 'N8N_ENCRYPTION_KEY');
  const stored = psql(`SELECT data FROM credentials_entity WHERE id = '${CRED_ID}';`);
  let decryptOk = false;
  try {
    const plain = JSON.parse(decryptN8n(stored, encKeyVerify));
    decryptOk = plain.name === 'Authorization' && String(plain.value).startsWith('Bearer ');
  } catch {
    decryptOk = false;
  }
  const linked = psql(`
SELECT count(*) FROM workflow_entity w, json_array_elements(w.nodes) n
WHERE w.id = '${wf02Id}'
  AND n->>'type' = 'n8n-nodes-base.httpRequest'
  AND n->'credentials'->'httpHeaderAuth'->>'id' = '${CRED_ID}';
`);
  console.log(`[setup] credentials_entity=${credCount}, decrypt_verify=${decryptOk}, http_nodes_linked=${linked}`);
  console.log(`[setup] CRED_ID=${CRED_ID}`);
  console.log('[setup] Concluido. Reinicie n8n se credencial nao aparecer: docker compose restart n8n');
  console.log('[setup] JWT expira conforme JWT_EXPIRES_IN — re-execute este script para refresh.');
}

main().catch((err) => {
  console.error('[setup] ERRO:', err.message);
  process.exit(1);
});
