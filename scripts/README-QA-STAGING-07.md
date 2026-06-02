# QA — Piloto staging 07 (scripts)

## Ambiente (Windows)

```powershell
Set-Location <raiz barbearia-saas>
. .\scripts\devops-env.ps1 -InstallNodeIfMissing
docker compose up -d postgres redis api
```

## F08 — GAP-01 (professional nao cria appointment)

```powershell
.\scripts\revalidate-f08-gap01.ps1 -RebuildApi -UpdateRodada2Json
```

Esperado: **HTTP 403** em `POST /api/v1/appointments` com `fred.barbeiro@demo.local`.

## Rodada 3 — regressivo API

```powershell
.\scripts\qa-piloto-staging-07-rodada3.ps1
# primeira vez ou apos mudanca RBAC:
.\scripts\qa-piloto-staging-07-rodada3.ps1 -RebuildStack
```

Saidas:

- `docs/evidencias/piloto_staging_07/rodada3/08_resultados_aceite.json`
- `docs/evidencias/piloto_staging_07/rodada3/01_relatorio_qa_regressivo.md`

## Persistir PATH (opcional)

```powershell
. .\scripts\devops-env.ps1 -PersistProfile
```
