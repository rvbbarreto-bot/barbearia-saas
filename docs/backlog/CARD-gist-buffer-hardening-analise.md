# Card — Análise técnica: constraint GIST (janela nominal) vs buffers na aplicação

**Tipo:** análise / risco / hardening (sem implementação até aprovação explícita do PO)  
**Escopo:** documento de análise + recomendações; **não** implementar triggers, novas colunas ou mudanças de constraint sem card de implementação aprovado.

## Contexto

- A constraint **EXCLUDE USING gist** em `appointments` protege a **sobreposição da janela nominal** (`starts_at` / `ends_at` armazenados).
- A ocupação efetiva considerando **`buffer_before`** e **`buffer_after`** é aplicada nas **queries da API** (slots, conflitos, disponibilidade).
- **Risco:** inserções ou atualizações **fora da API** (seed, script, ETL, integração legada) podem criar linhas nominalmente não sobrepostas mas **efetivamente** em conflito com buffers.

## Entregáveis da análise

1. Descrição do estado atual (GIST + lista de status bloqueantes vs código).
2. Matriz de cenários: API-only vs bypass de banco.
3. Opções de hardening (sem implementar):
   - (a) Proteção em nível de banco (trigger / função que valida janela expandida).
   - (b) Persistir janela efetiva expandida (colunas ou range gerado).
   - (c) Evoluir constraint para considerar buffers (complexidade, impacto em migração).
   - (d) Risco de bypass: mitigação operacional (políticas, apenas API escreve, revisão de roles).
4. Recomendação priorizada com prós/contras e ordem sugerida de POC.

## Critérios de aceite (fase análise)

- [ ] Documento entregue e revisto por arquiteto + PO.
- [ ] Nenhum DDL aplicado em produção neste card.

## Dependências

- Homologação DEV e baseline V4 disponíveis para alinhar decisão ao documento oficial.
