import pg from 'pg';

type AuditInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

export async function writeAuditLog(client: pg.PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
      (tenant_id, actor_user_id, action, entity, entity_id, before, after, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.tenantId ?? null,
      input.actorUserId ?? null,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.before ?? null,
      input.after ?? null,
      input.ip ?? null,
    ],
  );
}
