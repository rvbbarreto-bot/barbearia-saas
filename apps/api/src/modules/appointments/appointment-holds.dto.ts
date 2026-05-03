import { z } from 'zod';

/** Payload POST /appointment-holds — V4: TTL 5–15 min, idempotência obrigatória. */
export const createAppointmentHoldBodySchema = z.object({
  professional_id: z.string().uuid(),
  service_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  idempotency_key: z.string().min(8).max(200),
  ttl_minutes: z.number().int().min(5).max(15).optional(),
});

export type CreateAppointmentHoldBody = z.infer<typeof createAppointmentHoldBodySchema>;
