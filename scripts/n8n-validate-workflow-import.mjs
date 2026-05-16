#!/usr/bin/env node
/**
 * Validação estrutural dos exports n8n (pré-import UI).
 * Não substitui importação na instância n8n; complementa scripts/audit-n8n-workflows.ps1.
 *
 * Fonte canónica para QA: `docs/n8n/*.json` (espelho `n8n/workflows/`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const WORKFLOW_FILES = [
  '01_whatsapp_router_multitenant.json',
  '02_ai_scheduling_agent_multitenant.json',
  '03_QA_Barbearia_Evolution_SendText_Smoke.json',
  '03_recall_30_days_multitenant.json',
];

/** Padrões proibidos em workflows genéricos; excepção explícita no smoke QA SendText. */
const blocked = [
  /n8n-nodes-base\.postgres/i,
  /executeQuery/i,
  /\bSELECT\s+\*\s+FROM/i,
];

/** Proibido em todo JSON (inclui QA, exceto onde anotado). */
const globalForbidden = [
  { re: /evolution\.test/i, msg: 'hostname evolution.test' },
  {
    re: /textMessage\s*:\s*\{/,
    msg: 'Evolution payload legacy textMessage{...} — use number+text na raiz',
  },
  { re: /require\s*\(\s*['"]crypto['"]\s*\)/, msg: "require('crypto') no Code node" },
  { re: /AbortController\b/, msg: 'AbortController (indisponível no sandbox n8n 1.91)' },
  {
    re: /https?:\/\/127\.0\.0\.1:3000\b/,
    msg: '127.0.0.1:3000 no workflow — usar $env.API_BASE_URL (http://api:3000 no container)',
  },
  {
    re: /https?:\/\/localhost:3000\b/,
    msg: 'localhost:3000 no workflow — usar $env.API_BASE_URL',
  },
];

function assertNoBlockedStrings(raw, fileLabel) {
  for (const re of blocked) {
    if (!re.test(raw)) continue;
    throw new Error(`[BLOCKED] ${fileLabel}: pattern ${re}`);
  }
  for (const { re, msg } of globalForbidden) {
    if (!re.test(raw)) continue;
    throw new Error(`[FORBIDDEN] ${fileLabel}: ${msg}`);
  }
}

function walkIfNodes(nodes, file) {
  for (const n of nodes) {
    if (String(n.type || '').includes('if') || n.type === 'n8n-nodes-base.if') {
      const p = JSON.stringify(n.parameters || {});
      if (file.includes('03_') && p.includes('isNotEmpty')) {
        console.warn(`[WARN] ${file}: IF still references isNotEmpty — confirm UI compatibility`);
      }
    }
  }
}

/** Garante ramos TRUE/FALSE do IF com destino (workflow 01 gate). */
function assertIfBranchesConnected(wf, relLabel) {
  const conns = wf.connections || {};
  for (const n of wf.nodes || []) {
    if (String(n.type || '') !== 'n8n-nodes-base.if') continue;
    const main = conns[n.name]?.main;
    if (!Array.isArray(main) || main.length < 2) {
      console.warn(`[WARN] ${relLabel}: IF "${n.name}" sem saídas múltiplas — validar no n8n`);
      continue;
    }
    for (let i = 0; i < 2; i++) {
      const branch = main[i];
      if (!Array.isArray(branch) || branch.length === 0) {
        throw new Error(`${relLabel}: IF "${n.name}" branch ${i} sem conexão (aceite PO reprova)`);
      }
    }
  }
}

function assertNoHardcodedSecrets(raw, fileLabel) {
  const bad = [
    { re: /sk_live_[0-9a-zA-Z]+/i, msg: 'Stripe-like secret' },
    { re: /Bearer\s+eyJ[\w-]+\.[\w-]+\.[\w-]+/i, msg: 'JWT bearer hardcoded' },
    { re: /"[aA]pi[kK]ey"\s*:\s*"[0-9a-f]{20,}"/i, msg: 'apikey literal (use $env)' },
  ];
  for (const { re, msg } of bad) {
    if (re.test(raw)) {
      throw new Error(`[SECRET?] ${fileLabel}: ${msg}`);
    }
  }
}

function placeholderWarnings(raw, relLabel) {
  if (/SUBSTITUIR_PELO_ID_DO_WORKFLOW_02/i.test(raw)) {
    console.warn(
      `[WARN] ${relLabel}: Execute Workflow ainda referencia SUBSTITUIR_PELO_ID — defina N8N_WORKFLOW_02_ID após import.`,
    );
  }
}

function validateFile(fp, relLabel) {
  const raw = fs.readFileSync(fp, 'utf8');
  assertNoBlockedStrings(raw, relLabel);
  assertNoHardcodedSecrets(raw, relLabel);
  const j = JSON.parse(raw);
  if (typeof j.active !== 'boolean') throw new Error(`${relLabel}: missing boolean active`);
  if (j.active !== false) throw new Error(`${relLabel}: active must be false in export`);
  if (!Array.isArray(j.nodes) || j.nodes.length < 1) throw new Error(`${relLabel}: nodes[]`);
  walkIfNodes(j.nodes, relLabel);
  assertIfBranchesConnected(j, relLabel);
  placeholderWarnings(raw, relLabel);
  console.log(`OK ${relLabel} nodes=${j.nodes.length} active=${j.active}`);
}

const dirsToScan = [
  path.join(root, 'docs', 'n8n'),
  path.join(root, 'n8n', 'workflows'),
];

let anyValidated = false;
for (const wfDir of dirsToScan) {
  if (!fs.existsSync(wfDir)) {
    console.warn(`[SKIP] missing dir: ${path.relative(root, wfDir)}`);
    continue;
  }
  const present = WORKFLOW_FILES.filter((f) => fs.existsSync(path.join(wfDir, f)));
  if (present.length === 0) continue;
  console.log(`--- ${path.relative(root, wfDir)} ---`);
  for (const f of WORKFLOW_FILES) {
    const fp = path.join(wfDir, f);
    if (!fs.existsSync(fp)) {
      console.warn(`[WARN] missing ${path.relative(root, fp)}`);
      continue;
    }
    validateFile(fp, `${path.relative(root, wfDir)}/${f}`);
    anyValidated = true;
  }
}

if (!anyValidated) {
  console.error('ERROR: no workflow JSON validated. Expected docs/n8n/ or n8n/workflows/ with PILOTO-STAGING-03 files.');
  process.exit(1);
}

console.log('n8n JSON structural validation passed.');
