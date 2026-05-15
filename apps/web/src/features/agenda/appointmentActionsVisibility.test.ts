import { describe, expect, it } from 'vitest';
import { hasMinRole } from '@/lib/rbac';

/**
 * Espelha as regras de `AppointmentDrawer` para no-show e balcão (sem DOM).
 */
function canDesk(role: string | undefined): boolean {
  return !!role && role !== 'professional' && hasMinRole(role, 'attendant');
}

function canMarkNoShow(role: string | undefined, status: string): boolean {
  if (!canDesk(role)) return false;
  return !['checked_in', 'in_service', 'completed', 'cancelled', 'no_show'].includes(status);
}

describe('appointmentActionsVisibility (no-show / balcão)', () => {
  it('professional cannot mark no-show', () => {
    expect(canMarkNoShow('professional', 'confirmed')).toBe(false);
  });

  it('attendant can mark no-show on confirmed', () => {
    expect(canMarkNoShow('attendant', 'confirmed')).toBe(true);
  });

  it('no-show is hidden for completed', () => {
    expect(canMarkNoShow('attendant', 'completed')).toBe(false);
  });

  it('viewer cannot operate desk no-show', () => {
    expect(canMarkNoShow('viewer', 'confirmed')).toBe(false);
  });
});
