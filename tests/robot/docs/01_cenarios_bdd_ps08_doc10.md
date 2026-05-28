# Cenários BDD — Regressivo PS-08 / Doc 10 (Barbearia SaaS)

**Funcionalidade:** Portal web operacional — fluxos críticos pós PS-08.1–08.3  
**Ambiente alvo:** `http://localhost:3001` (Docker `web` + `api`)  
**Vertical:** `car_wash` (lava-rápido) para pátio e veículos

---

## Pré-condições globais (Suite)

| # | Pré-condição |
|---|----------------|
| P0 | Stack Docker: `postgres`, `api`, `web` healthy |
| P1 | Redis acessível pela API (rede Docker ou porta 6380 livre) |
| P2 | Migrations aplicadas (incl. `105_car_wash_mvp`, `106`, `107`) |
| P3 | Seeds QA: `.\scripts\qa-seed-car-wash-patio.ps1` e `.\scripts\qa-seed-outbox-failed.ps1` |
| P4 | Vertical `car_wash` no tenant demo `00000000-0000-0000-0000-000000000001` |
| P5 | Credenciais demo: `admin@demo.local` / `atendente@demo.local` — senha `admin12345` |

---

## RF-01 — Login e RBAC básico

### Cenário: Administrador acessa dashboard gerencial

**Dado** que o tenant está operacional e o usuário **não** está autenticado  
**Quando** informo e-mail `admin@demo.local` e senha válida e clico em **Entrar**  
**Então** sou redirecionado para `/dashboard` ou `/agenda`  
**E** consigo abrir `/gestao/dashboard` sem mensagem de erro 500  

### Cenário: Atendente bloqueado em gestão

**Dado** que estou autenticado como **atendente**  
**Quando** navego para `/gestao/dashboard`  
**Então** vejo a página **Acesso negado** (`/forbidden`) ou equivalente  

---

## RF-02 — Veículos (PS-08.1)

### Cenário C9 — Veículo sem placa

**Dado** que estou logado como **admin** na vertical `car_wash`  
**E** estou em `/veiculos`  
**Quando** abro o modal **Novo Veículo**, seleciono um cliente e deixo **Placa** vazia  
**Então** o botão **Salvar** permanece desabilitado  
**E** nenhum novo registro é criado na tabela  

### Cenário C10 — Placa duplicada (toast)

**Dado** que existe ao menos um veículo com placa `PSQ8A16` (ou placa visível na lista)  
**E** estou em `/veiculos`  
**Quando** tento cadastrar outro veículo com a **mesma placa**  
**Então** aparece toast/mensagem contendo **placa já cadastrada** (ou equivalente)  
**E** a contagem de linhas na tabela **não** aumenta  

---

## RF-03 — Pátio lava-rápido FSM (PS-08.2)

### Cenário C15–C16 — Fluxo Agendados até Prontos

**Dado** que o seed `qa-seed-car-wash-patio.ps1` criou job em **Agendados** na data **2026-06-16**  
**E** estou logado como **admin**  
**Quando** acesso `/operacao/lava-rapido` e filtro a data **2026-06-16**  
**E** na coluna **Agendados** clico **Chegou** (e checklist se exigido)  
**E** clico **Iniciar**, depois **Conferência**, depois **Pronto**  
**Então** o card progride pelas colunas do pátio sem erro de UI  
**E** não existe botão **Pronto** direto em **Agendados** (C18)  

---

## RF-04 — Outbox retry (PS-08.3)

### Cenário C26 — Admin reenvia mensagem failed

**Dado** que existe mensagem outbox em status **failed** (seed `qa-seed-outbox-failed.ps1`)  
**E** estou logado como **admin**  
**Quando** acesso `/operacao/mensagens`, filtro **Falhou** e abro o detalhe da primeira linha  
**E** clico em **Reenviar** e confirmo  
**Então** vejo feedback de sucesso (toast ou status atualizado)  

### Cenário C27 — Atendente sem retry

**Dado** que estou logado como **atendente**  
**Quando** acesso `/operacao/mensagens` e abro detalhe de mensagem failed (se existir)  
**Então** o botão **Reenviar** (`data-testid=outbox-retry-button`) **não** está visível  

---

## RF-05 — Cliente 360 e Financeiro (smoke)

### Cenário C21 — Navegação Cliente 360

**Dado** login **admin**  
**Quando** abro `/clientes` e clico na primeira linha e em **Visão 360**  
**Então** a URL contém `/360` e o corpo exibe seções **Cadastro** ou **Agendamentos**  

### Cenário C22 — Financeiro sem erro 500

**Dado** login **admin**  
**Quando** abro `/operacao/financeiro` com período incluindo `2026-06-16`  
**Então** a página carrega sem texto de erro **500**  

---

## Fora de escopo desta suite Robot (manual / outro card)

- C30/C31/C32 Portal token (massa `awaiting_confirmation`)
- C34/C35/C36 n8n + Evolution (`:8081`)
- C37/C38 Cross-tenant (API scripts)
- P07_19 CI GitHub
