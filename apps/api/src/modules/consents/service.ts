import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';

const grantConsentSchema = z.object({
  channel: z.enum(['whatsapp', 'web', 'manual', 'api']),
  purpose: z.enum(['transactional', 'marketing', 'recall']),
  granted: z.boolean().default(true),
  source: z.string().max(100).optional(),
});

export async function listConsents(tenantId: string, customerId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT id, channel, purpose, granted, source, created_at, revoked_at
         FROM consents
        WHERE tenant_id = $1 AND customer_id = $2
        ORDER BY created_at DESC`,
      [tenantId, customerId],
    );
    return result.rows;
  });
}

export async function grantConsent(
  tenantId: string,
  customerId: string,
  input: z.infer<typeof grantConsentSchema>,
  actorUserId?: string,
) {
  const data = grantConsentSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const customer = await client.query(
      `SELECT id FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, customerId],
    );
    if (!customer.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado', 404);

    const result = await client.query(
      `INSERT INTO consents (tenant_id, customer_id, channel, purpose, granted, source)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, customerId, data.channel, data.purpose, data.granted, data.source ?? null],
    );

    // Sincronizar opt-out na tabela customers quando pertinente
    if (data.channel === 'whatsapp') {
      if (!data.granted) {
        await client.query(
          `UPDATE customers SET whatsapp_opt_out = true, whatsapp_opt_in = false, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, customerId],
        );
      } else if (data.granted && data.purpose === 'transactional') {
        await client.query(
          `UPDATE customers SET whatsapp_opt_in = true, whatsapp_opt_out = false, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, customerId],
        );
      }
    }

    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null,
      action: data.granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
      entity: 'consent', entityId: result.rows[0].id as string,
      after: { channel: data.channel, purpose: data.purpose, granted: data.granted, customer_id: customerId },
    });

    return result.rows[0];
  });
}

export async function revokeConsent(
  tenantId: string,
  customerId: string,
  consentId: string,
  actorUserId?: string,
) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE consents SET granted = false, revoked_at = now()
        WHERE tenant_id = $1 AND customer_id = $2 AND id = $3 AND revoked_at IS NULL
        RETURNING *`,
      [tenantId, customerId, consentId],
    );
    if (!result.rowCount) throw new AppError('CONSENT_NOT_FOUND', 'Consentimento não encontrado ou já revogado', 404);

    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null, action: 'CONSENT_REVOKED',
      entity: 'consent', entityId: consentId, after: { revoked_at: new Date().toISOString() },
    });
    return result.rows[0];
  });
}
