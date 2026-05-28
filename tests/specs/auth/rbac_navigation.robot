*** Settings ***
Documentation    RBAC-01 — perfis e acesso negado
Resource         ../../resources/keywords/browser.robot
Resource         ../../resources/keywords/auth.robot
Resource         ../../resources/keywords/navigation.robot
Resource         ../../resources/variables/routes.robot
Suite Setup      Abrir Navegador Para Suite
Suite Teardown   Fechar Navegador Da Suite

*** Test Cases ***
RBAC-01 Atendente Bloqueado Em Gestao
    [Documentation]    BDD: RBAC-01
    [Tags]    rbac    smoke
    Sessao Como Atendente
    Quando Navego Para Rota    ${ROUTE_GESTAO}
    Entao Devo Ver Pagina De Acesso Negado

RBAC-02 Visualizador Acessa Dashboard
    [Documentation]    Viewer pode dashboard/agenda
    [Tags]    rbac    smoke
    Sessao Como Visualizador
    Quando Navego Para Rota    ${ROUTE_DASHBOARD}
    Entao A Url Atual Deve Conter    dashboard
