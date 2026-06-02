# Matriz CRUD + RBAC — Portal Web Barbearia SaaS V2

**Data:** 2026-05-18  
**Ambiente:** Docker local — `http://localhost:3001/login`  
**API (proxy NGINX):** `http://localhost:3001` → `barbearia-api:3000`  
**Tenant demo:** `00000000-0000-0000-0000-000000000001`  
**Executor:** QA Sênior (código + API + Playwright browser)  
**Última execução browser:** 2026-05-18T20:31Z — ver `07_resultados_browser.json` e `prints/`

---

## 1. Resumo executivo

| Área | Resultado |
|------|-----------|
| Ambiente (web/api) | **OK** — rebuild `docker compose build web` + recreate (bundle com Gestão/360/Portal) |
| Navegação browser (23 cenários) | **22 OK · 0 FAIL · 1 PEND** — Playwright `scripts/qa-browser/portal-p07.spec.mjs` |
| Login 3 perfis seed | **OK** — owner, attendant, professional |
| Testes unitários RBAC web | **OK** — 13/13 |
| CRUD API (amostra) | **OK** com ressalvas — ver §6 |
| DELETE físico no portal | **N/A** |
| Agendamento E2E (wizard até slot) | **PEND** — C23; validar slot disponível manualmente |
| Portal token (DB) | **OK** UI erro amigável · **BLOCKED** token válido — falta migration `appointment_portal_tokens` |

---

## 2. Perfis e credenciais

| Perfil | E-mail | Senha | Role confirmado (`/api/v1/me`) |
|--------|--------|-------|--------------------------------|
| Proprietário / gestão | `admin@demo.local` | `admin12345` | `tenant_owner` |
| Atendente | `atendente@demo.local` | `admin12345` | `attendant` |
| Profissional | `fred.barbeiro@demo.local` | `admin12345` | `professional` |
| Platform (API global) | `platform.admin@demo.local` | `admin12345` | `platform_admin` |

**Gap de massa:** usuário `viewer` não está no seed padrão — registrar `PEND MASSA QA` para regressivo RBAC somente-leitura.

---

## 3. Mapa de rotas do portal

| Rota | Tela | `minRole` (RoleGuard / menu) |
|------|------|------------------------------|
| `/login` | Login | Público |
| `/portal/:token` | Portal cliente (token) | Público |
| `/dashboard` | Dashboard | `viewer` |
| `/agenda` | Agenda | `viewer` (ações: ver §4.1) |
| `/conversas` | Tickets suporte | `attendant` |
| `/clientes` | Clientes | `attendant` |
| `/clientes/:id/360` | Cliente 360 | `attendant` |
| `/lista-espera` | Lista de espera | `attendant` |
| `/operacao/mensagens` | Outbox WhatsApp | `attendant` |
| `/servicos` | Serviços | `manager` |
| `/profissionais` | Profissionais | `manager` |
| `/configuracoes` | Configurações / logout | `manager` |
| `/gestao/dashboard` | Gestão | `manager` |
| `/operacao/financeiro` | Financeiro | `manager` |
| `/operacao/auditoria` | Auditoria operacional | `manager` |
| `/operacao/comissao` | Comissões | `manager` |
| `/auditoria` | Audit logs (tenant) | `tenant_admin` |
| `/veiculos` | Veículos | `attendant` (só vertical `car_wash`) |
| `/operacao/lava-rapido` | Pátio lava-rápido | `attendant` (só `car_wash`) |
| `/forbidden` | Acesso negado | Todos autenticados |

Fonte: `apps/web/src/router/index.tsx`, `apps/web/src/config/nav.ts`.

---

## 4. Matriz CRUD por módulo (portal → API)

Legenda operação: **C** create · **R** read/list · **U** update · **D** delete — **D** = não exposto na UI (soft-delete ou cancelamento).

### 4.1 Agenda (`/agenda`)

