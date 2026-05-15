# PILOTO-STAGING-01 — n8n staging

## Importação (UI)

1. Aceder `https://<N8N_HOST>` (basic auth em `.env.staging`).
2. Importar workflows de `n8n/workflows/` **um a um**.
3. Manter **`active=false`** até validação PO.
4. Substituir placeholder `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` no workflow 01 se existir dependência.
5. Configurar credenciais Evolution **apenas** em variáveis de ambiente do n8n (nunca no JSON versionado).

## Variáveis obrigatórias (container n8n)

| Variável | Uso |
|----------|-----|
| `EVOLUTION_API_URL` | Base URL Evolution |
| `EVOLUTION_API_KEY` | Secret (UI credentials) |
| `API_BASE_URL` | `http://api:3000` na rede Docker |
| `N8N_WEBHOOK_TOKEN` | Alinhado a `tenants.webhook_token` |

## Regras PO

- Workflows produtivos **não** fazem bypass da Core API para escrita de negócio.
- **Não** ativar recall/agente IA sem aceite explícito.
- Evidência: print da lista de workflows importados com `Active: Off`.

## Referências

- `docs/N8N_VERSION_PIN.md` — imagem `n8nio/n8n:1.91.3`
- `scripts/validate-n8n-runtime-import.ps1`
- `QA_PACKAGE_BARBEARIA/03_N8N_WORKFLOWS/EVOLUTION_SENDTEXT_SMOKE.md`
