import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppError } from '../../shared/errors.js';
import { mockPoolClient } from '../../test-utils/mockPoolClient.js';

describe('PS-06: portal/service.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('createAppointmentPortalToken cria token e registra audit', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('SELECT id FROM appointments')) {
        return { rowCount: 1, rows: [{ id: 'appt-1' }] };
      }
      if (sql.includes('UPDATE appointment_portal_tokens')) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('INSERT INTO appointment_portal_tokens')) {
        return { rowCount: 1, rows: [] };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', async () => {
      const actual = (await vi.importActual<any>('./token.js')) as any;
      return {
        ...actual,
        generatePortalTokenPlain: vi.fn(() => 'PLAIN_PORTAL_TOKEN_1234567890'),
        hashPortalToken: vi.fn(() => 'HASH_1'),
      };
    });
    const writeAuditLog = vi.fn();
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { createAppointmentPortalToken } = await import('./service.js');
    const out = await createAppointmentPortalToken('tenant-1', 'appt-1', 'actor-1');

    expect(out.token).toBe('PLAIN_PORTAL_TOKEN_1234567890');
    expect(out.expires_at).toMatch(/^20\d{2}-\d{2}-\d{2}T/);
    expect(writeAuditLog).toHaveBeenCalled();
  });

  it('getPortalAppointmentByToken rejeita token inválido', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens')) return { rowCount: 0, rows: [] };
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { getPortalAppointmentByToken } = await import('./service.js');
    await expect(getPortalAppointmentByToken('bad-token')).rejects.toMatchObject({ code: 'PORTAL_TOKEN_INVALID', statusCode: 404 });
  });

  it('getPortalAppointmentByToken rejeita token revogado', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens'))
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              revoked_at: new Date().toISOString(),
            },
          ],
        };
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { getPortalAppointmentByToken } = await import('./service.js');
    await expect(getPortalAppointmentByToken('revoked-token')).rejects.toMatchObject({
      code: 'PORTAL_TOKEN_REVOKED',
      statusCode: 410,
    });
  });

  it('getPortalAppointmentByToken rejeita token expirado', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens'))
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() - 60_000).toISOString(),
              revoked_at: null,
            },
          ],
        };
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { getPortalAppointmentByToken } = await import('./service.js');
    await expect(getPortalAppointmentByToken('expired-token')).rejects.toMatchObject({
      code: 'PORTAL_TOKEN_EXPIRED',
      statusCode: 410,
    });
  });

  it('getPortalAppointmentByToken retorna view com permissões de confirmar/cancelar', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              revoked_at: null,
            },
          ],
        };
      }

      if (sql.includes('FROM appointments a') && sql.includes('tenant_display_name')) {
        return {
          rowCount: 1,
          rows: [
            {
              appointment_id: 'appt-1',
              status: 'awaiting_payment',
              starts_at: new Date().toISOString(),
              ends_at: new Date().toISOString(),
              service_name: 'Corte',
              professional_name: 'João',
              customer_name: 'Cliente',
              tenant_display_name: 'Barbearia Exeq',
            },
          ],
        };
      }

      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { getPortalAppointmentByToken } = await import('./service.js');
    const view = await getPortalAppointmentByToken('any-token');
    expect(view.can_confirm).toBe(true);
    expect(view.can_cancel).toBe(true);
    expect(view.status).toBe('awaiting_payment');
  });

  it('confirmPortalAppointmentByToken rejeita quando status não permite', async () => {
    const confirmAppointmentInDb = vi.fn();
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              revoked_at: null,
            },
          ],
        };
      }

      if (sql.includes('SELECT status::text AS status') && sql.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ status: 'cancelled' }] };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb,
    }));

    const { confirmPortalAppointmentByToken } = await import('./service.js');
    await expect(confirmPortalAppointmentByToken('token')).rejects.toMatchObject({
      code: 'PORTAL_ACTION_NOT_ALLOWED',
      statusCode: 409,
    });
    expect(confirmAppointmentInDb).not.toHaveBeenCalled();
  });

  it('getPortalAppointmentByToken lança APPOINTMENT_NOT_FOUND quando appt não existe', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              revoked_at: null,
            },
          ],
        };
      }
      if (sql.includes('FROM appointments a') && sql.includes('tenant_display_name')) {
        return { rowCount: 0, rows: [] };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { getPortalAppointmentByToken } = await import('./service.js');
    await expect(getPortalAppointmentByToken('token')).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
  });

  it('confirmPortalAppointmentByToken confirma quando status é confirmável', async () => {
    const confirmAppointmentInDb = vi.fn();
    const writeAuditLog = vi.fn();
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              revoked_at: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT status::text AS status') && sql.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ status: 'awaiting_payment' }] };
      }
      if (sql.includes('FROM appointments a') && sql.includes('tenant_display_name')) {
        return {
          rowCount: 1,
          rows: [
            {
              appointment_id: 'appt-1',
              status: 'confirmed',
              starts_at: new Date().toISOString(),
              ends_at: new Date().toISOString(),
              service_name: 'Corte',
              professional_name: 'João',
              customer_name: 'Cliente',
              tenant_display_name: 'Barbearia Exeq',
            },
          ],
        };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb,
    }));

    const { confirmPortalAppointmentByToken } = await import('./service.js');
    const view = await confirmPortalAppointmentByToken('token');
    expect(confirmAppointmentInDb).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalled();
    expect(view.status).toBe('confirmed');
  });

  it('cancelPortalAppointmentByToken cancela quando status é cancelável', async () => {
    const cancelAppointmentInDb = vi.fn();
    const writeAuditLog = vi.fn();
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('FROM appointment_portal_tokens')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'token-1',
              tenant_id: 'tenant-1',
              appointment_id: 'appt-1',
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              revoked_at: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT status::text AS status') && sql.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ status: 'awaiting_confirmation' }] };
      }
      if (sql.includes('FROM appointments a') && sql.includes('tenant_display_name')) {
        return {
          rowCount: 1,
          rows: [
            {
              appointment_id: 'appt-1',
              status: 'cancelled',
              starts_at: new Date().toISOString(),
              ends_at: new Date().toISOString(),
              service_name: null,
              professional_name: null,
              customer_name: 'Cliente',
              tenant_display_name: 'Barbearia Exeq',
            },
          ],
        };
      }
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb,
      confirmAppointmentInDb: vi.fn(),
    }));

    const { cancelPortalAppointmentByToken } = await import('./service.js');
    const view = await cancelPortalAppointmentByToken('token');
    expect(cancelAppointmentInDb).toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalled();
    expect(view.status).toBe('cancelled');
  });

  it('createAppointmentPortalToken lança APPOINTMENT_NOT_FOUND quando appt não existe', async () => {
    const fakeClient = mockPoolClient((sql) => {
      if (sql.includes('SELECT id FROM appointments')) return { rowCount: 0, rows: [] };
      return null;
    });

    vi.doMock('../../infra/db/pool.js', () => ({
      withTenant: vi.fn((_tenantId: string, fn: (c: typeof fakeClient) => unknown) => fn(fakeClient)),
      getIntegrationLookupPool: vi.fn(() => fakeClient),
    }));
    vi.doMock('./token.js', () => ({
      generatePortalTokenPlain: vi.fn(() => 'PLAIN_PORTAL_TOKEN_1234567890'),
      hashPortalToken: vi.fn(() => 'HASH_1'),
    }));
    vi.doMock('../../shared/audit.js', () => ({ writeAuditLog: vi.fn() }));
    vi.doMock('../appointments/service.js', () => ({
      cancelAppointmentInDb: vi.fn(),
      confirmAppointmentInDb: vi.fn(),
    }));

    const { createAppointmentPortalToken } = await import('./service.js');
    await expect(createAppointmentPortalToken('tenant-1', 'missing', 'actor-1')).rejects.toMatchObject({
      code: 'APPOINTMENT_NOT_FOUND',
      statusCode: 404,
    });
  });
});

