# Roteiro QA Regressivo — Barbearia + Lava Rápido

**Fase:** pós-merge PR #12 em `piloto-staging-01`  
**Público:** QA júnior, acompanhado por QA pleno/sênior quando houver bloqueio de ambiente  
**Objetivo:** validar regressivo completo do sistema após entrada do Lava Rápido MVP e expansão operacional/gestão.

---

## 1. Critério de execução

Este roteiro deve ser executado em ambiente local ou staging controlado, com API, Web, Postgres, Redis, n8n e Evolution conforme disponibilidade.

**Regra de evidência:** nenhum cenário deve ser marcado como OK sem print, log, saída de API ou registro objetivo.

**Status permitidos:**

| Status | Uso |
|---|---|
| OK | Cenário executado e evidência anexada |
| FAIL | Cenário executado com erro do produto |
| PEND | Não executado por falta de tempo/massa; informar responsável |
| BLOCKED | Bloqueado por dependência externa, exemplo Evolution/WhatsApp |
| N/A | Fora de escopo aprovado pelo PO |

---

## 2. URLs principais

| Componente | URL |
|---|---|
| Portal Web Docker | `http://localhost:3001` |
| Login Web | `http://localhost:3001/login` |
| Portal Web Vite, fallback | `http://localhost:5173` |
| API | `http://localhost:3000` |
| API health | `http://localhost:3000/health` |
| API ready | `http://localhost:3000/health/ready` |
| DB health | `http://localhost:3000/database/health` |
| n8n UI | `http://localhost:5679` |
| Evolution API local | `http://localhost:8081` |
| PR / CI GitHub | PR da fase atual em `piloto-staging-01` |

---

## 3. Acessos QA

| Perfil | E-mail | Senha | Uso esperado |
|---|---|---|---|
| Admin / Manager | `admin@demo.local` | `admin12345` | Gestão, dashboard, auditoria, outbox, financeiro, comissão, lava rápido |
| Atendente | `atendente@demo.local` | `admin12345` | Agenda, clientes, veículos, pátio, operação permitida |
| Platform admin | `platform.admin@demo.local` | `admin12345` | Apenas validações globais, se necessário |
| Profissional | `fred.barbeiro@demo.local` | `admin12345` | Testes de escopo profissional, quando aplicável |

**Tenant demo:** `00000000-0000-0000-0000-000000000001`

Se o usuário `viewer` não existir na massa, registrar `PEND MASSA QA` e solicitar criação/seed do perfil viewer antes de fechar o regressivo de RBAC negativo.

---

## 4. Preparação do ambiente

### 4.1 Subir stack

```powershell
docker compose up -d --build
```

### 4.2 Validar saúde

Abrir no navegador ou testar via terminal:

```text
http://localhost:3000/health
http://localhost:3000/health/ready
http://localhost:3000/database/health
http://localhost:3001/login
```

Resultado esperado:

- API health: `status = ok`
- DB health: `database = connected`
- Web: tela de login

### 4.3 Ordem recomendada dos testes

1. Login e regressivo barbearia.
2. Configurar/validar vertical Lava Rápido.
3. Executar fluxo Lava Rápido ponta a ponta.
4. Validar dashboard, Cliente 360, financeiro, comissão, waitlist.
5. Validar portal tokenizado.
6. Importar e testar n8n.
7. Executar RBAC/cross-tenant.
8. Consolidar prints e matriz.

---

## 5. Configuração da vertical Lava Rápido

Antes dos testes de Lava Rápido, confirmar que o tenant está configurado como `car_wash`.

SQL de referência:

```sql
UPDATE tenant_settings
   SET settings = settings
       || '{"vertical":"car_wash","car_wash":{"require_vehicle":true,"require_checklist_on_arrival":true,"notify_when_ready":true}}'::jsonb,
       updated_at = now()
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
```

Após alterar, recriar API/Web se necessário:

