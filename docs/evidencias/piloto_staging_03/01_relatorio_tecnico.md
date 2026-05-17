# Relatório técnico — PILOTO-STAGING-03 (kickoff)

## Objetivo

Entregar evolução **funcional, operacional e testável**: QA via **n8n** (workflows importados e executados em ambiente controlado), **agenda** sem regressão, **outbox** com RBAC e erros classificados, **auditoria/rastreabilidade**, **painel Web de homologação**, e extensões de QA (waitlist, financeiro mínimo, comissão, consentimento, recall seguro) **com evidência** — volume sem teste ou workflow só documentado será reprovado pelo PO.

## Kickoff (estado inicial)

- **Branch:** `feature/piloto-staging-03-qa-operacional-n8n-ready` a partir de `piloto-staging-01` @ `f1955e0dd2d9e03df728970a43a0ce852eb2fafb` (hash no momento da criação da branch; atualizar no fecho da entrega).
- **CI:** `.github/workflows/ci.yml` atualizado com `push` na branch desta entrega; `pull_request` → `piloto-staging-01` já existente.
- **Incidente governança:** `00_governanca_incidente_pr2_merge_main.md`.

## Escopo obrigatório (checklist de implementação — a preencher ao longo do trabalho)

1. **n8n:** import real, variáveis `$env.*` / credenciais n8n, sem secrets em JSON, `active:false` nos exports, smoke `03_QA_…`, erros 401/404/timeout/ausência de variável evidenciados.
2. **Web:** painel QA/homologação (API, DB, outbox, Evolution, n8n, eventos, erros, filtros, fluxo Agenda → Outbox → Worker → Evolution).
3. **Agenda:** expansão sem regressão (criação, confirm, cancel, reschedule, bloqueio, conflito, histórico, escopo profissional, RBAC, cross-tenant, mensagens).
4. **Outbox:** listagem, detalhe sanitizado, retry manager+, attendant 403, classificação de erros, payload Evolution `{ number, text }`.
5. **Auditoria:** `correlation_id`, `request_id`, consultas, testes anti-vazamento.
6. **Features adicionais:** o máximo viável com qualidade (waitlist, financeiro mínimo, comissão, consentimento, recall seguro) + documentação de cenários E2E.

## Testes e segurança (obrigatório no fecho)

- API: typecheck, lint, unit, integration, RBAC, cross-tenant, agenda, outbox, sanitização.
- Web: lint, typecheck, tests, build, painel.
- n8n: `node scripts/n8n-validate-workflow-import.mjs`, `audit-n8n-workflows.ps1`, evidências de execução.
- Security: `npm audit --audit-level=high`, Gitleaks limpo.

## Riscos iniciais

- Divergência entre `main` e `piloto-staging-01` após incidente — mitigação: trabalhar só a partir de `piloto-staging-01`.
- Workflows com placeholders (`SUBSTITUIR_PELO_ID…`) — resolver por import ordem ou documentação operacional exacta.

*Atualizar este documento a cada marco relevante até submissão final.*
