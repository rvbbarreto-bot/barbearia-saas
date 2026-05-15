# Relatório de fechamento — MVP / piloto (gate PO)

**Data:** 2026-05-15  
**Repositório:** https://github.com/rvbbarreto-bot/barbearia-saas  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**HEAD (base remota):** `3be96591ca8e63705b23bb1478712a5d352ab366`  
**Último commit:** `3be9659` — `fix(mvp): complete pilot evidence, ci, and whatsapp readiness`

---

## Pacote obrigatório (10 itens PO)

| # | Item | Valor |
|---|------|--------|
| 1 | Repositório | https://github.com/rvbbarreto-bot/barbearia-saas |
| 2 | Branch | `feature/p2-2-web-outbox-whatsapp-operational` |
| 3 | `git rev-parse HEAD` | `3be96591ca8e63705b23bb1478712a5d352ab366` (+ commit gate v3 após push) |
| 4 | `git log -1` | `3be9659 fix(mvp): complete pilot evidence, ci, and whatsapp readiness` |
| 5 | `git status` | Sincronizado com `origin/feature/p2-2-web-outbox-whatsapp-operational` (pós gate v3: working tree limpa) |
| 6 | Push | `origin` → https://github.com/rvbbarreto-bot/barbearia-saas.git — branch publicada (`e4fcef5..3be9659`) |
| 7 | CI | https://github.com/rvbbarreto-bot/barbearia-saas/actions — workflow `ci.yml` passa a disparar em **push** nesta branch (gate v3). Print: `18_ci_verde.png` após run verde. Enquanto isso: `18_ci_verde.txt` + validação local equivalente abaixo. PR opcional: https://github.com/rvbbarreto-bot/barbearia-saas/compare/develop...feature/p2-2-web-outbox-whatsapp-operational |
| 8 | Gitleaks | `docs/evidencias/mvp_piloto_aceite/19_secret_scan_limpo.txt` — **no leaks found** (scan Docker, 2026-05-15) |
| 9 | Ficheiros alterados (escopo MVP) | `apps/web` (pt-BR, outbox, agenda, RBAC UI), `apps/api` (customers, calendar), `scripts/capture-*.mjs`, `docs/evidencias/*`, `docs/DECLARACAO_PILOTO_EVOLUTION.md`, `.github/workflows/ci.yml` |
| 10 | Veredito técnico | Ver § Parecer final |

---

## Resposta à decisão PO

**Decisão PO:** Aprovação parcial com bloqueios.  
**Posição da fábrica (atualizada):** gate técnico local e evidências 01–17/19 **fechados** no remoto; **merge, produção e piloto externo** permanecem **não aprovados** até CI remoto verde (18 PNG) e aceite formal Evolution (ou staging).

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
| 18 | CI verde | **Pendente PNG** | `18_ci_verde.txt` — run GitHub após push gate v3 |
| 19 | secret scan | Aprovado | `19_secret_scan_limpo.txt` |

**Pendência governança restante:** apenas **18_ci_verde.png** (screenshot Actions após workflow verde no GitHub).

---

## Correção RBAC UI × API

Atendente não vê mais «Bloquear horário» (`AgendaPage.tsx` — `canBlock` exige `manager`, alinhado a `POST /calendar-blocks`).

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
| QA P2.1 / P2.2 / negativa | exit 0 (CSV atualizados) |
| Migration 008 | idempotente (sessão anterior) |
| Gitleaks | no leaks found |

---

## Parecer final (fábrica)

| Pergunta | Resposta |
|----------|----------|
| **Produção** | **Não** |
| **Merge em `main`** | **Não** — aguardar PO após CI remoto + aceite Evolution |
| **Piloto controlado externo** | **Não** — sem CI 18 PNG + sem Evolution staging ou waiver assinado |
| **Aceite parcial UX/API** | **Sim**, com ressalvas documentadas |

### Bloqueios impeditivos (atualizados)

1. **CI remoto** — capturar `18_ci_verde.png` após run verde em Actions (push gate v3 dispara workflow).  
2. **Evolution** — staging **ou** aceite formal da declaração piloto sem WhatsApp real.  
3. **Merge** — não executar sem aprovação explícita do PO.

### Não bloqueiam mais (fechados nesta entrega)

- Remote / push / PNGs 02, 04, 07, 08, 13 no GitHub.  
- Gitleaks local (19).  
- RBAC bloqueio UI × API.

---

## Instruções complementares

- Push/PR: [`docs/GATE_PUSH_INSTRUCOES.md`](GATE_PUSH_INSTRUCOES.md)  
- Pacote evidências: [`docs/evidencias/mvp_piloto_aceite/README.md`](evidencias/mvp_piloto_aceite/README.md)
