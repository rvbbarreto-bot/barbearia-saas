# Riscos residuais

| ID | Descrição | Severidade inicial | Mitigação prevista próximos PR |
|----|-----------|--------------------|--------------------------------|
| R1 | Complexidade alta multi domínios numa só época | Alta | Dividir merges pequenos + flags |
| R2 | Cross-tenant regressão SQL | Alta | aumentar suites integration dedicated |
| R3 | Exposição PII relatórios | Média | mascaramento servidor + masking UI |
| R4 | Outbox retries abusivos se RBAC laxo | Média | testes papel negative |
| R5 | PR acidental main | Alta | job CI já adicionada |
| R6 | Drift backlog doc vs código | Média | matriz sempre junto merges |
