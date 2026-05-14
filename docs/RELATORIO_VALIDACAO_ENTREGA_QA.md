# Relatório de validação — entrega QA funcional (template)

Este documento resume o estado da entrega após correções de reprodutibilidade, login, seed, healthchecks e documentação.

## 1. Resumo executivo

Preencher após execução manual completa no ambiente do QA:

- **Parecer:** APTO / NÃO APTO para QA funcional (checklist PO).
- **Nota:** Correções de código e documentação podem estar **APTO para revisão técnica**, enquanto E2E (login no browser, agenda, n8n) exige validação humana.

## 2. Correções entregues nesta iteração (engenharia)

| Área | Alteração |
|------|-----------|
| Login | API: `tenant_id` opcional; sem tenant, resolve por e-mail se existir **um** utilizador ativo; vários tenants → `400 TENANT_REQUIRED`. |
| Front | `POST /auth/login` **sem** chave `tenant_id` quando o campo está vazio (payload mínimo `{ email, password }`). |
| Seed Docker | Migration `099_demo_seed_qa.sql` para dados demo no primeiro boot do Postgres (volume vazio). |
| Tenants / SQL | Documentação alinhada ao schema: `legal_name`, `trade_name` (não existe `name` em `tenants`). |
| Web container | Imagem NGINX com `curl`; healthcheck via `127.0.0.1`. |
| n8n container | Healthcheck com Node + Basic Auth (evita falha por `wget` sem credenciais); `start_period`/`retries` aumentados. |
| Docs | `docs/QA_AMBIENTE_LOCAL.md`: volumes/senha Postgres, login opcional, CORS; `QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS` atualizado. |
| Tenants (RBAC) — cenário A fechado | **`GET|POST /api/v1/tenants`** platform-scoped: **`tenantMiddleware`** deixa **`platform_admin`** (JWT `tenant_id` null) **sem** `x-tenant-id` → **200**. Relatório: `docs/ENTREGA_CENARIO_A_TENANTS_PLATFORM.md`. Seed: `100_platform_admin_qa_seed.sql`. Cobertura Vitest (ficheiros `tenant.ts` + `tenants/service.ts`): **≥78%**. Postman: pedido **sem** header + opcional com header. |
| Dashboard (regra PO) | Com resposta OK e zero no-shows no dia: mostra **0**. Em **falha técnica** (`isError`): mostra **—**, *tooltip* explicando que não é zero real, e **`console.error`** com detalhe. |
| Agendamentos | `GET /api/v1/appointments/:id` implementado (alinha com o portal). Modal de novo agendamento envia **`explicit_confirmation: true`** para permitir fluxo **Confirmar** na UI. |
| Dashboard | Card “No-show hoje”: intervalo em **ISO UTC**; contagem tolerante a payload incompleto; em falha de rede/API o valor mostrado é **0** com *tooltip* “Indicador temporariamente indisponível” (deixa de aparecer o texto cru **erro**). |

## 3. URLs oficiais

| Componente | URL |
|------------|-----|
| Portal (Compose) | http://localhost:3001 |
| Portal (Vite) | http://localhost:5173 (porta seguinte se ocupada) |
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |
| n8n (host) | http://localhost:5679 → container porta interna **5678** |
| Health | http://localhost:3000/health |
| Database health | http://localhost:3000/database/health |
| Ready | http://localhost:3000/health/ready |

## 4. Credenciais demo (sem segredo de produção)

| Item | Valor |
|------|--------|
| Admin | `admin@demo.local` / `admin12345` |
| Tenant UUID | `00000000-0000-0000-0000-000000000001` |
| n8n Basic Auth | conforme `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD` no `.env` |

## 5. Evidências (preencher pelo QA)

- [ ] `docker compose config`
- [ ] `docker compose down -v` + `docker compose up -d --build` (aceite PO — ambiente limpo)
- [ ] `docker compose ps` (todos healthy)
- [ ] Curl `/health`, `/database/health`, `/health/ready`
- [ ] Login portal + dashboard
- [ ] Fluxo agenda (criar / confirmar / remarcar / cancelar)
- [ ] n8n UI + import workflow + reflexo no portal

**Colha parcial (engenharia, 2026-05-09):** ver `QA_PACKAGE_BARBEARIA/06_EVIDENCIAS/EVIDENCIA_OPERACIONAL_STACK_2026-05-09.md` (health 200, `compose ps` healthy, tenants RBAC com API real após migration 100). **Não** substitui prints nem `down -v` anexados pelo QA.

## 6. Pendências típicas

| Nível | Exemplo |
|-------|---------|
| Bloqueante | Volume Postgres antigo sem migration 099 → seed ausente (`migrate.sh` ou `down -v`). |
| Alta | Browser/E2E não executado nesta máquina CI. |
| Média | Atendente demo não está no seed — criar via API se necessário. |

---

**Declaração:** Ambiente DEV/QA local; não representa produção nem GA.
