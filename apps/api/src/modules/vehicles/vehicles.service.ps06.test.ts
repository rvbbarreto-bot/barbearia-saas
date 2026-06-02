import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockPoolClient } from '../../test-utils/mockPoolClient.js';

describe('PS-06: vehicles/service.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('listVehicles aplica filtros (customerId + search + activeOnly=true)', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM customer_vehicles WHERE') && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [
            {
              id: 'veh-1',
              customer_id: 'cust-1',
              plate: 'ABC1D23',
              brand: 'Honda',
              model: 'Civic',
              color: 'Prata',
              vehicle_type: 'car',
              notes: null,
              is_active: true,
              created_at: '2026-05-01T00:00:00Z',
              updated_at: '2026-05-01T00:00:00Z',
            },
          ],
        };
      }
      if (sql.includes('SELECT COUNT(*)::int AS total FROM customer_vehicles')) {
        return { rows: [{ total: 1 }] };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('./plate.js', () => ({
      normalizePlate: vi.fn((p: string) => p),
      isValidBrazilianPlate: vi.fn(() => true),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({ writeOperationalAuditEvent: vi.fn(), effectiveCorrelationId: vi.fn(() => 'corr') }));

    const { listVehicles } = await import('./service.js');
    const out = await listVehicles('tenant-1', { customer_id: 'cust-1', search: 'abc 1d23', active: 'true', limit: 20, page: 1 });

    expect(out.total).toBe(1);
    expect(out.data[0]).toMatchObject({ id: 'veh-1', plate: 'ABC1D23', is_active: true });
  });

  it('listVehicles ignora filtro is_active quando active=false', async () => {
    let sqlSeen = '';
    const query = vi.fn(async (sql: string) => {
      sqlSeen = String(sql);
      if (String(sql).includes('SELECT COUNT(*)::int AS total FROM customer_vehicles')) {
        return { rows: [{ total: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const fakeClient = { query } as unknown as import('pg').PoolClient;

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('./plate.js', () => ({ normalizePlate: vi.fn(() => 'ABC1D23'), isValidBrazilianPlate: vi.fn(() => true) }));
    vi.doMock('../../shared/operational-audit.js', () => ({ writeOperationalAuditEvent: vi.fn(), effectiveCorrelationId: vi.fn(() => 'corr') }));

    const { listVehicles } = await import('./service.js');
    await listVehicles('tenant-1', { active: 'false', limit: 20, page: 1 });
    expect(sqlSeen).not.toContain('is_active = true');
  });

  it('getVehicleById lança VEHICLE_NOT_FOUND quando não existe', async () => {
    const fakeClient = mockPoolClient(() => ({ rows: [], rowCount: 0 }));
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));

    const { getVehicleById } = await import('./service.js');
    await expect(getVehicleById('tenant-1', 'veh-missing')).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND', statusCode: 404 });
  });

  it('createVehicle valida placa e mapeia duplicate 23505 (VEHICLE_PLATE_ALREADY_EXISTS)', async () => {
    const plate = 'ABC1D23';
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('SELECT 1 FROM customers')) return { rowCount: 1, rows: [{ '?column?': 1 }] };
      if (sql.includes('INSERT INTO customer_vehicles')) {
        const err = { code: '23505', constraint: 'customer_vehicles_normalized_plate_key' };
        // simula erro pg (será capturado pelo catch de createVehicle)
        throw err;
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('./plate.js', () => ({
      normalizePlate: vi.fn(() => plate),
      formatVehicleLabel: vi.fn(),
      isValidBrazilianPlate: vi.fn(() => true),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({ writeOperationalAuditEvent: vi.fn(), effectiveCorrelationId: vi.fn(() => 'corr') }));

    const { createVehicle } = await import('./service.js');
    await expect(
      createVehicle('tenant-1', { customer_id: '550e8400-e29b-41d4-a716-446655440000', plate }, { sub: 'u1', role: 'manager' }),
    ).rejects.toMatchObject({ code: 'VEHICLE_PLATE_ALREADY_EXISTS', statusCode: 409 });
  });

  it('createVehicle happy path audita e retorna row', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('SELECT 1 FROM customers')) return { rowCount: 1, rows: [{ ok: 1 }] };
      if (sql.includes('INSERT INTO customer_vehicles')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'veh-1',
              tenant_id: 'tenant-1',
              customer_id: 'cust-1',
              plate: 'ABC1D23',
              normalized_plate: 'ABC1D23',
              brand: null,
              model: null,
              color: null,
              vehicle_type: 'car',
              notes: null,
              is_active: true,
              created_at: '2026-05-01T00:00:00Z',
              updated_at: '2026-05-01T00:00:00Z',
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
    vi.doMock('./plate.js', () => ({
      normalizePlate: vi.fn(() => 'ABC1D23'),
      isValidBrazilianPlate: vi.fn(() => true),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent,
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));

    const { createVehicle } = await import('./service.js');
    const out = await createVehicle(
      'tenant-1',
      {
        customer_id: '550e8400-e29b-41d4-a716-446655440000',
        plate: 'ABC1D23',
        vehicle_type: 'car',
      },
      { sub: 'u1', role: 'manager', requestId: 'r1', correlationId: 'c1' },
    );

    expect(out.id).toBe('veh-1');
    expect(writeOperationalAuditEvent).toHaveBeenCalled();
  });

  it('updateVehicle lança VEHICLE_NOT_FOUND quando não existe', async () => {
    const fakeClient = mockPoolClient(() => ({ rows: [], rowCount: 0 }));
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('./plate.js', () => ({
      normalizePlate: vi.fn(() => 'ABC1D23'),
      isValidBrazilianPlate: vi.fn(() => true),
    }));
    vi.doMock('../../shared/operational-audit.js', () => ({ writeOperationalAuditEvent: vi.fn(), effectiveCorrelationId: vi.fn(() => 'corr') }));

    const { updateVehicle } = await import('./service.js');
    await expect(updateVehicle('tenant-1', 'veh-missing', { brand: 'x' })).rejects.toMatchObject({
      code: 'VEHICLE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('assertVehicleBelongsToCustomer lança quando não pertence/sem ativo', async () => {
    const fakeClient = mockPoolClient(() => ({ rows: [], rowCount: 0 }));
    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    const { assertVehicleBelongsToCustomer } = await import('./service.js');
    await expect(assertVehicleBelongsToCustomer({ query: fakeClient.query } as any, 'tenant-1', 'veh-1', 'cust-1')).rejects.toMatchObject({
      code: 'VEHICLE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('createVehicle lança VEHICLE_PLATE_REQUIRED quando normalizePlate retorna null', async () => {
    vi.doMock('./plate.js', () => ({
      normalizePlate: vi.fn(() => null),
      isValidBrazilianPlate: vi.fn(() => true),
      formatVehicleLabel: vi.fn(),
    }));

    const { createVehicle } = await import('./service.js');
    await expect(
      createVehicle('tenant-1', { customer_id: '550e8400-e29b-41d4-a716-446655440000', plate: 'ABC1D23' }),
    ).rejects.toMatchObject({ code: 'VEHICLE_PLATE_REQUIRED', statusCode: 422 });
  });

  it('updateVehicle usa normalized_plate atual quando patch.plate é undefined', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('SELECT * FROM customer_vehicles WHERE')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'veh-1',
              tenant_id: 'tenant-1',
              customer_id: 'cust-1',
              plate: 'ABC1D23',
              normalized_plate: 'ABC1D23',
              brand: 'Honda',
              model: 'Civic',
              color: 'Prata',
              vehicle_type: 'car',
              notes: null,
              is_active: true,
              created_at: '2026-05-01T00:00:00Z',
              updated_at: '2026-05-01T00:00:00Z',
            },
          ],
        };
      }
      if (sql.includes('UPDATE customer_vehicles SET')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'veh-1',
              is_active: false,
              plate: 'ABC1D23',
            },
          ],
        };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
    }));
    vi.doMock('./plate.js', () => ({
      normalizePlate: vi.fn((p: string) => p),
      isValidBrazilianPlate: vi.fn(() => true),
    }));
    const writeOperationalAuditEvent = vi.fn();
    vi.doMock('../../shared/operational-audit.js', () => ({
      writeOperationalAuditEvent,
      effectiveCorrelationId: vi.fn(() => 'corr'),
    }));

    const { updateVehicle } = await import('./service.js');
    const out = await updateVehicle('tenant-1', 'veh-1', { is_active: false }, { sub: 'u1' });
    expect(out.is_active).toBe(false);
    expect(writeOperationalAuditEvent).toHaveBeenCalled();
  });
});

