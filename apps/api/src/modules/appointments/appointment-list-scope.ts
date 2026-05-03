import { pool } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';

async function auditAgendaAccessDenied(params: {
  tenantId: string;
  actorUserId: string | undefined;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity, before, after)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [
        params.tenantId,
        params.actorUserId ?? null,
        'AGENDA_ACCESS_DENIED',
        'appointments',
        JSON.stringify({ reason: params.reason }),
        JSON.stringify(params.metadata ?? {}),
      ],
    );
  } catch {
    /* auditoria não bloqueia a resposta de erro */
  }
}

export type ListAppointmentsCaller = {
  sub?: string;
  role?: string;
  professional_id?: string | null;
};

/**
 * Profissional: força o filtro ao `users.professional_id` (ignora query string). Sem vínculo → 403.
 */
export async function resolveAppointmentProfessionalFilter(
  tenantId: string,
  caller: ListAppointmentsCaller,
): Promise<string> {
  let pid = caller.professional_id ?? undefined;
  if ((pid == null || pid === '') && caller.sub) {
    const fresh = await pool.query<{ professional_id: string | null }>(
      `SELECT professional_id FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [caller.sub, tenantId],
    );
    pid = fresh.rows[0]?.professional_id ?? undefined;
  }

  if (pid == null || pid === '') {
    await auditAgendaAccessDenied({
      tenantId,
      actorUserId: caller.sub,
      reason: 'PROFESSIONAL_NOT_LINKED',
    });
    throw new AppError(
      'PROFESSIONAL_NOT_LINKED',
      'Utilizador profissional sem vínculo a um registo em professionals. Contacte o gerente.',
      403,
    );
  }

  const belongs = await pool.query(
    `SELECT 1 FROM professionals WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [pid, tenantId],
  );
  if (!belongs.rowCount) {
    await auditAgendaAccessDenied({
      tenantId,
      actorUserId: caller.sub,
      reason: 'PROFESSIONAL_LINK_INVALID',
      metadata: { professional_id: pid },
    });
    throw new AppError('FORBIDDEN', 'Vínculo profissional inválido para este tenant.', 403);
  }

  return pid;
}