```powershell
docker compose up -d --force-recreate api web
```

**Atenção:** se o mesmo tenant for usado para validar barbearia e lava rápido, executar primeiro os testes de barbearia. Depois alterar para `car_wash` e executar os testes de lava rápido.

---

## 6. Evidências obrigatórias

Salvar prints em:

```text
docs/evidencias/piloto_staging_07/prints/
```

Nome sugerido:

| Print | Nome |
|---|---|
| Login admin | `P07_01_login_admin.png` |
| Agenda barbearia | `P07_02_agenda_barbearia.png` |
| Cliente 360 | `P07_03_cliente_360.png` |
| Dashboard gestão | `P07_04_dashboard_gestao.png` |
| Cadastro veículo | `P07_05_veiculos.png` |
| Agenda lava rápido | `P07_06_agenda_lava_rapido_veiculo.png` |
| Pátio lava rápido | `P07_07_patio_lava_rapido.png` |
| Checklist | `P07_08_checklist_lava_rapido.png` |
| Outbox | `P07_09_outbox.png` |
| Auditoria | `P07_10_auditoria.png` |
| Financeiro | `P07_11_financeiro.png` |
| Comissão | `P07_12_comissao.png` |
| Waitlist | `P07_13_waitlist.png` |
| Portal token válido | `P07_14_portal_token_valido.png` |
| Portal token expirado/inválido | `P07_15_portal_token_invalido.png` |
| n8n importado | `P07_16_n8n_workflows_importados.png` |
| n8n execução | `P07_17_n8n_execucao.png` |
| Forbidden/403 | `P07_18_forbidden.png` |
| PR CI verde | `P07_19_pr_ci_verde.png` |

---

## 7. n8n — JSONs para importação

### 7.1 Fonte dos JSONs

Usar preferencialmente:

```text
docs/n8n/
```

Arquivos:

```text
docs/n8n/01_whatsapp_router_multitenant.json
docs/n8n/02_ai_scheduling_agent_multitenant.json
docs/n8n/03_QA_Barbearia_Evolution_SendText_Smoke.json
docs/n8n/03_recall_30_days_multitenant.json
```

Fallback técnico, se o espelho documental estiver divergente:

```text
n8n/workflows/
```

### 7.2 Sequência de importação

1. Importar `01_whatsapp_router_multitenant.json`.
2. Importar `02_ai_scheduling_agent_multitenant.json`.
3. Copiar o ID do workflow 02 no n8n.
4. Definir `N8N_WORKFLOW_02_ID=<id_do_workflow_02>` no `.env`.
5. Recriar o container n8n.
6. Importar `03_QA_Barbearia_Evolution_SendText_Smoke.json`.
7. Importar `03_recall_30_days_multitenant.json`.
8. Confirmar que todos estão `active=false`.
9. Remover qualquer `pinData`.
10. Executar primeiro o smoke 03 manual.

### 7.3 Variáveis esperadas no n8n

```text
API_BASE_URL=http://api:3000
N8N_BASE_URL=http://localhost:5679
N8N_WEBHOOK_TOKEN=<token local sem expor>
N8N_WORKFLOW_02_ID=<id workflow 02>
N8N_RECALL_ALLOW_SCHEDULE=false
EVOLUTION_API_URL=http://host.docker.internal:8081
EVOLUTION_INSTANCE=teste
EVOLUTION_API_KEY=<key local sem expor>
QA_WHATSAPP_NUMBER=5511973305448
```

**Proibido:** printar API key, token, segredo ou `.env` completo.

---

## 8. Cenários BDD — Base e acesso

### Cenário 1 — Login admin com sucesso

**Dado** que acesso `http://localhost:3001/login`  
**E** informo o e-mail `admin@demo.local`  
**E** informo a senha `admin12345`  
**Quando** clico em entrar  
**Então** devo ser redirecionado para o sistema autenticado  
**E** devo ver menu lateral com opções de operação e gestão  
**E** devo capturar o print `P07_01_login_admin.png`

