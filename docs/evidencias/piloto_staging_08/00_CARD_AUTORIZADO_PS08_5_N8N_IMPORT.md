# Card autorizado — PS-08.5 · Import n8n piloto (4 workflows)

**Data:** 2026-05-31  
**Branch:** `feature/ps08-4-evolution-compose` (mesma linha PS-08 Sprint 2 P2)  
**Prioridade:** P2  
**Referência:** `docs/evidencias/piloto_staging_07/12_demandas_po_proxima_release_fabrica.md` § PS-08.5

---

## Escopo

| Item | Entrega |
|------|---------|
| Script | `scripts/n8n-import-piloto-workflows.ps1` |
| Motor | `n8n/import_workflows_from_json.mjs` (4 JSON, upsert, `active=false`) |
| Fonte | `docs/n8n/*.json` (fallback `n8n/workflows/`) |
| Doc | `docs/PILOTO_STAGING_01_N8N.md` § PS-08.5 |

## DoD

- [ ] `node scripts/n8n-validate-workflow-import.mjs` — exit 0
- [ ] `.\scripts\n8n-import-piloto-workflows.ps1` — 4/4 OK
- [ ] UI n8n `:5679` — 4 workflows listados, **inactive**
- [ ] C34 doc 10 ≠ PEND

## Comando

```powershell
docker compose up -d n8n
$env:N8N_API_KEY = 'n8n_api_...'
.\scripts\n8n-import-piloto-workflows.ps1
```

## Fora de escopo

- Ativar workflows em produção
- Credenciais Evolution no JSON
- CI job (PS-08.9)
