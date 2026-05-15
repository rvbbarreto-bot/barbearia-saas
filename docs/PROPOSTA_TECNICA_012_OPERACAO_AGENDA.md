# Proposta técnica — bloco 012: operação real da agenda e transições de status

**Baseline:** `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf`  
**Pré-requisito:** etapa **011 homologada no DEV oficial** (relatório preenchido e versionado).  
**Fora de escopo:** Pix, recall, financeiro, comissão, n8n, outbox-worker, telas novas, relatórios avançados.

Esta proposta é deliberada **curta**; detalhe de implementação segue no PR após aprovação do PO.

---

## 1. Estratégia de histórico (`appointment_status_history`)

**Recomendação:** **gravar na camada de domínio** (uma função `transitionAppointmentStatus` que atualiza `appointments.status` e insere em `appointment_status_history` com `actor_type`, `reason`, `metadata`/`payload`, `created_at`).

**Motivo:** o trigger atual (009) só grava `previous_status` / `new_status` e não preenche actor nem motivo; o PO exige **toda transição operacional** com auditoria rica e **não** aceitar mudança de status sem histórico coerente.

**Plano de coexistência:**

1. Adicionar colunas em `appointment_status_history` alinhadas ao V4 (ex.: `from_status`, `to_status` como alias ou renomear em migration idempotente; `actor_type`, `actor_id`, `reason`, `metadata` jsonb, `source` `web|api|system`) **ou** padronizar tudo em `payload` documentado.
2. **Substituir** o trigger `appointments_status_hist_trg` por uma versão que **não duplica** linhas quando o domínio já gravou, **ou** remover o trigger e passar a única fonte = domínio (preferível para evitar duplicatas e linhas sem actor).

**Não** manter duas fontes de verdade sem regra clara.

---

## 2. Estratégia de remarcação

**Recomendação:** **Opção B (menos disruptiva no código atual)** — manter **um único** `appointments` e **atualizar** `starts_at` / `ends_at` após validação de conflito + buffers (como `rescheduleAppointment` já faz).

**Complementos obrigatórios:**

- Na **mesma transação:** atualizar `status` para `rescheduled` **após** o update de horários **ou** introduzir estado intermediário documentado; registar no histórico a transição (ex. `confirmed` → `rescheduled` com metadata dos horários antigos/novos).  
- Se o modelo V4 exigir rastreio forte “appointment original”, adicionar **`original_appointment_id` só quando** migrarmos para cópia de linha (Opção A); caso contrário, o vínculo “original” **é o próprio id** com histórico de eventos.

**Motivo:** reschedule já libera/ocupa slot via EXCLUDE + lista de status bloqueantes; criar novo row exige duplicar idempotency, relações e políticas RLS — maior risco neste momento.

---

## 3. Timestamps operacionais em `appointments`

**Recomendação (mínimo):**

| Coluna | Uso |
|--------|-----|
| `checked_in_at` | check-in real |
| `service_started_at` | início do atendimento (`in_service`) |
| `service_completed_at` | conclusão (`completed`) |

Opcional: `no_show_marked_at` ou derivar só de histórico — **não obrigatório** se histórico + auditoria forem completos.

Todos `timestamptz`, preenchidos apenas nas transições correspondentes; `NULL` quando não aplicável.

---

## 4. Matriz de transições (resumo)

**Válidas (alvo implementação 012):**

| De | Para | Notas |
|----|------|--------|
| `confirmed` | `checked_in` | check-in |
| `confirmed` | `cancelled` | motivo obrigatório |
| `confirmed` | `rescheduled` | remarcação (ou permanece `confirmed` com histórico só de horário — alinhar ao enum final) |
| `confirmed` | `no_show_pending` | após tolerância / ação operacional |
| `confirmed` | `no_show` | só com permissão + motivo (manual) |
| `checked_in` | `in_service` | start |
| `checked_in` | `cancelled` | se política permitir |
| `in_service` | `completed` | complete |
| `no_show_pending` | `no_show` | confirmação manual |
| `no_show_pending` | `checked_in` | correção se cliente chegou |

