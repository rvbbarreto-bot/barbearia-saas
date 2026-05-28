*** Settings ***
Library    Browser
Resource   ../variables/env.robot
Resource   browser_keywords.robot

*** Keywords ***
A Pagina De Login Deve Estar Visivel
    Wait For Elements State    ${LOC_EMAIL}        visible
    Wait For Elements State    ${LOC_PASSWORD}     visible
    Wait For Elements State    ${LOC_BTN_ENTRAR}   visible
    Wait For Elements State    ${LOC_BRAND_TITLE}     visible
    Wait For Elements State    ${LOC_LOGIN_SUBTITLE}  visible
    Wait For Elements State    ${LOC_LOGIN_FORM}      visible
    ${url}=    Get Url
    Should Contain    ${url}    /login
    Capturar Evidencia    login_tela_inicial.png

Quando Preencho Credenciais
    [Arguments]    ${email}    ${password}
    Fill Text    ${LOC_EMAIL}     ${email}
    Fill Text    ${LOC_PASSWORD}  ${password}

E Clico Em Entrar
    Click    ${LOC_BTN_ENTRAR}
    Wait For Load State    networkidle

Entao Devo Ver Area Autenticada
    Wait Until Keyword Succeeds    6x    5s    Url Deve Indicar Sessao Autenticada
    Capturar Evidencia    login_pos_auth.png

Url Deve Indicar Sessao Autenticada
    ${url}=    Get Url
    Should Match Regexp    ${url}    .*(/dashboard|/agenda).*
