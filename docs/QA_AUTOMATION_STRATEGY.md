# Estratégia de testes automatizados — Barbearia SaaS

**Data:** 2026-05-25  
**Escopo:** piloto `piloto-staging-01` / PS-07.4 aceito / PS-08 Sprint 1 em andamento  
**Premissa:** credenciais e UUIDs vêm de `QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS/MASSA_DE_DADOS.md` — não duplicar secrets no código.

---

## 1. Stack identificada

| Camada | Tecnologia |
|--------|------------|
| Linguagem | TypeScript (monorepo) |
| API | Node.js 20+, **Fastify**, PostgreSQL 16 (RLS multitenant), Redis, Vitest 4 |
| Web | **React 19**, Vite, TanStack Query, Vitest + Testing Library + jsdom |
| Infra local | Docker Compose (`postgres`, `redis`, `api`, `web`, opcional `n8n`) |
| Automação browser | Playwright via scripts Node (`scripts/qa-browser/`) e **Robot Framework + Browser Library** (`tests/robot/`) |
| Regressão API operacional | PowerShell (`scripts/qa-piloto-staging-07-rodada3.ps1`, `revalidate-f08-gap01.ps1`) |
| CI | GitHub Actions `.github/workflows/ci.yml` |

---

## 2. Frameworks de teste (existentes e adicionados)

| Ferramenta | Uso |
|------------|-----|
| Vitest 4 | Unit + integração API; unit web |
| @vitest/coverage-v8 | Cobertura API (tenant global 78%; gate PS-06 novo) |
| Testing Library | Componentes e hooks web |
| Playwright (script) | E2E doc10 / P07 (`scripts/qa-browser/*.mjs`) |
| Robot Framework + `robotframework-browser` | Regressivo BDD PS-08 (`tests/robot/`) |
| PowerShell + helpers HTTP | Bateria 26 cenários API aceite |

**Adicionado nesta entrega:**

- `apps/api/vitest.ps06.config.ts` + `npm run test:coverage:ps06`
- Scripts raiz: `test:api:unit`, `test:api:integration`, `test:web`, etc.
- `tests/README.md`, `tests/support/test-env.md`
- Remoção de `Sleep` fixo na suíte Robot (waits explícitos)

---

## 3. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `docs/QA_AUTOMATION_STRATEGY.md` | Este relatório |
| `tests/README.md` | Índice central de testes |
| `tests/support/test-env.md` | Variáveis para CI/local |
| `apps/api/vitest.ps06.config.ts` | Gate cobertura módulos PS-06 |
| `tests/robot/**` | BDD + suíte regressiva (sessão anterior) |

---

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `package.json` (raiz) | Orquestração `test:api:*`, `test:web*` |
| `apps/api/package.json` | Script `test:coverage:ps06` |
| `tests/robot/resources/keywords/*.robot` | Waits em vez de `Sleep` |
| `tests/robot/tests/regressivo_ps08_doc10.robot` | Idem |

