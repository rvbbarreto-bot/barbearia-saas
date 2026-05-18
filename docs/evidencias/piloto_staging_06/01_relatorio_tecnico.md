# Relatório técnico — PILOTO-STAGING-06

## Branch e base

- Branch: `feature/piloto-staging-06-expansao-operacional-gestao`
- Base PR: `piloto-staging-01`
- SHA inicial gate: `e421970c04d274da0780c16c2955d56bf3b86b57`

## Entregas principais

1. **Lava Rápido MVP** — código integrado na branch (migrations 105–106, módulos `vehicles`, `carWash`, `vertical`, UI board).
2. **Dashboard gerencial** — `apps/api/src/modules/management`, UI `/gestao/dashboard`.
3. **Cliente 360** — `GET /customers/:id/overview`, UI `/clientes/:id/360`.
4. **Portal tokenizado** — migration `107_appointment_portal_tokens.sql`, rotas públicas e geração de token.
5. **Financeiro** — export CSV `GET /finance/appointments/export.csv`.
6. **Waitlist** — anti-duplicidade + `suggest-slot`.
7. **RBAC** — política `management` (manager+).

## Testes locais

- API: `npm run typecheck` OK, `npm run test:unit` 197 passed
- Web: `npm run typecheck` OK, `npm run test` 65 passed
- n8n: `npm run n8n:validate-workflows` OK

## Pendências

- Prints L01–L14 e screenshots UI (stack `car_wash` local).
- PR GitHub + CI Actions (push pendente).
- Cobertura 82% nas áreas alteradas — validar com `test:coverage` no CI.
