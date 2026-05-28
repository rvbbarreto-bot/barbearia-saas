*** Settings ***
Documentation    VEI-01 / VEI-02 — veículos (vertical car_wash)
Resource         ../../resources/keywords/browser.robot
Resource         ../../resources/keywords/auth.robot
Resource         ../../resources/keywords/navigation.robot
Resource         ../../resources/pages/VeiculosPage.robot
Resource         ../../resources/variables/routes.robot
Resource         ../../data/invalid_inputs.robot
Suite Setup      Suite Autenticada Como Administrador
Suite Teardown   Fechar Navegador Da Suite
Test Setup       Teste Requer Sessao Administrador Ativa

*** Test Cases ***
VEI-01 Placa Obrigatoria Bloqueia Salvar
    [Documentation]    BDD: VEI-01
    [Tags]    veiculos    car_wash    smoke
    Quando Navego Para Rota    ${ROUTE_VEICULOS}
    Veiculos Page Deve Estar Acessivel
    Abrir Modal Novo Veiculo
    Selecionar Primeiro Cliente No Modal
    Entao Salvar Veiculo Deve Estar Desabilitado

VEI-02 Placa Duplicada Exibe Toast
    [Documentation]    BDD: VEI-02 — pode falhar se BUG-001 ativo
    [Tags]    veiculos    car_wash    critico    defect-candidate
    Quando Navego Para Rota    ${ROUTE_VEICULOS}
    Veiculos Page Deve Estar Acessivel
    Abrir Modal Novo Veiculo
    Selecionar Primeiro Cliente No Modal
    Preencher Placa    ${PLATE_DUPLICATE_SEED}
    Salvar Veiculo
    Entao Deve Aparecer Toast Placa Duplicada
