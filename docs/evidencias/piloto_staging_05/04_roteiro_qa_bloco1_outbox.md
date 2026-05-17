# Roteiro QA — PILOTO-05 Bloco 1 (Outbox operacional)

**URL Web:** `http://localhost:3001/operacao/mensagens` (Docker) ou `http://localhost:5173/operacao/mensagens` (Vite dev)

**Perfis:**

| Perfil | Login sugerido (seed demo) | Tenant header |
|--------|---------------------------|---------------|
| Manager | `admin@demo.local` / senha do seed demo | `x-tenant-id` do tenant demo |
| Atendente | criar via API ou seed | mesmo tenant |
| Viewer | se existir no tenant | mesmo tenant |

## Pré-requisitos

1. API + Web + Postgres a correr (`docker compose up`).
2. Migrations aplicadas; seed `099` / demo com tenant.
3. Pelo menos 1 linha `message_outbox` em `failed` ou `dead` com `last_error` (inserir via worker simulado ou SQL de teste).

## Casos

| ID | Passo | Esperado |
|----|-------|----------|
| B1-01 | Login manager → abrir Mensagens | Lista carrega; filtros visíveis |
| B1-02 | Filtro status = `failed` | Só mensagens failed |
| B1-03 | Filtro `customer_id` (UUID válido) | Lista filtrada |
| B1-04 | Filtro classe erro = `auth` | Mensagens com erro 401/unauthorized |
| B1-05 | Abrir detalhe | Sem token/chave em claro; `error_class` visível |
| B1-06 | Manager: botão **Tentar novamente** em failed/dead | Confirmação; status volta pending |
| B1-07 | Atendente: mesmo detalhe | **Sem** botão retry |
| B1-08 | Filtros que não retornam dados | Empty state «Sem mensagens» |
| B1-09 | Parar API e recarregar | Banner de erro |
| B1-10 | API: listar outbox tenant A; não ver dados tenant B | Cross-tenant (ver `05_evidencia_cross_tenant_outbox.md`) |

## Prints obrigatórios

Ver `prints/README.md` e `10_relatorio_bloco1_outbox.md`.
