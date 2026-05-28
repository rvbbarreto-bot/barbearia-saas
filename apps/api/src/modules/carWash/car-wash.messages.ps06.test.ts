import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';

type FakeRow = Record<string, unknown>;

function makeQueryClient(rowsBySql: (sql: string) => { rows?: FakeRow[]; rowCount?: number } | null) {
  return {
    query: vi.fn(async (sql: string) => {
      const r = rowsBySql(String(sql));
      if (!r) return { rows: [], rowCount: 0 };
      return { rows: (r.rows ?? []) as FakeRow[], rowCount: r.rowCount ?? (r.rows ? r.rows.length : 0) };
    }),
  } satisfies Pick<PoolClient, 'query'>;
}

describe('PS-06: carWash/messages.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('loadVehicleLabelForAppointment retorna null quando job não encontrado', async () => {
    const fakeClient = makeQueryClient(() => ({ rows: [], rowCount: 0 }));
    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage: vi.fn() }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => false),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({ resolveWhatsAppOutboundRouting: vi.fn().mockResolvedValue(null) }));
    vi.doMock('../vehicles/plate.js', () => ({ formatVehicleLabel: vi.fn() }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn().mockResolvedValue('America/Sao_Paulo') }));

    const { loadVehicleLabelForAppointment } = await import('./messages.js');
    const out = await loadVehicleLabelForAppointment(fakeClient, 'tenant-1', 'appt-1');
    expect(out).toBeNull();
  });

  it('buildCarWashConfirmationText monta texto com label do veículo', async () => {
    const fakeClient = makeQueryClient((sql) => {
      if (sql.includes('FROM car_wash_jobs')) {
        return { rows: [{ plate: 'ABC1D23', brand: 'Honda', model: 'Civic', color: 'Prata' }], rowCount: 1 };
      }
      return null;
    });

    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage: vi.fn() }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => false),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({ resolveWhatsAppOutboundRouting: vi.fn() }));
    vi.doMock('../vehicles/plate.js', () => ({
      formatVehicleLabel: vi.fn(() => 'ABC1D23 - Honda Civic Prata'),
    }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn().mockResolvedValue('America/Sao_Paulo') }));

    const { buildCarWashConfirmationText } = await import('./messages.js');
    const out = await buildCarWashConfirmationText(
      fakeClient,
      'tenant-1',
      'appt-1',
      'Cliente',
      'Barbearia',
      '2026-06-01 às 10:00',
      'Corte',
    );
    expect(out).toContain('Olá, Cliente.');
    expect(out).toContain('Veículo: ABC1D23');
    expect(out).toContain('Serviço: Corte.');
  });

  it('enqueueCarWashReadyNotification retorna SKIP_REMINDER_CONSENT quando bloqueado por consentimento', async () => {
    const fakeClient = makeQueryClient(() => ({ rows: [{ customer_name: 'Cliente', trade_name: 'Exeq', plate: null }], rowCount: 1 }));
    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage: vi.fn() }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => true),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({
        whatsapp_opt_in: false,
        whatsapp_opt_out: false,
        latest: { transactional: false },
      }),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({ resolveWhatsAppOutboundRouting: vi.fn() }));
    vi.doMock('../vehicles/plate.js', () => ({ formatVehicleLabel: vi.fn(() => 'Veículo') }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn() }));

    const { enqueueCarWashReadyNotification } = await import('./messages.js');
    const out = await enqueueCarWashReadyNotification(fakeClient, 'tenant-1', 'job-1', 'appt-1', 'cust-1', 'corr-1');
    expect(out).toEqual({ inserted: false, skipped: 'SKIP_REMINDER_CONSENT' });
  });

  it('enqueueCarWashReadyNotification retorna SKIP_NO_ROUTING quando routing não existe', async () => {
    const fakeClient = makeQueryClient(() => ({ rows: [{ customer_name: 'Cliente', trade_name: 'Exeq', plate: 'ABC1D23' }], rowCount: 1 }));
    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage: vi.fn() }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => false),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({
        whatsapp_opt_in: true,
        whatsapp_opt_out: false,
        latest: { transactional: true },
      }),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({ resolveWhatsAppOutboundRouting: vi.fn().mockResolvedValue(null) }));
    vi.doMock('../vehicles/plate.js', () => ({ formatVehicleLabel: vi.fn(() => 'ABC1D23 - Honda') }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn() }));

    const { enqueueCarWashReadyNotification } = await import('./messages.js');
    const out = await enqueueCarWashReadyNotification(fakeClient, 'tenant-1', 'job-1', 'appt-1', 'cust-1', 'corr-1');
    expect(out).toEqual({ inserted: false, skipped: 'SKIP_NO_ROUTING' });
  });

  it('enqueueCarWashReadyNotification retorna SKIP_JOB_NOT_FOUND quando job não existe no SELECT final', async () => {
    const fakeClient = makeQueryClient(() => ({ rows: [], rowCount: 0 }));
    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage: vi.fn() }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => false),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({
        whatsapp_opt_in: true,
        whatsapp_opt_out: false,
        latest: { transactional: true },
      }),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({
      resolveWhatsAppOutboundRouting: vi.fn().mockResolvedValue({ phone: '5511999999999', instance_name: 'inst', idempotency_key: 'x' }),
    }));
    vi.doMock('../vehicles/plate.js', () => ({ formatVehicleLabel: vi.fn(() => 'Veículo') }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn() }));

    const { enqueueCarWashReadyNotification } = await import('./messages.js');
    const out = await enqueueCarWashReadyNotification(fakeClient, 'tenant-1', 'job-1', 'appt-1', 'cust-1', 'corr-1');
    expect(out).toEqual({ inserted: false, skipped: 'SKIP_JOB_NOT_FOUND' });
  });

  it('enqueueCarWashReadyNotification happy path insere mensagem com idempotencyKey', async () => {
    const enqueueOutboundMessage = vi.fn().mockResolvedValue({ inserted: true });
    const fakeClient = makeQueryClient((sql) => {
      if (sql.includes('FROM car_wash_jobs j')) {
        return {
          rows: [
            {
              customer_name: ' Cliente ',
              trade_name: 'Exeq',
              plate: 'ABC1D23',
              brand: 'Honda',
              model: 'Civic',
              color: 'Prata',
            },
          ],
          rowCount: 1,
        };
      }
      return null;
    });

    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => false),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({
        whatsapp_opt_in: true,
        whatsapp_opt_out: false,
        latest: { transactional: true },
      }),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({
      resolveWhatsAppOutboundRouting: vi.fn().mockResolvedValue({ phone: '5511999999999', instance_name: 'inst' }),
    }));
    vi.doMock('../vehicles/plate.js', () => ({
      formatVehicleLabel: vi.fn(() => 'ABC1D23 - Honda'),
    }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn() }));

    const { enqueueCarWashReadyNotification } = await import('./messages.js');
    const out = await enqueueCarWashReadyNotification(fakeClient, 'tenant-1', 'job-1', 'appt-1', 'cust-1', 'corr-1');
    expect(out.inserted).toBe(true);
    expect(enqueueOutboundMessage).toHaveBeenCalled();
    const call = enqueueOutboundMessage.mock.calls[0][0];
    expect(call.idempotencyKey).toBe('car_wash_ready:job-1');
  });

  it('formatAppointmentDateTimeLabel formata com timezone e pt-BR', async () => {
    const fakeClient = makeQueryClient(() => null);
    vi.doMock('../../infra/queues/outbox.service.js', () => ({ enqueueOutboundMessage: vi.fn() }));
    vi.doMock('../notificationJobs/consent.js', () => ({
      blocksTransactionalReminders: vi.fn(() => false),
      loadCustomerConsentFlags: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('../notificationJobs/routing.js', () => ({ resolveWhatsAppOutboundRouting: vi.fn() }));
    vi.doMock('../vehicles/plate.js', () => ({ formatVehicleLabel: vi.fn(() => '') }));
    vi.doMock('../notificationJobs/schedule.js', () => ({ loadTenantTimeZone: vi.fn().mockResolvedValue('America/Sao_Paulo') }));

    const { formatAppointmentDateTimeLabel } = await import('./messages.js');
    const out = await formatAppointmentDateTimeLabel(fakeClient, 'tenant-1', new Date('2026-06-01T12:00:00.000Z'));
    expect(out).toContain('às');
    expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

