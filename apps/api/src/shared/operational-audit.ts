import type { PoolClient } from 'pg';
import { effectiveCorrelationId } from './request-correlation.js';

export { effectiveCorrelationId };

export type OperationalAuditInput = {
  tenantId: string;
  entityType: string;
  entityId?: string | null;
  eventType: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  source?: string;
  requestId?: string | null;
  correlationId?: string | null;
  /** Sem tokens, passwords ou payloads de integração. */
  metadata?: Record<string, unknown>;
};

export async function writeOperationalAuditEvent(
  client: PoolClient,
  input: OperationalAuditInput,
): Promise<void> {
  await client.query(
    `INSERT INTO operational_audit_events
      (tenant_id, entity_type, entity_id, event_type, actor_user_id, actor_role, source, request_id, correlation_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      input.tenantId,
      input.entityType,
      input.entityId ?? null,
      input.eventType,
      input.actorUserId ?? null,
      input.actorRole ?? null,
      input.source ?? 'api',
      input.requestId ?? null,
      input.correlationId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
