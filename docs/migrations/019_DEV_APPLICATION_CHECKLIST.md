# Checklist — aplicação controlada da migration **019** em DEV

**Pré-condição PO:** relatório 011–018 completo, lacuna 012 resolvida, fluxo WhatsApp waitlist **desativado** (`WAITLIST_SLOT_NOTIFY_ENABLED` ≠ true), revisão SQL 019, backup planado — **validação PO antes do apply**.

## 1. Backup

- [ ] Confirmar ambiente **DEV** (não produção).
- [ ] Backup lógico ou snapshot (`pg_dump`/snapshot cloud).
- [ ] Registar **nome do ficheiro** e **timestamp UTC**.
- [ ] Guardar evidência (path seguro, não commitar segredos).

## 2. Revisão SQL (`019_waitlist_manual_override.sql`)

- [ ] Confirmar ausência de `DROP TABLE`, `TRUNCATE`, `DELETE FROM`, `DROP COLUMN` indevidos.
- [ ] Aceitar `DROP CONSTRAINT appointments_no_time_overlap` + recriação GiST como **necessário**.
- [ ] Validar predicado GiST inclui `manual_override = false`.
- [ ] RLS + GRANT `waitlist_entries` presentes.

## 3. Aplicação

- [ ] Aplicar migração na pipeline ou sessão controlada.
- [ ] Evidenciar **COMMIT** final.
- [ ] Evidenciar ausência de **ERROR** / **ROLLBACK** / `current transaction is aborted`.

## 4. Pós-validação estrutural

- [ ] `\d waitlist_entries` (ou equivalente): colunas e índices.
- [ ] `\d appointments`: colunas `manual_override*`.
- [ ] `\d customers`: `is_vip`.
- [ ] Constraint `appointments_no_time_overlap` existe e usa `WHERE` com `manual_override`.

## 5. Testes mínimos (evidência)

- [ ] Waitlist CRUD + isolamento por tenant.
- [ ] VIP / `deposit_priority` alteram ordenação (com e sem `tenant_settings.settings.waitlist`).
- [ ] `deposit_priority` **não** invoca Pix.
- [ ] Manual override: só perfil autorizado; motivo obrigatório; auditoria.
- [ ] `WAITLIST_SLOT_NOTIFY_ENABLED` **omitido ou false**: **zero** jobs waitlist criados ao libertar slot; processor não envia WhatsApp waitlist.
- [ ] `npm run typecheck` (API).

## 6. Fora de escopo (não contar como aceite deste card)

- Produção / cliente real.
- WhatsApp automático waitlist sem novo aceite PO.
- PSP Pix / webhook / recall / financeiro / comissão / n8n.
