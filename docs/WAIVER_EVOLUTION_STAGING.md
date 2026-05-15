# Waiver — Piloto staging sem WhatsApp real (Evolution)

Preencher **somente** se `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` não estiverem disponíveis na janela do piloto.

| Campo | Valor |
|-------|-------|
| Causa raiz | |
| Variável faltante | `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` |
| Responsável | |
| Impacto | Piloto externo com envio WhatsApp **bloqueado** |
| Prazo correção | |
| Esforço estimado (h) | |
| Aceite PO (assinatura/data) | |

Comportamento aceite com waiver: outbox enfileira, worker processa, falha controlada documentada, retry admin, RBAC 403 atendente — sem apresentar mock como envio real.

Base: `docs/DECLARACAO_PILOTO_EVOLUTION.md`
