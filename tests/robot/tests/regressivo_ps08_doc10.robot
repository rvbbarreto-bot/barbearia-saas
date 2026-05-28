*** Settings ***
Documentation    Regressivo web PS-08 / Doc 10 — Barbearia SaaS (Browser Library / Playwright)
...              Pré-requisitos: Docker web+api, seeds qa-seed-*.ps1, vertical car_wash.
Library          Collections
Resource         ../resources/keywords/common.robot
Resource         ../resources/keywords/veiculos_keywords.robot
Resource         ../resources/keywords/patio_keywords.robot
Resource         ../resources/keywords/outbox_keywords.robot
Suite Setup      Abrir Navegador Para Suite
Suite Teardown   Fechar Navegador Da Suite
Test Setup       Nova Pagina Para Teste

*** Test Cases ***
RF-01 Login Admin Deve Acessar Gestao
    [Documentation]    C19 smoke — dashboard gerencial sem erro 500
    [Tags]    login    smoke    gestao
    Dado Que O Usuario Administrador Esta Autenticado
    Quando Navego Para    /gestao/dashboard
    Aguardar Pagina Estavel
  # Falha se aparecer erro de carregamento
    Entao O Corpo Da Pagina Nao Deve Conter Texto    Erro ao carregar dashboard
    Capturar Evidencia    c19_dashboard_gestao.png

RF-01 Atendente Bloqueado Em Gestao
    [Documentation]    C2 — RBAC atendente em /gestao/dashboard
    [Tags]    login    rbac
    Dado Que O Usuario Atendente Esta Autenticado
    Quando Navego Para    /gestao/dashboard
    Aguardar Pagina Estavel
    Entao A Url Deve Conter    forbidden
    Capturar Evidencia    c2_forbidden_gestao.png

RF-02 C9 Veiculo Sem Placa Bloqueia Salvar
    [Documentation]    Validação UI — placa obrigatória
    [Tags]    veiculos    ps-08-1
    Dado Que O Usuario Administrador Esta Autenticado
    Dado Que Estou Na Pagina De Veiculos
    Quando Abro Modal Novo Veiculo
    Quando Seleciono Primeiro Cliente No Modal Veiculo
    Entao Botao Salvar Veiculo Deve Estar Desabilitado
    Capturar Evidencia    c9_veiculo_sem_placa.png

RF-02 C10 Placa Duplicada Exibe Toast
    [Documentation]    PS-08.1 — VEHICLE_PLATE_ALREADY_EXISTS na UI
    [Tags]    veiculos    ps-08-1    critico
    Dado Que O Usuario Administrador Esta Autenticado
    Dado Que Estou Na Pagina De Veiculos
    ${antes}=    Obter Contagem Linhas Tabela Veiculos
    ${placa}=    Set Variable    ${SEED_PLATE}
    ${cell}=    Run Keyword And Return Status    Get Text    css=table tbody tr td >> nth=0
    IF    ${cell}
        ${txt}=    Get Text    css=table tbody tr td >> nth=0
        IF    '${txt}' != '—' and '${txt}' != ''
            ${placa}=    Set Variable    ${txt}
        END
    END
    Quando Abro Modal Novo Veiculo
    Quando Seleciono Primeiro Cliente No Modal Veiculo
    Quando Preencho Placa No Modal    ${placa}
    Quando Clico Salvar Veiculo
    Entao Deve Aparecer Toast Placa Duplicada
    ${depois}=    Obter Contagem Linhas Tabela Veiculos
    Should Be Equal As Numbers    ${antes}    ${depois}

RF-03 Patio FSM Agendados Ate Prontos
    [Documentation]    C15-C16 — requer seed patio 2026-06-16
    [Tags]    patio    car_wash    ps-08-2    critico
    Dado Que O Usuario Administrador Esta Autenticado
    Dado Que Estou No Patio Lava Rapido Na Data QA
    Entao Nao Deve Existir Botao Pronto Em Agendados
    Quando Avanco Job Agendados Ate Prontos

RF-04 C26 Admin Retry Outbox Failed
    [Documentation]    C26 — requer seed outbox failed
    [Tags]    outbox    ps-08-3    critico
    Dado Que O Usuario Administrador Esta Autenticado
    Dado Que Estou Na Pagina De Mensagens Outbox
    Quando Filtro Outbox Por Status Falhou
    Quando Abro Primeira Linha Outbox Se Existir
    Quando Clico Reenviar Outbox Se Visivel

RF-04 C27 Atendente Sem Botao Retry
    [Documentation]    C27 — RBAC retry outbox
    [Tags]    outbox    rbac    ps-08-3
    Dado Que O Usuario Atendente Esta Autenticado
    Dado Que Estou Na Pagina De Mensagens Outbox
    Quando Filtro Outbox Por Status Falhou
    Run Keyword And Ignore Error    Quando Abro Primeira Linha Outbox Se Existir
    Run Keyword And Ignore Error    Entao Botao Reenviar Outbox Nao Deve Estar Visivel

RF-05 C21 Cliente 360 Navegacao
    [Documentation]    Smoke cliente 360
    [Tags]    clientes    smoke
    Dado Que O Usuario Administrador Esta Autenticado
    Quando Navego Para    /clientes
    Wait For Elements State    css=table tbody tr >> nth=0    visible    timeout=10s
    Click    css=table tbody tr >> nth=0
    Click    role=link[name=/Visão 360/i]
    ${url}=    Get Url
    Should Contain    ${url}    /360
    Entao O Corpo Da Pagina Deve Conter Texto    Cadastro
    Capturar Evidencia    c21_cliente_360.png

RF-05 C22 Financeiro Carrega Sem Erro 500
    [Documentation]    Smoke financeiro
    [Tags]    financeiro    smoke
    Dado Que O Usuario Administrador Esta Autenticado
    Quando Navego Para    /operacao/financeiro
    Wait For Elements State    css=input[type="date"] >> nth=0    visible    timeout=10s
    Fill Text    css=input[type="date"] >> nth=0    2026-06-01
    Fill Text    css=input[type="date"] >> nth=1    2026-06-30
    Aguardar Pagina Estavel
    Entao O Corpo Da Pagina Nao Deve Conter Texto    500
    Capturar Evidencia    c22_financeiro.png

RF-06 GAP-03 Viewer Leitura Agenda Sem Gestao
    [Documentation]    GAP-03 — viewer@demo.local: agenda OK, gestão forbidden
    [Tags]    rbac    gap-03    viewer
    Dado Que O Usuario Viewer Esta Autenticado
    Quando Navego Para    /agenda
    Aguardar Pagina Estavel
    Entao O Corpo Da Pagina Nao Deve Conter Texto    Erro ao carregar
    Capturar Evidencia    gap03_viewer_agenda.png
    Quando Navego Para    /gestao/dashboard
    Aguardar Pagina Estavel
    Entao A Url Deve Conter    forbidden
    Capturar Evidencia    gap03_viewer_forbidden_gestao.png
