import { describe, expect, it } from 'vitest';
import { canAccess } from '../../middlewares/rbac.js';

describe('management RBAC', () => {
  it('viewer e attendant não acedem ao dashboard gerencial', () => {
    expect(canAccess('viewer', 'management', 'readDashboard')).toBe(false);
    expect(canAccess('attendant', 'management', 'readDashboard')).toBe(false);
    expect(canAccess('professional', 'management', 'readDashboard')).toBe(false);
  });

  it('manager+ acede dashboard e portal token', () => {
    expect(canAccess('manager', 'management', 'readDashboard')).toBe(true);
    expect(canAccess('manager', 'management', 'createPortalToken')).toBe(true);
    expect(canAccess('tenant_admin', 'management', 'readDashboard')).toBe(true);
  });
});
