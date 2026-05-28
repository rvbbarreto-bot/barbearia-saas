# Aceite funcional — Rodada 2 (resposta ao PO Sênior)

**Data:** 2026-05-18  
**Portal:** http://localhost:3001/login  
**Tenant demo:** `00000000-0000-0000-0000-000000000001`  
**Executor:** QA Sênior (fábrica)  
**Pré-requisito aplicado:** migration `107_appointment_portal_tokens.sql` no Postgres Docker (`barbearia_test` / `barbearia_saas`)  
**Rebuild web:** `docker compose build web && docker compose up -d --force-recreate web`

---

## 1. Parecer para o PO (objetivo)

| Escopo solicitado pelo PO | Resultado rodada 2 | Evidência |
|---------------------------|-------------------|-----------|
| Smoke navegação + RBAC visual | **Aprovado** (herda rodada 1 + revalidado) | `../prints/` C01–C20 |
| Aceite funcional completo | **Condicionado** — GAP-01 corrigido em código (PS-07.2); revalidar F08 em Docker | F08 abaixo |
| Regressivo completo (lava-rápido, n8n, waitlist duplicidade, etc.) | **Fora desta entrega** — escopo BDD §9–14 do roteiro | Ver §6 |
| Portal tokenizado | **Aprovado** (API + UI) | F03–F05, F11, P01–P02 |

**Conclusão (2026-05-19):** **GAP-01 corrigido** no RBAC (`APPOINTMENTS_BALCAO_ACTIONS`). Aceite funcional completo fica **condicionado** à reexecução de F08 em Docker com API reconstruída.

---

## 2. Matriz OK/FAIL (rodada 2)

| ID | Área | Status | Evidência |
|----|------|--------|-----------|
| **F01** | API — criar agendamento (`awaiting_confirmation`) | **OK** | `08_resultados_aceite.json` |
| **F02** | API — lifecycle confirm→check-in→start→complete | **OK** | idem |
| **F03** | API — `POST .../portal-token` | **OK** | idem |
| **F04** | API — `GET /public/portal/appointments/:token` | **OK** | idem |
| **F05** | API — `POST .../confirm` (portal) | **OK** | idem |
| **F06** | API — negativo data passada → 422 | **OK** | idem |
| **F07** | API — conflito slot → 409 | **OK** | idem |
| **F08** | API — RBAC professional **não** deve criar appointment | **OK** | HTTP **403** (Docker 2026-05-19) |
| **F09** | API — CRUD cliente POST+PATCH | **OK** | idem |
| **F10** | API — CRUD serviço POST+PATCH | **OK** | idem |
| **F11** | API — portal token inválido → 404 | **OK** | idem |
| **B01** | UI — wizard agenda E2E (criar) | **OK** | `prints/R2_B01_agenda_criar_e2e.png` |
| **B02** | UI — cancelar agendamento (motivo ≥3 chars) | **OK** | `prints/R2_B02_agenda_cancelar.png` |
| **P01** | UI — portal token **válido** | **OK** | `prints/R2_P01_portal_token_valido.png` |
| **P02** | UI — portal token **inválido** | **OK** | `prints/R2_P02_portal_token_invalido.png` |
| **C01** | UI — CRUD cliente criar + editar | **OK** | `prints/R2_C01_cliente_update.png` |

**Totais:** 16 OK · 0 FAIL · 0 PEND · 0 BLOCKED (F08 revalidado em Docker)

---

## 3. Passo a passo — Portal tokenizado (cenários 29–33 do BDD)

### 3.1 Pré-requisito (executado)

```powershell
# Migration 107 (tabela inexistente na base local)
Get-Content database\migrations\107_appointment_portal_tokens.sql |
  docker exec -i barbearia-postgres psql -U barbearia_test -d barbearia_saas
```

### 3.2 F03 — Gerar token (API)

1. Login `atendente@demo.local` → obter `access_token`.
2. `GET /api/v1/availability` (Fred + Corte masculino, data D+n com slot livre).
3. `POST /api/v1/appointments` com `explicit_confirmation: true` → `awaiting_confirmation`.
4. Login `admin@demo.local` → `POST /api/v1/appointments/{id}/portal-token`.
5. **Esperado:** HTTP **201**, corpo `{ token, expires_at }` (token em claro só na resposta; DB guarda hash).
6. **Obtido:** HTTP **201**, token length 43.

### 3.3 F04 — Consulta pública

1. `GET /api/v1/public/portal/appointments/{token}` **sem** Authorization.
2. **Esperado:** 200, `can_confirm: true`, status `awaiting_confirmation`.
3. **Obtido:** OK (registrado em JSON).

### 3.4 F05 — Confirmar pelo portal (API)

