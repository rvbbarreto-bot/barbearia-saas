# Cenários BDD — Barbearia SaaS Web

Sintaxe: **Dado / Quando / Então / E** — orientados a negócio, sem seletores técnicos.

---

## Auth — Login

### AUTH-01 — Tela de login
```gherkin
Dado que não estou autenticado na aplicação
Quando acesso a página de entrada do sistema
Então devo ver a marca Barbearia SaaS
E devo ver o formulário de entrada com e-mail e senha
E o botão Entrar deve estar disponível
```

### AUTH-02 — Login válido administrador
```gherkin
Dado que não estou autenticado
Quando informo credenciais válidas de administrador do tenant demo
E confirmo a entrada
Então devo ser direcionado para a área principal autenticada
E devo ver o painel operacional
```

### AUTH-03 — Credenciais inválidas
```gherkin
Dado que estou na página de entrada
Quando informo senha incorreta para um e-mail existente
E confirmo a entrada
Então devo permanecer na página de entrada
E devo ver mensagem de e-mail ou senha incorretos
```

### AUTH-04 — Validação de senha curta
```gherkin
Dado que estou na página de entrada
Quando informo senha com menos de oito caracteres
E tento confirmar a entrada
Então devo ver validação de senha mínima
E não devo ser autenticado
```

---

## Auth — RBAC

### RBAC-01 — Atendente bloqueado em gestão
```gherkin
Dado que estou autenticado como atendente
Quando tento acessar o dashboard gerencial
Então devo ser impedido de acessar a funcionalidade
E devo ver a página de acesso negado
```

### RBAC-02 — Visualizador vê agenda sem criar
```gherkin
Dado que estou autenticado como visualizador
Quando acesso a agenda
Então devo ver o calendário
E não devo poder iniciar novo agendamento
```

### RBAC-03 — Administrador acessa financeiro
```gherkin
Dado que estou autenticado como administrador do tenant
Quando acesso o módulo financeiro
Então a página deve carregar sem erro crítico de sistema
```

---

## Dashboard

### DASH-01 — Carregamento inicial
```gherkin
Dado que estou autenticado como administrador
Quando acesso o painel principal
Então devo ver indicadores do dia
E não devo ver mensagem de falha ao carregar o painel
```

---

## Agenda

### AG-01 — Bloqueio sem veículo (lava-rápido)
```gherkin
Dado que o tenant opera no vertical lava-rápido
E estou autenticado como atendente
Quando inicio um novo agendamento
E seleciono cliente sem escolher veículo
Então não devo poder avançar para a próxima etapa
```

### AG-02 — Criar agendamento completo
```gherkin
Dado que estou autenticado como atendente
E existem clientes, serviços e profissionais ativos
Quando crio um agendamento informando todos os passos obrigatórios
Então o agendamento deve aparecer na agenda na data escolhida
```

---

## Clientes

### CLI-01 — Listar clientes
```gherkin
Dado que estou autenticado como atendente
Quando acesso o cadastro de clientes
Então devo ver a listagem de clientes do tenant
```

### CLI-02 — Cliente 360
```gherkin
Dado que existe um cliente com histórico
Quando acesso a visão completa do cliente
Então devo ver resumo e histórico de relacionamento
```

---

## Veículos

### VEI-01 — Placa obrigatória
```gherkin
Dado que estou autenticado como administrador
Quando abro o cadastro de novo veículo
E seleciono um cliente
E deixo a placa em branco
Então não devo poder salvar o veículo
```

### VEI-02 — Placa duplicada
```gherkin
Dado que já existe veículo com placa PSQ8A16 no tenant
Quando tento cadastrar outro veículo com a mesma placa
E confirmo o salvamento
Então devo ser informado que a placa já está cadastrada
E o veículo duplicado não deve ser criado
```

---

## Lava-rápido — Pátio

### PAT-01 — FSM até prontos
```gherkin
Dado que existe job agendado para a data de homologação
E estou no painel do pátio nessa data
Quando avanço o job pelas etapas operacionais até prontos
Então o job deve estar na coluna correta em cada etapa
```

### PAT-02 — Sem atalho pronto em agendados
```gherkin
Dado que estou no pátio na data de homologação
Quando visualizo a coluna de agendados
Então não devo ver ação de marcar como pronto diretamente
```

---

## Outbox

### OUT-01 — Listar mensagens falhas
```gherkin
Dado que existe mensagem com status falhou no tenant
E estou autenticado como administrador
Quando acesso mensagens e filtro por falhou
Então devo ver a mensagem na listagem
```

### OUT-02 — Retry bloqueado para atendente
```gherkin
Dado que estou autenticado como atendente
Quando acesso mensagens com itens falhos
Então não devo ver ação de reenviar
```

---

## Portal

### POR-01 — Token válido
```gherkin
Dado que possuo link de portal com token válido
Quando acesso o link
Então devo ver detalhes do agendamento
E posso confirmar ou cancelar conforme regras do portal
```

### POR-02 — Token inválido
```gherkin
Dado que possuo token de portal inválido
Quando acesso o link
Então devo ver mensagem de link inválido ou expirado
```

---

## Navegação — Smoke

### NAV-01 — Menu principal administrador
```gherkin
Dado que estou autenticado como administrador
Quando navego por cada item principal do menu lateral permitido ao meu perfil
Então cada página deve carregar sem erro crítico visível
```

---

## Mapeamento BDD → Automação

| ID | Spec Robot |
|----|------------|
| AUTH-01, AUTH-02 | `tests/specs/auth/login.robot` |
| RBAC-01 | `tests/specs/auth/rbac_navigation.robot` |
| NAV-01, DASH-01, RBAC-03 | `tests/specs/smoke/navigation_smoke.robot` |
| VEI-01, VEI-02 | `tests/specs/vertical/veiculos.robot` |
| PAT-* | `tests/robot/tests/regressivo_ps08_doc10.robot` (legado) |