### Cenário 2 — Bloqueio de usuário sem permissão

**Dado** que estou autenticado com usuário sem permissão suficiente  
**Quando** acesso diretamente uma rota de gestão, como `/gestao/dashboard`  
**Então** o sistema deve exibir tela de acesso negado ou redirecionar para `/forbidden`  
**E** a API não deve retornar dados sensíveis  
**E** devo capturar o print `P07_18_forbidden.png`

---

## 9. Cenários BDD — Barbearia regressivo

### Cenário 3 — Criar agendamento de barbearia

**Dado** que estou autenticado como admin ou atendente  
**E** estou no tenant de barbearia ou antes de ativar `car_wash`  
**E** existe cliente, profissional e serviço ativos  
**Quando** acesso `/agenda`  
**E** clico em novo agendamento  
**E** seleciono cliente, profissional, serviço, data e horário disponível  
**E** salvo o agendamento  
**Então** o agendamento deve aparecer na agenda  
**E** não deve exigir veículo  
**E** devo capturar o print `P07_02_agenda_barbearia.png`

### Cenário 4 — Bloquear data passada

**Dado** que estou no modal de novo agendamento  
**Quando** tento criar um agendamento com data/hora anterior ao momento atual  
**Então** a API deve rejeitar a criação  
**E** a mensagem deve indicar erro de data passada  
**E** nenhum agendamento deve ser criado

### Cenário 5 — Bloquear conflito de slot

**Dado** que existe um agendamento confirmado em um horário para um profissional  
**Quando** tento criar outro agendamento no mesmo profissional e mesmo intervalo  
**Então** a API deve retornar conflito de horário  
**E** a UI deve exibir erro amigável  
**E** o segundo agendamento não deve ser persistido

### Cenário 6 — Cancelar agendamento de barbearia

**Dado** que existe um agendamento confirmado  
**Quando** abro o detalhe do agendamento  
**E** clico em cancelar  
**Então** o status deve mudar para cancelado  
**E** o slot deve ficar disponível novamente conforme regra do produto  
**E** deve existir evento no histórico/auditoria

---

## 10. Cenários BDD — Lava Rápido

### Cenário 7 — Visualizar labels de Lava Rápido

**Dado** que o tenant está configurado como `car_wash`  
**Quando** faço login no portal  
**Então** devo ver menu de `Veículos`  
**E** devo ver menu de `Pátio`  
**E** termos como profissional devem aparecer como `Box/equipe` quando aplicável

### Cenário 8 — Cadastrar veículo com placa obrigatória

**Dado** que estou autenticado como admin ou atendente  
**E** existe um cliente ativo  
**Quando** acesso `/veiculos`  
**E** cadastro um veículo com placa `ABC1D23`, marca `Honda`, modelo `Civic`, cor `Prata`  
**Então** o veículo deve ser salvo com sucesso  
**E** a placa deve aparecer normalizada/listada  
**E** devo capturar o print `P07_05_veiculos.png`

### Cenário 9 — Rejeitar veículo sem placa

**Dado** que estou na tela `/veiculos`  
**Quando** tento cadastrar um veículo sem placa  
**Então** o sistema deve impedir o cadastro  
**E** deve exibir mensagem de validação  
**E** nenhum veículo sem placa deve ser criado

### Cenário 10 — Rejeitar placa duplicada no mesmo tenant

**Dado** que já existe um veículo com placa `ABC1D23`  
**Quando** tento cadastrar outro veículo com a mesma placa no mesmo tenant  
**Então** a API deve retornar erro de duplicidade  
**E** a UI deve apresentar erro amigável

### Cenário 11 — Criar agendamento de Lava Rápido com veículo

