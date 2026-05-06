# Riscos aceitos pela gestão — desenvolvimento DEV/QA

**Classificação do projeto:** DEV/QA — candidato técnico em evolução.  
**Não constitui:** produção, piloto comercial, GA, SaaS maduro nem homologação final.

Este registo documenta **débitos de governança** que a gestão aceitou para **não bloquear** o desenvolvimento em DEV/QA, mantendo-os **bloqueadores** para produção, piloto comercial e GA.

---

## 1. CI remoto ainda não validado

- **Estado:** execução verde do GitHub Actions (ou equivalente) não anexada / não confirmada no repositório remoto.
- **Risco:** regressões podem passar sem deteção automática remota.
- **Bloqueador para:** produção, piloto, GA.
- **Não bloqueador para:** desenvolvimento local e DEV/QA com validação manual mínima.

## 2. Print runtime n8n (workflows 02/03 Active=OFF)

- **Estado:** evidência de UI do n8n QA ainda não anexada.
- **Risco:** workflows bloqueados poderiam estar ativos num ambiente real sem controlo documentado.
- **Bloqueador para:** produção, piloto, GA.
- **Regra:** workflows **02** e **03** permanecem **Active=false** até aceite formal e remediação concluída.

## 3. Secret scan remoto com histórico Git completo

- **Estado:** Gitleaks (ou equivalente) no repositório remoto com `fetch-depth` completo ainda não evidenciado.
- **Risco:** segredos históricos podem existir fora do clone local.
- **Bloqueador para:** produção, piloto, GA.

## 4. Decisão da gestão

- **Decisão:** continuar desenvolvimento estratégico em DEV/QA com risco explícito, **sem** encerrar formalmente o P0 de governança.
- **Responsável pela decisão (preencher):** _[nome / cargo — decisão de seguir sem QA imediato]_
- **Data da decisão:** 2026-05-03 _(atualizar se aplicável)_

### 4.1 Pacote DEV/QA-02 — riscos aceitos e débitos

| Tema | Risco aceito / débito | Pendente de validação QA | Bloqueio produção / piloto |
|------|------------------------|---------------------------|----------------------------|
| Recall + Workflow 03 | Fluxo refatorado para API/outbox; JSON exportado `active=false`; `RECALL_ENABLED` default false | Import real no n8n, teste E2E com JWT, prova de idempotência e limites | Ativar workflow 03 ou `RECALL_ENABLED=true` sem aceite |
| Customers / Professionals | Testes de integração criados; dependem de Postgres/Redis | Execução em CI/staging com massa acordada | Nenhum além do geral (homologação formal) |
| PIX / PSP | Apenas ADR e flags; sem integração real | Decisão PO sobre PSP; sandbox contratado | `PIX_REAL_PROVIDER_ENABLED` e credenciais reais |
| Secret scan / n8n | Gitleaks e audit PowerShell podem não ter sido executados nesta máquina | Anexar logs e repetir no remoto | Histórico Git completo sem scan verde |

**Critérios para remoção destes riscos:** CI remoto verde (incl. integração), Gitleaks sem findings tratáveis, evidência n8n 02/03 **Active=OFF**, QA formal executado com critérios de `docs/QA_FUTURO_DEVQA_02.md` / `docs/QA_FUTURO_DEVQA_03.md`, decisão PSP registada.

### 4.2 Pacote DEV/QA-03 — mitigações e débitos remanescentes

| Tema | Mitigação entregue | Débito / evidência ainda aceite |
|------|-------------------|--------------------------------|
| Integração Postgres/Redis | Harness `scripts/run-api-integration-local.ps1` (e `.sh`); `vitest.config` reenvia env aos workers; 19 testes integração executáveis com role `barbearia_app` | CI remoto com Docker + mesma matriz ainda não anexado |
| Import n8n workflow 03 | JSON remediado + audit estático sem bloqueadores | Import manual na instância n8n da versão do projeto (UI) continua recomendado antes de QA formal |
| OpenAPI / Recall / PIX | Ver `RELATORIO_FINAL_DEVQA_03.md` | PSP real aguarda PO; `PIX_REAL_PROVIDER_ENABLED=false` por defeito |

