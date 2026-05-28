*** Settings ***
Resource   ../locators/login.locators.robot
Resource   ../keywords/browser.robot
Resource   ../keywords/assertions.robot

*** Keywords ***
Login Page Deve Estar Pronta
    Wait For Elements State    ${LOC_LOGIN_BRAND}     visible
    Wait For Elements State    ${LOC_LOGIN_SUBTITLE}  visible
    Wait For Elements State    ${LOC_LOGIN_FORM}      visible
    Wait For Elements State    ${LOC_LOGIN_EMAIL}     visible
    Wait For Elements State    ${LOC_LOGIN_PASSWORD}  visible
    Wait For Elements State    ${LOC_LOGIN_SUBMIT}    visible
    Capturar Screenshot Checkpoint    login_tela_inicial.png
