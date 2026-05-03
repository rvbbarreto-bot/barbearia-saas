import { pool } from '../../infra/db/pool.js';

type AuthAuditAction =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_REFRESH_SUCCESS'
  | 'AUTH_REFRESH_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_REUSE_DETECTED'
  | 'AUTH_PASSWORD_RESET_REQUESTED'
  | 'AUTH_PASSWORD_RESET_COMPLETED';

type WriteAuthAuditInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: AuthAuditAction;
  reason?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuthAudit(input: WriteAuthAuditInput): Promise<void> {
  const before = input.reason ? { reason: input.reason } : null;
  const after = input.metadata ?? null;
  await pool.query(
    `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity, before, after, ip)
     VALUES ($1, $2, $3, 'auth_session', $4, $5, $6)`,
    [input.tenantId ?? null, input.actorUserId ?? null, input.action, before, after, input.ip ?? null],
  );
}
