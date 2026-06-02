*** Settings ***
Library    Browser
Resource   ../variables/env.robot

*** Keywords ***
Abrir Navegador Para Suite
    New Browser    chromium    headless=${BROWSER_HEADLESS}
    New Context    viewport={'width': 1440, 'height': 900}
    Set Browser Timeout    ${BROWSER_TIMEOUT}

Fechar Navegador Da Suite
    Close Browser

Nova Pagina Para Teste
    New Page    ${BASE_URL}/login

Capturar Evidencia
    [Arguments]    ${nome_arquivo}
    ${path}=    Set Variable    ${EVIDENCIAS_DIR}${/}${nome_arquivo}
    Take Screenshot    ${path}    fullPage=True

Limpar Sessao Web
    Go To    ${BASE_URL}/login
    Evaluate JavaScript    !!    localStorage.removeItem('barbearia-auth')
    Reload

Dado Que Estou Na Pagina De Login
    Limpar Sessao Web
    Wait For Elements State    id=email    visible

Quando Realizo Login Com
    [Arguments]    ${email}    ${password}
    Fill Text    id=email    ${email}
    Fill Text    id=password    ${password}
    Click    role=button[name="Entrar"]
    Wait For Load State    networkidle
    ${url}=    Get Url
    Should Match Regexp    ${url}    .*(dashboard|agenda).*
    Capturar Evidencia    login_ok.png

Dado Que O Usuario Administrador Esta Autenticado
    Nova Pagina Para Teste
    Quando Realizo Login Com    ${ADMIN_EMAIL}    ${ADMIN_PASSWORD}

Dado Que O Usuario Atendente Esta Autenticado
    Nova Pagina Para Teste
    Quando Realizo Login Com    ${ATTENDANT_EMAIL}    ${ATTENDANT_PASSWORD}

Dado Que O Usuario Viewer Esta Autenticado
    Nova Pagina Para Teste
    Quando Realizo Login Com    ${VIEWER_EMAIL}    ${VIEWER_PASSWORD}

Quando Navego Para
    [Arguments]    ${rota}
    Go To    ${BASE_URL}${rota}
    Wait For Load State    networkidle

Entao A Url Deve Conter
    [Arguments]    ${fragmento}
    ${url}=    Get Url
    Should Contain    ${url}    ${fragmento}

Entao O Corpo Da Pagina Deve Conter Texto
    [Arguments]    ${texto}
    ${body}=    Get Text    body
    Should Contain    ${body}    ${texto}    ignore_case=True

Entao O Corpo Da Pagina Nao Deve Conter Texto
    [Arguments]    ${texto}
    ${body}=    Get Text    body
    Should Not Contain    ${body}    ${texto}    ignore_case=True

Aguardar Pagina Estavel
    Wait For Load State    domcontentloaded
    Wait For Load State    networkidle
