# P2 — Runbook de suporte

## 1. Subir ambiente

- Seguir `README.md` (Docker Compose ou `setup.ps1`).
- Confirmar serviços: `docker compose ps` (api, web, postgres, redis, n8n **healthy**).
- Health: `GET http://localhost:3000/health` e `GET http://localhost:3000/database/health`.

## 2. Diagnóstico rápido

| Sintoma | Verificar |
| -------- | ---------- |
| 401 / token | Emissão de JWT, expiração, cabeçalho `Authorization` |
| TENANT_REQUIRED / TENANT_MISMATCH | `x-tenant-id` vs JWT; política de resolução P1 |
| 403 | RBAC — papel vs acção |
| 409 conflito de slot | Availability, bloqueios, appointment existente |
| Outbox preso | Estado `pending` + `last_error`; worker; `OUTBOX_FORCE_SEND_FAILURE` apenas em QA |

## 3. Correlation / request

- Correlacionar logs da API e do worker por `request_id` / `correlation_id` (auditoria P2).

## 4. Base de dados

- Validar tenant: `tenant_id` em entidades.
- Migrations: pasta `database/migrations/`.

*(Secções WhatsApp/N8N, lembrete e queries SQL de verificação serão expandidas na entrega P2.)*
