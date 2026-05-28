# Demandas PO → Fábrica · Próxima release (PS-08)

**Data:** 2026-05-20  
**PO:** Piloto Staging 07 encerrado para **aceite técnico**; homologação visual **doc 10** deslocada para **próxima release**  
**Base de evidência:** `rodada3/08_resultados_aceite.json` (API 26/26 OK) · `rodada3/07_resultados_browser.json` (Web 17 OK · 1 PEND · 1 BLOCKED) · `11_relatorio_qa_senior_doc10_browser.md`

---

## 1. Decisão PO — release atual (PS-07.4)

| Camada | Decisão | Fundamentação |
|--------|---------|---------------|
| **API Rodada 3** | **Aceitar** | 26/26 OK — agenda, portal, car_wash, RBAC F08, outbox |
| **Web core PS-06** | **Aceitar** | Dashboard gestão, cliente 360, financeiro, comissões, veículos (combo cliente corrigido), portal válido/inválido, forbidden atendente |
| **QA doc 10 (júnior)** | **Próxima release** | Cenários manuais + massa de dados (pátio FSM, outbox failed, n8n import, Evolution) **não bloqueiam** merge piloto |
| **Merge `main`** | **Não** | Manter trilha `piloto-staging-*` até PS-08 + homologação completa |

**Mensagem à fábrica:** iniciar **PS-08** abaixo; **não** abrir features V4 (Pix, recall produção, novas telas gestão) sem card PO.

---

## 2. O que fica para QA na próxima release (sem dev, salvo bugs)

Executar na **próxima release** conforme `10_qa_junior_cenarios_pendentes_passo_a_passo.md`:

| ID | Cenário | Tipo | Nota |
|----|---------|------|------|
| C20 | Export CSV — conteúdo | QA manual | Botão OK; validar ficheiro `gross_revenue_cents` |
| C10 | Placa duplicada — toast UI | QA + possível bug UI | API 409 na Rodada 3; automação não viu toast |
| C15–C17 | Pátio FSM completo | QA manual | Depende de massa em `2026-06-16` (ver PS-08.2) |
| C26 | Retry outbox admin | QA manual | Depende de massa `failed` (ver PS-08.3) |
| C31–C32 | Portal confirmar/cancelar | QA manual | Gerar token `awaiting_confirmation` |
| C34 | Import n8n (4 workflows) | QA ops | UI `:5679` OK; import §7.2 |
| C35–C36 | Evolution smoke | QA **BLOCKED** até `:8081` | Ver PS-08.4 |
| C37–C38 | Cross-tenant | QA pleno | Scripts API |
| P07_19 | CI verde no PR | QA / DevOps | Print ou link Checks |

**Automação já disponível:** `node scripts/qa-browser/run-doc10.mjs` (regressão rápida antes do júnior).

---

## 3. Demandas autorizadas para a fábrica (desenvolvimento)

### PS-08.1 — UX veículos: feedback placa duplicada (P1)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P1 |
| **Problema** | `POST /vehicles` com placa existente → API **409** `VEHICLE_PLATE_ALREADY_EXISTS`; UI pode não exibir toast claro (C10 PEND no browser). |
| **Escopo** | Mapear erro em `VeiculosPage` / `getApiErrorMessage`; toast com mensagem de negócio; não alterar regra UNIQUE. |
| **DoD** | C10 PASS no roteiro BDD; teste web leve ou e2e opcional; print evidência. |
| **Fora** | Mudar constraint de placa |

---

### PS-08.2 — Massa QA lava-rápido reproduzível (P1)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P1 |
| **Problema** | Pátio em `2026-06-16` sem jobs em **Agendados** impede C15–C17 no browser. |
| **Escopo** | Script SQL ou `scripts/qa-seed-car-wash-patio.ps1`: tenant demo, data fixa `2026-06-16`, ≥1 job `scheduled` com veículo + checklist pendente opcional; documentar no doc 10 § pré-requisito. |
| **DoD** | Após script, coluna Agendados com card e botões Chegou/Iniciar; QA júnior executa C15–C17 sem pedir SQL ad hoc. |

---

### PS-08.3 — Massa QA outbox `failed` + retry (P1)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P1 |
| **Problema** | C26 PEND — sem linhas `failed` / dead na UI. |
| **Escopo** | Seed controlado (SQL ou API interna QA-only): 1 mensagem outbox `failed` no tenant demo; opcional flag `.env` `OUTBOX_FORCE_SEND_FAILURE` documentada para staging. |
| **DoD** | C26 e auditoria de retry executáveis; C27 continua sem botão para atendente. |

---

