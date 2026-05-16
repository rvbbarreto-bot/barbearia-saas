# PR PILOTO-STAGING-04 — corpo sugerido

**Base:** `piloto-staging-01`  
**Head:** `feature/piloto-staging-04-operacao-assistida-suite-produto`  
**Proibido:** base `main`

## Título

`feat(piloto-04): Fatia 1 — painel operacional (manager+) + evidências`

## Summary

- Entrega funcional **Fatia 1**: `GET /api/v1/operational/status` + UI `/operacao/status`
- RBAC **manager+**; negativos attendant/viewer; cross-tenant e sanitização testados
- Kickoff governança: workflow anti-PR piloto→`main`
- Docs/evidências: `04_testes_locais.txt`, `10_relatorio_entrega_po.md`, matriz B
- **Sem merge autorizado** — aguardar CI verde e GP

## Commits incluídos (desde `505447a`)

- `d9df160` — feat(ops): operational dashboard with manager RBAC and tests
- `76e1092` — docs(piloto-04): update delivery report and test evidence
- (+ commits kickoff anteriores na branch: `a971299`, `74ba08c`, `505447a`)

## Test plan

- [ ] CI Actions verde no PR
- [ ] API test:unit 182/182
- [ ] Web tests 46/46
- [ ] Gitleaks + n8n validate workflows
- [ ] Confirmar PR **não** targeta `main`
- [ ] PR #5 contra `main` fechado sem merge (governança)

## Abrir PR (GitHub UI)

Compare: https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-04-operacao-assistida-suite-produto

Ou, com `gh` autenticado:

```bash
gh pr create --base piloto-staging-01 --head feature/piloto-staging-04-operacao-assistida-suite-produto \
  --title "feat(piloto-04): Fatia 1 — painel operacional (manager+)" \
  --body-file docs/evidencias/piloto_staging_04/11_pr_piloto04.md
```

## Links

- Evidências: `docs/evidencias/piloto_staging_04/`
- Commit aprovado PO fatia 1: `d9df160`
- HEAD branch: `7bc3165`
