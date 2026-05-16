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

  it('allows outbox read from attendant+ and retry from manager+', () => {
    expect(canAccess('viewer', 'outbox', 'read')).toBe(false);
    expect(canAccess('attendant', 'outbox', 'read')).toBe(true);
    expect(canAccess('manager', 'outbox', 'read')).toBe(true);
    expect(canAccess('tenant_admin', 'outbox', 'read')).toBe(true);
    expect(canAccess('attendant', 'outbox', 'retry')).toBe(false);
    expect(canAccess('manager', 'outbox', 'retry')).toBe(true);
  });

  it('allows operational audit read from attendant+', () => {
    expect(canAccess('viewer', 'operationalAudit', 'read')).toBe(false);
    expect(canAccess('attendant', 'operationalAudit', 'read')).toBe(true);
    expect(canAccess('manager', 'operationalAudit', 'read')).toBe(true);
  });

  it('allows operational dashboard read from manager+ only', () => {
    expect(canAccess('viewer', 'operationalDashboard', 'read')).toBe(false);
    expect(canAccess('attendant', 'operationalDashboard', 'read')).toBe(false);
    expect(canAccess('professional', 'operationalDashboard', 'read')).toBe(false);
    expect(canAccess('manager', 'operationalDashboard', 'read')).toBe(true);
    expect(canAccess('tenant_admin', 'operationalDashboard', 'read')).toBe(true);
  });
});
