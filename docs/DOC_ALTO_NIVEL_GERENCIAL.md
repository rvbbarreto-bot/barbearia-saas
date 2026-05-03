# SaaS Barbearia — Documento Gerencial
## Visão Alto Nível do Sistema

**Versão:** 1.0  
**Data:** 29/04/2026  
**Classificação:** Gerencial / Executivo  
**Autor:** Equipe de Produto — Exeq

---

## 1. Resumo Executivo

O **SaaS Barbearia** é uma plataforma digital de gestão completa para barbearias, desenvolvida no modelo **Software as a Service (SaaS)** multi-tenant. O sistema permite que múltiplas barbearias (clientes) utilizem a mesma infraestrutura de forma totalmente isolada, segura e escalável.

A plataforma elimina processos manuais, reduz faltas e no-shows, e centraliza toda a operação da barbearia em um único sistema integrado com WhatsApp.

### Proposta de Valor

| Problema do Cliente | Solução Entregue |
|---|---|
| Agendamentos por WhatsApp manual e caótico | Bot inteligente que agenda automaticamente |
| Clientes faltando sem aviso | Lembretes automáticos via WhatsApp |
| Sem controle de agenda dos profissionais | Painel de gestão em tempo real |
| Sem histórico de clientes | CRM integrado com todas as interações |
| Processos de cobrança manuais | Relatórios e controle financeiro |

---

## 2. Quem Usa o Sistema

### Perfis de Usuário

```
┌─────────────────────────────────────────────────────────┐
│                    PLATAFORMA SaaS                      │
│                                                         │
│  [Admin Plataforma] ── gerencia todos os clientes       │
│                                                         │
│  ┌─────────────────────────────────────┐                │
│  │         BARBEARIA DO CLIENTE        │                │
│  │                                     │                │
│  │  [Dono]       → configuração total  │                │
│  │  [Admin]      → gestão operacional  │                │
│  │  [Gerente]    → agenda e equipe     │                │
│  │  [Barbeiro]   → sua própria agenda  │                │
│  │  [Atendente]  → atendimento         │                │
│  │  [Visualizador] → somente leitura   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  [Cliente Final] → interage via WhatsApp                │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Visão Geral do Sistema

### 3.1 Módulos Principais

```
┌──────────────────────────────────────────────────────────────────┐
│                      SaaS Barbearia                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   AGENDA     │  │   CLIENTES   │  │    WHATSAPP BOT      │   │
│  │              │  │   (CRM)      │  │                      │   │
│  │ Agendamentos │  │ Histórico    │  │ Agendamento auto     │   │
│  │ Bloqueios    │  │ Consentimento│  │ Lembretes            │   │
│  │ Disponib.    │  │ Mensagens    │  │ Confirmações         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  PROFISSIO-  │  │   SERVIÇOS   │  │    CONFIGURAÇÕES     │   │
│  │   NAIS       │  │              │  │                      │   │
│  │ Cadastro     │  │ Catálogo     │  │ Horários             │   │
│  │ Horários     │  │ Preços       │  │ Integrações          │   │
│  │ Folgas       │  │ Duração      │  │ Limites do plano     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   AUDITORIA & SEGURANÇA                  │   │
│  │  Log de todas as ações · RLS · JWT · LGPD (consentimentos)│   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Fluxo Principal — Agendamento via WhatsApp

```
CLIENTE                  WHATSAPP BOT              SISTEMA
   │                          │                       │
   │──"Quero agendar"────────▶│                       │
   │                          │──busca disponibilidade▶│
   │                          │◀── horários livres ───│
   │◀─"Escolha o horário"─────│                       │
   │──"Sexta 10h"────────────▶│                       │
   │                          │──cria agendamento────▶│
   │                          │◀── confirmado ────────│
   │◀─"Confirmado! ✅"────────│                       │
   │                          │                       │
   │         [24h antes]      │                       │
   │◀─"Lembrete: amanhã 10h"──│                       │
   │──"Vou comparecer"───────▶│                       │
   │◀─"Ótimo! Te esperamos"───│                       │
```

---

## 4. Arquitetura Técnica — Visão Gerencial

### 4.1 Componentes do Sistema

| Componente | Função | Tecnologia |
|---|---|---|
| **API Backend** | Cérebro do sistema — regras de negócio | Node.js / Fastify |
| **Banco de Dados** | Armazenamento persistente e seguro | PostgreSQL 16 |
| **Cache / Filas** | Performance e envio assíncrono de mensagens | Redis 7 |
| **Automação** | Fluxos do bot WhatsApp e integrações | n8n |
| **WhatsApp** | Canal de comunicação com clientes | Evolution API |

### 4.2 Como os Dados Fluem

