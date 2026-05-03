#!/usr/bin/env node
/**
 * Importa workflows a partir dos JSON versionados em n8n/workflows/.
 *
 * Uso (PowerShell):
 *   $env:N8N_API_KEY = "<chave criada em n8n: Settings → n8n API>"
 *   $env:N8N_URL = "http://localhost:5678"   # opcional
 *   node n8n/import_workflows_from_json.mjs
 *
 * Requisitos: n8n com API habilitada e chave válida (401 sem chave).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const N8N_URL = (process.env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY || '';

const FILES = [
  '01_whatsapp_router_multitenant.json',
  '02_ai_scheduling_agent_multitenant.json',
  '03_recall_30_days_multitenant.json',
];

function sanitizeWorkflow(obj) {
  const o = { ...obj };
  delete o.id;
  delete o.versionId;
  delete o.updatedAt;
  delete o.createdAt;
  delete o.pinData;
  // Metadados de export podem causar warnings; preservamos tags/active/settings.
  return o;
}

async function main() {
  if (!N8N_API_KEY) {
    console.error('[import] Falta N8N_API_KEY no ambiente. Crie uma chave em: n8n → Settings → n8n API.');
    process.exit(2);
  }

  const url = `${N8N_URL}/api/v1/workflows`;
  const headers = {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json',
  };

  for (const name of FILES) {
    const fp = path.join(ROOT, 'n8n', 'workflows', name);
    if (!fs.existsSync(fp)) {
      console.error(`[import] arquivo não encontrado: ${fp}`);
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
    const body = JSON.stringify(sanitizeWorkflow(workflow));

    const res = await fetch(url, { method: 'POST', headers, body });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[import] FAIL ${name} HTTP ${res.status}: ${text.slice(0, 500)}`);
      continue;
    }
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      console.error(`[import] resposta não-JSON (${name}): ${text.slice(0, 200)}`);
      continue;
    }
    console.log(`[import] OK  ${workflow.name ?? name}  →  id=${j.id}`);
  }
  console.log('[import] Concluído.');
}

await main();
