#!/usr/bin/env node
/**
 * Validação estrutural dos exports n8n (pré-import UI).
 * Não substitui importação na instância n8n; complementa scripts/audit-n8n-workflows.ps1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const wfDir = path.join(root, 'n8n', 'workflows');

const blocked = [
  /n8n-nodes-base\.postgres/i,
  /executeQuery/i,
  /message\/sendText/i,
  /\bsendText\b/i,
  /SELECT\s+\*\s+FROM/i,
];

function assertNoBlockedStrings(raw, name) {
  for (const re of blocked) {
    if (re.test(raw)) throw new Error(`[BLOCKED] ${name}: pattern ${re}`);
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

const files = ['01_whatsapp_router_multitenant.json', '02_ai_scheduling_agent_multitenant.json', '03_recall_30_days_multitenant.json'];

for (const f of files) {
  const fp = path.join(wfDir, f);
  const raw = fs.readFileSync(fp, 'utf8');
  assertNoBlockedStrings(raw, f);
  const j = JSON.parse(raw);
  if (typeof j.active !== 'boolean') throw new Error(`${f}: missing boolean active`);
  if (j.active !== false) throw new Error(`${f}: active must be false in export`);
  if (!Array.isArray(j.nodes) || j.nodes.length < 1) throw new Error(`${f}: nodes[]`);
  walkIfNodes(j.nodes, f);
  console.log(`OK ${f} nodes=${j.nodes.length} active=${j.active}`);
}

console.log('n8n JSON structural validation passed.');
