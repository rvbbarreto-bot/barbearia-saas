# Pacote de validação PO — GATE P2.2.1 + P2.3 (Operação assistida)

**Data da corrida:** 2026-05-15  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**Ambiente:** Docker Compose local (`api` :3000, `web` :3001, `postgres`, `redis`, `n8n` :5679)

---

## 1. Resumo executivo

| Entrega | Estado | Evidência principal |
|--------|--------|---------------------|
| **GATE P2.2.1** (portal + outbox + QA) | **Pronto para validação PO** | PNGs em `docs/evidencias/gate0_p2_2_1/` + `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv` (exit 0) |
| **P2.3** (webhook, auditoria, reminder 24h) | **Pronto para validação PO** | `scripts/qa-p2-3-operational-assisted-battery.ps1` exit 0 + `docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv` |

---

## 2. Git e infraestrutura

```text
git rev-parse HEAD
014c355d916782eb180657320b71ab07ed4d968a

git log -1 --oneline
014c355 feat(p2.3): inbound audit, reminder24h outbox, assisted ops QA script
```

**Health (corrida):**

```text
GET http://localhost:3000/health          → {"status":"ok"}
GET http://localhost:3000/database/health → {"status":"ok","database":"connected"}
```

**Docker (`docker compose ps`):** `api`, `web`, `postgres`, `redis`, `n8n` — **healthy**.

**Rebuild API/Web (recomendado antes de homologar):**

```powershell
docker compose build api web
docker compose up -d --force-recreate api web
```

---

## 3. QA automatizado (reexecutado nesta sessão)

| Script | Exit | CSV |
|--------|------|-----|
| `scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1` | **0** | `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv` |
| `scripts/qa-p2-3-operational-assisted-battery.ps1` | **0** | `docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv` |
| Regressão embutida P2.3: P2.1 + P1 (CT 330–332) | **0** | (dentro do CSV P2.3) |

**Matriz P2.3 (resumo):** CT-P2-300…302 health/dry-run; 310…313 webhook; 314…315 auditoria inbound; 316…318 outbox/retry; 320…324 reminder 24h; 330…332 regressões.

---

## 4. Evidências visuais GATE 0 (`docs/evidencias/gate0_p2_2_1/`)

| Ficheiro | Conteúdo capturado | Notas |
|----------|-------------------|--------|
| `01_agenda_vista_dia.png` | Agenda — vista dia (atendente) | Calendário react-big-calendar, filtros profissional/status |
| `02_agenda_vista_semana.png` | Agenda — ecrã operacional (admin) | **Nota:** toggle Dia/Semana do bundle actual mostra vista dia; vista semana validada na API (CT-P2-216/218) |
| `03_agenda_bloqueio.png` | Modal **Bloquear horário** | Manager/admin, motivo preenchido |
| `04_outbox_lista.png` | **Mensagens (outbox)** — tabela sanitizada | 83 mensagens, estados visíveis (ex.: processing) |
| `05_outbox_detalhe.png` | Detalhe — preview, destino mascarado, `last_error`, idempotency | Sem payload completo |
| `06_outbox_retry_manager.png` | *(ver secção 5)* | Retry manual manager + confirmação UI |
| `07_rbac_retry_negado.png` | Detalhe outbox como **atendente** | Apenas **Fechar** — sem «Tentar novamente» (RBAC `outbox.retry` = manager+) |
| `08_cross_tenant_negado.png` | Login multi-tenant | Campo tenant opcional + instrução `X-Tenant-Id`; isolamento validado em CT-P2-208 (API) |
| `09_erro_slot_bloqueado.png` | *(ver secção 5)* | Conflito 409 em slot bloqueado |

---

## 5. Itens complementares (API / QA quando UI limitada)

### 5.1 Retry manual manager (06)

- Mensagem preparada em BD: `status=dead`, `id=b80befc7-f94d-42c9-aa79-504d62a449cf`.
- **API:** `POST /api/v1/outbox/messages/{id}/retry` com token **admin@demo.local** → re-enfileira (`pending`).
- **Auditoria:** evento `OUTBOX_MANUAL_RETRY` (CT-P2-318 na bateria P2.3).
- **UI:** fluxo equivalente em `OutboxMessagesPage` — botão «Tentar novamente» + diálogo «Re-enfileirar envio?» (manager).

### 5.2 Cross-tenant (08)

- Portal: sessão ligada ao tenant do login (`X-Tenant-Id` no topbar).
- **API:** `CT-P2-208` — outbox cross-tenant → **403** `TENANT_MISMATCH` (CSV P2.2).

### 5.3 Slot bloqueado (09)

- **API:** `CT-P2-217` — create appointment em slot bloqueado → **409** (CSV P2.2, PASS).
- Portal: `getApiErrorMessage` exibe mensagem amigável (sem 500).

---

## 6. P2.3 — Operação assistida (referência rápida)

| Tema | Documentação |
|------|----------------|
| Visão geral | `docs/P2_3_OPERACAO_ASSISTIDA.md` |
| Evidências curl/logs | `docs/P2_3_EVIDENCIAS_WHATSAPP_AUDITORIA_REMINDER.md` |
| N8N smoke | `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` |
| Runbook | `docs/P2_RUNBOOK_SUPORTE.md` |

**Webhook smoke:** `POST /webhooks/whatsapp/inbound` — válido + duplicado (`duplicate: true`).  
**Reminder 24h:** job `reminder_24h` após confirm; idempotência `reminder_24h:<appointment_id>`.

---

## 7. Checklist PO (aceite)

- [x] Bateria P2.2.1 exit 0
- [x] Bateria P2.3 exit 0
- [x] PNGs GATE 0 anexados (9 ficheiros ou equivalentes documentados)
- [x] Health API OK
- [x] CSVs versionados
- [ ] PO valida visualmente no portal (login demo: `atendente@demo.local` / `admin@demo.local`, senha `admin12345`)
- [ ] PO confirma commit GATE: `docs(p2.2): attach gate evidence and finalize P2.2 QA` (após aprovação deste pacote)

---

## 8. Débitos / observações

1. **Imagem web Docker:** após `docker compose build web`, confirmar no browser os botões **Dia | Semana** na agenda (código em `AgendaPage.tsx`); se não aparecerem, limpar cache do browser.
2. **Evolution:** outbox pode ficar em `processing`/`fetch failed` sem provider real — esperado em dev.
3. **Rate limit login:** após muitas tentativas QA, aguardar ~60s antes de novo login manual.

---

*Gerado por QA/DevOps — sessão browser MCP + baterias PowerShell.*
