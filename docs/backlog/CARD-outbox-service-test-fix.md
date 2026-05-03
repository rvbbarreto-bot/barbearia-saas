# Card — Corrigir `outbox.service.test.ts` (Vitest / mock)

**Tipo:** estabilização / qualidade  
**Escopo:** apenas o ficheiro de teste e dependências mínimas de mock.  
**Não misturar com:** card `010_service_buffers`, Pix, recall, financeiro, comissão, n8n, outbox-worker em produção.

## Contexto

A suíte `apps/api/src/infra/queues/outbox.service.test.ts` falha ao correr isoladamente com erro típico de **hoisting** do `vi.mock`:

- `ReferenceError: Cannot access 'mockQuery' before initialization`
- Mensagem Vitest: factory de `vi.mock` não pode referenciar variáveis de topo que ainda não existem após hoist.

## Causa raiz (classificação)

| Hipótese | Confirmado |
|----------|------------|
| Mock / hoisting (`vi.mock` + `const mockQuery = vi.fn()` antes do factory) | **Sim** — causa provável dominante |
| Teste legado desalinhado com `outbox-worker` | Reavaliar após corrigir mock |
| Bug de implementação em `outbox-worker` | Improvável enquanto o erro for pré-import |

## Proposta de correção

1. Usar `vi.hoisted(() => ({ mockQuery: vi.fn() }))` e referenciar `mockQuery` dentro da factory de `vi.mock('../db/pool.js', () => ({ pool: { query: mockQuery } }))` conforme documentação Vitest.
2. Alternativa: definir `vi.mock` com factory inline `query: vi.fn()` e exportar referência via `vi.mocked` após import dinâmico.
3. Garantir que `npm run test:unit` / job CI inclui esta suíte (remover exclusão temporária se existir).

## Critérios de aceite

- [ ] `npx vitest run src/infra/queues/outbox.service.test.ts` passa localmente.
- [ ] CI executa a suíte sem exclusão injustificada.
- [ ] Nenhuma alteração funcional em worker/outbox além do estritamente necessário para testabilidade.

## Estimativa

Pequena (1–2h) após revisão do padrão de mock do projeto.