| Operação | UI | Endpoint | RBAC API mínimo | Owner | Attendant | Professional |
|----------|-----|----------|-----------------|-------|-----------|--------------|
| R | Calendário / lista | `GET /api/v1/appointments` | `viewer` | ✅ | ✅ | ✅ |
| C | Novo agendamento | `POST /api/v1/appointments` | `attendant` | ✅ | ✅ | ❌ API **403** (PS-07.2); UI bloqueia (`canBook`) |
| C | Hold temporário | `POST /api/v1/appointment-holds` | `attendant` | — | — | — |
| U | Confirmar | `PATCH .../confirm` | `attendant` | ✅ | ✅ | — |
| U | Check-in / Start | `PATCH .../check-in`, `.../start` | `attendant` | ✅ | ✅ | — |
| U | Concluir | `PATCH .../complete` | `professional` | — | — | ✅ (após check-in) |
| U | Cancelar | `PATCH .../cancel` | `attendant` | ✅ | ✅ | — |
| U | Remarcar | `PATCH .../reschedule` | `attendant` | ✅ | ✅ | — |
| U | No-show | `PATCH .../no-show` | `attendant` (não `professional`) | — | ✅ UI | ❌ UI |
| C | Bloqueio calendário | `POST /api/v1/calendar-blocks` | `manager` (UI) | ✅ manager+ | ❌ UI | ❌ UI |
| D | — | — | — | N/A | N/A | N/A |

**Negativos executados (API):**

- Data passada → **422** `VALIDATION`/regra de slot
- No-show em status inválido → **400**
- Complete sem check-in → **409** `INVALID_STATUS_TRANSITION`
- Login senha errada → **400**

### 4.2 Clientes (`/clientes`, `/clientes/:id/360`)

| Operação | Endpoint | Owner | Attendant | Professional |
|----------|----------|-------|-----------|--------------|
| R | `GET /api/v1/customers` | ✅ | ✅ | ✅ |
| C | `POST /api/v1/customers` | ✅ **200** | ✅ **200** | ✅ **200** |
| U | `PATCH /api/v1/customers/:id` | ✅ | ✅ | ✅ |
| R | Histórico 360 | `GET` appointments por cliente | ✅ | ✅ | ✅ |
| D | — | N/A | N/A | N/A |

**Borda:** telefone duplicado no seed (`5511999990001`) retornou **200** na execução — validar se política é upsert ou se falta **409** (registrar como ressalva).

### 4.3 Serviços (`/servicos`)

| Operação | Endpoint | Owner | Attendant | Professional |
|----------|----------|-------|-----------|--------------|
| R | `GET /api/v1/services` | ✅ | ✅ | ✅ |
| C | `POST /api/v1/services` | ✅ **200** | ❌ **403** | ❌ **403** |
| U | `PATCH /api/v1/services/:id` | ✅ (manager+) | ❌ rota/UI | ❌ |
| D | Desativar (`active: false`) | U | — | — |

UI: botão "Novo Serviço" só com `useRoleGate('manager')`.

### 4.4 Profissionais (`/profissionais`)

| Operação | Endpoint | Owner | Attendant |
|----------|----------|-------|-----------|
| R | `GET /api/v1/professionals` | ✅ | ✅ (lista) |
| C | `POST /api/v1/professionals` | ✅ | ❌ UI |
| U | `PATCH /api/v1/professionals/:id` | ✅ | ❌ UI |
| C/U | Business hours | `POST/PATCH .../business-hours` | ✅ manager | ❌ UI |

### 4.5 Lista de espera (`/lista-espera`)

| Operação | Endpoint | Attendant+ |
|----------|----------|------------|
| R | `GET /api/v1/waitlist` | ✅ |
| C | `POST /api/v1/waitlist` | ✅ |
| U | `PATCH .../cancel` | ✅ |
| U | `POST .../convert` | ✅ |

### 4.6 Conversas / tickets (`/conversas`)

| Operação | Endpoint |
|----------|----------|
| R | `GET /api/v1/support-tickets` |
| C | `POST /api/v1/support-tickets` |
| U | `PATCH .../claim`, `POST .../messages`, `PATCH .../close` |

### 4.7 Outbox (`/operacao/mensagens`)

| Operação | Endpoint | Attendant | Manager/Owner |
|----------|----------|-----------|---------------|
| R | `GET /api/v1/outbox/messages` | ✅ **200** | ✅ |
| U | `POST .../retry` | ❌ **403** | ✅ (404 se ID inexistente) |

