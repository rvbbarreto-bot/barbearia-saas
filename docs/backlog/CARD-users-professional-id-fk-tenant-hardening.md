# Card — Hardening DB: `users.professional_id` e mesmo `tenant_id`

**Tipo:** análise / DDL futuro (requer aprovação explícita do PO)

## Contexto

A FK `users.professional_id → professionals(id)` não garante que o profissional pertence ao mesmo `tenant_id` que o utilizador. Nesta etapa a validação foi feita na **aplicação** (`resolveAppointmentProfessionalFilter`) e no **seed** (matching por `tenant_id` + slug).

## Opções (DBA / arquiteto)

1. Trigger `BEFORE INSERT OR UPDATE OF professional_id` validando `EXISTS (SELECT 1 FROM professionals p WHERE p.id = NEW.professional_id AND p.tenant_id = NEW.tenant_id)` quando `professional_id IS NOT NULL`.
2. Índice único ou FK composta se existir `UNIQUE (tenant_id, id)` em `professionals` (hoje PK só em `id`).
3. Manter apenas validação na API + revisões operacionais periódicas.

## Critérios de aceite (fase futura)

- [ ] DDL revisto por DBA em cópia DEV antes de produção.
- [ ] Sem regressão em migrações de dados legítimos.
