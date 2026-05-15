import pg from 'pg';
import { env } from '../../config/env.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20 });

let integrationLookupPool: pg.Pool | null = null;

/**
 * Pool para resolver tenant_integrations antes de `app.tenant_id` existir (webhook inbound).
 * Usa `DATABASE_URL_ADMIN` quando definido (CI com RLS); senão o pool da aplicação.
 */
export function getIntegrationLookupPool(): pg.Pool {
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (adminUrl && adminUrl !== env.DATABASE_URL) {
    if (!integrationLookupPool) {
      integrationLookupPool = new pg.Pool({ connectionString: adminUrl, max: 5 });
    }
    return integrationLookupPool;
  }
  return pool;
}

export async function withTenant<T>(tenantId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
