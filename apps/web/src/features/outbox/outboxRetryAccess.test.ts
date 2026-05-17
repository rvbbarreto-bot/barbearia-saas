import { describe, expect, it } from 'vitest';
import { hasMinRole } from '@/lib/rbac';

describe('outbox retry RBAC', () => {
  it('allows manager+ to retry', () => {
    expect(hasMinRole('manager', 'manager')).toBe(true);
    expect(hasMinRole('tenant_admin', 'manager')).toBe(true);
  });

  it('denies attendant and viewer retry', () => {
    expect(hasMinRole('attendant', 'manager')).toBe(false);
    expect(hasMinRole('viewer', 'manager')).toBe(false);
  });
});
