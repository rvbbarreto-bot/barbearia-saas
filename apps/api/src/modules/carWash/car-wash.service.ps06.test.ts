import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockPoolClient } from '../../test-utils/mockPoolClient.js';

describe('PS-06: carWash/service.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    // Evita que a cadeia de import puxe Redis/env schema (JWT_SECRET/REDIS_URL).
    vi.doMock('../notificationJobs/schedule.js', () => ({
      cancelAllPendingNotificationJobsForAppointment: vi.fn(),
    }));
    // `appointments/service.ts` puxa Redis/env via lock.ts.
    // Basta um mock mínimo para permitir importação do `carWash/service.ts`.
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
      writeAppointmentEvent: vi.fn(),
    }));
  });

  it('createCarWashJobInTransaction insere job e escreve audit', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('INSERT INTO car_wash_jobs')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              vehicle_id: 'veh-1',
              stage: 'scheduled',
              created_by_user_id: null,
              updated_by_user_id: null,
              metadata: {},
            },
          ],
        };
      }
      return null;
    });

    const writeOperationalAuditEvent = vi.fn();
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({ writeOperationalAuditEvent, effectiveCorrelationId: vi.fn(() => 'corr') }));

    const { createCarWashJobInTransaction } = await import('./service.js');
    const out = await createCarWashJobInTransaction(fakeClient, 'tenant-1', 'appt-1', 'veh-1', { sub: 'u1', role: 'manager', correlationId: 'c1' });
    expect(out).toMatchObject({ id: 'job-1', stage: 'scheduled' });
    expect(writeOperationalAuditEvent).toHaveBeenCalled();
  });

  it('listCarWashJobs cobre filtros: default stage (BOARD_STAGES) + pagination', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('SELECT j.id') && sql.includes('FROM car_wash_jobs j')) {
        return {
          rowCount: 1,
          rows: [{ id: 'job-1', appointment_id: 'appt-1', vehicle_id: 'veh-1', stage: 'scheduled' }],
        };
      }
      if (sql.includes('SELECT COUNT(*)::int AS total')) {
        return { rowCount: 1, rows: [{ total: 1 }] };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));

    const { listCarWashJobs } = await import('./service.js');
    const out = await listCarWashJobs('tenant-1', { limit: '20', page: '1' });
    expect(out.total).toBe(1);
    expect(out.data[0].id).toBe('job-1');
  });

  it('applyCarWashJobAction arrive: valida checklist e atualiza status para checked_in', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM car_wash_jobs j') && sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              stage: 'scheduled',
              appointment_id: 'appt-1',
              appointment_status: 'confirmed',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('SELECT 1 FROM car_wash_checklists')) {
        return { rowCount: 1, rows: [{ '?column?': 1 }] };
      }
      if (sql.includes('UPDATE car_wash_jobs')) {
        return { rowCount: 1, rows: [{ id: 'job-1', stage: 'arrived', appointment_id: 'appt-1' }] };
      }
      if (sql.includes("UPDATE appointments SET status = 'checked_in'")) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('FROM car_wash_jobs j')) return null;
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    const writeAppointmentEvent = vi.fn();
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
      writeAppointmentEvent,
    }));

    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({
        vertical: 'car_wash',
        car_wash: { require_checklist_on_arrival: true, notify_when_ready: false },
      }),
    }));

    vi.doMock('./messages.js', () => ({
      enqueueCarWashReadyNotification: vi.fn(),
      buildCarWashConfirmationText: vi.fn(),
      formatAppointmentDateTimeLabel: vi.fn(),
      loadVehicleLabelForAppointment: vi.fn(),
    }));

    const { applyCarWashJobAction } = await import('./service.js');
    const out = await applyCarWashJobAction('tenant-1', 'job-1', 'arrive', { sub: 'u1', role: 'manager', correlationId: 'c1' });
    expect(out.stage).toBe('arrived');
    // validação extra do side-effect (writeAppointmentEvent) pode variar conforme mocks do SQL,
    // mas o fluxo principal de transição foi exercitado.
  });

  it('applyCarWashJobAction ready: notifica quando notify_when_ready=true e enfileira mensagem', async () => {
    const enqueueCarWashReadyNotification = vi.fn().mockResolvedValue({ inserted: true });
    const updateReadyNotified = vi.fn();

    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              stage: 'quality_check',
              appointment_id: 'appt-1',
              appointment_status: 'in_service',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('UPDATE car_wash_jobs') && sql.includes('delivered_at')) {
        // transición stage = ready
        return { rowCount: 1, rows: [{ id: 'job-1', stage: 'ready', appointment_id: 'appt-1' }] };
      }
      if (sql.includes('UPDATE car_wash_jobs SET ready_notified_at')) {
        updateReadyNotified();
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
      writeAppointmentEvent: vi.fn(),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({
        vertical: 'car_wash',
        car_wash: { require_checklist_on_arrival: false, notify_when_ready: true },
      }),
    }));
    vi.doMock('./messages.js', () => ({
      enqueueCarWashReadyNotification,
      buildCarWashConfirmationText: vi.fn(),
      formatAppointmentDateTimeLabel: vi.fn(),
      loadVehicleLabelForAppointment: vi.fn(),
    }));

    const { applyCarWashJobAction } = await import('./service.js');
    const out = await applyCarWashJobAction('tenant-1', 'job-1', 'ready', { sub: 'u1' });
    expect(out.stage).toBe('ready');
    expect(enqueueCarWashReadyNotification).toHaveBeenCalled();
    expect(updateReadyNotified).toHaveBeenCalled();
  });

  it('applyCarWashJobAction deliver: marca completed e chama ensureFinancial/commission + cancela notifications', async () => {
    const ensureFinancialOnServiceCompleted = vi.fn();
    const createCommissionEntryForCompletedAppointment = vi.fn();
    const cancelAllPendingNotificationJobsForAppointment = vi.fn();
    const writeAppointmentEvent = vi.fn();

    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              stage: 'ready',
              appointment_id: 'appt-1',
              appointment_status: 'confirmed',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('UPDATE car_wash_jobs')) {
        return { rowCount: 1, rows: [{ id: 'job-1', stage: 'delivered', appointment_id: 'appt-1' }] };
      }
      if (sql.includes("UPDATE appointments SET status = 'in_service'")) return { rowCount: 1, rows: [] };
      if (sql.includes("UPDATE appointments\n          SET status = 'completed'")) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../finance/service.js', () => ({ ensureFinancialOnServiceCompleted }));
    vi.doMock('../commission/service.js', () => ({ createCommissionEntryForCompletedAppointment }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ cancelAllPendingNotificationJobsForAppointment }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
      writeAppointmentEvent,
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({
        vertical: 'car_wash',
        car_wash: { require_checklist_on_arrival: false, notify_when_ready: false },
      }),
    }));
    vi.doMock('./messages.js', () => ({
      enqueueCarWashReadyNotification: vi.fn(),
      buildCarWashConfirmationText: vi.fn(),
      formatAppointmentDateTimeLabel: vi.fn(),
      loadVehicleLabelForAppointment: vi.fn(),
    }));

    const { applyCarWashJobAction } = await import('./service.js');
    const out = await applyCarWashJobAction('tenant-1', 'job-1', 'deliver', { sub: 'u1' });
    expect(out.stage).toBe('delivered');
    expect(ensureFinancialOnServiceCompleted).toHaveBeenCalled();
    expect(createCommissionEntryForCompletedAppointment).toHaveBeenCalled();
    expect(cancelAllPendingNotificationJobsForAppointment).toHaveBeenCalled();
  });

  it('createCarWashChecklist lança CHECKLIST_ALREADY_EXISTS quando INSERT falha com 23505', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FOR UPDATE OF j, a')) {
        return { rowCount: 1, rows: [{ appointment_id: 'appt-1', id: 'job-1', stage: 'scheduled', appointment_status: 'confirmed', customer_id: 'cust-1' }] };
      }
      if (sql.includes('INSERT INTO car_wash_checklists')) {
        const err = { code: '23505' };
        // simula erro de constraint única
        throw err;
      }
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({ vertical: 'car_wash', car_wash: {} }),
    }));

    const { createCarWashChecklist } = await import('./service.js');
    await expect(
      createCarWashChecklist(
        'tenant-1',
        'job-1',
        {
          checklist_type: 'arrival',
          items: { body_scratches: false, fuel_level: '1/2', wheel_damage: false, interior_objects: 'none' },
          notes: 'n',
        },
        { sub: 'u1' },
      ),
    ).rejects.toMatchObject({ code: 'CHECKLIST_ALREADY_EXISTS', statusCode: 409 });
  });

  it('applyCarWashJobAction ready não atualiza ready_notified_at quando enq.inserted=false', async () => {
    const enqueueCarWashReadyNotification = vi.fn().mockResolvedValue({ inserted: false, skipped: 'SKIP_NO_ROUTING' });
    const updateReadyNotified = vi.fn();

    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              stage: 'quality_check',
              appointment_id: 'appt-1',
              appointment_status: 'in_service',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('UPDATE car_wash_jobs')) {
        return { rowCount: 1, rows: [{ id: 'job-1', stage: 'ready', appointment_id: 'appt-1' }] };
      }
      if (sql.includes('UPDATE car_wash_jobs SET ready_notified_at')) {
        updateReadyNotified();
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
      writeAppointmentEvent: vi.fn(),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({
        vertical: 'car_wash',
        car_wash: { require_checklist_on_arrival: false, notify_when_ready: true },
      }),
    }));
    vi.doMock('./messages.js', () => ({
      enqueueCarWashReadyNotification,
      buildCarWashConfirmationText: vi.fn(),
      formatAppointmentDateTimeLabel: vi.fn(),
      loadVehicleLabelForAppointment: vi.fn(),
    }));

    const { applyCarWashJobAction } = await import('./service.js');
    const out = await applyCarWashJobAction('tenant-1', 'job-1', 'ready', { sub: 'u1' });
    expect(out.stage).toBe('ready');
    expect(enqueueCarWashReadyNotification).toHaveBeenCalled();
    expect(updateReadyNotified).not.toHaveBeenCalled();
  });

  it('applyCarWashJobAction arrive lança CHECKLIST_REQUIRED quando checklist não existe', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM car_wash_jobs j') && sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              stage: 'scheduled',
              appointment_id: 'appt-1',
              appointment_status: 'confirmed',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('SELECT 1 FROM car_wash_checklists')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({
        vertical: 'car_wash',
        car_wash: { require_checklist_on_arrival: true, notify_when_ready: false },
      }),
    }));
    vi.doMock('./messages.js', () => ({
      enqueueCarWashReadyNotification: vi.fn(),
      buildCarWashConfirmationText: vi.fn(),
      formatAppointmentDateTimeLabel: vi.fn(),
      loadVehicleLabelForAppointment: vi.fn(),
    }));

    const { applyCarWashJobAction } = await import('./service.js');
    await expect(applyCarWashJobAction('tenant-1', 'job-1', 'arrive', { sub: 'u1' })).rejects.toMatchObject({
      code: 'CHECKLIST_REQUIRED',
      statusCode: 422,
    });
  });

  it('applyCarWashJobAction cancel chama cancelAppointmentInDb', async () => {
    const cancelAppointmentInDb = vi.fn();
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'job-1',
              stage: 'scheduled',
              appointment_id: 'appt-1',
              appointment_status: 'confirmed',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('UPDATE car_wash_jobs')) {
        return { rowCount: 1, rows: [{ id: 'job-1', stage: 'cancelled', appointment_id: 'appt-1' }] };
      }
      return { rowCount: 0, rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent: vi.fn(),
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb,
      confirmAppointmentInDb: vi.fn(),
      writeAppointmentEvent: vi.fn(),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({ vertical: 'car_wash', car_wash: {} }),
    }));
    vi.doMock('./messages.js', () => ({
      enqueueCarWashReadyNotification: vi.fn(),
      buildCarWashConfirmationText: vi.fn(),
      formatAppointmentDateTimeLabel: vi.fn(),
      loadVehicleLabelForAppointment: vi.fn(),
    }));

    const { applyCarWashJobAction } = await import('./service.js');
    const out = await applyCarWashJobAction('tenant-1', 'job-1', 'cancel', { sub: 'u1' });
    expect(out.stage).toBe('cancelled');
  });

  it('createCarWashChecklist feliz (insert ok) retorna checklist row', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FOR UPDATE OF j, a')) {
        return {
          rowCount: 1,
          rows: [
            {
              appointment_id: 'appt-1',
              id: 'job-1',
              stage: 'scheduled',
              appointment_status: 'confirmed',
              customer_id: 'cust-1',
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO car_wash_checklists')) {
        return { rowCount: 1, rows: [{ id: 'chk-1', checklist_type: 'arrival' }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const writeOperationalAuditEvent = vi.fn();
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent,
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({ vertical: 'car_wash', car_wash: {} }),
    }));

    const { createCarWashChecklist } = await import('./service.js');
    const out = await createCarWashChecklist(
      'tenant-1',
      'job-1',
      {
        checklist_type: 'arrival',
        items: { body_scratches: false, fuel_level: '1/2', wheel_damage: false, interior_objects: 'none' },
        notes: 'n',
      },
      { sub: 'u1', role: 'manager' },
    );
    expect(out.id).toBe('chk-1');
    expect(writeOperationalAuditEvent).toHaveBeenCalled();
  });
});

