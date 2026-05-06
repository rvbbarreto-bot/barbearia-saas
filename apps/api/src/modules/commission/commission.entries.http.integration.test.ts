/**
 * RBAC HTTP + contrato paginado para GET /commission/entries (DEV/QA-07.1).
 * Requer DATABASE_URL, JWT_SECRET, REDIS_URL e migrations 021.
 */
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { commissionRoutes } from './routes.js';

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

function assertPaginatedCommissionEntriesBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('body inválido');
  const o = body as Record<string, unknown>;
  expect(Array.isArray(o.data)).toBe(true);
  expect(typeof o.total).toBe('number');
  expect(typeof o.page).toBe('number');
  expect(typeof o.limit).toBe('number');
}

describe.skipIf(!run)('commission GET /entries HTTP RBAC + contrato', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 2,
  });
  const tenantA = randomUUID();
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
    await app.register(commissionRoutes, { prefix: '/api/v1' });
    await app.ready();
    return app;
  })();

  beforeAll(async () => {
    const chk = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commission_entries' LIMIT 1`,
    );
    if (!chk.rowCount) {
      await pool.end();
      throw new Error('Aplique 021_commission_and_daily_closing.sql antes destes testes.');
    }
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'CX HTTP','CX HTTP','trial','active',$2)`,
      [tenantA, `cx-http-${tenantA.slice(0, 8)}`],
    );
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantA]);
    await pool.end();
  });

  it('attendant recebe 403 em GET /commission/entries', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'attendant',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commission/entries?page=1&limit=5',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(403);
  });

  it('professional recebe 403', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'professional',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commission/entries',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(403);
  });

  it('manager recebe 200 e corpo paginado { data, total, page, limit }', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'manager',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commission/entries?page=1&limit=10',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(200);
    assertPaginatedCommissionEntriesBody(res.json());
  });

  it('tenant_admin recebe 200 e contrato paginado', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'tenant_admin',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commission/entries',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(200);
    assertPaginatedCommissionEntriesBody(res.json());
  });

  it('tenant_owner recebe 200', async () => {
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: randomUUID(),
      tenant_id: tenantA,
      role: 'tenant_owner',
      jti: `jti-${randomUUID()}`,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/commission/entries',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantA },
    });
    expect(res.statusCode).toBe(200);
    assertPaginatedCommissionEntriesBody(res.json());
  });
});
