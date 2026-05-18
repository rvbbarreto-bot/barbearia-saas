# Estudo de Produto e Baixo Nivel - Lava Rapido MVP

**Projeto:** Barbearia SaaS V2  
**Documento:** Estudo para vertical Lava Rapido / Estetica Automotiva  
**Data:** 2026-05-17  
**Status:** proposta tecnica para discussao PO/Arquitetura/Fabrica  
**Base analisada:** `piloto-staging-01`, apos merge dos blocos PILOTO-05 Outbox e Auditoria  

---

## 1. Resumo executivo

E tecnicamente viavel implementar um MVP de lava rapido sobre a arquitetura atual da Barbearia SaaS sem reescrever o produto, desde que a abordagem seja **vertical por tenant** e nao uma troca estrutural do dominio.

A recomendacao e criar uma vertical `car_wash` controlada por configuracao de tenant, reaproveitando:

- agenda;
- clientes;
- servicos;
- profissionais como recurso operacional/box/equipe;
- disponibilidade;
- bloqueios de horario;
- waitlist;
- outbox/WhatsApp;
- auditoria operacional;
- financeiro/comissao ja existentes;
- RBAC e RLS multi-tenant.

O caminho de menor risco e **nao transformar agora `professionals` em `resources`**. Para o MVP, o sistema pode exibir "Box", "Equipe" ou "Responsavel" na UI, mantendo internamente a tabela `professionals`. Essa decisao evita quebrar agenda, disponibilidade, bloqueio, RBAC, testes e relatorios ja aprovados.

O principal acrescimo de dominio e:

1. cadastro de veiculos por cliente;
2. vinculo do veiculo ao agendamento;
3. etapa operacional de patio/lavagem;
4. checklist simples de entrada;
5. notificacao WhatsApp de confirmacao, carro em lavagem e carro pronto;
6. labels e fluxos especificos por vertical.

**Parecer:** lava rapido MVP e uma evolucao segura e comercialmente interessante. Oficina mecanica completa nao deve ser implementada agora, pois exige ordem de servico tecnica, pecas, diagnostico, orcamento e garantia, aumentando muito o risco.

---

## 2. Leitura de mercado

### 2.1 Sinais de demanda

O mercado de lava rapido e estetica automotiva tem alta aderencia a software de agenda, WhatsApp e controle de patio porque a operacao sofre com:

- atendimento por WhatsApp disperso;
- fila fisica sem visibilidade;
- conflito de horario por box/equipe;
- cliente sem historico;
- veiculo sem registro padronizado;
- precificacao diferente por porte/tipo de veiculo;
- falta de controle de status: aguardando, lavando, pronto, entregue;
- ausencia de lembrete e reativacao;
- caixa do dia e comissao pouco estruturados;
- dificuldade de medir ocupacao por box, ticket medio e recorrencia.

Fontes de mercado consultadas indicam que produtos de lava rapido costumam destacar agendamento, WhatsApp, box/capacidade, painel operacional, cliente/veiculo, OS, caixa e KPIs. O LavaOps, por exemplo, comunica agendamento publico, WhatsApp e painel administrativo com cadastro de servicos, precos e duracao. O LavaJatos CRM enfatiza painel operacional, OS rapida, clientes/veiculos, caixa, agendamento e avisos por WhatsApp. O Lava ja! destaca checklist, placa, cashback, WhatsApp, financeiro e agendamento online. Em mercado internacional, Washify/DRB destaca CRM, planos recorrentes, identificacao veicular, relatorios, inventario, equipe, ecommerce, SMS/email e modulo de detalhamento.

### 2.2 Implicacao para o Barbearia SaaS

O produto atual ja cobre a parte mais dificil para um primeiro MVP:

- agenda multi-tenant;
- disponibilidade;
- servicos com duracao/preco;
- agenda por profissional/recurso;
- lifecycle de agendamento;
- outbox WhatsApp;
- auditoria operacional;
- financeiro/comissao iniciados;
- portal web operacional.

Portanto, o MVP nao deve comecar por POS, estoque, LPR, app mobile ou plano mensal ilimitado. Esses recursos sao relevantes, mas pertencem a fases posteriores.

---

## 3. Premissas de negocio

Este estudo assume uma persona operacional, sem alegar entrevista real:

**Persona: dono de lava rapido estruturado**

