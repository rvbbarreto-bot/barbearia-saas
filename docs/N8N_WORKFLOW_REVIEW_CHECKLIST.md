# Checklist de PR — workflows n8n (Barbearia SaaS)

Baseline: documento V4 em `docs/`; Core API como fonte de verdade para regras sensíveis; n8n apenas como orquestrador.

**Como usar:** cada PR que altere ou adicione ficheiros em `n8n/workflows/*.json` deve preencher este checklist e anexar evidência (diff, capturas ou logs de smoke).

---

## Verificações obrigatórias

| # | Pergunta | Responsável | Evidência (link/seção PR) |
|---|----------|-------------|---------------------------|
| 1 | O workflow está versionado em `n8n/workflows/` com nome estável? | DevOps / autor PR | |
| 2 | Backend ou arquitetura revisou o fluxo (HTTP, BD, tenant)? | Eng. backend / arquiteto | |
| 3 | O workflow chama **apenas** endpoints autorizados para esse caso de uso (lista no relatório de governança)? | Backend | |
| 4 | Não há nó Postgres (nem SQL raw) contra o **banco da barbearia** em produção? | DBA / backend | |
| 5 | Disponibilidade de slots **não** é calculada em Code/Switch — apenas consumida da API (`GET /api/v1/availability` ou fluxo equivalente documentado)? | Backend | |
| 6 | Criação/remarcação/cancelamento/confirmação de agenda **não** ocorre por SQL direto — apenas `PATCH`/`POST` nas rotas `/api/v1/appointments/...`? | Backend | |
| 7 | Envio WhatsApp não usa `EVOLUTION_API_URL` direto no workflow salvo (deve passar por API/outbox ou endpoint explicitamente aprovado pelo PO)? | Segurança | |
| 8 | `tenant_id` **não** é lido do corpo do cliente como fonte de verdade (usa JWT/`x-tenant-id` coerente com utilizador de serviço ou webhook resolve tenant)? | Segurança | |
| 9 | Marketing/recall/lembrete respeitam opt-out e finalidades apenas através de contratos da API (sem “enviar sempre”)? | LGPD / backend | |
| 10 | Não há strings de segredo, API keys, tokens ou passwords fixos no JSON do workflow? | Segurança | |
| 11 | Credenciais referem apenas placeholders/env (`$env.*`) ou credenciais n8n armazenadas de forma segura? | DevOps | |
| 12 | Existem logs mínimos em falhas (sem vazar token/corpo completo com segredos)? | QA | |
| 13 | Erros têm ramo de fallback/handoff (sem loop infinito para Evolution)? | QA | |
| 14 | Contrato JSON dos bodies está documentado (README workflow ou doc em `docs/`)? | PO técnico | |
| 15 | Existe smoke manual ou automático registado (execução n8n ou chamadas curl documentadas)? | QA | |
| 16 | Mudança foi aprovada pelo PO ou está dentro do card autorizado? | PO | |

---

## Referências

- Relatório de auditoria: `docs/N8N_GOVERNANCE_AUDIT_REPORT.md`
- Router V4 (Markdown): `n8n/workflows/01_whatsapp_router_v4.md`

---

## Histórico

| Data | Notas |
|------|--------|
| 2026-05-02 | Checklist criado no âmbito do pacote Governança n8n (auditoria estática). |
