# Relatório final — DEV/QA-03

**Data de referência:** 2026-05-03  
**Ambiente:** máquina de desenvolvimento Windows (execução local dos comandos abaixo).

---

## 1. Resumo executivo

Foi fechado o ciclo técnico DEV/QA-03 focado em **testabilidade** (harness Docker + Vitest com env nos workers), **correção de testes de integração** sob role `barbearia_app` (RLS com `app.tenant_id`), e **documentação** de apoio a QA futuro. Integração API (branches, waitlist, customers, professionals, recall) executa **sem skips** quando o harness está ativo. Gitleaks e auditoria estática n8n foram corridos nesta sessão com resultado limpo / sem bloqueadores reportados pelo script.

---

## 2. Escopo entregue (nesta continuidade)

- Harness PowerShell + shell; logs em `artifacts/devqa-03/`.
- `vitest.config.ts`: `test.env` reencaminha variáveis de integração aos workers (corrige skips no Windows).
- Util `src/test-utils/with-app-tenant.ts` e ajustes em testes de integração (fixtures + consultas sob RLS).
- Script: loop `pg_isready` tolerante a stderr durante arranque do Postgres.
- Documentação: `QA_FUTURO_DEVQA_03.md`, este relatório, atualização de `RISCOS_ACEITOS_GESTAO_DEVQA.md` e `N8N_WORKFLOW_03_ENDPOINTS.md` (IF `notEquals`).

---

## 3. Ficheiros alterados / criados (principais)

- `scripts/run-api-integration-local.ps1`
- `apps/api/vitest.config.ts`
- `apps/api/src/test-utils/with-app-tenant.ts` (novo)
- `apps/api/src/modules/professionals/professionals.integration.test.ts`
- `apps/api/src/modules/waitlist/waitlist.integration.test.ts`
- `apps/api/src/modules/recall/recall.integration.test.ts`
- `docs/QA_FUTURO_DEVQA_03.md`, `docs/RELATORIO_FINAL_DEVQA_03.md`
- `docs/RISCOS_ACEITOS_GESTAO_DEVQA.md`, `docs/N8N_WORKFLOW_03_ENDPOINTS.md`

*(Outros ficheiros do pacote DEV/QA-03 anterior — OpenAPI, recall gate, workflow JSON, etc. — permanecem no repositório conforme já integrado.)*

---

## 4. Scripts criados / relevantes

| Script | Função |
|--------|--------|
| `scripts/run-api-integration-local.ps1` | Postgres 16 + Redis 7, migrations, typecheck, lint, unit, integração mínima, log |
| `scripts/run-api-integration-local.sh` | Equivalente Unix |

---

## 5. Endpoints / OpenAPI

OpenAPI/Swagger em DEV: ver implementação em `apps/api` (`registerOpenApi`, `/docs`). Detalhe de rotas no código e no documento OpenAPI estático — não duplicado aqui.

---

## 6. Workflows n8n

- Export **03** alinhado à Core API; `active=false`.
- Auditoria PowerShell: sem `[MATCH]` bloqueador na saída desta execução.

**Importação UI:** não executada nesta sessão automatizada; permanece ação recomendada ao operador antes de QA formal (ver `docs/N8N_WORKFLOW_03_ENDPOINTS.md`).

---

## 7–9. Testes criados / executados / skipped

| Métrica | Valor (última corrida bem-sucedida do harness) |
|---------|--------------------------------------------------|
| Ficheiros integração | 5 |
| Testes | **19 passed**, **0 failed**, **0 skipped** |
| Comando | `vitest run` sobre os 5 paths listados no script |

**Motivo de skips fora do harness:** sem `DATABASE_URL` / `JWT_SECRET` / `REDIS_URL`, os `describe.skipIf` continuam a ignorar suites (comportamento intencional).

---

## 10. Logs de integração

Exemplo de ficheiro gerado: `artifacts/devqa-03/integration-b74dd69c27.log` (nome varia por execução; o script regista o path no fim).

---

## 11. Gitleaks (local)

```text
docker run --rm -v ${PWD}:/repo ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source=/repo --verbose --redact
```

**Resultado desta execução:** `no leaks found` (exit 0).

---

## 12. Auditoria n8n

```powershell
powershell -ExecutionPolicy Bypass -File scripts/audit-n8n-workflows.ps1
```

**Resultado desta execução:** exit 0; mensagens informativas; workflows 01–03 com `active=false` no export.

---

## 13. Importação workflow 03 (n8n UI)

**Estado:** evidência de import na UI **não** produzida nesta sessão automatizada. O JSON versionado foi mantido/remediado em iterações anteriores; operador deve importar na instância n8n da versão do projeto e confirmar o IF e os nós HTTP.

---

## 14. Feature flags (relembranço)

- `RECALL_ENABLED` — default **false** em produção alvo; harness força **true** para testes recall.
- `PIX_REAL_PROVIDER_ENABLED` — default **false**; sem PSP real.
- `WAITLIST_SWEEP_ENABLED` / `WAITLIST_SLOT_NOTIFY_ENABLED` — false no harness onde aplicável.

---

## 15. Riscos remanescentes

Ver `docs/RISCOS_ACEITOS_GESTAO_DEVQA.md` (secção 4.2 DEV/QA-03): CI remoto com a mesma matriz, import UI n8n, PSP/PIX real, homologação formal.

---

## 16. Itens pendentes para QA futuro

- QA formal com critérios de produto e massa acordada.
- E2E e evidências n8n em ambiente de controlo.
- Scan Gitleaks no remoto com histórico completo.

---

## 17. Recomendação — próximo pacote

- Ligar harness (ou job CI) ao repositório remoto com Docker-in-Docker ou runner self-hosted.
- Evidência de import n8n 03 (screenshot + versão n8n).
- Frontend de baixo risco apenas com RoleGuard + testes de componente, se prioridade PO.

---

## 18. Declaração obrigatória

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
