# Relatório Bloco 1 — Outbox operacional (PILOTO-05)

**Branch:** `feature/piloto-staging-05-operacao-gestao-automacao`  
**Base:** `piloto-staging-01` @ `e6527e6`  
**Rebase PR #6:** **PEND** — `piloto-staging-01` ainda sem merge #6; rebase após merge.

## Entregue neste bloco

| Item | Status |
|------|--------|
| Filtros status, período, provider, correlation, appointment, destination, **customer_id**, **error_class** | OK |
| Detalhe sanitizado + `error_class` | OK |
| Retry manual manager+ + auditoria | OK |
| OpenAPI atualizado | OK |
| Testes API unit + RBAC routes + cross-tenant integration | OK |
| Testes Web render/empty/error + filtros + RBAC model | OK |
| Roteiro QA | OK — `04_roteiro_qa_bloco1_outbox.md` |
| Prints Web PNG | OK — `prints/P01`–`P09` |
| PR + CI verde | **PEND** — `P10`; criar PR (`11_pr_piloto05.md`) + `gh auth login` |

## Testes (local)

Ver `04_testes_locais_bloco1.txt` — API outbox unit 17/17; Web outbox 14/14 (2026-05-17).

**Ambiente prints:** Vite dev `http://127.0.0.1:5173` (branch P05) + API Docker `http://127.0.0.1:3000`.

## Prints (matriz PO)

| ID | Ficheiro | Data/hora (local) | Perfil | URL | Esperado | Obtido | Status |
|----|----------|-------------------|--------|-----|----------|--------|--------|
| P01 | `prints/P01_listagem_outbox.png` | 2026-05-17 ~11:45 | admin@demo.local (tenant_owner) | http://127.0.0.1:5173/operacao/mensagens | Lista com filtros incl. Classe erro | Lista 50 msgs, colunas visíveis | OK |
| P02 | `prints/P02_filtro_status_failed.png` | 2026-05-17 ~11:46 | admin@demo.local | idem | Filtro estado failed | Combobox `failed`, lista filtrada/vazia | OK |
| P03 | `prints/P03_filtro_customer_id.png` | 2026-05-17 ~11:46 | admin@demo.local | idem | Filtro customer_id | UUID `...4031` aplicado | OK |
| P04 | `prints/P04_filtro_error_class_auth.png` | 2026-05-17 ~11:47 | admin@demo.local | idem | Classe Autenticação | Combobox `Autenticação` | OK |
| P05 | `prints/P05_detalhe_sanitizado.png` | 2026-05-17 ~11:54 | atendente@demo.local | modal detalhe | Erro sem tokens; destino mascarado | `****0001`, diagnóstico HTTP 404 Evolution | OK |
| P06 | `prints/P06_retry_manager.png` | 2026-05-17 ~11:52 | admin@demo.local | modal dead | Botão «Tentar novamente» | Botão visível (manager+) | OK |
| P07 | `prints/P07_retry_ausente_attendant.png` | 2026-05-17 ~11:54 | atendente@demo.local | modal dead | Sem botão retry | «Tentar novamente» ausente | OK |
| P08 | `prints/P08_estado_vazio.png` | 2026-05-17 ~11:55 | atendente@demo.local | filtros failed+auth | Empty state | «Sem mensagens» + hint filtros | OK |
| P09 | `prints/P09_estado_erro.png` | 2026-05-17 ~11:56 | atendente@demo.local | API parada | Banner erro | «Erro ao carregar mensagens» (docker stop api) | OK |
| P10 | `prints/P10_pr_ci_verde.png` | — | — | GitHub PR | Checks verdes | PR a abrir; capturar após CI | PEND |

## Evidências API (sem print)

| Evidência | Ficheiro | Status |
|-----------|----------|--------|
| Retry RBAC | `05_evidencia_retry_rbac_api.md` | OK |
| Cross-tenant | `05_evidencia_cross_tenant_outbox.md` | OK |

## Parecer fábrica

| Pergunta | Resposta |
|----------|----------|
| Bloco 1 código + testes | **Pronto** |
| Bloco 1 aceite PO | **PEND** P10 (PR + CI screenshot) |
| Merge | **Bloqueado** até PO + CI |
| Iniciar Bloco 2 | **Não** até aceite Bloco 1 |
