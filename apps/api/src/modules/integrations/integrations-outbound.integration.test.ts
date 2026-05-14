/**
 * Integração: POST outbound → message_outbox (sem Evolution), RBAC, idempotência, isolamento tenant.
 */
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { integrationsRoutes } from './routes.js';
import { enqueueIntegrationWhatsappText } from './outbound.service.js';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';

async function insertOutboxRows(pool: pg.Pool, tenantId: string, customerId: string) {
  const c = await pool.connect();
  try {
    await withAppTenant(c, tenantId, async () => {
      await c.query(
        `INSERT INTO message_outbox (tenant_id, channel, payload, status, customer_id)
         VALUES ($1,'whatsapp',$2::jsonb,'pending',$3),
                ($1,'whatsapp',$4::jsonb,'dead',$3)`,
        [tenantId, JSON.stringify({ type: 'text' }), customerId, JSON.stringify({})],
      );
    });
  } finally {
    c.release();
  }
}

const { revokedMock } = vi.hoisted(() => ({
  revokedMock: vi.fn(async () => false),
}));

vi.mock('../auth/session.js', () => ({
  isSessionRevoked: revokedMock,
}));

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('integrations outbound → outbox', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const customerA = randomUUID();

  async function purge() {
    await pool.query(`DELETE FROM message_outbox WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenant_integrations WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }

  beforeAll(async () => {
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'LA','TA','trial','active'), ($2,'LB','TB','trial','active')`,
      [tenantA, tenantB],
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CA','5511999887766',true,false)`,
          [customerA, tenantA],
        );
        await c.query(
          `INSERT INTO tenant_integrations (tenant_id, provider, config, is_active)
           VALUES ($1,'whatsapp_evolution', '{"instance_name":"dev-outbox"}'::jsonb, true)`,
          [tenantA],
        );
      });
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await purge();
    await pool.end();
  });

  it('enqueueIntegrationWhatsappText grava message_outbox pending', async () => {
    await enqueueIntegrationWhatsappText(
      tenantA,
      { customer_id: customerA, text: 'Olá teste outbox', idempotency_key: `idem-ob-${randomUUID().slice(0, 8)}` },
      undefined,
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        const r = await c.query(
          `SELECT status, payload->>'type' AS t, metadata->>'provider' AS p
             FROM message_outbox WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [tenantA],
        );
        expect(r.rowCount).toBe(1);
        expect(String(r.rows[0].status)).toBe('pending');
        expect(String(r.rows[0].t)).toBe('text');
        expect(String(r.rows[0].p)).toBe('evolution');
      });
    } finally {
      c.release();
    }
  });

  it('idempotência ON CONFLICT não duplica linhas', async () => {
    const key = `idem-stable-${randomUUID().slice(0, 8)}`;
    const r1 = await enqueueIntegrationWhatsappText(
      tenantA,
      { customer_id: customerA, text: 'dup', idempotency_key: key },
      undefined,
    );
    expect(r1).toEqual({ ok: true, duplicate: false });
    const r2 = await enqueueIntegrationWhatsappText(
      tenantA,
      { customer_id: customerA, text: 'dup2', idempotency_key: key },
      undefined,
    );
    expect(r2).toEqual({ ok: true, duplicate: true });
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        const r = await c.query(
          `SELECT count(*)::int AS n FROM message_outbox WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantA, key],
        );
        expect(r.rows[0].n).toBe(1);
      });
    } finally {
      c.release();
    }
  });

  it('INTEGRATION_NO_ROUTING sem integração ativa', async () => {
    const cust = randomUUID();
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantB, async () => {
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CB','5511999776655',true,false)`,
          [cust, tenantB],
        );
      });
    } finally {
      c.release();
    }
    await expect(
      enqueueIntegrationWhatsappText(
        tenantB,
        { customer_id: cust, text: 'x', idempotency_key: `idem-noroute-${randomUUID().slice(0, 8)}` },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'INTEGRATION_NO_ROUTING' });
  });

  it('outbox do tenant A não visível sob contexto B', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantB, async () => {
        const r = await c.query(`SELECT count(*)::int AS n FROM message_outbox WHERE tenant_id = $1`, [tenantA]);
        expect(r.rows[0].n).toBe(0);
      });
    } finally {
      c.release();
    }
  });
});

describe.skipIf(!run)('integrations outbound HTTP RBAC', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 2,
  });
  const tenantA = randomUUID();
  const customerA = randomUUID();
  const jwtSecret = process.env.JWT_SECRET!;

  const appPromise = (async () => {
    const app = Fastify();
    await app.register(jwt, { secret: jwtSecret });
    app.addHook('preHandler', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }
      await tenantMiddleware(request, reply);
    });
    await app.register(integrationsRoutes, { prefix: '/api/v1' });
    await app.ready();
    return app;
  })();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'HTTP','HTTP','trial','active')`,
      [tenantA],
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CH','5511888776655',true,false)`,
          [customerA, tenantA],
        );
        await c.query(
          `INSERT INTO tenant_integrations (tenant_id, provider, config, is_active)
           VALUES ($1,'whatsapp_evolution', '{"instance_name":"dev-http"}'::jsonb, true)`,
          [tenantA],
        );
      });
    } finally {
      c.release();
    }
    await insertOutboxRows(pool, tenantA, customerA);
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
    await pool.query(`DELETE FROM message_outbox WHERE tenant_id = $1`, [tenantA]);
    await pool.query(`DELETE FROM tenant_integrations WHERE tenant_id = $1`, [tenantA]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantA]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantA]);
    await pool.end();
  });

  it('viewer recebe 403', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'viewer',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/outbound/whatsapp-text',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
      payload: {
        customer_id: customerA,
        text: 'não deve passar',
        idempotency_key: `idem-http1-${randomUUID().slice(0, 8)}`,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('attendant recebe 202', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      tenant_id: tenantA,
      role: 'attendant',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/outbound/whatsapp-text',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
      payload: {
        customer_id: customerA,
        text: 'fila outbox',
        idempotency_key: `idem-http2-${randomUUID().slice(0, 8)}`,
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, duplicate: false });
  });

  it('segundo POST com mesma idempotency_key retorna 200 idempotente', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      tenant_id: tenantA,
      role: 'attendant',
      jti: `jti-${randomUUID()}`,
    });
    const key = `idem-http-dup-${randomUUID().slice(0, 8)}`;
    const payload = {
      customer_id: customerA,
      text: 'dup row',
      idempotency_key: key,
    };
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/outbound/whatsapp-text',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
      payload,
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/outbound/whatsapp-text',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
      payload: { ...payload, text: 'ignored body' },
    });
    expect(res1.statusCode).toBe(202);
    expect(res1.json()).toEqual({ ok: true, duplicate: false });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ ok: true, duplicate: true });
  });
  it('attendant recebe 403 em GET outbox-summary', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      tenant_id: tenantA,
      role: 'attendant',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/outbound/outbox-summary',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(403);
  });

  it('manager obtém resumo outbox', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'manager',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/outbound/outbox-summary',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pending: number; dead: number };
    expect(body.dead).toBeGreaterThanOrEqual(1);
    expect(body.pending).toBeGreaterThanOrEqual(1);
  });
});
