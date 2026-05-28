*** Settings ***
Documentation    DEPRECATED — use tests/specs/auth/login.robot
...              Mantido para compatibilidade: redireciona execução mental para specs/

*** Test Cases ***
Migrar Para Specs Auth Login
    [Documentation]    Execute: npm run test:e2e
    Fail    Use tests/specs/auth/login.robot via scripts/qa-e2e-suite.ps1
