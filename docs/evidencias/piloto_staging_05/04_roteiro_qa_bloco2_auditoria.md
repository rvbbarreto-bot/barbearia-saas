# Roteiro QA — PILOTO-05 Bloco 2 (Auditoria operacional + correlation_id)

**URL Web:** `http://localhost:5173/operacao/auditoria` (Vite dev, branch atual) ou `http://localhost:3001/operacao/auditoria` (Docker após rebuild)

**API:** `http://localhost:3000`

**Perfis:**

| Perfil | Login (seed demo) | Acesso esperado |
|--------|-------------------|-----------------|
| Manager / Admin | `admin@demo.local` / `admin12345` | Menu «Auditoria operacional»; lista e filtros |
| Atendente | `atendente@demo.local` / `admin12345` | **Sem** item no menu; URL direta → forbidden ou 403 na API |
| Tenant admin | `admin@demo.local` | Igual manager+ |

**Tenant demo:** `00000000-0000-0000-0000-000000000001`

## Pré-requisitos

1. Branch `feature/piloto-staging-05-operacao-gestao-automacao` @ commit Bloco 2 (`8cb5f29`+).
2. API + Web + Postgres + Redis a correr; migrations aplicadas.
3. Existir linhas em `operational_audit_events` (confirmar agendamento, retry outbox, ou fixture QA abaixo).

### Fixture QA (opcional — SQL)

```sql
-- Executar no tenant demo, apenas ambiente local/staging
INSERT INTO operational_audit_events
  (tenant_id, entity_type, entity_id, event_type, actor_user_id, actor_role, source, correlation_id, metadata)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'appointment',
  id,
  'appointment_confirmed',
  NULL,
  'manager',
  'qa_fixture',
  id::text,
  '{"previous_status":"pending","qa":"piloto05-b2"}'::jsonb
FROM appointments
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
LIMIT 3;
```

## Casos funcionais

| ID | Passo | Esperado |
|----|-------|----------|
| B2-01 | Login manager → menu **Auditoria operacional** | Página carrega; título e subtítulo read-only |
| B2-02 | Listagem sem filtros | Tabela com colunas Data, Ação, Entidade, Utilizador, Correlation, Metadata |
| B2-03 | Filtro **event_type** = `appointment_confirmed` | Apenas eventos desse tipo |
| B2-04 | Filtro **entity_type** = `appointment` | Lista coerente |
| B2-05 | Filtro **correlation_id** (UUID de agendamento) | Subconjunto; link correlation clicável |
| B2-06 | Clicar link **Correlation** na linha | Navega para `/operacao/mensagens?correlation_id=…` com campo preenchido |
| B2-07 | Em Mensagens, abrir filtro correlation preenchido via URL | Outbox filtrado (se houver mensagem com mesmo id) |
| B2-08 | Filtro **actor_user_id** (UUID utilizador demo) | Lista filtrada ou vazio explícito |
| B2-09 | Período **from** / **to** ISO válido | Respeita janela temporal |
| B2-10 | Filtros sem resultado | Empty state «Sem registos» |
| B2-11 | Login **atendente** | Menu sem «Auditoria operacional» |
| B2-12 | Atendente: URL `/operacao/auditoria` | Forbidden ou redirect; API `GET operational-audit-events` → 403 |
| B2-13 | Parar API e recarregar página | Banner erro visível |
| B2-14 | Metadata na UI | Sem tokens/Bearer em claro (sanitizado) |
| B2-15 | API integração: tenant A não vê eventos tenant B | Ver `05_evidencia_cross_tenant_operational_audit.md` |

## API (curl / script)

```http
GET /api/v1/operational-audit-events?event_type=appointment_confirmed&limit=5
Authorization: Bearer <manager_jwt>
x-tenant-id: 00000000-0000-0000-0000-000000000001
```

Atendente com mesmo token tenant → **403** (após Bloco 2).

Header em mutação de agenda:

```http
PATCH /api/v1/appointments/{id}/confirm
x-correlation-id: qa-corr-b2-001
```

Evento em `operational_audit_events` deve guardar `correlation_id = qa-corr-b2-001` (ou fallback appointment id se header ausente).

## Prints obrigatórios

| Ficheiro | Evidência |
|----------|-----------|
| `P11_listagem_auditoria_operacional.png` | Lista manager com dados reais |
| `P12_filtro_event_type.png` | Filtro ação preenchido + tabela filtrada |
| `P13_filtro_correlation_id.png` | correlation_id no filtro + resultados |
| `P14_link_correlation_outbox.png` | Navegação auditoria → mensagens (query param) |
| `P15_metadata_sanitizada.png` | Coluna metadata sem segredos |
| `P16_estado_vazio_auditoria.png` | Empty state |
| `P17_attendant_sem_acesso.png` | Atendente: menu ou forbidden |
| `P18_estado_erro_auditoria.png` | API indisponível |
| `P19_pr_bloco2_ci_verde.png` | PR Bloco 2 checks verdes GitHub |

Ver `prints/README.md` (secção Bloco 2).

## Critério de aceite

- PR contra `piloto-staging-01` apenas; CI verde; prints P11–P19; testes em `04_testes_locais_bloco2.txt`.
