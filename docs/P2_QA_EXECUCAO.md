# P2 — Execução de QA

## Script principal (entrega)

```powershell
Set-Location <raiz-do-repo>
.\scripts\qa-api-p2-operational-battery.ps1
```

- **Saída:** `docs/QA_API_P2_OPERATIONAL_RESULTS.csv`
- **Sucesso:** exit code `0` quando todos os cenários passam.

O script ainda será adicionado na implementação do bloco I; este documento será actualizado com pré-requisitos (`.env`, massa QA, URLs) e interpretação do CSV.

## Regressão P1

Manter a bateria existente reprodutível:

```powershell
.\scripts\qa-api-negative-battery.ps1
```

Não remover nem quebrar este script na P2.
