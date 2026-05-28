*** Settings ***
Resource    common.robot

*** Keywords ***
Dado Que Estou Na Pagina De Veiculos
    Quando Navego Para    /veiculos
    Wait For Elements State    role=button[name=/Novo Veículo/i]    visible

Quando Abro Modal Novo Veiculo
    Click    role=button[name=/Novo Veículo/i]
    Wait For Elements State    role=dialog    visible

Quando Seleciono Primeiro Cliente No Modal Veiculo
    Click    role=dialog >> role=combobox
    Wait For Elements State    role=option >> nth=0    visible
    Click    role=option >> nth=0

Quando Preencho Placa No Modal
    [Arguments]    ${placa}
    Fill Text    role=dialog >> [placeholder="ABC1D23"]    ${placa}

Entao Botao Salvar Veiculo Deve Estar Desabilitado
    Get Element States    role=dialog >> role=button[name="Salvar"]    contains    disabled

Quando Clico Salvar Veiculo
    Click    role=dialog >> role=button[name="Salvar"]

Entao Deve Aparecer Toast Placa Duplicada
    Wait For Elements State    [data-sonner-toaster]    visible    timeout=8s
    ${toast}=    Get Text    [data-sonner-toaster]
    Should Contain    ${toast}    placa    ignore_case=True
    Capturar Evidencia    c10_placa_duplicada_toast.png

Obter Contagem Linhas Tabela Veiculos
    ${count}=    Get Element Count    css=table tbody tr
    RETURN    ${count}
