*** Settings ***
Resource    common.robot

*** Keywords ***
Dado Que Estou Na Pagina De Mensagens Outbox
    Quando Navego Para    /operacao/mensagens
    Wait For Elements State    data-testid=outbox-page    visible

Quando Filtro Outbox Por Status Falhou
    Click    data-testid=outbox-filter-status
    Run Keyword And Ignore Error    Click    role=option[name=/Falhou/i]
    Run Keyword And Ignore Error    Click    role=option >> text=/Falhou|Encerrada/i >> nth=0
    Aguardar Pagina Estavel
    Wait For Elements State    data-testid=outbox-table    visible    timeout=8s
    Capturar Evidencia    outbox_filtro_falhou.png

Quando Abro Primeira Linha Outbox Se Existir
    ${rows}=    Get Element Count    data-testid=outbox-table >> tbody tr
    IF    ${rows} == 0
        Fail    MASSA QA: sem mensagens failed — execute scripts/qa-seed-outbox-failed.ps1
    END
    Click    data-testid=outbox-table >> tbody tr >> nth=0
    Wait For Elements State    data-testid=outbox-detail-dialog    visible

Quando Clico Reenviar Outbox Se Visivel
    ${visible}=    Run Keyword And Return Status
    ...    Wait For Elements State    data-testid=outbox-retry-button    visible    timeout=3s
    IF    not ${visible}
        Fail    Botao Reenviar nao visivel para admin
    END
    Click    data-testid=outbox-retry-button
    Run Keyword And Ignore Error    Click    role=button[name=/Confirmar|Sim|Reenviar/i]
    Aguardar Pagina Estavel
    Capturar Evidencia    c26_outbox_retry_admin.png

Entao Botao Reenviar Outbox Nao Deve Estar Visivel
    Wait For Elements State    data-testid=outbox-detail-dialog    visible    timeout=5s
    Get Element States    data-testid=outbox-retry-button    contains    hidden
    Capturar Evidencia    c27_outbox_sem_retry_atendente.png
