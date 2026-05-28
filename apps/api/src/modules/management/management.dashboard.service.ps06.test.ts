import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockPoolClient } from '../../test-utils/mockPoolClient.js';

describe('PS-06: getManagementDashboard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('throw INVALID_PERIOD quando from >= to', async () => {
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn(),
    }));
    vi.doMock('../integrations/outbox-summary.service.js', () => ({
      getMessageOutboxStatusSummary: vi.fn().mockResolvedValue({}),
    }));

    const { getManagementDashboard } = await import('./service.js');
    await expect(
      getManagementDashboard('t1', { from: '2026-05-02T00:00:00Z', to: '2026-05-01T00:00:00Z' }),
    ).rejects.toMatchObject({ code: 'INVALID_PERIOD', statusCode: 422 });
  });

  it('carrega KPIs, rankings e erros recentes (happy path com filtros)', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('s.id::text AS service_id') && sql.includes('service_name')) {
        return { rows: [{ service_id: 's1', service_name: 'Corte', count: '3', revenue_cents: '7500' }] };
      }
      if (sql.includes('p.id::text AS professional_id') && sql.includes('professional_name')) {
        return { rows: [{ professional_id: 'p1', professional_name: 'João', completed: '4', revenue_cents: '10000' }] };
      }
      if (sql.includes('FROM operational_audit_events')) {
        return {
          rows: [
            {
              id: 'e1',
              action: 'ERROR',
              entity: 'vehicle',
              entity_id: 'v1',
              created_at: '2026-05-10T00:00:00Z',
              correlation_id: null,
            },
          ],
        };
      }
      if (sql.includes('COUNT(*) FILTER')) {
        // KPI counts query (não a de top professionals)
        return { rows: [{ created: '2', completed: '1', cancelled: '1', no_show: '0' }] };
      }
      if (sql.includes('SUM(f.service_price_cents)')) {
        // KPI revenue query
        return { rows: [{ gross: '10000', net: '9000' }] };
      }
      return { rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../integrations/outbox-summary.service.js', () => ({
      getMessageOutboxStatusSummary: vi.fn().mockResolvedValue({
        by_status: { pending: 2, sent: 10 },
        pending: 2,
        dead: 0,
      }),
    }));

    const { getManagementDashboard } = await import('./service.js');
    const res = await getManagementDashboard('tenant-1', {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-07T00:00:00.000Z',
      professional_id: '550e8400-e29b-41d4-a716-446655440000',
      service_id: '550e8400-e29b-41d4-a716-446655440001',
      appointment_status: 'completed',
    });

    expect(res.period).toEqual({ from: '2026-05-01T00:00:00.000Z', to: '2026-05-07T00:00:00.000Z' });
    expect(res.kpis).toMatchObject({
      gross_revenue_cents: 10000,
      net_revenue_cents: 9000,
      appointments_created: 2,
      appointments_completed: 1,
      appointments_cancelled: 1,
      no_show_count: 0,
      average_ticket_cents: 10000,
    });
    expect(res.top_services[0]).toMatchObject({ service_id: 's1', service_name: 'Corte', count: 3, revenue_cents: 7500 });
    expect(res.top_professionals[0]).toMatchObject({
      professional_id: 'p1',
      professional_name: 'João',
      completed: 4,
      revenue_cents: 10000,
    });
    expect(res.outbox).toEqual({ by_status: { pending: 2, sent: 10 }, pending: 2, dead: 0 });
    expect(res.recent_operational_errors[0]).toMatchObject({ id: 'e1', entity_id: 'v1' });
  });

  it('não adiciona cláusula de appointment_status quando omitido', async () => {
    let countsSql: string | null = null;
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('COUNT(*) FILTER')) {
        countsSql = sql;
        return { rows: [{ created: '0', completed: '0', cancelled: '0', no_show: '0' }] };
      }
      if (sql.includes('SUM(f.service_price_cents)')) return { rows: [{ gross: '0', net: '0' }] };
      return { rows: [] };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../integrations/outbox-summary.service.js', () => ({
      getMessageOutboxStatusSummary: vi.fn().mockResolvedValue({ by_status: {}, pending: 0, dead: 0 }),
    }));

    const { getManagementDashboard } = await import('./service.js');
    await getManagementDashboard('tenant-1', {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-07T00:00:00.000Z',
    });

    // O COUNT(*) FILTER sempre inclui `a.status = 'completed'` no filtro de KPI.
    // O filtro opcional de appointment_status cria `a.status = $<n>::appointment_status`.
    expect(countsSql ?? '').not.toContain('a.status = $');
  });
});

