import { z } from 'zod';

export const pixWebhookBodySchema = z.object({
  tenant_id: z.string().uuid(),
  provider_charge_id: z.string().min(1).max(500),
  event: z.enum(['paid', 'expired', 'failed', 'refunded']),
  delivery_id: z.string().min(4).max(500).optional(),
});

export type PixWebhookBody = z.infer<typeof pixWebhookBodySchema>;
