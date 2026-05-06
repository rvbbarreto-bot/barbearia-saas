import { describe, expect, it } from 'vitest';
import { canAccess } from '../../middlewares/rbac.js';

describe('commissions RBAC', () => {
  it('donos e tenant_admin consultam totais por profissional', () => {
    expect(canAccess('tenant_admin', 'commissions', 'reportByProfessional')).toBe(true);
    expect(canAccess('tenant_owner', 'commissions', 'reportByProfessional')).toBe(true);
    expect(canAccess('manager', 'commissions', 'reportByProfessional')).toBe(false);
  });

  it('attendant vê fechamentos mas não lançamentos de comissão nem gere regras', () => {
    expect(canAccess('attendant', 'commissions', 'readEntries')).toBe(false);
    expect(canAccess('attendant', 'commissions', 'readClosing')).toBe(true);
    expect(canAccess('attendant', 'commissions', 'manageRules')).toBe(false);
    expect(canAccess('attendant', 'commissions', 'computeClosing')).toBe(false);
  });

  it('manager vê lançamentos, gere regras, status e recomputo', () => {
    expect(canAccess('manager', 'commissions', 'readEntries')).toBe(true);
    expect(canAccess('manager', 'commissions', 'manageRules')).toBe(true);
    expect(canAccess('manager', 'commissions', 'updateEntryStatus')).toBe(true);
    expect(canAccess('manager', 'commissions', 'computeClosing')).toBe(true);
  });
});
