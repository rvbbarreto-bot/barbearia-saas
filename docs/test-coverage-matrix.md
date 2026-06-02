# Matriz de cobertura funcional — Barbearia SaaS Web

**Gerado:** 2026-05-26  
**Fonte:** `apps/web/src/router/index.tsx`, `config/nav.ts`, `config/navCarWash.ts`, `lib/rbac.ts`  
**Suíte Robot:** `tests/specs/`

## Legenda de status

| Status | Significado |
|--------|-------------|
| **TESTADA** | Spec Robot implementada e executável |
| **PLANEJADA** | Cenário BDD + locators definidos; spec pendente ou parcial |
| **BLOQUEADA POR DEPENDÊNCIA** | Requer massa/seed, vertical, integração externa ou perfil específico |
| **FORA DE ESCOPO** | Não navegável via UI autenticada padrão ou fora do MVP E2E |

## Perfis de referência (seed demo)

| Perfil código | E-mail demo | Nível |
|---------------|-------------|-------|
| tenant_owner | admin@demo.local | 60 |
| attendant | atendente@demo.local | 20 |
| viewer | viewer@demo.local | 10 |

---

## Rotas públicas

| Rota | Tela / componente | Feature | Criticidade | Status | Spec / observação |
|------|-------------------|---------|-------------|--------|-------------------|
| `/login` | LoginPage | auth | Crítica | **TESTADA** | `specs/auth/login.robot` |
| `/portal/:token` | PortalPublicPage | portal | Alta | **PLANEJADA** | Token dinâmico; seed `scripts/qa-seed-portal` ou API |
| `*` → `/dashboard` | Redirect catch-all | router | Média | **PLANEJADA** | `specs/auth/routing.robot` |

---

## Rotas autenticadas (AppShell)

| Rota | Tela | Feature | minRole | Criticidade | Status | Observação |
|------|------|---------|---------|-------------|--------|------------|
| `/` (index) | Redirect → dashboard | router | viewer | Baixa | **TESTADA** | Via login smoke |
| `/dashboard` | DashboardPage | dashboard | viewer | Alta | **TESTADA** | `specs/smoke/navigation_smoke.robot` |
| `/agenda` | AgendaPage | agenda | viewer | Crítica | **PLANEJADA** | UI booking: attendant+; viewer só leitura |
| `/conversas` | ConversasPage | atendimento | attendant | Média | **PLANEJADA** | Depende tickets na API |
| `/forbidden` | ForbiddenPage | auth | auth | Média | **TESTADA** | `specs/auth/rbac_navigation.robot` |
| `/clientes` | ClientesPage | clientes | attendant | Alta | **PLANEJADA** | CRUD drawer |
| `/clientes/:id/360` | Customer360Page | clientes | attendant | Alta | **PLANEJADA** | UUID dinâmico; smoke com ID seed |
| `/gestao/dashboard` | ManagementDashboardPage | gestao | manager | Crítica | **TESTADA** | Smoke admin + RBAC atendente |
| `/servicos` | ServicosPage | servicos | manager | Alta | **PLANEJADA** | Zod em ServicoDrawer |
| `/profissionais` | ProfissionaisPage | profissionais | manager | Alta | **PLANEJADA** | Business hours |
| `/configuracoes` | ConfiguracoesPage | configuracoes | manager | Média | **PLANEJADA** | Read-only GET /me |
| `/lista-espera` | WaitlistPage | lista-espera | attendant | Alta | **PLANEJADA** | Conversão para agendamento |
| `/operacao/financeiro` | FinanceiroPage | financeiro | manager | Alta | **TESTADA** | Smoke sem erro 500 |
| `/operacao/mensagens` | OutboxMessagesPage | outbox | attendant | Alta | **PLANEJADA** | Retry manager+; `data-testid` disponível |
| `/operacao/auditoria` | OperationalAuditPage | auditoria | manager | Média | **PLANEJADA** | `data-testid` operacional |
| `/operacao/comissao` | ComissaoPage | comissao | manager | Média | **PLANEJADA** | Listagem paginada |
| `/veiculos` | VeiculosPage | veiculos | attendant | Alta | **TESTADA** | `tests/robot` + `specs/vertical/veiculos.robot` |
| `/operacao/lava-rapido` | CarWashBoardPage | lavaRapido | attendant | Crítica | **PLANEJADA** | Vertical `car_wash` + seed pátio |
| `/auditoria` | AuditLogsPage | auditoria | tenant_admin | Alta | **BLOQUEADA** | Perfil tenant_admin no seed limitado |

---

## Itens de menu vs rota (sidebar)

Todos os itens de `APP_NAV` e `CAR_WASH_NAV` possuem rota correspondente na matriz acima.

| Label menu | Rota | Cobertura navegação smoke |
|------------|------|---------------------------|
| Dashboard | /dashboard | TESTADA |
| Agenda | /agenda | PLANEJADA |
| Conversas | /conversas | PLANEJADA |
| Clientes | /clientes | PLANEJADA |
| Serviços | /servicos | PLANEJADA |
| Profissionais | /profissionais | PLANEJADA |
| Lista de espera | /lista-espera | PLANEJADA |
| Gestão | /gestao/dashboard | TESTADA |
| Financeiro | /operacao/financeiro | TESTADA |
| Mensagens | /operacao/mensagens | PLANEJADA |
| Auditoria operacional | /operacao/auditoria | PLANEJADA |
| Comissões | /operacao/comissao | PLANEJADA |
| Auditoria | /auditoria | BLOQUEADA |
| Configurações | /configuracoes | PLANEJADA |
| Veículos (car wash) | /veiculos | TESTADA |
| Lava-rápido (car wash) | /operacao/lava-rapido | PLANEJADA |

---

## Componentes críticos reutilizáveis

| Componente | Caminho | Criticidade | Status |
|------------|---------|-------------|--------|
| AppShell | components/layout/AppShell.tsx | Crítica | TESTADA (via login) |
| Sidebar | components/layout/Sidebar.tsx | Crítica | PLANEJADA |
| Topbar / logout | components/layout/Topbar.tsx | Alta | PLANEJADA |
| RoleGuard | components/auth/RoleGuard.tsx | Crítica | TESTADA |
| DataTable | components/shared/DataTable.tsx | Média | PLANEJADA |
| ErrorBoundary | components/shared/ErrorBoundary.tsx | Alta | PLANEJADA (crash JS) |

---

## Resumo executivo de cobertura

| Classificação | Quantidade rotas/telas |
|---------------|------------------------|
| TESTADA | 8 |
| PLANEJADA | 16 |
| BLOQUEADA POR DEPENDÊNCIA | 1 |
| FORA DE ESCOPO | 0 |

**Cobertura navegável automatizada (rotas com spec executável):** ~32% (8/25 telas distintas)  
**Cobertura documentada (BDD + matriz):** 100% das rotas inventariadas

### Fora de escopo justificado

| Item | Motivo |
|------|--------|
| n8n UI externa | Não é `apps/web` |
| Evolution API WhatsApp | Integração externa :8081 |
| CI GitHub Actions UI | Fora da aplicação |
| Cross-tenant manual | Requer dois tenants + QA pleno |

---

## Próximas prioridades (risco)

1. `/agenda` — wizard + estados FSM agendamento  
2. `/operacao/lava-rapido` — FSM pátio (seed 2026-06-16)  
3. `/operacao/mensagens` — retry + filtros (`data-testid`)  
4. `/portal/:token` — fluxo cliente final  
5. `BUG-001` — toast placa duplicada (Sonner)
