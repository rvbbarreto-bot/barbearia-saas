import { describe, expect, it } from 'vitest';
import { canAccess, hasRequiredRole, requireRole } from './rbac.js';

describe('rbac role checks', () => {
  it('allows role with enough level', () => {
    expect(hasRequiredRole('tenant_admin', 'attendant')).toBe(true);
  });

  it('denies role with lower level', () => {
    expect(hasRequiredRole('viewer', 'manager')).toBe(false);
  });

  it('denies unknown role', () => {
    expect(hasRequiredRole('invalid_role', 'viewer')).toBe(false);
  });

  it('throws when role is missing', async () => {
    const preHandler = requireRole('viewer');
    await expect(preHandler({ user: {} } as any, {} as any)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('throws when role level is insufficient', async () => {
    const preHandler = requireRole('manager');
    await expect(preHandler({ user: { role: 'viewer' } } as any, {} as any)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('enforces permission policy by resource/action', () => {
    expect(canAccess('viewer', 'appointments', 'read')).toBe(true);
    expect(canAccess('viewer', 'appointments', 'create')).toBe(false);
    expect(canAccess('attendant', 'appointments', 'create')).toBe(true);
  });

  it('denies appointments noShow for professional (API alinhada ao balcão/gestão)', () => {
    expect(canAccess('professional', 'appointments', 'noShow')).toBe(false);
    expect(canAccess('attendant', 'appointments', 'noShow')).toBe(true);
    expect(canAccess('manager', 'appointments', 'noShow')).toBe(true);
    expect(canAccess('tenant_owner', 'appointments', 'noShow')).toBe(true);
  });

  it('restricts outbox list to manager+', () => {
    expect(canAccess('viewer', 'outbox', 'read')).toBe(false);
    expect(canAccess('attendant', 'outbox', 'read')).toBe(false);
    expect(canAccess('manager', 'outbox', 'read')).toBe(true);
    expect(canAccess('tenant_admin', 'outbox', 'read')).toBe(true);
  });
});
