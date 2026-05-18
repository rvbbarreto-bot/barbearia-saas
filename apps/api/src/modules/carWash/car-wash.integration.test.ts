/**
 * Integração: fluxos críticos lava-rápido (chegada, cancelamento, FSM, appointment+job).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { sampleBrazilianPlate } from '../vehicles/plate.js';

vi.mock('../commission/service.js', () => ({
  createCommissionEntryForCompletedAppointment: vi.fn(async () => undefined),
}));

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('car wash integration', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const tenantId = randomUUID();
  const attendantUserId = randomUUID();
  const caller = { sub: attendantUserId, role: 'attendant' as const };

  let customerId = '';
  let vehicleId = '';
  let professionalId = '';
  let serviceId = '';

  async function purge() {
    await withTenant(tenantId, async (c) => {
      await c.query(`DELETE FROM car_wash_checklists WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM car_wash_jobs WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM customer_vehicles WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM appointment_events WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM professional_services WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM business_hours WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM services WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
    });
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'LW','Lava','trial','active')`,
      [tenantId],
    );
    await withTenant(tenantId, async (c) => {
      await c.query(
        `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
         ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
        [
          tenantId,
          JSON.stringify({
            vertical: 'car_wash',
            car_wash: { require_vehicle: true, require_checklist_on_arrival: true, notify_when_ready: false },
          }),
        ],
      );
      await c.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
         VALUES ($1,$2,'Att',$3,'x','attendant'::user_role)`,
        [attendantUserId, tenantId, `${attendantUserId}@t.test`],
      );
    });

    professionalId = randomUUID();
    customerId = randomUUID();
    serviceId = randomUUID();
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'Box 1',$3,'America/Sao_Paulo',true)`,
          [professionalId, tenantId, `bx-${professionalId.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in)
           VALUES ($1,$2,'Cliente',$3,true)`,
          [customerId, tenantId, `5511${customerId.slice(0, 8)}`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'Lavagem',60,8000,true)`,
          [serviceId, tenantId],
        );
        await c.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3)`,
          [tenantId, professionalId, serviceId],
        );
        await c.query(
          `INSERT INTO business_hours (tenant_id, professional_id, weekday, starts_at, ends_at)
           VALUES ($1,$2,3,'08:00','20:00')`,
          [tenantId, professionalId],
        );
      });
    } finally {
      c.release();
    }

    const { createVehicle } = await import('../vehicles/service.js');
    const v = await createVehicle(
      tenantId,
      { customer_id: customerId, plate: sampleBrazilianPlate('LAV') },
      caller,
    );
    vehicleId = v.id as string;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await purge();
    await pool.end();
  });

  async function createCarWashAppointment(explicitConfirmation: boolean) {
    const { createAppointment } = await import('../appointments/service.js');
    return createAppointment(
      tenantId,
      {
        customer_id: customerId,
        professional_id: professionalId,
        service_id: serviceId,
        vehicle_id: vehicleId,
        starts_at: '2026-05-13T14:00:00.000Z',
        ends_at: '2026-05-13T15:00:00.000Z',
        idempotency_key: `idem-${randomUUID()}`,
        source: 'manual',
        explicit_confirmation: explicitConfirmation,
      },
      caller,
    );
  }

  it('cria appointment + job em transação', async () => {
    const appt = await createCarWashAppointment(false);
    const r = await pool.query(
      `SELECT stage FROM car_wash_jobs WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, appt.id],
    );
    expect(r.rows[0]?.stage).toBe('scheduled');
  });

  it('bloqueia chegada se appointment awaiting_confirmation', async () => {
    const { applyCarWashJobAction, createCarWashChecklist } = await import('./service.js');
    const appt = await createCarWashAppointment(true);
    const jobR = await pool.query(
      `SELECT id FROM car_wash_jobs WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, appt.id],
    );
    const jobId = jobR.rows[0].id as string;
    await createCarWashChecklist(
      tenantId,
      jobId,
      {
        checklist_type: 'arrival',
        items: {
          body_scratches: false,
          fuel_level: '1/2',
          wheel_damage: false,
          interior_objects: 'Nenhum',
        },
      },
      caller,
    );
    await expect(applyCarWashJobAction(tenantId, jobId, 'arrive', caller)).rejects.toMatchObject({
      code: 'APPOINTMENT_NOT_CONFIRMED',
    });
  });

  it('cancelamento do job cancela appointment e libera slot', async () => {
    const { applyCarWashJobAction } = await import('./service.js');
    const appt = await createCarWashAppointment(false);
    const jobR = await pool.query(
      `SELECT id FROM car_wash_jobs WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, appt.id],
    );
    const jobId = jobR.rows[0].id as string;
    await applyCarWashJobAction(tenantId, jobId, 'cancel', caller);
    const apptAfter = await pool.query(`SELECT status FROM appointments WHERE id = $1`, [appt.id]);
    expect(apptAfter.rows[0].status).toBe('cancelled');
    const jobAfter = await pool.query(`SELECT stage FROM car_wash_jobs WHERE id = $1`, [jobId]);
    expect(jobAfter.rows[0].stage).toBe('cancelled');
  });

  it('impede transição inválida scheduled → ready', async () => {
    const { applyCarWashJobAction } = await import('./service.js');
    const appt = await createCarWashAppointment(false);
    const jobR = await pool.query(
      `SELECT id FROM car_wash_jobs WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, appt.id],
    );
    await expect(
      applyCarWashJobAction(tenantId, jobR.rows[0].id as string, 'ready', caller),
    ).rejects.toMatchObject({ code: 'INVALID_CAR_WASH_STAGE_TRANSITION' });
  });
});