### PS-08.4 — Stack Evolution local para homologação n8n (P2)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P2 |
| **Problema** | P07_17 **BLOCKED** — Evolution `:8081` ausente. |
| **Escopo** | `docker-compose` profile `evolution` (ou doc operacional); variáveis alinhadas a `docs/PILOTO_STAGING_01_N8N.md`; smoke `03_QA_Barbearia_Evolution_SendText_Smoke` sem expor API keys em prints. |
| **DoD** | C35–C36 executáveis em staging; status matriz ≠ BLOCKED quando serviço up. |

---

### PS-08.5 — n8n: import automatizado dos 4 workflows (P2)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P2 |
| **Problema** | C34 PEND — import manual frágil. |
| **Escopo** | Script `scripts/n8n-import-piloto-workflows.ps1` (ou documentação + CI opcional): import `docs/n8n/*.json`, workflows **Inactive**, sem pinData fixo. |
| **DoD** | P07_16 OK após um comando; 4 workflows listados. |

---

### PS-08.6 — Quality gate cobertura PS-06 (P2)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P2 |
| **Problema** | Gate formal ≥82% nos módulos novos ainda incompleto (pauta PO §3). |
| **Escopo** | Vitest: `management`, `portal`, `carWash`, `vehicles`, `customers/overview` — sem alterar regras de negócio. |
| **DoD** | Relatório cobertura no PR; CI verde `test:unit`. |

---

### PS-08.7 — Estabilização técnica (backlog existente) (P2–P3)

| Card | Ficheiro | Prioridade |
|------|----------|------------|
| Mock Vitest outbox | `docs/backlog/CARD-outbox-service-test-fix.md` | P2 |
| GiST / buffer hardening | `docs/backlog/CARD-gist-buffer-hardening-analise.md` | P3 |
| FK users ↔ professional tenant | `docs/backlog/CARD-users-professional-id-fk-tenant-hardening.md` | P3 |

---

### PS-08.8 — GAPs de produto (P3 — após P1)

| GAP | Descrição | Ação |
|-----|-----------|------|
| GAP-02 | Telefone duplicado em `POST /customers` → 200? | PO define regra; API + teste |
| GAP-03 | Sem usuário `viewer` no seed | Adicionar seed + 1 teste RBAC leitura |

---

### PS-08.9 — CI: regressão browser no pipeline (P2)

| Campo | Valor |
|-------|--------|
| **Prioridade** | P2 |
| **Escopo** | Job opcional CI: `node scripts/qa-browser/run-doc10.mjs` contra web efêmera ou smoke reduzido; artefactos prints falham PR se FAIL > 0. |
| **DoD** | P07_19 alinhado a Checks verdes + smoke browser não flaky. |

---

## 4. Priorização sugerida (sprint fábrica)

```
Sprint 1 (P1):  PS-08.1 → PS-08.2 → PS-08.3
Sprint 2 (P2):  PS-08.4 → PS-08.5 → PS-08.6 → PS-08.9
Sprint 3 (P2–P3): PS-08.7 → PS-08.8
Paralelo QA (próxima release): doc 10 completo após PS-08.1–08.3 entregues
```

---

## 5. Critérios de aceite da próxima release (PO)

- [ ] Todos os itens **P1** (PS-08.1–08.3) fechados  
- [ ] QA doc 10 executado com matriz `07_resultados_browser.json` sem FAIL  
- [ ] API Rodada 3 reexecutada (`qa-piloto-staging-07-rodada3.ps1`) — regressão zero  
- [ ] CI 100% verde no PR para `piloto-staging-01` (ou branch acordada)  
- [ ] Evidências em `docs/evidencias/piloto_staging_08/` (nova pasta rodada)  
- [ ] Nenhum débito P0 aberto (GESTAO-500 **fechado** em PS-07.4)

---

## 6. Fora de escopo PS-08 (explícito)

- Pix, recall produção, financeiro avançado, comissão nova regra  
- Novas telas gestão / dashboards adicionais  
- Merge em `main` sem decisão executiva  
- Features V4 não cardadas  

---

## 7. Comandos úteis (handoff fábrica)

```powershell
cd barbearia-saas
docker compose up -d
.\scripts\qa-piloto-staging-07-rodada3.ps1
$env:QA_WEB_BASE = "http://localhost:3001"
node scripts/qa-browser/run-doc10.mjs
```

---

## 8. Rastreabilidade

| Artefato | Uso |
|----------|-----|
| `12_demandas_po_proxima_release_fabrica.md` | **Este documento** — autorização PO fábrica |
| `10_qa_junior_cenarios_pendentes_passo_a_passo.md` | Roteiro QA próxima release |
| `11_relatorio_qa_senior_doc10_browser.md` | Baseline automação |
| `09_relatorio_fabrica_ps074_gestao500.md` | PS-07.4 fechado |

**PO:** Autorizado envio à fábrica para início **PS-08.1** imediato.  
**Tech Lead:** Validar estimativas e ordem de sprint.  
**QA:** Aguardar PS-08.1–08.3 para rodada manual doc 10 na próxima release.
