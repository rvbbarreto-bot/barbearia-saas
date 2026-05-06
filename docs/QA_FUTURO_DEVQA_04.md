# QA futuro — complemento DEV/QA-04

**Data:** 2026-05-03  
**Contexto:** o pacote DEV/QA-04 reduz risco técnico; **não** substitui homologação formal.

---

## Pré-requisitos antes de QA formal

1. **CI remoto:** pipeline com typecheck, lint, testes unitários, Gitleaks, e (quando acordado) harness de integração com Postgres/Redis em runner compatível.
2. **n8n:** evidência de UI — workflows **01** (se aplicável), **02**, **03** importados na versão alinhada; **Active=OFF**; screenshot ou export assinado.
3. **Segredos:** Gitleaks no clone com histórico completo (`fetch-depth: 0`) sem findings não tratados.
4. **Tenant / RLS:** smoke manual ou script de inventário de tabelas com `tenant_id` sem RLS (se existir, tratar ou documentar exceção aprovada).

---

## Matriz sugerida (API)

| Área | Já coberto por integração local (harness) | Pendente QA / E2E |
|------|-------------------------------------------|-------------------|
| Appointments | Criar, conflito, idempotência, serviço errado, tenant | Fluxo HTTP completo com JWT real de utilizador criado em `users` |
| Availability | Slots, `min_advance`, isolamento | UI calendário + fuso horário edge cases |
| Outbound WhatsApp (API) | RBAC, outbox, idempotência, tenant | Worker real (sem envio) ou mock de fila acordado |
| Recall | `RECALL_ENABLED`, consentimento, outbox | Agendamento com data real + janela de recall em staging |
| Waitlist / customers / professionals | RLS + regras base | Carga e concorrência |

---

## n8n

- Nunca ativar **02/03** em ambiente partilhado sem roteamento e secrets de DEV isolados.
- Validar que nenhum nó aponta para base Postgres da aplicação nem para Evolution `sendText` direto (repetir `scripts/audit-n8n-workflows.ps1` após qualquer edição na UI).

---

## Declaração

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
