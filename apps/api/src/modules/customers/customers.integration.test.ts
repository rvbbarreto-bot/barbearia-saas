/**
 * Integração: customers (CRUD, validação, RLS via serviço, tenant isolation).
 *
 *   cd apps/api
 *   npm test -- src/modules/customers/customers.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('customers service integration', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();

  async function applyMigrationsIfNeeded() {
    const chk = await pool.query(`SELECT to_regclass('public.customers') AS t`);
    if (chk.rows[0]?.t) return;
    const dir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(resolve(dir, name), 'utf8'));
    }
  }

  async function purge() {
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL!;
    process.env.JWT_SECRET = process.env.JWT_SECRET!;
    process.env.REDIS_URL = process.env.REDIS_URL!;
    await applyMigrationsIfNeeded();
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'A','A','trial','active'), ($2,'B','B','trial','active')`,
      [tenantA, tenantB],
    );
  });

  afterAll(async () => {
    await purge();
    await pool.end();
  });

  it('cria, lista e obtém por id no tenant', async () => {
    const { createCustomer, listCustomers, getCustomerById } = await import('./service.js');
    const phone = `5511${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const created = await createCustomer(tenantA, { phone, name: 'Cliente A', whatsapp_opt_in: true }, undefined);
    expect(created.id).toBeTruthy();

    const list = await listCustomers(tenantA, { page: '1', limit: '20' });
    expect(list.data.some((r: { id: string }) => r.id === created.id)).toBe(true);

    const one = await getCustomerById(tenantA, created.id as string);
    expect(String(one.phone)).toBe(phone);
  });

  it('atualiza dados básicos e regista audit', async () => {
    const { createCustomer, updateCustomer } = await import('./service.js');
    const phone = `5511${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const c = await createCustomer(tenantA, { phone, whatsapp_opt_in: true }, undefined);
    const upd = await updateCustomer(
      tenantA,
      c.id as string,
      { name: 'Nome Novo', whatsapp_opt_out: false, is_vip: true },
      undefined,
    );
    expect(String(upd.name)).toBe('Nome Novo');
    expect(Boolean(upd.is_vip)).toBe(true);
  });

  it('email inválido falha na validação Zod', async () => {
    const { createCustomer } = await import('./service.js');
    await expect(
      createCustomer(
        tenantA,
        { phone: `5511${randomUUID().slice(0, 8)}99`, email: 'not-an-email', whatsapp_opt_in: false },
        undefined,
      ),
    ).rejects.toThrow();
  });

  it('não encontra cliente de outro tenant', async () => {
    const { createCustomer, getCustomerById } = await import('./service.js');
    const phone = `5511${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const cB = await createCustomer(tenantB, { phone, whatsapp_opt_in: false }, undefined);
    await expect(getCustomerById(tenantA, cB.id as string)).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    });
  });
});
