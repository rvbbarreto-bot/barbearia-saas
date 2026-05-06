# QA futuro — referência pós DEV/QA-03

**Classificação:** preparação técnica para QA formal futuro. Não substitui QA nem homologação.

## 1. Executar integração API com Postgres + Redis reais (local)

**Windows (recomendado):**

```powershell
cd <repo>
powershell -ExecutionPolicy Bypass -File scripts/run-api-integration-local.ps1
```

Opções:

- `-KeepAlive` — mantém contentores Docker no fim (depuração).
- `-ApplySeed` — aplica `database/seeds/001_demo.sql` (por defeito **não**; pode colidir com dados dos testes).

**Linux/macOS:**

```bash
cd <repo>
bash scripts/run-api-integration-local.sh
# com seed: APPLY_SEED=1 bash scripts/run-api-integration-local.sh
```

## 2. Variáveis definidas pelo harness

O script define (entre outras): `DATABASE_URL` (role **`barbearia_app`** — RLS ativo), `REDIS_URL`, `JWT_SECRET`, `NODE_ENV=test`, `RECALL_ENABLED=true`, `PIX_REAL_PROVIDER_ENABLED=false`, `WAITLIST_SWEEP_ENABLED=false`, `WAITLIST_SLOT_NOTIFY_ENABLED=false`.

## 3. Testes de integração incluídos no harness

- `src/modules/branches/branches.rls.integration.test.ts`
- `src/modules/waitlist/waitlist.integration.test.ts`
- `src/modules/customers/customers.integration.test.ts`
- `src/modules/professionals/professionals.integration.test.ts`
- `src/modules/recall/recall.integration.test.ts`

**Critério:** com Docker disponível e script completo, os testes **não** devem ficar skipped por falta de `DATABASE_URL` (env é reenviada aos workers via `apps/api/vitest.config.ts`).

## 4. Massa e cenários

Os testes criam tenants e dados com UUIDs aleatórios; não dependem do seed demo. Para cenários manuais adicionais, ver massa mínima descrita nos comentários de cada ficheiro `*.integration.test.ts`.

## 5. O que ainda exige QA humano

- Importação do workflow **03** na instância n8n da versão em uso no projeto (validação UI do IF e dos nós HTTP).
- E2E browser, carga, regressão de produto, acessibilidade.
- Decisão PSP / PIX real (`PIX_REAL_PROVIDER_ENABLED`).

## 6. Documentação relacionada

- `docs/N8N_WORKFLOW_03_ENDPOINTS.md`
- `docs/RISCOS_ACEITOS_GESTAO_DEVQA.md`
- `docs/RELATORIO_FINAL_DEVQA_03.md`

---

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
