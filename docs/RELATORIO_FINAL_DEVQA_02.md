# Relatório final — pacote DEV/QA-02

**Data:** 2026-05-03  
**Classificação:** DEV/QA em evolução. **Não** produção, piloto comercial, GA nem P0 formalmente encerrado.

---

## 1. Resumo executivo

Continuidade técnica com remediação do workflow n8n **03** (sem Postgres/Evolution diretos), recall via Core API com `RECALL_ENABLED=false` por defeito, testes de integração **customers** e **professionals**, ADR de PSP, documentação de QA futuro, flags explícitas no CI e `.env.example`, e correção do teste RLS **branches** para não falhar quando `DATABASE_URL` está ausente (skip alinhado aos outros integrados).

---

## 2. O que foi desenvolvido / consolidado nesta entrega

- Workflow **03** exportado: schedule → HTTP GET candidatos → IF `RECALL_ENABLED` → Code → IF `source_appointment_id` → POST `/recall/send`; `active: false`.
- Endpoints recall (já existentes no código da sessão anterior): `GET /api/v1/recall/candidates`, `POST /api/v1/recall/send`, cancel/templates com RBAC `recall.*`.
- Testes: `customers.integration.test.ts`, `professionals.integration.test.ts` (incl. `addProfessionalServices` cross-tenant); `branches.rls.integration.test.ts` com `describe.skipIf(!DATABASE_URL)`.
- Documentação: `docs/ADR_PIX_PROVIDER.md`, `docs/QA_FUTURO_DEVQA_02.md`, `docs/N8N_WORKFLOW_03_ENDPOINTS.md`, atualização `docs/RISCOS_ACEITOS_GESTAO_DEVQA.md`.
- CI: `RECALL_ENABLED` e `PIX_REAL_PROVIDER_ENABLED` explícitos a `false` no job API.

---

## 3. Alterações por ficheiro (esta sessão)

| Ficheiro | Alteração |
|----------|-----------|
| `apps/api/src/modules/customers/customers.integration.test.ts` | Corpo de teste email inválido com `whatsapp_opt_in`. |
| `apps/api/src/modules/professionals/professionals.integration.test.ts` | `timezone` obrigatório; teste `addProfessionalServices` cross-tenant. |
| `apps/api/src/modules/branches/branches.rls.integration.test.ts` | Removido `throw` sem `DATABASE_URL`; `describe.skipIf`. |
| `.github/workflows/ci.yml` | Env `RECALL_ENABLED`, `PIX_REAL_PROVIDER_ENABLED`. |
| `docs/RISCOS_ACEITOS_GESTAO_DEVQA.md` | Secção DEV/QA-02 e histórico. |
| `docs/ADR_PIX_PROVIDER.md` | ADR PSP (novo). |
| `docs/QA_FUTURO_DEVQA_02.md` | Playbook QA futuro (novo). |
| `docs/N8N_WORKFLOW_03_ENDPOINTS.md` | Contrato workflow 03 (novo). |
| `scripts/audit-n8n-workflows.ps1` | Nota alinhada ao workflow 03 remediado. |
| `.env.example` | Flags `RECALL_ENABLED`, waitlist, `PIX_REAL_PROVIDER_ENABLED`. |
| `docs/RELATORIO_FINAL_DEVQA_02.md` | Este relatório. |

*(Implementação recall/services/rbac/workflow JSON referida no histórico da conversa anterior; validada por typecheck nesta sessão.)*

---

## 4. Endpoints criados/alterados (recall)

- `GET /api/v1/recall/candidates` — paginação, `only_sendable`, RBAC `readCandidates`.
- `POST /api/v1/recall/send` — registado em `server.ts` com prefixo `/api/v1`.
- `POST /api/v1/recall/cancel`, templates CRUD — RBAC recall.

*(Documentação detalhada: `docs/N8N_WORKFLOW_03_ENDPOINTS.md`.)*

---

## 5. Workflows alterados

- `n8n/workflows/03_recall_30_days_multitenant.json` — remediado (sessão anterior + verificação nesta).

---

## 6. Testes criados / ajustados

