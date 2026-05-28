# Relatório QA Sênior — Browser doc 10

**Executado:** 2026-05-26T23:13:19.509Z  
**Base:** http://localhost:3001  
**Autorização:** Lead tech — navegação web automatizada (Playwright)

## Sumário

| Status | Qtd |
|--------|-----|
| OK | 14 |
| FAIL | 1 |
| PEND | 3 |
| BLOCKED | 1 |

## Resultados por cenário

| Cenário | Status | Nota | Evidência |
|---------|--------|------|-----------|
| C19 Dashboard gerencial | OK | — | prints/P07_04_dashboard_gestao.png |
| C20 Export CSV | OK | botão visível | — |
| C2 Atendente forbidden gestão | OK | http://localhost:3001/forbidden | prints/P07_18_forbidden.png |
| C21 Cliente 360 | OK | http://localhost:3001/clientes/00000000-0000-4000-8000-000000004032/360 | prints/P07_03_cliente_360.png |
| C22 Financeiro | OK | — | prints/P07_11_financeiro.png |
| C23 Comissões (admin) | OK | — | prints/P07_12_comissao.png |
| C23 RBAC atendente comissões | OK | http://localhost:3001/forbidden | — |
| C24 Lista espera — criar | OK | — | prints/P07_13_waitlist.png |
| C9 Veículo sem placa | OK | Salvar disabled=true | — |
| C9/C10 Veículos | FAIL | locator.waitFor: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('[data-sonner-toaster]') to be visible
    10 × locator resolved to hidden <ol dir="ltr" tabindex="-1" data-y-position="top" data-x-position="right" data-sonner-theme="light" data-sonner-toaster="true">…</ol>
 | — |
| C12 Sem veículo no wizard | OK | Próximo bloqueado sem veículo | — |
| C18 Sem atalho Pronto em Agendados | OK | count=0 | — |
| C15–C16 Pátio FSM | OK | 4 transições em 2026-06-16 | prints/P07_07b_patio_fsm_doc10.png |
| C26 Retry outbox | PEND | sem botão retry | — |
| C27 Retry bloqueado atendente | OK | — | — |
| C30 Portal token válido | PEND | — | prints/P07_14_portal_token_valido.png |
| C33 Token inválido | OK | — | prints/P07_15_portal_token_invalido.png |
| C34 n8n UI | PEND | UI acessível — import manual workflows | prints/P07_16_n8n_workflows_importados.png |
| C35/C36 Evolution smoke | BLOCKED | Evolution :8081 não automatizado | — |
| C37/C38 Cross-tenant | N/A | Somente QA pleno | — |
| P07_19 CI GitHub | N/A | Fora do browser local | — |

## Orientação ao QA júnior

1. Reproduzir manualmente cenários **PEND** (massa outbox failed, pátio sem jobs na data).
2. **C20:** validar download do CSV após clique em Exportar (conteúdo com `gross_revenue_cents`).
3. **C31/C32:** portal confirmar/cancelar — gerar novo token com QA pleno se expirado.
4. **C34:** importar 4 workflows n8n conforme roteiro §7.2 e atualizar print P07_16.
5. Atualizar matriz: `rodada3/07_resultados_browser.json` (já parcialmente atualizado por esta execução).

## Artefatos

- Prints: `docs/evidencias/piloto_staging_07/prints/`
- Matriz: `rodada3/07_resultados_browser.json`
