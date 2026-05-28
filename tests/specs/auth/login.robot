*** Settings ***
Documentation    AUTH-01 / AUTH-02 — Login e área autenticada
Resource         ../../resources/keywords/browser.robot
Resource         ../../resources/keywords/auth.robot
Resource         ../../resources/pages/LoginPage.robot
Resource         ../../resources/locators/login.locators.robot
Suite Setup      Abrir Navegador Para Suite
Suite Teardown   Fechar Navegador Da Suite
Test Setup       Novo Contexto Limpo Para Teste

*** Test Cases ***
AUTH-01 Tela De Login Exibe Elementos Principais
    [Documentation]    BDD: AUTH-01
    [Tags]    smoke    auth    login
    Dado Que Estou Na Pagina De Login
    Login Page Deve Estar Pronta

AUTH-02 Login Admin Redireciona Para Area Autenticada
    [Documentation]    BDD: AUTH-02
    [Tags]    smoke    auth    critico
    Autenticar Como Administrador
    Entao Devo Estar Autenticado Na Area Principal

AUTH-03 Credenciais Invalidas Permanecem Na Login
    [Documentation]    BDD: AUTH-03
    [Tags]    auth    negative
    Dado Que Estou Na Pagina De Login
    Quando Preencho Email E Senha    ${USER_OWNER_EMAIL}    senha-errada-xyz
    Quando Confirmo Entrada
    Entao Devo Permanecer Na Pagina De Login
    Wait For Elements State    ${LOC_LOGIN_ERROR}    visible    timeout=10s
