*** Settings ***
Library    Browser
Library    OperatingSystem
Resource   ../variables/env.robot
Resource   ../variables/routes.robot

*** Keywords ***
Abrir Navegador Para Suite
    [Documentation]    Suite setup — um browser por suite; contexto por teste
    ${headless}=    Convert To Boolean    ${BROWSER_HEADLESS}
    New Browser    chromium    headless=${headless}
    Set Browser Timeout    ${BROWSER_TIMEOUT}

Fechar Navegador Da Suite
    Close Browser

Novo Contexto Limpo Para Teste
    [Documentation]    Isolamento de storage/cookies entre testes
    Criar Diretorios De Evidencia
    New Context    viewport={'width': ${BROWSER_WIDTH}, 'height': ${BROWSER_HEIGHT}}

Nova Pagina
    [Arguments]    ${path}=${ROUTE_LOGIN}
    New Page    ${BASE_URL}${path}
    Wait For Load State    networkidle

Aguardar Pagina Estavel
    Wait For Load State    domcontentloaded
    Wait For Load State    networkidle

Capturar Screenshot Checkpoint
    [Arguments]    ${nome}
    Criar Diretorios De Evidencia
    Take Screenshot    ${SCREENSHOT_DIR}${/}${nome}    fullPage=True

Criar Diretorios De Evidencia
    Create Directory    ${EVIDENCE_DIR}
    Create Directory    ${SCREENSHOT_DIR}
    Create Directory    ${TRACE_DIR}
    Create Directory    ${VIDEO_DIR}

Retry Ate Sucesso
    [Arguments]    ${keyword}    @{args}
    Wait Until Keyword Succeeds    ${RETRY_COUNT}x    ${RETRY_INTERVAL}s    ${keyword}    @{args}
