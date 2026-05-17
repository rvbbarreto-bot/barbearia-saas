# Investigação check vermelho — commit e93f9cd

## Sintoma

No GitHub, commit `e93f9cd` exibia falha no job **API — typecheck · lint · test · build** (ícone vermelho no push).

Run: https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25994248190

## Causa raiz

Falha no passo **TypeScript — typecheck** (`exit code 2`), antes dos testes de integração:

| Ficheiro | Erro |
|----------|------|
| `classify-outbox-error.ts:86` | TS2367 — comparação `c !== 'other'` sem overlap de tipos |
| `list-messages.service.ts:119` | TS2345 — `string` passado onde era `NonNullable<OutboxErrorClass>` |

Web, Gitleaks e npm audit estavam **verdes** no mesmo run.

## Correção

Commit `9ce9519`:

- Remover filtro redundante em `case 'other'`.
- Narrowing `errorClassFilter` após `isValidOutboxErrorClassFilter`.

## Run verde pós-correção

https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25994652688

Todos os jobs: **success** (API, Web, npm audit, Gitleaks).
