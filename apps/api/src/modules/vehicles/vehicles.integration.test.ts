/**
 * Integração: vehicles + RLS + placa duplicada.
 *   cd apps/api && npm test -- src/modules/vehicles/vehicles.integration.test.ts
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

describe.skipIf(!run)('vehicles integration', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let customerA = '';

  async function applyMigrationsIfNeeded() {
    const chk = await pool.query(`SELECT to_regclass('public.customer_vehicles') AS t`);
    if (chk.rows[0]?.t) return;
    const dir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(resolve(dir, name), 'utf8'));
    }
  }

  async function purge() {
    await pool.query(`DELETE FROM car_wash_checklists WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM car_wash_jobs WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM customer_vehicles WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }

  beforeAll(async () => {
    await applyMigrationsIfNeeded();
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'A','A','trial','active'), ($2,'B','B','trial','active')`,
      [tenantA, tenantB],
    );
    const { createCustomer } = await import('../customers/service.js');
    const c = await createCustomer(tenantA, { phone: `5511${randomUUID().slice(0, 8)}`, whatsapp_opt_in: false });
    customerA = c.id as string;
  });

  afterAll(async () => {
    await purge();
    await pool.end();
  });

  it('CRUD veículo e bloqueia placa duplicada no tenant', async () => {
    const { createVehicle } = await import('./service.js');
    const plate = `ABC${randomUUID().slice(0, 4).replace(/-/g, '').toUpperCase()}23`.slice(0, 7);
    const v1 = await createVehicle(tenantA, { customer_id: customerA, plate, brand: 'Fiat' });
    expect(v1.id).toBeTruthy();
    await expect(
      createVehicle(tenantA, { customer_id: customerA, plate, brand: 'Outro' }),
    ).rejects.toMatchObject({ code: 'VEHICLE_PLATE_ALREADY_EXISTS' });
  });

  it('impede leitura cross-tenant via serviço', async () => {
    const { createVehicle, getVehicleById } = await import('./service.js');
    const { createCustomer } = await import('../customers/service.js');
    const cB = await createCustomer(tenantB, { phone: `5511${randomUUID().slice(0, 8)}`, whatsapp_opt_in: false });
    const plate = `XYZ${randomUUID().slice(0, 4).replace(/-/g, '').toUpperCase()}99`.slice(0, 7);
    const vB = await createVehicle(tenantB, { customer_id: cB.id as string, plate });
    await expect(getVehicleById(tenantA, vB.id as string)).rejects.toMatchObject({
      code: 'VEHICLE_NOT_FOUND',
    });
  });
});
