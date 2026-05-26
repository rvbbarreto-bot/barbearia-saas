# QA — PS-08 Sprint 1 (P1)

**Autorização PO:** `docs/evidencias/piloto_staging_08/00_CARD_AUTORIZADO_PS08_SPRINT1_P1.md`

## Ordem

1. `.\scripts\qa-seed-car-wash-patio.ps1` (PS-08.2)
2. `.\scripts\qa-seed-outbox-failed.ps1` (PS-08.3)
3. Browser: C10 (placa duplicada), C15–C17, C26, C27

## Ambiente

```powershell
Set-Location <raiz barbearia-saas>
. .\scripts\devops-env.ps1 -InstallNodeIfMissing
docker compose up -d postgres redis api web
```

## PS-08.1 (toast)

Sem script — validar em `/veiculos` com placa duplicada (ex. `PS08QA1` após seed do pátio).

## Relatório de entrega

Preencher: `docs/evidencias/piloto_staging_08/01_relatorio_entrega_ps08_sprint1.md`
