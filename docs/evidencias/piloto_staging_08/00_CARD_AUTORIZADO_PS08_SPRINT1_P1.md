# Card autorizado — PS-08 Sprint 1 (P1) · Toast veículos + massas QA

**Data:** 2026-05-25  
**PO:** Autorizado — desenvolvimento imediato  
**Tech Lead:** Autorizado — time sênior full stack  
**Release track:** `piloto-staging-01` (ou branch `feature/ps08-*` derivada)  
**Prioridade:** P1 (Sprint 1 PS-08)  
**Referência backlog:** `docs/evidencias/piloto_staging_07/12_demandas_po_proxima_release_fabrica.md` §3 (PS-08.1–08.3)

---

## 1. Decisão PO

| Item | Decisão |
|------|---------|
| Linha activa | Piloto staging 08 — **Sprint 1 P1** |
| Demandas autorizadas | **PS-08.1**, **PS-08.2**, **PS-08.3** |
| Equipe | Fábrica — time sênior full stack |
| Merge `main` | **Não** — integrar em branch piloto após CI verde |
| QA manual doc 10 (C10, C15–C17, C26) | **Após** entrega deste card + evidências abaixo |
| Fora deste card | PS-08.4+ (Evolution, n8n import, cobertura 82%, CI browser) |

**Mensagem à fábrica:** iniciar **PS-08.1 → PS-08.2 → PS-08.3** nesta ordem. Ao concluir cada item, executar **testes unitários, funcionais e de sistema** conforme §6 deste card.

---

## 2. PS-08.1 — UX veículos: feedback placa duplicada

### Problema

`POST /api/v1/vehicles` com placa existente retorna **409** `VEHICLE_PLATE_ALREADY_EXISTS` (API OK). A UI pode não exibir toast claro (cenário **C10 PEND** no doc 10).

### Escopo autorizado

- Mapear código `VEHICLE_PLATE_ALREADY_EXISTS` em `apps/web/src/lib/apiErrorMessage.ts` (mensagem de negócio em português).
- Garantir que `VeiculosPage` exibe **toast de erro** via `getApiErrorMessage` no `onError` da mutation (sem alterar regra UNIQUE no banco).
- Teste unitário web mínimo para o mapeamento do código (recomendado).
- Print de evidência do cenário C10.

### Fora de escopo

- Alterar constraint / política de placa na API ou migrations.

### DoD (aceite PO)

- [ ] C10 **PASS** — toast visível ao tentar placa duplicada; lista de veículos inalterada.
- [ ] Teste unitário web (ou e2e opcional) verde.
- [ ] Print: `docs/evidencias/piloto_staging_08/prints/PS08_01_placa_duplicada_toast.png`

---

## 3. PS-08.2 — Massa QA lava-rápido (pátio 2026-06-16)

### Problema

Pátio na data **2026-06-16** sem jobs em **Agendados** impede cenários **C15–C17** no browser.

### Escopo autorizado

- Script reproduzível: `scripts/qa-seed-car-wash-patio.ps1` e/ou SQL versionado em `scripts/` ou `docs/`.
- Tenant demo `00000000-0000-0000-0000-000000000001`, vertical `car_wash`, data fixa **2026-06-16**.
- ≥1 job `scheduled` com veículo; checklist pendente **opcional**.
- Documentar pré-requisito em `docs/evidencias/piloto_staging_07/rodada3/10_qa_junior_cenarios_pendentes_passo_a_passo.md` (§ pré-requisito) ou README do script.
- Script **idempotente** (reexecução segura).

### Fora de escopo

- Novas regras de negócio do FSM do pátio.

### DoD (aceite PO)

- [ ] Após um comando documentado: coluna **Agendados** com card e botões **Chegou** / **Iniciar**.
- [ ] QA júnior consegue executar **C15–C17** sem SQL ad hoc.
- [ ] Print: `docs/evidencias/piloto_staging_08/prints/PS08_02_patio_agendados.png`

---

## 4. PS-08.3 — Massa QA outbox `failed` + retry

### Problema

Cenário **C26 PEND** — sem linhas `failed` / dead na UI do tenant demo.

### Escopo autorizado

- Seed controlado (SQL ou endpoint **QA-only** / script): ≥1 mensagem em `message_outbox` com status **`failed`** no tenant demo.
- Opcional: documentar `OUTBOX_FORCE_SEND_FAILURE` em `.env.example` / doc staging (sem expor secrets).
- **Não** alterar RBAC: atendente continua **sem** botão Retry (**C27** deve permanecer OK).

### Fora de escopo

- Mudar política de retry em produção; alterar permissões de outbox.

### DoD (aceite PO)

- [ ] Admin: filtro **Falhou** / dead mostra linha; **Retry** com toast OK; evento em auditoria operacional.
- [ ] Atendente: **sem** botão Retry (ou 403 se forçar API).
- [ ] Prints: `PS08_03_outbox_failed_retry_admin.png` · `PS08_03_outbox_attendant_sem_retry.png`

---

## 5. Entregáveis obrigatórios (PR)