### 4.8 Financeiro (`/operacao/financeiro`)

| Operação | Endpoint | Owner | Attendant |
|----------|----------|-------|-----------|
| R | `GET /api/v1/finance/appointments` | ✅ **200** | ✅ **200** |

Portal: somente listagem; liquidação/desconto via API (não mapeado em `financeiroService.ts`).

### 4.9 Comissões (`/operacao/comissao`)

| Operação | Endpoint | Owner | Attendant |
|----------|----------|-------|-----------|
| R | `GET /api/v1/commission/entries` | ✅ **200** | ❌ **403** |

Menu: oculto para `attendant` (`nav.test.ts`).

### 4.10 Auditoria

| Tela | Endpoint | Owner | Attendant |
|------|----------|-------|-----------|
| Operacional `/operacao/auditoria` | `GET /api/v1/operational-audit/events` | ✅ **200** | ❌ **403** |
| Tenant `/auditoria` | `GET /api/v1/audit-logs` | ✅ **200** | ❌ **403** |

### 4.11 Gestão (`/gestao/dashboard`)

| Operação | Endpoint | Owner | Attendant |
|----------|----------|-------|-----------|
| R | `GET /api/v1/management/dashboard` | **400** (params) | **403** |

Requer query de período na UI; teste API sem params → 400 esperado.

### 4.12 Configurações (`/configuracoes`)

| Operação | Endpoint |
|----------|----------|
| R | `GET /api/v1/me` |
| — | Logout `POST /auth/logout` |

Sem CRUD de tenant/usuários na UI atual.

### 4.13 Veículos + Lava-rápido (vertical `car_wash`)

| Módulo | C | R | U | D |
|--------|---|---|---|---|
| Veículos | `POST /api/v1/vehicles` | `GET` | `PATCH` | N/A |
| Pátio | transições job | `GET` jobs | `PATCH .../action` | N/A |
| Checklist | `POST .../checklists` | — | — | — |

Ativar vertical: SQL em `05_roteiro_qa_regressivo_barbearia_lava_rapido_bdd.md` §5.

### 4.14 Autenticação

| Cenário | Resultado executado |
|---------|---------------------|
| Login válido | **200** + tokens |
| Senha inválida | **400** |
| `/api/v1/me` sem token | **401** (não reexecutado; coberto em `CENARIOS_DE_TESTE_QA.md`) |
| Acesso rota `/servicos` como attendant (browser) | Esperado redirect **`/forbidden`** |

---

## 5. Matriz de menu por perfil (sidebar)

| Item | viewer | attendant | professional | manager | tenant_owner |
|------|--------|-----------|--------------|---------|--------------|
| Dashboard, Agenda | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conversas, Clientes, Lista espera, Mensagens | ❌ | ✅ | ✅* | ✅ | ✅ |
| Serviços, Profissionais, Gestão, Financeiro, Auditoria op., Comissões, Config | ❌ | ❌ | ❌ | ✅ | ✅ |
| Auditoria tenant | ❌ | ❌ | ❌ | ❌ | ✅ (`tenant_admin`+) |

\*Professional vê itens `attendant+` no menu, mas ações na agenda são restritas na UI.

---

## 6. Ressalvas e gaps (prioridade)

| ID | Severidade | Descrição |
|----|------------|-----------|
| GAP-01 | — | **Fechado** PS-07.2 — `professional` negado em `APPOINTMENTS_BALCAO_ACTIONS` |
| GAP-02 | Baixa | Telefone duplicado em `POST /customers` retornou 200 — confirmar regra de negócio |
| GAP-03 | Info | Sem usuário `viewer` no seed — bloqueia regressivo leitura pura |
| GAP-04 | Info | Lifecycle completo (confirm→check-in→start→complete) depende de **slot disponível**; falhas **409/422** em horário inválido são esperadas |
| GAP-05 | Info | Prints manuais pendentes em `docs/evidencias/piloto_staging_07/prints/` |

---

## 7. Plano de execução manual (complementar)

Ordem recomendada (detalhes BDD em `05_roteiro_qa_regressivo_barbearia_lava_rapido_bdd.md`):

