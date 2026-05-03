# Lacuna de numeración — migration `012`

## Situação

No repositório existia sequência de ficheiros `011_user_professional_link.sql` seguido diretamente de `013_channel_walk_in_admin.sql`, **sem** `012_*.sql`.

## Decisão do PO (card governança 019)

- Regularizar a lacuna com **documentação oficial** neste ficheiro.
- Inserir **`012_noop_documentation.sql`** como migração **noop** (sem alteração de schema), apenas para **preservar ordem de numeración** e rastreabilidade em ferramentas que ordenam por prefixo numérico.
- **Não** reaplicar retroativamente alterações executáveis pesadas como “012” se `013+` já tiver sido aplicada em bases existentes — o noop é seguro (equivalente a já estar harmonizado com histórico).

## Implicações

- Ambientes que já aplicaram `013`–`018` **antes** da existência do `012`: ao correr migrações incrementais, o `012` noop será aplicado **uma vez**, sem efeito lateral.
- Novos ambientes: ordem natural `011` → `012` (noop) → `013` → …

## Referência

Relatório de governança PO — bloqueador “lacuna 012”; aceite para preparação técnica da etapa 019.