| Entregável | Responsável |
|------------|-------------|
| Código + scripts | Dev |
| `docs/evidencias/piloto_staging_08/01_relatorio_entrega_ps08_sprint1.md` | Dev (resumo técnico + comandos executados) |
| Prints em `docs/evidencias/piloto_staging_08/prints/` | Dev / QA |
| Atualização parcial `rodada3/07_resultados_browser.json` ou `piloto_staging_08/07_resultados_browser.json` | Dev / QA |
| PR referenciando este card | Dev |

---

## 6. Plano de testes (obrigatório pós-desenvolvimento)

### 6.1 Testes unitários

| Área | Comando | Critério |
|------|---------|----------|
| API (regressão mínima) | `cd apps/api && npm run test:unit -- --run` | **Verde** — sem regressão nos módulos tocados |
| API veículos (se alterar API) | `npm run test:unit -- --run src/modules/vehicles/vehicles.integration.test.ts` | **Verde** — 409 placa duplicada mantido |
| Web — `apiErrorMessage` | `cd apps/web && npm test -- --run src/lib/apiErrorMessage.test.ts` (criar se necessário) | **Verde** — `VEHICLE_PLATE_ALREADY_EXISTS` → mensagem PT |
| Web — RBAC/nav (smoke) | `npm test -- --run src/lib/route-access.test.ts src/config/nav.test.ts` | **Verde** |

### 6.2 Testes funcionais

| ID | Cenário | Como validar | Critério |
|----|---------|--------------|----------|
| F-08.1 | C10 Placa duplicada | UI `/veiculos` — criar veículo com placa existente | Toast de duplicidade; contagem da lista inalterada |
| F-08.2 | C15–C17 Pátio FSM | Após seed: `/operacao/lava-rapido`, data `2026-06-16` | Chegou → Iniciar → … → Entregar executável |
| F-08.3 | C26 Retry admin | `/operacao/mensagens`, status Falhou | Retry OK + auditoria |
| F-08.4 | C27 Retry atendente | Login `atendente@demo.local` | Sem botão Retry |

**Automação recomendada (antes do handoff QA):**

```powershell
cd barbearia-saas
$env:QA_WEB_BASE = "http://localhost:3001"
node scripts/qa-browser/run-doc10.mjs
```

Registrar resultado em `docs/evidencias/piloto_staging_08/11_relatorio_qa_automacao_doc10.md`.

### 6.3 Testes de sistema (integração / regressão)

| Camada | Comando | Critério |
|--------|---------|----------|
| Stack Docker | `docker compose up -d` | API `:3000` / Web `:3001` healthy |
| Regressão API Rodada 3 | `.\scripts\qa-piloto-staging-07-rodada3.ps1` | **26/26 OK** — regressão zero |
| Seeds PS-08.2 / 08.3 | Executar scripts documentados em ambiente limpo + reexecução | Idempotente; massa visível na UI |
| Typecheck | `cd apps/api && npm run typecheck` · `cd apps/web && npm run typecheck` | Sem erros |

---

## 7. Comandos de verificação (fábrica)

```powershell
Set-Location barbearia-saas

# Ambiente
docker compose up -d
. .\scripts\devops-env.ps1 -InstallNodeIfMissing

# Unitários
cd apps\api
npm run test:unit -- --run
npm run typecheck
cd ..\web
npm test -- --run
npm run typecheck
cd ..\..

# Seeds (após implementação — ajustar nomes dos scripts)
# .\scripts\qa-seed-car-wash-patio.ps1
# .\scripts\qa-seed-outbox-failed.ps1

# Sistema
.\scripts\qa-piloto-staging-07-rodada3.ps1
$env:QA_WEB_BASE = "http://localhost:3001"
node scripts\qa-browser\run-doc10.mjs
```

---

## 8. Critérios de aceite do card (PO assina quando)

- [ ] **PS-08.1**, **PS-08.2**, **PS-08.3** — todos os DoD §2–4 marcados  
- [ ] §6 — unitários + funcionais + sistema executados com evidência no relatório  
- [ ] Regressão API **26/26 OK**  
- [ ] CI do PR **verde** (`test:unit`, typecheck, checks acordados)  
- [ ] Evidências em `docs/evidencias/piloto_staging_08/`  
- [ ] Nenhum débito **P0** aberto  

---

## 9. Rastreabilidade

| Artefato | Uso |
|----------|-----|
| `00_CARD_AUTORIZADO_PS08_SPRINT1_P1.md` | **Este documento** — autorização PO |
| `12_demandas_po_proxima_release_fabrica.md` | Backlog completo PS-08 |
| `10_qa_junior_cenarios_pendentes_passo_a_passo.md` | Roteiro QA pós-entrega |
| `11_relatorio_qa_senior_doc10_browser.md` | Baseline automação |

---

**PO:** Autorizado início imediato PS-08.1 → PS-08.2 → PS-08.3.  
**Tech Lead:** Validar PR e ordem de merge na branch piloto.  
**QA:** Iniciar rodada manual doc 10 (C10, C15–C17, C26) após entrega + relatório §5.
