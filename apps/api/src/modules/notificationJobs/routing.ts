import type { PoolClient } from 'pg';

export type WhatsAppRouting = { phone: string; instance_name: string };

export async function resolveWhatsAppOutboundRouting(
  client: PoolClient,
  tenantId: string,
  customerId: string,
): Promise<WhatsAppRouting | null> {
  const phoneRes = await client.query<{ phone: string }>(
    `SELECT phone FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, customerId],
  );
  const phone = phoneRes.rows[0]?.phone?.trim();
  if (!phone) return null;

  const ti = await client.query<{ instance_name: string }>(
    `SELECT config->>'instance_name' AS instance_name
       FROM tenant_integrations
      WHERE tenant_id = $1 AND is_active = true
        AND provider IN ('whatsapp_evolution','evolution','whatsapp')
        AND config->>'instance_name' IS NOT NULL
      LIMIT 1`,
    [tenantId],
  );
  const instanceName = ti.rows[0]?.instance_name?.trim();
  if (!instanceName) return null;

  return { phone, instance_name: instanceName };
}
