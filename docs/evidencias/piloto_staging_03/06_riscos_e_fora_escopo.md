# Riscos residuais e fora de escopo — PILOTO-STAGING-03

## Riscos (kickoff)

| Risco | Mitigação |
|-------|-----------|
| `main` divergente após incidente PR #2 | Trabalhar só a partir de `piloto-staging-01`; não merge piloto-03 em `main`. |
| n8n/Evolution indisponível no CI | Jobs específicos n8n podem permanecer manuais/evidência; alinhar com PO se for necessário job opcional no CI. |
| Volume de scope vs tempo | Priorizar critérios de aceite obrigatórios + evidência; marcar N/A na matriz com justificativa PO. |

## Fora de escopo (salvo decisão PO explícita)

- Force push / reset em `main` para “limpar” incidente.
- Mensagens WhatsApp reais em massa ou campanhas sem sandbox.
- Versionar credenciais reais.

## Itens explícitos “não entregues” se sem evidência

Qualquer linha da matriz ou workflow listado no README sem log/print ou teste correspondente será tratado como **não entregue** na revisão PO.
