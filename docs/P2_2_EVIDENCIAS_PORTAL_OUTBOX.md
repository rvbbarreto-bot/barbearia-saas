# P2.2.1 — Evidências portal / outbox

## O que registar (PO)

- Branch e `git rev-parse HEAD` após merge.
- `docker compose ps` (serviços healthy).
- `curl.exe` em `/health` e `/database/health`.
- `npm run db:migrate:dry-run` (nota: volume initdb sem `_migrations` → listar pendentes; não migrar às cegas).
- `npm run test:unit` na API; `npm run typecheck` e `npm run test` no Web.
- Execução de `.\scripts\qa-p2-2-web-outbox-whatsapp-battery.ps1` (exit 0) e CSV `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`.
- Capturas: **Agenda operacional** (vista dia/semana, bloqueio), **Mensagens / Outbox** (lista + detalhe + retry gestor), toast de erro amigável (`getApiErrorMessage`).

## Funcional entregue (resumo)

- API: `GET /api/v1/outbox/messages`, `GET /api/v1/outbox/messages/:id`, `POST .../retry` (failed/dead apenas).
- RBAC: leitura `attendant+`; retry `manager+`.
- Portal: `/operacao/mensagens`, agenda com vista semanal e bloqueios para `attendant+` alinhado à API.

*(Preencher datas e anexos de captura na revisão final PO/QA.)*

## GATE 0 — Execução real (Docker, 2026-05-15)

**Comando:** `.\scripts\qa-p2-2-web-outbox-whatsapp-battery.ps1 -ApiBase http://localhost:3000`  
**Resultado:** exit **0**; CSV `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv` — **CT-P2-201 … CT-P2-220** todos **PASS** (219/220 = regressões `qa-api-negative-battery.ps1` e `qa-api-p2-operational-battery.ps1`).

### Matriz CT-P2-201 … CT-P2-220 (PO, sem colisões)

| ID | Descrição resumida |
|----|--------------------|
| CT-P2-201 | `GET /health` |
| CT-P2-202 | `GET /database/health` |
| CT-P2-203 | Auth negativo (appointments sem token) |
| CT-P2-204 | Tenant mismatch (appointments) |
| CT-P2-205 | Outbox list tenant válido |
| CT-P2-206 | Outbox sem token |
| CT-P2-207 | Outbox tenant header UUID nil → 403 |
| CT-P2-208 | Outbox cross-tenant |
| CT-P2-209 | Sanitização (sem vazamento de segredos no JSON) |
| CT-P2-215 | Time-block create |
| CT-P2-216 | Availability diminui após bloqueio |
| CT-P2-217 | Create em slot bloqueado → 409 |
| CT-P2-218 | Time-block delete |
| CT-P2-210 | Appointment create + confirm |
| CT-P2-212 | Reschedule |
| CT-P2-211 | Cancel |
| CT-P2-213 | Walk-in + check-in + start + complete |
| CT-P2-214 | No-show |
| CT-P2-219 | Regressão P1 |
| CT-P2-220 | Regressão P2.1 |

### Evidências visuais (portal)

Índice de ficheiros: `docs/evidencias/gate0_p2_2_1/README.md`. Anexar PNG antes do fecho formal PO (Agenda, Outbox, retry, RBAC, erros).

### `curl.exe` (health)

```text
curl.exe -s -w "\nHTTP_CODE:%{http_code}\n" http://localhost:3000/health
curl.exe -s -w "\nHTTP_CODE:%{http_code}\n" http://localhost:3000/database/health
```

**Notas técnicas (script):**

- **Windows PowerShell 5.1:** `Invoke-WebRequest` com corpo JSON em texto default pode corromper **UTF-8** (acentos em `reason` de reschedule/no-show) → `JSON.parse` na API falha e devolve **400** com payload vazio no cliente. O script envia `Body` como **bytes UTF-8** e `Content-Type: application/json; charset=utf-8` quando `PSVersion.Major -lt 6`.
- **`Format-ApiInstant`:** slots devolvidos por `ConvertFrom-Json` como `[datetime]` devem ser serializados em **ISO UTC** (`…Z`) para satisfazer `z.string().datetime()` na API.

### `git log -1 --oneline`

```
d240a43 feat(p2.2.1): outbox detail/retry, RBAC attendant, agenda week, api errors, QA P2.2
```

### `git rev-parse HEAD`

```
d240a43cf903865b0756b820d6dddb0a80557286
```

### `git status -sb` (colar saída actual no fecho; exemplo após QA)

```
## feature/p2-2-web-outbox-whatsapp-operational
 M docs/QA_API_NEGATIVE_BATTERY_RESULTS.csv
 M docs/QA_API_P2_OPERATIONAL_RESULTS.csv
 M scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1
?? docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv
```

### `docker compose ps`

```
NAME                 IMAGE                COMMAND                  SERVICE    CREATED         STATUS                   PORTS
barbearia-api        barbearia-saas-api   "docker-entrypoint.s…"   api        5 minutes ago   Up 5 minutes (healthy)   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
barbearia-n8n        n8nio/n8n:1.91.3     "tini -- /docker-ent…"   n8n        24 hours ago    Up 3 hours (healthy)     0.0.0.0:5679->5678/tcp, [::]:5679->5678/tcp
barbearia-postgres   postgres:16-alpine   "docker-entrypoint.s…"   postgres   24 hours ago    Up 3 hours (healthy)     0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
barbearia-redis      redis:7-alpine       "docker-entrypoint.s…"   redis      24 hours ago    Up 3 hours (healthy)     0.0.0.0:6380->6379/tcp, [::]:6380->6379/tcp
barbearia-web        barbearia-saas-web   "/docker-entrypoint.…"   web        24 hours ago    Up 14 hours (healthy)    0.0.0.0:3001->80/tcp, [::]:3001->80/tcp
```

### `GET /health` e `GET /database/health` (HTTP 200)

```json
{"status":"ok"}
```

```json
{"status":"ok","database":"connected"}
```

### `npm run db:migrate:dry-run` (trecho)

Saída típica do `migrate-docker.mjs --dry-run`: lista ficheiros em modo DRY e resumo final (`29 pendentes…` / `_migrations` conforme o volume). Interpretação: ver `README.md` e `docs/P2_RUNBOOK_SUPORTE.md` — não aplicar migrações às cegas se o volume tiver esquema sem registo em `_migrations`.

### Logs API / worker outbox

O **outbox worker** corre no mesmo processo Node do serviço **`api`**; no `docker logs barbearia-api` aparecem linhas `[outbox-worker] failed (retry agendado)` com `fetch failed` quando o Evolution não está acessível (esperado em QA local sem bridge real).

```
[outbox-worker] failed (retry agendado) {
  outbox_id: '…',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  correlation_id: '…',
  attempts: 0,
  provider: 'evolution',
  error: 'fetch failed',
  next_retry_in_ms: 120000
}
```