**Dado** que o tenant está configurado como `car_wash`  
**E** existe cliente, veículo, serviço e box/equipe disponíveis  
**Quando** acesso `/agenda`  
**E** clico em novo agendamento  
**E** seleciono cliente, veículo, serviço, box/equipe, data e horário  
**E** salvo o agendamento  
**Então** o agendamento deve ser criado  
**E** um `car_wash_job` deve ser criado automaticamente  
**E** devo capturar o print `P07_06_agenda_lava_rapido_veiculo.png`

### Cenário 12 — Impedir agendamento Lava Rápido sem veículo

**Dado** que o tenant está configurado como `car_wash`  
**E** `require_vehicle=true`  
**Quando** tento criar agendamento sem selecionar veículo  
**Então** a API deve retornar erro de veículo obrigatório  
**E** a UI deve impedir ou exibir erro amigável

### Cenário 13 — Visualizar pátio Lava Rápido

**Dado** que existe agendamento de Lava Rápido com job criado  
**Quando** acesso `/operacao/lava-rapido`  
**Então** devo ver o job na coluna `Agendados`  
**E** o card deve exibir placa, cliente, serviço, horário e box/equipe  
**E** devo capturar o print `P07_07_patio_lava_rapido.png`

### Cenário 14 — Preencher checklist de entrada

**Dado** que existe job em estágio `scheduled`  
**Quando** clico em checklist  
**E** preencho riscos, combustível, rodas/calotas, objetos internos e observações  
**E** salvo o checklist  
**Então** o checklist deve ser registrado  
**E** deve existir evento de auditoria `car_wash_checklist_created`  
**E** devo capturar o print `P07_08_checklist_lava_rapido.png`

### Cenário 15 — Avançar fluxo do pátio até lavagem

**Dado** que existe job com checklist de entrada registrado  
**Quando** clico em `Chegou`  
**E** depois clico em `Iniciar`  
**Então** o job deve ir para estágio `washing`  
**E** a agenda deve refletir check-in/início quando aplicável

### Cenário 16 — Avançar fluxo do pátio até pronto

**Dado** que existe job em `washing`  
**Quando** avanço para conferência  
**E** avanço para pronto  
**Então** o job deve ir para `ready`  
**E** deve ser enfileirada mensagem no outbox quando o cliente tiver opt-in  
**E** devo capturar os prints `P07_09_outbox.png` e `P07_10_auditoria.png`

### Cenário 17 — Entregar veículo e concluir financeiro/comissão

**Dado** que existe job em `ready`  
**Quando** clico em entregar  
**Então** o job deve mudar para `delivered`  
**E** o appointment deve ser concluído  
**E** deve existir lançamento financeiro quando aplicável  
**E** deve existir comissão quando regra estiver configurada

### Cenário 18 — Rejeitar transição inválida

**Dado** que existe job em `scheduled`  
**Quando** tento avançar diretamente para `ready`  
**Então** a API deve retornar erro de transição inválida  
**E** o estágio do job deve permanecer inalterado

---

## 11. Cenários BDD — Gestão, Cliente 360, Financeiro, Comissão e Waitlist

### Cenário 19 — Dashboard gerencial

**Dado** que estou autenticado como admin/manager  
**Quando** acesso `/gestao/dashboard`  
**Então** devo ver KPIs de agendamentos, receita, conclusão, cancelamentos e no-show  
**E** devo conseguir filtrar por período  
**E** devo capturar o print `P07_04_dashboard_gestao.png`

### Cenário 20 — Exportar CSV do dashboard

**Dado** que o dashboard está carregado  
**Quando** clico em exportar CSV  
**Então** o sistema deve baixar um arquivo CSV  
**E** o arquivo deve conter dados compatíveis com o período filtrado

### Cenário 21 — Cliente 360

**Dado** que existe um cliente com histórico  
**Quando** acesso `/clientes`  
**E** abro a visão 360 do cliente  
**Então** devo ver dados cadastrais, histórico, veículos quando `car_wash`, financeiro e mensagens quando existirem  
**E** devo capturar o print `P07_03_cliente_360.png`

