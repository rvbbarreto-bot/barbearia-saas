/**
 * OpenAPI 3.0 estático (DEV/QA) — complementar rotas reais em `server.ts`.
 * Não substitui validação runtime; serve frontend, n8n e QA futuro.
 */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Barbearia SaaS — Core API',
    version: '0.1.0',
    description:
      'API multi-tenant. Autenticação: Bearer JWT. Tenant: cabeçalho `x-tenant-id` alinhado ao token. ' +
      'Ambiente DEV/QA. Flags: RECALL_ENABLED, WAITLIST_*, PIX_REAL_PROVIDER_ENABLED. ' +
      'Limites de plano (`plan_limits`): ver docs/ADR_PLAN_LIMITS_DEVQA_07.md e docs/ADR_PLAN_LIMITS_ENFORCEMENT.md.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local (ajustar PORT)' }],
  tags: [
    { name: 'auth', description: 'Login, refresh (público controlado por rate limit)' },
    { name: 'me', description: 'Perfil do utilizador autenticado' },
    { name: 'users', description: 'Gestão de utilizadores do tenant (RBAC tenant_admin+)' },
    { name: 'services', description: 'Catálogo de serviços' },
    { name: 'health', description: 'Liveness / readiness' },
    { name: 'availability', description: 'Slots livres' },
    { name: 'appointments', description: 'Agendamentos' },
    { name: 'waitlist', description: 'Fila de espera' },
    { name: 'recall', description: 'Recall promocional (RECALL_ENABLED)' },
    { name: 'integrations', description: 'Outbound / orquestração segura' },
    { name: 'customers', description: 'Clientes' },
    { name: 'professionals', description: 'Profissionais' },
    { name: 'audit', description: 'Audit log (read-only típico)' },
    { name: 'finance', description: 'Financeiro por agendamento (PIX real desativado por defeito)' },
    { name: 'commission', description: 'Regras, lançamentos e fechos (feature tenant `commission_enabled`)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      tenantHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-tenant-id',
        description: 'UUID do tenant; deve coincidir com o JWT.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          request_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { tenantHeader: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Autenticação (tenant explícito)',
        description:
          'Corpo: `email`, `password`, `tenant_id` (UUID). Devolve access/refresh JWT. Rate limit aplicado.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'tenant_id'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  tenant_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'tokens + user' },
          '401': { description: 'INVALID_CREDENTIALS', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'ACCOUNT_LOCKED' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'Renovar access token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string' } } },
            },
          },
        },
        responses: { '200': { description: 'Novos tokens' }, '401': { description: 'INVALID_REFRESH_TOKEN' } },
      },
    },
    '/api/v1/me': {
      get: {
        tags: ['me'],
        summary: 'Dados do utilizador atual',
        description: 'Requer Bearer JWT + `x-tenant-id` coerente. Resposta sem `password_hash`.',
        responses: {
          '200': { description: 'Utilizador' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'USER_NOT_FOUND' },
        },
      },
    },
    '/api/v1/users': {
      get: {
        tags: ['users'],
        summary: 'Listar utilizadores do tenant',
        description: 'RBAC: mínimo `manager`.',
        responses: { '200': { description: 'Lista paginada' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem papel' } },
      },
      post: {
        tags: ['users'],
        summary: 'Criar utilizador',
        description: 'RBAC: `tenant_admin`.',
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '201': { description: 'Criado' }, '400': { description: 'Validação' } },
      },
    },
    '/api/v1/services': {
      get: {
        tags: ['services'],
        summary: 'Listar serviços',
        responses: { '200': { description: 'Lista paginada' }, '401': { description: 'Não autenticado' } },
      },
      post: {
        tags: ['services'],
        summary: 'Criar serviço',
        description: 'RBAC: mínimo `manager` conforme rotas.',
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '201': { description: 'Criado' } },
      },
    },
    '/health/live': {
      get: {
        tags: ['health'],
        summary: 'Liveness',
        security: [],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['health'],
        summary: 'Readiness (Postgres + Redis)',
        security: [],
        responses: {
          '200': { description: 'OK' },
          '503': { description: 'Degradado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/availability': {
      get: {
        tags: ['availability'],
        summary: 'Listar slots disponíveis',
        parameters: [
          { name: 'professional_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'service_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-05-10' } },
        ],
        responses: {
          '200': { description: 'Lista de slots (formato interno da API)' },
          '400': { description: 'Validação', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Não autenticado' },
        },
      },
    },
    '/api/v1/appointments': {
      get: {
        tags: ['appointments'],
        summary: 'Listar agendamentos (intervalo)',
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'Lista paginada / dados de agenda' }, '401': { description: 'Não autenticado' } },
      },
      post: {
        tags: ['appointments'],
        summary: 'Criar agendamento',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '201': { description: 'Criado' },
          '400': { description: 'Validação / conflito de slot' },
          '401': { description: 'Não autenticado' },
        },
      },
    },
    '/api/v1/waitlist': {
      get: {
        tags: ['waitlist'],
        summary: 'Entradas da fila de espera',
        description:
          'RBAC: `waitlist.read`. Query: `page`, `limit`, `status` (active|cancelled|converted|all), `professional_id`, `service_id` (UUID opcionais).',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['active', 'cancelled', 'converted', 'all'], default: 'active' },
          },
          { name: 'professional_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'service_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' } },
      },
      post: {
        tags: ['waitlist'],
        summary: 'Entrar na fila',
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '201': { description: 'Criado' }, '401': { description: 'Não autenticado' } },
      },
    },
    '/api/v1/waitlist/{entryId}/convert': {
      post: {
        tags: ['waitlist'],
        summary: 'Converter entrada em agendamento existente',
        description:
          'RBAC: `waitlist.convert` (mín. attendant). Corpo: `appointment_id` (UUID) do mesmo `customer_id` da entrada. ' +
          'Não envia WhatsApp direto; pode gerar audit `WAITLIST_ENTRY_CONVERTED`. Isolamento: só entradas do tenant do JWT.',
        parameters: [{ name: 'entryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['appointment_id'],
                properties: { appointment_id: { type: 'string', format: 'uuid' } },
                example: { appointment_id: '00000000-0000-0000-0000-000000000001' },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Entrada atualizada (status converted)' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'WAITLIST_ENTRY_NOT_FOUND / APPOINTMENT_NOT_FOUND' },
          '409': { description: 'WAITLIST_NOT_ACTIVE' },
          '422': { description: 'WAITLIST_CONVERT_MISMATCH — cliente diferente' },
        },
      },
    },
    '/api/v1/recall/candidates': {
      get: {
        tags: ['recall'],
        summary: 'Candidatos a recall promocional',
        description: 'RBAC: `recall.readCandidates`. Query: `limit`, `offset`, `only_sendable`.',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'only_sendable', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': {
            description: '{ candidates, total, limit, offset }',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/v1/recall/cancel': {
      post: {
        tags: ['recall'],
        summary: 'Cancelar envio recall',
        description: 'RBAC: `recall.cancelSend` (mín. manager). Corpo: `source_appointment_id`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['source_appointment_id'],
                properties: { source_appointment_id: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK' },
          '400': { description: 'INVALID_BODY' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/v1/recall/send': {
      post: {
        tags: ['recall'],
        summary: 'Pedir envio recall (outbox)',
        description:
          'RBAC: `recall.sendPromotional`. Requer **RECALL_ENABLED=true** no ambiente; caso contrário 403 RECALL_DISABLED. Não envia WhatsApp síncrono.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['source_appointment_id', 'customer_id'],
                properties: {
                  source_appointment_id: { type: 'string', format: 'uuid' },
                  customer_id: { type: 'string', format: 'uuid' },
                  service_id: { type: 'string', format: 'uuid' },
                  template_key: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '{ result, reason? }' },
          '403': { description: 'RECALL_DISABLED' },
          '404': { description: 'Agendamento inexistente' },
          '422': { description: 'customer_id não coincide com agendamento' },
        },
      },
    },
    '/api/v1/integrations/outbound/whatsapp-text': {
      post: {
        tags: ['integrations'],
        summary: 'Enfileirar texto WhatsApp (outbox)',
        description:
          'RBAC: `integrations.enqueueOutbound` (mín. attendant). Enfileira `message_outbox` com status `pending`; **não** envia WhatsApp síncrono nem chama Evolution a partir deste handler.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customer_id', 'text'],
                properties: {
                  customer_id: { type: 'string', format: 'uuid' },
                  text: { type: 'string', minLength: 1, maxLength: 4096 },
                  idempotency_key: { type: 'string', minLength: 8, maxLength: 200 },
                  correlation_id: { type: 'string', minLength: 8, maxLength: 200 },
                },
              },
            },
          },
        },
        responses: {
          '202': { description: '{ ok: true } — mensagem aceita para processamento assíncrono' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão (ex.: viewer)' },
          '422': { description: 'INTEGRATION_NO_ROUTING — sem telefone/integração' },
        },
      },
    },
    '/api/v1/integrations/outbound/outbox-summary': {
      get: {
        tags: ['integrations'],
        summary: 'Resumo message_outbox por estado',
        description:
          'RBAC: mínimo `manager`. Leitura agregada `{ by_status, pending, dead }` para dashboards. ' +
          'Isolamento: `withTenant` / RLS em `message_outbox`. Não expõe payloads.',
        responses: {
          '200': {
            description: 'Contagens por status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    by_status: { type: 'object', additionalProperties: { type: 'integer' } },
                    pending: { type: 'integer', description: 'pending + processing' },
                    dead: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Papel inferior a manager' },
        },
      },
    },
    '/api/v1/customers': {
      get: {
        tags: ['customers'],
        summary: 'Listar clientes',
        responses: { '200': { description: 'Lista paginada' }, '401': { description: 'Não autenticado' } },
      },
      post: {
        tags: ['customers'],
        summary: 'Criar cliente',
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '201': { description: 'Criado' }, '400': { description: 'Validação' } },
      },
    },
    '/api/v1/professionals': {
      get: {
        tags: ['professionals'],
        summary: 'Listar profissionais',
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' } },
      },
      post: {
        tags: ['professionals'],
        summary: 'Criar profissional',
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '201': { description: 'Criado' } },
      },
    },
    '/api/v1/audit-logs': {
      get: {
        tags: ['audit'],
        summary: 'Listar audit logs',
        description: 'RBAC: `tenant_admin`. Filtros: `from`, `to`, `entity`, `action`, `actor_user_id`, `entity_id`, paginação `page`/`limit`.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'string' } },
          { name: 'entity', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'actor_user_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'entity_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem papel' } },
      },
    },
    '/api/v1/finance/appointments': {
      get: {
        tags: ['finance'],
        summary: 'Listar linhas financeiras (read-only)',
        description:
          'RBAC: `finance.readAppointment` (mín. attendant). Query: `page`, `limit`, `from`/`to` (ISO, filtro em `appointments.starts_at`), ' +
          '`professional_id`, `financial_status` (`open`|`settled`|`all`). Resposta paginada com `balance_due_cents` derivado. Tenant: JWT + RLS.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'professional_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'financial_status',
            in: 'query',
            schema: { type: 'string', enum: ['open', 'settled', 'all'] },
          },
        ],
        responses: {
          '200': {
            description: '{ data, total, page, limit }',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/v1/finance/appointments/{appointmentId}': {
      get: {
        tags: ['finance'],
        summary: 'Snapshot financeiro do agendamento',
        description: 'RBAC: `finance.readAppointment` (mín. attendant).',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Linha appointment_financials + derivados' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Não encontrado' },
        },
      },
    },
    '/api/v1/finance/appointments/{appointmentId}/settle': {
      patch: {
        tags: ['finance'],
        summary: 'Liquidar saldo do agendamento',
        description: 'RBAC: `finance.settleBalance`. Agendamento deve estar `completed`.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '200': { description: 'Atualizado' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '409': { description: 'Valor inválido / estado inválido' },
        },
      },
    },
    '/api/v1/finance/appointments/{appointmentId}/discount': {
      patch: {
        tags: ['finance'],
        summary: 'Aplicar desconto',
        description: 'RBAC: `finance.applyDiscount` (mín. manager). Motivo obrigatório conforme regra de negócio.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '200': { description: 'Atualizado' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '422': { description: 'Motivo em falta / validação' },
        },
      },
    },
    '/api/v1/finance/reports/daily': {
      get: {
        tags: ['finance'],
        summary: 'Relatório financeiro diário',
        description: 'RBAC: `finance.dailyReport` (mín. tenant_admin). Query `date=YYYY-MM-DD`.',
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-05-10' } }],
        responses: { '200': { description: 'Totais do dia' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
    },
    '/api/v1/commission/rules': {
      get: {
        tags: ['commission'],
        summary: 'Listar regras de comissão',
        description: 'RBAC: `commissions.readRules` (mín. manager). Query `active_only=true|false`.',
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
      post: {
        tags: ['commission'],
        summary: 'Criar regra',
        description: 'RBAC: `commissions.manageRules` (mín. manager).',
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '201': { description: 'Criado' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' }, '422': { description: 'Validação' } },
      },
    },
    '/api/v1/commission/rules/{ruleId}': {
      patch: {
        tags: ['commission'],
        summary: 'Atualizar regra',
        description: 'RBAC: `commissions.manageRules`.',
        parameters: [{ name: 'ruleId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
    },
    '/api/v1/commission/entries': {
      get: {
        tags: ['commission'],
        summary: 'Listar lançamentos',
        description:
          'RBAC: `commissions.readEntries` (mín. manager). Query: `page`, `limit`, `professional_id`, `branch_id`, ' +
          '`status` (pending|approved|paid|cancelled), `from`/`to` em `appointments.completed_at`. ' +
          'Resposta: `{ data, total, page, limit }`. Tenant: RLS + JWT.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'professional_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'branch_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'paid', 'cancelled'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'Lista paginada',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
      },
    },
    '/api/v1/commission/entries/{entryId}/status': {
      patch: {
        tags: ['commission'],
        summary: 'Atualizar estado de um lançamento',
        description: 'RBAC: `commissions.updateEntryStatus` (mín. manager).',
        parameters: [{ name: 'entryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
    },
    '/api/v1/commission/cash-closings/compute': {
      post: {
        tags: ['commission'],
        summary: 'Calcular fecho de caixa para uma data',
        description: 'RBAC: `commissions.computeClosing` (mín. manager).',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['date'], properties: { date: { type: 'string', example: '2026-05-10' } } } } },
        },
        responses: { '200': { description: 'Fecho calculado' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
    },
    '/api/v1/commission/cash-closings': {
      get: {
        tags: ['commission'],
        summary: 'Listar fechos',
        description: 'RBAC: `commissions.readClosing` (mín. attendant).',
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
    },
    '/api/v1/commission/reports/by-professional': {
      get: {
        tags: ['commission'],
        summary: 'Relatório de totais por profissional',
        description: 'RBAC: `commissions.reportByProfessional` (mín. tenant_admin).',
        responses: { '200': { description: 'Relatório' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
      },
    },
  },
} as const;
