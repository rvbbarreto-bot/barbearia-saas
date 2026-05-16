## Resumo

Entrega **técnica parcial** PILOTO-STAGING-03: endurecimento dos workflows n8n (01 router, 03 QA SendText, 03 recall), alinhamento `.env.example` / `docker-compose`, validador estático e pasta de evidências com **placeholders** para capturas reais.

**Commit analisado pelo PO (aceite parcial técnico):** `ecf36a35467cd9e2007e7a0329cc1c3ea3df5b45`

**Commit de governança / documentação (aprovado PO):** `32eb79a43958725ab4f9ed4205073dfbd11667de`

**Aceite funcional / merge / homologação:** **não** — ver matriz `docs/evidencias/piloto_staging_03/03_matriz_aceite.md`.

## Escopo versionado

- `docs/n8n/*.json`, `n8n/workflows/*.json` (espelho)
- `.env.example`, `docker-compose.yml`
- `scripts/n8n-validate-workflow-import.mjs`, `scripts/embed-n8n-workflow-snippets.mjs`, `scripts/n8n-snippets/*.code.js`
- `package.json` — `npm run n8n:validate-workflows`
- `docs/evidencias/piloto_staging_03/qa_n8n/*` (texto + `*.png.txt` até substituição por PNG reais)

## CI e segurança

- CI do PR: **verde** (HEAD `32eb79a`, conforme decisão PO).
- Gitleaks: **passou** (conforme decisão PO).
- **Sem** credencial real versionada no pacote (conforme decisão PO).

## Riscos residuais (pré-merge)

| Risco | Estado |
|-------|--------|
| Workflow 01 sem E2E + dedup formal `QA-N8N-DEDUP-001` | PEND evidência |
| Workflow 02 sem Bearer / `x-tenant-id` / LLM na UI n8n | BLOCKED operacional |
| Workflow 03 SendText sem screenshot WhatsApp real | PEND evidência |
| Recall sem prova de carga controlada | PEND evidência |
| Import acidental de artefactos locais obsoletos | Mitigado: `*.LOCAL_IMPORT.json` ignorado pelo git |

## Critérios de merge (bloqueadores até nova análise PO)

1. E2E router 01 + prova dedup `QA-N8N-DEDUP-001` (logs/payloads mascarados).
2. `N8N_WORKFLOW_02_ID` definido no ambiente piloto **ou** decisão documentada (Opção A vs B).
3. Evidências **PNG reais** (substituir `*.png.txt` em `qa_n8n/`).
4. SendText real **ou** estado **BLOCKED** com causa raiz e responsável.
5. Matriz de aceite actualizada (OK / PEND / BLOCKED / N/A) **com prova objetiva** por item antes de mover PEND → OK.

## Test plan (re-execução pós-ajustes)

- `npm run n8n:validate-workflows`
- CI completo no PR após push
- Matriz `03_matriz_aceite.md` revista pelo PO

## Como colar esta descrição no GitHub (se `gh` não estiver instalado)

1. Abrir o PR **#4** no repositório `rvbbarreto-bot/barbearia-saas`.
2. Clicar **Edit** na descrição do PR.
3. Seleccionar **todo** o conteúdo deste ficheiro (Ctrl+A) e colar no corpo do PR.
4. Opcional: `.\scripts\update-pr4-description.ps1` com `GITHUB_TOKEN` (fine-grained: `pull_requests: write` no repo).
