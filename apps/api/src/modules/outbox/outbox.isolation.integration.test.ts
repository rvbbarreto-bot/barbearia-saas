/**
 * Isolamento cross-tenant: listagem outbox por tenant.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { listOutboxMessages } from './list-messages.service.js';
import { getOutboxMessageById } from './get-message.service.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('outbox tenant isolation', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 3,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let msgA: string;
  let msgB: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'IsoA','IsoA','trial','active',$3), ($2,'IsoB','IsoB','trial','active',$4)`,
      [tenantA, tenantB, `iso-a-${tenantA.slice(0, 8)}`, `iso-b-${tenantB.slice(0, 8)}`],
    );

    const insert = async (tid: string, marker: string) => {
      const client = await pool.connect();
      try {
        const r = await withAppTenant(client, tid, () =>
          client.query(
            `INSERT INTO message_outbox
               (tenant_id, channel, payload, metadata, status, attempts, max_attempts, correlation_id)
             VALUES ($1, 'whatsapp', '{"type":"text"}'::jsonb,
                     jsonb_build_object('phone','5511999990001','provider','evolution'),
                     'failed', 1, 5, $2)
             RETURNING id`,
            [tid, `corr-${marker}`],
          ),
        );
        return r.rows[0].id as string;
      } finally {
        client.release();
      }
    };

    msgA = await insert(tenantA, 'tenant-a');
    msgB = await insert(tenantB, 'tenant-b');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM message_outbox WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  it('list returns only rows from requested tenant', async () => {
    const listA = await listOutboxMessages(tenantA, { page: '1', limit: '50' });
    const listB = await listOutboxMessages(tenantB, { page: '1', limit: '50' });

    expect(listA.data.some((r) => r.id === msgA)).toBe(true);
    expect(listA.data.some((r) => r.id === msgB)).toBe(false);
    expect(listB.data.some((r) => r.id === msgB)).toBe(true);
    expect(listB.data.some((r) => r.id === msgA)).toBe(false);
  });

  it('get by id does not leak across tenants', async () => {
    await expect(getOutboxMessageById(tenantA, msgB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getOutboxMessageById(tenantB, msgA)).rejects.toMatchObject({ statusCode: 404 });
    const ok = await getOutboxMessageById(tenantA, msgA);
    expect(ok.id).toBe(msgA);
  });
});
