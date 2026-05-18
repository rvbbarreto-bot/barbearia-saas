import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeOperationalAuditEvent, effectiveCorrelationId } from '../../shared/operational-audit.js';
import { cancelAppointmentInDb, writeAppointmentEvent } from '../appointments/service.js';
import { ensureFinancialOnServiceCompleted } from '../finance/service.js';
import { createCommissionEntryForCompletedAppointment } from '../commission/service.js';
import { cancelAllPendingNotificationJobsForAppointment } from '../notificationJobs/schedule.js';
import { loadTenantVerticalContextWithClient } from '../vertical/tenant-vertical.service.js';
import { createChecklistSchema } from '../vehicles/schemas.js';
import {
  STAGE_ACTION_MAP,
  type CarWashStage,
  type CarWashStageAction,
  CarWashStageError,
  assertCarWashStageTransition,
} from './stages.js';
import { enqueueCarWashReadyNotification } from './messages.js';

export type CarWashCaller = {
  sub?: string;
  role?: string;
  requestId?: string;
  correlationId?: string;
};

/** Status de agenda que permitem marcar chegada no pátio. */
const APPOINTMENT_STATUSES_ALLOW_ARRIVE = new Set([
  'confirmed',
  'checked_in',
  'no_show_pending',
]);

const BOARD_STAGES: CarWashStage[] = [
  'scheduled',
  'arrived',
  'washing',
  'quality_check',
  'ready',
  'delivered',
];

export async function createCarWashJobInTransaction(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  vehicleId: string,
  caller?: CarWashCaller,
): Promise<Record<string, unknown>> {
  const r = await client.query(
    `INSERT INTO car_wash_jobs
       (tenant_id, appointment_id, vehicle_id, stage, created_by_user_id, updated_by_user_id, metadata)
     VALUES ($1,$2,$3,'scheduled',$4,$4,$5::jsonb)
     RETURNING *`,
    [
      tenantId,
      appointmentId,
      vehicleId,
      caller?.sub ?? null,
      JSON.stringify({ correlation_id: caller?.correlationId ?? null }),
    ],
  );
  const job = r.rows[0];
  await writeOperationalAuditEvent(client, {
    tenantId,
    entityType: 'car_wash_job',
    entityId: job.id as string,
    eventType: 'car_wash_job_created',
    actorUserId: caller?.sub ?? null,
    actorRole: caller?.role ?? null,
    requestId: caller?.requestId ?? null,
    correlationId: effectiveCorrelationId(caller?.correlationId, job.id as string),
    metadata: {
      appointment_id: appointmentId,
      vehicle_id: vehicleId,
      stage: 'scheduled',
    },
  });
  return job;
}

