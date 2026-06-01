import { z } from 'zod';

/**
 * tenant_id no body é aceito pelo schema mas NUNCA usado como fonte de verdade no serviço.
 */
export const inboundBodySchema = z.object({
  phone: z.string().min(8),
  name: z.string().optional().nullable(),
  message: z.string().min(1),
  external_message_id: z.string().min(1).optional().nullable(),
  tenant_id: z.unknown().optional(),
  message_type: z.enum(['text', 'audio']).optional(),
  media_url: z.string().min(1).optional().nullable(),
});

export type InboundBody = z.infer<typeof inboundBodySchema>;
