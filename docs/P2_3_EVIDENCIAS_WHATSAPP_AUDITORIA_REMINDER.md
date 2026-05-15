# P2.3 — Evidências (WhatsApp, auditoria, lembrete, outbox)

Execução de referência na máquina de desenvolvimento (stack Docker). **Atualizar** `git rev-parse HEAD` no fecho formal após o último commit da entrega.

## 1. Git e imagem API

Na raiz do clone (após `git pull` até ao commit de entrega P2.3):

```powershell
git rev-parse HEAD
git log -1 --oneline
git status -sb
```

O subject esperado do último commit da entrega inclui: `feat(p2.3): inbound audit, reminder24h outbox, assisted ops QA script`.

## 2. `docker compose ps` (trecho)

```text
NAME                 STATUS                   PORTS
barbearia-api        Up (healthy)             0.0.0.0:3000->3000/tcp
barbearia-postgres   Up (healthy)             0.0.0.0:5432->5432/tcp
barbearia-redis      Up (healthy)             0.0.0.0:6380->6379/tcp
barbearia-web        Up (healthy)             0.0.0.0:3001->80/tcp
barbearia-n8n        Up (healthy)             0.0.0.0:5679->5678/tcp
```

## 3. Health

```bash
curl.exe -s http://localhost:3000/health
curl.exe -s http://localhost:3000/database/health
```

Resposta esperada: HTTP 200, `{"status":"ok"}` e `{"status":"ok","database":"connected"}`.

## 4. `npm run db:migrate:dry-run`

Executado na raiz do repositório; o script **CT-P2-302** captura a saída no CSV P2.3. Em volume só com `initdb`, é normal listar migrations como «pendentes» até `db:migrate` / `backfill` (ver `README.md`).

## 5. Script P2.3 (exit 0)

```powershell
.\scripts\qa-p2-3-operational-assisted-battery.ps1 -ApiBase http://localhost:3000
```

**Saída:** `docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv` — todos os casos **PASS** na última corrida bem-sucedida.

## 6. Webhook válido e duplicado (exemplo manual)

Substituir `EXTID` por um UUID / string única por tentativa.

**Primeira chamada (válida):**

```bash
curl.exe -s -X POST "http://localhost:3000/webhooks/whatsapp/inbound" ^
  -H "Content-Type: application/json" ^
  -H "x-webhook-instance: demo-qa-inbound" ^
  -H "x-webhook-token: demo_webhook_token_change_me" ^
  -d "{\"phone\":\"+5511999999001\",\"name\":\"QA\",\"message\":\"Olá\",\"external_message_id\":\"EXTID\"}"
```

**Segunda chamada (mesmo `external_message_id`):** corpo idêntico → resposta com `"duplicate":true`.

## 7. Auditoria (com JWT)

Obter token (`POST /auth/login` com `atendente@demo.local` / `admin12345` na massa QA), depois:

```bash
curl.exe -s -H "Authorization: Bearer <TOKEN>" -H "x-tenant-id: 00000000-0000-0000-0000-000000000001" ^
  "http://localhost:3000/api/v1/operational-audit-events?event_type=inbound_message_received&limit=5"
```

Repetir com `inbound_duplicate_ignored`, e após retry manual (se existir) `OUTBOX_MANUAL_RETRY`.

## 8. Reminder 24h e outbox

- Confirmar job pendente: `SELECT count(*) FROM notification_jobs WHERE job_type='reminder_24h' AND status='pending' AND appointment_id='<uuid>';`
- Idempotência outbox: `SELECT count(*) FROM message_outbox WHERE idempotency_key='reminder_24h:<uuid>';` — deve permanecer ≤1 após reprocessamentos.
- Logs API: `docker logs barbearia-api --tail 80` — procurar `whatsapp_inbound`, `[outbox-worker]`.

## 9. N8N

- Importar `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json`.
- Variáveis: URL da API, `x-webhook-instance`, token ou segredo HMAC conforme tenant.

## 10. Checklist PO

- [x] Workflow JSON versionado (`n8n/workflows/…`).
- [x] Payload de smoke e instrução de importação (secção 6–9).
- [x] Evidência de chamada webhook + deduplicação (script CT-P2-310/311 ou curl).
- [x] Auditoria consultável (CT-P2-314/315).
- [x] Lembrete 24h + idempotência + exclusão cancel/complete/no-show (CT-P2-320–324).
- [ ] **GATE P2.2.1:** PNGs reais em `docs/evidencias/gate0_p2_2_1/` (obrigatório para fecho formal P2.2.1).
