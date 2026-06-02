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

function readDotEnv(key) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function patch01(j) {
  const filter = snippet('01_whatsapp_router_filter.code.js');
  const route = snippet('01_whatsapp_router_route.code.js');
  const wf02Id = readDotEnv('N8N_WORKFLOW_02_ID') || 'l0zOd4CUKvdFA6HD';
  for (const n of j.nodes) {
    if (n.name === 'Filtrar e Normalizar') {
      n.parameters.jsCode = filter;
      n.parameters.mode = 'runOnceForAllItems';
    }
    if (n.name === 'Registrar Core API + Roteamento') {
      n.parameters.jsCode = route;
      n.parameters.mode = 'runOnceForAllItems';
      n.notes =
        'Classifica resposta do POST Core API (agent/duplicate/error/config). Sem HTTP no Code node — evita falha de rede no sandbox n8n 1.91.';
    }
    if (n.name === 'Filtrar e Normalizar') {
      n.notes =
        'Aceita payload na raiz ou em body (Webhook n8n). Filtra messages.upsert, descarta fromMe e @g.us. Sem tenant no corpo.';
    }
    if (n.name === 'EvolutionInbound') {
      n.webhookId = 'f47ac10b-58cc-4372-a567-0e02b2c3d101';
    }
    if (n.name === 'POST Core API') {
      n.parameters.jsonBody =
        "={{ JSON.stringify({ phone: $json.phone, name: $json.push_name, message: $json.text, external_message_id: $json.provider_message_id, ...($json.content_type ? { message_type: $json.content_type } : {}), ...($json.media_url ? { media_url: $json.media_url } : {}) }) }}";
    }
    if (n.name === 'GET Confirmar dispatch') {
      n.parameters.url =
        "={{ String($env.API_BASE_URL || '').replace(/\\/$/, '') + '/webhooks/whatsapp/agent-dispatch?tenant_id=' + encodeURIComponent($('Registrar Core API + Roteamento').first().json.core_response.tenantId) + '&customer_id=' + encodeURIComponent($('Registrar Core API + Roteamento').first().json.core_response.customerId) + '&dispatch_token=' + encodeURIComponent($('Registrar Core API + Roteamento').first().json.core_response.agentDispatch.dispatch_token) }}";
    }
    if (n.name === 'Wait debounce agente') {
      n.parameters = {
        resume: 'timeInterval',
        amount:
          '={{ Math.max(1, Math.ceil(Number($json.core_response?.agentDispatch?.wait_ms || 2500) / 1000)) }}',
        unit: 'seconds',
      };
      n.notes =
        'Debounce em segundos (wait_ms da API / 1000). n8n Wait 1.1 ignora unit ms.';
    }
    if (n.name === 'Chamar Agente IA') {
      n.typeVersion = 1.2;
      n.parameters = {
        operation: 'call_workflow',
        source: 'database',
        workflowId: {
          __rl: true,
          value: wf02Id,
          mode: 'id',
        },
        mode: 'once',
        options: {
          waitForSubWorkflow: false,
        },
      };
      n.notes =
        'Execute Workflow 02 por ID fixo (typeVersion 1.2 + __rl). typeVersion 1 passava objeto inteiro como id.';
    }
  }
  j.meta = j.meta || {};
  j.meta.description =
    'Inbound Evolution → Core API via HTTP Request node + roteamento Code. Opção B: Execute Workflow 02 quando route=agent. active=false.';
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
