#!/usr/bin/env node
/**
 * Validação estrutural dos exports n8n (pré-import UI).
 * Não substitui importação na instância n8n; complementa scripts/audit-n8n-workflows.ps1.
 *
 * Fonte canónica para QA (PILOTO-STAGING-03): `docs/n8n/*.json` (espelho controlado junto ao guia).
 * Mantém validação de `n8n/workflows` quando existirem os mesmos ficheiros (sincronização).
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
  /message\/sendText/i,
  /\bsendText\b/i,
  /SELECT\s+\*\s+FROM/i,
];

function assertNoBlockedStrings(raw, fileLabel) {
  const isQaEvolutionSendTextSmoke = fileLabel.includes('03_QA_Barbearia_Evolution_SendText_Smoke');
  for (const re of blocked) {
    if (!re.test(raw)) continue;
    if (isQaEvolutionSendTextSmoke && /sendText/i.test(String(re))) {
      continue;
    }
    throw new Error(`[BLOCKED] ${fileLabel}: pattern ${re}`);
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

function validateFile(fp, relLabel) {
  const raw = fs.readFileSync(fp, 'utf8');
  assertNoBlockedStrings(raw, relLabel);
  assertNoHardcodedSecrets(raw, relLabel);
  const j = JSON.parse(raw);
  if (typeof j.active !== 'boolean') throw new Error(`${relLabel}: missing boolean active`);
  if (j.active !== false) throw new Error(`${relLabel}: active must be false in export`);
  if (!Array.isArray(j.nodes) || j.nodes.length < 1) throw new Error(`${relLabel}: nodes[]`);
  walkIfNodes(j.nodes, relLabel);
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
