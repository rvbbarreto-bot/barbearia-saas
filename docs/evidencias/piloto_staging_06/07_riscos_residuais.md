# Riscos residuais — PILOTO-STAGING-06

1. **Prints UI** — não capturados nesta sessão; QA deve anexar em `prints/`.
2. **Cobertura 82%** — vitest global ainda com threshold legado em `tenant.ts`/`tenants/service.ts`; módulos novos (management, portal, carWash) dependem de relatório CI pós-correção.
3. **WhatsApp E2E** — Evolution externo; smoke n8n validado estruturalmente apenas.
4. **PR #10** — redundante com PS-06; alinhar com PO se fechar #10.
5. **Regressão barbearia** — testes de integração existentes devem permanecer verdes no PR #11.
