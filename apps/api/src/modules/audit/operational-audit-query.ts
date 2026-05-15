import { z } from 'zod';

export const operationalAuditListQuery = z.object({
  event_type: z.string().min(1).max(120).optional(),
  entity_type: z.string().min(1).max(80).optional(),
  entity_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  correlation_id: z.string().min(1).max(120).optional(),
  request_id: z.string().min(1).max(200).optional(),
});

/** Normaliza query string (aliases) antes do parse Zod. */
export function normalizeOperationalAuditQuery(raw: Record<string, unknown>): Record<string, unknown> {
  const o = { ...raw };
  if (o.from == null && o.date_from != null) o.from = o.date_from;
  if (o.to == null && o.date_to != null) o.to = o.date_to;
  delete o.date_from;
  delete o.date_to;
  return o;
}
