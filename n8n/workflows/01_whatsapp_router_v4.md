# Workflow 01 — WhatsApp Inbound Router V4

## Visão geral

Recebe o payload bruto da Evolution API, filtra eventos irrelevantes, normaliza um DTO estável e registra a mensagem no **Core API** com headers de autenticação corretos. O n8n **não** calcula disponibilidade, **não** grava agenda direto no banco e **não** usa `tenant_id` do corpo como fonte de verdade.

```
Evolution API
    │  POST /webhook/.../whatsapp/inbound  (path configurado no n8n)
    ▼
[n8n] Webhook Evolution Inbound
    │  responseMode=onReceived → HTTP 200 imediato (Evolution não fica em retry)
    ▼
[n8n] Filtrar e Normalizar
    │  Descarta: fromMe, grupos, eventos != messages.upsert, sem texto
    │  Extrai instance (nome ou id) de múltiplos formatos de payload Evolution
    │  DTO: provider, provider_message_id, phone, text, timestamp, instance, ...
    ▼
[n8n] Registrar Core API + Roteamento
    │  fetch + JSON.stringify único → body idêntico ao usado no HMAC
    │  POST {API_BASE_URL}/webhooks/whatsapp/inbound
    │  Headers: x-webhook-instance, x-correlation-id
    │            + x-webhook-token (modo token) OU x-webhook-signature (modo HMAC)
    │  Body: phone, name, message, external_message_id  (SEM tenant_id)
    ▼
[n8n] Se agente?
    │  route=agent → Chamar Agente IA (Workflow 02)
    │  route=error | duplicate | config_error → Fim sem agente (sem spam / loop)
```

## Variáveis de ambiente no n8n

| Variável | Obrigatório | Descrição |
|---|---|---|
| `API_BASE_URL` | Sim | URL do Core API (`http://api:3000` no Docker Compose interno). |
| `N8N_WEBHOOK_TOKEN` | Sim\* | Token enviado em `x-webhook-token`; deve igualar `tenants.webhook_token` do tenant resolvido. |
| `N8N_HMAC_SECRET` | Alternativa | Se definido **e não vazio**, tem precedência: envia apenas `x-webhook-signature` (HMAC-SHA256 sobre o **corpo UTF-8** idêntico ao JSON enviado). Deve coincidir com `tenant_integrations.hmac_secret`. |
| `API_TIMEOUT_MS` | Não | Timeout do `fetch` (ms). Default 15000, máximo 120000. |

\*Obrigatório quando `N8N_HMAC_SECRET` não está definido.

### Precedência token vs HMAC

1. Se `N8N_HMAC_SECRET` tiver valor → **somente** `x-webhook-signature: sha256=...` (não envia token).
2. Caso contrário → **somente** `x-webhook-token` com valor de `N8N_WEBHOOK_TOKEN`.

O Core API valida primeiro HMAC quando `tenant_integrations.hmac_secret` está presente para a integração; senão usa o token comparado com `tenants.webhook_token`.

## Configuração pós-importação

1. Definir env vars acima nas configurações do n8n (Docker: `environment` ou UI).
2. Em **Workflow 02**, após importar, copiar o ID real em **Settings → Workflows**.
3. No nó **Chamar Agente IA**, substituir `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` pelo ID do workflow **02**.
4. Ativar este workflow quando o Contrato Evolution → n8n estiver configurado.

**Sub-workflow:** o Workflow 02 recebe, no primeiro item da execução, o objeto pai completo (`route`, `normalized`, `enrichment`, `core_response`). Ajuste o Workflow 02 para ler campos conforme necessidade (por exemplo `{{$json.enrichment.tenant_id}}`).

## DTO normalizado (saída de `Filtrar e Normalizar`)

Formato estável usado internamente e repassado em `normalized`:

| Campo | Tipo | Descrição |
|---|---|---|
| `provider` | string | Sempre `evolution`. |
| `provider_message_id` | string \| null | `key.id` da Evolution. |
| `phone` | string | DDD + número, só dígitos. |
| `text` | string | Texto da mensagem. |
| `timestamp` | number \| null | `messageTimestamp` quando existir. |
| `instance` | string | Valor enviado em **x-webhook-instance** (nome ou id cadastrado no Core). |
| `instance_key` | string | Igual a `instance` (alias explícito). |
| `instance_name` | string | Heurística: primeiro candidato “não só dígitos”, senão `instance`. |
| `instance_id_hint` | string \| null | Heurística auxiliar. |
| `push_name` | string \| null | `pushName` Evolution. |
| `correlation_id` | string | Header `x-correlation-id` para a API; default `execution.id`. |
| `raw_event` | object | Payload bruto (debug / futuro processamento). |

**Não** há `tenant_id` neste DTO.

## Chamada ao Core API

### Headers

```http
Content-Type: application/json
x-webhook-instance: <valor de normalized.instance>
x-correlation-id: <normalized.correlation_id>
x-webhook-token: <N8N_WEBHOOK_TOKEN>          # modo token
# OU
x-webhook-signature: sha256=<hex>              # modo HMAC (body idêntico ao enviado)
```

### Body (JSON) — **nunca** inclua `tenant_id` como fonte de verdade

```json
{
  "phone": "5511999999999",
  "name": "João Silva",
  "message": "Quero agendar",
  "external_message_id": "WAMID3EB0123456789ABCDEF"
}
```

### Respostas do Core API

