# Evidencias - Seguranca e Segredos

## Confirmacao de seguranca do pacote

- Nenhum token real de producao foi incluido neste pacote.
- Nenhuma senha/chave privada real foi adicionada aos artefatos QA.
- O environment JSON usa placeholders e credenciais de demo/local.

## Verificacao recomendada antes de envio

1. Rodar `git status` e confirmar apenas arquivos esperados.
2. Rodar `gitleaks detect --source . --verbose` (ou equivalente docker) e anexar resultado.
3. Revisar arquivos `*.json` do pacote para garantir ausencia de segredos reais.

## Observacao

Credenciais de demo (`admin@demo.local` / `admin12345`) sao de ambiente local de teste e nao representam segredo de producao.
