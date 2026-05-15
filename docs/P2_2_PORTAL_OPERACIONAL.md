# P2.2 / P2.3 — Grande Pacote Operacional (Portal + Outbox + WhatsApp)

**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**Commit base (P2.1 fechada):** `f57b1a3dafe596111fb1314d949f0976e8d78dd7`  
**Kickoff registado em:** `docs/P2_RELATORIO_MVP_OPERACIONAL.md` §10

## 1. Objetivo

Entregar versão **operacional ampliada**: Web + API + outbox visível a suporte + fluxo **WhatsApp/N8N mínimo** reproduzível + tratamento de erros no portal + **QA automatizado** + OpenAPI e runbooks — padrão sénior, integração ponta a ponta, critérios de aceite explícitos.

**Fora de âmbito (decisão PO):** Pix, cobrança, campanhas, remarketing. Lembrete 24h pode ficar em backlog se necessário.

## 2. Decisões de produto (fixas)

1. Portal = canal oficial de operação manual do piloto.  
2. No-show = balcão/gestão; **não** `professional`.  
3. Cancelamento no portal para perfis autorizados.  
4. Remarcação valida **availability**.  
5. **Time-block** = indisponibilidade manual do profissional.  
6. Outbox visível para diagnóstico de suporte.  
7. WhatsApp/N8N = mínimo, reproduzível, controlado.  
8. Segurança multi-tenant **não negociável**.

## 3. Blocos de entrega (macro)

| Bloco | Tema |
| ----- | ---- |
| **A** | Portal — agenda diária/semana, lista, filtros (data, profissional, status), CRUD operacional de appointments (criar, cancelar, remarcar, complete, no-show), estados visuais, reload após ação, RBAC nas ações |
| **B** | Web + **availability** + **time-blocks** (consultar, criar, listar, remover; bloqueio reflete na agenda; erro compreensível em conflito) |
| **C** | Mapeamento de códigos de erro API → mensagens amigáveis (lista obrigatória no brief PO); sem stack trace na UI |
| **D** | Outbox operacional: **`GET /api/v1/outbox/messages`** ✅ (portal `/operacao/mensagens`); retry manual `POST .../retry` — pendente ou débito |
| **E** | WhatsApp/N8N mínimo E2E (workflows versionados, smoke, evidências, dedup, outbox) |
| **F** | Auditoria/rastreabilidade no portal ou evidência DB+logs |
| **G** | QA P2.2 (novo script ou extensão da bateria P2.1 + CSV `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`) |
| **H** | OpenAPI, README, runbooks, `P2_*` docs atualizados |
| **I** | Hardening + regressão P1/P2.1 |

## 4. Fluxo de demonstração alvo (aceite)

1. Login no portal.  
2. Agenda dia/semana + lista com filtros.  
3. Consultar disponibilidade para novo appointment.  
4. Criar appointment manual.  
5. Cancelar / remarcar / complete / no-show (conforme RBAC).  
6. Criar e remover bloqueio; availability reflete.  
7. Tentativa em slot bloqueado → erro controlado.  
8. Lista outbox (pending/sent/dead), `last_error`, sem segredos.  
9. Fluxo WhatsApp mínimo (inbound → opções → escolha → appointment → outbox).  
10. Script QA P2.2 com exit `0` + CSV.

## 5. Códigos de erro — mapeamento portal (Bloco C)

| Código / chave | Mensagem (PT) |
| ---------------- | --------------- |
| `SLOT_UNAVAILABLE` | Horário indisponível. Escolha outro horário. |
| `TENANT_REQUIRED` | Não foi possível identificar a unidade/tenant. Faça login novamente. |
| `TENANT_MISMATCH` | Você não tem permissão para acessar dados desta unidade. |
| `CUSTOMER_NOT_FOUND` | Cliente não encontrado. |
| `PROFESSIONAL_NOT_FOUND` | Profissional não encontrado. |
| `SERVICE_NOT_FOUND` | Serviço não encontrado. |
| `APPOINTMENT_IN_PAST` | Não é possível agendar no passado. |
| `DUPLICATE_IDEMPOTENCY_KEY` | Esta operação já foi processada. Atualize a tela. |
| `FORBIDDEN` / 403 | Você não tem permissão para executar esta ação. |
| `UNAUTHORIZED` / 401 | Sessão inválida ou expirada. Faça login novamente. |
| `OUTBOX_SEND_FAILED` | Mensagem não enviada. Verifique o status no painel de mensagens. |

*Implementação:* módulo único no Web (ex. `apiErrorMessage.ts`) + fallback genérico sem expor detalhe técnico.

## 6. Outbox — API alvo (Bloco D)

**Mínimo pedido pelo PO:** `GET /api/v1/outbox/messages` com filtros (status, data, provider, destino, `correlation_id`, `appointment_id`) e campos listados no brief.

**Estado actual (P2.1):** existe `GET /api/v1/integrations/outbound/outbox-summary` (agregado, RBAC `manager`). A P2.2 deve **estender** ou **substituir** por listagem paginada conforme matriz RBAC de suporte — ver implementação e OpenAPI.

**Retry:** `POST /api/v1/outbox/messages/:id/retry` se viável; senão débito explícito em relatório e `P2_OUTBOX_OPERACIONAL.md`.

## 7. QA P2.2 (Bloco G)

- Script: novo `scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1` **ou** ampliação de `scripts/qa-api-p2-operational-battery.ps1`.  
- CSV: `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`.  
- Cobertura mínima: health, DB health, auth negativo, tenant mismatch, ciclo appointment (create, cancel, reschedule, complete, no-show), time-block create/delete, availability com bloqueio, appointment em slot bloqueado, outbox listagem (+ falha provider se aplicável), webhook duplicado, fluxo WhatsApp mínimo, regressão P1 e P2.1.

## 8. Critérios de reprovação direta (extraídos do brief PO)

Incluem: appointment em slot ocupado/bloqueado; RBAC violado; cross-tenant; duplicação WhatsApp/outbox indevida; tela a quebrar em erro esperado; 500 em validação simples; OpenAPI divergente; script QA a falhar; entrega sem evidência.

## 9. Entregáveis finais (checklist fábrica)

- [ ] Código backend + frontend + N8N (se alterado)  
- [ ] Scripts QA + CSV  
- [ ] OpenAPI + README + runbooks + relatório P2 + evidências (Docker, health, portal, outbox, WhatsApp, logs API/worker, `git log`/`status`/`rev-parse`)  
- [ ] Lista de débitos remanescentes e riscos  

---

*Este documento acompanha a implementação; o relatório principal continua a ser `docs/P2_RELATORIO_MVP_OPERACIONAL.md`.*
