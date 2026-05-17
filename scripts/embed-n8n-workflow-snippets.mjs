/**
 * Incorpora snippets .code.js nos exports n8n (docs/n8n + n8n/workflows).
 * Executar: node scripts/embed-n8n-workflow-snippets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const snippet = (name) =>
  fs.readFileSync(path.join(root, 'scripts', 'n8n-snippets', name), 'utf8');

function patch01(j) {
  const filter = snippet('01_whatsapp_router_filter.code.js');
  const register = snippet('01_whatsapp_router_register.code.js');
  for (const n of j.nodes) {
    if (n.name === 'Filtrar e Normalizar') n.parameters.jsCode = filter;
    if (n.name === 'Registrar Core API + Roteamento') {
      n.parameters.jsCode = register;
      n.notes =
        'POST Core API sem modulo crypto embutido. x-webhook-token + x-webhook-instance + x-correlation-id. ' +
        'Timeout via Promise (API_TIMEOUT_MS). Se N8N_HMAC_SECRET estiver definido, retorna config_error — use tenant com token ou proxy HMAC.';
    }
    if (n.name === 'Filtrar e Normalizar') {
      n.notes =
        'Aceita payload na raiz ou em body (Webhook n8n). Filtra messages.upsert, descarta fromMe e @g.us. Sem tenant no corpo.';
    }
    if (n.name === 'Chamar Agente IA') {
      n.parameters.workflowId = {
        __rl: true,
        value:
          "={{ String($env.N8N_WORKFLOW_02_ID || '').trim() || 'SUBSTITUIR_PELO_ID_DO_WORKFLOW_02' }}",
        mode: 'id',
      };
      n.notes =
        'Opção B: definir N8N_WORKFLOW_02_ID no container n8n após import, ou substituir placeholder no editor. Segundo workflow deve estar importado.';
    }
  }
  j.meta = j.meta || {};
  j.meta.description =
    'Inbound Evolution → Core API. Code node compatível com sandbox n8n 1.91 (sem crypto embutido). Opção B: Execute Workflow 02 quando route=agent. active=false.';
  return j;
}

function patch03qa(j) {
  const classify = snippet('03_qa_evolution_classify.code.js');
  for (const n of j.nodes) {
    if (n.name === 'Classificar sucesso ou erro') n.parameters.jsCode = classify;
  }
  return j;
}

function patch03recall(j) {
  const gateCode = snippet('03_recall_schedule_po_gate.code.js');
  const hasGate = j.nodes.some((n) => n.name === 'PO gate agenda');
  if (!hasGate) {
    const schedule = j.nodes.find((n) => n.name === 'A cada 6 horas');
    const y = schedule ? schedule.position[1] : 0;
    j.nodes.push({
      parameters: { jsCode: gateCode },
      id: 'recall-po-gate',
      name: 'PO gate agenda',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [140, y],
      notes:
        'Bloqueia Schedule se N8N_RECALL_ALLOW_SCHEDULE!=true. Execução manual ($execution.mode manual/cli) sempre passa.',
    });
  } else {
    const g = j.nodes.find((n) => n.name === 'PO gate agenda');
    g.parameters.jsCode = gateCode;
  }

  const c = j.connections || {};
  const gateName = 'PO gate agenda';
  const sch = 'A cada 6 horas';
  const getNode = 'GET candidatos Core API';
  const curTarget = c[sch]?.main?.[0]?.[0]?.node;
  if (curTarget === getNode) {
    c[sch].main[0] = [{ node: gateName, type: 'main', index: 0 }];
    c[gateName] ??= {};
    c[gateName].main = [[{ node: getNode, type: 'main', index: 0 }]];
  } else if (curTarget === gateName) {
    c[gateName] ??= {};
    c[gateName].main = [[{ node: getNode, type: 'main', index: 0 }]];
  }
  j.connections = c;

  const metaDesc = [
    String(j.meta?.description || ''),
    'Safety: Schedule exige N8N_RECALL_ALLOW_SCHEDULE=true; manual ignora.',
    'active=false. Evolution não é chamado aqui.',
  ].filter(Boolean).join(' ');
  j.meta = j.meta || {};
  j.meta.description = metaDesc;
  return j;
}

function writeJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const workflows = ['01_whatsapp_router_multitenant.json', '03_QA_Barbearia_Evolution_SendText_Smoke.json', '03_recall_30_days_multitenant.json'];

for (const dirrel of ['docs/n8n', 'n8n/workflows']) {
  const dir = path.join(root, ...dirrel.split('/'));
  for (const f of workflows) {
    const fp = path.join(dir, f);
    if (!fs.existsSync(fp)) continue;
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (f.startsWith('01_')) patch01(j);
    else if (f.includes('QA_Barbearia_Evolution')) patch03qa(j);
    else if (f.startsWith('03_recall')) patch03recall(j);
    writeJson(fp, j);
    console.log('patched', path.relative(root, fp));
  }
}

console.log('done');
