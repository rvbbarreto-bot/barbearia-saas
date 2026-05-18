# Riscos residuais

1. **OpenAPI** não atualizado com rotas `/vehicles` e `/car-wash/*` — documentar antes de aceite formal.
2. **Agendamento `explicit_confirmation=true`** deixa job no board antes de confirmar; chegada pode exigir confirmar antes (operacional).
3. **WhatsApp real** depende de Evolution + n8n; outbox validado em código, não smoke E2E neste ambiente.
4. **Prints** não capturados — aceite visual pendente.
5. **Unique (tenant_id, normalized_plate)** permite múltiplos veículos sem placa (NULL) — comportamento PostgreSQL esperado.
