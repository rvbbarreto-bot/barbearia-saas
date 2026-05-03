import { describe, expect, it } from 'vitest';
import { canAccess } from '../../middlewares/rbac.js';

describe('finance RBAC (permissionPolicy)', () => {
  it('viewer não acede a financeiro', () => {
    expect(canAccess('viewer', 'finance', 'readAppointment')).toBe(false);
    expect(canAccess('viewer', 'finance', 'settleBalance')).toBe(false);
    expect(canAccess('viewer', 'finance', 'applyDiscount')).toBe(false);
    expect(canAccess('viewer', 'finance', 'dailyReport')).toBe(false);
  });

  it('professional: mínimo attendant — pode ler e liquidar; não desconto nem relatório admin', () => {
    expect(canAccess('professional', 'finance', 'readAppointment')).toBe(true);
    expect(canAccess('professional', 'finance', 'settleBalance')).toBe(true);
    expect(canAccess('professional', 'finance', 'applyDiscount')).toBe(false);
    expect(canAccess('professional', 'finance', 'dailyReport')).toBe(false);
  });

  it('attendant: leitura e liquidação; sem desconto nem relatório admin', () => {
    expect(canAccess('attendant', 'finance', 'readAppointment')).toBe(true);
    expect(canAccess('attendant', 'finance', 'settleBalance')).toBe(true);
    expect(canAccess('attendant', 'finance', 'applyDiscount')).toBe(false);
    expect(canAccess('attendant', 'finance', 'dailyReport')).toBe(false);
  });

  it('manager: inclui desconto; relatório diário continua restrito a tenant_admin+', () => {
    expect(canAccess('manager', 'finance', 'applyDiscount')).toBe(true);
    expect(canAccess('manager', 'finance', 'dailyReport')).toBe(false);
  });

  it('tenant_admin e tenant_owner: relatório diário', () => {
    expect(canAccess('tenant_admin', 'finance', 'dailyReport')).toBe(true);
    expect(canAccess('tenant_owner', 'finance', 'dailyReport')).toBe(true);
  });

  it('platform_admin: todas as ações financeiras mapeadas', () => {
    expect(canAccess('platform_admin', 'finance', 'readAppointment')).toBe(true);
    expect(canAccess('platform_admin', 'finance', 'settleBalance')).toBe(true);
    expect(canAccess('platform_admin', 'finance', 'applyDiscount')).toBe(true);
    expect(canAccess('platform_admin', 'finance', 'dailyReport')).toBe(true);
  });
});
