import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockPoolClient } from '../../test-utils/mockPoolClient.js';

describe('PS-06: customers/overview.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('lança CUSTOMER_NOT_FOUND quando cliente não existe', async () => {
    const fakeClient = mockPoolClient(() => ({ rows: [], rowCount: 0 }));
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({ vertical: 'barber_shop' }),
    }));

    const { getCustomerOverview } = await import('./overview.js');
    await expect(getCustomerOverview('tenant-1', 'cust-missing')).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('monta overview com veículos quando vertical=car_wash', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM customers WHERE')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'cust-1',
              name: 'Cliente',
              phone: '999',
              email: 'c@c.com',
              whatsapp_opt_in: true,
              whatsapp_opt_out: false,
              is_vip: false,
              last_interaction_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      if (sql.includes('FROM appointments a') && sql.includes('ORDER BY a.starts_at DESC')) {
        return { rows: [{ id: 'appt-1', status: 'confirmed', starts_at: '2026-06-01', ends_at: '2026-06-01', service_name: 'Corte', professional_name: 'João' }] };
      }
      if (sql.includes('FROM appointment_financials')) {
        return { rows: [{ appointment_id: 'appt-1' }] };
      }
      if (sql.includes('FROM message_outbox')) {
        return { rows: [{ id: 'm1', status: 'failed', channel: 'whatsapp', correlation_id: 'corr-1', template_key: 't1', appointment_id: 'appt-1', last_error: 'E' }] };
      }
      if (sql.includes('FROM operational_audit_events')) {
        return { rows: [{ id: 'a1', action: 'ERROR', entity: 'customer', entity_id: 'cust-1', correlation_id: null }] };
      }
      if (sql.includes('SELECT a.service_id::text')) {
        return { rows: [{ service_id: 's1', name: 'Corte', last_at: '2026-01-01' }] };
      }
      if (sql.includes('FROM customer_vehicles')) {
        return { rows: [{ id: 'veh-1', plate: 'ABC1D23', model: 'Civic', color: 'Prata', active: true, created_at: '2026-01-01' }] };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({ vertical: 'car_wash' }),
    }));

    const { getCustomerOverview } = await import('./overview.js');
    const out = await getCustomerOverview('tenant-1', 'cust-1');

    expect(out.customer.id).toBe('cust-1');
    expect(out.vertical).toBe('car_wash');
    expect(out.vehicles).toHaveLength(1);
    expect(out.whatsapp_opt_in).toBe(true);
  });

  it('overview sem veículos quando vertical!=car_wash', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM customers WHERE')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'cust-1',
              name: 'Cliente',
              phone: null,
              email: null,
              whatsapp_opt_in: true,
              whatsapp_opt_out: true,
              is_vip: false,
              last_interaction_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('../vertical/tenant-vertical.service.js', () => ({
      loadTenantVerticalContextWithClient: vi.fn().mockResolvedValue({ vertical: 'barber_shop' }),
    }));

    const { getCustomerOverview } = await import('./overview.js');
    const out = await getCustomerOverview('tenant-1', 'cust-1');
    expect(out.vertical).toBe('barber_shop');
    expect(out.vehicles).toEqual([]);
    expect(out.whatsapp_opt_in).toBe(false);
  });
});