**Sucesso (nova mensagem):**

```json
{
  "ok": true,
  "duplicate": false,
  "tenantId": "uuid",
  "customerId": "uuid",
  "messageId": "uuid"
}
```

**Duplicata (idempotência):**

```json
{ "ok": true, "duplicate": true }
```

## Comportamento em erro (sem loop infinito)

- O webhook da Evolution responde **200** logo no trigger (`onReceived`).
- Falhas de rede, HTTP 4xx/5xx ou resposta inesperada: `route=error` → ramo **Fim sem agente**; log no console do n8n **sem** token / segredo.
- `duplicate: true`: `route=duplicate` → **não** chama o Workflow 02 (evita intenção duplicada).
- Configuração ausente (`API_BASE_URL` ou credencial): `route=config_error`.

## Payloads de entrada Evolution (exemplos)

### messages.upsert — conversation

```json
{
  "event": "messages.upsert",
  "instance": "barbearia-inst-01",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "WAMID3EB0123456789ABCDEF"
    },
    "pushName": "João Silva",
    "message": {
      "conversation": "Olá, quero agendar um corte para amanhã"
    },
    "messageTimestamp": 1746220800
  }
}
```

### extendedTextMessage

```json
{
  "event": "messages.upsert",
  "instanceName": "barbearia-inst-01",
  "data": {
    "key": {
      "remoteJid": "5521988887777@s.whatsapp.net",
      "fromMe": false,
      "id": "WAMID3EB0987654321FEDCBA"
    },
    "pushName": "Maria Santos",
    "message": {
      "extendedTextMessage": {
        "text": "Tem horário para sábado de manhã?"
      }
    },
    "messageTimestamp": 1746220900
  }
}
```

## Eventos descartados no filtro

| Condição | Motivo |
|---|---|
| `event` ≠ `messages.upsert` | Outros tipos de evento. |
| `fromMe === true` | Mensagem própria. |
| `remoteJid` termina em `@g.us` | Grupo. |
| Sem texto extraível | Mídia sem legenda etc. |
| Sem `instance` derivável | Impossível montar `x-webhook-instance`. |

---

## Roteiro de teste com payload mock (`curl`)

Ajuste a URL conforme seu n8n (produção costuma usar **5678**):

```powershell
$WEBHOOK_URL = "http://localhost:5678/webhook/whatsapp/inbound"
# URL de teste do editor (somente quando workflow aberto para testes):
# $WEBHOOK_URL = "http://localhost:5678/webhook-test/whatsapp/inbound"
```

### Teste 1 — Payload válido (deve bater na Core API com token configurado)

```bash
curl -s -o /dev/stderr -w "%{http_code}\n" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "barbearia-inst-01",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "fromMe": false,
        "id": "WAMID_TEST_ROUTER_001"
      },
      "pushName": "João Teste",
      "message": { "conversation": "Quero agendar" },
      "messageTimestamp": 1746220800
    }
  }'
```

**Esperado:** HTTP **200** imediato do webhook. Execução: `route=agent` se Core retornar `ok` e não duplicado. No PostgreSQL: linha nova em `messages` (entrada inbound).

### Teste 2 — Mesmo `external_message_id` → duplicata

Reenviar o JSON do Teste 1.

**Esperado:** Execução com `route=duplicate`; Core responde `duplicate: true`; Workflow 02 **não** deve ser acionado.

### Teste 3 — Evento irrelevante

```bash
curl -s -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" \
  -d '{"event":"connection.update","instance":"barbearia-inst-01","data":{"state":"open"}}'
```

**Esperado:** HTTP 200. Fila para no Code (retorno `[]`). Nenhuma chamada ao Core.

### Teste 4 — Instância não cadastrada no Core

Trocar `"instance"` por um valor sem `tenant_integrations` correspondente.

**Esperado:** Core 404 → `route=error` → ramo **Fim sem agente**; um log estruturado sem segredo.

### Teste 5 — Token inválido (Core 401)

Manter instância válida mas `N8N_WEBHOOK_TOKEN` incorreto no n8n.

**Esperado:** `route=error`; sem chamada ao agente.

---

## Verificação no banco (pós-teste)

```sql
SELECT m.id, m.external_message_id, m.body, m.direction, m.channel, m.created_at,
       c.phone, c.name
FROM messages m
JOIN customers c ON c.id = m.customer_id
WHERE m.direction = 'in'
  AND m.created_at > now() - interval '1 hour'
ORDER BY m.created_at DESC;

SELECT cs.tenant_id, cs.state_key, cs.updated_at, c.phone
FROM conversation_states cs
JOIN customers c ON c.id = cs.customer_id
WHERE cs.state_key = 'awaiting_intent'
  AND cs.updated_at > now() - interval '1 hour'
ORDER BY cs.updated_at DESC;
```

---

## Limitações conhecidas

1. **Token global no n8n:** `N8N_WEBHOOK_TOKEN` é único por instância n8n. Multi-tenant com tokens distintos por tenant exige variável por workflow, credencial dinâmica ou lookup.
2. **Workflow 02 legado:** o JSON do agente de agendamento pode não consumir ainda `enrichment.tenant_id`; alinhar o Workflow 02 com este contrato.
3. **Áudio/imagem sem texto:** continua filtrado até haver transcrição ou política explícita.

---

## Arquivo exportado

O JSON pronto para importação está em:

`n8n/workflows/01_whatsapp_router_multitenant.json`
