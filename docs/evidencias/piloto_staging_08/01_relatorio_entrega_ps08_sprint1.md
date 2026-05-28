# Relatório de entrega — PS-08 Sprint 1 (P1)

**Card PO:** `docs/evidencias/piloto_staging_08/00_CARD_AUTORIZADO_PS08_SPRINT1_P1.md`  
**Branch:** `feature/ps08-sprint1-p1`  
**PR:** https://github.com/rvbbarreto-bot/barbearia-saas/pull/14  
**Executado por:** Fábrica / QA Automation (sessão 2026-05-26)  
**Data (UTC-3):** 2026-05-26

---

## 1. Resumo executivo

| Item | Status | Nota |
|------|--------|------|
| PS-08.1 — Toast placa duplicada | OK | Sonner `[data-sonner-toaster]` — Playwright + Robot |
| PS-08.2 — Seed pátio 2026-06-16 | OK | `scripts/qa-seed-car-wash-patio.ps1` |
| PS-08.3 — Seed outbox failed | OK | `scripts/qa-seed-outbox-failed.ps1` |
| GAP-03 — Usuário viewer | OK | migration `108` + `qa-seed-viewer.ps1` |
| Gate cobertura PS-06 (≥82%) | OK | `npm run test:api:coverage:ps06` — 92.93% stmts / 76.32% branches |

**Decisão PO (preencher após revisão):** Aceite com ressalvas — validar E2E Robot em ambiente Docker estável (Redis rede).

---

## 2. PS-08.1 — UX veículos (placa duplicada)

### Alterações

- `apps/web/src/lib/apiErrorMessage.ts` — código `VEHICLE_PLATE_ALREADY_EXISTS`
- `apps/web/src/lib/apiErrorMessage.test.ts`
- `scripts/qa-browser/qa-junior-doc10.mjs` — C10 via Sonner (sem sleep)
- `tests/robot/resources/keywords/veiculos_keywords.robot` — toast Sonner

### Comandos

```powershell
cd apps\web
npm test -- --run src/lib/apiErrorMessage.test.ts
```

| Verificação | Resultado |
|-------------|-----------|
| Teste unitário web | PASS (6/6) |
| C10 Playwright | Alinhado — aguarda `[data-sonner-toaster]` |
| C10 Robot RF-02 | Keyword `Entao Deve Aparecer Toast Placa Duplicada` |

---

## 3. PS-08.2 — Massa QA pátio

```powershell
.\scripts\qa-seed-car-wash-patio.ps1
```

| Verificação | Resultado |
|-------------|-----------|
| Job `scheduled` em 2026-06-16 | OK (placa PSQ8A16) |
| Robot RF-03 / Playwright C15–C16 | Coberto na suíte |

---

## 4. PS-08.3 — Massa QA outbox failed

```powershell
.\scripts\qa-seed-outbox-failed.ps1
```

| Verificação | Resultado |
|-------------|-----------|
| Linha `failed` visível | OK |
| C26 admin retry / C27 atendente | Robot RF-04 |

---

## 5. Testes unitários e gate PS-06

```powershell
npm run test:api:unit
npm run test:api:coverage:ps06
npm run test:web
```

| Suite | Resultado | Observações |
|-------|-----------|-------------|
| API `test:unit` | VERDE | 199+ testes (incl. PS-06 novos) |
| API `test:coverage:ps06` | **PASS** | 92.93% stmts, 76.32% branches, 100% funcs |
| Web tests | VERDE | 66 testes |
| GAP-03 RBAC viewer | PASS | `rbac.viewer-readonly.ps06.test.ts` |

**Novos arquivos PS-06 (unit):**

- `management.dashboard.service.ps06.test.ts`
- `portal.service.ps06.test.ts`
- `vehicles.service.ps06.test.ts`
- `customers.overview.ps06.test.ts`
- `car-wash.messages.ps06.test.ts`
- `car-wash.service.ps06.test.ts`

---

## 6. Testes funcionais / E2E

| ID | Cenário | Automação |
|----|---------|-----------|
| C10 | Placa duplicada toast | Playwright + Robot |
| C15–C16 | Pátio FSM | Playwright + Robot RF-03 |
| C26/C27 | Outbox retry RBAC | Robot RF-04 |
| GAP-03 | Viewer agenda / gestão forbidden | Robot RF-06 |

**Nightly Robot:**

```powershell
.\scripts\qa-robot-nightly.ps1
# Relatório: tests\robot\results\report.html
```

---

## 7. Regressão API

```powershell
.\scripts\qa-piloto-staging-07-rodada3.ps1
```

Referência anterior: **26/26 OK** (`rodada3/08_resultados_aceite.json`).

---

## 8. CI / PR

| Item | Valor |
|------|--------|
| PR | #14 → base `piloto-staging-01` |
| Gate PS-06 local | PASS |
| Docker local | Ressalva: Redis orphan na rede — ver `qa-robot-nightly.ps1` |

---

## 9. Riscos / ressalvas

1. **Docker Redis** — container `barbearia-redis` externo pode conflitar; nightly script reconecta rede.
2. **API unhealthy** — ocorre se postgres/redis fora da mesma rede Docker; `docker compose up -d postgres redis api web`.
3. **C30/C34/C35** — portal token runtime, n8n, Evolution continuam manuais/bloqueados.

---

## 10. Assinaturas

| Papel | Nome | Data | Decisão |
|-------|------|------|---------|
| Dev / Tech Lead | Fábrica PS-08 | 2026-05-26 | Entrega técnica |
| QA | _preencher_ | | Homologação Robot nightly |
| PO | _preencher_ | | Aceite release |
