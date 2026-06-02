*** Settings ***
Library    Browser
Library    OperatingSystem
Resource   ../variables/env.robot

*** Keywords ***
Abrir Navegador
    [Documentation]    Abre Chromium; use ${BROWSER_HEADLESS} em env.robot
    New Browser    chromium    headless=${BROWSER_HEADLESS}
    New Context    viewport={'width': 1440, 'height': 900}
    Set Browser Timeout    ${BROWSER_TIMEOUT}

Fechar Navegador
    Close Browser

Ir Para Pagina De Login
    [Documentation]    Novo contexto = storage limpo (sem sessão anterior)
    New Context    viewport={'width': 1440, 'height': 900}
    New Page    ${BASE_URL}/login
    Wait For Load State    networkidle

Capturar Evidencia
    [Arguments]    ${nome_arquivo}
    Create Directory    ${EVIDENCIAS_DIR}
    Take Screenshot    ${EVIDENCIAS_DIR}${/}${nome_arquivo}    fullPage=True
