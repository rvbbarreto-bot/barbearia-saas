# Variáveis de ambiente para testes

## API — integração (Vitest + CI)

Obrigatórias para `apps/api` testes `*.integration.test.ts` (ver `.github/workflows/ci.yml`):

| Variável | Exemplo local/CI |
|----------|------------------|
| `DATABASE_URL` | `postgres://barbearia_app:...@localhost:5432/barbearia_saas_test` |
| `DATABASE_URL_ADMIN` | `postgres://barbearia:...@localhost:5432/barbearia_saas_test` |
| `JWT_SECRET` | mín. 32 caracteres |
| `REDIS_URL` | `redis://localhost:6379` |
| `EVOLUTION_API_URL` | `http://evolution.test` |
| `EVOLUTION_API_KEY` | valor fictício |

Flags frequentes em CI: `WAITLIST_SLOT_NOTIFY_ENABLED=false`, `RECALL_ENABLED=false`.

## Web — unitário

Sem `.env` obrigatório; Vitest usa `jsdom` e mocks.

## E2E browser

| Variável | Default |
|----------|---------|
| `QA_WEB_BASE` | `http://localhost:3001` |
| `QA_API_BASE` | `http://localhost:3000` |

Não commitar `.env` com secrets reais. Copiar de `.env.example` na raiz.