### Cenário 22 — Financeiro operacional

**Dado** que existem agendamentos concluídos  
**Quando** acesso `/operacao/financeiro`  
**Então** devo ver lançamentos financeiros  
**E** devo conseguir filtrar por período/status quando disponível  
**E** devo capturar o print `P07_11_financeiro.png`

### Cenário 23 — Comissão

**Dado** que existe comissão gerada para serviço concluído  
**Quando** acesso `/operacao/comissao`  
**Então** devo ver comissões pendentes/pagas  
**E** usuário sem permissão não deve conseguir marcar pagamento  
**E** devo capturar o print `P07_12_comissao.png`

### Cenário 24 — Waitlist

**Dado** que existe cliente aguardando horário  
**Quando** acesso `/lista-espera`  
**E** crio entrada na fila  
**Então** a entrada deve aparecer na listagem  
**E** o sistema deve bloquear duplicidade quando cliente/serviço/data forem iguais  
**E** devo capturar o print `P07_13_waitlist.png`

---

## 12. Cenários BDD — Outbox e Auditoria

### Cenário 25 — Outbox operacional

**Dado** que há mensagens criadas por agendamento, Lava Rápido ou portal  
**Quando** acesso `/operacao/mensagens`  
**Então** devo ver lista de mensagens  
**E** devo conseguir identificar status, erro classificado e `correlation_id` quando disponível  
**E** devo capturar o print `P07_09_outbox.png`

### Cenário 26 — Retry outbox por admin

**Dado** que existe mensagem com falha retryable  
**E** estou autenticado como admin/manager  
**Quando** clico em retry  
**Então** a mensagem deve voltar para processamento conforme regra  
**E** deve existir registro/auditoria do retry

### Cenário 27 — Retry outbox bloqueado para atendente/viewer

**Dado** que estou autenticado como usuário sem permissão para retry  
**Quando** acesso `/operacao/mensagens`  
**Então** não devo ver botão de retry ou devo receber 403 ao tentar executar  
**E** devo capturar evidência do bloqueio

### Cenário 28 — Auditoria operacional

**Dado** que executei ações de agenda, Lava Rápido, outbox e portal  
**Quando** acesso `/operacao/auditoria`  
**Então** devo ver eventos correspondentes  
**E** devo conseguir filtrar por evento ou `correlation_id` quando disponível  
**E** metadados sensíveis devem estar sanitizados  
**E** devo capturar o print `P07_10_auditoria.png`

---

## 13. Cenários BDD — Portal tokenizado

### Cenário 29 — Gerar token para portal

**Dado** que existe um agendamento pendente de confirmação ou confirmado  
**E** estou autenticado como manager/admin  
**Quando** solicito geração de token para o appointment  
**Então** a API deve retornar token e data de expiração  
**E** o token não deve ser salvo em texto puro no banco  
**E** o link público deve seguir o padrão `/portal/:token`

### Cenário 30 — Acessar portal com token válido

**Dado** que tenho um token válido  
**Quando** acesso `http://localhost:3001/portal/<token>`  
**Então** devo ver dados do agendamento  
**E** devo ver ações permitidas conforme status  
**E** devo capturar o print `P07_14_portal_token_valido.png`

### Cenário 31 — Confirmar agendamento pelo portal

**Dado** que o token é válido  
**E** o agendamento está em `pending_confirmation`  
**Quando** clico em confirmar  
**Então** o status deve mudar para confirmado  
**E** o fluxo oficial deve gerar eventos, auditoria e jobs relacionados

### Cenário 32 — Cancelar agendamento pelo portal

**Dado** que o token é válido  
**E** o agendamento permite cancelamento  
**Quando** clico em cancelar  
**Então** o status deve mudar para cancelado  
**E** slots/jobs/notificações devem seguir o fluxo oficial de cancelamento

### Cenário 33 — Token inválido ou expirado