- Opera com 2 a 6 boxes.
- Recebe demanda por WhatsApp e chegada espontanea.
- Precisa saber qual carro esta aguardando, lavando, em acabamento, pronto e entregue.
- Quer cadastrar placa/modelo/cor para reconhecer o cliente rapidamente.
- Quer evitar reclamacao de dano com checklist de entrada.
- Quer avisar o cliente quando o carro ficar pronto.
- Quer medir ocupacao, ticket medio, servicos mais vendidos e retorno de clientes.
- Quer financeiro simples por dia/forma de pagamento.
- Quer futura fidelizacao/recall: "esta na hora de lavar novamente".

---

## 4. Estado atual do produto base

### 4.1 Stack e arquitetura

**Backend**

- Node.js;
- TypeScript;
- Fastify;
- Zod;
- PostgreSQL;
- RLS multi-tenant via `app.tenant_id` / `app_tenant_id()`;
- Redis;
- OpenAPI;
- Vitest.

**Frontend**

- React;
- Vite;
- TypeScript;
- componentes locais;
- Testing Library/Vitest;
- navegação por RBAC.

**Infra e automacao**

- Docker/Docker Compose;
- migrations SQL versionadas;
- n8n;
- Evolution API;
- Outbox pattern;
- GitHub Actions;
- npm audit;
- Gitleaks.

### 4.2 Modulos ja existentes e aproveitaveis

| Dominio atual | Arquivos/tabelas principais | Reuso no lava rapido |
|---|---|---|
| Tenants | `tenants`, `tenant_settings`, middleware tenant | Ativar vertical por tenant |
| Clientes | `customers`, `customers/routes.ts` | Dono do veiculo |
| Profissionais | `professionals`, `professional_services`, horarios | Box, equipe ou responsavel |
| Servicos | `services`, categorias, variantes, buffers | Tipos de lavagem/detalhamento |
| Agenda | `appointments`, lifecycle, availability | Agendamento de lavagem |
| Disponibilidade | `/availability`, business hours, blocks | Capacidade por box/equipe |
| Bloqueios | `calendar_blocks`, time blocks | Box indisponivel/manutencao |
| Waitlist | `waitlist_entries` | Cliente aguardando vaga |
| Outbox | `message_outbox`, retry, error_class | Confirmacao, lembrete, carro pronto |
| Auditoria operacional | `operational_audit_events`, `/operacao/auditoria` | Rastrear fluxos de patio |
| Financeiro | `appointment_financials`, Pix | Receita por lavagem |
| Comissao | `commission_entries` | Comissao por equipe/lavador |
| Web | Agenda, Clientes, Servicos, Mensagens, Auditoria | Base UI pronta |

### 4.3 Entregas ja aprovadas que nao devem ser quebradas

| Entrega | Status | Risco se mexer errado |
|---|---|---|
| Agenda/RBAC/cross-tenant | aprovado em blocos anteriores | Alto |
| Outbox operacional - Bloco 1 | aprovado e mergeado | Medio/alto |
| Auditoria operacional - Bloco 2 | aprovado e mergeado | Medio |
| n8n SendText smoke | validado com WhatsApp recebido | Medio |
| RLS multi-tenant | base critica | Alto |

Regra: toda mudanca do lava rapido deve ser **aditiva**, com feature flag/vertical, sem renomear tabelas nucleares.

---

## 5. Decisao arquitetural recomendada

### 5.1 Nao fazer agora

Nao fazer neste MVP:

- renomear `professionals` para `resources`;
- transformar todos os modulos em genericos;
- alterar status global de `appointments` sem necessidade;
- refatorar agenda inteira;
- criar marketplace/public booking complexo;
- implementar app mobile;
- implementar reconhecimento de placa por IA;
- implementar estoque completo;
- implementar planos mensais ilimitados;
- implementar oficina mecanica/OS tecnica.

### 5.2 Fazer agora

Fazer:

- criar vertical `car_wash` por tenant;
- adaptar labels da UI por vertical;
- criar cadastro de veiculos;
- vincular veiculo ao agendamento;
- criar extensao operacional de lava rapido via nova tabela `car_wash_jobs`;
- criar checklist simples de entrada;
- criar board operacional de patio;
- usar outbox para notificacoes;
- usar auditoria operacional para rastreio;
- usar financeiro/comissao ja existentes quando agendamento for concluido.

---

## 6. Modelo de dominio proposto

### 6.1 Entidades

