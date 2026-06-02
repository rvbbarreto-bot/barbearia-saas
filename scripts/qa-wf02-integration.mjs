#!/usr/bin/env node
/**
 * Integração WF02 — JWT outbound, catálogo API, execução n8n (mock inbound).
 *
 * Uso:
 *   node scripts/qa-wf02-integration.mjs
 *   node scripts/qa-wf02-integration.mjs --refresh
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const refresh = process.argv.includes('--refresh');

function readDotEnv(key, fallback = null) {
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
  }).trim();
}

function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

async function login() {
  const api = readDotEnv('API_URL', 'http://localhost:3000');
  const email = readDotEnv('CORE_API_LOGIN_EMAIL', 'admin@demo.local');
  const password = readDotEnv('CORE_API_LOGIN_PASSWORD', 'admin12345');
  const tenantId = readDotEnv('CORE_API_TENANT_ID', '00000000-0000-0000-0000-000000000001');
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant_id: tenantId }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status}`);
  const body = await res.json();
  return { token: body.access_token, tenantId };
}

async function main() {
  if (refresh) {
    execSync('node scripts/patch-n8n-workflow-02-flow.mjs --refresh-credentials', {
      cwd: root,
      stdio: 'inherit',
    });
  }

  console.log('==> QA WF02 integração\n');

  const { token, tenantId } = await login();
  const api = readDotEnv('API_URL', 'http://localhost:3000');
  const customerId = readDotEnv(
    'QA_DEFAULT_CUSTOMER_ID',
    '00000000-0000-4000-8000-000000004031',
  );

  const svcRes = await fetch(`${api}/api/v1/services`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
  });
  check('GET /services', svcRes.ok, `HTTP ${svcRes.status}`);

  const proRes = await fetch(`${api}/api/v1/professionals`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
  });
  check('GET /professionals', proRes.ok, `HTTP ${proRes.status}`);

  const outRes = await fetch(`${api}/api/v1/integrations/outbound/whatsapp-text`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: customerId,
      text: 'QA WF02 integration ping',
      correlation_id: `qa-wf02-${Date.now()}`,
      idempotency_key: `qa-wf02-${Date.now()}`,
    }),
  });
  check(
    'POST outbound/whatsapp-text',
    outRes.status === 200 || outRes.status === 202,
    `HTTP ${outRes.status}`,
  );

  const wf02Id = readDotEnv('N8N_WORKFLOW_02_ID', 'l0zOd4CUKvdFA6HD');
  const hasBuild = psql(
    `SELECT count(*) FROM workflow_entity WHERE id='${wf02Id}' AND nodes::text LIKE '%Montar contexto agente%';`,
  );
  check('WF02 nó Montar contexto agente', hasBuild === '1', `count=${hasBuild}`);

  const mockPayload = {
    enrichment: { customer_id: customerId, tenant_id: tenantId },
    normalized: {
      phone: '5511999990001',
      text: 'Quero agendar corte masculino amanha as 10h',
    },
    core_response: { ok: true, customerId: customerId },
  };
  const payloadPath = path.join(root, 'scripts', '.tmp-wf02-exec-payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify(mockPayload));

  try {
    const execOut = execSync(
      `docker exec barbearia-n8n n8n execute --id=${wf02Id} --rawOutput`,
      {
        encoding: 'utf8',
        input: fs.readFileSync(payloadPath),
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const ok = /success|finished/i.test(execOut) && !/error/i.test(execOut.slice(0, 500));
    check('n8n execute WF02', ok, ok ? 'finished' : execOut.slice(0, 200));
  } catch (e) {
    check('n8n execute WF02', false, String(e.message || e).slice(0, 300));
  } finally {
    try {
      fs.unlinkSync(payloadPath);
    } catch (_) {
      /* ignore */
    }
  }

  const lastExec = psql(
    `SELECT status FROM execution_entity WHERE "workflowId"='${wf02Id}' ORDER BY "startedAt" DESC LIMIT 1;`,
  );
  check('Última execução WF02', lastExec === 'success', `status=${lastExec || 'n/a'}`);

  console.log('\n==> Fim — exit', process.exitCode ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
