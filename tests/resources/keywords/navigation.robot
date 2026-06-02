*** Settings ***
Library    Browser
Resource   ../variables/env.robot
Resource   ../variables/routes.robot
Resource   ../locators/common.locators.robot
Resource   browser.robot

*** Keywords ***
Quando Navego Para Rota
    [Arguments]    ${rota}
    Go To    ${BASE_URL}${rota}
    Aguardar Pagina Estavel

Entao A Pagina Nao Deve Exibir Erro Critico De Carregamento
    [Arguments]    @{mensagens_proibidas}
    FOR    ${msg}    IN    @{mensagens_proibidas}
        Pagina Nao Deve Conter Texto    ${msg}
    END

Pagina Nao Deve Conter Texto
    [Arguments]    ${texto}
    ${body}=    Get Text    ${LOC_PAGE_BODY}
    Should Not Contain    ${body}    ${texto}    ignore_case=True

Entao A Url Atual Deve Conter
    [Arguments]    ${fragmento}
    ${url}=    Get Url
    Should Contain    ${url}    ${fragmento}

Smoke Navegar Rota Como Admin
    [Arguments]    ${rota}    @{mensagens_erro}
    Quando Navego Para Rota    ${rota}
    Entao A Url Atual Deve Conter    ${rota}
    Entao A Pagina Nao Deve Exibir Erro Critico De Carregamento    @{mensagens_erro}
