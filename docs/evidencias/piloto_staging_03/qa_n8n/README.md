# Evidências QA n8n — placeholders (PILOTO-STAGING-03)

Esta pasta recolhe **artefactos de execução** do time de QA e da fábrica. **Não** commitar segredos, números reais de clientes finais nem `.env`.

## Estrutura sugerida

| Ficheiro / pasta sugerida | Conteúdo |
|---------------------------|----------|
| `import_01_router_print.png` | Print da UI n8n após importar workflow 01 |
| `import_02_agent_print.png` | Idem workflow 02 |
| `import_03_smoke_print.png` | Idem workflow 03 QA |
| `import_04_recall_print.png` | Idem workflow recall |
| `exec_03_smoke_success.json` | Output JSON sanitizado (sem apikey) de execução bem-sucedida |
| `exec_03_error_missing_env.txt` | Log ou output com erro de variável ausente |
| `exec_03_error_401.txt` | Resposta/corpo classificado 401 |
| `exec_03_error_404.txt` | Instância inválida 404 |
| `exec_03_error_timeout.txt` | Timeout / fetch failed |
| `api_health_ok.txt` | `curl`/log API `/health/ready` ou equivalente |
| `evolution_ping_ok.txt` | Evidência HTTP 200 na raiz Evolution (sem token no URL) |
| `n8n_to_api.txt` | Log de chamada bem-sucedida workflow → API (sem Bearer completo) |
| `correlation_sample.txt` | Exemplo de `correlation_id` em log operacional |

## Regras

1. Mascarar: `EVOLUTION_API_KEY`, `JWT`, passwords Basic n8n, telefone pode truncar para `5511****7162`.
2. Preferir anexar à **matriz de execução** em `10_guia_inicio_testes_qa_n8n.md` (links ou nomes de ficheiro).

## Estado

- Parcial: validador `npm run n8n:validate-workflows` verde; numerador `01`–`21` presente.
- **PNG:** os ficheiros `02_*.png.txt`, `04_*.png.txt`, etc. são **instruções** — o PO exige substituição por **ficheiros `.png` reais`** com o mesmo prefixo numérico antes do aceite funcional.
- **Não** commitar segredos nem `.env` real.
- **`Evidências.docx`:** manter fora do git (ignorado em `.gitignore`); usar Markdown/JSON nesta pasta.
- **`*.LOCAL_IMPORT.json`:** proibido versionar — ignorado e removido do working tree canónico; importar apenas `docs/n8n/*.json` oficiais.
