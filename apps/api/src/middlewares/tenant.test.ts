import { describe, expect, it, vi } from 'vitest';

vi.mock('../infra/db/pool.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }) },
}));

import { tenantMiddleware } from './tenant.js';

function createReply() {
  const send = vi.fn();
  const code = vi.fn().mockReturnValue({ send });
  return { code, send };
}

describe('tenant middleware', () => {
  it('returns 401 when tenant is missing', async () => {
    const reply = createReply();
    const request: any = {
      headers: {},
      user: {},
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('sets tenantId from token when valid', async () => {
    const reply = createReply();
    const request: any = {
      headers: {},
      user: { tenant_id: '11111111-1111-4111-8111-111111111111' },
    };

    await tenantMiddleware(request, reply as any);

    expect(request.tenantId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('blocks tenant mismatch between header and token', async () => {
    const reply = createReply();
    const request: any = {
      headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000002' },
      user: { tenant_id: '00000000-0000-0000-0000-000000000001' },
    };

    await tenantMiddleware(request, reply as any);

    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
