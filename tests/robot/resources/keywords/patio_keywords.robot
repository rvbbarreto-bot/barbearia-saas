*** Settings ***
Resource    common.robot
Resource    ../variables/env.robot

*** Keywords ***
Dado Que Estou No Patio Lava Rapido Na Data QA
    Quando Navego Para    /operacao/lava-rapido
    Fill Text    css=input[type="date"]    ${QA_PATIO_DATE}
    Aguardar Pagina Estavel
    Wait For Elements State    xpath=//section[.//*[self::h2 or self::h3][contains(normalize-space(.),'Agendados')]]    visible    timeout=10s
    Capturar Evidencia    patio_data_${QA_PATIO_DATE}.png

Entao Nao Deve Existir Botao Pronto Em Agendados
    ${count}=    Get Element Count    xpath=//section[.//*[self::h2 or self::h3][contains(normalize-space(.),'Agendados')]]//button[normalize-space()='Pronto']
    Should Be Equal As Numbers    ${count}    0

Quando Executo Transicao Patio
    [Arguments]    ${nome_botao}
  # Checklist opcional antes de Chegou
    ${checklist}=    Run Keyword And Return Status
    ...    Wait For Elements State    role=button[name=/Checklist/i]    visible    timeout=2s
    IF    ${checklist}
        Click    role=button[name=/Checklist/i] >> nth=0
        Run Keyword And Ignore Error    Fill Text    id=interior    QA Robot - sem objetos
        Run Keyword And Ignore Error    Click    role=button[name=/Salvar checklist/i]
        Run Keyword And Ignore Error    Wait For Elements State    role=dialog    hidden    timeout=5s
    END
    ${btn}=    Set Variable    role=button[name="${nome_botao}"]
    ${visible}=    Run Keyword And Return Status    Wait For Elements State    ${btn}    visible    timeout=3s
    IF    ${visible}
        Click    ${btn} >> nth=0
        Aguardar Pagina Estavel
    END

Quando Avanco Job Agendados Ate Prontos
    Quando Executo Transicao Patio    Chegou
    Quando Executo Transicao Patio    Iniciar
    Quando Executo Transicao Patio    Conferência
    Quando Executo Transicao Patio    Pronto
    Capturar Evidencia    patio_fsm_prontos.png
