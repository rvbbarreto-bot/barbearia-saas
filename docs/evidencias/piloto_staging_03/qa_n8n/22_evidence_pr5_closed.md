# Evidência — PR #5 fechado sem merge

**Status:** PEND — substituir por print do GitHub ou JSON da API após fecho.

## URL

- PR #5: `https://github.com/rvbbarreto-bot/barbearia-saas/pull/5`

## O que colar aqui

- Screenshot: estado **Closed**, ausência de badge **Merged**, base que era `main` (histórico visível).
- Opcional — API (mascarar token):

```text
GET https://api.github.com/repos/rvbbarreto-bot/barbearia-saas/pulls/5
→ "state": "closed"
→ "merged_at": null
```

## Script auxiliar (com token)

```powershell
$env:GITHUB_TOKEN = "<token>"
.\scripts\github-close-pull.ps1 -PullNumber 5
```