```
  Cliente Final
       │
       ▼ WhatsApp
  Evolution API ──webhook──▶ API Backend ──▶ PostgreSQL
                                  │
                                  ▼
                              Redis (filas)
                                  │
                                  ▼ (assíncrono)
                          Worker de Mensagens
                                  │
                                  ▼
                          Evolution API ──▶ WhatsApp ──▶ Cliente
```

### 4.3 Segurança em Camadas

```
INTERNET
    │
    ▼
[HTTPS / TLS]            ← Criptografia em trânsito
    │
    ▼
[JWT + Sessões]          ← Autenticação por token
    │
    ▼
[RBAC — 7 papéis]        ← Controle de quem faz o quê
    │
    ▼
[Row Level Security]     ← Banco nunca mistura dados de barbearias diferentes
    │
    ▼
[Audit Log]              ← Registro imutável de toda ação
```

---

## 5. Modelo de Multi-tenancy

Cada **barbearia** (tenant) é completamente isolada das demais:

- Os dados de uma barbearia **nunca são visíveis** por outra
- O isolamento é garantido no nível do **banco de dados** (Row Level Security)
- O sistema suporta **N barbearias** na mesma infraestrutura
- Cada barbearia tem seu próprio: usuários, clientes, profissionais, agenda, configurações e integrações WhatsApp

---

## 6. Integrações Externas

| Integração | Finalidade | Protocolo |
|---|---|---|
| **Evolution API** | Envio e recebimento de mensagens WhatsApp | REST + Webhook |
| **n8n** | Automação de fluxos conversacionais | Webhooks internos |
| **Let's Encrypt** | Certificados SSL automáticos | ACME |

### Segurança das Integrações
- Webhooks protegidos por **assinatura HMAC-SHA256** por instância
- Tokens por tenant — nunca compartilhados
- Deduplicação de eventos para evitar processamento duplicado

---

## 7. Planos e Limites

O sistema suporta planos diferenciados com limites configuráveis por tenant:

| Funcionalidade | Configurável por plano |
|---|---|
| Requisições por minuto (RPM) | ✅ Sim |
| Número de profissionais | ✅ Sim |
| Histórico de mensagens | ✅ Sim |
| Instâncias WhatsApp | ✅ Sim |

---

## 8. Disponibilidade e Recuperação

| Aspecto | Solução |
|---|---|
| **Backup automático** | Diário, retenção 60 dias, `pg_dump` comprimido |
| **Healthcheck** | Endpoints `/health/live` e `/health/ready` monitorados |
| **Retry de mensagens** | Até 5 tentativas com backoff exponencial |
| **Idempotência** | Nenhuma mensagem processada duas vezes |
| **Logs estruturados** | JSON com `request_id` para rastreamento |

---

## 9. Conformidade e LGPD

O sistema foi desenvolvido com **privacidade por design**:

- **Consentimento explícito** antes de qualquer comunicação WhatsApp
- **Opt-in / Opt-out** registrado com data e canal
- **Direito ao esquecimento** — possibilidade de remoção de dados
- **Audit log imutável** — toda ação é registrada com usuário, data e IP
- **Dado mínimo** — somente informações necessárias são coletadas

---

## 10. Roadmap de Evolução

| Fase | Entregável | Status |
|---|---|---|
| **Fase 1** | Banco + RLS + Auth + Webhook + Agenda | ✅ Concluído |
| **Fase 2** | CRUDs completos + Engine de disponibilidade + Outbox | ✅ Concluído |
| **Fase 3** | Lockout + Audit + LGPD + Calendar blocks + Prod | ✅ Concluído |
| **Fase 4** | Testes de carga + monitoramento + painel admin | 🔜 Próxima |
| **Fase 5** | Pagamentos integrados + relatórios gerenciais | 🔜 Futuro |

---

## 11. Resumo de Entregáveis Técnicos

| Item | Status |
|---|---|
| 21 tabelas no banco com isolamento por tenant | ✅ |
| 7 níveis de acesso (RBAC) | ✅ |
| Autenticação JWT + refresh + revogação | ✅ |
| Integração WhatsApp com HMAC por instância | ✅ |
| Engine de disponibilidade com bloqueios | ✅ |
| Fila de mensagens assíncrona (outbox pattern) | ✅ |
| Bloqueio de conta por tentativas inválidas | ✅ |
| Consentimentos LGPD por canal e propósito | ✅ |
| Log de auditoria de todas as ações | ✅ |
| Deploy via Docker (staging + produção) | ✅ |
| Backup automático com retenção | ✅ |
| CI/CD com GitHub Actions | ✅ |

---

*Documento gerado em 29/04/2026 — Exeq Tecnologia*  
*Para versão detalhada de requisitos, consultar: `DOC_BAIXO_NIVEL_REQUISITOS.md`*
