# Relatório de fechamento — MVP / piloto (resposta ao Gate PO)

**Data:** 2026-05-15  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**Commits:** `e138de8` (UX) · `bf4abaa` (evidências v1) · *pendente commit gate v2*

---

## Resposta à decisão PO (2026-05-15)

**Decisão PO:** Aprovação parcial com bloqueios.  
**Posição da fábrica:** concordamos com o parecer. Esta entrega avança o gate; **merge e piloto externo permanecem não aprovados** até itens impeditivos abaixo.

---

## 1. Commits e push

| Item | Estado |
|------|--------|
| Commits locais | `e138de8`, `bf4abaa` (+ gate v2 em preparação) |
| Working tree | Limpa após commit gate v2 |
| `git remote origin` | **Ausente** — push impossível sem URL |
| PR / CI remoto | **Bloqueado** até push |

**Instruções:** [`docs/GATE_PUSH_INSTRUCOES.md`](GATE_PUSH_INSTRUCOES.md)

---

## 2. Correção adicional (RBAC UI × API)

**Problema:** atendente via botão «Bloquear horário» na UI, mas API exige `requireRole('manager')` em `POST /calendar-blocks`.

**Correção:** `AgendaPage.tsx` — `canBlock` alterado de `attendant` para `manager` (alinhado à API).

**Evidência:** `04_agenda_atendente_sem_botao_bloqueio.png` (após rebuild web).

---

## 3. Matriz de evidências (01–19) — corrigida

**Total pendente: 7 artefatos** (5 visuais/funcionais + 2 governança), conforme PO.

| # | Artefato | Status | Evidência |
|---|----------|--------|-----------|
| 01 | login admin | Aprovado | PNG + tenant no header |
| 02 | login atendente | **Aprovado** | `02_login_multitenant_atendente.png` |
| 03 | agenda admin bloqueio | Aprovado | PNG |
| 04 | agenda atendente sem bloqueio | **Aprovado** | PNG (pós-fix RBAC) |
| 05 | modal bloqueio | Aprovado | PNG |
| 06 | bloqueio sucesso | Aprovado | PNG |
| 07 | slot bloqueado UI | **Pendente** | API CT-115/217 OK; print portal pendente |
| 08 | agendamento slot livre UI | **Pendente** | API CT-114 OK; print portal pendente |
| 09 | outbox lista | Aprovado | PNG |
| 10 | outbox detalhe admin | Aprovado | PNG + erro amigável |
| 11 | retry admin antes | Aprovado | JSON API |
| 12 | retry admin depois | Aprovado | JSON API → `pending` |
| 13 | retry atendente sem botão | **Parcial** | API 403 + `13_*.txt`; PNG detalhe pendente |
| 14 | RBAC retry API 403 | Aprovado | `14_rbac_api_retry_atendente_403.txt` |
| 15 | cross-tenant 403 | Aprovado | `15_cross_tenant_api_negado.txt` |
| 16 | health | Aprovado | JSON |
| 17 | database health | Aprovado | JSON |
| 18 | CI verde | **Pendente** | `18_ci_verde.txt` — aguarda push |
| 19 | secret scan | **Aprovado (local)** | `19_secret_scan_limpo.txt` — gitleaks Docker: **no leaks found** |

---

## 4. Evolution / WhatsApp

**Declaração formal:** piloto homologado **sem envio real** até staging com credenciais Evolution.

Documento: [`docs/DECLARACAO_PILOTO_EVOLUTION.md`](DECLARACAO_PILOTO_EVOLUTION.md)

| Item | Piloto sem Evolution |
|------|----------------------|
| Enfileiramento | Sim |
| Worker | Sim |
| `fetch failed` | Esperado (placeholder URL) |
| Erro amigável no portal | Sim |
| Retry manual admin | Sim (API + UI) |

---

## 5. Validação técnica (inalterada — positiva)

- Docker 5/5 healthy  
- QA P2.1 / P2.2 / P2.3 / negativa: exit 0  
- API unit 152/152 · Web 40/40 · builds OK  
- Migration 008 idempotente  
- Retry admin / 403 atendente / cross-tenant: comprovados via API  

---

## 6. Parecer final (atualizado)

| Pergunta | Resposta |
|----------|----------|
| Produção | **Não** |
| Merge | **Não** (sem push + CI remoto) |
| Piloto controlado | **Não** (7 pendências + Evolution) |
| Aceite parcial UX/API | **Sim**, com ressalvas documentadas |

### Bloqueios impeditivos

1. Ausência de `git remote` / push / PR / CI remoto (18).  
2. Prints portal 07, 08 (slot bloqueado e agendamento sucesso).  
3. PNG 13 (detalhe atendente sem retry) — API/UI já alinhados.  
4. Evolution em staging **ou** aceite formal assinado do piloto sem WhatsApp (já declarado).

### Prazo 24h (fábrica)

| Entrega | Prazo | Dependência |
|---------|-------|-------------|
| URL remote + push + PR | Imediato | **Cliente/DevOps** fornecer URL |
| CI print (18) | +1h após push | GitHub Actions |
| PNG 07, 08, 13 | +4h | Ambiente local/Docker |
| Evolution staging | 2–3 d.u. | Credenciais + infra cliente |

---

## 7. Ações solicitadas ao PO / cliente

1. Informar **URL do repositório Git** para `git remote add origin`.  
2. Confirmar **aceite da declaração Evolution** (piloto sem WhatsApp real).  
3. Opcional: credenciais Evolution staging para homologação E2E.
