# Relatório de fechamento — MVP / piloto (entrega UX + evidências)

**Data:** 2026-05-15  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`

---

## 1. Commits entregues

| Hash | Mensagem |
|------|----------|
| `e138de814d97868710a84f56110cf270d3b74659` | `fix(web): pt-BR UX, friendly outbox errors, and pilot acceptance docs` |

**Push:** não executado — repositório **sem remote `origin` configurado** (`git remote -v` vazio).  
**Ação necessária:** `git remote add origin <url>` + `git push -u origin feature/p2-2-web-outbox-whatsapp-operational`.

---

## 2. O que foi entregue no código

- Datas com `America/Sao_Paulo` + locale `pt-BR` (`utils.ts`).
- Acentos e `lang="pt-BR"`: Próximo, Configurações, gestão.
- Modal bloqueio: validação, hints de fuso, erros via `getApiErrorMessage`.
- Outbox: tabela enxuta, estados em português, erro amigável + diagnóstico técnico (`outboxErrorMessage.ts`).
- Teste unitário `outboxErrorMessage.test.ts`.
- Relatório técnico: `docs/RELATORIO_ENTREGA_MVP_PILOTO_ACEITE.md`.
- CSVs QA atualizados (baterias exit 0).

---

## 3. Pacote de evidências (`docs/evidencias/mvp_piloto_aceite/`)

| # | Artefato | Status | Notas |
|---|----------|--------|-------|
| 01 | `01_login_multitenant_admin.png` | Aprovado | Sessão admin (header X-Tenant-Id visível) |
| 02 | `02_login_multitenant_atendente.png` | Pendente | Browser MCP interrompido |
| 03 | `03_agenda_admin_com_botao_bloqueio.png` | Aprovado | Botão «Bloquear horário», «Próximo» |
| 04 | `04_agenda_atendente_sem_botao_bloqueio.png` | Pendente | — |
| 05 | `05_bloqueio_modal_campos_validos.png` | Aprovado | Confirmar desabilitado + hints |
| 06 | `06_bloqueio_criado_sucesso.png` | Aprovado | «1 bloqueio(s)» na agenda |
| 07 | `07_slot_bloqueado_erro_amigavel.png` | Pendente | API CT-115/217 OK; falta print portal |
| 08 | `08_agendamento_slot_livre_sucesso.png` | Pendente | API CT-114 OK |
| 09 | `09_outbox_lista_sem_scroll_critico.png` | Aprovado | Colunas Data/Estado/Destino; datas 15/05/2026 |
| 10 | `10_outbox_detalhe_sanitizado_admin.png` | Aprovado | Erro amigável + `TypeError: fetch failed` em diagnóstico |
| 11 | `11_outbox_retry_admin_antes.json` | Aprovado | API — status `failed`, attempts 2 |
| 12 | `12_outbox_retry_admin_depois.json` | Aprovado | API retry → `pending` |
| 13 | `13_outbox_retry_atendente_sem_botao.png` | Pendente | — |
| 14 | `14_rbac_api_retry_atendente_403.txt` | Aprovado | `POST .../retry` → **HTTP 403** |
| 15 | `15_cross_tenant_api_negado.txt` | Aprovado | List outbox com tenant B → **HTTP 403** |
| 16 | `16_health_api_ok.json` | Aprovado | `{"status":"ok"}` |
| 17 | `17_database_health_ok.json` | Aprovado | `database: connected` |
| 18 | `18_ci_verde.png` | Pendente | Sem `gh` / sem remote |
| 19 | `19_secret_scan_limpo.png` | Pendente | Executar no CI após push |

---

## 4. Validação técnica (resumo)

| Item | Resultado |
|------|-----------|
| Docker 5/5 healthy | OK |
| QA P2.1 / P2.2 / P2.3 / negativa | exit 0 |
| API unit tests | 152/152 |
| Web tests | 40/40 |
| Web/API build | OK |
| Migration 008 idempotente | OK (COMMIT ×2) |
| Retry admin (API) | OK (`pending`) |
| Retry atendente (API) | OK (403) |
| Cross-tenant (API) | OK (403) |

**Causa raiz `fetch failed`:** Evolution não configurado (`EVOLUTION_API_URL` placeholder); worker ativo; mensagens permanecem na fila com retry.

---

## 5. Parecer final da fábrica

| Pergunta | Resposta |
|----------|----------|
| Pronto para produção? | **Não** |
| Pronto para piloto controlado? | **Parcial** — falta configurar Evolution ou aceite formal de falha de provider; completar prints 02, 04, 07, 08, 13, 18–19 |
| Pronto para merge? | **Quase** — após push + CI verde + evidências pendentes |
| Bloqueio principal | Remote Git ausente; CI não verificado; 6 evidências visuais pendentes |
| Próximo passo | Configurar `origin`, push, abrir PR, capturar prints restantes, homologar Evolution em staging |

**Data estimada para versão testável ao cliente (com ressalvas):** 1–2 dias úteis após push + Evolution/staging.