*(Demais alterações PS-08.1–08.3 em branch `feature/ps08-sprint1-p1` — ver PR #14.)*

---

## 5. Tipos de teste implementados / existentes

| Tipo | Onde | CI |
|------|------|-----|
| Unitário API | `apps/api/src/**/*.test.ts` (excl. `*.integration.test.ts`) | Sim (`test:unit`) |
| Integração API + DB/Redis | `**/*.integration.test.ts` (42 arquivos) | Sim (`npm test`) |
| RBAC / rotas | `authorization-routes.integration.test.ts`, `rbac.test.ts` | Sim |
| Multitenancy / RLS | `*.isolation.integration.test.ts`, `branches.rls.integration.test.ts` | Sim |
| Unitário Web | `apps/web/src/**/*.test.ts(x)` | Sim |
| E2E browser (Node) | `scripts/qa-browser/` | Não (manual/nightly sugerido) |
| E2E Robot | `tests/robot/tests/regressivo_ps08_doc10.robot` | Não |
| Regressão API PS-07 | `scripts/qa-piloto-staging-07-rodada3.ps1` | Não |
| BDD Gherkin (doc) | `tests/robot/docs/01_cenarios_bdd_ps08_doc10.md` | N/A |

---

## 6. Cobertura funcional (automação)

### API (Vitest integração — amostra verificada no repo)

- Auth: login, refresh, rate limit, tokens inválidos
- Appointments: lifecycle, calendar blocks, disponibilidade
- Customers, vehicles, car wash FSM, portal token
- Outbox: rotas + isolamento tenant
- Management dashboard, finance, commission, waitlist, recall (flags off em CI)
- Audit logs operacionais + isolamento
- WhatsApp inbound (mock Evolution em CI)

### Web (unitário)

- `apiErrorMessage` incl. `VEHICLE_PLATE_ALREADY_EXISTS` (PS-08.1)
- Componentes de agenda, layout, hooks de auth, etc. (19 arquivos / 66 testes)

### E2E / regressão operacional

- Doc10 Playwright: patio, outbox, login, RBAC parcial
- Robot: RF-01 a RF-05 (login, veículos C9/C10, patio FSM, outbox C26/C27, cliente 360, financeiro smoke)
- PowerShell Rodada 3: **26/26** cenários API documentados em `docs/evidencias/piloto_staging_07/rodada3/08_resultados_aceite.json`

---

## 7. Cenários críticos cobertos

| Domínio | Cenário | Automação |
|---------|---------|-----------|
| Auth | Login válido / inválido | Integração + E2E |
| RBAC | Atendente → gestão forbidden | Integração + Robot RF-01 |
| Multitenancy | Outbox/audit/users isolation | Integração |
| Veículos | Placa duplicada `VEHICLE_PLATE_ALREADY_EXISTS` | API + web unit + Robot C10 (toast Sonner) |
| Lava-rápido | FSM patio data QA | Seed PS1 + Playwright + Robot RF-03 |
| Outbox | Retry admin / sem retry atendente | Seed failed + Robot RF-04 |
| Portal | Token válido/inválido | Integração + scripts browser |
| Gestão | Dashboard sem 500 | Integração `management.dashboard` + Robot RF-01 |

---

## 8. Cenários que ainda exigem validação manual

| ID | Motivo |
|----|--------|
| C10 (doc10 Playwright histórico) | Toast Sonner — Playwright antigo marcava PEND; Robot usa `[data-sonner-toaster]` |
| C30 Portal | Depende token gerado em runtime |
| C34 n8n | Import workflows + UI n8n |
| C35/C36 Evolution | Integração externa bloqueada em ambiente local |
| GAP-02 | Política telefone duplicado — decisão PO pendente |
| GAP-03 | Perfil `viewer` ausente no seed |
| Responsividade mobile | Fora do escopo das suítes atuais |
| Pix / recall prod | Fora de escopo PS-08 |

---

## 9. Bugs e gaps encontrados

| Item | Severidade | Notas |
|------|------------|-------|
| Gate `test:coverage:ps06` | Gap processo | **~13% linhas** nos módulos PS-06 com testes unitários atuais; meta PO **82%** não atingida — exige testes em `service.ts` (management, portal, carWash, vehicles, customers/overview) |
| Redis porta 6380 em dev | Ambiente | Conflito com outros stacks; documentado em scripts QA |
| Migrations 105–106 | Ambiente | Tabelas `customer_vehicles` / `car_wash_jobs` exigem migrate antes de E2E |
| C10 Playwright legado | Automação | Alinhar script `qa-junior-doc10.mjs` ao seletor Sonner (como Robot) |

Nenhum bug de regra de negócio foi alterado para “fazer passar” teste nesta entrega.

---

## 10. Riscos técnicos

1. **E2E fora do CI** — regressões visuais só aparecem em rodadas manuais de piloto.
2. **Cobertura PS-06** — threshold 82% configurado mas falha até expansão da suíte unitária.
3. **Dependência Docker + seeds** — E2E não é hermético sem `qa-seed-*.ps1`.
4. **Duplicação Playwright vs Robot** — dois drivers para fluxos similares; manter keywords DRY entre `scripts/qa-browser` e `tests/robot`.
5. **PowerShell no Windows** — scripts de aceite não rodam igual em Linux sem adaptação (CI usa Vitest, não PS1).

---

## 11. Comandos para executar testes

### Instalação

```powershell
npm run install:all
# Robot (opcional):
cd tests/robot
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
rfbrowser init
```

### Unitários (rápido, sem DB)

```powershell
npm run test:api:unit    # 199 testes (snapshot local 2026-05-25)
npm run test:web         # 66 testes
```

### Integração API (PostgreSQL + Redis)

```powershell
# Com serviços CI-equivalentes — ver tests/support/test-env.md
cd apps/api
npm test
npm run test:coverage
```

### Gate cobertura PS-06 (aspiracional 82%)

```powershell
npm run test:api:coverage:ps06
# Estado atual: FALHA em thresholds (~13% linhas) — esperado até novos testes
```

### E2E Playwright (stack Docker up)

```powershell
.\scripts\qa-seed-car-wash-patio.ps1
.\scripts\qa-seed-outbox-failed.ps1
node scripts/qa-browser/qa-junior-doc10.mjs
```

### Robot regressivo

```powershell
cd tests/robot
robot -d results tests/regressivo_ps08_doc10.robot
```

### Regressão API 26 cenários

```powershell
.\scripts\qa-piloto-staging-07-rodada3.ps1
```

---

## 12. Sugestões para pipeline CI/CD

1. **Manter** job atual `api` (unit + integration + coverage tenant 78%).
2. **Adicionar job opcional** `api-coverage-ps06` com `continue-on-error: true` até atingir 82%, depois tornar obrigatório.
3. **Job nightly `browser-smoke`** (self-hosted ou `ubuntu` + `docker compose`):
   - `compose up -d`
   - seeds PS-08
   - `node scripts/qa-browser/qa-junior-doc10.mjs` com artefatos upload
4. **Branch filters** — incluir `feature/ps08-*` em `ci.yml` `on.push.branches` (padrão já usado para piloto-staging).
5. **Não** commitar `tests/robot/results/` — já em `.gitignore`.
6. **Gitleaks + audit** — já presentes; manter.

---

## 13. Próximos passos (QA + Dev)

| Prioridade | Ação | Responsável |
|------------|------|-------------|
| P1 | Testes unitários `management/service.ts`, `portal/service.ts`, `carWash/service.ts`, `vehicles/service.ts`, `customers/overview.ts` até gate 82% | Dev |
| P1 | Alinhar `qa-junior-doc10.mjs` C10 com seletor Sonner (paridade Robot) | QA Auto |
| P2 | Job CI nightly browser-smoke com artefatos em `docs/evidencias/` | DevOps |
| P2 | Executar Robot em pipeline após `rfbrowser init` documentado | QA |
| P3 | Perfil `viewer` no seed (GAP-03) + testes RBAC read-only | PO + Dev |
| P3 | Unificar helpers HTTP PS1 entre PowerShell e Node (`scripts/lib/qa-api-helpers.ps1` já existe) | QA Auto |
| PO | Fechar `docs/evidencias/piloto_staging_08/01_relatorio_entrega_ps08_sprint1.md` com prints | QA humano |

---

## Mapa de pastas de teste (padrão do projeto)

```
apps/api/src/**/**/*.test.ts          # co-localizado (padrão dominante)
apps/web/src/**/**/*.test.tsx
scripts/qa-browser/                   # E2E Playwright scripts
scripts/qa-*.ps1                      # regressão API + seeds
tests/
  README.md
  support/test-env.md
  robot/                              # BDD + RF regressivo
docs/QA_AUTOMATION_STRATEGY.md        # este documento
docs/evidencias/piloto_staging_*/     # evidências humanas + JSON resultados
```

**Princípio:** não criar árvore `tests/unit` paralela à API — respeitar co-localização Vitest; `tests/` centraliza apenas cross-cutting (Robot, docs, support).

---

## Execução local verificada (2026-05-25)

| Comando | Resultado |
|---------|-----------|
| `npm run test:api:unit` | 47 files, **199 passed** |
| `npm run test:web` | 19 files, **66 passed** |
| `npm run test:api:coverage:ps06` | 21 tests passed; **thresholds FAIL** (~13% lines) |

Integração API completa requer `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` (ver CI ou Docker).