export async function listCarWashJobs(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const stage = rawQuery.stage as string | undefined;
  const date = rawQuery.date as string | undefined;
  const plate = rawQuery.plate as string | undefined;

  return withTenant(tenantId, async (client) => {
    const filters = ['j.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let i = 2;

    if (stage) {
      filters.push(`j.stage = $${i++}`);
      params.push(stage);
    } else {
      filters.push(`j.stage = ANY($${i++}::text[])`);
      params.push(BOARD_STAGES);
    }
    if (date) {
      filters.push(`(a.starts_at AT TIME ZONE COALESCE(t.timezone, 'America/Sao_Paulo'))::date = $${i++}::date`);
      params.push(date);
    }
    if (plate) {
      filters.push(`v.normalized_plate ILIKE $${i++}`);
      params.push(`%${plate.replace(/[\s-]/g, '').toUpperCase()}%`);
    }

    const where = filters.join(' AND ');
    const [data, count] = await Promise.all([
      client.query(
        `SELECT j.id, j.appointment_id, j.vehicle_id, j.stage, j.stage_changed_at,
                j.ready_notified_at, j.delivered_at, j.metadata, j.created_at,
                v.plate, v.brand, v.model, v.color, v.vehicle_type,
                c.id AS customer_id, c.name AS customer_name,
                s.name AS service_name, a.starts_at, a.ends_at, a.status AS appointment_status,
                p.id AS professional_id, p.name AS professional_name
           FROM car_wash_jobs j
           JOIN appointments a ON a.tenant_id = j.tenant_id AND a.id = j.appointment_id
           JOIN tenants t ON t.id = j.tenant_id
           JOIN customer_vehicles v ON v.tenant_id = j.tenant_id AND v.id = j.vehicle_id
           JOIN customers c ON c.tenant_id = a.tenant_id AND c.id = a.customer_id
           LEFT JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
           LEFT JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id
          WHERE ${where}
          ORDER BY j.stage_changed_at DESC
          LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
      ),
      client.query(
        `SELECT COUNT(*)::int AS total
           FROM car_wash_jobs j
           JOIN appointments a ON a.tenant_id = j.tenant_id AND a.id = j.appointment_id
           JOIN tenants t ON t.id = j.tenant_id
           JOIN customer_vehicles v ON v.tenant_id = j.tenant_id AND v.id = j.vehicle_id
          WHERE ${where}`,
        params,
      ),
    ]);
    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

async function loadJobForUpdate(
  client: PoolClient,
  tenantId: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  const r = await client.query(
    `SELECT j.*, a.status AS appointment_status, a.customer_id, a.id AS appointment_id
       FROM car_wash_jobs j
       JOIN appointments a ON a.tenant_id = j.tenant_id AND a.id = j.appointment_id
      WHERE j.tenant_id = $1 AND j.id = $2
      FOR UPDATE OF j, a`,
    [tenantId, jobId],
  );
  if (!r.rowCount) throw new AppError('CAR_WASH_JOB_NOT_FOUND', 'Job de lava-rápido não encontrado.', 404);
  return r.rows[0];
}

async function transitionJobStage(
  client: PoolClient,
  tenantId: string,
  jobId: string,
  action: CarWashStageAction,
  caller: CarWashCaller | undefined,
  auditEventType: string,
  extra?: (job: Record<string, unknown>) => Promise<void>,
): Promise<Record<string, unknown>> {
  const job = await loadJobForUpdate(client, tenantId, jobId);
  const current = job.stage as CarWashStage;
  const spec = STAGE_ACTION_MAP[action];
  if (!spec.from.includes(current)) {
    throw new AppError(
      'INVALID_CAR_WASH_STAGE_TRANSITION',
      `Ação '${action}' não permitida no estágio '${current}'.`,
      422,
    );
  }
  assertCarWashStageTransition(current, spec.to);

  if (action === 'arrive') {
    const apptStatus = String(job.appointment_status);
    if (!APPOINTMENT_STATUSES_ALLOW_ARRIVE.has(apptStatus)) {
      throw new AppError(
        'APPOINTMENT_NOT_CONFIRMED',
        `Chegada só permitida com agendamento confirmado (status atual: '${apptStatus}').`,
        422,
      );
    }
  }

  const vertical = await loadTenantVerticalContextWithClient(client, tenantId);
  if (action === 'arrive' && vertical.car_wash.require_checklist_on_arrival) {
    const chk = await client.query(
      `SELECT 1 FROM car_wash_checklists
        WHERE tenant_id = $1 AND job_id = $2 AND checklist_type = 'arrival' LIMIT 1`,
      [tenantId, jobId],
    );
    if (!chk.rowCount) {
      throw new AppError(
        'CHECKLIST_REQUIRED',
        'Checklist de entrada obrigatório antes de marcar chegada.',
        422,
      );
    }
  }

  const updated = await client.query(
    `UPDATE car_wash_jobs
        SET stage = $3,
            stage_changed_at = now(),
            updated_by_user_id = $4,
            updated_at = now(),
            delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [tenantId, jobId, spec.to, caller?.sub ?? null],
  );
  const row = updated.rows[0];

  await syncAppointmentForStage(client, tenantId, job, spec.to, caller);
  if (extra) await extra(row);

  const correlationId = effectiveCorrelationId(
    caller?.correlationId,
    jobId,
  );
  await writeOperationalAuditEvent(client, {
    tenantId,
    entityType: 'car_wash_job',
    entityId: jobId,
    eventType: auditEventType,
    actorUserId: caller?.sub ?? null,
    actorRole: caller?.role ?? null,
    requestId: caller?.requestId ?? null,
    correlationId,
    metadata: {
      appointment_id: job.appointment_id,
      previous_stage: current,
      stage: spec.to,
    },
  });

  return row;
}

async function syncAppointmentForStage(
  client: PoolClient,
  tenantId: string,
  job: Record<string, unknown>,
  stage: CarWashStage,
  caller?: CarWashCaller,
): Promise<void> {
  const appointmentId = job.appointment_id as string;
  const prevStatus = job.appointment_status as string;
  const actorUserId = caller?.sub ?? null;

  if (stage === 'arrived') {
    if (prevStatus === 'confirmed' || prevStatus === 'no_show_pending') {
      await client.query(
        `UPDATE appointments SET status = 'checked_in', updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, appointmentId],
      );
      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'CHECK_IN',
        actorUserId,
        payload: { source: 'car_wash_arrive', previous_status: prevStatus },
      });
    }
    return;
  }

  if (stage === 'washing') {
    if (prevStatus === 'checked_in') {
      await client.query(
        `UPDATE appointments SET status = 'in_service', updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, appointmentId],
      );
      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'SERVICE_STARTED',
        actorUserId,
        payload: { source: 'car_wash_start' },
      });
    }
    return;
  }

  if (stage === 'delivered') {
    if (prevStatus !== 'in_service' && prevStatus !== 'checked_in') {
      await client.query(
        `UPDATE appointments SET status = 'in_service', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('completed','cancelled')`,
        [tenantId, appointmentId],
      );
    }
    await client.query(
      `UPDATE appointments
          SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, appointmentId],
    );
    await ensureFinancialOnServiceCompleted(client, tenantId, appointmentId);
    await createCommissionEntryForCompletedAppointment(client, tenantId, appointmentId);
    await writeAppointmentEvent(client, {
      tenantId,
      appointmentId,
      eventType: 'COMPLETED',
      actorUserId,
      payload: { source: 'car_wash_deliver' },
    });
    await cancelAllPendingNotificationJobsForAppointment(client, tenantId, appointmentId);
    return;
  }

  if (stage === 'cancelled') {
    await cancelAppointmentInDb(
      client,
      tenantId,
      appointmentId,
      'Cancelado via pátio lava-rápido',
      caller,
    );
  }
}

export async function applyCarWashJobAction(
  tenantId: string,
  jobId: string,
  action: CarWashStageAction,
  caller?: CarWashCaller,
): Promise<Record<string, unknown>> {
  return withTenant(tenantId, async (client) => {
    try {
      return await transitionJobStage(client, tenantId, jobId, action, caller, auditTypeForAction(action), async (job) => {
        if (action === 'ready') {
          const vertical = await loadTenantVerticalContextWithClient(client, tenantId);
          if (!vertical.car_wash.notify_when_ready) return;
          const correlationId = effectiveCorrelationId(caller?.correlationId, jobId);
          const enq = await enqueueCarWashReadyNotification(
            client,
            tenantId,
            jobId,
            job.appointment_id as string,
            job.customer_id as string,
            correlationId,
          );
          if (enq.inserted) {
            await client.query(
              `UPDATE car_wash_jobs SET ready_notified_at = now(), updated_at = now()
                WHERE tenant_id = $1 AND id = $2`,
              [tenantId, jobId],
            );
          }
        }
      });
    } catch (e) {
      if (e instanceof CarWashStageError) {
        throw new AppError(e.code, e.message, e.statusCode);
      }
      throw e;
    }
  });
}

function auditTypeForAction(action: CarWashStageAction): string {
  const map: Record<CarWashStageAction, string> = {
    arrive: 'car_wash_arrived',
    start: 'car_wash_started',
    'quality-check': 'car_wash_quality_check',
    ready: 'car_wash_ready',
    deliver: 'car_wash_delivered',
    cancel: 'car_wash_cancelled',
  };
  return map[action];
}

export async function createCarWashChecklist(
  tenantId: string,
  jobId: string,
  input: unknown,
  caller?: CarWashCaller,
): Promise<Record<string, unknown>> {
  const data = createChecklistSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const job = await loadJobForUpdate(client, tenantId, jobId);
    let row;
    try {
      const ins = await client.query(
        `INSERT INTO car_wash_checklists
           (tenant_id, job_id, checklist_type, items, notes, created_by_user_id)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)
         RETURNING *`,
        [
          tenantId,
          jobId,
          data.checklist_type,
          JSON.stringify(data.items),
          data.notes ?? null,
          caller?.sub ?? null,
        ],
      );
      row = ins.rows[0];
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === '23505') {
        throw new AppError(
          'CHECKLIST_ALREADY_EXISTS',
          'Checklist deste tipo já registrado para o job.',
          409,
        );
      }
      throw e;
    }

    await writeOperationalAuditEvent(client, {
      tenantId,
      entityType: 'car_wash_job',
      entityId: jobId,
      eventType: 'car_wash_checklist_created',
      actorUserId: caller?.sub ?? null,
      actorRole: caller?.role ?? null,
      requestId: caller?.requestId ?? null,
      correlationId: effectiveCorrelationId(caller?.correlationId, row.id as string),
      metadata: {
        checklist_type: data.checklist_type,
        appointment_id: job.appointment_id,
      },
    });
    return row;
  });
}
