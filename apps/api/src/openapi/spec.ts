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
      'API multi-tenant. Autenticação: Bearer JWT. **Resolução de tenant (CT-020):** (1) se `x-tenant-id` estiver presente (não vazio), prevalece; (2) senão, usa-se o `tenant_id` do JWT; (3) se ambos existirem e divergirem → **403** `TENANT_MISMATCH`; (4) se nenhum existir → **401** `TENANT_REQUIRED`. ' +
      'Recomenda-se enviar sempre `x-tenant-id` em integrações. ' +
      'Ambiente DEV/QA. Flags: RECALL_ENABLED, WAITLIST_*, PIX_REAL_PROVIDER_ENABLED, OUTBOX_FORCE_SEND_FAILURE (simulação de falha de provider). ' +
      'Limites de plano (`plan_limits`): ver docs/ADR_PLAN_LIMITS_DEVQA_07.md e docs/ADR_PLAN_LIMITS_ENFORCEMENT.md.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local (ajustar PORT)' }],
  tags: [
    { name: 'auth', description: 'Login, refresh (público controlado por rate limit)' },
    { name: 'me', description: 'Perfil do utilizador autenticado' },
    {
      name: 'tenants',
      description:
        '`GET|POST /tenants` lista/cria tenants globalmente — apenas `platform_admin`; **sem obrigatoriedade de** `x-tenant-id`. ' +
        '`GET /tenants/current` e `GET /tenants/{id}` são tenant-scoped (exigem contexto de tenant).',
    },
    { name: 'users', description: 'Gestão de utilizadores do tenant (RBAC tenant_admin+)' },
    { name: 'services', description: 'Catálogo de serviços' },
    { name: 'health', description: 'Liveness / readiness' },
    { name: 'availability', description: 'Slots livres' },
    { name: 'appointments', description: 'Agendamentos' },
    { name: 'waitlist', description: 'Fila de espera' },
    { name: 'recall', description: 'Recall promocional (RECALL_ENABLED)' },
    { name: 'integrations', description: 'Outbound / orquestração segura' },
    { name: 'outbox', description: 'Fila message_outbox — diagnóstico suporte' },
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
        description:
          'UUID do tenant. **Prioridade:** quando presente (não vazio), o servidor usa este valor; caso contrário infere do JWT. Se ambos existirem e divergirem → **403** `TENANT_MISMATCH`.',
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
        summary: 'Autenticação (tenant opcional)',
        description:
          'Corpo: `email`, `password`, e opcionalmente `tenant_id` (UUID). Se `tenant_id` for omitido e existir um único utilizador ativo para o e-mail, o tenant é inferido; se existirem vários tenants para o mesmo e-mail, resposta 400 `TENANT_REQUIRED`. Não enviar `tenant_id` como string vazia.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  tenant_id: { type: 'string', format: 'uuid', description: 'Opcional — obrigatório quando o e-mail existe em mais de um tenant.' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'tokens + user' },
          '400': { description: 'TENANT_REQUIRED ou validação', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
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
    '/health': {
      get: {
        tags: ['health'],
        summary: 'Liveness simples',
        security: [],
        responses: { '200': { description: 'OK' } },
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
    '/database/health': {
      get: {
        tags: ['health'],
        summary: 'Saúde apenas PostgreSQL',
        security: [],
        responses: {
          '200': { description: 'Base de dados acessível' },
          '503': { description: 'Indisponível', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
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
        summary: 'Listar agendamentos (intervalo e/ou dia civil)',
        description:
          'RBAC: `appointments.read` (mín. `viewer`). Filtro temporal: enviar `from`+`to` (ISO, intervalo em `starts_at`) e/ou `on_date` (YYYY-MM-DD, dia civil no fuso do tenant). ' +
          'Outros filtros: `status`, `professional_id`, `customer_id`, paginação `page`/`limit`.',
        parameters: [
          { name: 'from', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
          {
            name: 'on_date',
            in: 'query',
            required: false,
            schema: { type: 'string', example: '2026-05-14', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            description: 'Dia civil (tenant timezone) para filtrar `starts_at`.',
          },
          { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'professional_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'customer_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '{ data, total, page, limit }' },
          '400': { description: 'on_date inválida' },
          '401': { description: 'Não autenticado' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
      post: {
        tags: ['appointments'],
        summary: 'Criar agendamento',
        description:
          'RBAC: `appointments.create`. Campo `explicit_confirmation` (boolean): com `true`, o fluxo típico fica em `awaiting_confirmation` até confirmação explícita. ' +
          'Com `false`, **criação administrativa / walk-in** sem confirmação explícita do cliente: permitido apenas para `tenant_admin`+ em `source` ≠ `walk_in`, ou `walk_in` com `attendant`+ (perfil `professional` bloqueado com `false`). Ver `docs/DECISAO_PRODUTO_CT073_EXPLICIT_CONFIRMATION.md`.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '201': { description: 'Criado' },
          '400': { description: 'Validação' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'FORBIDDEN (ex.: confirmação imediata sem perfil adequado)' },
          '404': { description: 'CUSTOMER_NOT_FOUND / recurso de catálogo inexistente' },
          '409': { description: 'SLOT_UNAVAILABLE / DUPLICATE_IDEMPOTENCY_KEY' },
          '422': { description: 'APPOINTMENT_IN_PAST / restrições de cliente' },
        },
      },
    },
    '/api/v1/appointments/{appointmentId}': {
      get: {
        tags: ['appointments'],
        summary: 'Obter agendamento por ID',
        description: 'RBAC: `appointments.read` (mín. `viewer`). Mesmo payload enriquecido que na listagem.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Agendamento' },
          '401': { description: 'Não autenticado' },
          '404': { description: 'APPOINTMENT_NOT_FOUND' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/confirm': {
      patch: {
        tags: ['appointments'],
        summary: 'Confirmar agendamento',
        description: 'RBAC: `appointments.confirm` (mín. `attendant`). Corpo vazio `{}`.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Atualizado' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'APPOINTMENT_NOT_FOUND' },
          '409': { description: 'Transição de estado inválida' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/reschedule': {
      patch: {
        tags: ['appointments'],
        summary: 'Remarcar agendamento',
        description:
          'RBAC: `appointments.reschedule` (mín. `attendant`). Valida expediente, bloqueios (`calendar_blocks`) e conflitos. ' +
          'Não remarca `completed`, `no_show`, `expired` ou `rescheduled`.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['starts_at', 'ends_at', 'reason'],
                properties: {
                  starts_at: { type: 'string', format: 'date-time' },
                  ends_at: { type: 'string', format: 'date-time' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Atualizado' },
          '400': { description: 'Validação' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'APPOINTMENT_NOT_FOUND' },
          '409': { description: 'Conflito de slot / estado' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/cancel': {
      patch: {
        tags: ['appointments'],
        summary: 'Cancelar agendamento',
        description:
          'RBAC: `appointments.cancel` (mín. `attendant`). Corpo JSON opcional: `reason` (≥3 caracteres quando enviado). ' +
          'Não cancela agendamentos `completed` ou `no_show`.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Cancelado' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'APPOINTMENT_NOT_FOUND' },
          '409': { description: 'Transição inválida' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/complete': {
      patch: {
        tags: ['appointments'],
        summary: 'Marcar agendamento como concluído',
        description: 'RBAC: `appointments.complete` (mín. `professional`). Apenas com status `in_service`.',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Concluído' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'APPOINTMENT_NOT_FOUND' },
          '409': { description: 'INVALID_STATUS_TRANSITION' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/no-show': {
      patch: {
        tags: ['appointments'],
        summary: 'Registrar no-show',
        description:
          'RBAC: `appointments.noShow` — mínimo `attendant`, **exclui** o papel `professional` (marcação manual no balcão/gestão). Corpo: `reason` (obrigatório, ≥3).',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3 } } },
            },
          },
        },
        responses: {
          '200': { description: 'Atualizado' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'APPOINTMENT_NOT_FOUND' },
          '409': { description: 'INVALID_STATUS_TRANSITION' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/history': {
      get: {
        tags: ['appointments'],
        summary: 'Histórico de eventos do agendamento',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Lista de eventos' }, '404': { description: 'APPOINTMENT_NOT_FOUND' } },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/appointments/{appointmentId}/status-history': {
      get: {
        tags: ['appointments'],
        summary: 'Histórico de estados do agendamento',
        parameters: [{ name: 'appointmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Lista' }, '404': { description: 'APPOINTMENT_NOT_FOUND' } },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/tenants': {
      get: {
        tags: ['tenants'],
        summary: 'Listar todos os tenants (plataforma)',
        description:
          'Rota **platform-scoped**: apenas `platform_admin` → **200**; `tenant_owner` e demais perfis tenant → **403**. ' +
          '**Não exige** `x-tenant-id`. JWT pode ter `tenant_id` null. Se enviar `x-tenant-id` e o JWT tiver `tenant_id` diferente, **403** `TENANT_MISMATCH`.',
        responses: {
          '200': { description: 'Lista paginada' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'FORBIDDEN ou TENANT_MISMATCH' },
        },
        security: [{ bearerAuth: [] }],
      },
      post: {
        tags: ['tenants'],
        summary: 'Criar tenant (plataforma)',
        description: 'Apenas `platform_admin`. **Não exige** `x-tenant-id` (rota platform-scoped).',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '201': { description: 'Criado' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem papel' },
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/api/v1/tenants/current': {
      get: {
        tags: ['tenants'],
        summary: 'Tenant atual (JWT / x-tenant-id)',
        description: 'Mínimo `tenant_admin` (inclui `tenant_owner`). Devolve o tenant do contexto autenticado.',
        responses: {
          '200': { description: 'Tenant' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Papel insuficiente' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/tenants/{tenantId}': {
      get: {
        tags: ['tenants'],
        summary: 'Obter tenant por UUID',
        description:
          'Mínimo `tenant_admin`. `tenantId` na rota deve coincidir com `tenant_id` do JWT (salvo `platform_admin`).',
        parameters: [{ name: 'tenantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Tenant' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Acesso negado ao tenant' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
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
          'RBAC: `integrations.enqueueOutbound` (mín. attendant). Enfileira `message_outbox` com status `pending`; **não** envia WhatsApp síncrono nem chama Evolution a partir deste handler. ' +
          '**Idempotência (CT-100):** com `idempotency_key` repetida, a primeira resposta é **202** `{ ok, duplicate: false }`; repetições com a mesma chave → **200** `{ ok, duplicate: true }` (sem nova linha nem reenvio).',
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
          '202': { description: 'Mensagem aceite (nova linha no outbox)' },
          '200': { description: 'Idempotente: mesma `idempotency_key` já processada — `{ ok: true, duplicate: true }`' },
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
    '/api/v1/outbox/messages': {
      get: {
        tags: ['outbox'],
        summary: 'Listar mensagens da fila (sanitizado)',
        description:
          'RBAC: `outbox.read` (mín. `attendant`). Lista `message_outbox` do tenant com paginação. ' +
          'Não devolve `metadata`/`payload` completos nem `provider_response`. Telefone mascarado em `destination`.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['pending', 'processing', 'sent', 'failed', 'dead'] },
          },
          { name: 'provider', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'correlation_id', in: 'query', schema: { type: 'string' } },
          { name: 'appointment_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'destination', in: 'query', schema: { type: 'string', description: 'Substring em metadata.phone' } },
          { name: 'customer_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'error_class',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['auth', 'network', 'timeout', 'provider', 'duplicate', 'not_found', 'other'],
            },
          },
        ],
        security: [{ bearerAuth: [], tenantHeader: [] }],
        responses: {
          '200': {
            description: '{ data, total, page, limit }',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          tenant_id: { type: 'string', format: 'uuid' },
                          channel: { type: 'string' },
                          provider: { type: 'string', nullable: true },
                          status: { type: 'string' },
                          destination: { type: 'string', nullable: true },
                          payload_summary: {
                            type: 'object',
                            properties: {
                              type: { type: 'string', nullable: true },
                              preview: { type: 'string', nullable: true },
                            },
                          },
                          last_error: {
                            type: 'string',
                            nullable: true,
                            description: 'Sanitizado (sem tokens/chaves).',
                          },
                          error_class: {
                            type: 'string',
                            nullable: true,
                            enum: ['auth', 'network', 'timeout', 'provider', 'duplicate', 'not_found', 'other'],
                          },
                          attempts: { type: 'integer' },
                          max_attempts: { type: 'integer' },
                          correlation_id: { type: 'string', nullable: true },
                          appointment_id: {
                            type: 'string',
                            format: 'uuid',
                            nullable: true,
                            description: 'Derivado de `correlation_id` quando for UUID de agendamento.',
                          },
                          idempotency_key: { type: 'string', nullable: true },
                          customer_id: { type: 'string', format: 'uuid', nullable: true },
                          created_at: { type: 'string', format: 'date-time' },
                          updated_at: { type: 'string', format: 'date-time' },
                          sent_at: { type: 'string', format: 'date-time', nullable: true },
                        },
                      },
                    },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': { description: 'VALIDATION_ERROR (filtros inválidos)' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão (inferior a attendant)' },
        },
      },
    },
    '/api/v1/outbox/messages/{id}': {
      get: {
        tags: ['outbox'],
        summary: 'Detalhe de mensagem outbox (sanitizado)',
        description: 'RBAC: `outbox.read` (mín. `attendant`). Mesmo formato sanitizado da listagem.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        security: [{ bearerAuth: [], tenantHeader: [] }],
        responses: {
          '200': {
            description: 'Mensagem',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    tenant_id: { type: 'string', format: 'uuid' },
                    channel: { type: 'string' },
                    provider: { type: 'string', nullable: true },
                    status: { type: 'string' },
                    destination: { type: 'string', nullable: true },
                    payload_summary: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', nullable: true },
                        preview: { type: 'string', nullable: true },
                      },
                    },
                    last_error: { type: 'string', nullable: true },
                    error_class: {
                      type: 'string',
                      nullable: true,
                      enum: ['auth', 'network', 'timeout', 'provider', 'duplicate', 'not_found', 'other'],
                    },
                    attempts: { type: 'integer' },
                    max_attempts: { type: 'integer' },
                    correlation_id: { type: 'string', nullable: true },
                    appointment_id: { type: 'string', format: 'uuid', nullable: true },
                    idempotency_key: { type: 'string', nullable: true },
                    customer_id: { type: 'string', format: 'uuid', nullable: true },
                    created_at: { type: 'string', format: 'date-time' },
                    updated_at: { type: 'string', format: 'date-time' },
                    sent_at: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'NOT_FOUND' },
        },
      },
    },
    '/api/v1/outbox/messages/{id}/retry': {
      post: {
        tags: ['outbox'],
        summary: 'Re-enfileirar mensagem (retry manual)',
        description:
          'RBAC: `outbox.retry` (mín. `manager`). Apenas `failed` ou `dead` → `pending`; regista `operational_audit_events`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        security: [{ bearerAuth: [], tenantHeader: [] }],
        responses: {
          '200': {
            description: '{ id, status: pending }',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['pending'] },
                  },
                },
              },
            },
          },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'NOT_FOUND' },
          '409': { description: 'OUTBOX_RETRY_NOT_ALLOWED' },
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
    '/api/v1/professionals/{professionalId}/time-blocks': {
      get: {
        tags: ['professionals'],
        summary: 'Listar bloqueios manuais do profissional',
        description:
          'Alias operacional P2.1 para `calendar_blocks` com `professional_id` fixo no path. RBAC: `agendaTimeBlocks.read` (mín. `viewer`). Query: `from`, `to`, `page`, `limit`.',
        parameters: [
          { name: 'professionalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '{ data, total, page, limit }' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
      post: {
        tags: ['professionals'],
        summary: 'Criar bloqueio manual (time block)',
        description:
          'Persistência: tabela `calendar_blocks`. RBAC: `agendaTimeBlocks.manage` (mín. `attendant`). Gera auditoria operacional `time_block_created`.',
        parameters: [{ name: 'professionalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['starts_at', 'ends_at'],
                properties: {
                  starts_at: { type: 'string', format: 'date-time' },
                  ends_at: { type: 'string', format: 'date-time' },
                  kind: { type: 'string', enum: ['time_off', 'break', 'holiday', 'maintenance', 'manual'] },
                  reason: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Criado' },
          '400': { description: 'Validação' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Profissional inexistente ou inativo' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/professionals/{professionalId}/time-blocks/{blockId}': {
      delete: {
        tags: ['professionals'],
        summary: 'Remover bloqueio manual',
        description:
          'Elimina apenas se o bloqueio pertencer ao `professionalId` do path. RBAC: `agendaTimeBlocks.manage`. Evento `time_block_deleted`.',
        parameters: [
          { name: 'professionalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'blockId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Removido' },
          '401': { description: 'Não autenticado' },
          '403': { description: 'Sem permissão' },
          '404': { description: 'Bloqueio não encontrado para este profissional' },
        },
        security: [{ bearerAuth: [], tenantHeader: [] }],
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
    '/api/v1/operational-audit-events': {
      get: {
        tags: ['audit'],
        summary: 'Listar eventos operacionais (P2)',
        description:
          'RBAC: `operationalAudit.read` (mín. `manager`). Filtros: `event_type`, `entity_type`, `entity_id`, `actor_user_id`, `from`/`to` ou `date_from`/`date_to` (ISO), `correlation_id`, `request_id`, paginação `page`/`limit`. Metadata sanitizada na resposta. Alias: `/api/v1/operational-audit/events`.',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'string' } },
          { name: 'event_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'actor_user_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'correlation_id', in: 'query', schema: { type: 'string' } },
          { name: 'request_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
        security: [{ bearerAuth: [], tenantHeader: [] }],
      },
    },
    '/api/v1/operational-audit/events': {
      get: {
        tags: ['audit'],
        summary: 'Listar eventos operacionais (alias PO)',
        description:
          'Idêntico a `GET /api/v1/operational-audit-events`. RBAC: `operationalAudit.read` (mín. `manager`).',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'string' } },
          { name: 'event_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'actor_user_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'correlation_id', in: 'query', schema: { type: 'string' } },
          { name: 'request_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Lista' }, '401': { description: 'Não autenticado' }, '403': { description: 'Sem permissão' } },
        security: [{ bearerAuth: [], tenantHeader: [] }],
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
