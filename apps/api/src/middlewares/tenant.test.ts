import { describe, expect, it, vi } from 'vitest';

vi.mock('../infra/db/pool.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) },
}));

import {
  getEffectiveRequestPathname,
  isPlatformTenantsCollectionRoute,
  normalizeRequestPathname,
  tenantMiddleware,
} from './tenant.js';

function createReply() {
  const send = vi.fn();
  const code = vi.fn().mockReturnValue({ send });
  return { code, send };
}

describe('getEffectiveRequestPathname', () => {
  it('prefers request.url and strips query', () => {
    const req = { url: '/api/v1/tenants?page=1', raw: { url: '/other' } } as never;
    expect(getEffectiveRequestPathname(req)).toBe('/api/v1/tenants');
  });

  it('falls back to raw.url when url empty', () => {
    const req = { url: '', raw: { url: '/api/v1/tenants' } } as never;
    expect(getEffectiveRequestPathname(req)).toBe('/api/v1/tenants');
  });
});

describe('isPlatformTenantsCollectionRoute', () => {
  it('matches only GET/POST on exact /api/v1/tenants', () => {
    expect(isPlatformTenantsCollectionRoute('GET', '/api/v1/tenants')).toBe(true);
    expect(isPlatformTenantsCollectionRoute('POST', '/api/v1/tenants')).toBe(true);
    expect(isPlatformTenantsCollectionRoute('GET', '/api/v1/tenants?page=1')).toBe(true);
    expect(isPlatformTenantsCollectionRoute('GET', '/api/v1/tenants/current')).toBe(false);
    expect(isPlatformTenantsCollectionRoute('GET', '/api/v1/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
    expect(isPlatformTenantsCollectionRoute('PATCH', '/api/v1/tenants')).toBe(false);
  });

  it('normalizeRequestPathname strips query and trailing slash', () => {
    expect(normalizeRequestPathname('/api/v1/tenants?page=1')).toBe('/api/v1/tenants');
    expect(normalizeRequestPathname('/api/v1/tenants/')).toBe('/api/v1/tenants');
  });
});

describe('tenant middleware', () => {
  it('returns 401 when tenant is missing', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/services',
      headers: {},
      user: {},
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('sets tenantId from token when valid', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/services',
      headers: {},
      user: { tenant_id: '11111111-1111-4111-8111-111111111111' },
    };

    await tenantMiddleware(request, reply as any);

    expect(request.tenantId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('blocks header vs JWT tenant mismatch for platform_admin on GET /api/v1/tenants', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/tenants',
      headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000002' },
      user: {
        role: 'platform_admin',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        sub: 's1',
      },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('allows platform_admin on GET /api/v1/tenants without tenant and without x-tenant-id', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/tenants',
      headers: {},
      user: { role: 'platform_admin', tenant_id: null, sub: 's1' },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
    expect(request.tenantId).toBeUndefined();
  });

  it('allows platform_admin on POST /api/v1/tenants without tenant context', async () => {
    const reply = createReply();
    const request: any = {
      method: 'POST',
      url: '/api/v1/tenants',
      headers: {},
      user: { role: 'platform_admin', tenant_id: null, sub: 's1' },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
    expect(request.tenantId).toBeUndefined();
  });

  it('requires TENANT_REQUIRED for tenant_owner on tenant-scoped path without context', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/services',
      headers: {},
      user: { role: 'tenant_owner', tenant_id: null, sub: 'u1' },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('still requires tenant for platform_admin on tenant-scoped paths', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/services',
      headers: {},
      user: { role: 'platform_admin', tenant_id: null, sub: 's1' },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('blocks tenant mismatch between header and token', async () => {
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/services',
      headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000002' },
      user: { tenant_id: '00000000-0000-0000-0000-000000000001' },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('CT-020: x-tenant-id com espaços resolve para o mesmo UUID do JWT', async () => {
    const tid = '11111111-1111-4111-8111-111111111111';
    const reply = createReply();
    const request: any = {
      method: 'GET',
      url: '/api/v1/services',
      headers: { 'x-tenant-id': `  ${tid}  ` },
      user: { tenant_id: tid },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).not.toHaveBeenCalled();
    expect(request.tenantId).toBe(tid);
  });
});
