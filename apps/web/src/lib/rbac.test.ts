import { describe, expect, it } from 'vitest';
import { canAccessAttendantArea, canAccessManagerArea, hasMinRole, ROLE_LEVEL } from './rbac.js';

describe('rbac', () => {
  it('orders roles consistently with API', () => {
    expect(ROLE_LEVEL.viewer).toBeLessThan(ROLE_LEVEL.attendant);
    expect(ROLE_LEVEL.attendant).toBeLessThan(ROLE_LEVEL.professional);
    expect(ROLE_LEVEL.professional).toBeLessThan(ROLE_LEVEL.manager);
    expect(ROLE_LEVEL.manager).toBeLessThan(ROLE_LEVEL.tenant_admin);
    expect(ROLE_LEVEL.tenant_admin).toBeLessThan(ROLE_LEVEL.tenant_owner);
    expect(ROLE_LEVEL.tenant_owner).toBeLessThan(ROLE_LEVEL.platform_admin);
  });

  it('hasMinRole treats unknown as viewer', () => {
    expect(hasMinRole(undefined, 'viewer')).toBe(true);
    expect(hasMinRole('bogus', 'attendant')).toBe(false);
  });

  it('manager area for owner/admin/manager', () => {
    expect(canAccessManagerArea('viewer')).toBe(false);
    expect(canAccessManagerArea('attendant')).toBe(false);
    expect(canAccessManagerArea('professional')).toBe(false);
    expect(canAccessManagerArea('manager')).toBe(true);
    expect(canAccessManagerArea('tenant_admin')).toBe(true);
    expect(canAccessManagerArea('tenant_owner')).toBe(true);
    expect(canAccessManagerArea('platform_admin')).toBe(true);
  });

  it('attendant area includes professional for agenda read', () => {
    expect(canAccessAttendantArea('viewer')).toBe(false);
    expect(canAccessAttendantArea('professional')).toBe(true);
    expect(canAccessAttendantArea('attendant')).toBe(true);
  });
});
