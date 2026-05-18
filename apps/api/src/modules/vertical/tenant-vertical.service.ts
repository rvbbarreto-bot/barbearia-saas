import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { parseTenantVerticalFromSettings } from './settings.js';
import type { TenantVerticalContext } from './types.js';

export async function loadTenantVerticalContext(
  tenantId: string,
  client?: PoolClient,
): Promise<TenantVerticalContext> {
  if (client) {
    return loadTenantVerticalContextWithClient(client, tenantId);
  }
  return withTenant(tenantId, (c) => loadTenantVerticalContextWithClient(c, tenantId));
}

export async function loadTenantVerticalContextWithClient(
  client: PoolClient,
  tenantId: string,
): Promise<TenantVerticalContext> {
  const r = await client.query(`SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`, [
    tenantId,
  ]);
  if (!r.rowCount) {
    return parseTenantVerticalFromSettings({ vertical: 'barbershop' });
  }
  return parseTenantVerticalFromSettings(r.rows[0].settings);
}