### 4.3 Pacote DEV/QA-04 — mitigações e débitos remanescentes

| Tema | Mitigação entregue | Débito / evidência ainda aceite |
|------|-------------------|--------------------------------|
| n8n 02/03 | Validador Node + `validate-n8n-runtime-import.ps1` + audit PowerShell verdes; script `.ps1` corrigido para encoding | Importação e revisão visual na UI n8n da instância QA (checklist em `docs/N8N_RUNTIME_IMPORT_VALIDATION_DEVQA_04.md`) |
| Tenant context | Documento `docs/TENANT_CONTEXT_AUDIT_DEVQA_04.md`; testes `tenant-context` + suites de domínio no harness | Inventário SQL global de tabelas `tenant_id` sem RLS (QA futuro) |
| Integração API | Harness com **9** ficheiros, **39** testes integração passed | CI remoto com mesma matriz ainda não anexado |
| API → outbox | Testes integrations outbound + serviço sem WhatsApp real | Worker/fila em staging conforme `QA_FUTURO_DEVQA_04.md` |

### 4.4 Pacote DEV/QA-05 — mitigações e débitos remanescentes

| Tema | Mitigação entregue | Débito / evidência ainda aceite |
|------|-------------------|--------------------------------|
| n8n Docker | Pin `1.91.3` + import CLI 01/02/03 com `import:workflow`; logs `artifacts/devqa-05` | UI n8n com prints |
| Tenant context | Script grep + audit RLS no harness | Tabelas excecionais via allowlist se necessário no futuro |
| Integração | Harness + finance + commission + audit tenant | CI remoto |
| plan_limits | ADR técnico | Enforcement 402 não implementado |
| Frontend | Auditoria, waitlist, shell financeiro (flag) | Conversão waitlist na UI; ações financeiras críticas continuam proibidas |

## 5. Proibições que permanecem em vigor

- Não declarar P0 “fechado” sem evidências formais.
- Não ativar workflows n8n **02** ou **03** sem aceite e remediação.
- Não usar mock PIX ou dados de teste como se fossem cliente real.
- Não versionar `.env` real, segredos, tokens ou credenciais em código, docs ou JSON de workflow.
- Não permitir escrita direta do n8n no banco produtivo.
- Não transformar regra de negócio crítica em lógica só no n8n (orquestração segura via Core API/outbox).

## 6. Condições para baixar estes riscos

1. CI remoto verde com matriz acordada (API + Web + segurança + Gitleaks versionado).
2. Prints ou evidência equivalente: workflows **02** e **03** com **Active=OFF** no n8n QA.
3. Secret scan remoto no histórico completo sem leaks (ou leaks tratados e rotacionados).

---

## Histórico de atualizações

| Data       | Nota breve |
|------------|------------|
| 2026-05-03 | Criação do documento; alinhado à decisão de continuidade DEV/QA com débitos abertos. |
| 2026-05-03 | Pacote DEV/QA-01: testes RLS `branches`, remediação workflow 02 (export JSON), sweep waitlist, testes de integração waitlist. |
| 2026-05-03 | Pacote DEV/QA-02: workflow 03 via Core API; recall candidates/send; testes integração customers/professionals; ADR PSP; QA futuro; flags `RECALL_ENABLED` / `PIX_REAL_PROVIDER_ENABLED`; CI explícito para recall/PIX. |
| 2026-05-03 | Pacote DEV/QA-03: harness local com logs; env Vitest para integração; fixtures RLS (`withAppTenant`); integração branches/waitlist/customers/professionals/recall verdes no harness; Gitleaks local limpo nesta execução. |
| 2026-05-03 | Pacote DEV/QA-04: +appointments/availability/integrations + tenant-context; harness 39 testes integração; validação n8n estrutural + relatório; Gitleaks local limpo; audit n8n sem bloqueadores. |
| 2026-05-03 | Pacote DEV/QA-05: pin n8n 1.91.3 + Docker import script; audit tenant; harness +finance+commission; OpenAPI; UI auditoria/waitlist/shell financeiro; ADR plan_limits. |

---

**Entrega validada em DEV/QA local não representa produção, piloto comercial ou GA.**
