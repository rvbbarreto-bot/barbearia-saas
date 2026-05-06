import type { PoolClient } from 'pg';

/**
 * Executa `fn` com `set_config('app.tenant_id', …)` (transação própria).
 * Necessário para INSERT/UPDATE com role `barbearia_app` sob RLS.
 */
export async function withAppTenant<T>(
  client: PoolClient,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const out = await fn();
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