**Dado** que tenho um token inválido, expirado ou revogado  
**Quando** acesso `/portal/<token>`  
**Então** devo ver mensagem amigável de erro  
**E** nenhum dado sensível deve ser exibido  
**E** devo capturar o print `P07_15_portal_token_invalido.png`

---

## 14. Cenários BDD — n8n e WhatsApp

### Cenário 34 — Importar workflows n8n

**Dado** que acesso `http://localhost:5679`  
**Quando** importo os JSONs na sequência definida neste documento  
**Então** todos os workflows devem importar sem erro  
**E** devem permanecer `active=false`  
**E** não deve existir `pinData` ativo  
**E** devo capturar o print `P07_16_n8n_workflows_importados.png`

### Cenário 35 — Executar smoke SendText

**Dado** que o workflow `03_QA_Barbearia_Evolution_SendText_Smoke` está importado  
**E** as variáveis `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY` e `QA_WHATSAPP_NUMBER` estão configuradas  
**Quando** executo o Manual Trigger QA  
**Então** o nó de validação deve retornar `number=5511973305448`  
**E** o nó Evolution deve retornar sucesso técnico ou erro classificado  
**E** se retornar `PENDING` com `key.id`, `remoteJid` e `fromMe=true`, o classificador deve marcar `ok=true`  
**E** devo capturar o print `P07_17_n8n_execucao.png`

### Cenário 36 — Classificar erro Evolution

**Dado** que a Evolution está sem key válida ou inacessível  
**Quando** executo o smoke SendText  
**Então** o workflow deve classificar erro como `auth_401_invalid_api_key`, `not_found_404_instance_or_route`, `timeout` ou `network_error`  
**E** não deve mascarar erro como sucesso  
**E** não deve expor API key em logs ou prints

---

## 15. Cenários BDD — Cross-tenant e RLS

### Cenário 37 — Bloquear veículo cross-tenant

**Dado** que existe veículo no tenant B  
**E** estou autenticado no tenant A  
**Quando** tento usar o `vehicle_id` do tenant B em um agendamento do tenant A  
**Então** a API deve retornar 404 ou erro de segurança  
**E** nenhum appointment/job deve ser criado

### Cenário 38 — Bloquear leitura cross-tenant

**Dado** que existe cliente, appointment ou veículo no tenant B  
**Quando** consulto esse recurso autenticado no tenant A  
**Então** a API deve retornar 404 ou 403  
**E** os dados do tenant B não devem aparecer na resposta

---

## 16. Checklist final QA

| Item | Status | Evidência |
|---|---|---|
| Login admin OK |  |  |
| Login atendente OK |  |  |
| Agenda barbearia OK |  |  |
| Agenda lava rápido OK |  |  |
| Veículo com placa obrigatória OK |  |  |
| Pátio Lava Rápido OK |  |  |
| Checklist OK |  |  |
| Outbox OK |  |  |
| Auditoria OK |  |  |
| Dashboard OK |  |  |
| Cliente 360 OK |  |  |
| Financeiro OK |  |  |
| Comissão OK |  |  |
| Waitlist OK |  |  |
| Portal token válido OK |  |  |
| Portal token inválido/expirado OK |  |  |
| n8n importado OK |  |  |
| n8n smoke OK/BLOCKED classificado |  |  |
| RBAC negativo OK |  |  |
| Cross-tenant/RLS OK |  |  |
| PR/CI verde anexado |  |  |

---

## 17. Resultado esperado para aceite

O QA deve entregar:

1. Este roteiro preenchido ou referenciado em relatório final.
2. Prints em `docs/evidencias/piloto_staging_07/prints/`.
3. Lista de falhas com severidade.
4. Lista de bloqueios externos.
5. Confirmação de quais cenários ficaram OK, FAIL, PEND ou BLOCKED.
6. Recomendação QA: aprovar, aprovar com ressalvas ou reprovar.

