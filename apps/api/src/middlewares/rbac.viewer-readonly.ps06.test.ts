import { describe, expect, it } from 'vitest';
import { canAccess } from './rbac.js';

/**
 * GAP-03 — perfil viewer (somente leitura operacional).
 * Complementa authorization-routes.integration.test.ts (HTTP) com matriz unitária rápida.
 */
describe('viewer read-only RBAC (GAP-03)', () => {
  it('viewer pode ler agenda/disponibilidade, mas não mutar appointments', () => {
    expect(canAccess('viewer', 'appointments', 'read')).toBe(true);
    expect(canAccess('viewer', 'appointments', 'create')).toBe(false);
    expect(canAccess('viewer', 'appointments', 'cancel')).toBe(false);
    expect(canAccess('viewer', 'availability', 'read')).toBe(true);
  });

  it('viewer não acessa gestão, outbox, waitlist nem auditoria operacional', () => {
    expect(canAccess('viewer', 'management', 'readDashboard')).toBe(false);
    expect(canAccess('viewer', 'outbox', 'read')).toBe(false);
    expect(canAccess('viewer', 'outbox', 'retry')).toBe(false);
    expect(canAccess('viewer', 'waitlist', 'read')).toBe(false);
    expect(canAccess('viewer', 'operationalAudit', 'read')).toBe(false);
  });

  it('viewer não liquida financeiro (attendant+)', () => {
    expect(canAccess('viewer', 'finance', 'readAppointment')).toBe(false);
    expect(canAccess('attendant', 'finance', 'readAppointment')).toBe(true);
  });
});
