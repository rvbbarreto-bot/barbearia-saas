# Documentação oficial do projeto Barbearia SaaS

Este diretório contém a documentação oficial usada como baseline de requisitos, arquitetura, regras de negócio, banco, fluxos operacionais e prioridades do projeto.

## Documento baseline oficial

- **`docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf`** (caminho relativo à raiz `barbearia-saas/`)

### Verificação (DevOps / CI)

```powershell
cd barbearia-saas
PowerShell -ExecutionPolicy Bypass -File scripts/verify-v4-baseline.ps1
# após garantir o PDF no repositório:
# .\scripts\verify-v4-baseline.ps1 -Strict
```

### Próximo passo autorizado (homologação DEV oficial)

Preencher e anexar evidências no modelo:

- **`docs/HOMOLOGACAO_FINAL_RELATORIO_COMPLEMENTAR_TEMPLATE.md`**  
  (backup antes das migrations, `DATABASE_URL` mascarada, migrations até `010_service_buffers.sql`, `COMMIT`, estrutura `services`/`buffer_*_minutes`, testes de integração pertinentes — **sem expor senhas**.)

## Regra de uso

O documento V4 é a fonte oficial para desenvolvimento.

Nenhuma nova funcionalidade deve ser implementada com base apenas em resumo de conversa, relatório parcial ou interpretação isolada.

Sempre que houver divergência entre:
- relatório técnico parcial;
- prompt;
- conversa;
- implementação;
- documento V4;

a prioridade deve ser:

1. Documento V4 validado pelo PO;
2. Decisão explícita do PO;
3. Prompt/card autorizado;
4. Relatório técnico da entrega.

## Restrições atuais

Não iniciar sem autorização explícita do PO:

- Pix;
- recall;
- financeiro;
- comissão;
- n8n;
- outbox-worker;
- novas telas;
- novas funcionalidades fora do card autorizado.

## Pendências formais conhecidas

- Correção do teste `outbox.service.test.ts`;
- Análise técnica GIST/buffer;
- Homologação final no DEV oficial das migrations até 010 (ver template em `docs/HOMOLOGACAO_FINAL_RELATORIO_COMPLEMENTAR_TEMPLATE.md`).
