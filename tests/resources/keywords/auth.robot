*** Settings ***
Library    Browser
Resource   ../variables/env.robot
Resource   ../variables/routes.robot
Resource   ../locators/login.locators.robot
Resource   ../locators/nav.locators.robot
Resource   ../../data/users.robot
Resource   browser.robot

*** Keywords ***
Dado Que Estou Na Pagina De Login
    Nova Pagina    ${ROUTE_LOGIN}
    Aguardar Pagina Estavel
    Wait For Elements State    ${LOC_LOGIN_EMAIL}    visible

Quando Preencho Email E Senha
    [Arguments]    ${email}    ${password}
    Fill Text    ${LOC_LOGIN_EMAIL}     ${email}
    Fill Text    ${LOC_LOGIN_PASSWORD}  ${password}

Quando Confirmo Entrada
    Click    ${LOC_LOGIN_SUBMIT}
    Aguardar Pagina Estavel

Autenticar Como
    [Arguments]    ${email}    ${password}
    Dado Que Estou Na Pagina De Login
    Quando Preencho Email E Senha    ${email}    ${password}
    Quando Confirmo Entrada
    Retry Ate Sucesso    Url Deve Corresponder Area Autenticada

Suite Autenticada Como Administrador
    Abrir Navegador Para Suite
    Novo Contexto Limpo Para Teste
    Autenticar Como Administrador

Teste Requer Sessao Administrador Ativa
    Go To    ${BASE_URL}${ROUTE_DASHBOARD}
    Aguardar Pagina Estavel
    Wait For Elements State    ${LOC_SIDEBAR}    visible

Sessao Como Atendente
    Novo Contexto Limpo Para Teste
    Autenticar Como Atendente

Sessao Como Visualizador
    Novo Contexto Limpo Para Teste
    Autenticar Como Visualizador

Autenticar Como Administrador
    Autenticar Como    ${USER_OWNER_EMAIL}    ${USER_OWNER_PASSWORD}

Autenticar Como Atendente
    Autenticar Como    ${USER_ATTENDANT_EMAIL}    ${USER_ATTENDANT_PASSWORD}

Autenticar Como Visualizador
    Autenticar Como    ${USER_VIEWER_EMAIL}    ${USER_VIEWER_PASSWORD}

Entao Devo Estar Autenticado Na Area Principal
    Retry Ate Sucesso    Url Deve Corresponder Area Autenticada
    Wait For Elements State    ${LOC_SIDEBAR}    visible
    Capturar Screenshot Checkpoint    auth_ok.png

Url Deve Corresponder Area Autenticada
    ${url}=    Get Url
    Should Match Regexp    ${url}    .*(/dashboard|/agenda).*

Entao Devo Permanecer Na Pagina De Login
    ${url}=    Get Url
    Should Contain    ${url}    /login

Entao Devo Ver Pagina De Acesso Negado
    Retry Ate Sucesso    Url Deve Conter Fragmento    forbidden
    Capturar Screenshot Checkpoint    forbidden.png

Url Deve Conter Fragmento
    [Arguments]    ${fragmento}
    ${url}=    Get Url
    Should Contain    ${url}    ${fragmento}
