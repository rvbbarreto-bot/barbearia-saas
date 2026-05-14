# Workflow QA — Evolution SendText Smoke

**Arquivo:** `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json`  
**Nome no n8n:** `03_QA_Barbearia_Evolution_SendText_Smoke`  
**Produção:** **NÃO** — smoke manual apenas. Importar com **`active: false`**.

## Variáveis obrigatórias no n8n

| Variável | Exemplo | Notas |
|----------|---------|--------|
| `EVOLUTION_API_URL` | `http://host.docker.internal:8080` | Dentro do Docker n8n use host acessível ao container |
| `EVOLUTION_INSTANCE` | `barbearia-qa` | Instância conectada ao WhatsApp |
| `EVOLUTION_API_KEY` | *(secret)* | Nunca commitar |
| `QA_WHATSAPP_NUMBER` | `5511999999999` | Formato **55DDDNUMERO** |

## Cenários mínimos

| # | Cenário | Como testar | Esperado |
|---|---------|-------------|----------|
| 1 | Envio válido | Variáveis corretas + instância conectada | HTTP 2xx; mensagem no WhatsApp QA |
| 2 | Token inválido | `EVOLUTION_API_KEY` errada | HTTP **401** ou erro classificado `ok: false` |
| 3 | Instância inválida | `EVOLUTION_INSTANCE` inexistente | HTTP **404** ou erro equivalente |
| 4 | Número inválido | `QA_WHATSAPP_NUMBER` sem 55 | Falha no nó **Validar variaveis** com mensagem clara |
| 5 | Evolution indisponível | URL errada ou serviço off | Timeout 30s; `ok: false` |
| 6 | Variável ausente | Remover `QA_WHATSAPP_NUMBER` | Erro **Configuracao ausente** antes do HTTP |

## Importação

1. Abrir n8n: `http://localhost:5679`
2. Import from file → selecionar o JSON acima
3. Confirmar **Inactive**
4. Settings → Variables → preencher as quatro variáveis
5. **Test workflow** (Manual Trigger)

## Segurança

- Não imprimir `EVOLUTION_API_KEY` em logs ou evidências.
- Este workflow **não** substitui o pipeline oficial (`message_outbox` / Core API).
