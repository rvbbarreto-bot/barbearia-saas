# Relatório P1 — Consolidação inbound / outbox / tenant / appointments (2026-05-14)

## 1. Resumo executivo

Consolidação pós-QA negativo: **resolução de tenant (CT-020)**, **criação administrativa** com `explicit_confirmation: false` **(CT-073 / CT-073-B)**, **deduplicação inbound (CT-093)**, **idempotência de enqueue outbound (CT-100)**, **simulação de falha de provider (CT-101)** (`OUTBOX_FORCE_SEND_FAILURE`), testes automatizados, script QA, OpenAPI, README e decisão CT-073.

**Validação de stack Docker local:** executada nesta data (ver secção 9). Script `qa-api-negative-battery.ps1` com **exit code 0**. Evidências anexas em ficheiros sob `docs/P1_EVIDENCIA_*`.

## 2. Branch e commit

- **Branch:** `feature/p1-inbound-outbox-hardening`
- **Commit do pacote de evidência (script + CSV + relatório + logs + docker ps):** `2261c73bde4f92ac1e939963b9faf89e978d9836` — mensagem: `chore(p1): stack validation evidence, QA script fixes, CSV and report update`
- **HEAD da branch:** executar `git rev-parse HEAD` após checkout (inclui commits de documentação posteriores ao pacote acima).

## 3. Hierarquia de papéis (ressalva PO 1)

Fonte canónica: `apps/api/src/middlewares/rbac.ts` (`roleLevel` e `hasRequiredRole`).

| Papel | Nível | Notas |
|--------|------|--------|
| `viewer` | 10 | Leitura mínima. |
| `attendant` | 20 | Balcão / operações base. |
| `professional` | 30 | Profissional de serviço. |
| `manager` | 40 | Gestão operacional. |
| `tenant_admin` | 50 | Administração do tenant. |
| `tenant_owner` | 60 | Dono do tenant (≥ `tenant_admin` para efeitos de `hasRequiredRole(_, 'tenant_admin')`). |
| `platform_admin` | 100 | Plataforma (fora do contexto tenant normal). |

`tenant_owner` e `tenant_admin` estão **acima** de `attendant` e `professional` na hierarquia numérica.

## 4. `explicit_confirmation: false` (ressalva PO 2)

- **Não** representa confirmação explícita do cliente (WhatsApp, link, assinatura, etc.).
- Representa **criação administrativa** (ou **walk-in** operado por balcão), com regra centralizada em `apps/api/src/modules/appointments/explicit-confirmation-policy.ts` e documentação em `docs/DECISAO_PRODUTO_CT073_EXPLICIT_CONFIRMATION.md`, README e OpenAPI.

## 5. Estados da fila `message_outbox` (ressalva PO 3)

Nomes reais no schema/código: `pending`, `processing`, `sent`, `dead`.

| Estado | Significado operacional |
|--------|-------------------------|
| `pending` | Na fila ou **à espera de retry**; quando há falha recuperável, `last_error` é preenchido e `next_retry_at` agenda nova tentativa — **equivalente a “retry pendente”**. |
| `processing` | Em tratamento pelo worker (com recovery se o processo morrer). |
| `sent` | Envio concluído com sucesso ao provider. |
| `dead` | **Falha final** após esgotar `max_attempts` (ou erro permanente de validação, ex. metadata incompleto). |

## 6. Seed `099_demo_seed_qa.sql` (ressalva PO 4)

- Ficheiro idempotente: `ON CONFLICT` / `DO UPDATE` onde aplicável; seguro para **reexecução** em ambiente QA/demo.
- **Contexto:** tenant fixo `00000000-0000-0000-0000-000000000001`, utilizadores e massa demo; **não** substitui políticas de produção.
- **Nota operacional:** em volume Postgres **já inicializado** antes da existência deste ficheiro, o `docker-entrypoint-initdb.d` **não** volta a correr; para validação local foi aplicado manualmente com `psql` em pipe (comando registado na secção 9). Em **novo** volume Docker, o ficheiro é aplicado no primeiro boot com o resto das migrations.

## 7. Collection Postman (ressalva PO 5)

- **Versionada no repositório:** `QA_PACKAGE_BARBEARIA/02_API_ENDPOINTS/QA_NEGATIVOS_RESSALVAS.postman_collection.json` (pasta complementar; não altera a collection base sem versionamento explícito).

