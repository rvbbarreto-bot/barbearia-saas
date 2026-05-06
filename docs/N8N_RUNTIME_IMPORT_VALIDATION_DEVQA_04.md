# Validação runtime / importação n8n — DEV/QA-04

**Data:** 2026-05-03  
**Objetivo:** reduzir risco de homologação futura comprovando que os JSON **02** e **03** são válidos para a linha n8n referenciada no projeto, permanecem `active=false`, e passam auditoria estática.

---

## 1. O que foi executado nesta máquina (evidência automatizada)

### 1.1 Validação estrutural (Node)

- **Comando:** `node scripts/n8n-validate-workflow-import.mjs`
- **Critérios:** `active === false`; `nodes[]` não vazio; ausência de padrões bloqueadores (Postgres n8n, `executeQuery`, `sendText` / `message/sendText`, `SELECT * FROM`, etc.); verificação leve de nós IF no workflow 03.
- **Resultado (última execução):** `OK` para `01`, `02`, `03`; mensagem final `n8n JSON structural validation passed.`

### 1.2 Script PowerShell agregador

- **Comando:** `powershell -File scripts/validate-n8n-runtime-import.ps1`
- **Comportamento:** invoca o validador Node acima e grava log em `artifacts/devqa-04/n8n-runtime-validation-<timestamp>.log`.
- **Opcional:** `-TryDockerImport` executa `import:workflow` na imagem `n8nio/n8n:1.69.2` (o entrypoint já chama o CLI `n8n`; **não** repetir o prefixo `n8n` no `docker run`, senão ocorre `Command n8n not found`). Requer Docker e pull da imagem na primeira execução. Não persiste instância entre runs.

### 1.3 Auditoria estática (governança)

- **Comando:** `powershell -File scripts/audit-n8n-workflows.ps1`
- **Resultado esperado:** para cada `n8n/workflows/*.json`, `active (export default): False`; **sem** linhas `[MATCH]` para padrões bloqueadores (Postgres direto, Evolution/sendText, segredos típicos, etc.).

---

## 2. Workflow 03 — IF `notEquals` + `trim`

No export `n8n/workflows/03_recall_30_days_multitenant.json`, o nó IF referencia expressões do tipo:

- `value1`: `String($json.source_appointment_id ?? '').trim()`
- `operation`: `notEquals`

Isto substitui o padrão `isNotEmpty` problemático e é compatível com a validação estrutural atual.

---

## 3. Importação na UI n8n (ação do operador)

A importação **manual** na UI da instância n8n (local/QA) **não** é substituível por scripts de repositório: o PO solicitou evidência de UI. Procedimento recomendado:

1. Subir n8n na mesma versão major/minor alinhada ao projeto (ex.: `1.69.2` se usar Docker de referência).
2. **Import** → colar ou carregar `02_ai_scheduling_agent_multitenant.json`, depois `03_recall_30_days_multitenant.json`.
3. Confirmar **Active = OFF** em ambos (não ativar).
4. Abrir cada nó **HTTP Request**: validar URL relativa à Core API, método, corpo; confirmar ausência de credenciais reais nos campos.
5. Abrir o nó **IF** do workflow 03: confirmar `notEquals` + `trim` nas expressões (aceites pela UI).
6. **Export** novamente após importação (opcional, para diff) e correr `scripts/audit-n8n-workflows.ps1` sobre os ficheiros versionados.

**Proibições:** não executar envio real; não ligar Evolution como destino de mensagem; não ativar workflows até aceite formal.

---

## 4. JSON pós-importação

O repositório mantém os exports em `n8n/workflows/`. Após qualquer re-export pela UI, substituir ficheiros apenas após revisão de diff e nova passagem do audit + validador Node.

---

## 5. Conclusão

- **02 / 03:** validação estrutural e audit estático **verdes** na última execução documentada no relatório final DEV/QA-04.
- **UI:** checklist acima para o operador fechar a lacuna explícita do DEV/QA-03 (import visual).

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
