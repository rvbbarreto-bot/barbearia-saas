#!/usr/bin/env node
/**
 * Importa os 4 workflows piloto a partir de `docs/n8n/` (fonte canónica QA).
 * Fallback: `n8n/workflows/` quando o espelho em docs não existir.
 *
 * Uso (PowerShell):
 *   $env:N8N_API_KEY = "<chave em n8n → Settings → n8n API>"
 *   $env:N8N_URL = "http://localhost:5679"   # opcional (Compose expõe 5679)
 *   node n8n/import_workflows_from_json.mjs
 *
 * Ou: .\scripts\n8n-import-piloto-workflows.ps1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const N8N_URL = (process.env.N8N_URL || 'http://localhost:5679').replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY || '';

/** Alinhado a `scripts/n8n-validate-workflow-import.mjs` e card PS-08.5. */
const FILES = [
  '01_whatsapp_router_multitenant.json',
  '02_ai_scheduling_agent_multitenant.json',
  '03_QA_Barbearia_Evolution_SendText_Smoke.json',
  '03_recall_30_days_multitenant.json',
];

function resolveWorkflowPath(name) {
  const docsPath = path.join(ROOT, 'docs', 'n8n', name);
  if (fs.existsSync(docsPath)) return docsPath;
  const wfPath = path.join(ROOT, 'n8n', 'workflows', name);
  if (fs.existsSync(wfPath)) return wfPath;
  return null;
}

function sanitizeWorkflow(obj) {
  const o = { ...obj };
  delete o.id;
  delete o.versionId;
  delete o.updatedAt;
  delete o.createdAt;
  delete o.pinData;
  o.active = false;
  return o;
}

async function listWorkflowsByName(headers) {
  const res = await fetch(`${N8N_URL}/api/v1/workflows?limit=250`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`list workflows HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = await res.json();
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const byName = new Map();
  for (const row of rows) {
    if (row?.name && row?.id) byName.set(row.name, row.id);
  }
  return byName;
}

async function upsertWorkflow(headers, workflowsByName, workflow, fileLabel) {
  const bodyObj = sanitizeWorkflow(workflow);
  const body = JSON.stringify(bodyObj);
  const existingId = workflowsByName.get(bodyObj.name);

  const url = existingId
    ? `${N8N_URL}/api/v1/workflows/${existingId}`
    : `${N8N_URL}/api/v1/workflows`;
  const method = existingId ? 'PUT' : 'POST';

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${fileLabel} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${fileLabel}: resposta não-JSON: ${text.slice(0, 200)}`);
  }
  const id = j.id ?? existingId;
  const action = existingId ? 'UPDATE' : 'CREATE';
  console.log(`[import] ${action}  ${bodyObj.name ?? fileLabel}  →  id=${id}  active=false`);
  if (bodyObj.name && id) workflowsByName.set(bodyObj.name, id);
  return id;
}

async function main() {
  if (!N8N_API_KEY) {
    console.error('[import] Falta N8N_API_KEY. Crie em: n8n UI → Settings → n8n API.');
    process.exit(2);
  }

  const headers = {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json',
  };

  const workflowsByName = await listWorkflowsByName(headers);

  let ok = 0;
  for (const name of FILES) {
    const fp = resolveWorkflowPath(name);
    if (!fp) {
      console.error(`[import] arquivo não encontrado: ${name} (docs/n8n ou n8n/workflows)`);
      process.exit(1);
    }
    const raw = fs.readFileSync(fp, 'utf8');
    let workflow;
    try {
      workflow = JSON.parse(raw);
    } catch (e) {
      console.error(`[import] JSON inválido: ${name}`, e.message);
      process.exit(1);
    }
    try {
      await upsertWorkflow(headers, workflowsByName, workflow, name);
      ok += 1;
    } catch (err) {
      console.error(`[import] FAIL ${name}:`, err.message);
    }
  }

  if (ok !== FILES.length) {
    console.error(`[import] Concluído com falhas: ${ok}/${FILES.length} OK.`);
    process.exit(1);
  }
  console.log(`[import] Concluído: ${ok}/${FILES.length} workflows (todos inactive).`);
}

await main();