**Inválidas (bloquear explicitamente):**

- Qualquer transição **a partir de** `completed` para estado operacional (salvo regra futura explícita).
- `cancelled` → operacional sem fluxo de exceção documentado.
- `completed` → `no_show`.
- Operações de **outro** `professional_id` por utilizador `professional` (reuso da guarda 011).

Política **recomendada:** `complete` só a partir de `in_service` (ou `checked_in` se tenant permitir “pular” start — configurável em `tenant_settings`).

---

## 5. Endpoints a criar / alterar

**Prefixo:** `/api/v1/appointments/:appointmentId/…`

| Operação | Método | Estado |
|----------|--------|--------|
| Check-in | `PATCH …/check-in` | **Criar** |
| Início | `PATCH …/start` | **Criar** |
| Conclusão | `PATCH …/complete` | **Alterar** (transições + timestamps + escopo profissional + RBAC) |
| Cancelamento | `PATCH …/cancel` | **Alterar** (motivo obrigatório; bloquear `completed`) |
| Remarcação | `PATCH …/reschedule` | **Alterar** (status/histórico + manter validação conflito) |
| No-show pendente | `PATCH …/no-show-pending` | **Criar** |
| No-show manual | `PATCH …/no-show` | **Alterar** (motivo obrigatório; escopo profissional) |
| Listagem / leitura | `GET …` | Já existe; mutações com **mesma** regra de escopo que lista |

**Histórico:** `GET …/history` pode continuar a expor `appointment_events` e/ou passar a incluir `appointment_status_history` — decisão fina na implementação (evitar duas UIs de histórico sem necessidade).

**Atraso:** leitura de `late_tolerance_minutes` em `tenant_settings.settings` + job ou endpoint interno que marca elegíveis a `no_show_pending` (sem auto `no_show`).

---

## 6. Testes obrigatórios

- Transições **válidas** e **inválidas** por status.
- **Histórico:** cada PATCH operacional gera linha (domínio) com actor/reason quando aplicável.
- **Permissões:** `professional` só no próprio `professional_id`; admin/gerente/atendente conforme matriz RBAC existente; `platform_admin` + `X-Tenant-Id`.
- **Tenant isolation** em todos os PATCH.
- **Cancelamento:** slot volta à disponibilidade (status não bloqueante).
- **Remarcação:** sem conflito EXCLUDE; horário antigo liberado / novo ocupado.
- **No-show pending:** não aplicável após check-in; não promove a `no_show` sem ação explícita.
- **No-show manual:** motivo obrigatório; não partir de `completed`.

Complemento: typecheck API/Web; testes de integração com `DATABASE_URL` do DEV quando aplicável.

---

## Decisão pendente do PO antes do merge 012

- Aprovar **remoção ou neutração** do trigger de histórico em favor do domínio.  
- Confirmar se `rescheduled` deve ser **valor de `status`** após remarcação ou apenas registo em histórico com status operacional atual permanecendo `confirmed`.

---

## Estado (2026-05-15) — alinhamento com merges em `piloto-staging-01`

- Foi integrado em **`piloto-staging-01`** o pacote **PILOTO-STAGING-02** (agenda: passado, escopo profissional em cancel/create/walk-in, testes, CI) via [PR #3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3) — merge `e5a0f0d282251faed2cd6597d3aceddf011dce4f`; [CI run #23](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25946809629) verde.  
- Este documento (**012**) descreve trabalho **adicional** (histórico rico, timestamps operacionais completos, novos PATCH, matriz de transições alargada) — **não** está concluído só com o merge acima; decisões pendentes na secção 7 mantêm-se.  
- Evidências do merge piloto-02: `docs/evidencias/piloto_staging_02/07_status_report_pos_merge.md`.

---

*Documento vivo: atualizar após revisão do PO.*
