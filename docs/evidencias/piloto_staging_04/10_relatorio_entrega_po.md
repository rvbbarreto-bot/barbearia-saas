# Relatório de entrega PO/GP — PILOTO-STAGING-04

**Data:** 2026-05-16  
**Branch:** `feature/piloto-staging-04-operacao-assistida-suite-produto`  
**Base PR:** `piloto-staging-01` (proibido target `main`)  
**Status PO Fatia 1:** aprovada funcionalmente · merge **bloqueado** até PR + CI verde  

---

## 1. Hash inicial e final

| Marco | SHA | Descrição |
|-------|-----|-----------|
| **Inicial (antes código fatia 1)** | `505447a700561ea9e54a90510e16eb7df9d38c69` | Tip kickoff docs/CI; baseline testes API 167 |
| **Commit funcional aprovado PO** | `d9df160984673fe8fb2fa8032ed41e941dff21ba` | `feat(ops): operational dashboard with manager RBAC and tests` |
| **HEAD documentado** | `76e10926ce7338179ab711e4b12aac85e2b51a1c` | `docs(piloto-04): update delivery report and test evidence` |
| **Merge-base** × `piloto-staging-01` | `f1955e0dd2d9e03df728970a43a0ce852eb2fafb` | Ancestral comum com a base do PR |

---

## 2. Branch e base confirmadas

```text
git branch --show-current
→ feature/piloto-staging-04-operacao-assistida-suite-produto

git merge-base HEAD piloto-staging-01
→ f1955e0dd2d9e03df728970a43a0ce852eb2fafb
```

Desenvolvimento **não** em `main`. Sem force push / reset destrutivo.

---

## 3. Governança PR

| Ação | Estado |
|------|--------|
| Fechar PR piloto contra `main` (ex. #5) sem merge | **PEND** — admin GitHub |
| PR apenas contra `piloto-staging-01` | **AUTORIZADO** — ver secção 12 |
| Merge em `main` ou merge do PR piloto-04 | **NÃO AUTORIZADO** |
| Workflow anti-PR piloto→`main` | **OK** (`a971299`) |

---

## 4. Fatia 1 — Painel Operacional (aprovada)

**API** `GET /api/v1/operational/status` (read-only, manager+):

- Health API, PostgreSQL, Redis, worker outbox
- Probe n8n (`N8N_WEBHOOK_URL`) e Evolution (`EVOLUTION_API_URL`) quando configurados
- Contadores outbox; erros sanitizados; classes incl. `duplicate`, `provider_error`
- Filtros: `status`, `from`, `to`, `correlation_id`
- RBAC: `operationalDashboard:read` = **manager+**; testes negativos **attendant** e **viewer**
- Cross-tenant: `operational-status.integration.test.ts` (CI)

**Web** `/operacao/status`: filtros, infra, outbox; nav + `RoleGuard` **manager+**

**Testes:** API unit 167 → **182** (+15); Web **46/46** — ver `04_testes_locais.txt`

---

## 5. Escopo épico — demais blocos

| # | Bloco | Estado |
|---|-------|--------|
| 1 | Painel operacional | **OK** (fatia aprovada) |
| 2 | Outbox operacional | PARCIAL (base) — **próxima fatia candidata** |
| 3 | Auditoria / correlation | PARCIAL — **próxima fatia candidata** |
| 4–11 | Gerencial, histórico, agenda, n8n E2E, waitlist, financeiro, comissão, recall | PEND / PARCIAL |

---

## 6. PEND / BLOCKED

- PR #5 contra `main`: fecho manual
- E2E n8n credencial real: BLOCKED (Infra/Piloto)
- Aceite final merge: aguarda CI verde no PR correto

---

## 7. Riscos residuais

- Probe HTTP ≠ validação de credencial
- PR incorreto contra `main` até fecho formal

---

## 8. Migrations

Nenhuma na fatia 1.

---

## 9. Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `N8N_WEBHOOK_URL` (opcional) | Probe n8n |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Probe Evolution |

---

## 10. Evidências

- `04_testes_locais.txt` (contagens e RBAC manager+ alinhados)
- `03_matriz_aceite.md` secção B
- Commits: `d9df160` (código), `76e1092` (docs)

---

## 11. Comandos (local, pós-correção doc)

| Comando | Resultado |
|---------|-----------|
| API `npm run test:unit` | PASS **182/182** |
| API typecheck / lint / build | PASS |
| Web typecheck / lint / test / build | PASS **46/46** |
| Gitleaks | PASS |
| `npm run n8n:validate-workflows` | PASS |

---

## 12. PR e CI

| Item | Valor |
|------|-------|
| **PR** (base `piloto-staging-01`) | _preencher após `gh pr create` — ver `11_pr_piloto04.md`_ |
| **CI verde** | _anexar URL do workflow run no PR_ |

---

## 13. Confirmação

**Não houve merge em `main`.** Fatia 1 aprovada; merge do PR permanece bloqueado até CI verde e revisão GP.
