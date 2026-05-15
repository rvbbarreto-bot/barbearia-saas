# Relatório de fechamento — MVP / piloto (gate PO)

**Data:** 2026-05-15  
**Repositório:** https://github.com/rvbbarreto-bot/barbearia-saas  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**HEAD:** `7f154cf4ce63a9cadbd9cc1fe2c79b512897ac7a`  
**Último commit:** `7f154cf` — `fix(whatsapp): RLS-safe inbound webhook tenant resolution`

---

## Pacote obrigatório (10 itens PO)

| # | Item | Valor |
|---|------|--------|
| 1 | Repositório | https://github.com/rvbbarreto-bot/barbearia-saas |
| 2 | Branch | `feature/p2-2-web-outbox-whatsapp-operational` |
| 3 | `git rev-parse HEAD` | `7f154cf4ce63a9cadbd9cc1fe2c79b512897ac7a` |
| 4 | `git log -1` | `7f154cf fix(whatsapp): RLS-safe inbound webhook tenant resolution` |
| 5 | `git status` | Sincronizado com `origin/feature/p2-2-web-outbox-whatsapp-operational` (working tree limpa) |
| 6 | Push | `git push origin feature/p2-2-web-outbox-whatsapp-operational` → `4e7f938..7f154cf` |
| 7 | CI | **VERDE** — [Actions run #8](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25929492356) (commit `7f154cf`). Evidência: `docs/evidencias/mvp_piloto_aceite/18_ci_verde.txt` |
| 8 | Gitleaks | `docs/evidencias/mvp_piloto_aceite/19_secret_scan_limpo.txt` — **no leaks found** (Docker local + job CI #8) |
| 9 | Ficheiros alterados (escopo MVP + gate CI) | `apps/web` (pt-BR, outbox, agenda, RBAC UI), `apps/api` (outbox-worker RLS, inbound webhook, testes integração), `.github/workflows/ci.yml`, `database/ci/grant_app_role.sql`, `docs/evidencias/*`, `docs/DECLARACAO_PILOTO_EVOLUTION.md` |
| 10 | Veredito técnico | Ver § Parecer final |

---

## Resposta à decisão PO

**Decisão PO:** Aprovação parcial com bloqueios.  
**Posição da fábrica (atualizada):** gate técnico **local e remoto (CI #8 verde)** + evidências **01–17 e 19** versionadas; item **18** documentado com link de run verde (`18_ci_verde.txt`). **Merge, produção e piloto externo** permanecem **não aprovados** até aceite formal Evolution (staging ou waiver assinado) e decisão explícita do PO. **Não fazer merge em `main`.**

---

## Matriz de evidências (01–19)

| # | Artefato | Status | Evidência versionada |
|---|----------|--------|----------------------|
| 01 | login admin | Aprovado | `01_login_multitenant_admin.png` |
| 02 | login atendente | Aprovado | `02_login_multitenant_atendente.png` |
| 03 | agenda admin bloqueio | Aprovado | `03_agenda_admin_com_botao_bloqueio.png` |
| 04 | agenda atendente sem bloqueio | Aprovado | `04_agenda_atendente_sem_botao_bloqueio.png` |
| 05 | modal bloqueio | Aprovado | `05_bloqueio_modal_campos_validos.png` |
| 06 | bloqueio sucesso | Aprovado | `06_bloqueio_criado_sucesso.png` |
| 07 | slot bloqueado UI | Aprovado | `07_slot_bloqueado_erro_amigavel.png` + `07_slot_bloqueado_api_409.txt` |
| 08 | agendamento slot livre | Aprovado | `08_agendamento_slot_livre_sucesso.png` + `08_agendamento_slot_livre_api_201.txt` |
| 09 | outbox lista | Aprovado | `09_outbox_lista_sem_scroll_critico.png` |
| 10 | outbox detalhe admin | Aprovado | `10_outbox_detalhe_sanitizado_admin.png` |
| 11 | retry admin antes | Aprovado | `11_outbox_retry_admin_antes.json` |
| 12 | retry admin depois | Aprovado | `12_outbox_retry_admin_depois.json` |
| 13 | retry atendente sem botão | Aprovado | `13_outbox_retry_atendente_sem_botao.png` + `13_*.txt` + API 403 |
| 14 | RBAC retry API 403 | Aprovado | `14_rbac_api_retry_atendente_403.txt` |
| 15 | cross-tenant 403 | Aprovado | `15_cross_tenant_api_negado.txt` |
| 16 | health | Aprovado | `16_health_api_ok.json` |
| 17 | database health | Aprovado | `17_database_health_ok.json` |
| 18 | CI verde | **Aprovado (link)** | `18_ci_verde.txt` → [run #8 Success](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25929492356). PNG opcional: `18_ci_verde.png` |
| 19 | secret scan | Aprovado | `19_secret_scan_limpo.txt` |

---

## Correção RBAC UI × API

Atendente não vê mais «Bloquear horário» (`AgendaPage.tsx` — `canBlock` exige `manager`, alinhado a `POST /calendar-blocks`).

---

## Correções CI (sessão 2026-05-15)

| Commit | Conteúdo |
|--------|----------|
| `2222a46` | Evolution env no CI, outbox worker RLS + `next_retry_at`, fixtures integração, Vitest env workers |
| `7f154cf` | Webhook inbound: lookup via `DATABASE_URL_ADMIN`, dedup em `withTenant`, fixtures HMAC |

---

## Evolution / WhatsApp

Declaração formal: [`docs/DECLARACAO_PILOTO_EVOLUTION.md`](DECLARACAO_PILOTO_EVOLUTION.md) — piloto **sem envio real** até credenciais Evolution em staging. Erro `fetch failed` mapeado para mensagem amigável no portal.

---

## Validação técnica (2026-05-15)

| Verificação | Resultado |
|-------------|-----------|
| Docker compose | 5/5 healthy |
| `apps/api` typecheck + test:unit | OK (152/152) |
| `apps/api` build | OK |
| `apps/web` typecheck + test + build | OK (40/40) |
| **GitHub Actions CI #8** | **Success** (API integração + Web + Gitleaks) |
| QA P2.1 / P2.2 / negativa | exit 0 |
| Gitleaks local | no leaks found |

---

## Parecer final (fábrica)

| Pergunta | Resposta |
|----------|----------|
| **Produção** | **Não** |
| **Merge em `main`** | **Não** — aguardar PO; não executar merge automático |
| **Piloto controlado externo** | **Não** — sem Evolution staging ou waiver assinado |
| **Aceite parcial UX/API + CI** | **Sim**, com ressalva Evolution |

### Bloqueios impeditivos (atualizados)

1. **Evolution** — staging **ou** aceite formal da [`DECLARACAO_PILOTO_EVOLUTION.md`](DECLARACAO_PILOTO_EVOLUTION.md).  
2. **Merge** — somente com aprovação explícita do PO.

### Fechados nesta entrega

- Push remoto e branch publicada (`7f154cf`).  
- **CI remoto verde** (run #8).  
- Gitleaks (19) local + CI.  
- PNGs 01–13, JSON/TXT 11–17.  
- RBAC bloqueio UI × API.  
- Testes de integração API sob role `barbearia_app` (RLS real).

---

## Instruções complementares

- Push/PR: [`docs/GATE_PUSH_INSTRUCOES.md`](GATE_PUSH_INSTRUCOES.md)  
- Pacote evidências: [`docs/evidencias/mvp_piloto_aceite/README.md`](evidencias/mvp_piloto_aceite/README.md)
