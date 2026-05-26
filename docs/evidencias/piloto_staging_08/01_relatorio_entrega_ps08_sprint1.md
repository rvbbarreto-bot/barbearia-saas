# Relatório de entrega — PS-08 Sprint 1 (P1)

**Card PO:** `00_CARD_AUTORIZADO_PS08_SPRINT1_P1.md`  
**Branch:** `feature/ps08-sprint1-p1`  
**PR:** _preencher URL_  
**Executado por:** _nome_  
**Data (UTC):** _yyyy-mm-dd_

---

## 1. Resumo executivo

| Item | Status | Nota |
|------|--------|------|
| PS-08.1 — Toast placa duplicada | ☐ OK / ☐ N/A | |
| PS-08.2 — Seed pátio 2026-06-16 | ☐ OK / ☐ N/A | |
| PS-08.3 — Seed outbox failed | ☐ OK / ☐ N/A | |

**Decisão PO (preencher após revisão):** ☐ Aceite · ☐ Aceite com ressalvas · ☐ Rejeição

---

## 2. PS-08.1 — UX veículos (placa duplicada)

### Alterações

- _Listar ficheiros/commits, ex.: `apiErrorMessage.ts`, `apiErrorMessage.test.ts`_

### Comandos executados

```powershell
cd apps\web
npm test -- --run src/lib/apiErrorMessage.test.ts
```

### Resultado

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Teste unitário `apiErrorMessage` | ☐ PASS / ☐ FAIL | _colar saída resumida_ |
| C10 manual / automação | ☐ PASS / ☐ FAIL | `prints/PS08_01_placa_duplicada_toast.png` |

### DoD PO

- [ ] Toast com mensagem de negócio em placa duplicada
- [ ] Lista de veículos inalterada após erro
- [ ] Sem alteração de constraint UNIQUE

---

## 3. PS-08.2 — Massa QA pátio (2026-06-16)

### Alterações

- _ex.: `scripts/qa-seed-car-wash-patio.ps1`_

### Comandos executados

```powershell
docker compose up -d postgres redis api
.\scripts\qa-seed-car-wash-patio.ps1
```

### Resultado

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Script idempotente (2ª execução) | ☐ PASS / ☐ FAIL | _nota_ |
| Coluna Agendados com Chegou/Iniciar | ☐ PASS / ☐ FAIL | `prints/PS08_02_patio_agendados.png` |
| C15–C17 executáveis sem SQL ad hoc | ☐ PASS / ☐ FAIL / ☐ N/A QA | _referência roteiro_ |

### DoD PO

- [ ] Data fixa **2026-06-16** com ≥1 job `scheduled`
- [ ] Documentação de pré-requisito atualizada

---

## 4. PS-08.3 — Massa QA outbox failed

### Alterações

- _ex.: `scripts/qa-seed-outbox-failed.ps1`_

### Comandos executados

```powershell
.\scripts\qa-seed-outbox-failed.ps1
```

### Resultado

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Linha `failed` visível (admin) | ☐ PASS / ☐ FAIL | `prints/PS08_03_outbox_failed_retry_admin.png` |
| Retry admin OK + auditoria | ☐ PASS / ☐ FAIL | _nota_ |
| Atendente sem Retry (C27) | ☐ PASS / ☐ FAIL | `prints/PS08_03_outbox_attendant_sem_retry.png` |

### DoD PO

- [ ] C26 executável
- [ ] C27 mantido (sem botão / 403)

---

## 5. Testes unitários (obrigatório)

```powershell
cd apps\api
npm run test:unit -- --run
npm run typecheck

cd ..\web
npm test -- --run
npm run typecheck
```

| Suite | Resultado | Observações |
|-------|-----------|-------------|
| API `test:unit` | ☐ VERDE / ☐ VERMELHO | |
| API typecheck | ☐ OK / ☐ FAIL | |
| Web tests | ☐ VERDE / ☐ VERMELHO | |
| Web typecheck | ☐ OK / ☐ FAIL | |

---

## 6. Testes funcionais

| ID | Cenário | Resultado | Evidência / nota |
|----|---------|-----------|------------------|
| C10 | Placa duplicada | ☐ OK ☐ FAIL | |
| C15–C17 | Pátio FSM | ☐ OK ☐ FAIL ☐ PEND | |
| C26 | Retry outbox admin | ☐ OK ☐ FAIL | |
| C27 | Retry bloqueado atendente | ☐ OK ☐ FAIL | |

**Automação doc 10 (se executada):**

```powershell
$env:QA_WEB_BASE = "http://localhost:3001"
node scripts\qa-browser\run-doc10.mjs
```

- Relatório: _caminho `11_relatorio_qa_automacao_doc10.md` ou rodada3/11_
- FAIL count: _

---

## 7. Testes de sistema (regressão)

```powershell
.\scripts\qa-piloto-staging-07-rodada3.ps1
```

| Verificação | Resultado | Artefato |
|-------------|-----------|----------|
| API Rodada 3 | ☐ 26/26 OK ☐ _N_/26 | `rodada3/08_resultados_aceite.json` |
| Seeds reexecutados em ambiente limpo | ☐ OK ☐ FAIL | |

---

## 8. CI / PR

| Item | Valor |
|------|--------|
| URL do PR | |
| Checks | ☐ Todos verdes ☐ Falha: _qual_ |
| P07_19 | ☐ Print/link anexo |

---

## 9. Riscos / ressalvas

_Preencher se houver._

---

## 10. Assinaturas

| Papel | Nome | Data | Decisão |
|-------|------|------|---------|
| Dev / Tech Lead | | | Entrega técnica |
| QA | | | Homologação |
| PO | | | Aceite release |
