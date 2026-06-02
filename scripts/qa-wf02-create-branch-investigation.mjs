#!/usr/bin/env node
/**
 * QA Senior — investigação WF02 ramo criar agendamento.
 * Uso: node scripts/qa-wf02-create-branch-investigation.mjs [--exec-id=145]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const execId = process.argv.find((a) => a.startsWith('--exec-id='))?.split('=')[1] ?? '145';

const results = [];

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
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function record(id, name, pass, detail, severity = 'info') {
  results.push({ id, name, pass, detail, severity });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${id} ${name}`);
  console.log(`         ${detail}`);
}

function tomorrowIso() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
  return { token: body.access_token, tenantId, api };
}

async function main() {
  console.log('==> QA WF02 — investigação ramo criar agendamento\n');

  const wf02Id = readDotEnv('N8N_WORKFLOW_02_ID', 'l0zOd4CUKvdFA6HD');
  const proId = '00000000-0000-4000-8000-000000004011';
  const svcId = '00000000-0000-4000-8000-000000004021';
  const pastDate = '2023-10-31';
  const tomorrow = tomorrowIso();

  // CT-01 últimas execuções WF02
  const execRows = psql(`
SELECT id || '|' || status || '|' || "startedAt"
FROM execution_entity
WHERE "workflowId" = '${wf02Id}'
ORDER BY "startedAt" DESC
LIMIT 6;`);
  const lines = execRows.split('\n').filter(Boolean);
  record(
    'CT-01',
    'Histórico execuções WF02',
    lines.length > 0,
    lines.map((l) => l.replace('|', ' ')).join(' ; '),
  );

  const errorCount = lines.filter((l) => l.includes('|error|')).length;
  record(
    'CT-01b',
    'Execuções error recentes',
    true,
    `${errorCount}/${lines.length} com status error (esperado investigar última)`,
    errorCount > 0 ? 'warn' : 'info',
  );

  // CT-02 dump execução alvo
  try {
    execSync(`node scripts/qa-wf02-dump-execution.mjs ${execId}`, { cwd: root, stdio: 'pipe' });
    const dumpPath = path.join(root, '.tmp', `wf02-exec-${execId}.json`);
    const dumpRaw = fs.readFileSync(dumpPath, 'utf8');
    const hasValidation400 = dumpRaw.includes('VALIDATION_ERROR') && dumpRaw.includes('customer_id');
    const hasPastDate = dumpRaw.includes(pastDate);
    const hasEmptySlots =
      dumpRaw.includes('"slots": []') ||
      dumpRaw.includes('slots": []') ||
      (dumpRaw.includes(pastDate) && dumpRaw.includes('criar_agendamento'));
    const lastNode = dumpRaw.match(/"lastNodeExecuted":\s*"([^"]+)"/)?.[1] ?? 'n/a';

    record('CT-02', `Dump exec #${execId}`, true, `lastNode=${lastNode}`);
    record(
      'CT-02a',
      'Erro POST /appointments 400 VALIDATION',
      hasValidation400,
      hasValidation400
        ? 'Body vazio — todos campos undefined'
        : 'Não encontrado no dump',
      hasValidation400 ? 'critical' : 'info',
    );
    record(
      'CT-02b',
      'IA devolveu data passada 2023-10-31',
      hasPastDate,
      hasPastDate ? 'appointment_date incorreta apesar de "amanhã" no histórico' : 'Data passada não encontrada',
      hasPastDate ? 'critical' : 'info',
    );
    record(
      'CT-02c',
      'Availability sem slots',
      hasEmptySlots,
      hasEmptySlots ? 'slots=[] após GET /availability' : 'slots presentes',
    );
  } catch (e) {
    record('CT-02', 'Dump execução', false, String(e.message || e));
  }

  const { token, tenantId, api } = await login();

  // CT-03 availability data passada vs amanhã
  for (const [label, date] of [
    ['passada', pastDate],
    ['amanhã', tomorrow],
  ]) {
    const url = `${api}/api/v1/availability?professional_id=${proId}&service_id=${svcId}&date=${date}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    const body = await res.json().catch(() => ({}));
    const slots = body?.slots ?? body?.data?.slots ?? [];
    const n = Array.isArray(slots) ? slots.length : 0;
    record(
      'CT-03',
      `GET /availability (${label} ${date})`,
      res.ok,
      `HTTP ${res.status} slots=${n}`,
      label === 'passada' && n === 0 ? 'info' : 'info',
    );
  }

  // CT-04 POST appointments body vazio (reproduz n8n)
  const emptyRes = await fetch(`${api}/api/v1/appointments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const emptyBody = await emptyRes.json().catch(() => ({}));
  record(
    'CT-04',
    'POST /appointments {} (repro n8n)',
    emptyRes.status === 400 && emptyBody.error === 'VALIDATION_ERROR',
    `HTTP ${emptyRes.status} error=${emptyBody.error ?? 'n/a'}`,
  );

  // CT-05 IF nodes WF02 — schema Ha slots livres
  const wfNodes = psql(
    `SELECT nodes::text FROM workflow_entity WHERE id='${wf02Id}' LIMIT 1;`,
  );
  const haSlotsLegacy = wfNodes.includes('"Ha slots livres"') && wfNodes.includes('"number":');
  const haSlotsV2 =
    wfNodes.includes('"Ha slots livres"') &&
    wfNodes.includes('"slots-count"') &&
    wfNodes.includes('"operation": "gt"');
  record(
    'CT-05',
    'Nó Ha slots livres IF v2 (gt slots)',
    haSlotsV2,
    haSlotsV2
      ? 'conditions.conditions + number gt OK'
      : haSlotsLegacy
        ? 'LEGADO: conditions.number (IF v1)'
        : 'nó não encontrado',
    haSlotsLegacy && !haSlotsV2 ? 'warn' : 'info',
  );
  const payloadIfModern =
    wfNodes.includes('"Payload agendamento valido?"') &&
    wfNodes.includes('"payload-ends"');
  record(
    'CT-05b',
    'Nó Payload valido? (starts_at + ends_at)',
    payloadIfModern,
    payloadIfModern ? 'gate duplo presente' : 'nó ausente ou legado',
  );

  const wf01Nodes = psql(
    `SELECT nodes::text FROM workflow_entity WHERE name = '01_whatsapp_router_multitenant' LIMIT 1;`,
  );
  const waitDebounceOk =
    wf01Nodes.includes('Wait debounce agente') &&
    wf01Nodes.includes('wait_ms || 2500) / 1000') &&
    wf01Nodes.includes('"unit": "seconds"');
  record(
    'CT-05c',
    'WF01 Wait debounce em segundos',
    waitDebounceOk,
    waitDebounceOk ? 'wait_ms/1000 + unit seconds' : 'config legada ms',
  );

  // CT-06 simulação inbound única (mensagem completa)
  const n8nUrl = (readDotEnv('N8N_PUBLIC_URL') ?? readDotEnv('N8N_WEBHOOK_URL') ?? 'http://localhost:5679')
    .replace(/\/$/, '')
    .replace(':5678', ':5679');
  const instance = readDotEnv('EVOLUTION_INSTANCE', 'Barbearia');
  const phone = `551199${String(Date.now()).slice(-7)}`;
  const msgId = `WAMID_QA_CREATE_${Date.now()}`;
  const text = `Quero agendar corte masculino amanha as 10:30`;
  const payload = {
    event: 'messages.upsert',
    instance,
    data: {
      key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: msgId },
      pushName: 'QA Create Branch',
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
  const whRes = await fetch(`${n8nUrl}/webhook/whatsapp/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  record('CT-06', 'Webhook WF01 mensagem agendamento completa', whRes.ok, `HTTP ${whRes.status} phone=${phone}`);

  console.log('\n  Aguardando WF02 (50s)...');
  await new Promise((r) => setTimeout(r, 50_000));

  const lastExec = psql(`
SELECT id || '|' || status FROM execution_entity
WHERE "workflowId"='${wf02Id}' ORDER BY "startedAt" DESC LIMIT 1;`);
  const [lastId, lastStatus] = lastExec.split('|');
  record(
    'CT-06b',
    'Última exec WF02 pós CT-06',
    lastStatus === 'success',
    `exec=${lastId} status=${lastStatus}`,
    lastStatus === 'error' ? 'warn' : 'info',
  );

  if (lastStatus === 'error' && lastId) {
    try {
      execSync(`node scripts/qa-wf02-dump-execution.mjs ${lastId}`, { cwd: root, stdio: 'pipe' });
      const dump = fs.readFileSync(path.join(root, '.tmp', `wf02-exec-${lastId}.json`), 'utf8');
      const errSnippet = dump.includes('VALIDATION_ERROR')
        ? 'VALIDATION_ERROR (payload vazio)'
        : dump.match(/"message":\s*"([^"]{20,120})"/)?.[1] ?? 'ver .tmp dump';
      record('CT-06c', 'Causa exec CT-06', false, errSnippet, 'critical');
    } catch (_) {
      /* ignore */
    }
  }

  const apptCount = psql(
    `SELECT count(*) FROM appointments WHERE created_at > now() - interval '3 minutes';`,
  );
  record(
    'CT-07',
    'Appointment criado nos últimos 3 min',
    Number(apptCount) >= 1,
    `count=${apptCount}`,
  );

  // Relatório
  const reportDir = path.join(root, 'docs', 'evidencias', 'piloto_staging_08');
  fs.mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(reportDir, `06_qa_wf02_create_branch_${ts}.md`);

  const fails = results.filter((r) => !r.pass);
  const critical = results.filter((r) => r.severity === 'critical' || r.severity === 'warn');

  const md = `# QA WF02 — Ramo criar agendamento

**Data:** ${new Date().toISOString()}  
**Exec investigada:** #${execId}  
**Ambiente:** Docker local

## Resumo executivo

| Métrica | Valor |
|---------|-------|
| Cenários | ${results.length} |
| FAIL | ${fails.length} |
| Alertas | ${critical.length} |

## Cadeia de falha (exec #${execId})

1. **Agente IA** devolve \`appointment_date: ${pastDate}\` (data passada) apesar do histórico pedir "amanhã".
2. **GET /availability** para data passada → \`slots: []\`.
3. **Montar payload agendamento** → \`appointment_payload: null\`.
4. **Gates IF** não impediram \`POST /appointments\` com body \`{}\`.
5. **Core API** → HTTP 400 \`VALIDATION_ERROR\` (todos campos undefined).

## Resultados por cenário

${results.map((r) => `- **[${r.pass ? 'PASS' : 'FAIL'}] ${r.id}** ${r.name}: ${r.detail}`).join('\n')}

## Recomendações (fix)

| Prioridade | Ação |
|------------|------|
| P0 | Normalizer: rejeitar datas passadas; forçar \`tomorrowIsoDate()\` quando sessionText contém "amanhã" |
| P0 | Corrigir IF **Ha slots livres** para typeVersion 2 (\`conditions.conditions\`, não \`number\`) |
| P1 | **Payload agendamento valido?** checar \`appointment_payload?.starts_at\` (não só root) |
| P1 | Prompt IA: incluir data de referência explícita (hoje/amanhã ISO) |
| P2 | \`continueOnFail\` no create + ramo outbox com mensagem amigável quando slots vazios |

## Comandos

\`\`\`powershell
node scripts/qa-wf02-create-branch-investigation.mjs --exec-id=${execId}
node scripts/qa-wf02-dump-execution.mjs ${execId}
\`\`\`
`;

  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`\n==> Relatório: ${reportPath}`);
  console.log(`==> Fim — ${fails.length} FAIL de ${results.length} cenários\n`);

  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
