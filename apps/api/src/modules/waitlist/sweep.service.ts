import type { Pool, PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { pool } from '../../infra/db/pool.js';
import { withTenant } from '../../infra/db/pool.js';
import { getAvailability } from '../availability/service.js';
import { loadTenantTimeZone } from '../notificationJobs/schedule.js';
import { NotificationJobType } from '../notificationJobs/types.js';
import { blocksTransactionalReminders, loadCustomerConsentFlags } from '../notificationJobs/consent.js';

export type WaitlistSweepRunOptions = {
  /**
   * Apenas para testes de integração: ignora `WAITLIST_SWEEP_ENABLED` /
   * `WAITLIST_SLOT_NOTIFY_ENABLED` para validar a lógica sem alterar `.env` global.
   * Não usar em rotas HTTP nem em produção.
   */
  ignoreEnvGates?: boolean;
};

function ymd(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function* eachDateStrInclusive(fromStr: string, toStr: string): Generator<string> {
  const start = new Date(`${fromStr}T12:00:00.000Z`);
  const end = new Date(`${toStr}T12:00:00.000Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

async function enqueueSweepSlotNotification(
  client: PoolClient,
  tenantId: string,
  params: {
    entryId: string;
    customerId: string;
    slotStartsAt: string;
    slotEndsAt: string;
    professionalId: string;
    serviceId: string;
    tenantTz: string;
  },
): Promise<boolean> {
  const sweepKey = `${params.entryId}:${params.slotStartsAt}`;
  const dup = await client.query(
    `SELECT 1 FROM notification_jobs
      WHERE tenant_id = $1
        AND job_type = $2
        AND status = ANY(ARRAY['pending','processing','sent']::text[])
        AND payload->>'waitlist_entry_id' = $3
        AND payload->>'sweep_origin' = 'periodic'
        AND payload->>'sweep_slot_key' = $4
      LIMIT 1`,
    [tenantId, NotificationJobType.waitlistSlotAvailable, params.entryId, sweepKey],
  );
  if (dup.rowCount) return false;

  const payload = {
    waitlist_entry_id: params.entryId,
    source_appointment_id: `sweep:${sweepKey}`,
    freed_starts_at: params.slotStartsAt,
    freed_ends_at: params.slotEndsAt,
    professional_id: params.professionalId,
    service_id: params.serviceId,
    tenant_timezone: params.tenantTz,
    freed_reason: 'sweep',
    sweep_origin: 'periodic',
    sweep_slot_key: sweepKey,
  };

  await client.query(
    `INSERT INTO notification_jobs
       (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
     VALUES ($1, $2, now(), 'pending', $3::jsonb, NULL, $4)`,
    [tenantId, NotificationJobType.waitlistSlotAvailable, JSON.stringify(payload), params.customerId],
  );
  return true;
}

export async function runWaitlistSweepForTenant(
  tenantId: string,
  options?: WaitlistSweepRunOptions,
): Promise<{ scanned: number; enqueued: number }> {
  const gatesOk =
    (options?.ignoreEnvGates ? true : env.WAITLIST_SWEEP_ENABLED) &&
    (options?.ignoreEnvGates ? true : env.WAITLIST_SLOT_NOTIFY_ENABLED);
  if (!gatesOk) {
    return { scanned: 0, enqueued: 0 };
  }

  return withTenant(tenantId, async (client) => {
    const entries = await client.query(
      `SELECT *
         FROM waitlist_entries
        WHERE tenant_id = $1 AND status = 'active'
        ORDER BY created_at ASC
        LIMIT $2`,
      [tenantId, env.WAITLIST_SWEEP_BATCH_PER_TENANT],
    );

    const tz = await loadTenantTimeZone(client, tenantId);
    let enqueued = 0;

    for (const row of entries.rows) {
      const entry = row as {
        id: string;
        customer_id: string;
        service_id: string;
        professional_id: string | null;
        preferred_date_from: unknown;
        preferred_date_to: unknown;
      };

      const flags = await loadCustomerConsentFlags(client, tenantId, entry.customer_id);
      if (
        blocksTransactionalReminders(
          flags.whatsapp_opt_in,
          flags.whatsapp_opt_out,
          flags.latest.transactional,
        )
      ) {
        continue;
      }

      if (!entry.professional_id) {
        continue;
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const horizon = new Date(today);
      horizon.setUTCDate(horizon.getUTCDate() + env.WAITLIST_SWEEP_MAX_DAYS_AHEAD);

      const prefFrom = ymd(entry.preferred_date_from);
      const prefTo = ymd(entry.preferred_date_to);
      const todayStr = today.toISOString().slice(0, 10);
      const horizonStr = horizon.toISOString().slice(0, 10);

      const fromStr = prefFrom > todayStr ? prefFrom : todayStr;
      const toStr = prefTo < horizonStr ? prefTo : horizonStr;

      if (fromStr > toStr) continue;

      for (const dateStr of eachDateStrInclusive(fromStr, toStr)) {
        const av = await getAvailability(tenantId, {
          professional_id: entry.professional_id,
          service_id: entry.service_id,
          date: dateStr,
          min_advance_minutes: 0,
          max_slots: 50,
        });
        if (!av.slots?.length) continue;
        const slot = av.slots[0];
        const ok = await enqueueSweepSlotNotification(client, tenantId, {
          entryId: entry.id,
          customerId: entry.customer_id,
          slotStartsAt: slot.starts_at,
          slotEndsAt: slot.ends_at,
          professionalId: entry.professional_id,
          serviceId: entry.service_id,
          tenantTz: tz,
        });
        if (ok) enqueued += 1;
        break;
      }
    }

    return { scanned: entries.rows.length, enqueued };
  });
}

export async function runWaitlistSweepAllTenants(
  db: Pool = pool,
  options?: WaitlistSweepRunOptions,
): Promise<{ tenants: number; enqueued: number }> {
  const gatesOk =
    (options?.ignoreEnvGates ? true : env.WAITLIST_SWEEP_ENABLED) &&
    (options?.ignoreEnvGates ? true : env.WAITLIST_SLOT_NOTIFY_ENABLED);
  if (!gatesOk) {
    return { tenants: 0, enqueued: 0 };
  }

  const tenants = await db.query<{ id: string }>(
    `SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 200`,
  );
  let enqueued = 0;
  for (const t of tenants.rows) {
    const r = await runWaitlistSweepForTenant(t.id, options);
    enqueued += r.enqueued;
  }
  return { tenants: tenants.rows.length, enqueued };
}
