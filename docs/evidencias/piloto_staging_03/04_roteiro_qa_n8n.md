# Roteiro QA — n8n (PILOTO-STAGING-03)

**Variáveis (exemplo — nunca copiar segredos reais para o Git):**

| Variável | Uso |
|----------|-----|
| `EVOLUTION_API_URL` | URL Evolution acessível do n8n (ex. `http://host.docker.internal:8081` em Docker) |
| `EVOLUTION_INSTANCE` | Nome da instância |
| `EVOLUTION_API_KEY` | Header `apikey` — só credencial n8n / env seguro |
| `QA_WHATSAPP_NUMBER` | Destino autorizado smoke |
| `API_BASE_URL` | Core API para HTTP Request nodes |
| `N8N_WEBHOOK_URL` / base pública | Conforme compose e docs existentes |

## Checklist (preencher na entrega)

1. Importar `01_whatsapp_router_multitenant.json`, `02_ai_scheduling_agent_multitenant.json`, `03_QA_Barbearia_Evolution_SendText_Smoke.json`, `03_recall_30_days_multitenant.json`.
2. Resolver `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` (ou equivalente) com ID real do ambiente **ou** passo documentado com captura de ecrã.
3. Executar **SendText Smoke** com número QA; colar resposta (IDs, status) **sem** expor key.
4. Cenário: variável obrigatória ausente → erro claro (captura).
5. Cenário: 401 credencial → captura.
6. Cenário: 404 instância → captura.
7. Cenário: timeout / fetch failed → captura.
8. Export atualizado dos workflows com **`active: false`** salvo orientação PO em contrário.

*Anexar prints na pasta de evidências ou referenciar ficheiros `*.png` / logs `.txt` adicionados ao repositório (sem segredos).*
