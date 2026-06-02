#!/usr/bin/env node

/**

 * Aplica snippets de fluxo pós-IA (prepare → catalog → normalize → route → outbound) no WF02.

 * Sincroniza nodes + connections para PostgreSQL.

 *

 * Uso:

 *   node scripts/patch-n8n-workflow-02-flow.mjs

 *   node scripts/patch-n8n-workflow-02-flow.mjs --refresh-credentials

 */

import fs from 'node:fs';

import path from 'node:path';

import { execSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '..');

const WF02_ID = process.env.N8N_WORKFLOW_02_ID || 'l0zOd4CUKvdFA6HD';

const refreshCreds = process.argv.includes('--refresh-credentials');



const TENANT_HDR =

  "={{ String($env.CORE_API_TENANT_ID || '00000000-0000-0000-0000-000000000001').trim() }}";

const CRED = {

  httpHeaderAuth: { id: 'barbearia-core-api-jwt-001', name: 'Barbearia Core API - Bearer JWT' },

};



function snippet(name) {

  return fs.readFileSync(path.join(root, 'scripts/n8n-snippets', name), 'utf8');

}



function loadWf() {

  return JSON.parse(

    fs.readFileSync(path.join(root, 'n8n/workflows/02_ai_scheduling_agent_multitenant.json'), 'utf8'),

  );

}



function codeNode(id, name, position, jsCode, notes) {

  return {

    parameters: { mode: 'runOnceForAllItems', jsCode },

    id,

    name,

    type: 'n8n-nodes-base.code',

    typeVersion: 2,

    position,

    ...(notes ? { notes } : {}),

  };

}



function httpGetNode(id, name, urlPath, position, { optional = false, notes } = {}) {

  const node = {

    parameters: {

      url: `={{$env.API_BASE_URL}}${urlPath}`,

      authentication: 'genericCredentialType',

      genericAuthType: 'httpHeaderAuth',

      sendHeaders: true,

      headerParameters: {

        parameters: [{ name: 'x-tenant-id', value: TENANT_HDR }],

      },

      options: {},

    },

    id,

    name,

    type: 'n8n-nodes-base.httpRequest',

    typeVersion: 4,

    position,

    credentials: CRED,

    ...(notes ? { notes } : {}),

  };

  if (optional) node.continueOnFail = true;

  return node;

}



function dedupeNodes(nodes) {

  const seen = new Set();

  return nodes.filter((n) => {

    if (seen.has(n.name)) return false;

    seen.add(n.name);

    return true;

  });

}



