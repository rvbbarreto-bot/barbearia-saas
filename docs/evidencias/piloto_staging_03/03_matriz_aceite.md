# Matriz de aceite — PILOTO-STAGING-03

**Legenda:** OK | PEND | BLOCKED | N/A

**Última revisão documental (fábrica, pós-decisão PO PR #4):** alinhamento com aceite **parcial** do commit `ecf36a35467cd9e2007e7a0329cc1c3ea3df5b45` — **sem** aceite funcional completo, **sem** merge, **sem** homologação interna/externa.

---

## A. Pacote de preparação QA n8n (pacote técnico / importável)

| # | Critério | Status | Notas |
|---|----------|--------|-------|
| A1 | Documento `10_guia_inicio_testes_qa_n8n.md` entregue | OK | |
| A2 | JSONs em `docs/n8n/` espelho de `n8n/workflows/` | OK | Inclui correções `ecf36a3` |
| A3 | `npm run n8n:validate-workflows` sem erro | OK | Reexecutar após cada push |
| A4 | Exports com `"active": false` | OK | Validador |
| A5 | Sem segredos hardcoded nos JSON | OK | Validador + revisão PO |
| A6 | Pasta `qa_n8n/` com instruções + saída validador | OK | `17`/`18`; PNG reais ainda **PEND** |
| A7 | Governança incidente PR #2/main documentada | OK | `00_…` |
| A8 | Validador actualizado (regras anti-sandbox / URLs) | OK | `ecf36a3` |

---

## B. Entrega funcional completa PILOTO-STAGING-03 (fim de piloto / merge)

| # | Critério | Status | Notas |
|---|----------|--------|-------|
| B1 | Branch derivada de `piloto-staging-01` | OK | Feature branch piloto-03 |
| B2 | PR #4 com **descrição formal** no GitHub | PEND | Conteúdo canónico: `PR_4_CORPO_DESCRICAO.md` — **colar no GitHub** ou `scripts/update-pr4-description.ps1` com `GITHUB_TOKEN` |
| B3 | CI verde no PR | OK | Conforme decisão PO pós-QA |
| B4 | Gitleaks verde | OK | Conforme decisão PO |
| B5 | Workflows n8n **executados** em ambiente piloto + evidências reais | PEND | Substituir `*.png.txt` por PNG; anexar JSON de execução real |
| B6 | Painel operacional Web | PEND | Fora âmbito estrito n8n deste PR |
| B7 | Agenda avançada sem regressão | PEND | |
| B8 | Outbox + retry RBAC | PEND | |
| B9 | Auditoria correlation_id | PEND | |
| B10 | Cross-tenant + scope com evidência | PEND | |
| B11 | Incidente PR #2/main documentado | OK | |
| B12 | Nenhum merge em `main` desta entrega | OK | PR #4 aberto sem merge |

---

## C. Workflows n8n — aceite objectivo (próximo ciclo PO)

| Workflow | Critério | Status | Evidência / bloqueio |
|----------|----------|--------|----------------------|
| **01** | Parsing `body` + raiz; sem crypto/AbortController | OK | Código em `ecf36a3` |
| **01** | E2E real (webhook → Core → resposta) | PEND | Falta execução no Docker piloto com logs mascarados |
| **01** | Dedup formal `QA-N8N-DEDUP-001` (2× mesmo id) | PEND | Core suporta; falta prova n8n+API no piloto |
| **01** | `N8N_WORKFLOW_02_ID` sem fallback ambíguo em produção | PEND | Env + import; validador mantém WARN até preencher |
| **02** | Import + credencial HTTP (Bearer + `x-tenant-id`) | BLOCKED | Configuração **UI n8n** + segredos fora do repo |
| **02** | LLM / agente operacional | BLOCKED | Idem |
| **02** | E2E criação agendamento + outbox | PEND | Depende de C.02 |
| **03 SendText** | Payload `number`+`text`; classificador robusto | OK | `ecf36a3` |
| **03 SendText** | WhatsApp QA recebido (Evolution piloto) | PEND | Sem PNG/captura real anexada |
| **03 Recall** | `active=false` + gate `N8N_RECALL_ALLOW_SCHEDULE` | OK | `ecf36a3` |
| **03 Recall** | Prova carga controlada / sem campanha indevida | PEND | Teste manual documentado |

---

## D. Artefactos locais (não fazem parte do pacote versionado)

| Artefacto | Decisão | Status |
|-----------|---------|--------|
| `docs/n8n/*.LOCAL_IMPORT.json` | **Não versionar** — risco de import de padrões obsoletos | N/A — ficheiro exemplo removido do working tree; padrão ignorado no `.gitignore` |
| `Evidências.docx` | **Não versionar** — duplicado do pacote Markdown/JSON; opcional no OneDrive do PO | N/A — ignorado no `.gitignore` |

---

**Histórico:** O commit `7256f19` referia kickoff antigo; o pacote técnico corrigido para revisão PO de workflows está em **`ecf36a3`** (`fix(n8n): harden whatsapp workflows and qa validation`).
