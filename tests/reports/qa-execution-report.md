# Relatório técnico QA — Execução E2E Robot

**Data:** 2026-05-26  
**Suíte:** `tests/specs` · tag `smoke`  
**Ambiente:** localhost:3001 (web) · localhost:3000 (api) · headless  
**Relatório Robot:** `tests/reports/robot-output/report.html`

---

## Resumo

| Métrica | Valor |
|---------|-------|
| Total testes | 10 |
| Aprovados | 10 |
| Falhados | 0 |
| Bloqueados | 0 |
| Taxa sucesso | 100% |

---

## Resultado por feature

| Feature | Testes | OK | FAIL |
|---------|--------|----|------|
| auth/login | 2 | 2 | 0 |
| auth/rbac | 2 | 2 | 0 |
| smoke/navigation | 5 | 5 | 0 |
| vertical/veiculos | 1 | 1 | 0 |

---

## Falhas

_Nenhuma na tag `smoke` (última execução)._

### VEI-02 (fora do smoke)
- Tag `critico` — executar com `npm run test:e2e` sem filtro ou `-Tags critico`
- Risco **BUG-001** (toast Sonner)

---

## Bugs funcionais registrados

| ID | Título | Severidade |
|----|--------|------------|
| BUG-001 | Toast placa duplicada Sonner hidden | Média |

Arquivo: `tests/defects/BUG-001-toast-placa-duplicada-sonner.md`

---

## Cobertura (smoke)

Rotas validadas nesta execução:
- `/login`, `/dashboard`, `/gestao/dashboard`, `/operacao/financeiro`, `/agenda`, `/clientes`
- RBAC: `/forbidden` (atendente), `/dashboard` (viewer)

---

## Gaps técnicos

1. Expandir specs para rotas PLANEJADAS na matriz (`docs/test-coverage-matrix.md`)
2. Adicionar `data-testid` em Veículos, Agenda, Clientes
3. Suite `critico` + seed car_wash antes de VEI-02
4. Pabot: `.\scripts\qa-e2e-suite.ps1 -Pabot 2 -Tags smoke`

---

## Comandos

```powershell
docker compose up -d postgres redis api web
.\scripts\qa-seed-viewer.ps1
npm run test:e2e:smoke
npm run test:e2e:headed
```