- `customers.integration.test.ts`
- `professionals.integration.test.ts` (+ cenário `addProfessionalServices`)
- `branches.rls.integration.test.ts` — comportamento skip sem BD

---

## 7. Testes executados (ambiente local do agente, 2026-05-03)

| Comando | Resultado |
|---------|-----------|
| `cd apps/api; npm run typecheck` | OK |
| `cd apps/api; npm run lint` | OK (warnings pré-existentes `no-explicit-any`) |
| `cd apps/api; npm run test:unit` | OK — 26 ficheiros, 109 testes |
| `cd apps/api; npm test -- …integration…` | OK — 4 ficheiros **skipped** (sem `DATABASE_URL` / `JWT_SECRET` / `REDIS_URL` onde aplicável) |
| `cd apps/web; npm run lint` | OK (5 warnings) |
| `cd apps/web; npm run typecheck` | OK |
| `cd apps/web; npm test` | OK — 21 testes |
| `cd apps/web; npm run build` | OK |

---

## 8. Testes não executados com BD real e motivo

| Comando previsto | Motivo |
|------------------|--------|
| `cd apps/api && npm test` (integração completa) | **Serviço ausente:** instância Postgres (e Redis para suites que o exigem) não configurada na variável `DATABASE_URL` / `REDIS_URL` neste ambiente do agente. |
| **Impacto:** integração end-to-end com RLS, recall com DB, waitlist não foi validada em runtime aqui. |
| **Recomendação QA:** usar Docker Compose do projeto ou CI (job `api` com Postgres 16 + Redis), exportar `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, aplicar migrations + seed conforme `ci.yml`, depois `npm test -- --coverage`. |

---

## 9. Logs de comandos (extrato)

**API typecheck:** `tsc --noEmit` — exit 0.  
**API test:unit:** `26 passed`, `109 passed`.  
**Integração subset:** `Test Files 4 skipped`, `Tests 18 skipped`.  
**Web build:** `✓ built in 2.23s`.

---

## 10. Resultado Gitleaks

**Comando:**  
`docker run --rm -v "<repo>:/repo" ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source=/repo --verbose --redact`

**Resultado:** `no leaks found`, exit 0.  
**Nota:** o output do Docker no Windows pode mostrar `1 commits scanned` conforme profundidade do clone local; no CI o job `gitleaks` usa `fetch-depth: 0` para histórico completo.

---

## 11. Resultado audit n8n

**Comando:** `powershell -File scripts/audit-n8n-workflows.ps1`

**Resultado:** workflows 01, 02, 03 com `active: False`; **nenhuma linha `[MATCH]`** para padrões bloqueados nos JSON listados.

---

## 12. Feature flags criadas/alteradas

| Flag | Default | Onde |
|------|---------|------|
| `RECALL_ENABLED` | false | `apps/api/src/config/env.ts`, CI, `.env.example` |
| `PIX_REAL_PROVIDER_ENABLED` | false | idem |
| `WAITLIST_SLOT_NOTIFY_ENABLED` | false | `.env.example` (documentação) |
| `WAITLIST_SWEEP_ENABLED` | false | `.env.example` (documentação) |
| Workflow 03 `active` | false | JSON exportado |

---

## 13. Riscos remanescentes

- QA formal, piloto e produção continuam **bloqueados** por decisão de gestão e falta de evidências runtime (n8n UI, E2E recall).
- PSP não escolhido: qualquer PIX real permanece proibido até ADR assinado pelo PO.
- Gitleaks local pode não refletir histórico Git completo se o clone for shallow.

---

## 14. Itens pendentes para QA futuro

Ver `docs/QA_FUTURO_DEVQA_02.md` (secções Workflow 03, Recall API, Customers, Professionals, Waitlist, Branches RLS, Gitleaks, n8n, PSP).

---

## 15. Recomendação de próximo pacote

1. Subir Postgres/Redis locais ou usar apenas CI para `npm test` integrado.  
2. Testes de integração **recall** (flag off/on, idempotência, outbox).  
3. Evidência UI n8n: workflows 02/03 **Active OFF**.  
4. Decisão PO sobre PSP → só então implementação de adapter real por detrás de `PIX_REAL_PROVIDER_ENABLED`.

---

## 16. Declaração obrigatória

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
