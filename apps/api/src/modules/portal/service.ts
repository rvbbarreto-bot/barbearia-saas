import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getIntegrationLookupPool, pool, withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import {
  cancelAppointmentInDb,
  confirmAppointmentInDb,
  type AppointmentCaller,
} from '../appointments/service.js';
import { generatePortalTokenPlain, hashPortalToken } from './token.js';

const PORTAL_CONFIRMABLE_STATUSES = new Set(['awaiting_confirmation', 'awaiting_payment']);
const PORTAL_CANCELLABLE_STATUSES = new Set([
  'awaiting_confirmation',
  'awaiting_payment',
  'confirmed',
  'checked_in',
]);

function portalCallerForToken(tokenId: string): AppointmentCaller {
  return {
    correlationId: `portal:${tokenId}`,
    requestId: `portal:${tokenId}`,
  };
}

const TOKEN_TTL_HOURS = 72;

export type PortalAppointmentView = {
  appointment_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  service_name: string | null;
  professional_name: string | null;
  customer_name: string | null;
  can_confirm: boolean;
  can_cancel: boolean;
  tenant_display_name: string | null;
};

/** Resolve token antes de `app.tenant_id` (RLS em `appointment_portal_tokens` exige tenant no contexto). */
async function resolveTokenRow(plainToken: string) {
  const hash = hashPortalToken(plainToken);
  const r = await getIntegrationLookupPool().query<{
    id: string;
    tenant_id: string;
    appointment_id: string;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `SELECT id::text, tenant_id::text, appointment_id::text,
            expires_at::text, revoked_at::text
       FROM appointment_portal_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [hash],
  );
  if (!r.rowCount) {
    throw new AppError('PORTAL_TOKEN_INVALID', 'Link inválido ou expirado.', 404);
  }
  const row = r.rows[0];
  if (row.revoked_at) {
    throw new AppError('PORTAL_TOKEN_REVOKED', 'Este link já não está disponível.', 410);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError('PORTAL_TOKEN_EXPIRED', 'Este link expirou. Solicite um novo à unidade.', 410);
  }
  return row;
}

async function loadAppointmentView(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<PortalAppointmentView> {
  const r = await client.query<{
    appointment_id: string;
    status: string;
    starts_at: string;
    ends_at: string;
    service_name: string | null;
    professional_name: string | null;
    customer_name: string | null;
    tenant_display_name: string | null;
  }>(
    `SELECT
       a.id::text AS appointment_id,
       a.status::text AS status,
       a.starts_at::text AS starts_at,
       a.ends_at::text AS ends_at,
       s.name AS service_name,
       p.name AS professional_name,
       c.name AS customer_name,
       t.name AS tenant_display_name
     FROM appointments a
     JOIN tenants t ON t.id = a.tenant_id
     LEFT JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
     LEFT JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id
     LEFT JOIN customers c ON c.tenant_id = a.tenant_id AND c.id = a.customer_id
    WHERE a.tenant_id = $1 AND a.id = $2
    LIMIT 1`,
    [tenantId, appointmentId],
  );
  if (!r.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado.', 404);
  const row = r.rows[0];
  const status = row.status;
  const can_confirm = PORTAL_CONFIRMABLE_STATUSES.has(status);
  const can_cancel = PORTAL_CANCELLABLE_STATUSES.has(status);
  return {
    appointment_id: row.appointment_id,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    service_name: row.service_name,
    professional_name: row.professional_name,
    customer_name: row.customer_name,
    tenant_display_name: row.tenant_display_name,
    can_confirm,
    can_cancel,
  };
}

export async function createAppointmentPortalToken(
  tenantId: string,
  appointmentId: string,
  actorUserId: string | undefined,
): Promise<{ token: string; expires_at: string }> {
  const plain = generatePortalTokenPlain();
  const hash = hashPortalToken(plain);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  return withTenant(tenantId, async (client) => {
    const appt = await client.query(
      `SELECT id FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, appointmentId],
    );
    if (!appt.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);

    await client.query(
      `UPDATE appointment_portal_tokens
          SET revoked_at = now()
        WHERE tenant_id = $1 AND appointment_id = $2 AND revoked_at IS NULL`,
      [tenantId, appointmentId],
    );

    await client.query(
      `INSERT INTO appointment_portal_tokens
         (tenant_id, appointment_id, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, appointmentId, hash, expiresAt.toISOString(), actorUserId ?? null],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PORTAL_TOKEN_CREATED',
      entity: 'appointment',
      entityId: appointmentId,
      after: { expires_at: expiresAt.toISOString() },
    });

    return { token: plain, expires_at: expiresAt.toISOString() };
  });
}

export async function getPortalAppointmentByToken(plainToken: string): Promise<PortalAppointmentView> {
  const tokenRow = await resolveTokenRow(plainToken);
  return withTenant(tokenRow.tenant_id, async (client) =>
    loadAppointmentView(client, tokenRow.tenant_id, tokenRow.appointment_id),
  );
}

async function mutateByToken(
  plainToken: string,
  action: 'confirm' | 'cancel',
): Promise<PortalAppointmentView> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenRow = await resolveTokenRow(plainToken);
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tokenRow.tenant_id]);

    const cur = await client.query<{ status: string }>(
      `SELECT status::text AS status FROM appointments
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tokenRow.tenant_id, tokenRow.appointment_id],
    );
    if (!cur.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado.', 404);
    const status = cur.rows[0].status;
    const caller = portalCallerForToken(tokenRow.id);

    if (action === 'confirm') {
      if (!PORTAL_CONFIRMABLE_STATUSES.has(status)) {
        throw new AppError('PORTAL_ACTION_NOT_ALLOWED', 'Confirmação não disponível para este agendamento.', 409);
      }
      await confirmAppointmentInDb(client, tokenRow.tenant_id, tokenRow.appointment_id, caller);
      await writeAuditLog(client, {
        tenantId: tokenRow.tenant_id,
        actorUserId: null,
        action: 'PORTAL_APPOINTMENT_CONFIRMED',
        entity: 'appointment',
        entityId: tokenRow.appointment_id,
        before: { status },
        after: { status: 'confirmed', via: 'portal_token' },
      });
    } else {
      if (!PORTAL_CANCELLABLE_STATUSES.has(status)) {
        throw new AppError('PORTAL_ACTION_NOT_ALLOWED', 'Cancelamento não disponível para este agendamento.', 409);
      }
      await cancelAppointmentInDb(
        client,
        tokenRow.tenant_id,
        tokenRow.appointment_id,
        'Cancelado pelo cliente via portal',
        caller,
      );
      await writeAuditLog(client, {
        tenantId: tokenRow.tenant_id,
        actorUserId: null,
        action: 'PORTAL_APPOINTMENT_CANCELLED',
        entity: 'appointment',
        entityId: tokenRow.appointment_id,
        before: { status },
        after: { status: 'cancelled', via: 'portal_token' },
      });
    }

    await client.query('COMMIT');
    return loadAppointmentView(client, tokenRow.tenant_id, tokenRow.appointment_id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function confirmPortalAppointmentByToken(plainToken: string) {
  return mutateByToken(plainToken, 'confirm');
}

export async function cancelPortalAppointmentByToken(plainToken: string) {
  return mutateByToken(plainToken, 'cancel');
}

export const portalTokenParamSchema = z.object({
  token: z.string().min(16).max(128),
});