| Entidade | Descricao | Implementacao recomendada |
|---|---|---|
| Cliente | Pessoa que contrata o servico | `customers` existente |
| Veiculo | Carro/moto do cliente | Nova tabela `customer_vehicles` |
| Box/equipe | Capacidade operacional | `professionals` existente, com label vertical |
| Servico | Lavagem simples/completa/premium | `services` existente |
| Categoria | Lavagem, estetica, motor, higienizacao | `service_categories` existente |
| Variante | Porte hatch/sedan/SUV/pickup | `service_variants` existente ou fase 2 |
| Agendamento | Reserva de data/hora | `appointments` existente |
| Job de lavagem | Estado operacional do patio | Nova tabela `car_wash_jobs` |
| Checklist | Condicao de entrada/saida | Nova tabela `car_wash_checklists` |
| Mensagem | WhatsApp/outbox | `message_outbox` existente |
| Auditoria | Eventos operacionais | `operational_audit_events` existente |
| Financeiro | Receita/pagamento | `appointment_financials` existente |

### 6.2 Estados operacionais do lava rapido

Manter `appointments.status` como lifecycle de agenda e usar `car_wash_jobs.stage` para a operacao de patio.

| Stage lava rapido | Significado | Relacao com appointment |
|---|---|---|
| `scheduled` | Agendado, ainda nao chegou | `confirmed` ou `awaiting_confirmation` |
| `arrived` | Cliente/veiculo chegou | `checked_in` |
| `washing` | Lavagem em andamento | `in_service` |
| `quality_check` | Conferencia/acabamento | `in_service` |
| `ready` | Carro pronto para retirada | `in_service` ou pre-completed |
| `delivered` | Veiculo entregue e servico fechado | `completed` |
| `cancelled` | Cancelado | `cancelled` |
| `no_show` | Cliente nao compareceu | `no_show` |

Motivo: isso evita mexer no enum central de `appointments`, reduzindo risco de regressao.

---

## 7. Modelo de dados baixo nivel

### 7.1 `tenant_settings`

Usar configuracao por tenant:

```json
{
  "vertical": "car_wash",
  "labels": {
    "professional": "Box",
    "professionals": "Boxes",
    "appointment": "Agendamento",
    "service": "Serviço"
  },
  "car_wash": {
    "require_vehicle": true,
    "require_checklist_on_arrival": true,
    "notify_when_ready": true,
    "default_slot_interval_minutes": 30
  }
}
```

Default para tenants existentes:

```json
{ "vertical": "barbershop" }
```

### 7.2 Migration proposta `105_car_wash_mvp.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS customer_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plate text,
  normalized_plate text,
  brand text,
  model text,
  color text,
  vehicle_type text NOT NULL DEFAULT 'car'
    CHECK (vehicle_type IN ('car','motorcycle','pickup','suv','van','truck','other')),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, normalized_plate)
);

