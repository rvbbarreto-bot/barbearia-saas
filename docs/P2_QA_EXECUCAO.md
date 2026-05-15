# P2 — Execução de QA

## Script principal (entrega)

```powershell
Set-Location <raiz-do-repo>
.\scripts\qa-api-p2-operational-battery.ps1
```

- **Saída:** `docs/QA_API_P2_OPERATIONAL_RESULTS.csv` (sobrescrito a cada execução).
- **Sucesso:** exit code `0` quando todos os cenários passam.
- **Massa:** migration `099_demo_seed_qa.sql` (tenant `...0001`, `atendente@demo.local` / `admin12345`, profissional João `...4012`, serviço Barba `...4022`).
- **Base já inicializada:** aplicar manualmente `103_operational_audit_events.sql` e `104_calendar_blocks_created_by.sql` sobre o Postgres se o volume **não** for novo (o `docker-entrypoint-initdb.d` só corre no primeiro boot). Exemplo: `Get-Content database/migrations/104_....sql -Raw | docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB`.
- **Imagem API:** após alterações de código, `docker compose build api` e `docker compose up -d --force-recreate api` antes da bateria.
- **Parâmetros:** `-ApiBase` (default `http://localhost:3000`), `-TenantId`, IDs de profissional/serviço/cliente se necessário.

O script cobre CT-P2-001, 002, 010, 020, 039–044, 030–035 (incl. RBAC: `professional` **não** pode `no-show`), 050.

## Regressão P1

Manter a bateria existente reprodutível:

```powershell
.\scripts\qa-api-negative-battery.ps1
```

Não remover nem quebrar este script na P2.
