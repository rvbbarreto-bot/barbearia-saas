/**
 * Recall: candidatos (GET service), envio (POST service), consentimento, opt-out, idempotência.
 *
 * Requer Postgres + Redis + migrations. Executar via:
 *   pwsh -File ../../scripts/run-api-integration-local.ps1
 * ou:
 *   cd apps/api && DATABASE_URL=... REDIS_URL=... JWT_SECRET=... npm test -- src/modules/recall/recall.integration.test.ts
 *
 * Um único `it` garante ordem estável (Vitest pode executar vários `it` em paralelo no mesmo ficheiro).
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('recall integration (candidates, send, consent, outbox)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantId = randomUUID();
  const customerId = randomUUID();
  const professionalId = randomUUID();
  const serviceId = randomUUID();
  const appointmentId = randomUUID();
  const templateId = randomUUID();

  async function applyMigrationsIfNeeded() {
    const chk = await pool.query(`SELECT to_regclass('public.recall_sends') AS t`);
    if (chk.rows[0]?.t) return;
    const dir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(resolve(dir, name), 'utf8'));
    }
  }

  async function purge() {
    await pool.query(`DELETE FROM message_outbox WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM recall_sends WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM notification_templates WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM consents WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM professional_services WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM services WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM tenant_integrations WHERE tenant_id = $1::uuid`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1::uuid`, [tenantId]);
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-06T12:00:00.000Z'));

    process.env.DATABASE_URL = process.env.DATABASE_URL!;
    process.env.JWT_SECRET = process.env.JWT_SECRET!;
    process.env.REDIS_URL = process.env.REDIS_URL!;

    await applyMigrationsIfNeeded();
    await purge();

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'Recall Co','Recall Shop','trial','active')`,
      [tenantId],
    );

    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        await c.query(
          `INSERT INTO tenant_integrations (tenant_id, provider, config, is_active)
           VALUES ($1,'whatsapp_evolution', '{"instance_name":"dev-test-instance"}'::jsonb, true)`,
          [tenantId],
        );

        await c.query(
          `INSERT INTO customers (id, tenant_id, phone, name, whatsapp_opt_in, whatsapp_opt_out)
           VALUES ($1,$2,'5511999990001','Cliente Recall', true, false)`,
          [customerId, tenantId],
        );

        await c.query(
          `INSERT INTO consents (tenant_id, customer_id, channel, purpose, granted)
           VALUES ($1,$2,'whatsapp','recall', true)`,
          [tenantId, customerId],
        );

        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'Barbeiro','barb-1','America/Sao_Paulo', true)`,
          [professionalId, tenantId],
        );

        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active, recall_kind)
           VALUES ($1,$2,'Corte',30,5000,true,'corte')`,
          [serviceId, tenantId],
        );

        await c.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3)`,
          [tenantId, professionalId, serviceId],
        );

        const starts = new Date('2026-04-10T12:00:00.000Z');
        const ends = new Date('2026-04-10T12:30:00.000Z');
        await c.query(
          `INSERT INTO appointments (id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at, status, source, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'completed','whatsapp',$8)`,
          [
            appointmentId,
            tenantId,
            customerId,
            professionalId,
            serviceId,
            starts,
            ends,
            `idem-${randomUUID()}`,
          ],
        );

        await c.query(
          `INSERT INTO notification_templates (id, tenant_id, template_key, channel, body_template, approval_status, active)
           VALUES ($1,$2,'recall_promotional_corte','whatsapp','Olá {{customer_name}}, {{service_name}} na {{trade_name}}.', 'approved', true)`,
          [templateId, tenantId],
        );
      });
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    vi.useRealTimers();
    await purge();
    await pool.end();
  });

  it('fluxo: candidatos, opt-out, gate 403, mismatch, envio+outbox+idempotência, exclusão da lista', async () => {
    const { listRecallCandidatesForApi } = await import('./candidates.service.js');
    const { requestRecallPromotionalSend } = await import('./send.service.js');

    const page = await listRecallCandidatesForApi(tenantId, { limit: '5', offset: '0', only_sendable: 'false' });
    expect(page.total).toBeGreaterThanOrEqual(1);
    const hit0 = page.candidates.find((c) => c.source_appointment_id === appointmentId);
    expect(hit0).toBeTruthy();
    expect(hit0?.customer_id).toBe(customerId);
    expect(hit0?.can_send_promotional).toBe(true);

    const p2 = await listRecallCandidatesForApi(tenantId, { limit: '1', offset: '0', only_sendable: 'false' });
    expect(p2.candidates.length).toBeLessThanOrEqual(1);
    expect(p2.limit).toBe(1);

    {
      const cx = await pool.connect();
      try {
        await withAppTenant(cx, tenantId, async () => {
          await cx.query(`UPDATE customers SET whatsapp_opt_out = true WHERE id = $1`, [customerId]);
        });
      } finally {
        cx.release();
      }
    }
    const pageOpt = await listRecallCandidatesForApi(tenantId, { only_sendable: 'true' });
    expect(pageOpt.candidates.find((c) => c.source_appointment_id === appointmentId)).toBeUndefined();
    const allOpt = await listRecallCandidatesForApi(tenantId, { only_sendable: 'false' });
    const rowOpt = allOpt.candidates.find((c) => c.source_appointment_id === appointmentId);
    expect(rowOpt?.can_send_promotional).toBe(false);
    expect(rowOpt?.blockers).toContain('recall_opt_out');
    {
      const cx = await pool.connect();
      try {
        await withAppTenant(cx, tenantId, async () => {
          await cx.query(`UPDATE customers SET whatsapp_opt_out = false WHERE id = $1`, [customerId]);
        });
      } finally {
        cx.release();
      }
    }

    vi.stubEnv('RECALL_ENABLED', 'false');
    await expect(
      requestRecallPromotionalSend(
        tenantId,
        { source_appointment_id: appointmentId, customer_id: customerId, service_id: serviceId },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'RECALL_DISABLED', statusCode: 403 });
    vi.unstubAllEnvs();

    vi.stubEnv('RECALL_ENABLED', 'true');
    await expect(
      requestRecallPromotionalSend(
        tenantId,
        { source_appointment_id: appointmentId, customer_id: randomUUID(), service_id: serviceId },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'RECALL_CUSTOMER_MISMATCH' });

    const body = {
      source_appointment_id: appointmentId,
      customer_id: customerId,
      service_id: serviceId,
    };
    const first = await requestRecallPromotionalSend(tenantId, body, undefined);
    expect(first.result).toBe('sent');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const ob = await client.query(
        `SELECT id, status FROM message_outbox
          WHERE tenant_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [tenantId, `recall_promo:${appointmentId}`],
      );
      expect(ob.rowCount).toBe(1);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const second = await requestRecallPromotionalSend(tenantId, body, undefined);
    expect(second.result).toBe('skip');
    expect(second.reason).toBe('SKIP_ALREADY_LOGGED');

    const pageEnd = await listRecallCandidatesForApi(tenantId, { only_sendable: 'false' });
    expect(pageEnd.candidates.some((c) => c.source_appointment_id === appointmentId)).toBe(false);

    vi.unstubAllEnvs();
  });
});