function patchWf(wf) {

  const prep = snippet('02_ai_prepare_inbound.code.js');

  const buildCtx = snippet('02_ai_build_agent_context.code.js');

  const mergeAvail = snippet('02_ai_merge_route_availability.code.js');

  const buildAppt = snippet('02_ai_build_appointment_payload.code.js');

  const norm = snippet('02_ai_agent_normalize.code.js');

  const route = snippet('02_ai_route_flow.code.js');



  const keepTypes = new Set([

    'n8n-nodes-base.executeWorkflowTrigger',

    'n8n-nodes-base.httpRequest',

    '@n8n/n8n-nodes-langchain.agent',

    '@n8n/n8n-nodes-langchain.lmChatOpenAi',

    'n8n-nodes-base.if',

  ]);



  const removeNames = new Set(['Intencao criar']);



  wf.nodes = dedupeNodes(

    wf.nodes.filter(

      (n) =>

        !removeNames.has(n.name) &&

        (keepTypes.has(n.type) ||

          (n.type === 'n8n-nodes-base.code' && n.name === 'Normalizar saida IA')),

    ),

  );



  const byName = (name) => wf.nodes.find((n) => n.name === name);



  wf.nodes.push(

    codeNode(

      'prep-inbound',

      'Preparar contexto inbound',

      [110, 0],

      prep,

      'Propaga enrichment/normalized do workflow 01.',

    ),

    httpGetNode(

      'get-services',

      'Catalogo servicos Core API',

      '/api/v1/services',

      [220, -80],

      {

        optional: true,

        notes: 'Catálogo para o agente mapear service_id (continueOnFail).',

      },

    ),

    httpGetNode(

      'get-professionals',

      'Catalogo profissionais Core API',

      '/api/v1/professionals',

      [220, 80],

      {

        optional: true,

        notes: 'Catálogo para o agente mapear professional_id (continueOnFail).',

      },

    ),

  );



  const ctx = byName('Contexto agenda Core API');

  if (ctx) {

    ctx.continueOnFail = true;

    ctx.position = [330, 0];

  } else {

    wf.nodes.push(

      httpGetNode(

        'get-context',

        'Contexto agenda Core API',

        '/api/v1/appointments?from={{$now}}&to={{$now.plus({days:7})}}',

        [330, 0],

        {

          optional: true,

          notes: 'Opcional — appointments 7d. Renovar JWT: setup-n8n-workflow-02-core-credential.mjs',

        },

      ),

    );

  }



  wf.nodes.push(

    codeNode(

      'build-agent-ctx',

      'Montar contexto agente',

      [440, 0],

      buildCtx,

      'Catálogo + inbound sem vazar 401 ao LLM.',

    ),

  );



  const normNode = byName('Normalizar saida IA');

  if (normNode) {

    normNode.parameters = { mode: 'runOnceForAllItems', jsCode: norm };

    normNode.position = [720, 0];

  } else {

    wf.nodes.push(

      codeNode('norm', 'Normalizar saida IA', [720, 0], norm, 'Parse JSON + resolve catalogo + customer_id'),

    );

  }



  wf.nodes.push(

    codeNode(

      'route-flow',

      'Rotear fluxo',

      [940, 0],

      route,

      'criar só com intent + UUIDs + data válidos; senão outbound.',

    ),

  );



  wf.nodes.push({

    parameters: {

      conditions: {

        options: {

          caseSensitive: true,

          leftValue: '',

          typeValidation: 'strict',

        },

        conditions: [

          {

            id: 'route-criar',

            leftValue: '={{ $json._route }}',

            rightValue: 'criar',

            operator: {

              type: 'string',

              operation: 'equals',

              name: 'filter.operator.equals',

            },

          },

        ],

        combinator: 'and',

      },

    },

    id: 'if-route-criar',

    name: 'Rota criar?',

    type: 'n8n-nodes-base.if',

    typeVersion: 2,

    position: [1160, 0],

  });



  const agent = byName('Agente IA Agendamento');

  if (agent) {

    agent.position = [560, 0];

    agent.parameters.text = `={{ (() => {

  const ctx = $('Montar contexto agente').first().json || {};

  const inb = ctx.inbound || {};

  const cat = ctx.catalog || {};

  const def = ctx.defaults || {};

  return [

    'Ultima mensagem: ' + String(inb.message || ''),

  'Historico da sessao (todas as mensagens recentes):',

  String(inb.session_text || inb.message || ''),

    'Telefone: ' + String(inb.phone || ''),

    'customer_id: ' + String(inb.customer_id || def.customer_id || ''),

    'Servicos (use id UUID exato): ' + JSON.stringify(cat.services || []).slice(0, 4000),

    'Profissionais (use id UUID exato): ' + JSON.stringify(cat.professionals || []).slice(0, 2000),

    'Agendamentos proximos 7d: ' + JSON.stringify(cat.appointments_next_7d || []).slice(0, 2000),

    '',

    'Regras:',

    '- CONVERSA MULTI-TURNO: use TODO o historico; nao ignore mensagens anteriores.',

    '- Saudacao so (Boa tarde/Oi): intent=informacao_empresa, resposta cordial, SEM criar_agendamento.',

    '- Agendar so quando o historico tiver servico + data (ex. amanha) + horario se informado.',

    '- NUNCA mencione erro de autenticacao/API ao cliente.',

    '- Para agendar: intent=criar_agendamento com professional_id, service_id, appointment_date (YYYY-MM-DD), appointment_time (HH:mm).',

    '- Se cliente pedir corte/barba sem UUID, escolha do catalogo (ex. Corte masculino).',

    '- Se faltar data, use amanha (YYYY-MM-DD) quando cliente disser amanha/amanha no historico.',

    '- Se so tiver duvida de horarios: intent=consultar_horarios com response_text util.',

    '- atendimento_humano apenas se pedido explicito de humano.',

    '',

    'Retorne JSON na raiz: intent, professional_id, service_id, appointment_date, appointment_time, customer_id, response_text, appointment_payload.',

  ].join('\\n');

})() }}`;

    agent.parameters.options = {

      systemMessage:

        'Responda somente JSON valido, sem markdown. Use UUIDs do catalogo. Nunca invente IDs.',

    };

  }



  const outbox = byName('Enfileirar resposta WhatsApp outbox');

  if (outbox) {

    outbox.parameters.jsonBody =

      "={{ JSON.stringify({ customer_id: $('Rotear fluxo').first().json.customer_id, text: $('Rotear fluxo').first().json.response_text || 'Atualizacao', correlation_id: 'n8n-wf02-' + String($execution.id), idempotency_key: 'n8n-02-' + String($execution.id) }) }}";

  }

  const ifSlots = byName('Ha slots livres');

  if (ifSlots) {

    ifSlots.parameters = {

      conditions: {

        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },

        conditions: [

          {

            id: 'slots-count',

            leftValue:

              '={{ ($json.slots || []).filter((s) => s && s.starts_at && s.ends_at).length }}',

            rightValue: 0,

            operator: { type: 'number', operation: 'gt' },

          },

        ],

        combinator: 'and',

      },

      options: {},

    };

  }

  const availNode = byName('GET disponibilidade Core API');

  if (availNode) availNode.continueOnFail = true;



  wf.nodes.push(

    codeNode(

      'merge-route-avail',

      'Unir rota e disponibilidade',

      [1280, -120],

      mergeAvail,

      'Propaga UUIDs + slots no mesmo item.',

    ),

    codeNode(

      'build-appt-payload',

      'Montar payload agendamento',

      [1500, -200],

      buildAppt,

      'Primeiro slot availability -> POST /appointments.',

    ),

  );



  const payloadIfParameters = {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [
        {
          id: 'payload-starts',
          leftValue:
            "={{ ($json.appointment_payload && $json.appointment_payload.starts_at) || $json.starts_at || '' }}",
          rightValue: '',
          operator: {
            type: 'string',
            operation: 'notEmpty',
            name: 'filter.operator.notEmpty',
          },
        },
        {
          id: 'payload-ends',
          leftValue:
            "={{ ($json.appointment_payload && $json.appointment_payload.ends_at) || $json.ends_at || '' }}",
          rightValue: '',
          operator: {
            type: 'string',
            operation: 'notEmpty',
            name: 'filter.operator.notEmpty',
          },
        },
      ],
      combinator: 'and',
    },
  };

  const ifPayload = byName('Payload agendamento valido?');
  if (ifPayload) {
    ifPayload.parameters = payloadIfParameters;
  } else {
    wf.nodes.push({
      parameters: payloadIfParameters,
      id: 'if-payload-valid',
      name: 'Payload agendamento valido?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [1610, -200],
    });
  }

  const createAppt = byName('Criar agendamento Core API');

  if (createAppt) {

    createAppt.position = [1820, -200];

    createAppt.parameters.jsonBody =

      "={{ JSON.stringify($json.appointment_payload || {}) }}";

    createAppt.continueOnFail = true;

  }



  wf.connections = {

    'When Executed by Another Workflow': {

      main: [[{ node: 'Preparar contexto inbound', type: 'main', index: 0 }]],

    },

    'Preparar contexto inbound': {

      main: [[{ node: 'Catalogo servicos Core API', type: 'main', index: 0 }]],

    },

    'Catalogo servicos Core API': {

      main: [[{ node: 'Catalogo profissionais Core API', type: 'main', index: 0 }]],

    },

    'Catalogo profissionais Core API': {

      main: [[{ node: 'Contexto agenda Core API', type: 'main', index: 0 }]],

    },

    'Contexto agenda Core API': {

      main: [[{ node: 'Montar contexto agente', type: 'main', index: 0 }]],

    },

    'Montar contexto agente': {

      main: [[{ node: 'Agente IA Agendamento', type: 'main', index: 0 }]],

    },

    'Agente IA Agendamento': {

      main: [[{ node: 'Normalizar saida IA', type: 'main', index: 0 }]],

    },

    'Normalizar saida IA': {

      main: [[{ node: 'Rotear fluxo', type: 'main', index: 0 }]],

    },

    'Rotear fluxo': {

      main: [[{ node: 'Rota criar?', type: 'main', index: 0 }]],

    },

    'Rota criar?': {

      main: [

        [{ node: 'GET disponibilidade Core API', type: 'main', index: 0 }],

        [{ node: 'Enfileirar resposta WhatsApp outbox', type: 'main', index: 0 }],

      ],

    },

    'GET disponibilidade Core API': {

      main: [[{ node: 'Unir rota e disponibilidade', type: 'main', index: 0 }]],

    },

    'Unir rota e disponibilidade': {

      main: [[{ node: 'Ha slots livres', type: 'main', index: 0 }]],

    },

    'Ha slots livres': {

      main: [

        [{ node: 'Montar payload agendamento', type: 'main', index: 0 }],

        [{ node: 'Enfileirar resposta WhatsApp outbox', type: 'main', index: 0 }],

      ],

    },

    'Montar payload agendamento': {

      main: [[{ node: 'Payload agendamento valido?', type: 'main', index: 0 }]],

    },

    'Payload agendamento valido?': {

      main: [

        [{ node: 'Criar agendamento Core API', type: 'main', index: 0 }],

        [{ node: 'Enfileirar resposta WhatsApp outbox', type: 'main', index: 0 }],

      ],

    },

    'Criar agendamento Core API': {

      main: [[{ node: 'Enfileirar resposta WhatsApp outbox', type: 'main', index: 0 }]],

    },

    'OpenAI Chat Model Barbearia': {

      ai_languageModel: [

        [{ node: 'Agente IA Agendamento', type: 'ai_languageModel', index: 0 }],

      ],

    },

  };



  wf.nodes = dedupeNodes(wf.nodes);

  return wf;

}



