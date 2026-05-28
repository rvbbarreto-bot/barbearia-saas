# Análise funcional para automação E2E — Web Barbearia SaaS

**Versão:** 1.0 · 2026-05-26  
**Escopo:** `apps/web/src` (features, router, components, schemas Zod)

---

## 1. Arquitetura de autenticação e autorização

### Fluxo feliz — login
1. Usuário acessa `/login`
2. Informa e-mail + senha (≥8 chars) + tenant opcional
3. API `POST /auth/login` retorna tokens
4. Redirect para `/dashboard`
5. `localStorage` persiste sessão (`barbearia-auth`)

### Fluxos negativos — login
| Partição | Entrada | Resultado esperado |
|----------|---------|-------------------|
| E-mail inválido | `foo` | Validação Zod inline |
| Senha curta | `123` | "Senha deve ter pelo menos 8 caracteres" |
| Credenciais erradas | 401 | "E-mail ou senha incorretos." |
| Rate limit | 429 | Mensagem de tentativas |
| Multi-tenant | 400 TENANT_REQUIRED | Orientação tenant UUID |

### Permission matrix (RoleGuard hierárquico)

| Rota | viewer | attendant | professional | manager | tenant_admin |
|------|--------|-----------|--------------|---------|--------------|
| /dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| /agenda | ✓* | ✓* | ✓* | ✓ | ✓ |
| /clientes | ✗ | ✓ | ✓** | ✓ | ✓ |
| /gestao/dashboard | ✗ | ✗ | ✗ | ✓ | ✓ |
| /auditoria | ✗ | ✗ | ✗ | ✗ | ✓ |

\* UI restringe ações (booking, block time)  
\** professional com `professional_id` fixo na agenda

### Decision table — acesso direto URL sem permissão

| Condição | Ação | Resultado |
|----------|------|-----------|
| Não autenticado | GET rota protegida | Redirect `/login` |
| Autenticado + role < minRole | GET rota protegida | Redirect `/forbidden` |
| Autenticado + role OK | GET rota protegida | Renderiza página |

---

## 2. Análise por feature

### 2.1 Dashboard
- **Happy:** KPIs carregam sem "Erro ao carregar"
- **Empty:** tenant sem dados → zeros ou empty states
- **Error:** falha API → mensagens por card
- **Boundary:** datas "hoje" no fuso do tenant

### 2.2 Agenda
- **Happy:** visualizar calendário; criar agendamento (attendant+)
- **Negative:** sem veículo (car wash) → Próximo bloqueado
- **Negative:** professional não agenda para outros
- **FSM:** confirm → check-in → start → complete / no-show / cancel
- **Loading:** SkeletonRows no lazy route

### 2.3 Clientes
- **Zod:** telefone obrigatório; e-mail opcional válido
- **Happy:** criar/editar (attendant+)
- **360:** overview + abas veículos (vertical car wash)

### 2.4 Veículos (car wash)
- **Boundary:** placa vazia → Salvar disabled
- **Negative:** placa duplicada → toast Sonner + código `VEHICLE_PLATE_ALREADY_EXISTS`
- **Equivalence:** formatos Mercosul vs antigo (API `plate.ts`)

### 2.5 Lava-rápido (pátio)
- **FSM:** scheduled → arrived → in_progress → quality_check → ready → delivered
- **Negative:** "Pronto" não em coluna Agendados
- **Dependência:** seed data `2026-06-16`

### 2.6 Outbox
- **Happy:** listar + filtrar status
- **UI gate:** retry visível apenas manager+
- **Negative:** mensagem failed + retry (seed)

### 2.7 Portal público
- **Happy:** token válido → detalhes + confirmar/cancelar
- **Negative:** token inválido/expirado → mensagem amigável

### 2.8 Gestão / Financeiro / Comissões
- **Happy:** páginas carregam sem HTTP 500 visível
- **Gestão:** export CSV (manager)

---

## 3. Boundary Value Analysis (consolidado)

| Campo | Mínimo | Máximo | Inválido | Esperado |
|-------|--------|--------|----------|----------|
| password | 8 chars | — | 7 chars | Erro Zod |
| email | formato RFC | — | `a@` | Erro Zod |
| tenant_id | UUID v4 | — | `abc` | Erro Zod |
| service price | 0? | — | negativo | API 400 |
| appointment duration | 1 min? | — | 0 | API 400 |

---

## 4. Estados de UI

| Estado | Onde validar | Automação |
|--------|--------------|-----------|
| Loading | lazy routes, drawers | `Wait For Load State networkidle` |
| Empty | outbox, tabelas | `data-testid=outbox-empty-state` |
| Error | login alert, banners | `role=alert` |
| Forbidden | RoleGuard | URL `/forbidden` |
| Toast | veículos, ações | `[data-sonner-toaster]` visível + texto |

---

## 5. Riscos técnicos identificados

| ID | Risco | Impacto | Mitigação automação |
|----|-------|---------|---------------------|
| R1 | `canAccessPath` não cobre rotas dinâmicas | Médio | Testar URL direta por perfil |
| R2 | Poucos `data-testid` fora outbox/auditoria | Alto | Priorizar role/id; propor testid em PRs |
| R3 | OneDrive + Playwright browsers | Alto | `PLAYWRIGHT_BROWSERS_PATH` fora do sync |
| R4 | Toast Sonner hidden no DOM | Alto | BUG-001; aguardar toast visível |
| R5 | Vertical car_wash condicional no menu | Médio | Assert vertical via API/settings antes da suite |

---

## 6. Estratégia de execução

| Nível | Tag Robot | Quando |
|-------|-----------|--------|
| Smoke | `smoke` | PR, pré-deploy |
| Crítico | `critico` | Nightly |
| RBAC | `rbac` | Por release |
| Vertical | `car_wash` | Tenant demo lava-rápido |
| Regressivo | `regressivo` | `tests/robot` legado + suite nova |

**Paralelo:** Pabot por tag (`smoke`, `rbac`) após estabilizar sessão por worker.

---

## 7. Defeitos funcionais conhecidos (candidatos)

| ID | Descrição | Severidade |
|----|-----------|------------|
| BUG-001 | Toast placa duplicada não visível no Playwright (Sonner hidden) | Média |
| — | Retry outbox ausente sem seed failed | N/A (massa) |

Ver `tests/defects/`.
