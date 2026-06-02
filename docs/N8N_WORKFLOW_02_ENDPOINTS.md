# Workflow 02 — endpoints Core API (remediação DEV/QA)

**Estado:** `active=false` no JSON exportado — não ativar no n8n até validação formal.

## Credenciais n8n (DevOps)

| Credencial | Script | Uso |
|------------|--------|-----|
| `Barbearia Core API - Bearer JWT` | `node scripts/setup-n8n-workflow-02-core-credential.mjs` | Nós HTTP → Core API |
| `Barbearia OpenAI API` | `node scripts/setup-n8n-workflow-02-openai-credential.mjs` | Nó **OpenAI Chat Model** → **Agente IA** (`ai_languageModel`) |

**OpenAI:** defina `OPENAI_API_KEY` apenas no `.env` local (não enviar no chat). Opcional: `N8N_OPENAI_MODEL=gpt-4o-mini`.

**Fluxo pós-IA (patch):** `node scripts/patch-n8n-workflow-02-flow.mjs [--refresh-credentials]` — `Preparar contexto inbound` → catálogo (`/services`, `/professionals`) → appointments → `Montar contexto agente` → agente → `Normalizar` → `Rotear` → outbound/availability. JWT local: `JWT_EXPIRES_IN=8h` no `.env` (renovar: `setup-n8n-workflow-02-core-credential.mjs`). Testes: `node scripts/qa-wf02-integration.mjs`, `.\scripts\qa-wf02-whatsapp-chain.ps1`.

## Autenticação

Todos os `httpRequest` devem usar credencial **HTTP Header Auth** (ou equivalente) com:

- `Authorization: Bearer <token JWT>` emitido pela Core API para o tenant;
- `x-tenant-id: <uuid>` igual ao `tenant_id` do JWT (evitar mismatch 403).

O **tenant nunca** é inferido de campos arbitrários do payload do cliente final.

## Endpoints utilizados

| Ordem | Método | Caminho | Uso |
|-------|--------|---------|-----|
| 1a | GET | `/api/v1/services` | Catálogo para o agente (`service_id`). |
| 1b | GET | `/api/v1/professionals` | Catálogo para o agente (`professional_id`). |
| 1c | GET | `/api/v1/appointments?from=&to=` | Contexto read-only (opcional). |
| 2 | — | Agente LangChain | Produz JSON estruturado (ver abaixo). |
| 3 | GET | `/api/v1/availability?professional_id=&service_id=&date=` | **Obrigatório** antes de criar agendamento. |
| 4 | POST | `/api/v1/appointments` | Cria agendamento / hold conforme payload. |
| 5 | POST | `/api/v1/integrations/outbound/whatsapp-text` | Enfileira texto em `message_outbox` (sem Evolution direto). |

### Corpo `POST /api/v1/integrations/outbound/whatsapp-text`

```json
{
  "customer_id": "uuid",
  "text": "mensagem ao cliente",
  "correlation_id": "opcional",
  "idempotency_key": "opcional"
}
```

Requisitos: cliente com telefone; integração WhatsApp ativa com `instance_name` em `tenant_integrations` (ver `resolveWhatsAppOutboundRouting`).

## Contrato sugerido para a saída do agente (nó Code “Normalizar saida IA”)

Campos na raiz ou em `output`:

- `intent`: `criar_agendamento` | `consultar_horarios` | `cancelar` | `informacao_empresa` | `atendimento_humano`
- `professional_id`, `service_id`, `appointment_date` (`YYYY-MM-DD`) quando `intent=criar_agendamento`
- `customer_id` (pode vir do workflow pai / Core)
- `response_text` — texto para o cliente
- `appointment_payload` — objeto JSON válido para `POST /api/v1/appointments`

## Removido

- Chamadas diretas a `EVOLUTION_API_URL` / `message/sendText`.

---

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
