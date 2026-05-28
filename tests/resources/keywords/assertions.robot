*** Settings ***
Library    Browser
Resource   ../locators/common.locators.robot
Resource   browser.robot

*** Keywords ***
Entao Elemento Deve Estar Visivel
    [Arguments]    ${locator}
    Wait For Elements State    ${locator}    visible

Entao Toast Deve Exibir Mensagem
    [Arguments]    ${pattern}
    Wait Until Keyword Succeeds    6x    2s    Toast Visivel Com Texto    ${pattern}
    Capturar Screenshot Checkpoint    toast.png

Toast Visivel Com Texto
    [Arguments]    ${pattern}
    Wait For Elements State    ${LOC_SONNER_TOASTER}    visible    timeout=5s
    ${text}=    Get Text    ${LOC_SONNER_TOASTER}
    Should Match Regexp    ${text}    (?is).*(${pattern}).*

Entao Botao Deve Estar Desabilitado
    [Arguments]    ${locator}
    Get Element States    ${locator}    contains    disabled
