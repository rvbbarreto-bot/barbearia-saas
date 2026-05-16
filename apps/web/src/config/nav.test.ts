import { describe, expect, it } from 'vitest';
import { APP_NAV } from './nav';
import { hasMinRole } from '@/lib/rbac';

describe('APP_NAV — Comissões visível só para manager+ (DEV/QA-07.1)', () => {
  it('atendente não vê item Comissões após filtro do Sidebar', () => {
    const visible = APP_NAV.filter((item) => hasMinRole('attendant', item.minRole));
    expect(visible.some((i) => i.to === '/operacao/comissao')).toBe(false);
  });

  it('gerente vê Comissões', () => {
    const visible = APP_NAV.filter((item) => hasMinRole('manager', item.minRole));
    expect(visible.some((i) => i.to === '/operacao/comissao')).toBe(true);
  });
});

describe('APP_NAV — Status operação (piloto-04 fatia B)', () => {
  it('viewer e atendente não vêem Status operação; gerente vê', () => {
    const viewerNav = APP_NAV.filter((item) => hasMinRole('viewer', item.minRole));
    const attendantNav = APP_NAV.filter((item) => hasMinRole('attendant', item.minRole));
    const managerNav = APP_NAV.filter((item) => hasMinRole('manager', item.minRole));
    expect(viewerNav.some((i) => i.to === '/operacao/status')).toBe(false);
    expect(attendantNav.some((i) => i.to === '/operacao/status')).toBe(false);
    expect(managerNav.some((i) => i.to === '/operacao/status')).toBe(true);
  });
});
