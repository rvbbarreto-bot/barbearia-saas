*** Settings ***
Library    Browser
Resource   ../locators/veiculos.locators.robot
Resource   ../keywords/browser.robot
Resource   ../keywords/assertions.robot

*** Keywords ***
Veiculos Page Deve Estar Acessivel
    Wait For Elements State    ${LOC_VEICULOS_BTN_NOVO}    visible

Abrir Modal Novo Veiculo
    Click    ${LOC_VEICULOS_BTN_NOVO}
    Wait For Elements State    ${LOC_VEICULOS_DIALOG}    visible

Selecionar Primeiro Cliente No Modal
    ${dialog}=    Set Variable    ${LOC_VEICULOS_DIALOG}
    Click    ${dialog} >> role=combobox >> nth=0
    Click    role=option >> nth=0

Preencher Placa
    [Arguments]    ${placa}
    Fill Text    ${LOC_VEICULOS_INPUT_PLACA}    ${placa}

Salvar Veiculo
    Click    ${LOC_VEICULOS_BTN_SALVAR}

Entao Salvar Veiculo Deve Estar Desabilitado
    Entao Botao Deve Estar Desabilitado    ${LOC_VEICULOS_BTN_SALVAR}

Entao Deve Aparecer Toast Placa Duplicada
    Entao Toast Deve Exibir Mensagem    duplic|já existe|already|cadastrada|VEHICLE_PLATE
