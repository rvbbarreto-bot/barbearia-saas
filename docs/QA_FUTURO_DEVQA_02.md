# QA futuro — pacote DEV/QA-02

Checklist para execução **posterior** por QA (ou CI completo com segredos de sandbox). Toda feature listada está **DEV/QA** até evidência formal.

## Pré-requisitos gerais

- Postgres + Redis alinhados ao `.env.example`.
- `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` definidos.
- Migrations aplicadas na ordem lexicográfica.
- Seed opcional conforme cenário.

## Workflow 03 (n8n)

- **Objetivo:** recall apenas via Core API.
- **Pré-requisitos:** JWT de manager; `RECALL_ENABLED=true` na API **e** variável equivalente no n8n; templates aprovados; `tenant_integrations` com `instance_name` se for processar outbox.
- **Comandos:** `powershell -File scripts/audit-n8n-workflows.ps1` — workflow 03 não deve listar `[MATCH]` postgres/sendText/Evolution.
- **Cenários:** (1) `RECALL_ENABLED=false` → GET candidatos OK, ramo “desligado”; (2) `true` com candidatos sendable → POST retorna `{ result }`.
- **Não testado aqui:** importação real no n8n UI; envio WhatsApp real (proibido).

## Recall API

- **Endpoints:** `GET /api/v1/recall/candidates`, `POST /api/v1/recall/send`, `POST /recall/cancel`, templates CRUD existentes.
- **Flags:** `RECALL_ENABLED` (default false).
- **Testes:** `npm test` com BD; validar 403 em `/recall/send` com flag false.
- **RBAC:** `recall.*` em `rbac.ts` — validar perfil viewer vs manager.

## Customers — integração

- **Ficheiro:** `apps/api/src/modules/customers/customers.integration.test.ts`
- **Comando:**  
  `cd apps/api && npm test -- src/modules/customers/customers.integration.test.ts`
- **Cenários:** criar/listar/obter; email inválido; isolamento tenant.

## Professionals — integração

- **Ficheiro:** `apps/api/src/modules/professionals/professionals.integration.test.ts`
- **Comando:**  
  `cd apps/api && npm test -- src/modules/professionals/professionals.integration.test.ts`
- **Cenários:** criar com serviço; rejeitar serviço de outro tenant; addProfessionalServices cross-tenant; get cross-tenant 404.

## Waitlist / Branches RLS (regressão)

- `waitlist.integration.test.ts`, `branches.rls.integration.test.ts`
- **Comando:**  
  `npm test -- src/modules/waitlist/waitlist.integration.test.ts src/modules/branches/branches.rls.integration.test.ts`
- **Sem `DATABASE_URL`:** o suite `branches` é **skipped** (não falha a recolha de testes). Com BD: exportar `DATABASE_URL` e correr o comando acima.

## Gitleaks

- **Comando (Docker):**  
  `docker run --rm -v "%CD%":/repo ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source=/repo --verbose --redact`
- **Esperado:** exit 0, sem leaks (ajustar allowlist só com justificativa).

## n8n — auditoria estática

- `scripts/audit-n8n-workflows.ps1`
- **Esperado:** workflow 02 sem padrões bloqueados; workflow 03 sem Postgres/Evolution diretos.

## PSP

- **Documento:** `docs/ADR_PIX_PROVIDER.md`
- **QA:** validar que `PIX_REAL_PROVIDER_ENABLED` permanece false até decisão PO.

## Critérios globais de aceite QA

- [ ] CI remoto verde (API + Web + Gitleaks).
- [ ] Prints n8n 02/03 **Active=OFF** (runtime).
- [ ] Nenhum segredo em repositório ou JSON de workflow.
- [ ] P0 governança atualizado e riscos aceitos revistos.

---

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
