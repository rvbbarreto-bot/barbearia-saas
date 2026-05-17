# Incidente de governança — PR #5 com base `main` (reincidência)

**Data de registo:** 2026-05-16  
**Contexto:** PILOTO-STAGING-03 exige que **todos** os PRs de entrega piloto tenham **base `piloto-staging-01`**, não `main` (ver `00_governanca_incidente_pr2_merge_main.md` e decisões PO).

## O que ocorreu

Foi identificado o **[PR #5](https://github.com/rvbbarreto-bot/barbearia-saas/pull/5)** aberto com **base `main`**, violando a regra de governança do projeto.

O **PR válido** da PILOTO-STAGING-03 continua a ser apenas o **[PR #4](https://github.com/rvbbarreto-bot/barbearia-saas/pull/4)** com:

- **base:** `piloto-staging-01`
- **head:** `feature/piloto-staging-03-qa-operacional-n8n-ready`

## Decisão PO (esta ronda)

| Acção | Estado |
|--------|--------|
| Fechar PR #5 **sem merge** | **Obrigatório** — executar no GitHub (UI ou API) |
| Não alterar `main` | Obrigatório |
| Não usar “Merge pull request” no PR #5 | Obrigatório |
| Manter PR #4 como único veículo de revisão piloto-03 | Obrigatório |
| Atualizar **descrição do PR #4** (não #5) | Obrigatório — conteúdo: `PR_4_CORPO_DESCRICAO.md` |

## Evidências exigidas pelo PO

Anexar na pasta `docs/evidencias/piloto_staging_03/qa_n8n/` (ou matriz com links):

1. **PR #5 fechado** — print ou export JSON da API com `state: closed`, `merged: false`.
2. **PR #4 com descrição visível** — print do corpo preenchido.
3. **PR #4 — conferência** — print ou API confirmando:
   - `base.ref` = `piloto-staging-01`
   - `head.ref` = `feature/piloto-staging-03-qa-operacional-n8n-ready`
   - `head.sha` contém ou é descendente de **`9a03362`** (ajuste documental/script aceite pelo PO)
   - checks verdes

Ficheiros modelo (preencher após capturas):

- `22_evidence_pr5_closed.md` — colar URL do PR #5 + nota “closed without merge”
- `23_evidence_pr4_description_and_base.md` — checklist + links

## Por que houve reincidência (explicativo da fábrica)

1. **Comportamento por defeito do GitHub:** ao criar PR pela UI (“Compare & pull request” ou botão após push), a **branch base pré-seleccionada** é normalmente a **default do repositório** (`main`), salvo alteração manual no selector **base** antes de abrir o PR.
2. **Passo humano omitido:** não foi seleccionado explicitamente `piloto-staging-01` como base antes de confirmar o PR #5.
3. **Ambiente da fábrica (Cursor):** neste workspace **não está instalado `gh`** e **não há `GITHUB_TOKEN`** injectado para forçar `gh pr create --base piloto-staging-01` ou validação automática; PRs criados fora do agente **não são auditados** pelo script até aparecerem no GitHub.
4. **Mitigação recomendada (organizacional):** checklist pré-PR (“base = piloto-staging-01?”); preferir `gh pr create --base piloto-staging-01`; opcionalmente regra de protecção / template de PR no repositório lembrando a base correcta.

## Relação com commits

| Commit | Papel |
|--------|--------|
| `ecf36a3…` | Aceite técnico **parcial** (workflows n8n) |
| `32eb79a…` | Aceite governança/documentação |
| `9a03362…` | Aceite **apenas** ajuste documental/script (PR body + `update-pr4-description.ps1`) |

## Estado até nova ordem

- **PR #5:** reprovado — deve estar **closed**, **not merged**.
- **PR #4:** pendente de evidências E2E; **merge bloqueado**; **aceite funcional bloqueado**.