## 8. Débito técnico — reprocessamento outbox (ressalva PO 6)

- **Ausência** de endpoint dedicado para reprocessamento operacional de linhas `message_outbox` (ex.: retry manual por ID).
- Mitigação actual: idempotência por `idempotency_key` no `POST /api/v1/integrations/outbound/whatsapp-text` (CT-100) e worker com retry exponencial.

## 9. Validação Docker local — evidência (pedido PO)

**Data / hora (aprox.):** 2026-05-14 (execução local da fábrica).

### 9.1 `docker compose ps`

Ficheiro: `docs/P1_EVIDENCIA_DOCKER_COMPOSE_PS_2026-05-14.txt`  
Serviços com **(healthy)** na execução registada: `postgres`, `redis`, `api`, `web`, `n8n`.

### 9.2 Health

- `GET http://localhost:3000/health` → **200** `{"status":"ok"}`
- `GET http://localhost:3000/database/health` → **200** `{"status":"ok","database":"connected"}`

### 9.3 Migrations / seed 099

- Integração WhatsApp demo: `tenant_integrations` com `config->>'instance_name' = 'demo-qa-inbound'` confirmada em SQL após aplicar `099_demo_seed_qa.sql` ao Postgres do compose (volume existente).

Comando usado (ajustar utilizador/base ao `.env` local; exemplo com utilizador `barbearia_test`):

```powershell
Get-Content -Raw database/migrations/099_demo_seed_qa.sql |
  docker exec -i barbearia-postgres psql -U barbearia_test -d barbearia_saas -v ON_ERROR_STOP=1
```

### 9.4 Script QA

- Comando: `.\scripts\qa-api-negative-battery.ps1 -BaseUrl http://localhost:3000`
- **Exit code: 0**
- **CSV:** `docs/QA_API_NEGATIVE_BATTERY_RESULTS.csv` (gerado pelo script na mesma execução)

### 9.5 Cenários CT (resumo de veredicto na última execução)

| CT | Veredicto | Obtido (HTTP) | Nota |
|----|-----------|---------------|------|
| CT-020 | OK | 200 | `GET /services` sem `x-tenant-id`, JWT com `tenant_id` |
| CT-073 | OK | 201 | `explicit_confirmation: false` com `tenant_owner` |
| CT-073-B | OK | 403 | `explicit_confirmation: false` com `atendente@demo.local` (**executar antes** do CT-073 no script para não colidir slot) |
| CT-093 | OK | 200 | Segundo POST inbound com mesmo `external_message_id` → `duplicate: true` |
| CT-100 | OK | 202 + 200 | Segundo POST outbound com mesma `idempotency_key` → `duplicate: true` |
| CT-101 | OK | 202 | Enqueue preserva mensagem; falha simulada: testes `outbox.integration` + env `OUTBOX_FORCE_SEND_FAILURE` |

### 9.6 Logs API / worker

- Worker de outbox corre **no mesmo processo** da API (`outbox-worker` embutido).
- Ficheiro: `docs/P1_EVIDENCIA_API_LOGS_TAIL_2026-05-14.txt` (últimas linhas JSON após a bateria).

### 9.7 Imagem Docker da API

- Foi executado `docker compose build api` + `docker compose up -d api` para alinhar o contentor ao código P1 (incl. respostas **202/200** do CT-100).

## 10. Git — estado final

### `git log -1`

Executar na raiz do repositório (com a branch actual):

```bash
git log -1 --format=fuller
```

### `git status`

```bash
git status
```

**Última verificação local:** working tree **limpo** para ficheiros rastreados; apenas **não rastreados** `.env.backup_qa` e `QA_PACKAGE_BARBEARIA.zip` (fora do repositório por decisão de segurança).

## 11. Recomendação da fábrica

**Pronto para reavaliação do PO como fechamento P1** após revisão deste relatório e dos anexos — sujeito apenas à política interna de não considerar isto homologação final de produção.

## 12. Próximos passos

- Decisão de nomenclatura `dead` vs `failed` / `retry_pending` (opcional refactor de schema).
- Endpoint opcional de reprocessamento operacional de outbox (débito técnico).
