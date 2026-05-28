# Relatório Fábrica — PS-07.4 · GESTAO-500

**Data:** 2026-05-19  
**Papéis:** Tech Lead · Backend · QA · PO  
**Card:** PS-07.4 — correção dashboard gestão + funções relacionadas

---

## 1. Sintoma

| ID | Evidência | Sintoma |
|----|-----------|---------|
| P07_04 / C19 | `prints/P07_04_dashboard_gestao.png` | UI `/gestao/dashboard` — "Erro ao carregar dashboard" |
| API | `GET /api/v1/management/dashboard` | **HTTP 500** |

---

## 2. Causa raiz

**Desalinhamento SQL ↔ schema `operational_audit_events` (migration 103).**

O serviço de gestão (`loadRecentErrors`) e o Cliente 360 (`getCustomerOverview`) consultavam colunas **`action`** e **`entity`**, que não existem. O schema real usa:

| Coluna real | Uso incorreto no código |
|-------------|-------------------------|
| `event_type` | `action` |
| `entity_type` | `entity` |

**Log API:** `column "action" does not exist` → `loadRecentErrors` em `management/service.ts`.

**Débitos adicionais (Cliente 360 / P07_03):** `customers/overview.ts` tinha várias queries desalinhadas ao schema (`correlation_id` em appointments, `template_key`/`appointment_id` em outbox, cast `metadata->>'customer_id'`, `active` vs `is_active` em veículos).

---

## 3. Correção aplicada

### 3.1 `apps/api/src/modules/management/service.ts`

- `loadRecentErrors`: `event_type AS action`, `entity_type AS entity`, filtros em `event_type`.

### 3.2 `apps/api/src/modules/customers/overview.ts`

- Audit: mesmo mapeamento `event_type` / `entity_type`; filtro `entity_type = 'customer'`.
- Appointments: removido `a.correlation_id` inexistente.
- Outbox: `template_key` / `appointment_id` extraídos de `payload`.
- Audit filter: `metadata->>'customer_id' = $2::text`.
- Veículos: `is_active AS active`.

### 3.3 Testes

- Novo: `management.dashboard.integration.test.ts` (valida payload + `recent_operational_errors`).
- Existentes: `management.service.test.ts`, `management.rbac.test.ts`, `management.schemas.test.ts` — **5/5 OK**.

---

## 4. Validação pós-deploy (API Docker rebuild)

| Endpoint | Antes | Depois |
|----------|-------|--------|
| `GET /api/v1/management/dashboard` | 500 | **200** |
| `GET /api/v1/management/dashboard/export.csv` | 500 | **200** |
| `GET /api/v1/customers/{id}/overview` | 500 | **200** (após fixes audit + appointments + outbox) |

**Comando QA:**

```powershell
.\scripts\revalidate-f08-gap01.ps1   # opcional — RBAC inalterado
# Login admin + GET dashboard com from/to ISO (ver qa-api-helpers.ps1)
```

**UI:** recarregar `http://localhost:5173/gestao/dashboard` ou `http://localhost:3001/gestao/dashboard` e capturar novo **P07_04**.

---

## 5. Funções relacionadas testadas

| Área | Ligação | Resultado |
|------|---------|-----------|
| Dashboard KPIs / rankings | `loadKpis`, `loadTopServices`, `loadTopProfessionals` | OK (200) |
| Outbox summary | `getMessageOutboxStatusSummary` | OK |
| Export CSV | `managementDashboardToCsv` | OK (200) |
| RBAC gestão | `management.rbac.test.ts` | OK |
| Cliente 360 overview | `getCustomerOverview` | Corrigido |
| Auditoria operacional (list) | `audit/service.ts` | Já usava colunas corretas — sem alteração |

---

## 6. Recomendação PO

| Decisão | Status |
|---------|--------|
| GESTAO-500 | **Fechado** (correção em código + API 200) |
| P07_04 | **Reexecutar print** para fechar evidência browser |
| P07_03 Cliente 360 | **Desbloqueado** para QA |
| Aceite PS-07.3 | Avançar após prints P07_04, P07_03, P07_11–13, P07_18 |

**Próximo card sugerido:** fecho prints PS-07.3 + n8n P07_16 (ambiente já Up).

---

## 7. Risco residual

- Massa demo com poucos `appointment_financials` → KPIs zerados (comportamento esperado, não bug).
- `docker compose up -d --build api` necessário em cada ambiente após merge.

---

*Relatório gerado pela fábrica — Piloto Staging 07.*