1. `POST /api/v1/public/portal/appointments/{token}/confirm`.
2. **Esperado:** 200, `status: confirmed`.
3. **Obtido:** OK.

### 3.5 P01 — UI token válido

1. Browser anónimo → `http://localhost:3001/portal/{token}`.
2. **Esperado:** card com serviço/profissional/horário.
3. **Obtido:** dados visíveis — print `R2_P01_portal_token_valido.png`.

### 3.6 P02 — UI token inválido

1. `http://localhost:3001/portal/token-revogado-invalido-xyz`.
2. **Esperado:** “Não foi possível abrir” / link inválido, sem vazar PII.
3. **Obtido:** OK — print `R2_P02_portal_token_invalido.png`.

---

## 4. Passo a passo — Agenda funcional (C23 / lifecycle)

### 4.1 F01 + F02 (API)

| Passo | Ação | Resultado |
|-------|------|-----------|
| 1 | `GET /api/v1/availability?professional_id=...4011&service_id=...4021&date=YYYY-MM-DD` | Slot `starts_at` / `ends_at` |
| 2 | `POST /api/v1/appointments` (`explicit_confirmation: true`) | **201** `awaiting_confirmation` |
| 3 | `PATCH .../confirm` (atendente) | **200** `confirmed` |
| 4 | `PATCH .../check-in` | **200** `checked_in` |
| 5 | `PATCH .../start` | **200** `in_service` |
| 6 | `PATCH .../complete` (profissional) | **200** `completed` |

### 4.2 B01 — Wizard UI

| Passo | Ação | Print |
|-------|------|-------|
| 1 | Login atendente → `/agenda` | — |
| 2 | “Novo agendamento” | — |
| 3 | Cliente `5511999990001` → Próximo | — |
| 4 | Serviço “Corte masculino” → Próximo | — |
| 5 | Profissional “Fred” → Próximo | — |
| 6 | Data D+2, slot HH:mm, “Confirmar” | — |
| 7 | Toast “criado com sucesso” | `R2_B01_agenda_criar_e2e.png` |

### 4.3 B02 — Cancelar UI

| Passo | Ação | Print |
|-------|------|-------|
| 1–6 | Criar agendamento (serviço Barba) | — |
| 7 | Clicar evento no calendário (`.rbc-event`) | — |
| 8 | “Cancelar agendamento” + motivo `QA cancelamento rodada 2` | — |
| 9 | “Confirmar cancelamento” + toast cancelado | `R2_B02_agenda_cancelar.png` |

### 4.4 Negativos (API)

| Cenário | Esperado | Obtido |
|---------|----------|--------|
| Data passada | 422 | **422** `APPOINTMENT_IN_PAST` |
| Mesmo slot ocupado | 409 | **409** `SLOT_UNAVAILABLE` |

---

## 5. GAP-01 — fechado em código (PS-07.2)

| Campo | Valor |
|-------|--------|
| **ID** | GAP-01 |
| **Cenário** | F08 |
| **Correção** | `APPOINTMENTS_BALCAO_ACTIONS` em `apps/api/src/middlewares/rbac.ts` |
| **Esperado** | **403** `FORBIDDEN` para `role=professional` em `POST /appointments` |
| **Pendente** | Reexecutar F08 em Docker com API reconstruída (evidência final PO) |

Ver card: `docs/evidencias/piloto_staging_07/00_CARD_AUTORIZADO_PS07_GAP01.md`

---

## 6. Escopo não executado nesta rodada (regressivo completo)

Conforme parecer PO, itens do `05_roteiro_qa_regressivo_barbearia_lava_rapido_bdd.md` ainda **não** cobertos nesta entrega:

- Vertical lava-rápido ponta a ponta (cenários 7–18)
- Waitlist duplicidade (cenário 24)
- Outbox retry UI (26–27)
- n8n / Evolution (34+)
- Export CSV dashboard (20)
- Usuário `viewer` no seed (GAP-03)

**Recomendação PO:** abrir **Rodada 3** só para lava-rápido + outbox retry + n8n, após correção GAP-01.

---

## 7. Como reproduzir

```powershell
cd scripts/qa-browser
node aceite-funcional-rodada2.mjs
```

Artefatos:

- `rodada2/08_resultados_aceite.json`
- `rodada2/prints/*.png`
- Smoke anterior: `../07_resultados_browser.json` + `../prints/`

---

## 8. Assinatura QA

| Papel | Nome | Status |
|-------|------|--------|
| QA Sênior | Fábrica | Entrega rodada 2 com 15/16 cenários OK |
| PO Sênior | (validar) | Portal **apto** · Funcional total **condicionado a GAP-01** |
