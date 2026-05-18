# Pauta — Alinhamento PO + Tech Lead (≤ 1h)

**Produto:** Barbearia SaaS V2 · **Release candidata:** pós PR #12 → piloto staging 07 (QA regressivo)

---

## 1. Status PR #12 e bloqueios corrigidos

| Bloqueio | Estado |
|----------|--------|
| CI verde (car-wash RLS test) | Resolvido (`bb2863a`) |
| Portal sem fluxo oficial | Resolvido (pacote correções merge) |
| Idempotência `vehicle_id` | Resolvido |
| Placa obrigatória | Resolvido |
| Base `piloto-staging-01` | OK no PR #12 |
| Prints / evidências visuais | Pendente PO |

**Decisão reunião:** merge PR #12 em `piloto-staging-01`? (sim/não/condicionado)

---

## 2. Itens já entregues e testáveis (PS-06)

- Dashboard gerencial (`/gestao/dashboard`, API management).
- Cliente 360 (`/clientes/:id/360`).
- Portal tokenizado (público + token por agendamento).
- Lava-rápido MVP (veículos, jobs, checklist, FSM).
- Financeiro CSV, waitlist suggest-slot, comissão (flags existentes).
- Migrations 105–107.

---

## 3. Pendências críticas

- Prints homologação L01–L14.
- Cobertura formal ≥82% em módulos novos (vitest hoje: threshold só tenant/service).
- Regressão QA barbearia + car_wash (BDD `05_roteiro_qa_bdd.md`).
- n8n / homologação integrada (se gate piloto exigir).

---

## 4. Riscos técnicos

| Risco | Mitigação proposta |
|-------|-------------------|
| Regressão multitenant / RLS | Suite integração + smoke por vertical |
| Portal abuso de token | TTL 72h, revogação, rate limit futuro |
| Overlap agenda car_wash | Testes slot + GiST |
| Duplicidade placa | UNIQUE tenant + normalized_plate |
| PR grande | Não mergear `main`; releases incrementais em `piloto-staging-*` |

---

## 5. Demandas candidatas — próxima release

1. **QA regressivo completo** (barbearia + car_wash) — automação + roteiro manual.
2. **Cobertura e quality gate** nos módulos PS-06 (management, portal, carWash, vehicles).
3. **Operação assistida** — fila outbox, painel WhatsApp, recall (já parcial em staging anteriores).
4. **Relatórios / exportações** adicionais (financeiro, comissão).
5. **Hardening portal** — rate limit, uso único opcional, telemetria.
6. **n8n workflows** homologação (PS-03 carry-over).

---

## 6. Priorização (ROI × esforço × risco)

| # | Item | ROI | Esforço | Risco | Nota |
|---|------|-----|---------|-------|------|
| 1 | QA regressivo + CI estável | Alto | Médio | Baixo | Desbloqueia confiança PO |
| 2 | Cobertura módulos novos | Médio | Baixo | Baixo | Rápido, alinha gate 82% |
| 3 | Prints + aceite formal PS-06 | Alto | Baixo | — | Governança |
| 4 | Hardening portal | Médio | Médio | Médio | Pós-merge |
| 5 | n8n / automação | Alto | Alto | Médio | Fase seguinte |
| 6 | Features gestão extras | Médio | Alto | Médio | Após baseline QA |

---

## 7. Escopo recomendado MVP robusto (staging 07)

**Entra:**

- Gate 0: merge PR #12 após aceite PO.
- Pacote QA: regressão API (integração) + checklist manual Web.
- Cobertura vitest nos paths alterados PS-06.
- Evidências `piloto_staging_07/` (CI, matriz, riscos).

**Fica para release seguinte:**

- n8n produção, rate limit portal, features gestão não críticas.

---

## 8. Critérios de aceite (proposta)

- CI 100% verde em `feature/*` → PR → `piloto-staging-01`.
- Zero testes de integração críticos skipped sem justificativa.
- Roteiro QA regressivo executado (barbearia + car_wash) com evidência.
- Portal: paridade confirm/cancel com fluxo autenticado (testes verdes).
- Nenhum merge em `main` sem decisão executiva explícita.

---

## 9. Plano de QA regressivo

| Fase | Escopo | Responsável |
|------|--------|-------------|
| A | API integração (appointments, portal, carWash, vehicles, finance, waitlist) | Fábrica / CI |
| B | Web smoke (login, agenda, lava-rápido, gestão, portal público) | QA + PO |
| C | Multitenant / RLS (2 tenants) | API tests |
| D | BDD cenários PS-06 (`docs/evidencias/piloto_staging_06/05_roteiro_qa_bdd.md`) | QA |
| E | Regressão barbearia (sem vehicle_id, vertical default) | QA |

**Saída:** `docs/evidencias/piloto_staging_07/01_qa_regressivo.md` + prints.

---

## 10. Decisão final (preencher na reunião)

| Pergunta | Decisão |
|----------|---------|
| Merge PR #12 agora? | ☐ Sim ☐ Não ☐ Condicionado: __________ |
| Escopo staging 07 aprovado? | ☐ Sim ☐ Ajustar: __________ |
| Data alvo homologação? | __________ |

**Participantes:** PO __ · Tech Lead __ · GP __ · Data __