1. Login admin → smoke menu completo → print P07_01  
2. Repetir com atendente e profissional → validar `/forbidden` em rotas manager  
3. CRUD clientes, serviços, profissionais (UI)  
4. Agenda: criar → confirmar → check-in → start → complete  
5. Outbox, auditoria, financeiro, comissão, waitlist  
6. Vertical lava-rápido (se escopo)  
7. Portal tokenizado `/portal/:token`  
8. Consolidar matriz de status OK/FAIL/PEND/BLOCKED

---

## 8. Comandos de verificação rápida

```powershell
# Saúde
Invoke-WebRequest http://localhost:3001/login -UseBasicParsing
Invoke-WebRequest http://localhost:3000/health -UseBasicParsing

# Testes unitários RBAC web
cd apps/web
npm test -- --run src/lib/route-access.test.ts src/config/nav.test.ts src/features/agenda/appointmentActionsVisibility.test.ts
```

---

## 9. Matriz de execução browser (OK/FAIL)

| ID | Cenário | Status | Evidência |
|----|---------|--------|-----------|
| C01 | Login admin + menu gestão | **OK** | `P07_01_login_admin.png` |
| C02 | Login senha inválida | **OK** | `P07_01b_login_invalido.png` |
| C03 | Atendente `/gestao/dashboard` → forbidden | **OK** | `P07_18_forbidden_attendant.png` |
| C04 | Atendente menu sem Serviços | **OK** | `P07_18b_menu_attendant.png` |
| C05 | Profissional sem Novo agendamento | **OK** | `P07_02b_agenda_professional.png` |
| C06 | Admin modal Novo Agendamento | **OK** | `P07_02_agenda_modal.png` |
| C07 | CRUD Cliente criar (attendant) | **OK** | `P07_03_clientes_create.png` |
| C08 | Cliente 360 navegação | **OK** | `P07_03_cliente_360.png` |
| C09 | Serviços botão Novo (owner) | **OK** | `P07_servicos_owner.png` |
| C10 | Profissionais listagem | **OK** | `P07_profissionais.png` |
| C11 | Dashboard gestão (owner) | **OK** | `P07_04_dashboard_gestao.png` |
| C12 | Financeiro (owner) | **OK** | `P07_11_financeiro.png` |
| C13 | Comissões (owner) | **OK** | `P07_12_comissao.png` |
| C14 | Outbox (attendant) | **OK** | `P07_09_outbox.png` |
| C15 | Auditoria operacional (owner) | **OK** | `P07_10_auditoria.png` |
| C16 | Audit logs tenant (owner) | **OK** | `P07_auditoria_tenant.png` |
| C17 | Lista de espera (attendant) | **OK** | `P07_13_waitlist.png` |
| C18 | Conversas (attendant) | **OK** | `P07_conversas.png` |
| C19 | Configurações (owner) | **OK** | `P07_configuracoes.png` |
| C20 | Atendente `/servicos` → forbidden | **OK** | `P07_18_forbidden_servicos.png` |
| C21 | Veículos `/veiculos` | **OK** | `P07_05_veiculos.png` |
| C22 | Portal token inválido (UI) | **OK** | `P07_15_portal_token_invalido.png` |
| C23 | Agendamento E2E completo | **PEND** | `P07_02_agenda_wizard_partial.png` |

**Reexecução:** `cd scripts/qa-browser && node portal-p07.spec.mjs`

**Nota PO (pré-requisito ambiente):** imagem `barbearia-web` anterior (17/05) não continha rotas Gestão/360 — causou falsos FAIL até `docker compose build web && docker compose up -d --force-recreate web`.

---

## 10. Referências

- `QA_PACKAGE_BARBEARIA/01_PORTAL_WEB/PORTAL_WEB.md`
- `QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS/MASSA_DE_DADOS.md`
- `07_resultados_browser.json` — resultado machine-readable
- `scripts/qa-browser/portal-p07.spec.mjs` — automação Playwright
- `apps/api/src/middlewares/rbac.ts` — política API
- `apps/web/src/lib/route-access.test.ts` — política rotas UI
