import { withTenant } from '../../infra/db/pool.js';
import { OPERATIONAL_SETTINGS_DEFAULTS, type OperationalSettings } from './settings.defaults.js';
import {
  partialOperationalSchema,
  pickOperationalFromSettingsJson,
} from './settings-merge.js';

export type { OperationalSettings } from './settings.defaults.js';
export { partialOperationalSchema, pickOperationalFromSettingsJson } from './settings-merge.js';

export async function getOperationalSettings(tenantId: string): Promise<OperationalSettings> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(`SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    if (!r.rowCount) return { ...OPERATIONAL_SETTINGS_DEFAULTS };
    return pickOperationalFromSettingsJson(r.rows[0].settings);
  });
}

export async function patchOperationalSettings(
  tenantId: string,
  body: unknown,
): Promise<OperationalSettings> {
  const patch = partialOperationalSchema.parse(body ?? {});
  return withTenant(tenantId, async (client) => {
    const cur = await client.query(`SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    const existingFull = cur.rowCount
      ? ((cur.rows[0].settings as Record<string, unknown>) ?? {})
      : {};
    const merged = { ...existingFull, ...patch };

    await client.query(
      `INSERT INTO tenant_settings (tenant_id, settings, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`,
      [tenantId, JSON.stringify(merged)],
    );

    return pickOperationalFromSettingsJson(merged);
  });
}