function syncDb(wf) {

  const pgUser = process.env.POSTGRES_USER || 'barbearia_test';

  const pgDb = process.env.POSTGRES_DB || 'barbearia_saas';

  const nodesJson = JSON.stringify(wf.nodes).replace(/'/g, "''");

  const connJson = JSON.stringify(wf.connections).replace(/'/g, "''");

  const sql = `

UPDATE workflow_entity

SET nodes = '${nodesJson}'::json,

    connections = '${connJson}'::json,

    "updatedAt" = now()

WHERE id = '${WF02_ID}';

`;

  execSync(`docker exec -i barbearia-postgres psql -U ${pgUser} -d ${pgDb} -v ON_ERROR_STOP=1`, {

    input: sql,

  });

}



const wf = patchWf(loadWf());

for (const rel of [

  'n8n/workflows/02_ai_scheduling_agent_multitenant.json',

  'docs/n8n/02_ai_scheduling_agent_multitenant.json',

]) {

  const fp = path.join(root, rel);

  fs.mkdirSync(path.dirname(fp), { recursive: true });

  fs.writeFileSync(fp, `${JSON.stringify(wf, null, 2)}\n`, 'utf8');

  console.log('[patch-wf02] wrote', rel);

}



try {

  syncDb(wf);

  console.log('[patch-wf02] DB synced', WF02_ID);

} catch (e) {

  console.warn('[patch-wf02] DB sync skipped:', e.message);

}



if (refreshCreds) {

  execSync('node scripts/setup-n8n-workflow-02-core-credential.mjs', {

    cwd: root,

    stdio: 'inherit',

  });

  try {

    execSync('docker compose restart n8n', { cwd: root, stdio: 'inherit' });

  } catch (_) {

    /* optional */

  }

}

