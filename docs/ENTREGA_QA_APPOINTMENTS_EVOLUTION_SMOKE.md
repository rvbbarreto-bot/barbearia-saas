# Relatório técnico — massa QA Appointments + Postman + Evolution Smoke

**Data:** 2026-05-13  
**Status fábrica:** **APTO PARA QA** (continuidade homologação — workflows 02B, 03A Appointments, 03 Evolution Smoke)

---

## 1. Resumo executivo

| Item | Detalhe |
|------|---------|
| **Problema** | `POST /api/v1/appointments` → **404** `SERVICE_NOT_BOOKABLE` |
| **Causa** | Seed `099` incompleto: **sem** `professional_services`, **sem** clientes; QA usava IDs de listagem **sem vínculo** profissional↔serviço |
| **Correção** | Opção **A** — seed/migrations `099` (completo), `101` (backfill), `102` (UUID clientes Zod) |
| **Postman** | Collection/environment atualizados com scripts `[02B]`, `[03A]`, negativos e IDs `qa_*` |
| **Evolution** | Workflow `03_QA_Barbearia_Evolution_SendText_Smoke.json` + doc QA |
| **Evidência** | `POST /api/v1/appointments` → **201** após migrations |

---

## 2. Causa raiz

1. **`loadBookableService`** exige linha em `professional_services` + serviço ativo (`booking-rules.ts`).
2. **`099_demo_seed_qa.sql` antigo** criava tenant, users, services e professionals, mas **não** populava `professional_services`, `customers` nem `business_hours`.
3. QA montava payload com `professional_id` e `service_id` retornados por GET separados — **combinação inválida** → `SERVICE_NOT_BOOKABLE` (regra correta, massa incorreta).
4. **`GET /api/v1/professionals`** já expõe `service_ids` — após seed, QA deve usar par **compatível** (Postman passa a validar e preencher automaticamente).

---

## 3. Arquivos alterados

| Arquivo | Finalidade |
|---------|------------|
| `database/migrations/099_demo_seed_qa.sql` | Massa completa: UUIDs fixos RFC, `professional_services`, clientes, `business_hours`, atendente |
| `database/migrations/101_qa_bookable_mass_backfill.sql` | Backfill em bases existentes |
| `database/migrations/102_qa_customer_uuid_fix.sql` | Clientes QA com UUID válido para Zod |
| `QA_PACKAGE_BARBEARIA/02_API_ENDPOINTS/barbearia-api.postman_collection.json` | Workflows 02B/03A, auto-IDs, testes create/confirm/reschedule/cancel, negativos |
| `QA_PACKAGE_BARBEARIA/02_API_ENDPOINTS/barbearia-api.environment.json` | IDs `qa_*`, datas 2026-05-14, Evolution vars |
| `QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS/MASSA_DE_DADOS.md` | Payload documentado + vínculos |
| `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` | Smoke SendText manual |
| `QA_PACKAGE_BARBEARIA/03_N8N_WORKFLOWS/EVOLUTION_SENDTEXT_SMOKE.md` | Cenários Evolution obrigatórios |

---

## 4. Massa de dados QA (banco limpo após `docker compose down -v`)

| Entidade | UUID |
|----------|------|
| Tenant | `00000000-0000-0000-0000-000000000001` |
| Profissional Fred | `00000000-0000-4000-8000-000000004011` |
| Serviço Corte masculino | `00000000-0000-4000-8000-000000004021` |
| Cliente QA A | `00000000-0000-4000-8000-000000004031` |
| Vínculo | Todos profissionais × todos serviços ativos em `professional_services` |

**Payload sugerido:**

```json
{
  "customer_id": "00000000-0000-4000-8000-000000004031",
  "professional_id": "<id de GET /professionals com service_ids não vazio>",
  "service_id": "<um id de service_ids do profissional>",
  "starts_at": "2026-05-14T13:00:00.000Z",
  "ends_at": "2026-05-14T13:30:00.000Z",
  "idempotency_key": "qa-appointment-001",
  "explicit_confirmation": true,
  "source": "manual"
}
```

**Bases já existentes (sem reset):** executar `101` e `102` via `migrate.sh` ou `docker exec … psql`.

---

## 5. Postman — workflows

| Workflow | Ordem Collection Runner |
|----------|-------------------------|
| **02B** | Health → Login → Catalogo (3 GET) → GET appointments |
| **03A** | Login → Catalogo → POST create → GET :id → confirm → reschedule → cancel |
| **03A Negativos** | payload 400, SERVICE_NOT_BOOKABLE 404, idempotência 409 |

Reimportar:

- `QA_PACKAGE_BARBEARIA/02_API_ENDPOINTS/barbearia-api.postman_collection.json`
- `QA_PACKAGE_BARBEARIA/02_API_ENDPOINTS/barbearia-api.environment.json`

---

## 6. Evolution SendText Smoke

- Importar `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` (**inactive**).
- Variáveis: `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`, `QA_WHATSAPP_NUMBER`.
- Detalhes: `QA_PACKAGE_BARBEARIA/03_N8N_WORKFLOWS/EVOLUTION_SENDTEXT_SMOKE.md`.
- **Nota:** envio real depende de instância Evolution externa conectada; fábrica validou estrutura do workflow e validação de variáveis (cenários 4 e 6 sem Evolution real).

---

## 7. Testes executados

| Comando | Resultado |
|---------|-----------|
| `npm run test:unit` | **130/130** OK |
| `npm run typecheck` | OK |
| Migration `101` + `102` em Postgres Docker | OK |
| `POST /api/v1/appointments` (smoke local) | **201** |

---

## 8. Instruções QA

```powershell
docker compose down -v
docker compose up -d --build
docker compose ps   # todos healthy
```

Reimportar Postman → Runner **02B** → Runner **03A** (pasta Appointments) → negativos → Evolution smoke no n8n.

---

## 9. Parecer

**APTO PARA QA** — `SERVICE_NOT_BOOKABLE` permanece para combinações realmente inválidas; massa mínima e Postman alinhados. Workflow **02B** não alterado na API (apenas seed + collection).