CREATE INDEX IF NOT EXISTS idx_customer_vehicles_customer
  ON customer_vehicles (tenant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS car_wash_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES customer_vehicles(id) ON DELETE RESTRICT,
  stage text NOT NULL DEFAULT 'scheduled'
    CHECK (stage IN ('scheduled','arrived','washing','quality_check','ready','delivered','cancelled','no_show')),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  estimated_ready_at timestamptz,
  ready_notified_at timestamptz,
  delivered_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_car_wash_jobs_board
  ON car_wash_jobs (tenant_id, stage, stage_changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_car_wash_jobs_vehicle
  ON car_wash_jobs (tenant_id, vehicle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS car_wash_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES car_wash_jobs(id) ON DELETE CASCADE,
  checklist_type text NOT NULL DEFAULT 'arrival'
    CHECK (checklist_type IN ('arrival','delivery')),
  items jsonb NOT NULL DEFAULT '{}',
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_id, checklist_type)
);

ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_vehicles FORCE ROW LEVEL SECURITY;
ALTER TABLE car_wash_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_wash_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE car_wash_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_wash_checklists FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_customer_vehicles ON customer_vehicles
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation_car_wash_jobs ON car_wash_jobs
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation_car_wash_checklists ON car_wash_checklists
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

COMMIT;
```

### 7.3 Normalizacao de placa

Regra no backend:

- remover espacos/hifens;
- upper-case;
- aceitar Mercosul e placa antiga;
- `normalized_plate` opcional quando placa nao informada;
- se placa existir, unica por tenant.

Regex sugerida:

```ts
const PLATE_BR = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
```

---

## 8. APIs propostas

### 8.1 Veiculos

#### `GET /api/v1/vehicles`

Query:

- `search`;
- `customer_id`;
- `plate`;
- `page`;
- `limit`;
- `active`.

Resposta:

```json
{
  "data": [
    {
      "id": "uuid",
      "customer_id": "uuid",
      "plate": "ABC1D23",
      "brand": "Honda",
      "model": "Civic",
      "color": "Prata",
      "vehicle_type": "car",
      "is_active": true
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1 }
}
```

#### `POST /api/v1/vehicles`

RBAC: `attendant+`.

Body:

```json
{
  "customer_id": "uuid",
  "plate": "ABC1D23",
  "brand": "Honda",
  "model": "Civic",
  "color": "Prata",
  "vehicle_type": "car",
  "notes": "Cliente prefere cera premium."
}
```

Regras:

- `customer_id` deve pertencer ao tenant;
- placa duplicada no tenant deve retornar `409 VEHICLE_PLATE_ALREADY_EXISTS`;
- sem vazamento cross-tenant;
- escrever auditoria operacional `vehicle_created`.

#### `PATCH /api/v1/vehicles/:vehicleId`

RBAC: `attendant+`.

Regras:

- atualizacao parcial;
- `is_active=false` nao remove historico.

### 8.2 Agendamento com veiculo

Nao criar endpoint novo se puder evoluir `POST /appointments` de forma compativel:

```json
{
  "customer_id": "uuid",
  "professional_id": "uuid",
  "service_id": "uuid",
  "vehicle_id": "uuid",
  "starts_at": "2026-05-20T13:00:00.000Z",
  "ends_at": "2026-05-20T14:00:00.000Z",
  "source": "manual",
  "explicit_confirmation": true,
  "idempotency_key": "uuid"
}
```

Implementacao segura:

- aceitar `vehicle_id` opcional para barbearia;
- exigir `vehicle_id` quando `tenant_settings.settings.vertical = 'car_wash'` e `require_vehicle=true`;
- apos criar `appointments`, criar `car_wash_jobs` em transacao;
- se falhar job, rollback do appointment.

### 8.3 Jobs de lava rapido

#### `GET /api/v1/car-wash/jobs`

Query:

- `stage`;
- `date`;
- `professional_id`;
- `customer_id`;
- `vehicle_id`;
- `plate`;
- `correlation_id`;
- `page`;
- `limit`.

RBAC: `attendant+`.

#### `PATCH /api/v1/car-wash/jobs/:jobId/arrive`

Acao:

- atualiza stage `arrived`;
- chama/checks `checkInAppointment` ou mantem sincronizado;
- grava `car_wash_job_arrived`;
- exige checklist se configurado.

#### `PATCH /api/v1/car-wash/jobs/:jobId/start`

Acao:

- stage `washing`;
- appointment `start`;
- auditoria.

#### `PATCH /api/v1/car-wash/jobs/:jobId/quality-check`

Acao:

- stage `quality_check`;
- auditoria.

#### `PATCH /api/v1/car-wash/jobs/:jobId/ready`

Acao:

- stage `ready`;
- `ready_notified_at` se outbox enfileirado;
- cria mensagem outbox WhatsApp:

```text
Olá, {{customer_name}}. Seu veículo {{vehicle_label}} está pronto para retirada.
```

#### `PATCH /api/v1/car-wash/jobs/:jobId/deliver`

Acao:

- stage `delivered`;
- appointment `complete`;
- dispara financeiro/comissao ja existentes;
- auditoria.

### 8.4 Checklist

#### `POST /api/v1/car-wash/jobs/:jobId/checklists`

Body MVP:

```json
{
  "checklist_type": "arrival",
  "items": {
    "body_scratches": true,
    "wheel_damage": false,
    "interior_objects": "Óculos no porta-luvas",
    "fuel_level": "1/2"
  },
  "notes": "Risco pequeno no para-choque traseiro."
}
```

Fora do MVP:

- upload de fotos;
- assinatura digital;
- IA de placa.

---

## 9. Frontend baixo nivel

### 9.1 Vertical labels

Criar helper:

```ts
type Vertical = 'barbershop' | 'car_wash';

export function getVerticalLabels(vertical: Vertical) {
  if (vertical === 'car_wash') {
    return {
      customer: 'Cliente',
      service: 'Serviço',
      professional: 'Box/equipe',
      professionals: 'Boxes/equipes',
      appointment: 'Agendamento',
      agenda: 'Agenda',
    };
  }
  return {
    customer: 'Cliente',
    service: 'Serviço',
    professional: 'Profissional',
    professionals: 'Profissionais',
    appointment: 'Agendamento',
    agenda: 'Agenda',
  };
}
```

Fonte sugerida da configuracao:

- `/api/v1/tenant-operational/settings` ou endpoint existente de configuracoes;
- fallback `barbershop`.

### 9.2 Telas novas

| Tela | Rota | Perfil | Objetivo |
|---|---|---|---|
| Veiculos | `/veiculos` | attendant+ | CRUD basico de veiculos |
| Drawer veiculo | componente | attendant+ | placa/modelo/cor/notas |
| Agenda lava rapido | `/agenda` adaptada | viewer+ | agendar com veiculo |
| Patio / Operacao | `/operacao/lava-rapido` | attendant+ | board por stage |
| Checklist | modal no job | attendant+ | checklist de chegada/entrega |

### 9.3 Adaptacao do `NewAppointmentModal`

Hoje o fluxo e:

1. Cliente;
2. Servico;
3. Profissional;
4. Horario.

Para `car_wash`:

1. Cliente;
2. Veiculo;
3. Servico;
4. Box/equipe;
5. Horario.

Regra:

- para `barbershop`, fluxo antigo permanece;
- para `car_wash`, o passo veiculo e obrigatorio;
- se cliente nao tiver veiculo, permitir cadastro rapido no modal.

### 9.4 Board operacional

Colunas:

- Agendados;
- Chegaram;
- Lavando;
- Conferencia;
- Prontos;
- Entregues.

Card:

- placa;
- modelo/cor;
- cliente;
- servico;
- horario;
- box/equipe;
- status;
- acoes permitidas.

Acoes:

- Chegou;
- Iniciar lavagem;
- Enviar para conferencia;
- Marcar pronto;
- Entregar/concluir;
- Cancelar;
- Abrir checklist;
- Ver mensagens.

---

## 10. Regras de negocio

### 10.1 Agendamento

- Um box/equipe nao pode ter sobreposicao de horario.
- Duração vem do servico.
- Buffer antes/depois pode ser usado para manobra, secagem ou setup.
- Para car wash, `vehicle_id` e obrigatorio quando configurado.
- Veiculo deve pertencer ao mesmo cliente e tenant.
- Datas passadas continuam proibidas.
- Idempotencia continua obrigatoria.

### 10.2 Chegada

- Somente `attendant+` pode marcar chegada.
- Se checklist obrigatorio estiver ativo, chegada deve criar ou exigir checklist de entrada.
- Auditoria registra ator, horario, job, appointment e correlation_id.

### 10.3 Pronto para retirada

- Ao marcar `ready`, enfileirar WhatsApp via outbox.
- Se cliente opt-out, registrar evento e nao enviar.
- Retry segue regra atual manager+.
- Mensagem nao deve conter dados sensiveis alem de placa/modelo se o PO aprovar.

### 10.4 Entrega

- Ao entregar, marcar job `delivered`.
- Completar appointment.
- Gerar financeiro/comissao pelo fluxo existente.
- Registrar auditoria.

### 10.5 Cancelamento/no-show

- Cancelamento libera slot.
- No-show pode alimentar restricao/recall futuro.
- Se cancelado antes da chegada, job vira `cancelled`.

---

## 11. Mensagens WhatsApp

### 11.1 Confirmacao

```text
Olá, {{customer_name}}. Seu agendamento no {{tenant_name}} foi confirmado para {{date_time}}.
Veículo: {{vehicle_label}}.
Serviço: {{service_name}}.
```

### 11.2 Lembrete

```text
Lembrete: seu horário no {{tenant_name}} é hoje às {{time}}.
Veículo: {{vehicle_label}}.
```

### 11.3 Carro pronto

```text
Olá, {{customer_name}}. Seu veículo {{vehicle_label}} está pronto para retirada.
Obrigado por escolher o {{tenant_name}}.
```

### 11.4 Feedback/recall futuro

```text
Como foi sua experiência com a lavagem do {{vehicle_label}}?
Responda de 1 a 5.
```

Fase futura:

```text
Já faz {{days}} dias desde sua última lavagem. Quer reservar um horário?
```

---

## 12. Cenarios BDD

### 12.1 Cadastro de veiculo

```gherkin
Cenario: Cadastrar veiculo para cliente do mesmo tenant
Dado que estou autenticado como atendente
E existe um cliente no meu tenant
Quando cadastro um veiculo com placa, modelo e cor
Entao o veiculo deve ser salvo
E deve aparecer no historico do cliente
E deve ser registrado evento de auditoria operacional
```

### 12.2 Bloqueio cross-tenant

```gherkin
Cenario: Impedir uso de veiculo de outro tenant
Dado que estou autenticado no tenant A
E existe um veiculo no tenant B
Quando tento criar agendamento usando o veiculo do tenant B
Entao a API deve retornar erro
E nenhum agendamento deve ser criado
```

### 12.3 Agendamento de lavagem

```gherkin
Cenario: Criar agendamento de lava rapido com veiculo
Dado que estou autenticado como atendente
E existe cliente, veiculo, servico e box disponivel
Quando crio um agendamento para a lavagem
Entao o agendamento deve ser criado
E um job de lava rapido deve ser criado com stage scheduled
E o slot deve ficar indisponivel
```

### 12.4 Chegada com checklist

```gherkin
Cenario: Marcar chegada do veiculo com checklist
Dado que existe um job scheduled
Quando marco o veiculo como chegou
E preencho o checklist de entrada
Entao o job deve ir para arrived
E o agendamento deve refletir check-in
E a auditoria deve registrar a acao
```

### 12.5 Carro pronto com WhatsApp

```gherkin
Cenario: Marcar carro como pronto e avisar cliente
Dado que existe um job em washing
E o cliente permite WhatsApp
Quando marco o job como ready
Entao o sistema deve enfileirar uma mensagem no outbox
E o job deve registrar ready_notified_at
E a mensagem deve conter veiculo e servico sem expor dados sensiveis
```

### 12.6 Entrega

```gherkin
Cenario: Entregar veiculo e concluir servico
Dado que existe um job ready
Quando marco como entregue
Entao o job deve ir para delivered
E o agendamento deve ser concluido
E financeiro e comissao devem ser processados conforme regra existente
```

### 12.7 Perfil sem permissao

```gherkin
Cenario: Viewer nao pode alterar patio
Dado que estou autenticado como viewer
Quando tento marcar um job como washing
Entao devo receber 403
E nenhum estado deve ser alterado
```

---

## 13. Testes obrigatorios

### 13.1 Backend unitarios

- normalizacao de placa;
- schemas Zod de veiculos;
- regras de stage transition;
- mapper de job;
- sanitizacao de metadata;
- mensagens WhatsApp;
- labels/config vertical.

### 13.2 Backend integracao

- CRUD veiculo com RLS;
- duplicidade placa por tenant;
- criacao appointment + car_wash_job em transacao;
- cross-tenant vehicle/job;
- stage transitions;
- ready enfileira outbox;
- delivered chama fluxo de complete/finance/comissao;
- RBAC negativo.

### 13.3 Frontend

- modal de agendamento com passo veiculo;
- cadastro rapido de veiculo;
- board render;
- empty state;
- erro API;
- acoes por permissao;
- filtros por placa/stage/box;
- car wash labels sem alterar barbershop labels.

### 13.4 E2E minimo

Fluxo minimo:

1. login manager;
2. cadastrar veiculo;
3. criar agendamento;
4. marcar chegada;
5. iniciar lavagem;
6. marcar pronto;
7. validar outbox;
8. entregar;
9. validar auditoria.

---

## 14. Evidencias esperadas

Pasta:

`docs/evidencias/lava_rapido_mvp/`

Arquivos:

- `01_relatorio_tecnico.md`;
- `02_resumo_po.md`;
- `03_matriz_aceite.md`;
- `04_roteiro_qa.md`;
- `05_testes_locais.txt`;
- `06_ci_pr.txt`;
- `prints/`.

Prints sugeridos:

- L01 - tenant vertical car wash configurado;
- L02 - cliente com aba veiculos;
- L03 - cadastro de veiculo;
- L04 - novo agendamento com passo veiculo;
- L05 - disponibilidade por box/equipe;
- L06 - board patio com jobs;
- L07 - checklist entrada;
- L08 - job em lavagem;
- L09 - job pronto;
- L10 - outbox mensagem carro pronto;
- L11 - auditoria por correlation_id;
- L12 - viewer/attendant sem acesso indevido;
- L13 - CI verde PR.

---

## 15. Plano de implementacao em fases grandes

### Fase 0 - Discovery tecnico e protecao de base

**Objetivo:** impedir regressao.

Entregas:

- ADR da vertical `car_wash`;
- matriz de impacto nos modulos existentes;
- feature flag em `tenant_settings`;
- seed demo lava rapido;
- roteiro QA base barbearia para regressao.

Estimativa: 24-40 horas.

### Fase 1 - Fundacao de vertical e veiculos

Entregas:

- migration `customer_vehicles`;
- APIs CRUD veiculo;
- RLS e cross-tenant;
- UI de veiculos;
- aba veiculos no cliente;
- testes API/Web;
- OpenAPI;
- evidencias.

Estimativa: 80-120 horas.

### Fase 2 - Agendamento com veiculo e labels por vertical

Entregas:

- `vehicle_id` via extensao segura/job;
- passo veiculo no modal;
- validacao `require_vehicle`;
- labels "Box/equipe" por vertical;
- ajuste de agenda sem quebrar barbearia;
- seed servicos lava rapido;
- testes de disponibilidade e criacao.

Estimativa: 100-150 horas.

### Fase 3 - Patio operacional e checklist

Entregas:

- `car_wash_jobs`;
- `car_wash_checklists`;
- board `/operacao/lava-rapido`;
- transicoes arrived/washing/quality_check/ready/delivered;
- checklist simples;
- auditoria;
- RBAC;
- testes e prints.

Estimativa: 140-220 horas.

### Fase 4 - WhatsApp, outbox, financeiro e comissao

Entregas:

- mensagem de carro pronto;
- validacao de opt-in/opt-out;
- outbox com error_class;
- retry manager+;
- complete gera financeiro/comissao;
- dashboard inicial de patio/receita;
- evidencias n8n/Evolution quando disponivel.

Estimativa: 120-190 horas.

### Fase 5 - QA, hardening e homologacao

Entregas:

- bateria QA full;
- CI verde;
- Gitleaks;
- npm audit;
- regression suite barbearia;
- evidencias Web;
- roteiro do cliente piloto;
- documentacao operacional.

Estimativa: 80-140 horas.

### Total MVP robusto

| Cenario | Horas | Prazo com squad full-time | Observacao |
|---|---:|---:|---|
| MVP essencial | 320-430h | 3-4 semanas | Veiculo + agendamento + board simples |
| MVP robusto recomendado | 460-700h | 4-6 semanas | Inclui checklist, WhatsApp, financeiro/comissao e QA forte |
| Produto comercial ampliado | 760-1.050h | 7-10 semanas | Inclui fidelidade, portal, planos, dashboard avancado |

---

## 16. Time recomendado

Para acelerar com seguranca:

| Papel | Alocacao | Responsabilidade |
|---|---:|---|
| Tech Lead / Arquiteto | 50-75% | desenho, revisao, RLS, PRs |
| Backend Senior | 100% | migrations, APIs, regras, testes |
| Frontend Senior | 100% | telas, labels, board, UX, testes |
| QA Pleno/Senior | 75-100% | BDD, regressao, evidencias |
| DevOps | 25-40% | CI, Docker, ambientes, n8n/Evolution |
| PO/Analista | 50% | regras, aceite, priorizacao |

Capacidade efetiva: 130-180 horas/semana.

---

## 17. Estimativa financeira

Premissas:

- valores sem impostos;
- taxa media composta para fabrica senior;
- inclui desenvolvimento, testes, documentacao e evidencias;
- nao inclui custos de infraestrutura, APIs pagas, WhatsApp/Evolution cloud, OpenAI ou dominios.

| Cenario | Horas | R$ 160/h | R$ 190/h | R$ 230/h |
|---|---:|---:|---:|---:|
| MVP essencial | 320-430h | R$ 51.200-68.800 | R$ 60.800-81.700 | R$ 73.600-98.900 |
| MVP robusto recomendado | 460-700h | R$ 73.600-112.000 | R$ 87.400-133.000 | R$ 105.800-161.000 |
| Produto comercial ampliado | 760-1.050h | R$ 121.600-168.000 | R$ 144.400-199.500 | R$ 174.800-241.500 |

Recomendacao comercial: contratar por fase com aceite objetivo. Nao contratar o produto ampliado inteiro sem validar MVP robusto em operacao real.

---

## 18. Riscos e mitigacoes

| Risco | Severidade | Mitigacao |
|---|---|---|
| Quebrar agenda existente | Alta | mudancas aditivas, regression suite |
| Renomear dominio interno | Alta | labels por vertical, nao renomear tabelas |
| Cross-tenant em veiculos | Alta | RLS + testes integracao |
| Overlap por box | Alta | reaproveitar availability/appointments |
| Pronto/entregue conflitar com status appointment | Media | usar `car_wash_jobs.stage` |
| WhatsApp enviar dado sensivel | Media | templates revisados, opt-in |
| Checklist virar modulo de fotos complexo | Media | MVP sem upload de fotos |
| Escopo virar oficina | Alta | bloquear OS tecnica/pecas/garantia |
| Financeiro incompleto | Media | usar fluxo existente inicialmente |

---

## 19. Backlog para a fabrica

### Epic LAV-01 - Vertical car wash

- Criar configuracao `vertical`.
- Implementar labels por vertical.
- Criar seed demo lava rapido.
- Testar que barbearia permanece igual.

### Epic LAV-02 - Veiculos

- Migration `customer_vehicles`.
- API CRUD.
- UI em clientes.
- Busca por placa.
- RLS/cross-tenant.

### Epic LAV-03 - Agendamento com veiculo

- Passo veiculo no modal.
- Validar veiculo do cliente.
- Criar job em transacao.
- Manter fluxo barbearia intacto.

### Epic LAV-04 - Patio operacional

- Tabela `car_wash_jobs`.
- Board operacional.
- Transicoes de stage.
- Auditoria por correlation_id.

### Epic LAV-05 - Checklist

- Checklist entrada/entrega simples.
- Obrigatoriedade configuravel.
- Print/evidencia.

### Epic LAV-06 - WhatsApp/outbox

- Mensagem carro pronto.
- Templates.
- Retry e error_class.
- E2E com n8n/Evolution quando ambiente permitir.

### Epic LAV-07 - Financeiro/comissao

- Concluir por entrega.
- Receita e comissao via fluxo existente.
- Ajustar labels/relatorios.

### Epic LAV-08 - QA/homologacao

- BDD.
- API tests.
- Web tests.
- E2E.
- Prints.
- CI verde.

---

## 20. Prompt sugerido para a fabrica

```markdown
Time,

Como PO/Arquitetura do Barbearia SaaS V2, autorizo discovery tecnico e desenvolvimento controlado da vertical Lava Rapido MVP, sem iniciar Bloco 3 Dashboard Gerencial e sem quebrar entregas ja aprovadas.

Objetivo:
Implementar MVP de lava rapido sobre a arquitetura atual, com abordagem aditiva por tenant/vertical, reaproveitando agenda, clientes, servicos, profissionais como box/equipe, outbox, auditoria, financeiro/comissao, RBAC e RLS.

Regras obrigatorias:
1. Trabalhar a partir de `piloto-staging-01` atualizada.
2. Abrir PR somente contra `piloto-staging-01`.
3. Nao abrir PR contra `main`.
4. Nao fazer merge sem aceite formal PO/GP.
5. Nao renomear tabelas nucleares.
6. Nao refatorar `professionals` para `resources` neste MVP.
7. Nao alterar lifecycle global de `appointments` sem aprovacao.
8. Manter barbearia funcionando igual por default.
9. Toda migration deve ter RLS, FORCE RLS, policy e teste cross-tenant.
10. Toda entrega deve ter API + Web + testes + prints + relatorio.

Escopo MVP:
- tenant vertical `car_wash`;
- cadastro de veiculos;
- agendamento com veiculo;
- box/equipe usando `professionals`;
- board de patio;
- checklist simples;
- mensagem WhatsApp de carro pronto via outbox;
- auditoria operacional;
- financeiro/comissao por conclusao;
- QA e evidencias.

Entregar em fatias:
1. Fundacao vertical + veiculos.
2. Agendamento com veiculo.
3. Patio operacional + checklist.
4. WhatsApp/outbox + financeiro/comissao.
5. QA/homologacao.

Retorno obrigatorio por PR:
- branch/base/HEAD inicial/HEAD final;
- arquivos alterados;
- migrations;
- endpoints;
- telas;
- testes executados;
- prints;
- link PR;
- link CI;
- riscos residuais;
- o que ficou fora do escopo;
- confirmacao de que barbearia nao regrediu.
```

---

## 21. Fontes de referencia de mercado

- SENATRAN / Ministerio dos Transportes - Frota de Veiculos 2025: https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/frota-de-veiculos-2025
- LavaOps - sistema para lava-jato com agendamento, WhatsApp e painel: https://www.lavaops.com.br/
- LavaJatos CRM - painel operacional, OS, clientes/veiculos, caixa, agenda e WhatsApp: https://lavajatos.com/
- Lava ja! - checklist, placa, cashback, WhatsApp, financeiro e agendamento: https://lavaja.app/
- Washify/DRB - CRM, planos recorrentes, identificacao veicular, relatorios, SMS/email e detailing: https://drb.com/tunnel_solutions/point-of-sale/washify

---

## 22. Parecer final

O lava rapido MVP deve ser tratado como **vertical adjacente e segura**. A arquitetura atual suporta bem o primeiro produto, desde que se use:

- configuracao de tenant;
- labels por vertical;
- novas tabelas aditivas;
- `professionals` como box/equipe no MVP;
- `car_wash_jobs.stage` para patio;
- RLS e testes como portao de aceite.

**Recomendacao de execucao:** MVP robusto em 4-6 semanas com squad full-time, estimado em 460-700 horas. Valor provavel entre R$ 87.400 e R$ 133.000 com taxa media de R$ 190/h.

**Nao recomendado agora:** oficina mecanica, estoque, LPR, app mobile, plano mensal ilimitado e refatoracao generica de recursos.

