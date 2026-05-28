*** Settings ***
Documentation    NAV-01 — smoke de rotas críticas (admin)
Resource         ../../resources/keywords/browser.robot
Resource         ../../resources/keywords/auth.robot
Resource         ../../resources/keywords/navigation.robot
Resource         ../../resources/variables/routes.robot
Suite Setup      Suite Autenticada Como Administrador
Suite Teardown   Fechar Navegador Da Suite
Test Setup       Teste Requer Sessao Administrador Ativa

*** Test Cases ***
NAV-01 Dashboard Admin Sem Erro 500
    [Tags]    smoke    critico
    Smoke Navegar Rota Como Admin    ${ROUTE_DASHBOARD}    Erro ao carregar

NAV-02 Gestao Admin Sem Erro 500
    [Tags]    smoke    gestao
    Smoke Navegar Rota Como Admin    ${ROUTE_GESTAO}    Erro ao carregar dashboard

NAV-03 Financeiro Admin Sem Erro 500
    [Tags]    smoke    financeiro
    Smoke Navegar Rota Como Admin    ${ROUTE_FINANCEIRO}    Erro 500    Internal Server Error

NAV-04 Agenda Admin Carrega
    [Tags]    smoke    agenda
    Smoke Navegar Rota Como Admin    ${ROUTE_AGENDA}    Erro ao carregar

NAV-05 Clientes Admin Carrega
    [Tags]    smoke    clientes
    Smoke Navegar Rota Como Admin    ${ROUTE_CLIENTES}    Erro ao carregar
