import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { sqlAppointmentSlotBlockingStatusesIn } from '../../shared/appointment-status.js';
import { buildSlots, TimeRange } from './slots.js';

const querySchema = z.object({
  professional_id: z.string().uuid(),
  service_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  min_advance_minutes: z.coerce.number().min(0).default(30),
  max_slots: z.coerce.number().min(1).max(50).default(30),
});

export type AvailabilityQuery = z.infer<typeof querySchema>;

export async function getAvailability(tenantId: string, rawQuery: unknown) {
  const query = querySchema.parse(rawQuery);

  return withTenant(tenantId, async (client) => {
    // Profissional + timezone
    const timezoneResult = await client.query(
      `SELECT COALESCE(p.timezone, t.timezone, 'UTC') AS timezone
         FROM professionals p
         JOIN tenants t ON t.id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.id = $2 AND p.active = true
        LIMIT 1`,
      [tenantId, query.professional_id],
    );
    if (!timezoneResult.rowCount) {
      throw new AppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado', 404);
    }
    const timezone = String(timezoneResult.rows[0].timezone);

    // Serviço — deve estar ativo e ser executado pelo profissional
    const serviceResult = await client.query(
      `SELECT s.id, s.duration_minutes,
              COALESCE(s.buffer_before_minutes, 0)::int AS buffer_before_minutes,
              COALESCE(s.buffer_after_minutes, 0)::int AS buffer_after_minutes
         FROM services s
         JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = $2
        WHERE s.tenant_id = $1 AND s.id = $3 AND s.active = true
        LIMIT 1`,
      [tenantId, query.professional_id, query.service_id],
    );
    if (!serviceResult.rowCount) {
      throw new AppError(
        'SERVICE_NOT_BOOKABLE',
        'Serviço indisponível, inativo ou não habilitado para este profissional.',
        404,
      );
    }
    const svcRow = serviceResult.rows[0] as {
      duration_minutes: number | string;
      buffer_before_minutes: number;
      buffer_after_minutes: number;
    };
    const durationMinutes = Number(svcRow.duration_minutes);
    const bufferBefore = Number(svcRow.buffer_before_minutes);
    const bufferAfter = Number(svcRow.buffer_after_minutes);

    // Horário comercial do dia
    const businessHoursResult = await client.query(
      `SELECT starts_at, ends_at, slot_interval_minutes
         FROM business_hours
        WHERE tenant_id = $1
          AND professional_id = $2
          AND weekday = EXTRACT(DOW FROM $3::date)
          AND active = true
        ORDER BY starts_at ASC`,
      [tenantId, query.professional_id, query.date],
    );
    if (!businessHoursResult.rowCount) {
      return { date: query.date, timezone, slots: [] as Array<{ starts_at: string; ends_at: string }> };
    }

    // Limites do dia em UTC
    const dayBoundariesResult = await client.query(
      `SELECT ($1::date AT TIME ZONE $2) AS start_of_day_utc,
              (($1::date + interval '1 day') AT TIME ZONE $2) AS end_of_day_utc`,
      [query.date, timezone],
    );
    const dayStartUtc = new Date(dayBoundariesResult.rows[0].start_of_day_utc);
    const dayEndUtc = new Date(dayBoundariesResult.rows[0].end_of_day_utc);

    // Agendamentos bloqueadores (confirmed, completed, offered não expirado)
    const blockedResult = await client.query(
      `SELECT a.starts_at, a.ends_at,
              COALESCE(s.buffer_before_minutes, 0)::int AS buffer_before_minutes,
              COALESCE(s.buffer_after_minutes, 0)::int AS buffer_after_minutes
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
        WHERE a.tenant_id = $1
          AND a.professional_id = $2
          AND a.status IN (${sqlAppointmentSlotBlockingStatusesIn()})
          AND a.starts_at < $4::timestamptz
          AND a.ends_at > $3::timestamptz`,
      [tenantId, query.professional_id, dayStartUtc.toISOString(), dayEndUtc.toISOString()],
    );

    // Folgas pontuais
    const timeOffResult = await client.query(
      `SELECT starts_at, ends_at
         FROM professional_time_off
        WHERE tenant_id = $1
          AND professional_id = $2
          AND active = true
          AND starts_at < $4::timestamptz
          AND ends_at > $3::timestamptz`,
      [tenantId, query.professional_id, dayStartUtc.toISOString(), dayEndUtc.toISOString()],
    );

    // Folgas recorrentes semanais
    const recurringTimeOffResult = await client.query(
      `SELECT (($2::date + starts_at::time) AT TIME ZONE $4) AS starts_at_utc,
              (($2::date + ends_at::time) AT TIME ZONE $4) AS ends_at_utc
         FROM professional_recurring_time_off
        WHERE tenant_id = $1
          AND professional_id = $3
          AND weekday = EXTRACT(DOW FROM $2::date)
          AND active = true
          AND (valid_from IS NULL OR valid_from <= $2::date)
          AND (valid_until IS NULL OR valid_until >= $2::date)`,
      [tenantId, query.date, query.professional_id, timezone],
    );

    // Bloqueios de calendar_blocks (profissional específico e tenant geral)
    const calendarBlocksResult = await client.query(
      `SELECT starts_at, ends_at
         FROM calendar_blocks
        WHERE tenant_id = $1
          AND (professional_id IS NULL OR professional_id = $2)
          AND starts_at < $4::timestamptz
          AND ends_at > $3::timestamptz`,
      [tenantId, query.professional_id, dayStartUtc.toISOString(), dayEndUtc.toISOString()],
    );

    const activeHoldsResult = await client.query(
      `SELECT h.starts_at, h.ends_at,
              COALESCE(s.buffer_before_minutes, 0)::int AS buffer_before_minutes,
              COALESCE(s.buffer_after_minutes, 0)::int AS buffer_after_minutes
         FROM appointment_holds h
         LEFT JOIN services s ON s.id = h.service_id AND s.tenant_id = h.tenant_id
        WHERE h.tenant_id = $1
          AND h.professional_id = $2
          AND h.status = 'active'
          AND h.expires_at > now()
          AND h.starts_at < $4::timestamptz
          AND h.ends_at > $3::timestamptz`,
      [tenantId, query.professional_id, dayStartUtc.toISOString(), dayEndUtc.toISOString()],
    );

    const blockedRanges: TimeRange[] = [
      ...blockedResult.rows.map((r) => {
        const bbf = Number(r.buffer_before_minutes);
        const baf = Number(r.buffer_after_minutes);
        const s = new Date(r.starts_at).getTime();
        const e = new Date(r.ends_at).getTime();
        return {
          startsAt: new Date(s - bbf * 60 * 1000),
          endsAt: new Date(e + baf * 60 * 1000),
        };
      }),
      ...timeOffResult.rows.map((r) => ({ startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at) })),
      ...recurringTimeOffResult.rows.map((r) => ({
        startsAt: new Date(r.starts_at_utc),
        endsAt: new Date(r.ends_at_utc),
      })),
      ...calendarBlocksResult.rows.map((r) => ({
        startsAt: new Date(r.starts_at),
        endsAt: new Date(r.ends_at),
      })),
      ...activeHoldsResult.rows.map((r) => {
        const bbf = Number(r.buffer_before_minutes);
        const baf = Number(r.buffer_after_minutes);
        const s = new Date(r.starts_at).getTime();
        const e = new Date(r.ends_at).getTime();
        return {
          startsAt: new Date(s - bbf * 60 * 1000),
          endsAt: new Date(e + baf * 60 * 1000),
        };
      }),
    ];

    // Antecedência mínima (não permitir slots no passado)
    const minStartAt = new Date(Date.now() + query.min_advance_minutes * 60 * 1000);

    const windows = businessHoursResult.rows as Array<{
      starts_at: string;
      ends_at: string;
      slot_interval_minutes: number;
    }>;

    const windowBoundaries = await Promise.all(
      windows.map(async (window) => {
        const converted = await client.query(
          `SELECT (($1::date + $2::time) AT TIME ZONE $4) AS window_start_utc,
                  (($1::date + $3::time) AT TIME ZONE $4) AS window_end_utc`,
          [query.date, window.starts_at, window.ends_at, timezone],
        );
        return {
          dayStart: new Date(converted.rows[0].window_start_utc),
          dayEnd: new Date(converted.rows[0].window_end_utc),
          stepMinutes: Number(window.slot_interval_minutes) || 30,
        };
      }),
    );

    const allSlots = windowBoundaries.flatMap((window) => {
      if (window.dayEnd <= window.dayStart) {
        throw new AppError('INVALID_BUSINESS_HOURS', 'Janela de horário inválida', 400);
      }
      return buildSlots({
        dayStart: window.dayStart,
        dayEnd: window.dayEnd,
        durationMinutes,
        bufferBeforeMinutes: bufferBefore,
        bufferAfterMinutes: bufferAfter,
        stepMinutes: window.stepMinutes,
        blocked: blockedRanges,
      });
    });

    // Filtrar slots no passado (antecedência mínima)
    const futureSlots = allSlots.filter((s) => s.startsAt >= minStartAt);

    return {
      date: query.date,
      timezone,
      slots: futureSlots.slice(0, query.max_slots).map((slot) => ({
        starts_at: slot.startsAt.toISOString(),
        ends_at: slot.endsAt.toISOString(),
      })),
    };
  });
}
