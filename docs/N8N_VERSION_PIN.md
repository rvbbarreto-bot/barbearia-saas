# Versão Docker n8n (pin)

| Origem | Valor |
|--------|--------|
| **Staging** (`docker-compose.staging.yml`, serviço `n8n`) | `n8nio/n8n:1.91.3` |
| **Repositório** (`n8n/.docker-image-tag`) | `1.91.3` (só a tag; scripts prefixam `n8nio/n8n:`) |

Os scripts `scripts/validate-n8n-runtime-import.ps1` e validações DEV/QA-05 leem `n8n/.docker-image-tag` para alinhar com o compose de staging.

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
