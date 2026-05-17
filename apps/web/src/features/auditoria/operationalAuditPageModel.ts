export type OperationalAuditFiltersInput = {
  page: number;
  limit: number;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  correlationId: string;
  from: string;
  to: string;
};

export type OperationalAuditQuery = {
  page: number;
  limit: number;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  actor_user_id?: string;
  correlation_id?: string;
  from?: string;
  to?: string;
};

export function buildOperationalAuditQuery(input: OperationalAuditFiltersInput): OperationalAuditQuery {
  const trim = (s: string) => s.trim();
  return {
    page: input.page,
    limit: input.limit,
    event_type: trim(input.eventType) || undefined,
    entity_type: trim(input.entityType) || undefined,
    entity_id: trim(input.entityId) || undefined,
    actor_user_id: trim(input.actorUserId) || undefined,
    correlation_id: trim(input.correlationId) || undefined,
    from: trim(input.from) || undefined,
    to: trim(input.to) || undefined,
  };
}
