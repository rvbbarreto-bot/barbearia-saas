# Espelho `docs/n8n` — workflows para importação QA

Estes ficheiros são **cópias controloadas** dos exports em `n8n/workflows/` para o caminho exigido pelo pacote **PILOTO-STAGING-03** (`docs/n8n/…`).

- Qualquer alteração a workflows deve ser feita de forma **consistente** em ambos os directórios **ou** regenerar a cópia após editar `n8n/workflows/`.
- Validação automatizada: `node scripts/n8n-validate-workflow-import.mjs`.

| Ficheiro | Descrição breve |
|----------|-----------------|
| `01_whatsapp_router_multitenant.json` | Router Evolution → Core (multitenant) |
| `02_ai_scheduling_agent_multitenant.json` | Agente IA → API agendamento + outbox |
| `03_QA_Barbearia_Evolution_SendText_Smoke.json` | Smoke manual Evolution SendText |
| `03_recall_30_days_multitenant.json` | Recall 30 dias (multitenant) |

Todos os exports mantêm **`"active": false`** por defeito.
